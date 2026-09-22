// e2e/matrices.spec.ts
//
// **El recorrido de la Regla 3 para «Matrices de riesgo»**, contra la aplicación corriendo y
// los datos reales del inventario.
//
// QUÉ AFIRMA, Y POR QUÉ ESO. La matriz de activos cuenta los activos que entran al análisis
// de riesgos, que son los que superan el umbral de valoración: hoy 30 de 378 vigentes. La
// cifra no está mal calculada, pero un «30» bajo el rótulo «Activos» se lee como «el
// inventario son 30», y eso sí era un defecto. Lo que se arregló fue decir de cuántos son.
//
// SE PROBÓ ADEMÁS A PRESENTAR LOS 378 —los 348 restantes en una columna aparte, ubicados por
// su propio valor— Y SE RETIRÓ. Mezclaba dos escalas en una rejilla: las filas son bandas del
// IMPACTO DE UN RIESGO (valor × degradación) y las de esa columna eran bandas del VALOR DEL
// ACTIVO. Trescientos treinta activos en el renglón «Alto», al lado de riesgos que cayeron en
// «Alto», se leen como comparables y no lo son. El paso 5 comprueba que no ha vuelto.
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

/// El reparto por nivel del pie: los cuatro niveles y nada más.
async function pieDe(page: Page, titulo: string): Promise<number> {
  const t = tarjeta(page, titulo);
  let suma = 0;
  for (const n of ['Crítico', 'Alto', 'Medio', 'Bajo']) {
    suma += await cifraDe(t.getByTestId(`banda-${n}`));
  }
  return suma;
}

/// Lo que suman las casillas de la rejilla.
async function enLaRejilla(page: Page, titulo: string): Promise<number> {
  const casillas = tarjeta(page, titulo).locator('[data-testid^="casilla-"]');
  const cuantas = await casillas.count();
  let suma = 0;
  for (let i = 0; i < cuantas; i++) {
    const texto = ((await casillas.nth(i).textContent()) ?? '').replace(/\D/g, '');
    if (texto !== '') suma += Number(texto);
  }
  return suma;
}

test.beforeEach(async ({ context, baseURL }) => {
  await iniciarSesion(context, baseURL as string);
});

test('la matriz de activos cuenta los activos del análisis, y dice de cuántos', async ({
  page,
}) => {
  const registro: string[] = [];
  const anotar = (paso: string, visto: string) => registro.push(`${paso.padEnd(40)} -> ${visto}`);

  // ── 1 · Abrir la pantalla, en amenazas ──────────────────────────────────────────────
  await page.goto(RUTA);
  await expect(page.getByRole('heading', { name: 'Matrices de riesgo' })).toBeVisible();

  const riesgos = await totalDe(page, 'Matriz de riesgo inherente');
  expect(riesgos).toBeGreaterThan(0);
  // En amenazas la cifra son riesgos y no hay nada que aclarar: el texto no debe estar.
  await expect(page.getByTestId('alcance-analisis')).toHaveCount(0);
  anotar('1 · abrir, en amenazas', `${riesgos} riesgos, sin texto de alcance`);

  // El pie y la rejilla cuentan lo mismo, que es lo que impide que el pie contradiga a la
  // matriz. Vale para las dos unidades y por eso se comprueba en las dos.
  expect(await pieDe(page, 'Matriz de riesgo inherente')).toBe(riesgos);
  expect(await enLaRejilla(page, 'Matriz de riesgo inherente')).toBe(riesgos);
  anotar('   · pie y rejilla cuadran', `${riesgos} = ${riesgos}`);

  // ── 2 · Cambiar a activos ───────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Activos' }).click();

  const activos = await totalDe(page, 'Matriz de riesgo inherente');
  expect(activos).toBeGreaterThan(0);
  // Cada activo una sola vez, en la casilla de su peor riesgo: con más de un riesgo por
  // activo tiene que haber estrictamente menos activos que riesgos.
  expect(activos).toBeLessThan(riesgos);
  expect(await pieDe(page, 'Matriz de riesgo inherente')).toBe(activos);
  expect(await enLaRejilla(page, 'Matriz de riesgo inherente')).toBe(activos);
  anotar('2 · conmutar a activos', `${activos} activos, y el pie cuadra`);

  // ── 3 · LA CIFRA DICE DE CUÁNTOS ES ─────────────────────────────────────────────────
  //
  // El defecto que abrió todo esto: «30 ACTIVOS» en una pantalla cuyo inventario tiene 378.
  // El denominador sale de otro camino —un `count` sobre el inventario, no de la matriz—,
  // así que comprobar que los dos números conviven y que el primero es el de la tarjeta es
  // comprobar dos cálculos independientes que concuerdan.
  const alcance = page.getByTestId('alcance-analisis');
  await expect(alcance).toBeVisible();
  const texto = (await alcance.textContent()) ?? '';
  const cifras = [...texto.matchAll(/([\d.]+)\s*activos/g)].map((m) =>
    Number(m[1].replace(/\./g, '')),
  );
  expect(cifras).toHaveLength(2);
  expect(cifras[0]).toBe(activos);
  expect(cifras[1]).toBeGreaterThan(activos);
  anotar('3 · dice de cuántos es', `${cifras[0]} de ${cifras[1]} vigentes`);

  // ── 4 · El texto explica por qué los demás no están ─────────────────────────────────
  await expect(alcance).toContainText(/umbral de valoración/i);
  anotar('4 · y por qué', 'nombra el umbral de valoración');

  // ── 5 · NO HAY NADA FUERA DEL EJE DE FRECUENCIA ─────────────────────────────────────
  //
  // La regresión que este paso existe para impedir. Se retiró una columna que ubicaba los
  // 348 restantes por su propio valor: mezclaba la escala del impacto de un riesgo con la
  // del valor de un activo en la misma rejilla.
  await expect(tarjeta(page, 'Matriz de riesgo inherente').getByTestId('cabecera-sin-analizar'))
    .toHaveCount(0);
  await expect(tarjeta(page, 'Matriz de riesgo inherente').getByTestId('banda-sin-analizar'))
    .toHaveCount(0);
  anotar('5 · una sola escala en la rejilla', 'sin columna ni renglones fuera de banda');

  // ── 6 · El filtro recorta los activos y el denominador no se mueve ──────────────────
  const proceso = page.getByLabel('Proceso');
  const opciones = await proceso.locator('option').allTextContents();
  expect(opciones.length).toBeGreaterThan(1);
  await proceso.selectOption({ index: 1 });

  const filtrado = await totalDe(page, 'Matriz de riesgo inherente');
  expect(filtrado).toBeGreaterThan(0);
  expect(filtrado).toBeLessThanOrEqual(activos);
  expect(await pieDe(page, 'Matriz de riesgo inherente')).toBe(filtrado);
  // El inventario es de cuántos HAY, no de cuántos quedan en el filtro.
  const conFiltro = [...(((await alcance.textContent()) ?? '').matchAll(/([\d.]+)\s*activos/g))].map(
    (m) => Number(m[1].replace(/\./g, '')),
  );
  expect(conFiltro[1]).toBe(cifras[1]);
  anotar(`6 · filtro «${opciones[1]}»`, `${filtrado} activos, denominador intacto`);

  await page.getByRole('button', { name: 'Limpiar' }).click();
  await expect(tarjeta(page, 'Matriz de riesgo inherente').getByTestId('total-matriz')).toHaveText(
    String(activos).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
  );
  anotar('   · limpiar el filtro', `vuelve a ${activos}`);

  // ── 7 · El detalle de una casilla sigue abriendo activos ────────────────────────────
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
