// lib/sig/__tests__/cierre.test.ts
//
// R4 el cierre se valida en el servidor; R3 la vencida sigue viva y el extemporáneo se
// deduce de las fechas. Los casos que importan son los que dejarían pasar un cierre
// inválido.

import { validarCierre, esVencida, esExtemporaneo, aprobadoDe } from '../cierre';

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