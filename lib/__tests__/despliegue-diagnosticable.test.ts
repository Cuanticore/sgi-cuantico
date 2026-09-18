// lib/__tests__/despliegue-diagnosticable.test.ts
//
// UN DESPLIEGUE ROJO TIENE QUE DECIR CÓMO QUEDÓ LA BASE, NO SÓLO QUE FALLÓ.
//
// El 18/09/2026 `migrate deploy` abortó con `42703: column "nombre" does not exist`. El log
// decía eso y nada más. Para saber lo que de verdad hacía falta —que el índice SÍ se había
// creado antes de abortar, y que había DOS migraciones en mal estado y no una— hubo que
// entrar por SSH a producción y consultar `_prisma_migrations` a mano.
//
// Eso es diagnóstico que el despliegue ya tenía delante y tiró a la basura. La conexión
// estaba abierta, el contenedor corriendo, y el estado a una consulta de distancia.
//
// Peor todavía: entrar a la base a diagnosticar es justo lo que uno NO quiere estar haciendo
// con producción caída y prisa encima. Es el momento de menos calma y más permisos.
//
// Esta prueba no verifica que el diagnóstico sea bueno. Verifica que SIGA EXISTIENDO: es un
// bloque de YAML que sólo corre cuando algo ya salió mal, así que puede romperse o borrarse
// y pasar meses sin que nadie lo note — hasta el día que se necesita.

import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

const RAIZ = join(__dirname, '..', '..');

interface Paso {
  name?: string;
  run?: string;
  if?: string;
  'continue-on-error'?: boolean;
}

interface Flujo {
  jobs: Record<string, { steps: Paso[] }>;
}

function pasosDe(archivo: string): Paso[] {
  const y = load(readFileSync(join(RAIZ, '.github', 'workflows', archivo), 'utf8')) as Flujo;
  return Object.values(y.jobs).flatMap((j) => j.steps ?? []);
}

const DESPLIEGUE = pasosDe('deploy.yml');

/// Los pasos que sólo corren cuando algo ya falló.
const alFallar = DESPLIEGUE.filter((p) => (p.if ?? '').includes('failure()'));

describe('el despliegue deja diagnóstico cuando se cae', () => {
  it('tiene al menos un paso que corre sólo si falló', () => {
    expect(alFallar.length).toBeGreaterThan(0);
  });

  it('vuelca el estado de las migraciones, que es lo que hubo que ir a buscar a mano', () => {
    const texto = alFallar.map((p) => p.run ?? '').join('\n');

    // `_prisma_migrations` es donde vive la respuesta: qué migración quedó sin terminar, y
    // si hay más de una — el 18/09 había dos y el log sólo nombró la que abortó la corrida.
    expect(texto).toContain('_prisma_migrations');
  });

  it('escribe el diagnóstico en el resumen del run, no sólo en el log', () => {
    // El log hay que descargarlo y leerlo entero; el resumen se ve al abrir la página. Con
    // producción caída, esa diferencia es la que decide si alguien lo mira o no.
    const texto = alFallar.map((p) => p.run ?? '').join('\n');

    expect(texto).toContain('GITHUB_STEP_SUMMARY');
  });

  it('el diagnóstico NO puede tumbar el job ni tapar el error que vino a explicar', () => {
    // Si una consulta de diagnóstico falla —la base caída, por ejemplo— el paso se pone rojo
    // y pasa a ser el último error del job. El fallo real queda sepultado debajo de un
    // problema que no le importa a nadie.
    for (const p of alFallar) {
      expect({ paso: p.name, continuaAlFallar: p['continue-on-error'] }).toEqual({
        paso: p.name,
        continuaAlFallar: true,
      });
    }
  });

  it('dice qué imagen siguió sirviendo: un despliegue caído no deja producción vacía', () => {
    const texto = alFallar.map((p) => p.run ?? '').join('\n');

    expect(texto).toContain('docker');
  });
});

describe('el despliegue deja constancia cuando sale bien', () => {
  const alTerminar = DESPLIEGUE.filter((p) => (p.run ?? '').includes('GITHUB_STEP_SUMMARY'));

  it('también resume el despliegue exitoso', () => {
    // Saber QUÉ quedó desplegado no debería exigir cruzar el log con el historial de commits.
    // Y el día que algo salga raro, el resumen del último despliegue bueno es la referencia.
    const enExito = alTerminar.filter((p) => !(p.if ?? '').includes('failure()'));

    expect(enExito.length).toBeGreaterThan(0);
  });
});
