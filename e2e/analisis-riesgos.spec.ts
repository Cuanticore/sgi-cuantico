// e2e/analisis-riesgos.spec.ts
//
// **El recorrido de la Regla 3 para la grilla de «Análisis de riesgos»**, ejecutado como lo
// ejecuta una persona: contra la aplicación corriendo y con los datos reales del inventario.
//
// POR QUÉ ESTE ARCHIVO EXISTE, y no una prueba más en Jest: la documentación de AG Grid
// desaconseja jsdom —sin soporte de layout, la virtualización no calcula qué filas caben y la
// grilla puede no rendir ninguna— y recomienda verificar en navegador real. Las decisiones de
// la grilla están probadas puras en `lib/sgsi/__tests__/columnas-analisis.test.ts`, en
// milisegundos. Lo que no se puede probar sin pintar —que las filas aparezcan, que una columna
// se pueda mover, que la disposición sobreviva a recargar— vive acá.
//
// **Sólo lee.** Navega, ordena, mueve columnas y hace clic en un enlace. Ninguna acción de
// este archivo escribe, que es lo que hace tolerable correrlo contra la base de producción por
// el túnel. El botón «+ plan» SÍ escribe, y por eso no está en este recorrido: se prueba a
// mano contra la base local y el recorrido se escribe en el PR.

import { test, expect, type Page } from '@playwright/test';
import { iniciarSesion } from './sesion';

const RUTA = '/sgsi/valoracion-riesgos';

/// Los encabezados de la grilla, TODOS, no sólo los que caben en pantalla.
///
/// AG Grid **virtualiza las columnas**: las que quedan fuera del viewport no están en el DOM.
/// Leer `.ag-header-cell` y esperar trece es una prueba frágil por construcción — da rojo en
/// una ventana angosta sin que nada esté mal, y ese rojo enseña a desconfiar de la prueba, que
/// es lo peor que le puede pasar a un arnés.
///
/// Así que se recorre el ancho recogiendo lo que aparece. Preguntar qué columnas EXISTEN es
/// distinto de preguntar cuáles se VEN, y acá la pregunta es la primera. Que se vean sin
/// desplazarse se comprueba aparte, en el paso 5, que es donde esa pregunta corresponde.
async function encabezados(page: Page): Promise<string[]> {
  const visibles = async () =>
    page
      .locator('.ag-header-cell .ag-header-cell-text')
      .evaluateAll((nodos) => nodos.map((n) => (n.textContent ?? '').trim()));

  const vistos: string[] = [];
  const agregar = (nombres: string[]) => {
    for (const n of nombres) if (n !== '' && !vistos.includes(n)) vistos.push(n);
  };

  const viewport = page.locator('.ag-body-horizontal-scroll-viewport');
  const total = await viewport.evaluate((n) => n.scrollWidth).catch(() => 0);
  const paso = 300;
  for (let x = 0; x <= total; x += paso) {
    await viewport.evaluate((n, v) => (n.scrollLeft = v), x).catch(() => undefined);
    agregar(await visibles());
  }
  await viewport.evaluate((n) => (n.scrollLeft = 0)).catch(() => undefined);
  agregar(await visibles());
  return vistos;
}

const filas = (page: Page) => page.locator('.ag-row');
const primerCodigo = (page: Page) => page.locator('.ag-row[row-index="0"] a').first();

/// El fondo y la barra que una clase de acento produce, medidos sobre una fila REAL de la
/// grilla: se le pone la clase, se lee el estilo calculado, y se le quita — todo dentro del
/// mismo `evaluate`, así que la pantalla no queda alterada y nada se escribe.
///
/// POR QUÉ SE INYECTA EN VEZ DE BUSCAR UNA FILA QUE YA LA TENGA. Este paso existe para vigilar
/// que la regla no vuelva a perder la cascada dentro de `@layer` — pasó, y con las pruebas en
/// verde. Afirmarlo sobre una fila alarmante real ata la comprobación a una condición del
/// NEGOCIO —«hoy existe un riesgo Alto sin tratar»— que ninguna base garantiza: el 22/09/2026
/// la base local tenía las once filas de banda Alto con plan, así que no había ni una fila roja
/// y el paso falló sin que nada estuviera mal.
///
/// Saltarlo cuando no hay filas habría apagado, en silencio, justo el paso que vigila la
/// cascada — y precisamente el día en que no hay con qué comprobarla. **La cascada es una
/// propiedad del CSS, no de los datos**, así que se mide como tal.
/// **SE LEE EL PÍXEL PINTADO, NO EL ESTILO CALCULADO**, y la diferencia costó una noche.
///
/// `getComputedStyle(fila).boxShadow` devuelve la sombra **aunque el navegador no la dibuje**.
/// Medido el 22/09/2026 leyendo el color renderizado del borde izquierdo:
///
///     .ag-row  box-shadow: inset 20px 0 0 0 rgb(255,0,0)  ->  ffffff   NO PINTA
///     .ag-row  border-left: 20px solid rgb(0,200,0)       ->  00c800   pinta
///
/// Durante unas horas las dos barras estuvieron declaradas y ninguna se dibujaba: la regla
/// ganaba la cascada, la variable existía, el valor llegaba, y no había barra. La roja se
/// disimuló detrás de su relleno; la ámbar, que no tiene relleno a propósito, quedaba idéntica
/// a una fila normal. **Una aserción sobre `getComputedStyle` habría pasado en verde con la
/// pantalla muda** — el mismo «verde vacío» que este archivo existe para impedir, esta vez
/// dentro del propio arnés.
///
/// Devuelve dos recortes: el borde izquierdo (donde va la barra) y un punto dentro de la fila
/// (donde va el relleno). No hace falta decodificar el PNG: comparar el recorte de una fila con
/// acento contra el de una fila neutra basta, y **trae su caso de control incorporado** — si
/// los dos fueran iguales, no se estaría midiendo nada.
///
/// La clase se pone, se fotografía y se quita. No escribe nada: es la misma regla de «sólo lee»
/// que hace tolerable correr este archivo contra producción.
/// Siempre sobre LA MISMA fila y una que no traiga acento propio: así lo único que cambia
/// entre una medición y otra es la clase inyectada. Tomar `.ag-row` a secas podía caer en una
/// fila que ya fuera roja, y entonces la «neutra» no habría sido neutra.
function filaSinAcento(page: Page) {
  return page.locator('.ag-row:not(.fila-alarmante):not(.fila-brecha-pendiente)').first();
}

async function recortes(page: Page, clase: string | null): Promise<{ barra: Buffer; relleno: Buffer }> {
  // SE FIJA LA FILA POR SU ÍNDICE ANTES DE MARCARLA, Y NO ES UN RODEO.
  //
  // `filaSinAcento` es un LOCALIZADOR, y Playwright lo vuelve a resolver en cada uso. Su
  // selector lleva `:not(.fila-alarmante)`, así que en el instante en que se le añade la clase
  // **deja de casar** y el mismo localizador pasa a apuntar a la fila siguiente. Medido el
  // 22/09/2026: `row-index` 0 antes de marcar, 1 después; la caja se movía de y=468 a y=502.
  //
  // El efecto era doble y los dos silenciosos: los recortes salían de una fila SIN acento
  // —idénticos a los de la referencia, así que la comparación fallaba diciendo «no pinta»
  // cuando sí pintaba— y el `remove` de abajo se aplicaba a la fila equivocada, dejando la
  // primera marcada para el resto del recorrido.
  const indice = await filaSinAcento(page).getAttribute('row-index');
  const fila = page.locator(`.ag-row[row-index="${indice}"]`).first();
  if (clase !== null) await fila.evaluate((n, c) => n.classList.add(c), clase);
  const caja = await fila.boundingBox();
  if (caja === null) throw new Error('La primera fila de la grilla no tiene caja: ¿se pintó?');
  const barra = await page.screenshot({ clip: { x: caja.x + 1, y: caja.y + 6, width: 2, height: 6 } });
  const relleno = await page.screenshot({ clip: { x: caja.x + 60, y: caja.y + 6, width: 4, height: 6 } });
  if (clase !== null) await fila.evaluate((n, c) => n.classList.remove(c), clase);
  return { barra, relleno };
}

test.beforeEach(async ({ context, baseURL }) => {
  await iniciarSesion(context, baseURL as string);
});

test('el recorrido de la grilla de análisis de riesgos', async ({ page }) => {
  const registro: string[] = [];
  const anotar = (paso: string, visto: string) => registro.push(`${paso.padEnd(38)} -> ${visto}`);

  // ── 1 · Abrir la pantalla ───────────────────────────────────────────────────────────
  await page.goto(RUTA);
  await expect(page.getByRole('heading', { name: 'Análisis de riesgos' })).toBeVisible();
  await expect(filas(page).first()).toBeVisible();
  const cuantas = await filas(page).count();
  expect(cuantas).toBeGreaterThan(0);
  anotar('1 · abrir la pantalla', `${cuantas} filas pintadas`);

  // ── 2 · Las tarjetas y la lista dicen lo mismo ──────────────────────────────────────
  //
  // El invariante de esta pantalla, comprobado donde de verdad importa: sobre los datos
  // reales y con la grilla montada. `filasAnalisis` decide una vez y las dos cosas lo leen.
  const rotulo = await page.getByText(/\d+ activos · orden por/).textContent();
  const enElRotulo = Number(/(\d+) activos/.exec(rotulo ?? '')?.[1] ?? -1);
  expect(enElRotulo).toBe(cuantas);
  anotar('2 · tarjetas vs. lista', `el rótulo dice ${enElRotulo} y hay ${cuantas} filas`);

  // ── 3 · Las trece columnas, con «Plan» tercera ──────────────────────────────────────
  //
  // «Plan» va junto a Nombre y no al final: es la única columna con una acción, y mandarla
  // al extremo derecho obligaba a recorrer diez columnas para hacer lo único que se hace
  // desde acá.
  const cabeceras = await encabezados(page);
  expect(cabeceras).toContain('Código');
  expect(cabeceras).toContain('Nombre');
  expect(cabeceras).toContain('Plan');
  expect(cabeceras.indexOf('Plan')).toBe(cabeceras.indexOf('Nombre') + 1);
  expect(cabeceras).toContain('Peor residual');
  anotar('3 · las columnas', cabeceras.join(' · '));

  // ── 4 · El encabezado agrupado de las dimensiones ───────────────────────────────────
  await expect(page.getByText('Valor por dimensión')).toBeVisible();
  anotar('4 · grupo de dimensiones', 'visible');

  // ── 5 · Ni barra horizontal ni barra vertical ───────────────────────────────────────
  //
  // ESTE PASO ENCONTRÓ UN DEFECTO REAL EN SU PRIMERA EJECUCIÓN (21/09/2026), y por eso está
  // escrito así. La grilla se había declarado «sin barra horizontal» porque las columnas usan
  // `flex`; era falso. `flex` reparte el sobrante pero no baja de los mínimos, y la suma de
  // los mínimos era 1534 px: por debajo de ~1750 de ventana aparecía la barra y se perdían
  // tres columnas, entre ellas «Peor residual». Los 2701 tests unitarios estaban en verde.
  //
  // El piso ahora se mide en milisegundos en `columnas-analisis.test.ts`; este paso comprueba
  // que la medida se corresponde con lo que el navegador hace de verdad — que es la parte que
  // ninguna prueba unitaria puede afirmar.
  //
  // El viewport de este recorrido es 1600 (ver `playwright.config.ts`), más ancho que el 1280
  // del presupuesto: si acá hay barra, en un portátil corriente la hay peor.
  // `.ag-body-viewport` NO EXISTE con `domLayout="autoHeight"`: sin altura fija no hay viewport
  // de cuerpo, y esperarlo colgaba el recorrido 120 s antes de fallar por el motivo
  // equivocado. El contenedor que sí mide el desborde horizontal en esta configuración es
  // `.ag-body-horizontal-scroll-viewport`.
  const desborde = await page
    .locator('.ag-body-horizontal-scroll-viewport')
    .evaluate((n) => n.scrollWidth > n.clientWidth + 1);
  expect(desborde).toBe(false);
  // El vertical se comprueba sobre la grilla entera: con `autoHeight` crece con sus filas y no
  // tiene desplazamiento propio, que es justo lo que se pidió.
  const desbordeVertical = await page
    .locator('.ag-root-wrapper')
    .evaluate((n) => n.scrollHeight > n.clientHeight + 1);
  expect(desbordeVertical).toBe(false);
  anotar('5 · sin barras de desplazamiento', 'ni horizontal ni vertical en la grilla');

  // ── 5b · Y tampoco en 1280, que es el portátil corriente ────────────────────────────
  //
  // Afinar los anchos contra una pantalla ancha es exactamente cómo se coló el defecto: en
  // 1920 se veía perfecto. La comprobación se hace donde duele.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expect(filas(page).first()).toBeVisible();
  const medida = await page
    .locator('.ag-body-horizontal-scroll-viewport')
    .evaluate((n) => ({ contenido: n.scrollWidth, disponible: n.clientWidth }));
  // Se afirma Y SE ANOTA la medida: cuando esto falle, el registro del recorrido dice cuántos
  // píxeles faltan, que es lo primero que se quiere saber. La primera vez el diagnóstico costó
  // dos idas y vueltas porque el rojo sólo decía «true ≠ false».
  expect(medida.contenido).toBeLessThanOrEqual(medida.disponible + 1);
  anotar(
    '5b · sin barra horizontal en 1280',
    `contenido ${medida.contenido} ≤ disponible ${medida.disponible}`,
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(filas(page).first()).toBeVisible();

  // ── 6 · «Código» está fijada ────────────────────────────────────────────────────────
  //
  // Los nombres de clase salen del paquete INSTALADO y no de memoria: `.ag-pinned-left-header`
  // y `.ag-pinned-left-cols-container` son de una versión anterior y no existen en la 36.2.
  // Eso está atajado en `e2e/__tests__/selectores-ag-grid.test.ts`, que lee los selectores de
  // este archivo y los busca en el bundle — en milisegundos, y no en una corrida de minutos.
  //
  // CLASES SUELTAS Y NO COMPUESTAS, y esto costó una corrida entera. El paso decía
  // `.ag-root-wrapper.ag-has-left-pinned-cols` y daba cero elementos: las dos clases existen,
  // pero viven en `div` distintos —`ag-root-wrapper` es el de afuera y `ag-has-left-pinned-cols`
  // está en `ag-root`, su hijo—. Un compuesto afirma ESTRUCTURA, y la estructura no se puede
  // verificar leyendo la lista de clases del paquete.
  //
  // Lo que este paso quiere afirmar es un hecho, no un árbol: «hay columnas fijadas a la
  // izquierda». La clase sola lo dice, y sobrevive a que AG Grid mueva el atributo de nodo.
  await expect(page.locator('.ag-has-left-pinned-cols')).toBeVisible();
  await expect(page.locator('.ag-header-cell-last-left-pinned')).toBeVisible();
  await expect(primerCodigo(page)).toBeVisible();
  anotar('6 · Código fijada', 'la grilla declara columnas fijadas a la izquierda');

  // ── 6b · El renglón rojo PINTA, y no sólo lleva la clase ────────────────────────────
  //
  // ESTE PASO EXISTE POR UN FALLO QUE NINGUNA PRUEBA UNITARIA PODÍA VER. Del 21 al 22 de
  // septiembre de 2026 la regla `.ag-row.fila-alarmante` vivió dentro de `@layer components`
  // y NUNCA PINTÓ: AG Grid inyecta su tema sin capa, y el CSS sin capa gana a cualquier CSS en
  // capa sin importar la especificidad. La clase se aplicaba, la regla existía, la variable
  // estaba definida, la prueba de clases seguía verde — y las filas renderizaban blancas.
  //
  // Por eso acá se afirma el COLOR CALCULADO. Una prueba sobre la clase seguiría verde con la
  // pantalla en blanco.
  //
  // QUÉ SIGNIFICA EL ROJO, DESDE EL 22/09/2026: que al activo le queda un riesgo residual en
  // banda Alto o Crítico que ningún plan cubre (`FilaAnalisis.altoSinPlan`). Antes significaba
  // «tiene una brecha de control sin cubrir» (`estadoPlan === 'pendiente'`), y eso pasó al
  // acento ámbar del paso 6d. Sin este rojo la pantalla no dice de ninguna forma que queda
  // riesgo alto sin tratar, que es lo que ISO/IEC 27001 6.1.3 no deja pasar sin decisión.
  // La cascada se mide por inyección y NO sobre una fila roja real: ver `medirAcento`. Que hoy
  // haya o no un riesgo Alto sin tratar es una condición del negocio que cambia con cada plan
  // que alguien registra, y este paso no vino a medir eso.
  const neutra = await recortes(page, null);
  const rojo = await recortes(page, 'fila-alarmante');

  // Las dos señales del rojo, cada una leída donde se dibuja. Si alguna coincide con la fila
  // neutra, esa señal NO se está pintando — que es el fallo exacto, y el que el estilo
  // calculado no sabe detectar.
  expect(rojo.barra.equals(neutra.barra)).toBe(false);
  expect(rojo.relleno.equals(neutra.relleno)).toBe(false);

  const alarmantes = page.locator('.ag-row.fila-alarmante');
  const cuantasAlarmantes = await alarmantes.count();
  anotar('6b · el renglón rojo pinta', `barra y relleno distintos de la fila neutra; ${cuantasAlarmantes} filas rojas hoy`);

  // ── 6c · Y la celda dice en palabras lo mismo que el color ──────────────────────────
  //
  // El color no puede ser el único portador — es doctrina de este código, escrita en
  // `CeldaBanda` y en la pantalla de matrices.
  //
  // CAMBIÓ EL 22/09/2026, Y POR SEMÁNTICA, NO POR CONVENIENCIA. Este paso afirmaba que la fila
  // roja ofrece el botón «Crear Plan», que era el portador textual cuando el rojo significaba
  // «requiere plan y no lo tiene». Ahora el rojo significa «queda residual Alto o Crítico sin
  // plan», y el botón ya no es su portador: una fila roja puede estar en `con-plan` —plan sobre
  // la brecha de un riesgo, y otro riesgo en Alto sin cubrir—, así que afirmarlo sería un rojo
  // que depende de con qué fila toque el `.first()`.
  //
  // Y MENOS AÚN DESDE EL MISMO DÍA, unas horas después: la celda «Plan» dejó de decidirse con
  // `estadoPlan` —que contesta «¿le falta algo?»— y pasó a mostrar el ENLACE cuando el activo
  // tiene planes (`FilaAnalisis.tienePlanes`) y el BOTÓN cuando le falta alguno, los dos a la
  // vez cuando las dos cosas son ciertas. Medido contra la base local ese día: los 30 activos
  // en análisis tienen algún plan que cubre alguno de sus riesgos, así que la celda mostraría
  // 30 enlaces y ningún botón. **NO EJECUTADO DESDE ESTA SESIÓN** —hace falta base real y
  // túnel—; quien corra el recorrido primero, que lo diga en el PR.
  //
  // El portador textual del rojo nuevo es la columna «Peor residual», que dice la banda en
  // palabras. Y la implicación es exacta, no aproximada: si alguna amenaza está en Alto o
  // Crítico, el PEOR residual del activo está en Alto o Crítico — es el máximo de los mismos
  // números. Una fila roja sin esa palabra sería el rojo mintiendo.
  // Sólo se puede afirmar si hoy hay alguna fila roja; con todas las bandas Alto ya cubiertas
  // por un plan no hay ninguna, y eso no es un defecto. Cuando no las hay, se anota — nunca se
  // finge que la comprobación ocurrió.
  if (cuantasAlarmantes > 0) {
    const textoAlarmante = (await alarmantes.first().textContent()) ?? '';
    expect(textoAlarmante).toMatch(/Alto|Crítico/);
    anotar('6c · el color no va solo', 'la fila roja dice su banda en palabras');
  } else {
    anotar('6c · el color no va solo', 'sin filas rojas hoy: no comprobado');
  }

  // ── 6d · El ámbar lleva SU BARRA, y es otra que la del rojo ─────────────────────────
  //
  // REESCRITO EL 22/09/2026, y **TAMPOCO SE PUDO EJECUTAR DESDE ESTA SESIÓN**: este archivo
  // necesita una base con datos reales, que hoy es producción por el túnel SSM. Lo que sigue
  // está razonado contra el CSS y contra `claseDeFila`, no visto en pantalla. Quien lo corra
  // primero, que lo diga en el PR.
  //
  // POR QUÉ CAMBIÓ LA ASERCIÓN: los dos fondos pastel (`--hf-danger-bg` y `--hf-warn-100`)
  // medían distinto para `getComputedStyle` —una diferencia de canal del 3 %— y este paso
  // pasaba, pero en pantalla el rosa y el crema se leían como el mismo fondo alternando con el
  // blanco de las filas sin acento. La forma ganó donde el tono no alcanzaba: el rojo conserva
  // su fondo y suma una barra vertical saturada (`box-shadow` inset); el ámbar pierde el fondo
  // y se queda solo con su propia barra. Afirmar el fondo ámbar ya no tiene sentido —va a ser
  // blanco a propósito— así que este paso ahora afirma la barra: el `boxShadow` calculado.
  //
  // El ámbar sigue siendo la deuda de MADUREZ: brecha de control sin cubrir y ningún residual
  // alarmante suelto. Es lo que el rojo significaba hasta hoy, así que sin este paso el cambio
  // se habría llevado por delante un aviso que la pantalla ya daba.
  // `:not()` y NO `filter({ hasNot })`. Es la cuarta forma distinta en que un selector de este
  // spec ha afirmado algo distinto de lo que parecía: `hasNot` pregunta si el elemento tiene un
  // DESCENDIENTE que empareje, y estas clases están en la fila MISMA. Con `hasNot`, ninguna fila
  // tiene ese descendiente, así que `sinAcento` emparejaba las treinta —incluidas las ámbar— y
  // `.first()` caía en una con barra.
  //
  // El guardián de `e2e/__tests__/selectores-ag-grid.test.ts` no puede atrapar esto: vigila
  // nombres de clase de AG Grid, y esto es semántica de Playwright.
  const sinAcento = page.locator('.ag-row:not(.fila-alarmante):not(.fila-brecha-pendiente)');
  const cuantasSinAcento = await sinAcento.count();
  // Tiene que haber al menos una: es la fila sobre la que se inyectan las clases para medir, y
  // sin ella las mediciones de 6b no significarían nada.
  expect(cuantasSinAcento).toBeGreaterThan(0);
  anotar('6d · hay fila neutra de referencia', `${cuantasSinAcento} filas sin acento`);

  const ambar = await recortes(page, 'fila-brecha-pendiente');

  // Su barra se pinta, y es otra que la roja.
  expect(ambar.barra.equals(neutra.barra)).toBe(false);
  expect(ambar.barra.equals(rojo.barra)).toBe(false);

  // Y NO trae relleno: el ámbar perdió su pastel a propósito cuando los dos fondos al 3 % de
  // distancia resultaron indistinguibles en pantalla. Si algún día lo recupera, este renglón lo
  // dice — y con él se perdería el discriminante real entre las dos señales, que es el relleno
  // y no el tono de la barra.
  expect(ambar.relleno.equals(neutra.relleno)).toBe(true);
  anotar('6d · las dos barras', 'ámbar con barra propia y sin relleno; roja con las dos');

  // Y cuando hay una fila ámbar, que lleve SU barra — distinta de la roja. El conteo NO se
  // afirma mayor que cero: depende de los datos del día (un activo con brecha pendiente y sin
  // ningún alto suelto), y un rojo que aparece según qué planes se hayan registrado esta semana
  // enseña a desconfiar del arnés. Lo que sí queda asentado es cuántas hubo.
  // El conteo real se anota y NO se afirma: cuántas filas ámbar hay depende de qué planes se
  // registraron esta semana, y un rojo que aparece según eso enseña a desconfiar del arnés. Que
  // el ámbar se pinte ya quedó comprobado arriba, sobre el píxel y sin depender de los datos.
  const conBrecha = page.locator('.ag-row.fila-brecha-pendiente');
  const cuantasBrecha = await conBrecha.count();
  anotar('6d · filas ámbar hoy', `${cuantasBrecha}`);

  // Y ninguna fila lleva los dos acentos: sería un renglón de dos colores, ilegible. Lo
  // garantiza el `else` de `claseDeFila`, y acá se comprueba sobre el DOM real.
  expect(await page.locator('.ag-row.fila-alarmante.fila-brecha-pendiente').count()).toBe(0);

  // ── 7 · Ordenar por una columna reordena, y el rótulo lo dice ───────────────────────
  const primeroAntes = await primerCodigo(page).textContent();
  await page.locator('.ag-header-cell', { hasText: 'Nombre' }).first().click();
  await expect(page.getByText(/activos · orden personalizado/)).toBeVisible();
  anotar('7 · ordenar por Nombre', 'el rótulo pasa a «orden personalizado»');

  // ── 8 · Ordenar NO cambia cuántas filas hay ─────────────────────────────────────────
  //
  // El invariante otra vez, del otro lado: reordenar es una pregunta distinta de «cuáles
  // activos». Si este número se moviera, la grilla estaría filtrando sin decirlo.
  expect(await filas(page).count()).toBe(cuantas);
  const primeroDespues = await primerCodigo(page).textContent();
  anotar('8 · ordenar no filtra', `siguen ${cuantas} filas; arriba ${primeroAntes} → ${primeroDespues}`);

  // ── 9 · Mover una columna ───────────────────────────────────────────────────────────
  //
  // Con pasos explícitos de ratón y no con `dragTo`: AG Grid escucha el movimiento y un
  // arrastre en un solo salto no le llega como arrastre. Un recorrido que sólo pasa a veces
  // no es evidencia.
  const origen = page.locator('.ag-header-cell', { hasText: 'Proceso' }).first();
  const destino = page.locator('.ag-header-cell', { hasText: 'Nombre' }).first();
  const cajaOrigen = await origen.boundingBox();
  const cajaDestino = await destino.boundingBox();
  expect(cajaOrigen).not.toBeNull();
  expect(cajaDestino).not.toBeNull();
  await page.mouse.move(cajaOrigen!.x + cajaOrigen!.width / 2, cajaOrigen!.y + cajaOrigen!.height / 2);
  await page.mouse.down();
  await page.mouse.move(cajaDestino!.x + cajaDestino!.width / 2, cajaDestino!.y + cajaDestino!.height / 2, {
    steps: 20,
  });
  await page.mouse.up();

  const trasMover = await encabezados(page);
  expect(trasMover.indexOf('Proceso')).toBeLessThan(trasMover.indexOf('Criticidad'));
  anotar('9 · mover Proceso', trasMover.slice(0, 6).join(' · '));

  // ── 9b · Filtrar por columna, y las tarjetas siguen a la lista ──────────────────────
  //
  // La garantía central de la pantalla, comprobada donde de verdad importa: con la grilla
  // filtrando de verdad y sobre los datos reales. Las tarjetas se cuentan desde las filas
  // visibles, así que no pueden decir un número que la lista no muestre.
  const filtroNombre = page.locator('.ag-floating-filter-input input').nth(1);
  await filtroNombre.fill('a');
  await expect(async () => {
    const visibles = await filas(page).count();
    const enTarjeta = await page
      .getByText('EN ANÁLISIS')
      .locator('xpath=following-sibling::span[1]')
      .textContent();
    expect(Number(enTarjeta)).toBe(visibles);
  }).toPass();
  anotar('9b · filtrar por Nombre', 'la tarjeta EN ANÁLISIS cuadra con las filas visibles');

  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect.poll(async () => filas(page).count()).toBe(cuantas);
  anotar('9c · limpiar filtros', `vuelven las ${cuantas} filas`);

  // ── 10 · La disposición sobrevive a recargar ────────────────────────────────────────
  //
  // Es la premisa entera del cambio: que la vista sea del lector y siga ahí mañana.
  await page.reload();
  await expect(filas(page).first()).toBeVisible();
  const trasRecargar = await encabezados(page);
  expect(trasRecargar.indexOf('Proceso')).toBe(trasMover.indexOf('Proceso'));
  anotar('10 · recargar', `Proceso sigue en la posición ${trasRecargar.indexOf('Proceso')}`);

  // ── 11 · Restablecer columnas devuelve la disposición de fábrica ────────────────────
  await page.getByRole('button', { name: 'Restablecer columnas' }).click();
  const trasRestablecer = await encabezados(page);
  expect(trasRestablecer.indexOf('Nombre')).toBeLessThan(trasRestablecer.indexOf('Proceso'));
  anotar('11 · restablecer', trasRestablecer.slice(0, 6).join(' · '));

  // ── 12 · El código abre el overlay de Amenazas, con los filtros puestos ─────────────
  //
  // El acceso que la `<table>` daba y que la grilla no podía perder: el `<Link>` real dentro
  // de la celda, no un manejador de clic sobre la fila.
  const codigo = (await primerCodigo(page).textContent())?.trim() ?? '';
  await primerCodigo(page).click();
  await expect(page).toHaveURL(new RegExp(`activo=${codigo}`));
  await expect(page).toHaveURL(/tab=amenazas/);
  anotar('12 · clic en el código', `abre el overlay de ${codigo}`);

  // ── 13 · El mismo enlace se activa sin ratón ────────────────────────────────────────
  //
  // `suppressCellFocus` deja que el foco caiga sobre los elementos reales de la celda, así
  // que el enlace del código es un `<a href>` enfocable y se activa con Enter. Lo que se
  // comprueba acá es eso —que no hay un manejador de ratón haciéndose pasar por enlace—, no
  // un recorrido completo del orden de tabulación.
  await page.goBack();
  await expect(filas(page).first()).toBeVisible();
  await primerCodigo(page).focus();
  await expect(primerCodigo(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/tab=amenazas/);
  anotar('13 · con teclado', 'Enter sobre el código abre el mismo overlay');

  console.log(`\nRecorrido ejecutado (${RUTA}):\n${registro.map((l) => `  ${l}`).join('\n')}\n`);
});
