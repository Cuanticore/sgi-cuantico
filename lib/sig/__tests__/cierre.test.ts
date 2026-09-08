// lib/sig/__tests__/cierre.test.ts
//
// R4 el cierre se valida en el servidor; R3 la vencida sigue viva y el extemporáneo se
// deduce de las fechas. Los casos que importan son los que dejarían pasar un cierre
// inválido.

import {
  validarCierre,
  cierraLaAsignacion,
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

  it('reprobar es un cierre VÁLIDO: el intento se registra, no se rechaza', () => {
    // La distinción es el punto. Si `validarCierre` lo rechazara, el intento fallido no se
    // guardaría en ningún lado y la regla exige lo contrario: «queda registrado con su
    // nota; no se borra ni se sobrescribe».
    expect(
      validarCierre({
        tipo: 'CAPACITACION',
        asistio: true,
        exigeEvaluacion: true,
        calificacion: 60,
        notaMinima: 80,
      }),
    ).toEqual([]);
  });
});

describe('cierraLaAsignacion — la nota mínima decide si cierra', () => {
  const capacitacion = (calificacion: number | null, notaMinima: number | null = 80) => ({
    tipo: 'CAPACITACION' as const,
    asistio: true,
    exigeEvaluacion: true,
    calificacion,
    notaMinima,
  });

  it('reprobar NO cierra la asignación: se repite la evaluación', () => {
    expect(cierraLaAsignacion(capacitacion(60))).toBe(false);
  });

  it('justo en la nota mínima cierra: el criterio es ≥, no >', () => {
    expect(cierraLaAsignacion(capacitacion(80))).toBe(true);
  });

  it('aprobar por encima cierra', () => {
    expect(cierraLaAsignacion(capacitacion(95))).toBe(true);
  });

  it('sin nota mínima declarada no hay nada que reprobar', () => {
    expect(cierraLaAsignacion(capacitacion(10, null))).toBe(true);
  });

  it('sin evaluación exigida cierra aunque no haya nota', () => {
    expect(
      cierraLaAsignacion({ tipo: 'CAPACITACION', asistio: true, exigeEvaluacion: false }),
    ).toBe(true);
  });

  it('no haber asistido no se juzga por nota', () => {
    expect(
      cierraLaAsignacion({ tipo: 'CAPACITACION', asistio: false, exigeEvaluacion: true, notaMinima: 80 }),
    ).toBe(true);
  });

  it('los otros tipos no tienen nota que alcanzar', () => {
    expect(cierraLaAsignacion({ tipo: 'LECTURA', versionLeida: 'v2' })).toBe(true);
    expect(cierraLaAsignacion({ tipo: 'VERIFICACION', respuestas: [] })).toBe(true);
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

// El bug que se encontro en app/sig/acciones/envios.ts: el aviso de proximidad comparaba
// `diaDe(limite) - diaDe(hoy) === 7`, con diaDe devolviendo el entero empaquetado
// YYYYMMDD. Dentro de un mes funcionaba de casualidad; cruzando el fin de mes daba 76.
// Doce ventanas al ano en las que nadie recibia el recordatorio.
describe('diasHasta · la ventana de siete dias que cruza el fin de mes', () => {
  const casos: [string, string, string][] = [
    ['dentro del mismo mes', '2026-09-10', '2026-09-03'],
    ['cruzando agosto a septiembre', '2026-09-03', '2026-08-27'],
    ['cruzando febrero a marzo', '2026-03-03', '2026-02-24'],
    ['cruzando diciembre a enero', '2027-01-04', '2026-12-28'],
  ];

  for (const [nombre, limite, hoy] of casos) {
    it(`son 7 dias ${nombre}`, () => {
      expect(diasHasta(new Date(`${limite}T00:00:00.000Z`), new Date(`${hoy}T12:00:00.000Z`))).toBe(7);
    });
  }

  // La resta empaquetada daba 76 en el segundo caso: la prueba que fija el defecto.
  it('la resta del entero empaquetado YYYYMMDD daria 76, no 7', () => {
    const empaquetado = (f: Date) =>
      f.getUTCFullYear() * 10000 + (f.getUTCMonth() + 1) * 100 + f.getUTCDate();
    const limite = new Date('2026-09-03T00:00:00.000Z');
    const hoy = new Date('2026-08-27T00:00:00.000Z');
    expect(empaquetado(limite) - empaquetado(hoy)).toBe(76);
    expect(diasHasta(limite, hoy)).toBe(7);
  });
});

// ─── R4 · el ítem obligatorio sin responder ────────────────────────────────────────────
//
// La regla existía y NO PODÍA DISPARARSE. `app/sig/acciones/tareas.ts` armaba el conjunto a
// validar con las respuestas QUE LLEGARON, y el cliente sólo envía las respondidas: un ítem
// obligatorio en blanco no estaba en el arreglo, así que el `for` nunca lo veía. Una
// verificación se cerraba con todos sus obligatorios vacíos y el servidor la aceptaba.
//
// Estas pruebas fijan la forma correcta del conjunto —UNA entrada por ÍTEM, con la
// respuesta ausente cuando no hubo— porque es lo que hace real a la regla. Probar sólo
// `validarCierre` con entradas ya rellenas era probar el camino que nunca fallaba.
describe('validarCierre · VERIFICACION con ítems sin responder', () => {
  const item = (itemId: number, numero: number, extra = {}) => ({
    itemId,
    numero,
    obligatorio: true,
    permiteNoAplica: false,
    respuesta: undefined,
    ...extra,
  });

  it('un obligatorio sin responder NO deja cerrar', () => {
    const errores = validarCierre({ tipo: 'VERIFICACION', respuestas: [item(47, 3)] });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('obligatorio');
  });

  // El mensaje señala el NÚMERO que la pantalla muestra, no el id de la base. «El ítem 47»
  // no le sirve a quien está mirando ocho ítems numerados del 01 al 08.
  it('el mensaje nombra el número de pantalla, no el id', () => {
    const errores = validarCierre({ tipo: 'VERIFICACION', respuestas: [item(47, 3)] });
    expect(errores[0]).toContain('03');
    expect(errores[0]).not.toContain('47');
  });

  it('sin número cae al id, en vez de quedarse sin señalar nada', () => {
    const errores = validarCierre({
      tipo: 'VERIFICACION',
      respuestas: [{ itemId: 47, obligatorio: true, permiteNoAplica: false, respuesta: undefined }],
    });
    expect(errores[0]).toContain('47');
  });

  it('un NO obligatorio sin responder sí deja cerrar', () => {
    const errores = validarCierre({
      tipo: 'VERIFICACION',
      respuestas: [item(47, 3, { obligatorio: false })],
    });
    expect(errores).toEqual([]);
  });

  it('nombra TODOS los obligatorios que faltan, no sólo el primero', () => {
    const errores = validarCierre({
      tipo: 'VERIFICACION',
      respuestas: [item(10, 1), item(20, 2, { respuesta: 'CUMPLE' }), item(30, 3)],
    });
    expect(errores).toHaveLength(2);
    expect(errores.join(' ')).toContain('01');
    expect(errores.join(' ')).toContain('03');
  });

  it('respondidos todos los obligatorios, cierra', () => {
    const errores = validarCierre({
      tipo: 'VERIFICACION',
      respuestas: [
        item(10, 1, { respuesta: 'CUMPLE' }),
        item(20, 2, { respuesta: 'NO_CUMPLE' }),
        item(30, 3, { obligatorio: false }),
      ],
    });
    expect(errores).toEqual([]);
  });

  // La otra rama del mismo `for`: «no aplica» donde el ítem no lo admite.
  it('«no aplica» en un ítem que no lo admite se rechaza, con su número', () => {
    const errores = validarCierre({
      tipo: 'VERIFICACION',
      respuestas: [item(47, 5, { respuesta: 'NO_APLICA' })],
    });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('05');
    expect(errores[0]).toContain('no aplica');
  });
});
