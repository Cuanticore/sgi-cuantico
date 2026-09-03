// lib/sig/__tests__/firma.test.ts
//
// Leer, aceptar y firmar. Lo que se prueba aca son las siete reglas F1-F7, y sobre todo lo
// que hace que un acta valga como evidencia: **que el mismo contenido produzca siempre la
// misma huella, y que un contenido distinto produzca otra.**
//
// Si el texto del acta no fuera determinista, su huella no probaria nada: dos consultas del
// mismo acta darian huellas distintas y cualquiera podria alegar que el registro cambio.

import {
  codigoActa,
  generarActa,
  huella,
  suscribioLosCompromisos,
  textoDelActa,
  validarFirma,
  type DatosDelActa,
} from '../firma';

const ENTRADA = {
  abrioElDocumento: true,
  acepto: true,
  nombreFirmante: 'Lina Medina Restrepo',
  documentoFirmante: '1020304050',
  declaracion: 'Declaro haber leído y comprendido la política.',
};

const ACTA: DatosDelActa = {
  codigo: 'ACT-2026-0001',
  firmante: {
    nombre: 'Lina Medina Restrepo',
    documento: '1020304050',
    cargo: 'Gerente Comercial',
    area: 'Gestión Comercial',
    correo: 'lmedina@cuantico.com',
    vinculacion: 'Nómina',
  },
  documento: {
    codigo: 'POL-SIG-02',
    nombre: 'Política de Gobierno de la Seguridad',
    version: 2,
    hash: 'a'.repeat(64),
    ubicacion: 'https://sharepoint/pol-sig-02-v2.pdf',
  },
  declaracion: 'Declaro haber leído y comprendido la política.',
  constancia: {
    aceptadoEn: new Date('2026-09-03T14:30:00.000Z'),
    ip: '10.0.0.7',
    agente: 'Mozilla/5.0',
    sesionId: 'ses-abc',
    asignacionId: 42,
  },
};

describe('validarFirma', () => {
  it('con todo en orden no hay errores', () => {
    expect(validarFirma(ENTRADA)).toEqual([]);
  });

  // F1 · sin lectura no hay firma. No se pide leer completo —eso no se puede comprobar, y
  // fingirlo enseña a mentirle al sistema— pero si que el documento haya estado delante.
  it('F1 · sin abrir el documento no se puede firmar', () => {
    const r = validarFirma({ ...ENTRADA, abrioElDocumento: false });
    expect(r.some((x) => x.includes('abrir el documento'))).toBe(true);
  });

  it('sin marcar la casilla tampoco', () => {
    expect(validarFirma({ ...ENTRADA, acepto: false }).some((x) => x.includes('casilla'))).toBe(true);
  });

  // Una firma sin declaracion es un clic. El defecto es del contenido, no de quien firma,
  // pero no se puede firmar igual.
  it('sin declaracion configurada no se firma', () => {
    expect(validarFirma({ ...ENTRADA, declaracion: null })).toContain(
      'el contenido exige firma y no tiene declaración configurada',
    );
    expect(validarFirma({ ...ENTRADA, declaracion: '   ' }).length).toBeGreaterThan(0);
  });

  // El tecleo es el acto deliberado que distingue firmar de hacer clic. Aceptar dos
  // caracteres vaciaria el acto de sentido.
  it('el nombre y el documento tecleados no pueden ser cualquier cosa', () => {
    expect(validarFirma({ ...ENTRADA, nombreFirmante: 'ab' }).some((x) => x.includes('nombre'))).toBe(true);
    expect(validarFirma({ ...ENTRADA, documentoFirmante: '12' }).some((x) => x.includes('documento'))).toBe(true);
  });

  // Quien esta firmando merece ver todo lo que falta de una vez, no descubrirlo de a uno.
  it('devuelve TODOS los errores, no el primero', () => {
    const r = validarFirma({
      abrioElDocumento: false,
      acepto: false,
      nombreFirmante: '',
      documentoFirmante: '',
      declaracion: null,
    });
    expect(r.length).toBe(5);
  });
});

describe('huella', () => {
  it('es SHA-256 en hexadecimal', () => {
    expect(huella('hola')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el mismo contenido da la misma huella', () => {
    expect(huella('hola')).toBe(huella('hola'));
  });

  it('un caracter distinto da otra huella', () => {
    expect(huella('hola')).not.toBe(huella('holA'));
  });
});

describe('codigoActa', () => {
  it('lleva el año y cuatro digitos', () => {
    expect(codigoActa(2026, 1)).toBe('ACT-2026-0001');
    expect(codigoActa(2026, 1234)).toBe('ACT-2026-1234');
  });

  // Sin el año, dos actas de años distintos con el mismo consecutivo chocarian.
  it('el año distingue dos actas con el mismo consecutivo', () => {
    expect(codigoActa(2026, 1)).not.toBe(codigoActa(2027, 1));
  });
});

describe('textoDelActa · los cinco numerales', () => {
  const texto = textoDelActa(ACTA);

  it('lleva los cinco numerales del documento base', () => {
    expect(texto).toContain('1. IDENTIFICACIÓN DE QUIEN FIRMA');
    expect(texto).toContain('2. DOCUMENTO ACEPTADO');
    expect(texto).toContain('3. DECLARACIÓN ACEPTADA');
    expect(texto).toContain('4. CONSTANCIA DE LA ACEPTACIÓN');
    expect(texto).toContain('5. FIRMA ELECTRÓNICA');
  });

  // F3 · sin la huella del documento, «acepte la version 2» no prueba nada si el archivo
  // de la version 2 cambio despues.
  it('F3 · incluye la huella del documento mostrado', () => {
    expect(texto).toContain(ACTA.documento.hash);
  });

  // F2 · la declaracion se copia LITERAL.
  it('F2 · la declaracion va literal', () => {
    expect(texto).toContain('Declaro haber leído y comprendido la política.');
  });

  // F6 · se dice que es simple, sin prometer mas.
  it('F6 · declara que es firma electronica SIMPLE y por que es confiable', () => {
    // Se normalizan los espacios: el texto va envuelto a un ancho legible y la frase cruza
    // el salto de linea. Fijar los saltos en la prueba haria que reacomodar el parrafo la
    // rompiera sin que el contenido cambiara.
    const plano = texto.replace(/\s+/g, ' ');
    expect(plano).toContain('firma electrónica SIMPLE');
    expect(plano).toContain('No interviene un certificado digital');
    // Los tres pilares en los que descansa una firma simple. Si alguno desaparece, el acta
    // deja de explicar por que es confiable y se vuelve una afirmacion sin sustento.
    expect(plano).toContain('control de acceso a la cuenta corporativa');
    expect(plano).toContain('trazabilidad');
    expect(plano).toContain('inalterabilidad de este registro');
  });

  it('el numeral 4 lleva la trazabilidad completa', () => {
    expect(texto).toContain('2026-09-03T14:30:00.000Z');
    expect(texto).toContain('10.0.0.7');
    expect(texto).toContain('ses-abc');
  });

  // Un campo que falta se NOMBRA como faltante en vez de dejar la linea vacia: un acta con
  // «Cargo:» y nada al lado no dice si el cargo no aplica o si nadie lo puso.
  it('un campo ausente se nombra, no se deja en blanco', () => {
    const t = textoDelActa({
      ...ACTA,
      firmante: { ...ACTA.firmante, cargo: null, area: null, vinculacion: null },
    });
    expect(t).toContain('Cargo: no registrado');
    expect(t).not.toContain('Cargo: \n');
  });
});

describe('generarActa · F5, y por que la huella prueba algo', () => {
  // EL CORAZON. Si el texto no fuera determinista, dos generaciones del mismo acta darian
  // huellas distintas y cualquiera podria alegar que el registro cambio.
  it('el mismo acta produce siempre la misma huella', () => {
    expect(generarActa(ACTA).hash).toBe(generarActa(ACTA).hash);
  });

  it('cambiar el nombre del firmante cambia la huella', () => {
    const otra = generarActa({ ...ACTA, firmante: { ...ACTA.firmante, nombre: 'Otro Nombre' } });
    expect(otra.hash).not.toBe(generarActa(ACTA).hash);
  });

  it('cambiar la declaracion cambia la huella', () => {
    const otra = generarActa({ ...ACTA, declaracion: 'Otra declaración.' });
    expect(otra.hash).not.toBe(generarActa(ACTA).hash);
  });

  // Cambiar la version leida tiene que cambiar la huella: es la diferencia entre «acepte la
  // v2» y «acepte la v3».
  it('cambiar la version leida cambia la huella', () => {
    const otra = generarActa({ ...ACTA, documento: { ...ACTA.documento, version: 3 } });
    expect(otra.hash).not.toBe(generarActa(ACTA).hash);
  });

  it('la huella es de 64 hex', () => {
    expect(generarActa(ACTA).hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('suscribioLosCompromisos · C3', () => {
  const exigidos = ['CONF-001', 'DATOS-001', 'POL-001', 'REMOTO-001'];

  it('con los cuatro no falta ninguno', () => {
    const r = suscribioLosCompromisos(exigidos, exigidos);
    expect(r).toEqual({ suscritos: 4, faltan: [] });
  });

  // «Ningun acceso se habilita antes de que estas obligaciones esten suscritas»
  // (PRO-TAL-01, literal). La pantalla necesita saber CUALES faltan, no cuantos: decirle a
  // alguien «te faltan dos» lo manda a buscarlas.
  it('dice CUALES faltan, no solo cuantos', () => {
    const r = suscribioLosCompromisos(['CONF-001', 'POL-001'], exigidos);
    expect(r.suscritos).toBe(2);
    expect(r.faltan).toEqual(['DATOS-001', 'REMOTO-001']);
  });

  // Firmar cosas de mas no adelanta la puerta.
  it('firmar otros contenidos no cuenta como compromiso', () => {
    const r = suscribioLosCompromisos(['LEC-008', 'CAP-004'], exigidos);
    expect(r.suscritos).toBe(0);
    expect(r.faltan).toHaveLength(4);
  });

  it('sin compromisos configurados no falta nada', () => {
    expect(suscribioLosCompromisos([], [])).toEqual({ suscritos: 0, faltan: [] });
  });
});
