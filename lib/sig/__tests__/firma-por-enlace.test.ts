// lib/sig/__tests__/firma-por-enlace.test.ts
//
// REQ-SIG-19 · Task 8 · el acto de firmar sin sesion.
//
// Lo que se prueba aca son las cuatro decisiones que sostienen la via publica: que el tope de
// cinco intentos cierre el enlace, que el sexto intento NI SE EVALUE, que el autor de la bitacora
// diga la verdad —un enlace, no una sesion— y que ninguna de las salidas publicas invente un
// quinto estado. Si alguna se afloja, el enlace deja de ser una excepcion controlada y pasa a ser
// la puerta mas comoda de la aplicacion.

import { FRASE_ENLACE_NO_DISPONIBLE, TOPE_DE_INTENTOS } from '../enlace-firma';
import {
  FRASE_DOCUMENTO_NO_COINCIDE,
  FRASE_YA_FIRMADO,
  autorDeBitacoraPorEnlace,
  decidirFirmaPorEnlace,
  type EntradaDeFirmaPorEnlace,
} from '../firma-por-enlace';

const AHORA = new Date('2026-09-14T14:00:00.000Z');
const ENVIADO = new Date('2026-09-10T09:00:00.000Z');

/// Los cuatro campos de estado de un enlace que todavia sirve.
const VIGENTE = {
  expiraEn: new Date('2026-09-17T14:00:00.000Z'),
  usadoEn: null,
  revocadoEn: null,
  bloqueadoEn: null,
} as const;

/// Un enlace que sirve, con un documento que coincide: la unica entrada que llega a `FIRMAR`.
const BUENA: EntradaDeFirmaPorEnlace = {
  enlace: { ...VIGENTE },
  enviadoEn: ENVIADO,
  asignacionCerrada: false,
  documentoTecleado: '1.020.345-6',
  documentoGuardado: '10203456',
  intentosFallidos: 0,
};

function con(cambios: Partial<EntradaDeFirmaPorEnlace>): EntradaDeFirmaPorEnlace {
  return { ...BUENA, ...cambios };
}

describe('autorDeBitacoraPorEnlace', () => {
  // P16 · el autor dice lo que paso. NUNCA el correo corporativo: ese afirmaria una sesion que no
  // existio, que es el defecto entero que este requerimiento viene a evitar.
  it('tiene la forma `enlace:CODIGO · correo`', () => {
    expect(autorDeBitacoraPorEnlace('ENL-2026-0007', 'nombre@gmail.com')).toBe(
      'enlace:ENL-2026-0007 · nombre@gmail.com',
    );
  });

  // El prefijo existe para que la cadena no se confunda con un correo de sesion, ni leyendola ni
  // filtrando la bitacora por autor.
  it('nunca se puede confundir con un correo de sesion', () => {
    const autor = autorDeBitacoraPorEnlace('ENL-2026-0007', 'ex.colaborador@gmail.com');
    expect(autor.startsWith('enlace:')).toBe(true);
    expect(autor).not.toBe('ex.colaborador@gmail.com');
  });

  // P3 · un token en la bitacora es un token en manos de todo el que puede leer la bitacora, que
  // es justamente el grupo que audita las firmas. La funcion ni siquiera lo recibe, y esto lo
  // deja escrito: lo que se nombra es el CODIGO.
  it('no puede filtrar el token: solo lleva el codigo', () => {
    const token = 'Zx9K-qT4mWb7RfNdL2sVpYcHgE8uJ1AoQ3IiTnB5XeM';
    const autor = autorDeBitacoraPorEnlace('ENL-2026-0007', 'nombre@gmail.com');
    expect(autor).not.toContain(token);
    expect(autor).toContain('ENL-2026-0007');
  });
});

describe('decidirFirmaPorEnlace · las puertas del enlace', () => {
  it('firma cuando el enlace sirve y el documento coincide', () => {
    expect(decidirFirmaPorEnlace(BUENA, AHORA)).toEqual({ clase: 'FIRMAR' });
  });

  // P13 · los cuatro casos malos dan la MISMA frase, palabra por palabra. Distinguirlos convierte
  // la ruta en un oraculo para saber si un token adivinado existe.
  it.each([
    ['inexistente', con({ enlace: null })],
    [
      'expirado',
      con({ enlace: { ...VIGENTE, expiraEn: new Date('2026-09-13T14:00:00.000Z') } }),
    ],
    ['revocado', con({ enlace: { ...VIGENTE, revocadoEn: AHORA } })],
    ['bloqueado', con({ enlace: { ...VIGENTE, bloqueadoEn: AHORA } })],
  ])('%s se rechaza con la misma frase neutral', (_caso, entrada) => {
    const d = decidirFirmaPorEnlace(entrada, AHORA);
    expect(d).toEqual({
      clase: 'RECHAZO',
      motivo: 'NO_DISPONIBLE',
      mensaje: FRASE_ENLACE_NO_DISPONIBLE,
    });
  });

  // Un enlace que nunca salio no puede sostener el numeral 4 del acta: «enviado a … el …» seria
  // una afirmacion sobre un envio que no ocurrio.
  it('rechaza el enlace que nunca se entrego', () => {
    const d = decidirFirmaPorEnlace(con({ enviadoEn: null }), AHORA);
    expect(d).toEqual({
      clase: 'RECHAZO',
      motivo: 'NO_DISPONIBLE',
      mensaje: FRASE_ENLACE_NO_DISPONIBLE,
    });
  });
});

describe('decidirFirmaPorEnlace · lo que ya esta firmado', () => {
  // D-5 · la firma se consume una sola vez, y quien vuelve necesita saberlo.
  it('el enlace ya usado dice que ya se firmo', () => {
    const d = decidirFirmaPorEnlace(con({ enlace: { ...VIGENTE, usadoEn: AHORA } }), AHORA);
    expect(d).toEqual({ clase: 'RECHAZO', motivo: 'ENLACE_USADO', mensaje: FRASE_YA_FIRMADO });
  });

  // La asignacion cerrada por la via corporativa NO inventa un quinto estado publico (P13): de
  // cara a quien abrio el enlace es exactamente el mismo hecho —no hay nada pendiente— y por eso
  // es la misma frase. Lo que las separa es interno, y lo usa la accion para revocar el enlace.
  it('la asignacion ya cerrada se resuelve con la MISMA frase que el enlace usado', () => {
    const cerrada = decidirFirmaPorEnlace(con({ asignacionCerrada: true }), AHORA);
    const usada = decidirFirmaPorEnlace(con({ enlace: { ...VIGENTE, usadoEn: AHORA } }), AHORA);

    expect(cerrada).toEqual({
      clase: 'RECHAZO',
      motivo: 'ASIGNACION_CERRADA',
      mensaje: FRASE_YA_FIRMADO,
    });
    // La frase es la misma cadena: dos frases parecidas escritas en dos ramas terminan
    // distinguiendose en la primera correccion de estilo, y ahi vuelve el oraculo.
    expect(cerrada.clase === 'RECHAZO' && usada.clase === 'RECHAZO').toBe(true);
    if (cerrada.clase === 'RECHAZO' && usada.clase === 'RECHAZO') {
      expect(cerrada.mensaje).toBe(usada.mensaje);
    }
  });

  // Solo hay dos frases publicas, y esta no es la neutral: negarle la constancia a quien firmo es
  // lo mas parecido a decirle que no firmo.
  it('«ya esta firmado» no se confunde con «no esta disponible»', () => {
    expect(FRASE_YA_FIRMADO).not.toBe(FRASE_ENLACE_NO_DISPONIBLE);
  });
});

describe('decidirFirmaPorEnlace · P14 · el tope de cinco', () => {
  // Un documento de identidad son entre seis y diez digitos: sin tope, quien consiga un enlace lo
  // adivina.
  it('cuenta el intento fallido y no bloquea antes del quinto', () => {
    for (let previos = 0; previos < TOPE_DE_INTENTOS - 1; previos += 1) {
      const d = decidirFirmaPorEnlace(
        con({ documentoTecleado: '99999999', intentosFallidos: previos }),
        AHORA,
      );
      expect(d).toEqual({
        clase: 'INTENTO_FALLIDO',
        intentosFallidos: previos + 1,
        bloquear: false,
        mensaje: FRASE_DOCUMENTO_NO_COINCIDE,
      });
    }
  });

  it('al quinto bloquea', () => {
    const d = decidirFirmaPorEnlace(
      con({ documentoTecleado: '99999999', intentosFallidos: TOPE_DE_INTENTOS - 1 }),
      AHORA,
    );
    expect(d).toEqual({
      clase: 'INTENTO_FALLIDO',
      intentosFallidos: TOPE_DE_INTENTOS,
      bloquear: true,
      mensaje: FRASE_DOCUMENTO_NO_COINCIDE,
    });
  });

  // El mensaje no dice cuantos intentos quedan ni anuncia el bloqueo: decirle «le quedan tres» a
  // quien esta probando documentos le dice cuanto puede seguir probando.
  it('el mensaje del fallo no cuenta intentos ni anuncia el bloqueo', () => {
    expect(FRASE_DOCUMENTO_NO_COINCIDE).not.toMatch(/\d/);
    expect(FRASE_DOCUMENTO_NO_COINCIDE.toLowerCase()).not.toContain('bloque');
  });

  // **La regla de P14, la que de verdad importa.** El sexto intento no se rechaza despues de
  // comparar: no se compara. Que el resultado sea RECHAZO no probaria nada —tambien lo seria
  // comparando primero y descartando despues—, asi que se pasa un espia.
  it('el sexto ni se evalua: con el enlace bloqueado el documento no se compara', () => {
    const espia = jest.fn(() => true);
    const bloqueado = con({
      enlace: { ...VIGENTE, bloqueadoEn: AHORA },
      intentosFallidos: TOPE_DE_INTENTOS,
    });

    const d = decidirFirmaPorEnlace(bloqueado, AHORA, espia);

    expect(espia).not.toHaveBeenCalled();
    expect(d).toEqual({
      clase: 'RECHAZO',
      motivo: 'NO_DISPONIBLE',
      mensaje: FRASE_ENLACE_NO_DISPONIBLE,
    });
  });

  // Y el contador no se mueve: un intento que no se evaluo no es un intento.
  it('el enlace bloqueado no sigue contando intentos', () => {
    const d = decidirFirmaPorEnlace(
      con({
        enlace: { ...VIGENTE, bloqueadoEn: AHORA },
        documentoTecleado: '99999999',
        intentosFallidos: TOPE_DE_INTENTOS,
      }),
      AHORA,
    );
    expect(d.clase).toBe('RECHAZO');
  });

  // Las otras tres puertas tambien van antes de la comparacion: ninguna de ellas gasta un intento.
  it.each([
    ['el enlace no existe', con({ enlace: null })],
    ['el enlace nunca se entrego', con({ enviadoEn: null })],
    ['la asignacion ya se cerro', con({ asignacionCerrada: true })],
  ])('tampoco compara el documento cuando %s', (_caso, entrada) => {
    const espia = jest.fn(() => true);
    decidirFirmaPorEnlace(entrada, AHORA, espia);
    expect(espia).not.toHaveBeenCalled();
  });
});

describe('decidirFirmaPorEnlace · D-7 · el documento se verifica', () => {
  // La comparacion la hace `documentoCoincide`, que ya ignora espacios, puntos, guiones y caja.
  // Aca se comprueba que la decision de verdad la delega y no la reimplementa.
  it('ignora espacios, puntos y guiones', () => {
    expect(decidirFirmaPorEnlace(con({ documentoTecleado: '10 203 456' }), AHORA).clase).toBe(
      'FIRMAR',
    );
    expect(decidirFirmaPorEnlace(con({ documentoTecleado: '10.203.456' }), AHORA).clase).toBe(
      'FIRMAR',
    );
  });

  // Una persona sin documento cargado no deberia llegar hasta aca (P5 lo exige para emitir), pero
  // si llegara, dos cadenas vacias comparandose como iguales dejarian firmar a cualquiera.
  it('sin documento registrado no se firma', () => {
    const d = decidirFirmaPorEnlace(con({ documentoGuardado: null }), AHORA);
    expect(d.clase).toBe('INTENTO_FALLIDO');
  });
});
