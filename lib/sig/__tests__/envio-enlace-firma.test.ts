// lib/sig/__tests__/envio-enlace-firma.test.ts
//
// REQ-SIG-19 · Task 6 · el envio del correo, con su registro.
//
// Tres cosas se fijan aca, y las tres son la diferencia entre un enlace que funciona y uno que
// se pierde sin que nadie se entere:
//
//   · Sin `PUBLIC_URL` no se envia NADA y no se cuenta NADA (Step 3).
//   · El envio se cuenta en `EnlaceFirma.vecesEnviado`, que es un contador y no una llave: por
//     eso se puede reenviar, y por eso NO se usa `EnvioNotificacion` (P8).
//   · El token no sale por ninguna rendija del resultado, ni siquiera por el detalle de un
//     fallo, que lo escribe la libreria de SMTP y no nosotros (P3).

import { MOTIVO_SIN_BASE_PUBLICA } from '../correo-enlace-firma';
import {
  anotarEnvioCon,
  enviarEnlaceDeFirma,
  sinTokens,
  type EnvioDeEnlaces,
  type PuertosDeEnvio,
} from '../envio-enlace-firma';

// El modulo importa Prisma y el transporte SMTP para sus valores por defecto. Ninguno de los dos
// se usa en estas pruebas —todo entra por los puertos— pero cargarlos de verdad pediria una base
// y la marca `server-only`.
jest.mock('@/lib/db', () => ({ prisma: {} }));
jest.mock('@/lib/sgsi/notificaciones', () => ({ enviarCorreo: jest.fn() }));

const TOKEN = 'k7QvR2xN-bYm4T0sZpLdA8hJfW1cEoUiVgB6nX3rQyM';
const OTRO_TOKEN = 'Zq1Wd8Ce-Rv5Tb2Yn7Um4Ik9Ol3Px6As0Jh_Gf1Dz2';
const AHORA = new Date('2026-09-10T14:02:11.000Z');

const ENVIO: EnvioDeEnlaces = {
  nombre: 'Daniel Medina Restrepo',
  correoDestino: 'daniel.medina@gmail.com',
  expiraEn: new Date('2026-09-17T14:00:00.000Z'),
  contacto: 'ana.perez@cuantico.com',
  enlaces: [
    {
      id: 11,
      codigo: 'ENL-2026-0007',
      token: TOKEN,
      documento: { codigo: 'POL-001', titulo: 'Politica de seguridad' },
    },
  ],
};

function puertos(sobre: Partial<PuertosDeEnvio> = {}) {
  const enviados: { para: string; asunto: string; texto: string; html?: string }[] = [];
  const anotados: { ids: number[]; enviadoEn: Date }[] = [];
  return {
    enviados,
    anotados,
    p: {
      entorno: { PUBLIC_URL: 'https://sig.cuantico.com' } as Record<string, string | undefined>,
      ahora: () => AHORA,
      enviar: async (para: string, asunto: string, texto: string, html?: string) => {
        enviados.push({ para, asunto, texto, html });
        return { enviado: true, configurado: true, detalle: `enviado a ${para}` };
      },
      anotarEnvio: async (ids: number[], enviadoEn: Date) => {
        anotados.push({ ids, enviadoEn });
      },
      ...sobre,
    },
  };
}

describe('sin PUBLIC_URL no se emite el enlace', () => {
  it('no envia el correo y no cuenta el envio', async () => {
    const { enviados, anotados, p } = puertos({ entorno: {} });
    const r = await enviarEnlaceDeFirma(ENVIO, p);

    expect(r.enviado).toBe(false);
    expect(r.detalle).toBe(MOTIVO_SIN_BASE_PUBLICA);
    expect(enviados).toHaveLength(0);
    expect(anotados).toHaveLength(0);
  });

  it('el motivo se puede mostrar: nombra el codigo del enlace y no el token', async () => {
    const { p } = puertos({ entorno: { PUBLIC_URL: '   ' } });
    const r = await enviarEnlaceDeFirma(ENVIO, p);
    expect(r.codigos).toEqual(['ENL-2026-0007']);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });
});

describe('el envio que sale', () => {
  it('manda un solo correo a la direccion personal, con el enlace adentro', async () => {
    const { enviados, p } = puertos();
    const r = await enviarEnlaceDeFirma(ENVIO, p);

    expect(r.enviado).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].para).toBe('daniel.medina@gmail.com');
    expect(enviados[0].texto).toContain(`https://sig.cuantico.com/firmar/${TOKEN}`);
  });

  // P8 · el envio se cuenta en `EnlaceFirma`, no en `EnvioNotificacion`. Es un contador, no una
  // llave unica: por eso reenviar a alguien que dice que no le llego es posible.
  it('cuenta el envio en los enlaces que salieron, con la fecha', async () => {
    const { anotados, p } = puertos();
    await enviarEnlaceDeFirma(ENVIO, p);

    expect(anotados).toEqual([{ ids: [11], enviadoEn: AHORA }]);
  });

  it('reenviar vuelve a contar, y no falla por unicidad', async () => {
    const { anotados, p } = puertos();
    await enviarEnlaceDeFirma(ENVIO, p);
    const segundo = await enviarEnlaceDeFirma(ENVIO, p);

    expect(segundo.enviado).toBe(true);
    expect(anotados).toHaveLength(2);
  });

  // P7 · un enlace por asignacion, un correo por persona.
  it('dos documentos viajan en un solo correo y los dos quedan contados', async () => {
    const { enviados, anotados, p } = puertos();
    const dos: EnvioDeEnlaces = {
      ...ENVIO,
      enlaces: [
        ...ENVIO.enlaces,
        {
          id: 12,
          codigo: 'ENL-2026-0008',
          token: OTRO_TOKEN,
          documento: { codigo: 'ACU-004', titulo: 'Acuerdo de confidencialidad' },
        },
      ],
    };
    const r = await enviarEnlaceDeFirma(dos, p);

    expect(enviados).toHaveLength(1);
    expect(r.codigos).toEqual(['ENL-2026-0007', 'ENL-2026-0008']);
    expect(anotados).toEqual([{ ids: [11, 12], enviadoEn: AHORA }]);
  });
});

describe('el envio que no sale', () => {
  // `vecesEnviado` responde «cuantas veces llego a salir». Contar los intentos fallidos
  // convertiria el unico numero que sirve para atender un «no me llego» en un numero que no
  // significa nada.
  it('un fallo de SMTP no cuenta como envio', async () => {
    const { anotados, p } = puertos({
      enviar: async () => ({ enviado: false, configurado: true, detalle: 'falló el envío: 550' }),
    });
    const r = await enviarEnlaceDeFirma(ENVIO, p);

    expect(r.enviado).toBe(false);
    expect(r.detalle).toContain('550');
    expect(anotados).toHaveLength(0);
  });

  it('sin SMTP configurado tampoco cuenta', async () => {
    const { anotados, p } = puertos({
      enviar: async () => ({ enviado: false, configurado: false, detalle: 'SMTP no configurado' }),
    });
    const r = await enviarEnlaceDeFirma(ENVIO, p);

    expect(r.enviado).toBe(false);
    expect(anotados).toHaveLength(0);
  });

  it('sin enlaces no hay correo', async () => {
    const { enviados, p } = puertos();
    const r = await enviarEnlaceDeFirma({ ...ENVIO, enlaces: [] }, p);

    expect(r.enviado).toBe(false);
    expect(enviados).toHaveLength(0);
  });
});

describe('P3 · el token no sale por el resultado', () => {
  it('el detalle de un fallo se filtra aunque la libreria lo incluya', async () => {
    const { p } = puertos({
      enviar: async () => ({
        enviado: false,
        configurado: true,
        detalle: `falló el envío del mensaje https://sig.cuantico.com/firmar/${TOKEN}`,
      }),
    });
    const r = await enviarEnlaceDeFirma(ENVIO, p);

    expect(r.detalle).not.toContain(TOKEN);
    expect(r.detalle).toContain('«token»');
  });

  it('lo que se devuelve para registrar son los codigos', async () => {
    const { p } = puertos();
    const r = await enviarEnlaceDeFirma(ENVIO, p);
    expect(r.codigos).toEqual(['ENL-2026-0007']);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it('sinTokens no se atraganta con una lista vacia ni con un token vacio', () => {
    expect(sinTokens('hola', [])).toBe('hola');
    expect(sinTokens('hola', [''])).toBe('hola');
  });
});

describe('anotarEnvioCon', () => {
  // Un solo `updateMany`: los enlaces de un mismo correo se entregaron en el mismo acto, y
  // contarlos de a uno abre la puerta a que queden dos contados y dos no.
  it('suma uno a vecesEnviado y fecha el envio, en una sola escritura', async () => {
    const llamadas: unknown[] = [];
    const cliente = {
      enlaceFirma: {
        updateMany: (async (args: unknown) => {
          llamadas.push(args);
          return { count: 2 };
        }) as never,
      },
    };

    await anotarEnvioCon(cliente)([11, 12], AHORA);

    expect(llamadas).toEqual([
      {
        where: { id: { in: [11, 12] } },
        data: { enviadoEn: AHORA, vecesEnviado: { increment: 1 } },
      },
    ]);
  });
});
