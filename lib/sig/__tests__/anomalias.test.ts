// lib/sig/__tests__/anomalias.test.ts
//
// Los siete cruces de «Lo que nadie está mirando». Lo que se prueba acá es el
// comportamiento que el tablero promete, y hay tres cosas que se pueden romper en silencio:
//
//   1. Contar de más. Un activo dado de baja sin propietario, una organización que no es
//      proveedor, un acceso ya retirado: cada uno infla el número con algo que nadie tiene
//      que resolver, y una lista con ruido deja de leerse.
//   2. Contar de menos. La excepción que venció ayer, el acceso cuya vigencia termina hoy:
//      son los bordes del día, y son los que la familia de defectos de fechas de este
//      proyecto ya erró cinco veces.
//   3. Devolver 0 donde no se pudo medir. Es la regla más fuerte del repositorio: un cero
//      que en realidad era «no sé» convence de que no hay problema justo donde nadie miró.

import {
  accesosVigentesSinSolicitud,
  activosSinPropietario,
  anomaliasDelSistema,
  colaboradoresActivosSinCuenta,
  excepcionesVencidasSinCerrar,
  intentosScormAbandonados,
  proveedoresConActivosSinEvaluacion,
  salidasSinActaDeBorrado,
  totalDeAnomalias,
  type FuentesDeAnomalias,
} from '../anomalias';
import type { ColaboradorBase } from '../colaboradores';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const HOY = d('2026-09-07');

const persona = (id: number, p: Partial<ColaboradorBase> = {}): ColaboradorBase => ({
  id,
  activa: true,
  retiradoEn: null,
  origen: 'DIRECTORIO',
  ...p,
});

describe('activosSinPropietario', () => {
  it('cuenta los activos en uso a los que nadie responde', () => {
    expect(
      activosSinPropietario([
        { activo: true, propietarioId: null },
        { activo: true, propietarioId: 3 },
        { activo: true, propietarioId: null },
      ]),
    ).toBe(2);
  });

  // Un activo dado de baja ya no necesita propietario: exigirlo dejaría en la lista, para
  // siempre, los equipos que la organización ya devolvió.
  it('no cuenta los activos dados de baja', () => {
    expect(
      activosSinPropietario([
        { activo: false, propietarioId: null },
        { activo: false, propietarioId: null },
      ]),
    ).toBe(0);
  });
});

describe('colaboradoresActivosSinCuenta', () => {
  it('cuenta las personas activas cuyo origen es MANUAL', () => {
    expect(
      colaboradoresActivosSinCuenta([
        persona(1, { origen: 'MANUAL' }),
        persona(2),
        persona(3, { origen: 'MANUAL' }),
      ]),
    ).toBe(2);
  });

  // Quien ya se fue no tiene que tener cuenta del Directorio. Contarlo convertiría cada
  // retiro en una anomalía nueva, y la lista crecería sola sin que nada empeorara.
  it('no cuenta a quien ya no está activo', () => {
    expect(
      colaboradoresActivosSinCuenta([
        persona(1, { origen: 'MANUAL', retiradoEn: d('2026-01-15') }),
        persona(2, { origen: 'MANUAL', activa: false }),
      ]),
    ).toBe(0);
  });
});

describe('accesosVigentesSinSolicitud', () => {
  it('cuenta el acceso sin fecha de fin y sin solicitud', () => {
    expect(
      accesosVigentesSinSolicitud([{ hasta: null, solicitudId: null }], HOY),
    ).toBe(1);
  });

  it('no cuenta el acceso que sí tiene solicitud', () => {
    expect(accesosVigentesSinSolicitud([{ hasta: null, solicitudId: 9 }], HOY)).toBe(0);
  });

  // El acceso retirado ya no es un hallazgo: se cerró, que es lo que la revisión pedía.
  it('no cuenta el acceso ya retirado', () => {
    expect(
      accesosVigentesSinSolicitud([{ hasta: d('2026-09-06'), solicitudId: null }], HOY),
    ).toBe(0);
  });

  // El borde del día: el permiso que termina HOY todavía está vigente hoy, igual que el
  // día del plazo todavía está en plazo en `cierre.ts`.
  it('el acceso que termina hoy todavía cuenta como vigente', () => {
    expect(
      accesosVigentesSinSolicitud([{ hasta: d('2026-09-07'), solicitudId: null }], HOY),
    ).toBe(1);
  });

  // La hora no entra: un acceso que termina hoy a las 23:00 leído a las 08:00 no puede dar
  // un resultado distinto del mismo acceso leído a las 18:00.
  it('la hora del día no cambia el resultado', () => {
    const tarde = new Date('2026-09-07T23:30:00.000Z');
    expect(
      accesosVigentesSinSolicitud([{ hasta: d('2026-09-07'), solicitudId: null }], tarde),
    ).toBe(1);
  });
});

describe('excepcionesVencidasSinCerrar', () => {
  it('cuenta la excepción cuyo plazo pasó y sigue abierta', () => {
    expect(
      excepcionesVencidasSinCerrar(
        [{ fechaCierre: d('2026-08-31'), cerradaEn: null }],
        HOY,
      ),
    ).toBe(1);
  });

  it('no cuenta la que se cerró, aunque haya vencido', () => {
    expect(
      excepcionesVencidasSinCerrar(
        [{ fechaCierre: d('2026-08-31'), cerradaEn: d('2026-09-02') }],
        HOY,
      ),
    ).toBe(0);
  });

  // El día del plazo todavía está en plazo: vence al día siguiente, como `esVencida`.
  it('la que vence hoy todavía no está vencida', () => {
    expect(
      excepcionesVencidasSinCerrar(
        [{ fechaCierre: d('2026-09-07'), cerradaEn: null }],
        HOY,
      ),
    ).toBe(0);
  });

  // Cruzar el fin de mes es donde la resta de fechas empaquetadas `YYYYMMDD` daba 70
  // «días». Acá sólo se comparan, y ayer tiene que seguir siendo ayer.
  it('cuenta la vencida ayer aunque el mes haya cambiado', () => {
    expect(
      excepcionesVencidasSinCerrar(
        [{ fechaCierre: d('2026-01-31'), cerradaEn: null }],
        d('2026-02-01'),
      ),
    ).toBe(1);
  });
});

describe('proveedoresConActivosSinEvaluacion', () => {
  const org = (o: Partial<Parameters<typeof proveedoresConActivosSinEvaluacion>[0][number]> = {}) => ({
    esProveedor: true,
    activa: true,
    activosACargo: 3,
    evaluaciones: [],
    ...o,
  });

  it('cuenta el proveedor con activos que nunca se evaluó', () => {
    expect(proveedoresConActivosSinEvaluacion([org()])).toBe(1);
  });

  // Sin activos a cargo la falta de evaluación es un trámite pendiente, no un riesgo. Es
  // el «con activos a cargo» del enunciado, y es lo que hace la fila accionable.
  it('no cuenta al proveedor sin activos a cargo', () => {
    expect(proveedoresConActivosSinEvaluacion([org({ activosACargo: 0 })])).toBe(0);
  });

  it('no cuenta a las organizaciones que no son proveedores', () => {
    expect(proveedoresConActivosSinEvaluacion([org({ esProveedor: false })])).toBe(0);
  });

  it('no cuenta al proveedor inactivo', () => {
    expect(proveedoresConActivosSinEvaluacion([org({ activa: false })])).toBe(0);
  });

  // «Sin evaluación» es NUNCA evaluada. La evaluación caducada tiene su propia alerta en
  // Partes interesadas; colapsarlas escondería a quien nunca entró al proceso detrás de
  // quien sí entró y se dejó vencer.
  it('no cuenta al proveedor con una evaluación vieja: eso es vencida, no sin evaluar', () => {
    expect(
      proveedoresConActivosSinEvaluacion([
        org({ evaluaciones: [{ anio: 2019, fecha: d('2019-04-01'), resultado: 'CUMPLE' }] }),
      ]),
    ).toBe(0);
  });
});

describe('salidasSinActaDeBorrado', () => {
  it('cuenta a quien se retiró y no tiene acta', () => {
    expect(
      salidasSinActaDeBorrado(
        [persona(1, { retiradoEn: d('2026-06-30') }), persona(2, { retiradoEn: d('2026-07-15') })],
        new Set([2]),
      ),
    ).toBe(1);
  });

  // Sólo quien tiene FECHA de retiro. Quien desapareció del Directorio sin que nadie
  // registrara su salida es la otra anomalía: acusarlo de no tener acta señalaría a
  // Tecnología por un dato que Talento Humano no puso.
  it('no cuenta a quien perdió la cuenta sin que se registrara el retiro', () => {
    expect(salidasSinActaDeBorrado([persona(1, { activa: false })], new Set())).toBe(0);
  });
});

describe('intentosScormAbandonados', () => {
  // Un intento abandonado es una capacitación que alguien empezó y el sistema dio por
  // perdida. Si nadie lo mira, la persona queda con la tarea abierta y sin saber por qué.
  it('cuenta los abandonados y no los demás', () => {
    expect(
      intentosScormAbandonados([
        { estado: 'ABANDONADO' },
        { estado: 'ABANDONADO' },
        { estado: 'COMPLETADO' },
        { estado: 'EN_CURSO' },
      ]),
    ).toBe(2);
  });

  it('una lista vacía es cero', () => {
    expect(intentosScormAbandonados([])).toBe(0);
  });
});

describe('anomaliasDelSistema', () => {
  const completas: FuentesDeAnomalias = {
    activos: [{ activo: true, propietarioId: null }],
    personas: [persona(1, { origen: 'MANUAL' }), persona(2, { retiradoEn: d('2026-05-01') })],
    conActaDeBorrado: new Set(),
    accesos: [{ hasta: null, solicitudId: null }],
    excepciones: [{ fechaCierre: d('2026-01-01'), cerradaEn: null }],
    organizaciones: [{ esProveedor: true, activa: true, activosACargo: 2, evaluaciones: [] }],
    intentosScorm: [{ estado: 'ABANDONADO' }],
  };

  it('devuelve siempre los siete cruces, con su ruta y dónde vive cada uno', () => {
    const filas = anomaliasDelSistema(completas, HOY);
    expect(filas).toHaveLength(7);
    expect(filas.map((f) => f.clave)).toEqual([
      'ACTIVO_SIN_PROPIETARIO',
      'COLABORADOR_SIN_CUENTA',
      'ACCESO_SIN_SOLICITUD',
      'EXCEPCION_VENCIDA_ABIERTA',
      'PROVEEDOR_SIN_EVALUACION',
      'SALIDA_SIN_ACTA',
      'INTENTO_SCORM_ABANDONADO',
    ]);
    expect(filas.every((f) => f.ruta.startsWith('/'))).toBe(true);
    expect(filas.every((f) => f.donde.length > 0)).toBe(true);
  });

  it('mide los siete cuando todas las fuentes llegaron', () => {
    const filas = anomaliasDelSistema(completas, HOY);
    expect(filas.map((f) => f.cantidad)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(filas.every((f) => f.porQueNo === null)).toBe(true);
  });

  // Cero es un hecho: se midió y no hay nada. Tiene que distinguirse de «no se midió», que
  // es null, y por eso se prueban los dos por separado.
  it('cero medido no es lo mismo que sin medir', () => {
    const conCeros = anomaliasDelSistema(
      { ...completas, activos: [] },
      HOY,
    );
    const sinFuente = anomaliasDelSistema({ ...completas, activos: null }, HOY);

    const cero = conCeros.find((f) => f.clave === 'ACTIVO_SIN_PROPIETARIO')!;
    expect(cero.cantidad).toBe(0);
    expect(cero.porQueNo).toBeNull();

    const nulo = sinFuente.find((f) => f.clave === 'ACTIVO_SIN_PROPIETARIO')!;
    expect(nulo.cantidad).toBeNull();
    expect(nulo.porQueNo).not.toBeNull();
  });

  // La fila que no se puede medir se muestra igual. Omitirla haría que un tablero de
  // cuatro cruces de siete asegurara que el sistema está mejor de lo que se sabe.
  it('la fila sin medir no desaparece de la lista', () => {
    const filas = anomaliasDelSistema({ ...completas, excepciones: null }, HOY);
    expect(filas).toHaveLength(7);
    expect(filas.find((f) => f.clave === 'EXCEPCION_VENCIDA_ABIERTA')?.cantidad).toBeNull();
  });

  // Las salidas sin acta necesitan las DOS fuentes: con las personas y sin las actas,
  // todo el mundo parecería haber salido sin acta.
  it('sin la lista de actas no se afirma que nadie tiene acta', () => {
    const filas = anomaliasDelSistema({ ...completas, conActaDeBorrado: null }, HOY);
    expect(filas.find((f) => f.clave === 'SALIDA_SIN_ACTA')?.cantidad).toBeNull();
  });

  it('el texto concuerda en número con la cantidad', () => {
    const uno = anomaliasDelSistema(completas, HOY).find(
      (f) => f.clave === 'ACTIVO_SIN_PROPIETARIO',
    )!;
    expect(uno.texto).toBe('activo sin propietario asignado');

    const varios = anomaliasDelSistema(
      {
        ...completas,
        activos: [
          { activo: true, propietarioId: null },
          { activo: true, propietarioId: null },
        ],
      },
      HOY,
    ).find((f) => f.clave === 'ACTIVO_SIN_PROPIETARIO')!;
    expect(varios.texto).toBe('activos sin propietario asignado');
  });
});

describe('totalDeAnomalias', () => {
  it('suma lo medido', () => {
    expect(totalDeAnomalias(anomaliasDelSistema({
      activos: [{ activo: true, propietarioId: null }],
      personas: [],
      conActaDeBorrado: new Set(),
      accesos: [],
      excepciones: [],
      organizaciones: [],
      intentosScorm: [],
    }, HOY))).toEqual({ total: 1, sinMedir: 0 });
  });

  // «7 en total» con dos cruces ciegos no es «7 en total»: el total sólo puede hablar de
  // lo que se midió, y por eso lo que falta se reporta aparte en vez de diluirse.
  it('reporta aparte los cruces que no se pudieron medir', () => {
    const r = totalDeAnomalias(
      anomaliasDelSistema(
        {
          activos: [{ activo: true, propietarioId: null }],
          personas: null,
          conActaDeBorrado: null,
          accesos: null,
          excepciones: [],
          organizaciones: [],
          intentosScorm: [],
        },
        HOY,
      ),
    );
    expect(r.total).toBe(1);
    expect(r.sinMedir).toBe(3);
  });
});
