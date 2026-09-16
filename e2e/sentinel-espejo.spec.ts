// e2e/sentinel-espejo.spec.ts
//
// El espejo de Sentinel y la promoción, probados por la interfaz.
//
// Esta suite carga más peso que una prueba de interfaz normal. El trabajo de
// sincronización, la acción de promoción y la vista tocan Prisma, y la convención del
// repo es que lo que toca Prisma no se prueba con jest (`lib/sig/eventos.ts` sí, porque
// es puro; `app/sig/acciones/eventos.ts` no). O sea que estas pruebas son la ÚNICA
// cobertura automática del comportamiento nuevo visible para una persona.
//
// Los incidentes se siembran en la tabla espejo directamente, sin pasar por Azure: lo que
// se ejercita acá empieza cuando la fila ya está. Una credencial ausente o un workspace
// lento convertirían una prueba de interfaz en una prueba de red.

import { test, expect } from '@playwright/test';
import {
  cerrarCliente,
  entrarComoColaborador,
  entrarComoLiderSig,
  intentarSegundaPromocion,
  limpiarIncidenteSentinel,
  sembrarIncidenteSentinel,
} from './sesion';

/// Número propio de esta corrida: permite repetir la suite sin chocar con lo que quedó de
/// la anterior y sin depender de limpiar antes de empezar.
const NUMERO = `99${String(process.pid).slice(-4)}`;
const TITULO = `Fuerza bruta SSH de prueba E2E contra mintrace-prod ${NUMERO}`;

test.beforeEach(async () => {
  await limpiarIncidenteSentinel(NUMERO);
  await sembrarIncidenteSentinel({ numeroIncidente: NUMERO, titulo: TITULO });
});

test.afterAll(async () => {
  await limpiarIncidenteSentinel(NUMERO);
  await cerrarCliente();
});

test.describe('Espejo de Sentinel, en modo consulta', () => {
  test('sin sesión no se entra', async ({ page }) => {
    await page.goto('/sgsi/sentinel', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Incidentes de Sentinel' })).toHaveCount(0);
  });

  test('una persona sin permisos del SGSI no alcanza la sección', async ({ page, context }) => {
    await entrarComoColaborador(context);
    await page.goto('/sgsi/sentinel', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/no ten[ée]s acceso al SGSI/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Incidentes de Sentinel' })).toHaveCount(0);
  });

  test('quien tiene permiso ve el incidente espejado con su enlace a Sentinel', async ({
    page,
    context,
  }) => {
    await entrarComoLiderSig(context);
    await page.goto('/sgsi/sentinel', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Incidentes de Sentinel' })).toBeVisible();

    // El título viene de Sentinel. Si no está, el espejo no se leyó.
    await expect(page.getByText(TITULO)).toBeVisible();

    // El enlace profundo es lo que sostiene la afirmación de que Sentinel sigue siendo el
    // registro autoritativo de la evidencia técnica: sin él, el SGI parecería la fuente.
    await expect(page.getByRole('link', { name: /ver en sentinel/i }).first()).toBeVisible();
  });
});

test.describe('Promoción a evento del SGSI', () => {
  test('sin `sgsi:escribir` no aparece el control de promover', async ({ page, context }) => {
    // Ojo: `sgsi:ver` y `sgsi:escribir` los concede hoy el mismo grupo, así que no hay un
    // rol real que vea la pantalla sin poder promover. Lo que se prueba es que el control
    // depende del permiso y no está siempre visible — la compuerta REAL vive en la acción
    // del servidor (`autorConPermiso`), y el botón es sólo ergonomía.
    await entrarComoColaborador(context);
    await page.goto('/sgsi/sentinel', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: 'Promover', exact: true })).toHaveCount(0);
  });

  test('promover crea el evento, lo enlaza, y el incidente deja de ofrecer el botón', async ({
    page,
    context,
  }) => {
    await entrarComoLiderSig(context);
    await page.goto('/sgsi/sentinel', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Promover', exact: true }).first().click();

    await expect(page.getByRole('heading', { name: `Promover #${NUMERO}` })).toBeVisible();

    // El texto del modal declara la prohibición de copiar clasificación y severidad. Es
    // una regla del dominio (O3 y O5), no una cortesía: si desaparece, alguien decidió
    // que el veredicto se puede heredar de Sentinel.
    await expect(
      page.getByText(/la clasificación y la\s+severidad de Sentinel no se copian/i),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Ya terminó' }).click();
    await page.getByRole('button', { name: /^Promover ahora$/ }).click();

    // ESTA es la aserción que se cae si la promoción no guarda. Tras recargar, la celda
    // deja de ofrecer «Promover» y pasa a enlazar el código del evento creado.
    await expect(
      page.getByRole('link', { name: /^EVT-\d{4}-\d{4}$/ }).first(),
      'el incidente no quedó enlazado a un evento: la promoción no guardó',
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('button', { name: 'Promover', exact: true }),
      'sigue ofreciendo promover un incidente ya promovido',
    ).toHaveCount(0);
  });

  test('un incidente ya promovido no se puede promover de nuevo', async ({ page, context }) => {
    await entrarComoLiderSig(context);
    await page.goto('/sgsi/sentinel', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Promover', exact: true }).first().click();
    await page.getByRole('button', { name: 'Ya terminó' }).click();
    await page.getByRole('button', { name: /^Promover ahora$/ }).click();
    await expect(page.getByRole('link', { name: /^EVT-\d{4}-\d{4}$/ }).first()).toBeVisible({
      timeout: 30_000,
    });

    // Primera barrera, la ergonómica: la interfaz deja de ofrecerlo.
    await expect(page.getByRole('button', { name: 'Promover', exact: true })).toHaveCount(0);

    // Segunda barrera, la que de verdad protege: el índice único
    // `(origen_sistema, origen_id_externo)`. Se ataca por debajo de la interfaz porque un
    // segundo intento no tiene por qué llegar por un clic — puede venir de una llamada
    // repetida a la acción, de dos pestañas abiertas, o de un reintento del servidor.
    // Si esto NO lanza, el evento se duplicaría y el espejo tendría dos registros de
    // gestión para el mismo incidente.
    // Se afirma sobre el CÓDIGO del error y el nombre de la restricción, no sobre «lanzó
    // algo». Un `toThrow()` pelado también pasaría si fallara por una persona inexistente
    // o por otra restricción cualquiera, y entonces la prueba estaría en verde sin haber
    // comprobado nada. Verificado a mano: P2002 sobre `evento_origen_unico`, campos
    // `["origen_sistema","origen_id_externo"]`.
    await expect(
      intentarSegundaPromocion(NUMERO),
      'la base aceptó promover dos veces el mismo incidente: el índice único no protege',
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  test('el evento promovido entra SIN veredicto, para que lo evalúe una persona', async ({
    page,
    context,
  }) => {
    await entrarComoLiderSig(context);
    await page.goto('/sgsi/sentinel', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Promover', exact: true }).first().click();
    await page.getByRole('button', { name: 'Ya terminó' }).click();
    await page.getByRole('button', { name: /^Promover ahora$/ }).click();

    const enlace = page.getByRole('link', { name: /^EVT-\d{4}-\d{4}$/ }).first();
    await expect(enlace).toBeVisible({ timeout: 30_000 });
    const codigo = (await enlace.textContent())?.trim() ?? '';

    // El evento tiene que quedar en la lista del módulo de siempre, indistinguible de uno
    // reportado a mano en lo que importa: sin veredicto. Si Sentinel pudiera dictarlo,
    // acá aparecería ya clasificado y nadie habría justificado nada (O3).
    await page.goto('/sgsi/eventos', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(codigo)).toBeVisible();
    await expect(page.getByText(TITULO).first()).toBeVisible();
  });
});
