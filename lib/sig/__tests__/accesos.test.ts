// lib/sig/__tests__/accesos.test.ts
//
// REQ-SIG-07 §3.5 y §3.6. Lo que se prueba aca es la consulta que la matriz del consultor
// NO podia responder: «quien tenia acceso al CRM el 31 de diciembre».
//
// En una matriz con una columna por empleado, dar un acceso altera la estructura de la
// tabla y quitarlo borra la celda. El pasado no existe. Con una fila por relacion y dos
// fechas, existe — y estas pruebas son las que fijan que siga existiendo.

import {
  accesosALaFecha,
  accesosSinSustento,
  codigoSolicitud,
  estadoDeSolicitud,
  personasConAccesoVigente,
  puedeAutorizar,
  temporalesVencidos,
  vigenteEn,
  type AccesoConVigencia,
} from '../accesos';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const a = (
  id: number,
  desde: string,
  hasta: string | null,
  over: Partial<AccesoConVigencia> = {},
): AccesoConVigencia => ({
  id,
  personaId: id,
  perfilId: 1,
  desde: d(desde),
  hasta: hasta === null ? null : d(hasta),
  solicitudId: 100,
  ...over,
});

describe('estadoDeSolicitud · el estado no se almacena', () => {
  it('sin marcas esta por autorizar', () => {
    expect(estadoDeSolicitud({ rechazada: false, fechaAutorizacion: null, fechaEjecucion: null })).toBe(
      'POR_AUTORIZAR',
    );
  });

  it('con autorizacion y sin ejecucion, autorizada', () => {
    expect(
      estadoDeSolicitud({ rechazada: false, fechaAutorizacion: d('2026-01-01'), fechaEjecucion: null }),
    ).toBe('AUTORIZADA');
  });

  it('con ejecucion, ejecutada', () => {
    expect(
      estadoDeSolicitud({
        rechazada: false,
        fechaAutorizacion: d('2026-01-01'),
        fechaEjecucion: d('2026-01-02'),
      }),
    ).toBe('EJECUTADA');
  });

  // El rechazo manda sobre todo. Una rechazada que ADEMAS tenga fecha de ejecucion es un
  // defecto de datos, y mostrarla como «ejecutada» lo esconde justo donde mas importa: una
  // solicitud rechazada que se ejecuto igual es el hallazgo, no un detalle de presentacion.
  it('el rechazo manda sobre la ejecucion', () => {
    expect(
      estadoDeSolicitud({ rechazada: true, fechaAutorizacion: null, fechaEjecucion: d('2026-01-02') }),
    ).toBe('RECHAZADA');
  });
});

describe('puedeAutorizar · O11 separacion de funciones', () => {
  const base = { solicitanteId: 7, esEmergencia: false, rechazada: false, fechaAutorizacion: null };

  it('otra persona si puede', () => {
    expect(puedeAutorizar(base, 9)).toEqual({ puede: true });
  });

  // «Quien autoriza no puede ser quien pide.» Es el control, y sin el la separacion de
  // funciones es un parrafo del procedimiento y nada mas.
  it('quien pide NO puede autorizar lo suyo', () => {
    const r = puedeAutorizar(base, 7);
    expect(r.puede).toBe(false);
    // El motivo se devuelve, no un booleano: «no podes autorizar» sin decir por que manda
    // a alguien a adivinar, y a menudo a marcar emergencia sin serlo.
    expect(r.puede === false && r.motivo).toContain('quien autoriza no puede ser quien pide');
  });

  // La UNICA excepcion, y se registra en vez de esconderse: un cambio de emergencia se
  // autoriza y ejecuta de inmediato para contener un incidente, y se documenta despues.
  it('la emergencia es la unica excepcion', () => {
    expect(puedeAutorizar({ ...base, esEmergencia: true }, 7)).toEqual({ puede: true });
  });

  it('una rechazada no se autoriza', () => {
    expect(puedeAutorizar({ ...base, rechazada: true }, 9).puede).toBe(false);
  });

  it('una ya autorizada no se autoriza dos veces', () => {
    expect(puedeAutorizar({ ...base, fechaAutorizacion: d('2026-01-01') }, 9).puede).toBe(false);
  });
});

describe('vigenteEn · la consulta a una fecha', () => {
  it('vigente dentro del rango', () => {
    expect(vigenteEn(a(1, '2026-01-01', '2026-12-31'), d('2026-06-15'))).toBe(true);
  });

  it('no vigente antes de empezar', () => {
    expect(vigenteEn(a(1, '2026-06-01', null), d('2026-01-01'))).toBe(false);
  });

  // `hasta` nulo significa VIGENTE. No hay columna «vigente» que pueda quedar desfasada.
  it('sin fecha de fin sigue vigente', () => {
    expect(vigenteEn(a(1, '2020-01-01', null), d('2026-06-15'))).toBe(true);
  });

  // El dia `hasta` TODAVIA cuenta: se retira al terminar ese dia, y ese dia se pudo usar.
  // Mismo criterio que el retiro de una persona.
  it('el dia del retiro el acceso todavia estaba', () => {
    expect(vigenteEn(a(1, '2026-01-01', '2026-12-31'), d('2026-12-31'))).toBe(true);
    expect(vigenteEn(a(1, '2026-01-01', '2026-12-31'), d('2027-01-01'))).toBe(false);
  });

  // El dia en que empieza tambien cuenta.
  it('el dia del alta ya estaba', () => {
    expect(vigenteEn(a(1, '2026-06-01', null), d('2026-06-01'))).toBe(true);
  });
});

describe('accesosALaFecha', () => {
  const accesos = [
    a(1, '2025-01-01', null),
    a(2, '2025-01-01', '2025-06-30'),
    a(3, '2026-03-01', null),
  ];

  // LA PREGUNTA DEL AUDITOR: «quien tenia acceso el 31 de diciembre». Con una matriz de
  // columnas sobrescritas, la respuesta hoy seria la de hoy.
  it('responde quien tenia acceso ese dia, no hoy', () => {
    const r = accesosALaFecha(accesos, d('2025-12-31'));
    // La 1 seguia vigente; la 2 se cerro en junio; la 3 todavia no empezaba.
    expect(r.map((x) => x.id)).toEqual([1]);
  });

  it('a otra fecha, otra respuesta', () => {
    expect(accesosALaFecha(accesos, d('2025-03-01')).map((x) => x.id)).toEqual([1, 2]);
    expect(accesosALaFecha(accesos, d('2026-06-01')).map((x) => x.id)).toEqual([1, 3]);
  });
});

describe('accesosSinSustento · O13', () => {
  it('los vigentes sin solicitud son hallazgo', () => {
    const r = accesosSinSustento(
      [a(1, '2025-01-01', null, { solicitudId: null }), a(2, '2025-01-01', null)],
      d('2026-06-01'),
    );
    expect(r.map((x) => x.id)).toEqual([1]);
  });

  // Uno ya cerrado sin sustento es historia: acusarlo hoy no cambia nada. Lo que importa es
  // lo que sigue abierto, que es lo que la revision trimestral tiene que explicar o retirar.
  it('uno ya cerrado sin sustento NO se acusa', () => {
    const r = accesosSinSustento([a(1, '2025-01-01', '2025-06-30', { solicitudId: null })], d('2026-06-01'));
    expect(r).toEqual([]);
  });
});

describe('temporalesVencidos · O14', () => {
  it('los que pasaron su fecha y siguen abiertos', () => {
    const r = temporalesVencidos([a(1, '2026-01-01', '2026-03-31'), a(2, '2026-01-01', null)], d('2026-06-01'));
    expect(r.map((x) => x.id)).toEqual([1]);
  });

  // Uno sin `hasta` es PERMANENTE por diseño; uno con `hasta` en el pasado se paso. No son
  // lo mismo, y cerrar el primero por error retiraria un acceso que nadie pidio retirar.
  it('un acceso permanente nunca esta vencido', () => {
    expect(temporalesVencidos([a(1, '2020-01-01', null)], d('2026-06-01'))).toEqual([]);
  });

  it('el dia del vencimiento todavia no esta vencido', () => {
    expect(temporalesVencidos([a(1, '2026-01-01', '2026-06-01')], d('2026-06-01'))).toEqual([]);
  });
});

describe('personasConAccesoVigente', () => {
  // Es lo que la lista de Colaboradores necesita para dos de sus cuatro anomalias, que
  // hasta ahora salian en gris porque este modulo no existia.
  it('devuelve los ids con al menos un acceso vigente', () => {
    const r = personasConAccesoVigente(
      [
        a(1, '2025-01-01', null),
        a(2, '2025-01-01', '2025-06-30'),
        { ...a(3, '2025-01-01', null), personaId: 1 },
      ],
      d('2026-06-01'),
    );
    expect([...r].sort()).toEqual([1]);
  });
});

describe('codigoSolicitud', () => {
  it('lleva el año y cuatro digitos', () => {
    expect(codigoSolicitud(2026, 88)).toBe('SOL-2026-0088');
  });
});
