// e2e/matrices.spec.ts
//
// **El recorrido de la Regla 3 para «Matrices de riesgo»**, contra la aplicación corriendo y
// los datos reales del inventario.
//
// POR QUÉ EXISTE. La matriz de activos contaba su universo desde los riesgos: la tarjeta
// decía «30 ACTIVOS» en una pantalla cuyo inventario tiene 378. La cifra no estaba mal
// calculada —esos 30 son exactamente los activos con riesgo valorado— pero contestaba otra
// pregunta, y el rótulo que la acompañaba decía «Activos» a secas. Es la misma forma de los
// tres bugs del 15/09/2026: ninguna pieza fallaba, fallaba la composición.
//
// La cuenta está probada pura en `lib/sgsi/__tests__/matriz-clasica.test.ts` y la costura con
// la pantalla en `app/components/sgsi/matrices/__tests__/MatricesRiesgo.test.tsx`, las dos en
// milisegundos y con datos armados a mano. Lo que ninguna de las dos puede afirmar es que
// sobre las 584 filas reales las cifras sigan cuadrando entre sí — eso es lo que se hace acá.
//
// **Sólo lee.** Navega, cambia un conmutador, elige un filtro y abre el detalle de una
// casilla. Ninguna acción de este archivo escribe.

import { test, expect, type Locator, type Page } from '@playwright/test';
import { iniciarSesion } from './sesion';

const RUTA = '/sgsi/matrices';

/// El número que cierra un renglón del pie, sin depender de dónde lo parta el marcado.
///
/// El renglón se lee «Crítico30»: el rótulo y la cifra son dos `<span>` hermanos y el
/// `textContent` los pega. Se toman los dígitos finales, y con el punto de miles quitado —a
/// partir de mil, «1.203» tiene que leerse 1203 y no 1.
async function cifraDe(fila: Locator): Promise<number> {
  const texto = (await fila.textContent()) ?? '';
  const ultimo = /([\d.]+)\s*$/.exec(texto.trim())?.[1] ?? '';
  return Number(ultimo.replace(/\./g, ''));
}

const tarjeta = (page: Page, titulo: string) => page.getByRole('region', { name: titulo });

const totalDe = async (page: Page, titulo: string) =>
  cifraDe(tarjeta(page, titulo).getByTestId('total-matriz'));

/// Un renglón del pie que puede no estar dibujado: si no está, es cero.
async function opcional(t: Locator, testId: string): Promise<number> {
  const renglon = t.getByTestId(testId);
  return (await renglon.count()) === 0 ? 0 : cifraDe(renglon);
}

/// El pie entero: los cuatro niveles, la columna aparte y los sin valorar.
async function pieDe(page: Page, titulo: string) {
  const t = tarjeta(page, titulo);
  const niveles = ['Crítico', 'Alto', 'Medio', 'Bajo'];
  let ubicados = 0;
  for (const n of niveles) ubicados += await cifraDe(t.getByTestId(`banda-${n}`));
  return {
    ubicados,
    sinAnalizar: await opcional(t, 'banda-sin-analizar'),
    sinValorar: await opcional(t, 'sin-valorar'),
  };
}

/// Lo que dice cada casilla de la columna aparte, fila por fila.
async function columnaAparte(page: Page, titulo: string): Promise<number[]> {
  const t = tarjeta(page, titulo);
  const salida: number[] = [];
  for (let i = 0; ; i++) {
    const casilla = t.getByTestId(`sinanalizar-${i}`);
    if ((await casilla.count()) === 0) break;
    const texto = ((await casilla.textContent()) ?? '').replace(/\D/g, '');
    salida.push(texto === '' ? 0 : Number(texto));
  }
  return salida;
}

test.beforeEach(async ({ context, baseURL }) => {
  await iniciarSesion(context, baseURL as string);
});

test('la matriz de activos presenta el inventario entero', async ({ page }) => {
  const registro: string[] = [];
  const anotar = (paso: string, visto: string) => registro.push(`${paso.padEnd(40)} -> ${visto}`);

  // ── 1 · Abrir la pantalla, en amenazas ──────────────────────────────────────────────
  await page.goto(RUTA);
  await expect(page.getByRole('heading', { name: 'Matrices de riesgo' })).toBeVisible();

  const encabezadoRiesgos = page.getByText(/riesgos en el filtro, de/);
  await expect(encabezadoRiesgos).toBeVisible();
  const riesgos = await totalDe(page, 'Matriz de riesgo inherente');
  expect(riesgos).toBeGreaterThan(0);
  anotar('1 · abrir, en amenazas', `${riesgos} riesgos en la tarjeta inherente`);

  // En amenazas no hay nada que declarar aparte: un riesgo que entra al filtro trae sus dos
  // cifras. Ni la columna aparte ni los renglones del pie deben existir.
  const pieAmenazas = await pieDe(page, 'Matriz de riesgo inherente');
  expect(pieAmenazas.sinValorar).toBe(0);
  expect(pieAmenazas.sinAnalizar).toBe(0);
  expect(await columnaAparte(page, 'Matriz de riesgo inherente')).toEqual([]);
  expect(pieAmenazas.ubicados).toBe(riesgos);
  anotar('   · el pie cuadra con la rejilla', `${pieAmenazas.ubicados} = ${riesgos}`);

  // ── 2 · Cambiar a activos ───────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Activos' }).click();

  const encabezadoActivos = page.getByText(/activos en el filtro, de/);
  await expect(encabezadoActivos).toBeVisible();
  const inventario = Number(
    /de ([\d.]+)/.exec((await encabezadoActivos.textContent()) ?? '')?.[1].replace(/\./g, '') ?? -1,
  );
  expect(inventario).toBeGreaterThan(0);
  anotar('2 · conmutar a activos', `el encabezado cuenta ${inventario} activos`);

  // ── 3 · LA REGRESIÓN QUE MOTIVÓ ESTE ARCHIVO ────────────────────────────────────────
  //
  // La tarjeta tiene que decir el inventario, no los activos con riesgo. Se compara contra
  // el encabezado —que sale de otro camino: el catálogo de activos filtrado, no la matriz—
  // porque dos cifras que se calculan aparte y coinciden son evidencia; una sola cifra
  // comparada contra sí misma no lo es.
  const totalActivos = await totalDe(page, 'Matriz de riesgo inherente');
  expect(totalActivos).toBe(inventario);
  anotar('3 · la tarjeta dice el inventario', `${totalActivos} activos`);

  // ── 4 · Los que no caben en la rejilla, DIBUJADOS ───────────────────────────────────
  //
  // No basta con contarlos al pie: la pregunta que un comité hace de ellos es cuáles son
  // graves, y un número suelto no la contesta.
  const pie = await pieDe(page, 'Matriz de riesgo inherente');
  const columna = await columnaAparte(page, 'Matriz de riesgo inherente');
  const enLaColumna = columna.reduce((a, b) => a + b, 0);

  expect(pie.ubicados).toBeGreaterThan(0);
  expect(enLaColumna).toBeGreaterThan(0);
  expect(pie.sinAnalizar).toBe(enLaColumna);
  // La invariante que impide que un activo se pierda entre las cuentas.
  expect(pie.ubicados + enLaColumna + pie.sinValorar).toBe(totalActivos);
  anotar(
    '4 · nadie se pierde',
    `${pie.ubicados} ubicados + ${enLaColumna} en la columna + ${pie.sinValorar} sin valorar = ${totalActivos}`,
  );

  // ── 5 · LA REGRESIÓN QUE MOTIVÓ LA SEGUNDA VUELTA ───────────────────────────────────
  //
  // Los activos que no entran al análisis no son despreciables: el corte es el UMBRAL DE
  // VALORACIÓN (4), no la gravedad. Un activo de valor 3 se queda fuera, y 3 en la escala
  // de impacto es la banda ALTO. Tiene que haber alguien dibujado en una de las dos peores
  // filas de la columna — si no lo hay, o el dato cambió o la columna está mintiendo.
  const graves = columna[0] + columna[1];
  expect(graves).toBeGreaterThan(0);
  anotar('5 · los de valor alto se ven', `${graves} en las dos filas peores de la columna`);

  // Y se dice con palabras, con la causa y con su número, no sólo con una casilla.
  await expect(
    tarjeta(page, 'Matriz de riesgo inherente').getByText(
      /activos del filtro no alcanzan el umbral de valoración/,
    ),
  ).toBeVisible();
  anotar('   · el aviso da la causa', 'visible en la tarjeta');

  // Y NO se cuelan en la rejilla: la columna es aparte, no una casilla más.
  expect(pie.ubicados).toBeLessThan(totalActivos);
  anotar('   · no se cuelan en la rejilla', `${pie.ubicados} ubicados < ${totalActivos}`);

  // ── 5.b · Abrir una casilla de la columna lista los activos ─────────────────────────
  const filaGrave = columna[0] > 0 ? 0 : 1;
  await tarjeta(page, 'Matriz de riesgo inherente').getByTestId(`sinanalizar-${filaGrave}`).click();
  const detalle = page.getByRole('region', { name: /sin analizar/i });
  await expect(detalle).toBeVisible();
  await expect(detalle.getByText(/sin riesgos generados/i)).toBeVisible();
  anotar('5.b · detalle de la columna', `abre con ${columna[filaGrave]} activos`);
  await detalle.getByRole('button', { name: 'Cerrar detalle' }).click();

  // ── 6 · El filtro recorta el inventario, no sólo los riesgos ────────────────────────
  //
  // Antes, filtrar por un proceso sin ningún activo valorado dejaba la pantalla en cero y
  // parecía que ese proceso no tuviera activos. Ahora el proceso cuenta los suyos.
  const proceso = page.getByLabel('Proceso');
  const opciones = await proceso.locator('option').allTextContents();
  // La primera es «Todos los procesos»; se toma la siguiente que exista.
  expect(opciones.length).toBeGreaterThan(1);
  await proceso.selectOption({ index: 1 });

  const filtrado = await totalDe(page, 'Matriz de riesgo inherente');
  const pieFiltrado = await pieDe(page, 'Matriz de riesgo inherente');
  expect(filtrado).toBeGreaterThan(0);
  expect(filtrado).toBeLessThanOrEqual(totalActivos);
  expect(pieFiltrado.ubicados + pieFiltrado.sinAnalizar + pieFiltrado.sinValorar).toBe(filtrado);
  anotar(
    `6 · filtro «${opciones[1]}»`,
    `${filtrado} activos = ${pieFiltrado.ubicados} + ${pieFiltrado.sinAnalizar} + ${pieFiltrado.sinValorar}`,
  );

  await page.getByRole('button', { name: 'Limpiar' }).click();
  await expect(tarjeta(page, 'Matriz de riesgo inherente').getByTestId('total-matriz')).toHaveText(
    String(totalActivos).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
  );
  anotar('   · limpiar el filtro', `vuelve a ${totalActivos}`);

  // ── 7 · El detalle de una casilla sigue abriendo activos ────────────────────────────
  //
  // Cambiar el universo no puede romper lo que ya funcionaba. Se abre la casilla con más
  // activos y se comprueba que el detalle liste tantos como dice la casilla.
  // Sólo casillas de la REJILLA. Buscarlas por `button[title]` también recogería las de la
  // columna aparte —que hoy tiene 330 en una sola— y el paso terminaría probando el detalle
  // equivocado creyendo que prueba éste.
  const casillas = tarjeta(page, 'Matriz de riesgo inherente').locator(
    '[data-testid^="casilla-"]',
  );
  const cuantas = await casillas.count();
  let mejor = -1;
  let mayor = 0;
  for (let i = 0; i < cuantas; i++) {
    const n = Number(((await casillas.nth(i).textContent()) ?? '').replace(/\D/g, '') || 0);
    if (n > mayor) {
      mayor = n;
      mejor = i;
    }
  }
  expect(mejor).toBeGreaterThanOrEqual(0);
  await casillas.nth(mejor).click();
  await expect(page.getByText(new RegExp(`${mayor} activos en la casilla`))).toBeVisible();
  anotar('7 · detalle de la casilla mayor', `${mayor} activos listados`);

  console.log('\nRecorrido ejecutado:\n' + registro.join('\n') + '\n');
});
