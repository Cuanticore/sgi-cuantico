// lib/sig/__tests__/cierre.test.ts
//
// R4 el cierre se valida en el servidor; R3 la vencida sigue viva y el extemporáneo se
// deduce de las fechas. Los casos que importan son los que dejarían pasar un cierre
// inválido.

import {
  validarCierre,
  esVencida,
  esExtemporaneo,
  aprobadoDe,
  estadoDeVencimiento,
  diasHasta,
} from '../cierre';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('validarCierre — LECTURA', () => {
  it('exige la versión leída', () => {
    expect(validarCierre({ tipo: 'LECTURA', versionLeida: undefined })).toContain(
      'indique la versión que leyó',
    );
  });

  it('acepta con la versión', () => {
    expect(validarCierre({ tipo: 'LECTURA', versionLeida: 'v3' })).toEqual([]);
  });
});

describe('validarCierre — CAPACITACION', () => {
  it('exige la asistencia', () => {
    expect(validarCierre({ tipo: 'CAPACITACION', asistio: undefined })).toEqual([
      'registre la asistencia',
    ]);
  });

  it('sin evaluación no exige calificación', () => {
    expect(
      validarCierre({ tipo: 'CAPACITACION', asistio: true, exigeEvaluacion: false }),
    ).toEqual([]);
  });

  it('con evaluación exige la calificación', () => {
    expect(
      validarCierre({ tipo: 'CAPACITACION', asistio: true, exigeEvaluacion: true, calificacion: undefined }),
    ).toEqual(['registre la calificación']);
  });
});

describe('validarCierre — VERIFICACION', () => {
  it('exige responder los ítems obligatorios', () => {
    const errores = validarCierre({
      tipo: 'VERIFICACION',
      respuestas: [
        { itemId: 1, obligatorio: true, permiteNoAplica: true, respuesta: undefined },
        { itemId: 2, obligatorio: false, permiteNoAplica: true, respuesta: undefined },
      ],
    });
    expect(errores).toContain('el ítem 1 es obligatorio');
    expect(errores).not.toContain('el ítem 2 es obligatorio');
  });

  it('NO_APLICA solo donde el ítem lo permite', () => {
    const errores = validarCierre({
      tipo: 'VERIFICACION',
      respuestas: [
        { itemId: 1, obligatorio: true, permiteNoAplica: false, respuesta: 'NO_APLICA' },
      ],
    });
    expect(errores).toContain('el ítem 1 no admite "no aplica"');
  });
});

describe('validarCierre — TAREA', () => {
  it('no exige nada más que la nota, que es opcional', () => {
    expect(validarCierre({ tipo: 'TAREA', nota: undefined })).toEqual([]);
  });
});

describe('vencida y extemporáneo (R3)', () => {
  it('vence al día siguiente de la fecha límite, no el mismo día', () => {
    expect(esVencida('PENDIENTE', d('2026-09-11'), d('2026-09-11'))).toBe(false);
    expect(esVencida('PENDIENTE', d('2026-09-11'), d('2026-09-12'))).toBe(true);
  });

  it('una asignación cerrada nunca está vencida', () => {
    expect(esVencida('REALIZADA', d('2026-09-11'), d('2026-12-01'))).toBe(false);
  });

  it('extemporáneo es cerrar después de la fecha límite', () => {
    expect(esExtemporaneo(d('2026-09-12'), d('2026-09-11'))).toBe(true);
    expect(esExtemporaneo(d('2026-09-11'), d('2026-09-11'))).toBe(false);
  });
});

describe('aprobadoDe', () => {
  it('aprueba con la nota mínima o más', () => {
    expect(aprobadoDe(80, 80)).toBe(true);
    expect(aprobadoDe(79.9, 80)).toBe(false);
  });
});
// El umbral de «por vencer» estaba escrito dos veces y el calendario no lo aplicaba:
// tenia el color en la leyenda y nunca lo pintaba. Estas pruebas fijan los bordes, que es
// donde un umbral se rompe.
describe('estadoDeVencimiento', () => {
  const limite = new Date('2026-09-15T00:00:00.000Z');

  it('el mismo dia de la fecha limite sigue POR_VENCER, no vencida', () => {
    expect(estadoDeVencimiento('PENDIENTE', limite, new Date('2026-09-15T23:59:00.000Z'))).toBe(
      'POR_VENCER',
    );
  });

  it('al dia siguiente es VENCIDA', () => {
    expect(estadoDeVencimiento('PENDIENTE', limite, new Date('2026-09-16T00:01:00.000Z'))).toBe(
      'VENCIDA',
    );
  });

  it('a exactamente siete dias es POR_VENCER, a ocho es PENDIENTE', () => {
    expect(estadoDeVencimiento('PENDIENTE', limite, new Date('2026-09-08T10:00:00.000Z'))).toBe(
      'POR_VENCER',
    );
    expect(estadoDeVencimiento('PENDIENTE', limite, new Date('2026-09-07T10:00:00.000Z'))).toBe(
      'PENDIENTE',
    );
  });

  it('lo que no esta pendiente no vence', () => {
    for (const estado of ['REALIZADA', 'NO_APLICA', 'ANULADA']) {
      expect(estadoDeVencimiento(estado, limite, new Date('2026-12-01T00:00:00.000Z'))).toBe(
        'REALIZADA',
      );
    }
  });
});

describe('diasHasta', () => {
  // El error que casi se fue: restar el entero empaquetado YYYYMMDD daria 100 dias entre
  // el 31 de enero y el 1 de febrero.
  it('cruza el fin de mes contando dias, no digitos', () => {
    expect(
      diasHasta(new Date('2026-02-01T00:00:00.000Z'), new Date('2026-01-31T00:00:00.000Z')),
    ).toBe(1);
  });

  it('cruza el fin de ano', () => {
    expect(
      diasHasta(new Date('2027-01-01T00:00:00.000Z'), new Date('2026-12-30T00:00:00.000Z')),
    ).toBe(2);
  });

  it('ignora la hora', () => {
    expect(
      diasHasta(new Date('2026-09-15T01:00:00.000Z'), new Date('2026-09-15T23:00:00.000Z')),
    ).toBe(0);
  });

  it('es negativo si ya paso', () => {
    expect(
      diasHasta(new Date('2026-09-10T00:00:00.000Z'), new Date('2026-09-15T00:00:00.000Z')),
    ).toBe(-5);
  });
});
