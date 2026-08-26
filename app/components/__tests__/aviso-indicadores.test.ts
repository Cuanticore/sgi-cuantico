// app/components/__tests__/aviso-indicadores.test.ts
//
// The branching that decides WHERE somebody is sent to look.
//
// A 404 and a 401 from Microsoft Graph are different problems with different owners: one is
// a path or a filename, the other is a credential or a consent. Getting the two backwards
// sends an administrator to rotate a secret over a file that was renamed — so the mapping
// gets a test even though the file it lives in is a presentational component.

import { diagnostico } from '../AvisoIndicadores';

describe('diagnostico', () => {
  it('un 404 apunta a la ruta y al nombre del archivo, no a las credenciales', () => {
    const d = diagnostico(404, '2026');
    expect(d.titulo).toContain('No se encontró el archivo');
    // The distinction is the whole point of the message.
    expect(d.causa).toContain('no un problema de permisos');
    expect(d.causa).toContain('las credenciales funcionaron');
    expect(d.revisar.join(' ')).toContain('SHAREPOINT_INDICATORS_PATH');
    expect(d.revisar.join(' ')).toContain('SHAREPOINT_INDICATORS_FILE');
    // And it must NOT send anybody to the secret.
    expect(d.revisar.join(' ')).not.toContain('SHAREPOINT_CLIENT_SECRET');
  });

  it('nombra las variables del año que falló, no las del otro', () => {
    // The 2025 workbook has its own path and file variables. Naming the 2026 ones while the
    // 2025 matrix is the one failing is the kind of hint that costs an afternoon.
    const d2025 = diagnostico(404, '2025');
    expect(d2025.revisar.join(' ')).toContain('SHAREPOINT_INDICATORS_PATH_2025');
    expect(d2025.revisar.join(' ')).toContain('SHAREPOINT_INDICATORS_FILE_2025');

    const d2026 = diagnostico(404, '2026');
    expect(d2026.revisar.join(' ')).not.toContain('_2025');
  });

  it('un 401 y un 403 apuntan a la credencial y al consentimiento', () => {
    for (const estado of [401, 403]) {
      const d = diagnostico(estado, '2026');
      expect(d.titulo).toContain('rechazó las credenciales');
      expect(d.revisar.join(' ')).toContain('SHAREPOINT_CLIENT_SECRET');
      // And NOT to the path: the file was never the problem.
      expect(d.revisar.join(' ')).not.toContain('SHAREPOINT_INDICATORS_PATH');
    }
  });

  it('sin estado dice que la llamada no llegó a responder', () => {
    // `estado: null` is what a DNS failure or a timeout produces — there is no HTTP status
    // to report, and claiming one would be inventing a diagnosis.
    const d = diagnostico(null, '2026');
    expect(d.causa).toContain('no llegó a responder');
    expect(d.revisar.join(' ')).toContain('graph.microsoft.com');
  });

  it('un estado desconocido lo dice en vez de fingir un diagnóstico', () => {
    const d = diagnostico(500, '2026');
    expect(d.causa).toContain('500');
    expect(d.titulo).toContain('No se pudo leer la matriz');
  });

  it('siempre da al menos una cosa que revisar', () => {
    // A message with no next step is a dead end that turns into a support ticket.
    for (const estado of [404, 401, 403, 500, 502, null]) {
      expect(diagnostico(estado, '2026').revisar.length).toBeGreaterThan(0);
    }
  });
});
