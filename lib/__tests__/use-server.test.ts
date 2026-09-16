// lib/__tests__/use-server.test.ts
//
// Un archivo `'use server'` sólo puede exportar funciones async. Cada export se convierte en
// un ENDPOINT RPC invocable desde el navegador, y una constante no es invocable.
//
// EL 16/09/2026 ESTO ROMPIÓ EL DESPLIEGUE. `app/sig/acciones/colaborador-alta.ts` exportaba
// `const PREFIJO_OID_MANUAL`, y Turbopack respondió dejando el módulo SIN NINGÚN export —
// así que `crearColaborador` también desapareció y el build cayó con tres errores de una
// sola causa. Producción se quedó con la imagen anterior.
//
// Ningún check lo vio venir: `tsc` no conoce la regla —no es de tipos, es de la frontera
// cliente/servidor—, ESLint tampoco, y Jest no aplica la directiva. El único que la ve es el
// compilador de Next, y el build tarda más de un minuto.
//
// Esta prueba tarda milisegundos y cubre los 36 archivos de una vez.

import { readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const RAIZ = join(__dirname, '..', '..');

/// Los archivos que declaran `'use server'` en su primera línea.
function archivosUseServer(): string[] {
  const salida = execFileSync(
    'grep',
    ['-rl', "--include=*.ts", "--include=*.tsx", "^'use server'", 'app', 'lib'],
    { cwd: RAIZ, encoding: 'utf8' },
  );
  return salida.split('\n').filter((l) => l.trim() !== '');
}

/// Exports que NO son funciones async ni declaraciones de tipo.
///
/// `type` e `interface` se permiten: desaparecen al compilar, así que nunca llegan a ser un
/// endpoint. Lo que no puede quedar es un valor en tiempo de ejecución.
function exportsProhibidos(fuente: string): string[] {
  const malos: string[] = [];
  for (const linea of fuente.split('\n')) {
    const m = /^export\s+(const|let|var|class|function)\s+(\w+)/.exec(linea.trim());
    if (!m) continue;
    const [, clase, nombre] = m;
    // `export async function` es lo único ejecutable permitido.
    if (clase === 'function' && /^export\s+async\s+function/.test(linea.trim())) continue;
    malos.push(`${clase} ${nombre}`);
  }
  return malos;
}

describe("archivos 'use server'", () => {
  const archivos = archivosUseServer();

  it('hay archivos que revisar, para que la prueba no pase por estar vacía', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it.each(archivos)('%s sólo exporta funciones async', (ruta) => {
    const fuente = readFileSync(join(RAIZ, ruta), 'utf8');

    // El mensaje nombra qué sacar y a dónde: un fallo que sólo dice «false !== true» obliga
    // a reconstruir el porqué, y este error ya costó un despliegue.
    expect({ ruta, prohibidos: exportsProhibidos(fuente) }).toEqual({ ruta, prohibidos: [] });
  });
});
