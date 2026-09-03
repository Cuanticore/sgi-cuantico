// lib/sgsi/__tests__/anexos.test.ts
//
// The annex (evidence attachment) gate: what the UI lets in, what the storage records
// and what the download URL proves. Pure functions — no fs, no network — so the
// security rules are pinned by the suite and not by a manual test.

import {
  ANEXOS_ACEPTADOS,
  clavePara,
  firmarAnexo,
  formatoTamano,
  mimePorContenido,
  sha256De,
  verificarFirma,
} from '../anexo-archivo';

describe('mimePorContenido — el tipo se verifica por contenido, no por extensión', () => {
  it('reconoce PDF por la firma mágica', () => {
    expect(mimePorContenido(Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf');
  });

  it('reconoce PNG, JPEG, GIF y WebP', () => {
    expect(mimePorContenido(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe('image/png');
    expect(mimePorContenido(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(mimePorContenido(Buffer.from('GIF89a'))).toBe('image/gif');
    expect(mimePorContenido(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 '))).toBe('image/webp');
  });

  it('reconoce ZIP (contenedor de ofimática) y rechaza lo que no es identificable', () => {
    expect(mimePorContenido(Buffer.from('PK\u0003\u0004resto'))).toBe('application/zip');
    expect(mimePorContenido(Buffer.from('hello world'))).toBeNull();
  });
});

describe('la lista blanca no admite ejecutables ni macros', () => {
  it('solo aparecen las extensiones declaradas', () => {
    expect(Object.keys(ANEXOS_ACEPTADOS).sort()).toEqual(
      ['csv', 'docx', 'gif', 'jpeg', 'jpg', 'md', 'pdf', 'png', 'pptx', 'txt', 'webp', 'xlsx', 'zip'].sort(),
    );
    expect('exe' in ANEXOS_ACEPTADOS).toBe(false);
    expect('docm' in ANEXOS_ACEPTADOS).toBe(false);
    expect('xlsm' in ANEXOS_ACEPTADOS).toBe(false);
    expect('js' in ANEXOS_ACEPTADOS).toBe(false);
  });
});

describe('clavePara — el nombre original jamás es la ruta', () => {
  it('genera una clave server-side con UUID y sin el nombre del archivo', () => {
    const a = clavePara('control', 42, 'pdf');
    const b = clavePara('control', 42, 'pdf');
    expect(a).toMatch(/^sgsi\/control-42\/anexos\/[0-9a-f-]{36}\.pdf$/);
    expect(a).not.toContain('informe');
    expect(b).not.toBe(a);
  });

  it('separa el anexo de un evento del de un control con el mismo id', () => {
    // Sin el prefijo del dueño, el anexo del evento 42 y el del control 42 caerían en la
    // misma carpeta del almacén y un listado no podría decir de quién es cada objeto.
    expect(clavePara('evento', 42, 'png')).toMatch(/^sgsi\/evento-42\/anexos\//);
    expect(clavePara('control', 42, 'png')).toMatch(/^sgsi\/control-42\/anexos\//);
  });
});

describe('firma de descarga de vigencia corta', () => {
  it('firma y verifica el mismo token', () => {
    const token = firmarAnexo(7, 60);
    const r = verificarFirma(token);
    expect(r).not.toBeNull();
    expect(r?.id).toBe(7);
    expect(r!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rechaza un token alterado o un id ajeno', () => {
    const token = firmarAnexo(7, 60);
    expect(verificarFirma(token.slice(0, -4) + 'AAAA')).toBeNull();
    expect(verificarFirma('basura')).toBeNull();
    expect(verificarFirma('id:123.firma')).toBeNull();
  });

  it('un token vencido no pasa', () => {
    const expirado = firmarAnexo(7, -10);
    expect(verificarFirma(expirado)).toBeNull();
  });
});

describe('sha256De y formatoTamano', () => {
  it('el hash coincide con el conocido de «abc» y el formato es legible', () => {
    expect(sha256De(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(formatoTamano(512)).toBe('512 B');
    expect(formatoTamano(2048)).toBe('2.0 KB');
    expect(formatoTamano(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
