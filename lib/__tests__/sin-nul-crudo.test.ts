// lib/__tests__/sin-nul-crudo.test.ts
//
// Un byte NUL crudo dentro de un archivo de código **vuelve el archivo entero binario para
// git**, y con eso ningún diff suyo vuelve a ser revisable.
//
// PASÓ DOS VECES EL 22/09/2026, en dos sesiones distintas y por la misma causa: un NUL como
// separador de una llave de agrupación —buena idea, porque el NUL no puede aparecer dentro de
// un nombre— escrito como BYTE en vez de como el escape `\0`. En `scripts/auditar-niveles.ts`
// llevaba así desde que se creó y nadie lo vio; en `app/api/sgsi/exportar-planes/route.ts` se
// detectó al mirar el `git show --stat` y encontrar `Bin 0 -> 16364 bytes` sobre un `.ts`.
//
// POR QUÉ NO LO VE NADIE: el archivo compila, corre, pasa las pruebas y se lee normal en el
// editor. `tsc`, ESLint y Jest no tienen nada que objetar — el NUL es un carácter válido en un
// literal de cadena. El único síntoma es que `git diff` dice «Binary files differ», y eso sólo
// lo nota quien vaya a revisar ese commit.
//
// El daño no es de ejecución: es que el archivo deja de poder revisarse, en un repo donde
// mergear despliega a producción. La salida de `\0` es idéntica byte a byte a la del NUL
// crudo, así que no hay nada que ganar escribiéndolo del modo que rompe la revisión.

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');

/// Todo el código fuente que git sigue. Se le pregunta a git y no al disco: lo que no está
/// versionado no puede ensuciar el diff de nadie.
function archivosVersionados(): string[] {
  const salida = execFileSync(
    'git',
    ['ls-files', '--', '*.ts', '*.tsx', '*.css', '*.mjs', '*.json', '*.md'],
    { cwd: RAIZ, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  return salida.split('\n').filter((l) => l.trim() !== '');
}

describe('ningún archivo versionado lleva un byte NUL crudo', () => {
  it('git puede diferenciar todos los archivos de código', () => {
    const culpables: string[] = [];

    for (const ruta of archivosVersionados()) {
      let contenido: Buffer;
      try {
        contenido = readFileSync(join(RAIZ, ruta));
      } catch {
        // Un archivo versionado que no está en disco es un checkout parcial, no un NUL.
        continue;
      }
      if (contenido.includes(0)) culpables.push(ruta);
    }

    expect(culpables).toEqual([]);
  });

  it('la prueba detecta el caso que vino a vigilar', () => {
    // Sin esto, la de arriba pasaría igual si `includes(0)` dejara de funcionar. Es el caso de
    // control que la norma del tablero pide: uno que TIENE que dar distinto.
    expect(Buffer.from('a\0b').includes(0)).toBe(true);
    expect(Buffer.from('a\\0b').includes(0)).toBe(false);
  });
});
