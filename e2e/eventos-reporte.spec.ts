// e2e/eventos-reporte.spec.ts
//
// GUARDIA DE REGRESIÓN del módulo de reporte de eventos de seguridad.
//
// El cambio `sentinel-espejo-consulta` agrega un espejo de Sentinel y una acción de
// promoción, y es 100 % aditivo. Esta suite existe para que eso deje de ser una promesa y
// pase a ser algo que falla en rojo si se rompe.
//
// ── Sobre la invariante O1, y por qué esta suite NO la prueba con un colaborador ──
//
// `app/sig/acciones/eventos.ts:5-9` declara O1: reportar está abierto a cualquier persona
// autenticada, sin permiso previo. La acción efectivamente solo llama `autorActual()`.
//
// Pero medido contra el servidor, una persona SIN grupos recibe «No tenés acceso al SGSI»
// en `/sgsi/eventos`: `app/sgsi/layout.tsx:36` protege toda la sección con `sgsi:ver`, y
// `reportarEvento` únicamente se invoca desde `Eventos.client.tsx`, que vive dentro de esa
// sección. O sea que hoy O1 se cumple en la CAPA DE ACCIÓN y la única pantalla que la
// ejercita está detrás de `sgsi:ver`.
//
// Esa brecha entre la invariante y su único punto de entrada es preexistente y NO se
// corrige aquí: este cambio es aditivo. Se deja escrita para que no se descubra dos veces.

import { test, expect } from '@playwright/test';
import { cerrarCliente, entrarComoColaborador, entrarComoLiderSig } from './sesion';

test.afterAll(async () => {
  await cerrarCliente();
});

/// Texto único e inequívoco de una descripción de prueba, para poder encontrarla en la
/// lista sin depender del orden ni de los datos que ya existan.
function descripcionUnica(): string {
  return `Prueba E2E de regresion del reporte, marca ${process.pid}-${Date.now()}`;
}

test.describe('El módulo de reporte de eventos sigue en pie', () => {
  test('sin sesión no se entra: la puerta sigue cerrada', async ({ page }) => {
    await page.goto('/sgsi/eventos', { waitUntil: 'domcontentloaded' });

    // No se afirma sobre una URL concreta de login porque el destino lo decide el
    // middleware y puede cambiar. Lo que importa es que el contenido NO se sirva.
    await expect(page.getByRole('heading', { name: 'Eventos e incidentes' })).toHaveCount(0);
  });

  test('una persona sin permisos del SGSI no alcanza la sección', async ({ page, context }) => {
    await entrarComoColaborador(context);
    await page.goto('/sgsi/eventos', { waitUntil: 'domcontentloaded' });

    // Comportamiento ACTUAL, capturado a propósito. Si algún día se abre el reporte a
    // cualquier autenticado —que es lo que O1 pide—, esta prueba se cae y habrá que
    // actualizarla. Que se caiga es correcto: sería un cambio de contrato, no un descuido.
    await expect(page.getByText(/no ten[ée]s acceso al SGSI/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Eventos e incidentes' })).toHaveCount(0);
  });

  test('quien tiene permiso del SGSI ve la lista y el acceso a reportar', async ({
    page,
    context,
  }) => {
    await entrarComoLiderSig(context);
    await page.goto('/sgsi/eventos', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Eventos e incidentes' })).toBeVisible();

    // El botón que abre el reporte. El comentario del propio componente lo describe como
    // «el único botón rojo de la aplicación, el único que se usa con prisa»: si desaparece,
    // el módulo dejó de ser alcanzable aunque la acción del servidor siga existiendo.
    await expect(
      page.getByRole('button', { name: 'Reportar un evento', exact: true }),
      'desapareció el acceso a reportar: se rompió el módulo existente',
    ).toBeVisible();
  });

  test('reportar un evento funciona de punta a punta y queda en la lista', async ({
    page,
    context,
  }) => {
    await entrarComoLiderSig(context);
    await page.goto('/sgsi/eventos', { waitUntil: 'domcontentloaded' });

    const descripcion = descripcionUnica();

    await page.getByRole('button', { name: 'Reportar un evento', exact: true }).click();

    // El modal, con su propio título. Confirma que se abrió antes de escribir.
    await expect(
      page.getByRole('heading', { name: 'Reportar un evento de seguridad' }),
    ).toBeVisible();

    // El marcador de posición no es decorativo: codifica la invariante O15 («la
    // descripción original no se edita nunca, es tu versión»). Si desaparece, el contrato
    // de reporte cambió y hay que mirarlo.
    const campo = page.getByPlaceholder('Con tus palabras. No se corrige después: es tu versión.');
    await expect(campo).toBeVisible();
    await campo.fill(descripcion);

    await page.getByRole('button', { name: /^(reportar|enviar|guardar)/i }).last().click();

    // ESTA es la aserción que se cae si el reporte deja de funcionar. Se afirma sobre la
    // descripción en pantalla, no sobre un mensaje de éxito: un «listo» puede aparecer sin
    // que nada se haya guardado.
    await expect(
      page.getByText(descripcion),
      'el evento reportado no aparece en la lista: el reporte no guardó',
    ).toBeVisible({ timeout: 30_000 });
  });
});
