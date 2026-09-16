// playwright.config.ts
//
// **El arnés que el HARNESS nombra como la primera deuda a pagar.** `@playwright/test` estaba
// en las `devDependencies` desde hacía meses sin config ni un solo spec: en el `package.json`
// parecía cubierto y no cubría nada.
//
// La Regla 3 —«ningún merge sin prueba de punta a punta»— se venía cumpliendo a mano, y el
// recorrido escrito en el PR era la única evidencia que quedaba. Funciona una vez; no protege
// contra la regresión de dentro de tres meses, que es justo cuando nadie se acuerda de por qué
// existía la regla.
//
// **Corre contra la base que le den en `DATABASE_URL`, y no levanta ninguna.** Hoy eso
// significa el túnel SSM a producción, en modo lectura: el recorrido del grafo sólo navega y
// hace clic. Ningún spec de este directorio puede escribir.

import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3004';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL no está definida. El recorrido necesita una base con datos reales:\n' +
      "  $env:DATABASE_URL = 'postgresql://…@127.0.0.1:15432/sgi_sgsi?schema=public'",
  );
}

export default defineConfig({
  testDir: './e2e',
  // `next dev` compila la ruta en la primera visita, y la del grafo trae cuatro consultas
  // sobre el inventario completo. Un timeout de diez segundos falla por la compilación y
  // señala a la pantalla.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Un solo trabajador: comparten el mismo servidor de desarrollo y la misma base.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Ancho de escritorio: el grafo pone el panel al lado sólo desde `xl`, y verificar el
    // acomodo en una columna angosta probaría otra pantalla.
    viewport: { width: 1600, height: 1000 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: BASE,
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
