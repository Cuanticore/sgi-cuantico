// lib/sig/__tests__/correo-constancia-firma.test.ts
//
// REQ-SIG-19 · Task 9 · la constancia de la firma por enlace.
//
// Es el unico registro que le queda en las manos a quien firmo por esta via: su cuenta
// corporativa ya no existe, `/mi-sig` le esta cerrado y no hay ruta publica para consultar el
// historial (D-9). Lo que se prueba aca es que la constancia sirva para eso —codigo, huella y
// fecha, completos— y que no arrastre nada que no deba salir de la organizacion.

import { correoDeConstanciaDeFirma, type DatosDeLaConstancia } from '../correo-constancia-firma';

const HUELLA = 'a3f1c9e27b45d806fa1e2c3b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70';

const DATOS: DatosDeLaConstancia = {
  nombre: 'Lina Medina Restrepo',
  documento: { codigo: 'POL-001', titulo: 'Política de seguridad de la información', version: 3 },
  acta: {
    codigo: 'ACT-2026-0042',
    huella: HUELLA,
    aceptadoEn: new Date('2026-09-14T14:32:07.000Z'),
  },
  enlaceCodigo: 'ENL-2026-0007',
  contacto: 'sig@cuantico.com',
};

describe('correoDeConstanciaDeFirma · P18 · las tres piezas', () => {
  // El codigo la identifica, la fecha la ubica y la huella la vuelve verificable. Las tres, o no
  // es una constancia: es un aviso.
  it('lleva el codigo del acta, su huella y su fecha', () => {
    const c = correoDeConstanciaDeFirma(DATOS);
    for (const texto of [c.texto, c.html]) {
      expect(texto).toContain('ACT-2026-0042');
      expect(texto).toContain(HUELLA);
      expect(texto).toContain('2026-09-14T14:32:07.000Z');
    }
  });

  // Sesenta y cuatro caracteres, completos. Una huella cortada no compara nada, y compararla es
  // para lo unico que sirve.
  it('la huella va entera', () => {
    const c = correoDeConstanciaDeFirma(DATOS);
    expect(HUELLA).toHaveLength(64);
    expect(c.texto).toContain(HUELLA);
    expect(c.texto).not.toContain(`${HUELLA.slice(0, 12)}…`);
  });

  // El asunto lleva el codigo: quien busque el acta dentro de dos años lo hace en el buscador de
  // su correo, y busca por el codigo.
  it('el asunto nombra el acta', () => {
    expect(correoDeConstanciaDeFirma(DATOS).asunto).toContain('ACT-2026-0042');
  });

  // El acta se consulta años despues; «14 de septiembre», solo, es ambiguo para siempre.
  it('la fecha legible lleva el año', () => {
    expect(correoDeConstanciaDeFirma(DATOS).texto).toContain('14 de septiembre de 2026');
  });

  // Se cita el enlace para que un reclamo por correo se pueda atender sin pedir nada mas.
  it('cita el codigo del enlace y a quien escribirle', () => {
    const c = correoDeConstanciaDeFirma(DATOS);
    expect(c.texto).toContain('ENL-2026-0007');
    expect(c.texto).toContain('sig@cuantico.com');
  });
});

describe('correoDeConstanciaDeFirma · lo que NO lleva', () => {
  // D-9 · la ruta publica es una sola y no crece. No hay «ver mi historial» ni «descargar mi
  // acta», asi que el correo no puede ofrecer un enlace a ninguna de las dos: cada ruta publica
  // nueva es superficie de ataque sobre la aplicacion que gobierna el SGSI.
  it('no lleva ningun enlace', () => {
    const c = correoDeConstanciaDeFirma(DATOS);
    expect(c.texto).not.toMatch(/https?:\/\//);
    expect(c.html).not.toMatch(/https?:\/\//);
    expect(c.html).not.toContain('<a ');
    expect(c.texto).not.toContain('/firmar/');
  });

  // P3 · el token no se nombra en ninguna parte. Este modulo ni siquiera lo recibe, y esto lo
  // deja escrito por si alguien intentara pasarselo por un campo de texto.
  it('no puede nombrar el token', () => {
    const token = 'Zx9K-qT4mWb7RfNdL2sVpYcHgE8uJ1AoQ3IiTnB5XeM';
    const c = correoDeConstanciaDeFirma(DATOS);
    expect(c.texto).not.toContain(token);
    expect(c.html).not.toContain(token);
  });

  // El nombre es el unico dato personal, ademas de la direccion a la que se envia. Ni el numero
  // de documento de identidad, ni el cargo, ni el area: el acta los tiene, el buzon personal no
  // tiene por que.
  it('no lleva el documento de identidad de quien firmo', () => {
    const c = correoDeConstanciaDeFirma(DATOS);
    expect(c.texto).not.toMatch(/\b\d{6,11}\b/);
  });
});

describe('correoDeConstanciaDeFirma · como esta escrito', () => {
  // Toda la superficie publica de este requerimiento trata de usted: quien lo recibe ya no
  // trabaja en la organizacion.
  it('trata de usted', () => {
    const t = correoDeConstanciaDeFirma(DATOS).texto;
    expect(t).toContain('Su firma quedó registrada');
    expect(t).toMatch(/usted|su |Su /);
    expect(t).not.toMatch(/\btu\b|\btus\b|\bvos\b/i);
  });

  it('saluda por el primer nombre', () => {
    expect(correoDeConstanciaDeFirma(DATOS).texto.startsWith('Hola, Lina.')).toBe(true);
  });

  // Un nombre vacio no produce «Hola, .»
  it('sin nombre saluda igual', () => {
    const c = correoDeConstanciaDeFirma({ ...DATOS, nombre: '   ' });
    expect(c.texto.startsWith('Hola.')).toBe(true);
  });

  // El titulo del documento es texto que alguien escribio en la aplicacion: un `<` suelto rompe
  // la maqueta en el mejor caso.
  it('escapa lo que viene de la base', () => {
    const c = correoDeConstanciaDeFirma({
      ...DATOS,
      documento: { ...DATOS.documento, titulo: 'Política <b>nueva</b> & "vigente"' },
    });
    expect(c.html).toContain('&lt;b&gt;');
    expect(c.html).toContain('&amp;');
    expect(c.html).not.toContain('<b>nueva</b>');
  });
});
