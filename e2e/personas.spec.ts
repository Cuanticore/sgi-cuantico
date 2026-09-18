// e2e/personas.spec.ts
//
// **El recorrido de la Regla 3 para la pantalla de Personas**, ejecutado como lo ejecuta una
// persona: contra la aplicación corriendo y con los datos reales del censo.
//
// El paso que justifica todo el archivo es el **4**: comparar el número que muestra la
// columna contra la cantidad de filas que lista la pestaña. Son dos consultas distintas —el
// censo cuenta las 91 personas de un saque, `pendientesDePersona` lee una— y ésa es
// exactamente la forma del defecto del `rowCount` que originó el harness de este repo: dos
// piezas contando lo mismo desde orígenes distintos. Los demás pasos pasan igual aunque esas
// dos cuentas discrepen.
//
// **Sólo lee.** Navega, cambia de pestaña, filtra y descarga. Asignar y reasignar escriben, y
// por eso NO entran acá: se prueban a mano y el recorrido va escrito en el PR. Es la regla que
// hace tolerable correr esto contra la base de producción por el túnel.

import { test, expect, type Page } from '@playwright/test';
import { iniciarSesion } from './sesion';

const RUTA = '/sig/personas';

/// La primera fila con pendientes, con su número leído de la celda.
///
/// Se busca la fila y no se asume la primera: el censo está ordenado por nombre, y quién
/// encabeza la lista cambia cada vez que entra alguien nuevo al Directorio.
async function primeraConPendientes(page: Page) {
  const botones = page.getByRole('button', { name: /Ver pendientes/ });
  const cuantos = await botones.count();
  for (let i = 0; i < cuantos; i += 1) {
    const boton = botones.nth(i);
    const texto = (await boton.textContent()) ?? '';
    const abiertas = Number(texto.match(/^\s*(\d+)/)?.[1] ?? '0');
    if (abiertas > 0) return { boton, abiertas, texto };
  }
  return null;
}

test.beforeEach(async ({ context, baseURL }) => {
  await iniciarSesion(context, baseURL as string);
});

test('el recorrido de pendientes y formación', async ({ page }) => {
  const registro: string[] = [];
  const anotar = (paso: string, visto: string) => registro.push(`${paso.padEnd(38)} -> ${visto}`);

  // ── 1 · Abrir el censo ────────────────────────────────────────────────────────────────
  await page.goto(RUTA);
  await expect(page.getByRole('heading', { name: 'Personas' })).toBeVisible();
  const filas = page.locator('tbody tr');
  await expect(filas.first()).toBeVisible();
  anotar('1 · Abrir /sig/personas', `${await filas.count()} filas`);

  // ── 2 · Encontrar a alguien con carga abierta ─────────────────────────────────────────
  const elegida = await primeraConPendientes(page);
  test.skip(elegida === null, 'Ninguna persona del censo tiene pendientes abiertos.');
  if (elegida === null) return;
  anotar('2 · Primera con pendientes', `${elegida.abiertas} en la celda`);

  // ── 3 · El botón abre el popup EN la pestaña Pendientes ───────────────────────────────
  //
  // Antes el número abría en «Datos base», donde la lista estaba al final de un formulario
  // de edición. Aterrizar en la pestaña correcta es la mitad del cambio.
  await elegida.boton.click();
  const pestanaPendientes = page.getByRole('tab', { name: /Pendientes/ });
  await expect(pestanaPendientes).toHaveAttribute('aria-selected', 'true');
  anotar('3 · Abre en Pendientes', 'aria-selected=true');

  // ── 4 · El número de la columna y la lista coinciden ──────────────────────────────────
  //
  // **El paso que existe por la cicatriz del `rowCount`.**
  const panel = page.getByRole('tabpanel');
  const items = panel.locator('ul > li');
  await expect(items.first()).toBeVisible();
  expect(await items.count()).toBe(elegida.abiertas);
  anotar('4 · Columna == filas de la lista', `${elegida.abiertas} == ${await items.count()}`);

  // ── 5 · Con vencidas, la marca de atención y el orden por urgencia ────────────────────
  const vencidas = Number(elegida.texto.match(/\((\d+) venc\./)?.[1] ?? '0');
  if (vencidas > 0) {
    // La marca de atención es un punto sin texto —`aria-hidden`, porque el motivo vive dentro
    // del panel y repetirlo en el nombre accesible haría que el lector lo lea en cada
    // pestaña—. Se comprueba por su presencia, no por un atributo puesto para la prueba.
    await expect(pestanaPendientes.locator('span[aria-hidden="true"]')).toHaveCount(1);
    await expect(items.first()).toContainText(/Vencida/);
    anotar('5 · Vencidas arriba y marcadas', `${vencidas} vencida(s)`);
  } else {
    await expect(items.first()).not.toContainText(/Vencida/);
    anotar('5 · Sin vencidas', 'ninguna fila dice «Vencida»');
  }

  // ── 6 · El filtro de formación no inventa filas ───────────────────────────────────────
  const chip = panel.getByRole('button', { name: 'Sólo formación' });
  if (await chip.count()) {
    await chip.click();
    const conFiltro = await items.count();
    expect(conFiltro).toBeLessThanOrEqual(elegida.abiertas);
    // Cada fila visible lleva su marca de tipo de formación.
    for (let i = 0; i < conFiltro; i += 1) {
      await expect(items.nth(i)).toContainText(/Capacitación|Curso virtual/);
    }
    await chip.click();
    expect(await items.count()).toBe(elegida.abiertas);
    anotar('6 · Filtro «Sólo formación»', `${conFiltro} de ${elegida.abiertas}, y vuelve`);
  } else {
    anotar('6 · Filtro «Sólo formación»', 'no aplica: nada de formación abierto');
  }

  // ── 7 · Un avance sin reportar NO se dibuja como 0% ───────────────────────────────────
  //
  // La regla que este cambio existe para sostener, comprobada sobre lo que hay en pantalla:
  // ninguna fila puede decir «Va por el 0%» junto a «no reporta avance».
  const textoPanel = (await panel.textContent()) ?? '';
  // `[\s\S]` en vez del flag `s`: el `tsconfig` de este repo apunta por debajo de es2018.
  expect(textoPanel).not.toMatch(/no reporta avance[\s\S]*0%/);
  anotar('7 · Ningún 0% inventado', 'ninguna fila mezcla «no reporta» con un porcentaje');

  // ── 8 · La pestaña Formación, con sus grupos ──────────────────────────────────────────
  await page.getByRole('tab', { name: 'Formación' }).click();
  await expect(page.getByRole('tab', { name: 'Formación' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(panel).not.toContainText('Cargando su formación…', { timeout: 15_000 });
  const formacion = (await panel.textContent()) ?? '';
  // O tiene formación agrupada, o lo dice: lo que no puede es quedarse en blanco.
  expect(formacion).toMatch(/En curso y pendiente|Realizada|No se va a cursar|No tiene formación/);
  anotar('8 · Pestaña Formación', formacion.slice(0, 60).replace(/\s+/g, ' '));

  // ── 9 · Exportar entrega una hoja de cálculo ──────────────────────────────────────────
  //
  // Descargar es leer: no escribe nada, así que entra al spec.
  await pestanaPendientes.click();
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('link', { name: 'Exportar' }).click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/^pendientes-.*\.xlsx$/);
  anotar('9 · Exportar', descarga.suggestedFilename());

  // ── 10 · Cerrar, y la tabla sigue en pie ──────────────────────────────────────────────
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('tab', { name: /Pendientes/ })).toHaveCount(0);
  await expect(filas.first()).toBeVisible();
  anotar('10 · Cerrar sin escribir', `${await filas.count()} filas siguen`);

  console.log(`\nRecorrido ejecutado (${RUTA}):\n${registro.map((r) => `  ${r}`).join('\n')}\n`);
});
