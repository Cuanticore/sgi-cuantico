// lib/sig/__tests__/correo-enlace-firma.test.ts
//
// REQ-SIG-19 · Task 6 · el correo que entrega el enlace.
//
// Lo que se fija aca es, sobre todo, la **Verificacion 12**: que la URL del correo no lleve nada
// mas que el token. Ese correo sale de nuestros servidores y no vuelve: viaja por un proveedor de
// correo que no es nuestro, se reenvia, se pega en un chat y queda en el historial del navegador.
// Un id secuencial ahi es una invitacion a probar el siguiente, y una direccion de correo ahi es
// una fuga que nadie pidio. Si esta prueba se afloja, el dato ya salio y no se puede recoger.

import {
  MOTIVO_SIN_BASE_PUBLICA,
  RUTA_DE_FIRMA,
  basePublica,
  correoDeEnlaceDeFirma,
  urlDeFirma,
  type DatosDelCorreoDeEnlace,
} from '../correo-enlace-firma';

/// 43 caracteres de base64url, la forma real del token (§6).
const TOKEN = 'k7QvR2xN-bYm4T0sZpLdA8hJfW1cEoUiVgB6nX3rQyM';
const OTRO_TOKEN = 'Zq1Wd8Ce-Rv5Tb2Yn7Um4Ik9Ol3Px6As0Jh_Gf1Dz2';

/// Sin digitos a proposito: asi, al quitarle el token, la URL no puede contener ningun numero
/// —y un id en una URL es exactamente lo que P9 prohibe—.
const BASE = 'https://sig.cuantico.com';

/// Los datos de la persona que NO pueden aparecer en ninguna parte del enlace.
const CORREO_PERSONAL = 'daniel.medina@gmail.com';
const ID_PERSONA = 77;
const ID_ASIGNACION = 418;

const DATOS: DatosDelCorreoDeEnlace = {
  nombre: 'Daniel Medina Restrepo',
  expiraEn: new Date('2026-09-17T14:00:00.000Z'),
  contacto: 'ana.perez@cuantico.com',
  documentos: [
    { token: TOKEN, codigo: 'POL-001', titulo: 'Politica de seguridad de la informacion' },
  ],
};

/// Las URL que el correo realmente lleva, sacadas del texto plano y de los `href` del HTML. Se
/// leen de las dos partes porque las dos se envian, y un cliente muestra una u otra.
function urlsDelCorreo(correo: { texto: string; html: string }): string[] {
  const enTexto = [...correo.texto.matchAll(/https?:\/\/[^\s<>"]+/g)].map((m) => m[0]);
  const enHtml = [...correo.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  return [...enTexto, ...enHtml];
}

describe('basePublica', () => {
  // Un correo con un enlace a localhost es un correo perdido: la persona no tiene como firmar,
  // nadie se entera de que no pudo, y el enlace queda emitido consumiendo su plazo.
  it('sin PUBLIC_URL no hay base, y por lo tanto no hay enlace', () => {
    expect(basePublica({})).toBeNull();
    expect(basePublica({ PUBLIC_URL: undefined })).toBeNull();
  });

  it('una base vacia o en blanco es lo mismo que no tenerla', () => {
    expect(basePublica({ PUBLIC_URL: '' })).toBeNull();
    expect(basePublica({ PUBLIC_URL: '   ' })).toBeNull();
    expect(basePublica({ PUBLIC_URL: '///' })).toBeNull();
  });

  // No se cae a `http://localhost:3004` como el resto de los correos del proyecto. Ahi la caida
  // es inofensiva; aca el enlace ES el correo.
  it('no inventa un valor por defecto', () => {
    expect(basePublica({ OTRA: 'x' })).toBeNull();
  });

  it('quita las barras finales para que no salga una doble barra', () => {
    expect(basePublica({ PUBLIC_URL: 'https://sig.cuantico.com/' })).toBe(BASE);
    expect(basePublica({ PUBLIC_URL: 'https://sig.cuantico.com///' })).toBe(BASE);
    expect(basePublica({ PUBLIC_URL: '  https://sig.cuantico.com  ' })).toBe(BASE);
  });

  it('el motivo explica por que no se emite', () => {
    expect(MOTIVO_SIN_BASE_PUBLICA).toContain('PUBLIC_URL');
    expect(MOTIVO_SIN_BASE_PUBLICA).toContain('no se emite');
  });
});

describe('urlDeFirma', () => {
  it('es la base, la ruta publica y el token', () => {
    expect(urlDeFirma(BASE, TOKEN)).toBe(`${BASE}${RUTA_DE_FIRMA}/${TOKEN}`);
  });

  // D-9 · la ruta publica es una sola y no crece.
  it('la ruta publica es /firmar', () => {
    expect(RUTA_DE_FIRMA).toBe('/firmar');
  });
});

// ── Verificacion 12 ──────────────────────────────────────────────────────────────────────────
describe('Verificacion 12 · la URL del correo no lleva nada mas que el token', () => {
  const correo = correoDeEnlaceDeFirma(BASE, DATOS);
  const urls = urlsDelCorreo(correo);

  it('el correo lleva un enlace por documento y ninguno mas', () => {
    expect(urls).toHaveLength(2); // el mismo enlace en el texto y en el href del HTML
    expect(new Set(urls).size).toBe(1);
  });

  it('la URL es exactamente la base, /firmar y el token', () => {
    for (const url of urls) {
      expect(url).toBe(`${BASE}/firmar/${TOKEN}`);
    }
  });

  // La forma fuerte de la regla: la ruta tiene DOS segmentos, `firmar` y el token. Un tercero
  // seria un dato, y cualquier dato ahi viaja por servidores que no son nuestros.
  it('la ruta tiene dos segmentos: firmar y el token', () => {
    for (const url of urls) {
      const partes = new URL(url).pathname.split('/').filter((p) => p !== '');
      expect(partes).toEqual(['firmar', TOKEN]);
    }
  });

  it('no lleva parametros de consulta ni fragmento, que es donde se cuelan los extras', () => {
    for (const url of urls) {
      expect(new URL(url).search).toBe('');
      expect(new URL(url).hash).toBe('');
    }
  });

  // P9 · ni el id de la persona, ni el correo, ni el id de la asignacion.
  it('no lleva el correo de la persona', () => {
    for (const url of urls) {
      expect(url).not.toContain(CORREO_PERSONAL);
      expect(url).not.toContain('@');
      expect(url.toLowerCase()).not.toContain('medina');
      expect(url.toLowerCase()).not.toContain('daniel');
    }
  });

  it('no lleva ningun id: quitado el token, no queda un solo digito', () => {
    for (const url of urls) {
      const sinElToken = url.split(TOKEN).join('');
      expect(sinElToken).toBe(`${BASE}/firmar/`);
      expect(sinElToken).not.toMatch(/[0-9]/);
      expect(sinElToken).not.toContain(String(ID_PERSONA));
      expect(sinElToken).not.toContain(String(ID_ASIGNACION));
    }
  });

  // La funcion que arma la URL no recibe la persona ni la asignacion: no los puede filtrar
  // porque no los conoce. Esta prueba fija esa forma, no solo el resultado de hoy.
  it('urlDeFirma solo acepta la base y el token', () => {
    expect(urlDeFirma).toHaveLength(2);
  });
});

describe('correoDeEnlaceDeFirma · lo que el correo dice', () => {
  const correo = correoDeEnlaceDeFirma(BASE, DATOS);

  it('dice QUE hay que firmar, con el codigo y el titulo del documento', () => {
    expect(correo.texto).toContain('POL-001');
    expect(correo.texto).toContain('Politica de seguridad de la informacion');
    expect(correo.html).toContain('POL-001');
  });

  it('dice POR QUE se le escribe a una direccion personal', () => {
    expect(correo.texto).toContain('dirección personal');
    expect(correo.texto).toContain('cuenta corporativa ya no está habilitada');
  });

  it('dice HASTA CUANDO sirve, con el año', () => {
    expect(correo.texto).toContain('17 de septiembre de 2026');
  });

  it('dice A QUIEN escribirle si no reconoce la solicitud', () => {
    expect(correo.texto).toContain('Si no reconoce esta solicitud');
    expect(correo.texto).toContain('ana.perez@cuantico.com');
  });

  it('avisa que se va a pedir el documento de identidad (D-7)', () => {
    expect(correo.texto).toContain('documento de identidad');
  });

  it('dice que se puede abrir las veces que haga falta y que la firma es una sola (D-5)', () => {
    expect(correo.texto).toContain('las veces que necesite');
    expect(correo.texto).toContain('una sola vez es la firma');
  });

  it('dice que no lleva adjunto y no hay nada que devolver', () => {
    expect(correo.texto).toContain('no lleva archivos adjuntos');
  });

  // Sin adjunto: el correo armado son tres cadenas y nada mas. No hay por donde colar un archivo.
  it('no tiene adjunto: el correo armado es asunto, texto y html', () => {
    expect(Object.keys(correo).sort()).toEqual(['asunto', 'html', 'texto']);
  });
});

describe('correoDeEnlaceDeFirma · lo que el correo NO dice', () => {
  const correo = correoDeEnlaceDeFirma(BASE, DATOS);

  // P11/P8 · ningun dato personal mas que el nombre. El area, el cargo y el correo personal no
  // se omiten por prolijidad: no entran en el tipo, asi que no se pueden imprimir.
  it('saluda por el primer nombre y no imprime el nombre completo', () => {
    expect(correo.texto).toContain('Hola, Daniel.');
    expect(correo.texto).not.toContain('Medina Restrepo');
  });

  it('no lleva la direccion personal en el cuerpo', () => {
    expect(correo.texto).not.toContain(CORREO_PERSONAL);
    expect(correo.html).not.toContain(CORREO_PERSONAL);
  });

  // P12 · ni un enlace externo. El token va en la ruta, asi que cualquier recurso de tercero se
  // lo lleva en la cabecera `Referer` cuando la persona abre la pagina.
  it('no lleva ningun enlace que no sea el de firma', () => {
    for (const url of urlsDelCorreo(correo)) {
      expect(url.startsWith(`${BASE}/firmar/`)).toBe(true);
    }
    expect(correo.html).not.toContain('<img');
    expect(correo.html).not.toContain('src=');
  });

  it('no nombra el token en ninguna parte que no sea el enlace', () => {
    const fuera = correo.texto.split(`${BASE}/firmar/${TOKEN}`).join('');
    expect(fuera).not.toContain(TOKEN);
  });
});

describe('correoDeEnlaceDeFirma · un correo por persona (P7)', () => {
  const dos = correoDeEnlaceDeFirma(BASE, {
    ...DATOS,
    documentos: [
      ...DATOS.documentos,
      { token: OTRO_TOKEN, codigo: 'ACU-004', titulo: 'Acuerdo de confidencialidad' },
    ],
  });

  it('un solo correo lleva los dos enlaces, cada uno con su token', () => {
    expect(dos.texto).toContain(`${BASE}/firmar/${TOKEN}`);
    expect(dos.texto).toContain(`${BASE}/firmar/${OTRO_TOKEN}`);
    expect(dos.texto).toContain('POL-001');
    expect(dos.texto).toContain('ACU-004');
  });

  it('el asunto cuenta cuantos son', () => {
    expect(dos.asunto).toContain('2 documentos');
    expect(correoDeEnlaceDeFirma(BASE, DATOS).asunto).toBe(
      'Documento pendiente de firma · Cuantico',
    );
  });

  // El asunto lo ve cualquiera que mire la pantalla de un telefono por encima del hombro.
  it('el asunto no lleva el nombre, ni el documento, ni el token', () => {
    expect(dos.asunto).not.toContain('Daniel');
    expect(dos.asunto).not.toContain('POL-001');
    expect(dos.asunto).not.toContain(TOKEN);
  });

  it('el plural no deja frases en singular sueltas', () => {
    expect(dos.texto).toContain('Los enlaces sirven hasta');
    expect(dos.texto).toContain('Documentos por firmar:');
    expect(dos.texto).not.toContain('El enlace sirve hasta');
  });
});

describe('correoDeEnlaceDeFirma · el HTML no se rompe con lo que alguien escribio', () => {
  it('escapa el titulo del documento', () => {
    const correo = correoDeEnlaceDeFirma(BASE, {
      ...DATOS,
      documentos: [
        { token: TOKEN, codigo: 'POL-001', titulo: 'Politica <script>alert(1)</script> & cia' },
      ],
    });
    expect(correo.html).not.toContain('<script>');
    expect(correo.html).toContain('&lt;script&gt;');
    expect(correo.html).toContain('&amp;');
  });

  it('sin nombre, saluda igual', () => {
    const correo = correoDeEnlaceDeFirma(BASE, { ...DATOS, nombre: '   ' });
    expect(correo.texto.startsWith('Hola.')).toBe(true);
  });
});
