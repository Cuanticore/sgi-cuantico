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
  type CanalDelActa,
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

// REQ-SIG-19 · la via por enlace. Las mismas personas y el mismo documento, para que la unica
// diferencia entre las dos actas sean las tres variaciones de §7 y nada mas.
const CANAL: CanalDelActa = {
  correoPersonal: 'daniel.medina@gmail.com',
  enlaceCodigo: 'ENL-2026-0007',
  enviadoEn: new Date('2026-09-10T14:02:11.000Z'),
  registradoEn: new Date('2026-03-03T09:15:00.000Z'),
};

const ACTA_POR_ENLACE: DatosDelActa = {
  ...ACTA,
  medio: 'ENLACE_CORREO_PERSONAL',
  canal: CANAL,
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Verificacion 5 de REQ-SIG-19 · NINGUNA acta existente puede cambiar de huella.
//
// Este golden es la prueba de que la variante del enlace no se filtro a la via corporativa: si
// alguien agrega una linea al numeral 1 sin condicionarla al medio, o reacomoda un parrafo del
// numeral 5 «para que sirva para los dos casos», esta prueba falla y dice exactamente que
// caracter cambio.
//
// P20 · el orden de los campos es fijo. Reordenarlo cambiaria la huella de todas las actas
// futuras sin cambiar su contenido, y dos actas con el mismo contenido dejarian de tener la
// misma huella.
//
// El texto de abajo se capturo de la salida de `textoDelActa` ANTES de tocar el modulo. No se
// edita para que una prueba pase: si difiere de lo que el codigo produce, lo que esta mal es el
// codigo, porque esto es lo que ya se firmo.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const ACTA_CORPORATIVA_CONGELADA = `ACTA DE ACEPTACIÓN Y FIRMA · ACT-2026-0001

1. IDENTIFICACIÓN DE QUIEN FIRMA
   Nombre: Lina Medina Restrepo
   Documento de identidad: 1020304050
   Cargo: Gerente Comercial
   Área: Gestión Comercial
   Correo corporativo: lmedina@cuantico.com
   Tipo de vinculación: Nómina

2. DOCUMENTO ACEPTADO
   Código: POL-SIG-02
   Nombre: Política de Gobierno de la Seguridad
   Versión leída: 2
   Huella SHA-256 del documento: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
   Ubicación: https://sharepoint/pol-sig-02-v2.pdf

3. DECLARACIÓN ACEPTADA
   Declaro haber leído y comprendido la política.

4. CONSTANCIA DE LA ACEPTACIÓN
   Fecha y hora (UTC): 2026-09-03T14:30:00.000Z
   Dirección IP: 10.0.0.7
   Navegador: Mozilla/5.0
   Sesión: ses-abc
   Asignación asociada: 42

5. FIRMA ELECTRÓNICA
   Esta es una firma electrónica SIMPLE. No interviene un certificado digital ni una
   entidad de certificación. Su confiabilidad se sustenta en el control de acceso a la
   cuenta corporativa con la que se autenticó quien firma, en la trazabilidad del
   numeral 4, y en la inalterabilidad de este registro.

   Firma de quien acepta: Lina Medina Restrepo · 1020304050
   Constancia del sistema: la huella de esta acta se calcula sobre el texto anterior y
   se almacena junto al registro. Cualquier cambio en el contenido produce otra huella.
`;

/// La huella de ese texto, capturada al mismo tiempo. Es la que un auditor recalcularia.
const HUELLA_CORPORATIVA_CONGELADA =
  'e79c8ee4b3ab4a2d7422e15b168c06064955368cdd27ba42eaae4e22d4738628';

describe('EL GOLDEN de la via corporativa · ninguna acta firmada cambia de huella', () => {
  // La prueba central de REQ-SIG-19 task 2. Si esta pasa, las actas ya firmadas se pueden seguir
  // reverificando; si falla, alguna de ellas dejo de coincidir con su `acta_hash` guardado y la
  // evidencia de la organizacion se volvio irreproducible.
  it('la via corporativa produce el texto byte por byte', () => {
    expect(textoDelActa(ACTA)).toBe(ACTA_CORPORATIVA_CONGELADA);
  });

  it('y su huella no se mueve', () => {
    expect(generarActa(ACTA).hash).toBe(HUELLA_CORPORATIVA_CONGELADA);
  });

  // `medio` ausente y `medio` explicito tienen que dar EXACTAMENTE lo mismo: es lo que hace que
  // agregar el campo no cambie la conducta de nada que ya estuviera llamando a esta funcion.
  it('declarar el medio corporativo explicitamente no cambia ni un caracter', () => {
    expect(textoDelActa({ ...ACTA, medio: 'SESION_CORPORATIVA' })).toBe(
      ACTA_CORPORATIVA_CONGELADA,
    );
  });

  // Un canal colado en una firma con sesion agregaria dos lineas al acta corporativa y le
  // cambiaria la huella a todas las que vinieran despues. Se rechaza en vez de ignorarse.
  it('un canal en una firma con sesion se rechaza, no se ignora', () => {
    expect(() => textoDelActa({ ...ACTA, canal: CANAL })).toThrow(/no pueden ser ciertas a la vez/);
  });
});

describe('textoDelActa · la via por enlace (REQ-SIG-19 §7)', () => {
  const texto = textoDelActa(ACTA_POR_ENLACE);

  // D-2 · reusar el numeral 5 de la via corporativa produciria un acta que invoca como fundamento
  // de su confiabilidad una autenticacion que NO ocurrio. Es evidencia fabricada, y es justo el
  // documento que se le muestra a un auditor o a un juez.
  it('el numeral 5 no afirma que hubo autenticacion con cuenta corporativa', () => {
    const plano = texto.replace(/\s+/g, ' ');
    expect(plano).not.toContain(
      'Su confiabilidad se sustenta en el control de acceso a la cuenta corporativa',
    );
    expect(plano).toContain('Quien firma NO se autenticó con una cuenta corporativa');
    expect(plano).toContain('su cuenta ya estaba deshabilitada al momento de la firma');
  });

  // Los tres hechos que SI son verificables, que son en lo que el acta dice sustentarse. Si
  // alguno desaparece, el numeral 5 vuelve a ser una afirmacion sin sustento.
  it('nombra los tres hechos verificables y sigue diciendo que es SIMPLE', () => {
    const plano = texto.replace(/\s+/g, ' ');
    expect(plano).toContain('firma electrónica SIMPLE');
    expect(plano).toContain('No interviene un certificado digital');
    expect(plano).toContain('la posesión de un enlace único de un solo uso');
    expect(plano).toContain('el conocimiento del número de documento de identidad, que fue verificado contra el registrado');
    expect(plano).toContain('la trazabilidad del numeral 4');
  });

  it('el numeral 1 suma el canal y el 4 el medio', () => {
    expect(texto).toContain('Correo personal (canal de notificación): daniel.medina@gmail.com');
    expect(texto).toContain(
      'Medio de identificación: enlace único de un solo uso (ENL-2026-0007)',
    );
    expect(texto).toContain('Enviado a: daniel.medina@gmail.com el 2026-09-10T14:02:11.000Z');
  });

  // P3 · el token no se escribe en ninguna parte, y el acta es «ninguna parte». Lo que se nombra
  // es el codigo del enlace, que existe exactamente para eso.
  it('nombra el codigo del enlace y nunca un token', () => {
    expect(texto).toContain('ENL-2026-0007');
    expect(texto.toLowerCase()).not.toContain('token');
  });

  // P19 · lo que el acta no puede afirmar, no lo afirma. Decir «registrada por RRHH el 3 de
  // marzo» sin poder probarlo es peor que decir que no consta.
  it('sin fecha de registro del correo, lo dice', () => {
    const t = textoDelActa({ ...ACTA_POR_ENLACE, canal: { ...CANAL, registradoEn: null } });
    expect(t).toContain('sin registro de origen');
    expect(t).not.toContain('2026-03-03');
  });

  it('con fecha de registro, la escribe', () => {
    expect(texto).toContain('dirección registrada en la ficha el 2026-03-03T09:15:00.000Z');
    expect(texto).not.toContain('sin registro de origen');
  });

  // El numeral 5 es lo unico que un acta por enlace tiene para explicar por que vale. Generarla
  // sin la trazabilidad que ese numeral invoca seria afirmar un fundamento que no se muestra — y
  // el acta es inmutable (F4), asi que una vez guardada con su huella ya no se corrige.
  it('declarar el medio por enlace SIN canal no produce un acta a medias: falla', () => {
    expect(() => textoDelActa({ ...ACTA, medio: 'ENLACE_CORREO_PERSONAL' })).toThrow(
      /no trae el canal/,
    );
  });

  // Las dos vias son el mismo mecanismo probatorio: mismos cinco numerales, misma estructura.
  it('conserva los cinco numerales del documento base', () => {
    expect(texto).toContain('1. IDENTIFICACIÓN DE QUIEN FIRMA');
    expect(texto).toContain('2. DOCUMENTO ACEPTADO');
    expect(texto).toContain('3. DECLARACIÓN ACEPTADA');
    expect(texto).toContain('4. CONSTANCIA DE LA ACEPTACIÓN');
    expect(texto).toContain('5. FIRMA ELECTRÓNICA');
  });

  // El medio de identificacion es parte del contenido probatorio: dos actas iguales en todo lo
  // demas pero firmadas por vias distintas NO pueden compartir huella.
  it('cambiar el medio cambia la huella', () => {
    expect(generarActa(ACTA_POR_ENLACE).hash).not.toBe(HUELLA_CORPORATIVA_CONGELADA);
  });

  // Y sigue siendo determinista, que es lo unico que hace que su huella pruebe algo.
  it('el mismo acta por enlace produce siempre la misma huella', () => {
    expect(generarActa(ACTA_POR_ENLACE).hash).toBe(generarActa(ACTA_POR_ENLACE).hash);
  });

  // La direccion se COPIA al emitir (misma doctrina que F2 con la declaracion): si la persona
  // cambia su correo personal despues, el acta tiene que seguir diciendo a donde fue el enlace.
  it('cambiar la direccion del canal cambia la huella', () => {
    const otra = generarActa({
      ...ACTA_POR_ENLACE,
      canal: { ...CANAL, correoPersonal: 'otro@gmail.com' },
    });
    expect(otra.hash).not.toBe(generarActa(ACTA_POR_ENLACE).hash);
  });
});

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
