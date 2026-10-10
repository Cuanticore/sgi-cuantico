// lib/__tests__/verificacion-comenta-en-el-pr.test.ts
//
// UNA VERIFICACIÓN ROJA TIENE QUE DECIR QUÉ SE ROMPIÓ, DONDE SE ESTÁ MIRANDO.
//
// `Verificación` ya corre sobre cada PR y ya se pone roja cuando algo falla. Lo que no hace
// es DECIR QUÉ FALLÓ: deja una marca roja y un enlace. Para saber si fue un tipo, una regla
// de ESLint, una prueba o el build, hay que abrir el run, elegir el trabajo, desplegar el
// paso y leer un log de miles de líneas donde el error real está en el medio.
//
// Esa fricción no es estética. Es la diferencia entre corregir el error y mergear igual: el
// `HARNESS.md` ya reconoce que hasta que el control sea obligatorio «informa pero no
// bloquea», y un control que informa mal es un control que se ignora rápido.
//
// Acá se exige lo contrario: cuando la verificación se cae, el PR recibe un comentario con
// las últimas líneas de la salida, en la página que la persona ya está mirando.
//
// LO QUE ESTA PRUEBA SOSTIENE, y por qué cada parte:
//
//   1. el workflow pide `pull-requests: write`. Sin ese permiso el paso de comentar responde
//      403 y falla en silencio — el trabajo ya estaba rojo, así que nadie nota que ADEMÁS el
//      comentario no salió;
//   2. la salida de la verificación se captura a un archivo. Un paso posterior no puede leer
//      el log del paso anterior: GitHub no lo expone al runner, hay que guardarlo al pasar;
//   3. el paso de comentar corre sólo con `failure()` y es `continue-on-error`. Si fallara,
//      pasaría a ser el último error del trabajo y taparía justo lo que vino a explicar — la
//      misma lección de `despliegue-diagnosticable.test.ts`;
//   4. la captura usa `pipefail`. Con `cmd | tee archivo` el código de salida de la tubería
//      es el de `tee`, que siempre sale 0: sin `pipefail` la verificación se vuelve verde
//      pase lo que pase, y la prueba de arriba seguiría pasando igual. Es el fallo más caro
//      que puede introducir este cambio, y es invisible en el diff.
//
// Esta prueba no verifica que el comentario se vea bonito. Verifica que el mecanismo siga
// existiendo: es YAML que sólo corre cuando algo ya salió mal, así que puede romperse y pasar
// meses sin que nadie lo note — hasta el día que se necesita.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

const RAIZ = join(__dirname, '..', '..');

interface Paso {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  if?: string;
  'continue-on-error'?: boolean;
}

interface Trabajo {
  steps?: Paso[];
  permissions?: Record<string, string>;
  env?: Record<string, string>;
}

interface Workflow {
  jobs?: Record<string, Trabajo>;
  permissions?: Record<string, string>;
}

function workflow(archivo: string): Workflow {
  const ruta = join(RAIZ, '.github', 'workflows', archivo);
  if (!existsSync(ruta)) return {};
  return (load(readFileSync(ruta, 'utf8')) ?? {}) as Workflow;
}

const VERIFICACION = workflow('verificacion.yml');
const TRABAJOS = Object.values(VERIFICACION.jobs ?? {});
const PASOS: Paso[] = TRABAJOS.flatMap((t) => t.steps ?? []);

/// Los pasos que sólo corren cuando algo ya falló.
const alFallar = PASOS.filter((p) => (p.if ?? '').includes('failure()'));

/// El texto de todo lo que corre al fallar, junto: `run` y los parámetros de las acciones.
/// Se miran los dos porque comentar se puede hacer con `gh pr comment` (un `run`) o con
/// `actions/github-script` (un `uses` con el cuerpo en `with.script`), y la prueba no debería
/// casarse con una de las dos implementaciones.
const textoAlFallar = alFallar
  .map((p) => [p.run ?? '', p.uses ?? '', JSON.stringify(p.with ?? {})].join('\n'))
  .join('\n');

describe('Verificación · un PR rojo recibe el error como comentario', () => {
  it('el workflow puede escribir en el pull request', () => {
    // Los permisos pueden declararse a nivel de workflow o de trabajo; valen los dos.
    const declarados = {
      ...(VERIFICACION.permissions ?? {}),
      ...Object.assign({}, ...TRABAJOS.map((t) => t.permissions ?? {})),
    } as Record<string, string>;

    expect(declarados['pull-requests']).toBe('write');
  });

  it('tiene al menos un paso que corre sólo si la verificación falló', () => {
    expect(alFallar.length).toBeGreaterThan(0);
  });

  it('ese paso comenta en el pull request', () => {
    // `gh pr comment`, la API de issues (los comentarios de PR viven ahí) o github-script.
    expect(textoAlFallar).toMatch(/pr comment|issues\/comments|createComment|github-script/);
  });

  it('el comentario lleva la salida del error, no sólo el aviso de que falló', () => {
    // Un comentario que dice «la verificación falló» y enlaza al run no ahorra ni un clic:
    // es exactamente lo que la marca roja ya decía.
    const guarda = PASOS.some(
      (p) => typeof p.run === 'string' && /tee|>>?\s*"?\$\{?\w*(TEMP|temp)/.test(p.run),
    );
    expect(guarda).toBe(true);
    expect(textoAlFallar).toMatch(/log|salida|tail/i);
  });

  it('el paso de comentar NO puede tumbar el trabajo ni tapar el error que vino a explicar', () => {
    for (const p of alFallar) {
      expect({ paso: p.name, continuaAlFallar: p['continue-on-error'] }).toEqual({
        paso: p.name,
        continuaAlFallar: true,
      });
    }
  });
});

// UN WORKFLOW INVÁLIDO NO SE VE COMO UN WORKFLOW INVÁLIDO.
//
// El 09/10/2026, en el commit 0e4428a de este mismo cambio, el trabajo se declaró así:
//
//     jobs:
//       verificar:
//         env:
//           RUTA_LOG: ${{ runner.temp }}/verificacion.log
//
// GitHub rechazó el archivo ENTERO. No corrió ningún trabajo, no quedó log, no quedó check:
// el PR mostró un rojo pelado que se parece a una verificación caída y no lo es. `runner` no
// está entre los contextos admitidos en `jobs.<id>.env` —sólo `github`, `needs`, `vars`,
// `secrets` e `inputs`— y existe únicamente a nivel de paso.
//
// Lo que hace esto peligroso es que **ningún control local lo ve**: es YAML perfectamente
// válido, así que `js-yaml` lo carga, las pruebas de arriba lo recorren y todo pasa en verde.
// Sólo el servidor de GitHub conoce la tabla de contextos.
//
// Esta prueba es la tabla, escrita acá, para los dos contextos que se escapan en la práctica.
const CONTEXTOS_PROHIBIDOS_EN_ENV_DE_TRABAJO = ['runner', 'steps', 'job', 'env'];

describe('ningún workflow usa un contexto inválido en el `env` de un trabajo', () => {
  const archivos = ['verificacion.yml', 'deploy.yml', 'deploy-git.yml'];

  const casos = archivos.flatMap((archivo) =>
    Object.entries(workflow(archivo).jobs ?? {}).map(
      ([nombre, trabajo]) => [archivo, nombre, trabajo] as const,
    ),
  );

  it.each(casos)('%s · trabajo «%s»', (_archivo, _nombre, trabajo) => {
    const declarado = JSON.stringify(trabajo.env ?? {});

    for (const contexto of CONTEXTOS_PROHIBIDOS_EN_ENV_DE_TRABAJO) {
      // `${{ runner.temp }}`, con los espacios que GitHub permite alrededor.
      expect(declarado).not.toMatch(new RegExp(`\\$\\{\\{\\s*${contexto}\\.`));
    }
  });
});

describe('Verificación · capturar la salida no puede volver verde el gate', () => {
  /// Los pasos que mandan su salida a un archivo con `tee`.
  const conTee = PASOS.filter((p) => typeof p.run === 'string' && p.run.includes('tee'));

  it('hay al menos un paso que captura la salida', () => {
    expect(conTee.length).toBeGreaterThan(0);
  });

  it.each(conTee.map((p) => [p.name ?? '(sin nombre)', p] as const))(
    '«%s» activa pipefail — si no, `npm ... | tee` siempre sale 0',
    (_nombre, paso) => {
      // ESTA es la aserción que justifica el archivo entero. Sin `pipefail`, el código de
      // salida de `npm run verificar:build | tee log` es el de `tee`, que es 0 SIEMPRE.
      // El trabajo quedaría verde con los tipos rotos, el lint rojo y la suite caída, y no
      // habría nada en el diff que delate el cambio: una tubería de más.
      expect(paso.run ?? '').toMatch(/set -[a-z]*o pipefail|set -o pipefail/);
    },
  );
});
