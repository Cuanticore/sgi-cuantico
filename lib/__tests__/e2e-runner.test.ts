// lib/__tests__/e2e-runner.test.ts
//
// Que `npm run e2e` recoja los recorridos y NADA MÁS.
//
// POR QUÉ EXISTE. `playwright.config.ts` apunta `testDir` a `./e2e`, y el `testMatch` por
// omisión de Playwright es `**/*.@(spec|test).?(c|m)[jt]s?(x)`: recoge **también** los
// `*.test.ts`. En `e2e/__tests__/` vive una prueba de Jest —`selectores-ag-grid.test.ts`, que
// comprueba que las clases `.ag-*` de los recorridos existan en el AG Grid instalado— y
// Playwright la carga como si fuera suya. Muere al leerla, con `ReferenceError: describe is
// not defined`, **antes de ejecutar un solo recorrido**.
//
// MEDIDO EL 22/09/2026: `npm run e2e` salía con código 1 y **cero recorridos ejecutados**.
// Llevaba así desde `0a01ede` (21/09), y nadie lo notó porque cada sesión corría su spec por
// nombre —`npx playwright test e2e/grafo.spec.ts`—, que sí funciona: con una ruta explícita
// Playwright no recoge el resto del directorio.
//
// Es decir: el comando que `HARNESS.md` documenta como el arnés de la Regla 3 no corría nada,
// mientras los comandos que nadie documentó sí. Eso no se arregla solo, porque el día que
// alguien confíe en el comando documentado va a leer un rojo que no habla de recorridos.
//
// La prueba no ejerce Playwright —levantar el servidor aquí costaría minutos y necesitaría una
// base—: comprueba la condición estática que produjo el fallo, que es que el `testMatch` del
// config no excluya los `*.test.ts` del directorio de recorridos.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');
const E2E = join(RAIZ, 'e2e');

/// Todo archivo de prueba bajo `e2e/`, a cualquier profundidad.
function archivosDePrueba(dir: string, prefijo = ''): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefijo === '' ? entrada.name : `${prefijo}/${entrada.name}`;
    if (entrada.isDirectory()) salida.push(...archivosDePrueba(join(dir, entrada.name), rel));
    else if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(entrada.name)) salida.push(rel);
  }
  return salida;
}

describe('el runner de punta a punta recoge recorridos y nada más', () => {
  const bajoE2e = archivosDePrueba(E2E);
  const config = readFileSync(join(RAIZ, 'playwright.config.ts'), 'utf8');

  it('la situación que hace que esto importe sigue vigente', () => {
    // Caso de control. Si algún día no quedan pruebas de Jest bajo `e2e/`, esta prueba deja de
    // vigilar algo y hay que decirlo en voz alta, no dejarla pasar en verde por vacía.
    const deJest = bajoE2e.filter((f) => f.endsWith('.test.ts'));
    const recorridos = bajoE2e.filter((f) => f.endsWith('.spec.ts'));
    expect(recorridos.length).toBeGreaterThan(0);
    expect(deJest.length).toBeGreaterThan(0);
  });

  it('el config declara un testMatch explícito', () => {
    // Sin esto rige el de Playwright, que incluye `*.test.ts`. Es la causa exacta del fallo.
    expect(config).toMatch(/testMatch\s*:/);
  });

  it('el testMatch sólo admite *.spec.ts', () => {
    const m = config.match(/testMatch\s*:\s*['"`]([^'"`]+)['"`]/);
    expect(m).not.toBeNull();
    expect(m?.[1]).toMatch(/\.spec\.ts$/);
    expect(m?.[1]).not.toMatch(/spec\|test|test\|spec/);
  });
});
