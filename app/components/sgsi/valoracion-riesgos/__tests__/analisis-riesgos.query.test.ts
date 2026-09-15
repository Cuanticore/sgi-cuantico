// app/components/sgsi/valoracion-riesgos/__tests__/analisis-riesgos.query.test.ts
//
// REQ-SIG-20 §5 (P4) — tarea 3.13: «visitar la página no escribe nada». Este archivo no
// importa `lib/db` (arrastraría Prisma y su cliente real a un entorno de prueba sin base),
// así que la comprobación es estructural, sobre el TEXTO fuente — el mismo criterio que
// `app/components/sgsi/valoracion/valoracion.query.ts` documenta en su propio encabezado
// («si algún día hay que escribir algo, va por una server action con su bitácora, no por este
// archivo») pero sin automatizar todavía: acá se automatiza para REQ-SIG-20.

import fs from 'fs';
import path from 'path';

const RUTA = path.join(
  process.cwd(),
  'app/components/sgsi/valoracion-riesgos/analisis-riesgos.query.ts',
);

const METODOS_DE_ESCRITURA = [
  '.create(',
  '.createMany(',
  '.update(',
  '.updateMany(',
  '.upsert(',
  '.delete(',
  '.deleteMany(',
  '$transaction',
];

describe('REQ-SIG-20 §5 · la consulta no escribe nada (tarea 3.13)', () => {
  const fuente = fs.readFileSync(RUTA, 'utf8');

  it('no llama a ningún método de escritura de Prisma', () => {
    for (const metodo of METODOS_DE_ESCRITURA) {
      expect(fuente).not.toContain(metodo);
    }
  });

  it('no toca la tabla `Bitacora` ni importa ningún módulo de acciones del servidor', () => {
    expect(fuente).not.toMatch(/prisma\.bitacora/i);
    expect(fuente).not.toMatch(/from ['"]@\/app\/sgsi\/acciones/);
  });
});
