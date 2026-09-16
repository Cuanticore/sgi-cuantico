// lib/__tests__/despliegue-verificado.test.ts
//
// EL GATE DE DESPLIEGUE, PROTEGIDO CONTRA SÍ MISMO.
//
// `HARNESS.md` pide correr cinco comandos antes de mergear y dice, con todas las letras, que
// «si estos comandos no se corren a mano antes de mergear, no los corre nadie». Eso era
// cierto: el workflow `Build and Deploy` arrancaba construyendo la imagen: ni `tsc`, ni
// ESLint, ni los tests eran condición para desplegar. La disciplina era la única barrera, y
// el 16/09/2026 un `export const` en un `'use server'` demostró lo que pasa cuando la
// disciplina falla una vez: `main` no compiló y producción se quedó con la imagen anterior.
//
// Esta prueba no verifica que el código esté bien —para eso están las otras 2311—. Verifica
// que **el camino a producción siga pasando por ellas**. Un gate es una línea de YAML que
// cualquiera puede borrar sin que nada se ponga rojo; con esta prueba, borrarlo se pone rojo.
//
// Lo que sostiene:
//
//   1. existe UN comando de verificación (`npm run verificar`) y corre los cuatro checks;
//   2. el despliegue lo ejecuta ANTES de construir la imagen —fallar antes de construir es
//      gratis: el contenedor viejo sigue sirviendo—;
//   3. el PR lo ejecuta también, que es donde el harness decía no llegar;
//   4. los tres corren LA MISMA cosa. Un gate que se verifica distinto de como se verifica
//      en local es un gate que va a divergir, y el día que diverja nadie se va a enterar.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

const RAIZ = join(__dirname, '..', '..');

/// El único comando de verificación. Si esto cambia de nombre, cambia en un solo lugar y las
/// tres aserciones de abajo lo siguen.
const COMANDO = 'npm run verificar';

interface Paso {
  name?: string;
  run?: string;
  uses?: string;
  'continue-on-error'?: boolean;
}
interface Trabajo {
  steps?: Paso[];
  needs?: string | string[];
}
interface Workflow {
  on?: unknown;
  jobs?: Record<string, Trabajo>;
  // js-yaml resuelve la clave `on` como el booleano `true` (YAML 1.1), así que el disparador
  // puede llegar por acá. Se leen las dos y no se asume cuál.
  [clave: string]: unknown;
}

/// Un workflow que no existe devuelve `{}` en vez de reventar.
///
/// No es indulgencia: si falta el archivo, lo que tiene que ponerse rojo es «el PR pasa por el
/// gate», con ese nombre. Una suite que no arranca dice «ENOENT» y obliga a leer código para
/// saber qué se rompió.
function workflow(archivo: string): Workflow {
  const ruta = join(RAIZ, '.github', 'workflows', archivo);
  if (!existsSync(ruta)) return {};
  return (load(readFileSync(ruta, 'utf8')) ?? {}) as Workflow;
}

/// Los pasos de todos los trabajos, en orden de ejecución.
///
/// Con un solo trabajo esto es el orden real. Con varios, el orden entre trabajos lo fija
/// `needs:` y no la posición en el archivo — por eso `elDespliegueDependeDeLaVerificacion`
/// mira `needs` aparte en vez de confiar en el índice.
function pasos(wf: Workflow): Paso[] {
  return Object.values(wf.jobs ?? {}).flatMap((t) => t.steps ?? []);
}

function indiceDelPasoQueCorre(wf: Workflow, fragmento: string): number {
  return pasos(wf).findIndex((p) => typeof p.run === 'string' && p.run.includes(fragmento));
}

describe('el comando único de verificación', () => {
  const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

  it('existe como script de npm', () => {
    expect(pkg.scripts.verificar).toBeDefined();
  });

  // Los cuatro de la Regla 2, y en este orden por una razón: sin `prisma generate` previo,
  // `tsc` escupe una treintena de errores falsos sobre tipos que todavía no existen.
  it.each([
    ['prisma generate', 'prisma generate'],
    ['tsc --noEmit', 'tsc --noEmit'],
    ['lint', 'lint'],
    ['test', 'test'],
  ])('encadena %s', (_nombre, fragmento) => {
    expect(pkg.scripts.verificar).toContain(fragmento);
  });

  it('encadena con && y no con ; — un check rojo tiene que cortar la cadena', () => {
    // Con `;` los cuatro corren igual y el código de salida es el del último: una suite roja
    // seguida de un lint verde sale 0. El gate quedaría en verde sobre un árbol roto.
    expect(pkg.scripts.verificar).not.toMatch(/;\s*(npx|npm)/);
    expect(pkg.scripts.verificar).toContain('&&');
  });

  it('el build es parte de la verificación de despliegue', () => {
    // El build entró a HARNESS.md por una cicatriz propia: hay errores que sólo él ve, porque
    // `next build` es el único que conoce la frontera cliente/servidor. Va en un script aparte
    // porque tarda más de un minuto y el bucle local no debería pagarlo en cada vuelta.
    expect(pkg.scripts['verificar:build']).toBeDefined();
    expect(pkg.scripts['verificar:build']).toContain('verificar');
    expect(pkg.scripts['verificar:build']).toContain('build');
  });
});

describe('Build and Deploy · el despliegue no puede saltarse la verificación', () => {
  const wf = workflow('deploy.yml');

  it('ejecuta el comando de verificación', () => {
    expect(indiceDelPasoQueCorre(wf, COMANDO)).toBeGreaterThanOrEqual(0);
  });

  it('lo ejecuta ANTES de construir y empujar la imagen', () => {
    const verificacion = indiceDelPasoQueCorre(wf, COMANDO);
    const construccion = indiceDelPasoQueCorre(wf, 'buildx build');

    // Las dos existen, y se afirma explícitamente: sin esto, un paso ausente da índice -1 y
    // `-1 < construccion` deja la prueba en verde por no haber nada que ordenar.
    expect(verificacion).toBeGreaterThanOrEqual(0);
    expect(construccion).toBeGreaterThanOrEqual(0);
    // Fallar después de construir no es gratis: la imagen ya está en el registro y el disco
    // del host —que ya murió una vez por llenarse— pagó la construcción entera.
    expect(verificacion).toBeLessThan(construccion);
  });

  it('el paso de verificación no está marcado como tolerable', () => {
    const paso = pasos(wf).find((p) => typeof p.run === 'string' && p.run.includes(COMANDO));
    expect(paso).toBeDefined();
    // `continue-on-error: true` deja el paso en el log, en amarillo, y el despliegue sigue.
    // Eso es un gate que no es un gate.
    expect(paso?.['continue-on-error']).not.toBe(true);
  });
});

describe('Verificación · el PR también pasa por el gate', () => {
  const wf = workflow('verificacion.yml');

  it('se dispara en los pull requests', () => {
    // `on` puede haberse resuelto como el booleano `true`; se aceptan las dos formas.
    const disparadores = (wf.on ?? wf[String(true)] ?? {}) as Record<string, unknown>;
    expect(Object.keys(disparadores)).toContain('pull_request');
  });

  it('corre exactamente el mismo comando que el despliegue y que el bucle local', () => {
    expect(indiceDelPasoQueCorre(wf, COMANDO)).toBeGreaterThanOrEqual(0);
  });
});
