// lib/sig/__tests__/enlace-firma.test.ts
//
// REQ-SIG-19 · el nucleo puro del enlace de firma.
//
// Lo que se prueba aca es todo lo que sostiene una via de firma SIN sesion: que el token sea
// impredecible, que del token no quede rastro, que el enlace se agote, y que el documento de
// identidad de verdad se verifique. Si alguna de esas cuatro se afloja, el enlace deja de ser
// una excepcion controlada y pasa a ser la puerta mas comoda de la aplicacion.

import {
  DIAS_DE_VALIDEZ_POR_DEFECTO,
  FRASE_ENLACE_NO_DISPONIBLE,
  TOPE_DE_INTENTOS,
  codigoEnlace,
  diasDeValidez,
  documentoCoincide,
  elEstadoSeLeCuentaAlPublico,
  estadoDelEnlace,
  generarToken,
  hashDeToken,
  intentosRestantes,
  puedeEmitir,
  quedaBloqueado,
  venceEn,
  type EnlaceParaEvaluar,
} from '../enlace-firma';

const AHORA = new Date('2026-09-10T14:00:00.000Z');

const VIGENTE: EnlaceParaEvaluar = {
  expiraEn: new Date('2026-09-17T14:00:00.000Z'),
  usadoEn: null,
  revocadoEn: null,
  bloqueadoEn: null,
};

describe('generarToken', () => {
  // §6 · 32 bytes en base64url. NO un UUID: su formato invita a tratarlo como identificador
  // —se pega en tickets, se registra en logs, el navegador lo autocompleta— y no toda libreria
  // que los genera usa un generador criptografico.
  it('son 43 caracteres de base64url', () => {
    const t = generarToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  // base64url y no base64: el token viaja EN LA RUTA de la URL, y `+`, `/` y `=` no sobreviven
  // ahi sin escaparse. Un token que hay que escapar es un token que alguien va a copiar mal.
  it('no trae caracteres que haya que escapar en una URL', () => {
    const muchos = Array.from({ length: 200 }, () => generarToken()).join('');
    expect(muchos).not.toMatch(/[+/=]/);
  });

  // Si dos enlaces pudieran salir iguales, el segundo firmaria la asignacion del primero.
  it('nunca se repite', () => {
    const vistos = new Set(Array.from({ length: 500 }, () => generarToken()));
    expect(vistos.size).toBe(500);
  });
});

describe('hashDeToken', () => {
  // P2 · la verificacion es una BUSQUEDA por hash, no una comparacion de secretos, asi que no
  // hay que preocuparse por tiempos: no se compara nada.
  it('es estable: el mismo token da siempre el mismo hash', () => {
    const t = generarToken();
    expect(hashDeToken(t)).toBe(hashDeToken(t));
  });

  it('es SHA-256 en hexadecimal', () => {
    expect(hashDeToken(generarToken())).toMatch(/^[0-9a-f]{64}$/);
  });

  // EL CORAZON DE P2. Lo que se guarda no puede contener lo que se guarda para no entregar.
  // Un respaldo de la base, un SELECT de soporte o una fuga del volcado no pueden devolverle a
  // nadie la capacidad de firmar en nombre de otro.
  it('el hash no contiene el token', () => {
    const t = generarToken();
    expect(hashDeToken(t)).not.toContain(t);
  });

  it('dos tokens distintos dan hashes distintos', () => {
    expect(hashDeToken(generarToken())).not.toBe(hashDeToken(generarToken()));
  });
});

describe('codigoEnlace', () => {
  // P3 · es lo que se nombra en la bitacora, en el acta y en un ticket. Existe para que nadie
  // tenga nunca la necesidad de pegar el token en ninguna parte.
  it('lleva el año y cuatro digitos', () => {
    expect(codigoEnlace(2026, 7)).toBe('ENL-2026-0007');
    expect(codigoEnlace(2026, 1234)).toBe('ENL-2026-1234');
  });

  // Sin el año, dos enlaces de años distintos con el mismo consecutivo chocarian.
  it('el año distingue dos enlaces con el mismo consecutivo', () => {
    expect(codigoEnlace(2026, 7)).not.toBe(codigoEnlace(2027, 7));
  });

  // No se confunde con el codigo del acta, que empieza por ACT-. Desde `enlace_firma.codigo` se
  // llega al acta y desde el acta de vuelta al enlace: si los dos prefijos fueran iguales, esa
  // trazabilidad se leeria mal en cualquier informe.
  it('no se confunde con el codigo del acta', () => {
    expect(codigoEnlace(2026, 1).startsWith('ENL-')).toBe(true);
  });
});

describe('diasDeValidez · D-8', () => {
  // D-8 · el plazo es parametro y no constante: cambiar de 7 a 3 dias es una decision del lider
  // del SIG y no deberia exigir un despliegue.
  it('sin la variable son 7 dias', () => {
    expect(diasDeValidez({})).toBe(DIAS_DE_VALIDEZ_POR_DEFECTO);
    expect(DIAS_DE_VALIDEZ_POR_DEFECTO).toBe(7);
  });

  it('la variable manda', () => {
    expect(diasDeValidez({ FIRMA_ENLACE_DIAS: '3' })).toBe(3);
    expect(diasDeValidez({ FIRMA_ENLACE_DIAS: ' 14 ' })).toBe(14);
  });

  // Un valor mal escrito no puede producir ni un enlace que nace vencido ni uno que no vence
  // nunca. Caer en los 7 dias es la unica caida que no cambia el riesgo.
  it('un valor que no sirve cae en el plazo por defecto y NO en cero', () => {
    for (const malo of ['', '   ', 'siete', '0', '-3', '7.5', 'NaN']) {
      expect(diasDeValidez({ FIRMA_ENLACE_DIAS: malo })).toBe(DIAS_DE_VALIDEZ_POR_DEFECTO);
    }
  });
});

describe('venceEn', () => {
  it('suma los dias completos al instante de emision', () => {
    expect(venceEn(AHORA, 7).toISOString()).toBe('2026-09-17T14:00:00.000Z');
    expect(venceEn(AHORA, 1).toISOString()).toBe('2026-09-11T14:00:00.000Z');
  });

  // La expiracion se calcula UNA vez y se guarda. Si se recalculara en cada consulta, cambiar el
  // parametro alargaria enlaces ya emitidos — justo lo que un plazo existe para impedir.
  it('no modifica la fecha que recibe', () => {
    const emitido = new Date(AHORA);
    venceEn(emitido, 7);
    expect(emitido.toISOString()).toBe(AHORA.toISOString());
  });
});

describe('estadoDelEnlace', () => {
  // P13 · inexistente, expirado, revocado y bloqueado producen LA MISMA pagina. Aca se
  // distinguen porque el servidor necesita saber; la pantalla no los muestra.
  it('distingue los cinco estados', () => {
    expect(estadoDelEnlace(VIGENTE, AHORA)).toBe('VIGENTE');
    expect(estadoDelEnlace({ ...VIGENTE, usadoEn: AHORA }, AHORA)).toBe('USADO');
    expect(estadoDelEnlace({ ...VIGENTE, revocadoEn: AHORA }, AHORA)).toBe('REVOCADO');
    expect(estadoDelEnlace({ ...VIGENTE, bloqueadoEn: AHORA }, AHORA)).toBe('BLOQUEADO');
    expect(
      estadoDelEnlace({ ...VIGENTE, expiraEn: new Date('2026-09-09T14:00:00.000Z') }, AHORA),
    ).toBe('EXPIRADO');
  });

  // D-5 · lo que se consume una sola vez es la FIRMA; abrirlo, cuantas veces haga falta. Quien
  // firmo y vuelve a su enlace una semana despues necesita ver la constancia: ya no tiene donde
  // consultarla, porque /mi-sig le esta cerrado. Evaluar la expiracion antes le diria «este
  // enlace no esta disponible» sobre una firma que si ocurrio.
  it('usado tiene prioridad sobre expirado', () => {
    const usadoYVencido: EnlaceParaEvaluar = {
      expiraEn: new Date('2026-09-01T14:00:00.000Z'),
      usadoEn: new Date('2026-08-30T10:00:00.000Z'),
      revocadoEn: null,
      bloqueadoEn: null,
    };
    expect(estadoDelEnlace(usadoYVencido, AHORA)).toBe('USADO');
  });

  // Y tambien sobre revocado y bloqueado: reemitir despues de una firma no puede borrar la
  // constancia de esa firma.
  it('usado tiene prioridad sobre revocado y sobre bloqueado', () => {
    expect(
      estadoDelEnlace({ ...VIGENTE, usadoEn: AHORA, revocadoEn: AHORA, bloqueadoEn: AHORA }, AHORA),
    ).toBe('USADO');
  });

  // Un fin deliberado —lo reemplazo uno nuevo (P6), o se agotaron los intentos (P14)— es el dato
  // que sirve en soporte. A la pantalla los tres le dan lo mismo; a quien atiende el reclamo, no.
  it('revocado y bloqueado ganan a la expiracion', () => {
    const vencido = { ...VIGENTE, expiraEn: new Date('2026-09-01T00:00:00.000Z') };
    expect(estadoDelEnlace({ ...vencido, revocadoEn: AHORA }, AHORA)).toBe('REVOCADO');
    expect(estadoDelEnlace({ ...vencido, bloqueadoEn: AHORA }, AHORA)).toBe('BLOQUEADO');
  });

  // El limite es el propio instante: un enlace que vence a las 14:00 no sirve a las 14:00. Al
  // reves habria un empate que depende de milisegundos y que nadie puede explicar.
  it('en el instante exacto de la expiracion ya no sirve', () => {
    const justo = new Date('2026-09-17T14:00:00.000Z');
    expect(estadoDelEnlace(VIGENTE, justo)).toBe('EXPIRADO');
    expect(estadoDelEnlace(VIGENTE, new Date(justo.getTime() - 1))).toBe('VIGENTE');
  });
});

describe('P13 · los cuatro que no sirven se ven iguales', () => {
  // Distinguirlos convertiria la ruta en un oraculo para saber si un token adivinado existe:
  // cada respuesta distinta es una pista mas.
  it('solo el usado se le cuenta a quien abrio el enlace', () => {
    expect(elEstadoSeLeCuentaAlPublico('USADO')).toBe(true);
    expect(elEstadoSeLeCuentaAlPublico('EXPIRADO')).toBe(false);
    expect(elEstadoSeLeCuentaAlPublico('REVOCADO')).toBe(false);
    expect(elEstadoSeLeCuentaAlPublico('BLOQUEADO')).toBe(false);
  });

  // P3 · la frase no nombra a nadie y no nombra el token. Es la misma cadena para los cuatro
  // casos porque vive en una constante: dos frases parecidas escritas en dos lugares terminan
  // distinguiendose en la primera correccion de estilo, y ahi vuelve el oraculo.
  it('la frase neutral no revela nada', () => {
    expect(FRASE_ENLACE_NO_DISPONIBLE).not.toMatch(/expir|revoc|bloque|no existe/i);
  });
});

describe('documentoCoincide · D-7', () => {
  // D-7 · el documento se VERIFICA, no solo se registra. Con sesion corporativa la identidad la
  // aporta Azure; sin sesion, este tecleo es lo unico que separa «quien tiene el enlace» de
  // «quien es la persona».
  it('ignora espacios, puntos y guiones', () => {
    expect(documentoCoincide(' 1.234.567-8 ', '12345678')).toBe(true);
    expect(documentoCoincide('12 345 678', '12.345.678')).toBe(true);
  });

  it('no distingue mayusculas, porque algunos documentos llevan letras', () => {
    expect(documentoCoincide('ab123456', 'AB123456')).toBe(true);
  });

  it('no acepta un documento distinto', () => {
    expect(documentoCoincide('12345679', '12345678')).toBe(false);
  });

  // Un digito de mas o de menos no es «casi el documento»: es otro documento.
  it('no acepta un prefijo ni un documento mas largo', () => {
    expect(documentoCoincide('1234567', '12345678')).toBe(false);
    expect(documentoCoincide('123456789', '12345678')).toBe(false);
  });

  // Dos cadenas vacias comparandose como iguales dejarian firmar a cualquiera que apriete enter.
  it('lo vacio nunca coincide, ni contra lo vacio', () => {
    expect(documentoCoincide('', '')).toBe(false);
    expect(documentoCoincide('   ', '')).toBe(false);
    expect(documentoCoincide('...', '12345678')).toBe(false);
    expect(documentoCoincide('12345678', null)).toBe(false);
    expect(documentoCoincide('', '12345678')).toBe(false);
  });
});

describe('tope de intentos · P14', () => {
  // P14 · un documento son entre seis y diez digitos: sin tope, quien consiga un enlace lo
  // adivina.
  it('al quinto intento queda bloqueado', () => {
    expect(quedaBloqueado(4)).toBe(false);
    expect(quedaBloqueado(5)).toBe(true);
    expect(TOPE_DE_INTENTOS).toBe(5);
  });

  // Un contador que se paso de cinco —dos pestañas, una carrera— sigue bloqueado. Preguntar por
  // la igualdad exacta dejaria pasar el sexto.
  it('por encima del tope sigue bloqueado', () => {
    expect(quedaBloqueado(6)).toBe(true);
    expect(quedaBloqueado(99)).toBe(true);
  });

  it('un enlace sin intentos fallidos no esta bloqueado', () => {
    expect(quedaBloqueado(0)).toBe(false);
  });

  // No se le muestra a quien esta tecleando: decirle «te quedan 3» a alguien que esta probando
  // documentos le dice cuanto puede seguir probando. Es para la pantalla de gestion.
  it('los intentos restantes no bajan de cero', () => {
    expect(intentosRestantes(0)).toBe(5);
    expect(intentosRestantes(4)).toBe(1);
    expect(intentosRestantes(5)).toBe(0);
    expect(intentosRestantes(9)).toBe(0);
  });
});

describe('puedeEmitir', () => {
  const INACTIVA_COMPLETA = {
    activa: false,
    correoPersonal: 'daniel.medina@gmail.com',
    documentoIdentidad: '1020304050',
  };

  it('con la cuenta inactiva y las dos piezas cargadas, se emite', () => {
    expect(puedeEmitir(INACTIVA_COMPLETA)).toEqual([]);
  });

  // P4 · sin esta regla el enlace se convierte en el camino comodo —no hay que iniciar sesion— y
  // en seis meses la mitad de las actas tendria el fundamento debil en vez del fuerte. Una via de
  // excepcion que se puede usar sin excepcion deja de ser una excepcion.
  it('rechaza una cuenta habilitada', () => {
    const r = puedeEmitir({ ...INACTIVA_COMPLETA, activa: true });
    expect(r.some((x) => x.includes('sigue activa'))).toBe(true);
  });

  // P5 · sin una direccion a donde escribir, este requerimiento no puede ayudar a nadie.
  it('rechaza sin correo personal, y lo dice', () => {
    expect(
      puedeEmitir({ ...INACTIVA_COMPLETA, correoPersonal: null }).some((x) =>
        x.includes('correo personal'),
      ),
    ).toBe(true);
    expect(
      puedeEmitir({ ...INACTIVA_COMPLETA, correoPersonal: '  ' }).some((x) =>
        x.includes('correo personal'),
      ),
    ).toBe(true);
  });

  // P5 y D-7 · sin documento cargado no hay nada contra que verificar, y el enlace pasaria a ser
  // la unica credencial. La frase manda a cargarlo, porque el vacio se arregla en la ficha.
  it('rechaza sin documento de identidad, y dice donde cargarlo', () => {
    const r = puedeEmitir({ ...INACTIVA_COMPLETA, documentoIdentidad: null });
    expect(r.some((x) => x.includes('documento de identidad'))).toBe(true);
    expect(r.some((x) => x.includes('datos base'))).toBe(true);
  });

  // Como validarFirma: quien esta por emitir merece ver todo lo que falta de una vez, no
  // descubrirlo de a uno y volver tres veces a la ficha.
  it('devuelve TODO lo que falta, no el primer error', () => {
    const r = puedeEmitir({ activa: true, correoPersonal: null, documentoIdentidad: null });
    expect(r).toHaveLength(3);
  });

  // P3 · ninguna negativa puede nombrar el token, porque las frases van a la pantalla y al
  // registro. Aca ni siquiera lo reciben.
  it('ninguna frase nombra un token', () => {
    const r = puedeEmitir({ activa: true, correoPersonal: null, documentoIdentidad: null });
    expect(r.join(' ')).not.toMatch(/token/i);
  });
});
