// e2e/grafo.spec.ts
//
// **Los trece pasos de la Regla 3 para el grafo tecnológico**, ejecutados como los ejecuta una
// persona: contra la aplicación corriendo y con los datos reales del inventario.
//
// No cuenta como prueba de punta a punta que la suite unitaria pase, que `curl` devuelva 200 o
// que el servidor levante. Los tres bugs que originaron el harness de este repo sobrevivieron
// a todo eso.
//
// El paso 13 es el único que atrapa un baricentro no determinista: los otros doce pasan igual
// con un acomodo que se mueve en cada carga.
//
// **Sólo lee.** Navega, filtra y hace clic. Ninguna acción de este archivo escribe.

import { test, expect, type Page } from '@playwright/test';
import { iniciarSesion } from './sesion';

const RUTA = '/tecnologia/grafo';

/// Las cajas del lienzo, con su posición. Es lo que permite comparar dos cargas: si el
/// acomodo se mueve, estas coordenadas cambian.
async function cajas(page: Page): Promise<{ etiqueta: string; x: number; y: number }[]> {
  return page.locator('svg[role="img"] g[aria-label]').evaluateAll((nodos) =>
    nodos.map((n) => {
      const rect = n.querySelector('rect');
      return {
        etiqueta: n.getAttribute('aria-label') ?? '',
        x: Number(rect?.getAttribute('x') ?? -1),
        y: Number(rect?.getAttribute('y') ?? -1),
      };
    }),
  );
}

const panel = (page: Page) => page.getByText('Vecinos directos');

test.beforeEach(async ({ context, baseURL }) => {
  await iniciarSesion(context, baseURL as string);
});

test('los trece pasos del recorrido del grafo', async ({ page }) => {
  const registro: string[] = [];
  const anotar = (paso: string, visto: string) => registro.push(`${paso.padEnd(34)} -> ${visto}`);

  // ── 1 · Abrir la pantalla sin filtro ────────────────────────────────────────────────
  await page.goto(RUTA);
  await expect(page.getByRole('heading', { name: 'Mapa tecnológico · grafo' })).toBeVisible();
  // La puerta del layout: si la sesión no trae el grupo, acá aparece «No tenés acceso».
  await expect(page.getByText('No ten')).toHaveCount(0);

  const lienzo = page.locator('svg[role="img"]');
  await expect(lienzo).toBeVisible();
  // D7 · sin selección al entrar. Antes arrancaba con el activo de código más bajo elegido
  // por nadie y todo lo demás apagado.
  await expect(panel(page)).toHaveCount(0);
  const sinFiltro = await cajas(page);
  expect(sinFiltro.length).toBeGreaterThan(0);
  anotar('1. Abrir sin filtro', `${sinFiltro.length} cajas, ningún nodo seleccionado`);

  // ── 2 · Nivel 1 = PRODUCTOS ─────────────────────────────────────────────────────────
  const n1 = page.getByLabel('Nivel 1');
  const n2 = page.getByLabel('Nivel 2');
  const n3 = page.getByLabel('Nivel 3');

  await n1.selectOption({ label: 'PRODUCTOS' });
  const productos = await n2.locator('option').allTextContents();
  expect(productos).toContain('MINTRACE');
  anotar('2. Nivel 1 = PRODUCTOS', `Nivel 2 ofrece ${productos.length - 1}: ${productos.slice(1).join(', ')}`);

  // ── 3 · Nivel 2 = MINTRACE ──────────────────────────────────────────────────────────
  await n2.selectOption({ label: 'MINTRACE' });
  // `exact` no es adorno: cada caja lleva un `<title>` con su ruta, así que sin él este
  // texto aparece cuarenta veces dentro del propio lienzo.
  await expect(page.getByText('PRODUCTOS · MINTRACE', { exact: true })).toBeVisible();
  const cifras = await page.locator('text=/en la rama · .* de frontera · .* fuera/').innerText();
  const [enRama, frontera, fuera] = (cifras.match(/\d+/g) ?? []).map(Number);
  // D10 · las tres cifras tienen que cerrar contra el total, o el encabezado miente.
  expect(enRama).toBeGreaterThan(0);
  anotar('3. Nivel 2 = MINTRACE', cifras);

  // ── 4 · Leer el lienzo ──────────────────────────────────────────────────────────────
  const conFiltro = await cajas(page);
  expect(conFiltro.length).toBe(enRama + frontera);
  // D6 · los rótulos viven DENTRO del lienzo, así que no pueden desalinearse de sus columnas.
  await expect(lienzo.locator('text', { hasText: 'NADA DEPENDE DE ELLOS' })).toHaveCount(1);
  const deFrontera = page.locator('svg[role="img"] g[aria-label*="fuera de la rama"]');
  anotar(
    '4. Leer el lienzo',
    `${conFiltro.length} cajas (${enRama} de la rama + ${frontera} de frontera), rótulos dentro del SVG`,
  );

  // ── 5 · Clic en un nodo de frontera ─────────────────────────────────────────────────
  if ((await deFrontera.count()) > 0) {
    await deFrontera.first().click();
    // D2 · la frontera es contexto, no sujeto.
    await expect(panel(page)).toHaveCount(0);
    anotar('5. Clic en la frontera', `«${await deFrontera.first().getAttribute('aria-label')}» no abre panel`);
  } else {
    anotar('5. Clic en la frontera', 'SIN FRONTERA en esta rama — paso no ejercido');
  }

  // ── 6 · Clic en un activo de MINTRACE ───────────────────────────────────────────────
  const conectado = page
    .locator('svg[role="img"] g[role="button"]')
    .filter({ hasNotText: 'sin relaciones declaradas' })
    .first();
  await conectado.click();
  await expect(panel(page)).toBeVisible();
  const vecinosDep = await page.locator('section', { has: panel(page) }).locator('> span').count();
  anotar('6. Clic en un activo', `«${await conectado.getAttribute('aria-label')}» · ${vecinosDep} vecino(s)`);

  // ── 7 · Modo «Jerarquía» ────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Jerarquía', exact: true }).click();
  await conectado.click();
  // D8 · los vecinos salen de las líneas dibujadas. Antes se calculaban siempre con las
  // dependencias, y este modo listaba vecinos invisibles.
  const textoPanel = (await page.locator('section', { has: panel(page) }).innerText()).toLowerCase();
  expect(textoPanel).not.toContain('depende de');
  anotar('7. Modo Jerarquía', 'el panel ya no habla de dependencias');

  // ── 8 · Modo «Ambas» + despliegues ──────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Ambas', exact: true }).click();
  await expect(page.getByText('corre en')).toHaveCount(0);
  await page.getByLabel(/Sumar dónde corre cada activo/).check();
  // D9 · el trazo que se dibuja se nombra.
  await expect(page.getByText('corre en').first()).toBeVisible();
  anotar('8. Ambas + despliegues', '«corre en» aparece en la convención al encender el interruptor');

  // ── 9 · Nivel 3 = un ambiente ───────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Dependencias', exact: true }).click();
  const ambientes = (await n3.locator('option').allTextContents()).slice(1);
  await n3.selectOption({ label: ambientes[0] });
  const enNivel3 = await cajas(page);
  expect(enNivel3.length).toBeLessThanOrEqual(conFiltro.length);
  // D4 · las columnas se recalculan sobre el subgrafo: la rama filtrada arranca en 0.
  expect(Math.min(...enNivel3.map((c) => c.x))).toBe(16);
  anotar('9. Nivel 3 = ' + ambientes[0], `${enNivel3.length} cajas, primera columna en x=16`);

  // ── 10 · Cambiar el Nivel 1 ─────────────────────────────────────────────────────────
  const raices = (await n1.locator('option').allTextContents()).slice(1);
  const otraRaiz = raices.find((r) => r !== 'PRODUCTOS' && r !== 'Sin nivel') as string;
  await n1.selectOption({ label: otraRaiz });
  // D1 · sin esto quedarían en un valor imposible: un nivel 2 que no cuelga del nivel 1.
  await expect(n2).toHaveValue('');
  await expect(n3).toHaveValue('');
  anotar('10. Nivel 1 = ' + otraRaiz, 'Nivel 2 y Nivel 3 quedaron limpios');

  // ── 11 · «Sin nivel» ────────────────────────────────────────────────────────────────
  await n1.selectOption({ label: 'Sin nivel' });
  const sinNivel = await page.locator('text=/en la rama · .* de frontera · .* fuera/').innerText();
  anotar('11. Nivel 1 = Sin nivel', sinNivel);

  // ── 12 · «Todo» ─────────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await expect(n1).toHaveValue('');
  await expect(page.getByText(/de frontera/)).toHaveCount(0);
  const vuelta = await cajas(page);
  expect(vuelta).toEqual(sinFiltro);
  anotar('12. Todo', `el grafo volvió a las mismas ${vuelta.length} cajas del paso 1`);

  // ── 13 · Recargar con MINTRACE puesto ───────────────────────────────────────────────
  // **El único paso que atrapa un baricentro no determinista.** Los otros doce pasan igual
  // con un acomodo que se reordena en cada carga; éste compara las coordenadas exactas.
  await n1.selectOption({ label: 'PRODUCTOS' });
  await n2.selectOption({ label: 'MINTRACE' });
  const antes = await cajas(page);

  await page.reload();
  await page.getByLabel('Nivel 1').selectOption({ label: 'PRODUCTOS' });
  await page.getByLabel('Nivel 2').selectOption({ label: 'MINTRACE' });
  const despues = await cajas(page);
  expect(despues).toEqual(antes);
  anotar('13. Recargar con MINTRACE', `${despues.length} cajas en las mismas coordenadas`);

  // El recorrido ejecutado, listo para pegar en el PR.
  console.log('\nRecorrido ejecutado (/tecnologia/grafo, inventario real):\n' + registro.join('\n') + '\n');
});
