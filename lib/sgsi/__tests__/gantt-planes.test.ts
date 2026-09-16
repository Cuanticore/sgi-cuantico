// lib/sgsi/__tests__/gantt-planes.test.ts
//
// Lo que se prueba acá es lo que el tablero AFIRMA sobre cada plan: si va a llegar, si ya se
// pasó, y qué hace con uno al que le falta la fecha. Dibujar barras no se prueba; decidir el
// color sí.
//
// HOY llega por argumento en todas las pruebas, así que ninguna caduca sola.

import {
  armarLinea,
  estadoDeLinea,
  HOLGURA_DESVIO,
  posicionDeHoy,
  aMilis,
  type PlanDeLinea,
} from '../gantt-planes';

const HOY = new Date(Date.UTC(2026, 8, 16)); // 16/09/2026
const hoyMs = Date.UTC(2026, 8, 16);

function plan(p: Partial<PlanDeLinea> & { codigo: string }): PlanDeLinea {
  return {
    accion: `Acción de ${p.codigo}`,
    tipo: 'MITIGAR',
    responsable: 'Jefe de Tecnología',
    fechaAprobacion: '2026-09-01',
    fechaObjetivo: '2026-10-01',
    fechaCierre: null,
    estado: 'EN_EJECUCION',
    avance: 50,
    control: 'A.8.14',
    ...p,
  };
}

describe('aMilis', () => {
  it('lee la fecha como UTC, no como local', () => {
    // `new Date('2026-09-16')` es UTC pero `new Date('2026-9-16')` es local. Una fecha que se
    // corre un día según cómo venga escrita convierte un plan que vence hoy en uno vencido
    // ayer — y eso es la diferencia entre un tablero verde y uno rojo.
    expect(aMilis('2026-09-16')).toBe(Date.UTC(2026, 8, 16));
  });

  it('una fecha ilegible es null y no una fecha inventada', () => {
    expect(aMilis(null)).toBeNull();
    expect(aMilis('pendiente')).toBeNull();
  });
});

describe('estadoDeLinea', () => {
  it('pasada la fecha objetivo y sin cerrar, VENCIDO', () => {
    expect(estadoDeLinea(plan({ codigo: 'P1', fechaObjetivo: '2026-09-15' }), hoyMs).estado).toBe(
      'VENCIDO',
    );
  });

  it('CERRADO gana sobre VENCIDO', () => {
    // Un plan que se cerró tarde ya no es una deuda abierta: es historia. Dejarlo en rojo
    // compitiendo por atención con lo que sí está pendiente es lo que hace que un tablero
    // deje de servir.
    const p = plan({ codigo: 'P1', fechaObjetivo: '2026-08-01', fechaCierre: '2026-08-20' });
    expect(estadoDeLinea(p, hoyMs).estado).toBe('CERRADO');
  });

  it('el avance por detrás del tiempo consumido es EN_RIESGO aunque falte plazo', () => {
    // La lectura que un Gantt normal no da. Al 10 % con la mitad del plazo gastado, la fecha
    // todavía no llegó y el plan ya está en problemas.
    const p = plan({ codigo: 'P1', avance: 10, fechaAprobacion: '2026-09-01', fechaObjetivo: '2026-10-01' });
    const r = estadoDeLinea(p, hoyMs);
    expect(r.estado).toBe('EN_RIESGO');
    expect(r.desvio).toBeLessThan(0);
  });

  it('el avance que acompaña al plazo es EN_PLAZO', () => {
    const p = plan({ codigo: 'P1', avance: 50, fechaAprobacion: '2026-09-01', fechaObjetivo: '2026-10-01' });
    expect(estadoDeLinea(p, hoyMs).estado).toBe('EN_PLAZO');
  });

  it('un desvío pequeño NO enciende la alarma', () => {
    // Con holgura cero, cualquier plan cuyo avance se registre en saltos pasaría a rojo cada
    // vez que el calendario avanza un día entre dos registros. Un tablero que siempre alarma
    // es uno que se deja de mirar.
    const consumido = 50; // la mitad del plazo 01/09 → 01/10
    const p = plan({ codigo: 'P1', avance: consumido - (HOLGURA_DESVIO - 1) });
    expect(estadoDeLinea(p, hoyMs).estado).toBe('EN_PLAZO');
  });

  it('un plan que todavía no arranca no cuenta como retrasado', () => {
    // Antes de empezar, no ir avanzando no es un retraso. Marcarlo en rojo llenaría el
    // tablero de alarmas falsas el día que se aprueban diez planes con inicio futuro.
    const p = plan({ codigo: 'P1', avance: 0, fechaAprobacion: '2026-11-01', fechaObjetivo: '2026-12-01' });
    const r = estadoDeLinea(p, hoyMs);
    expect(r.estado).toBe('NO_INICIADO');
    expect(r.desvio).toBeNull();
  });

  it('sin fecha objetivo no se le inventa una', () => {
    expect(estadoDeLinea(plan({ codigo: 'P1', fechaObjetivo: null }), hoyMs).estado).toBe(
      'NO_INICIADO',
    );
  });
});

describe('armarLinea', () => {
  it('los que no se pueden dibujar se cuentan aparte y la suma cuadra', () => {
    // Un plan invisible en un tablero de seguimiento es un plan que nadie va a reclamar.
    const l = armarLinea(
      [plan({ codigo: 'P1' }), plan({ codigo: 'P2', fechaObjetivo: null })],
      HOY,
    );
    expect(l.barras).toHaveLength(1);
    expect(l.sinFecha.map((p) => p.codigo)).toEqual(['P2']);
    expect(l.barras.length + l.sinFecha.length).toBe(l.resumen.total);
    expect(l.resumen.sinFechaObjetivo).toBe(1);
  });

  it('ordena por urgencia, no por fecha', () => {
    // Un Gantt ordenado por fecha esconde lo vencido en medio de la lista justamente cuando
    // es lo único que hay que mirar.
    const l = armarLinea(
      [
        plan({ codigo: 'AL_DIA', fechaObjetivo: '2026-10-01', avance: 50 }),
        plan({ codigo: 'CERRADO', fechaObjetivo: '2026-09-20', fechaCierre: '2026-09-10' }),
        plan({ codigo: 'VENCIDO', fechaObjetivo: '2026-09-01', avance: 20 }),
        plan({ codigo: 'RIESGO', fechaObjetivo: '2026-10-01', avance: 5 }),
      ],
      HOY,
    );
    expect(l.barras.map((b) => b.plan.codigo)).toEqual([
      'VENCIDO',
      'RIESGO',
      'AL_DIA',
      'CERRADO',
    ]);
  });

  it('la ventana siempre incluye HOY', () => {
    // Un Gantt donde la línea de hoy cae fuera del lienzo no deja ver si algo está por
    // vencer, que es para lo que se abre.
    const l = armarLinea(
      [plan({ codigo: 'P1', fechaAprobacion: '2025-01-01', fechaObjetivo: '2025-03-01' })],
      HOY,
    );
    const p = posicionDeHoy(l, HOY);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
    expect(aMilis(l.hasta)!).toBeGreaterThanOrEqual(Date.UTC(2026, 8, 16));
  });

  it('un plan de un solo día tiene barra visible', () => {
    const l = armarLinea(
      [plan({ codigo: 'P1', fechaAprobacion: '2026-09-20', fechaObjetivo: '2026-09-20' })],
      HOY,
    );
    expect(l.barras[0].ancho).toBeGreaterThan(0);
  });

  it('las barras caen dentro del lienzo', () => {
    const l = armarLinea(
      [
        plan({ codigo: 'P1', fechaAprobacion: '2026-01-01', fechaObjetivo: '2026-12-31' }),
        plan({ codigo: 'P2', fechaAprobacion: null, fechaObjetivo: '2026-09-30' }),
      ],
      HOY,
    );
    for (const b of l.barras) {
      expect(b.inicio).toBeGreaterThanOrEqual(0);
      expect(b.inicio + b.ancho).toBeLessThanOrEqual(1.0001);
    }
  });

  it('el avance promedio ignora a los cerrados', () => {
    // Incluirlos —todos al 100 %— haría subir la cifra justamente cuando se cierra algo, que
    // es cuando menos informa sobre lo que queda por hacer.
    const l = armarLinea(
      [
        plan({ codigo: 'A', avance: 20 }),
        plan({ codigo: 'B', avance: 40 }),
        plan({ codigo: 'C', avance: 100, fechaCierre: '2026-09-01' }),
      ],
      HOY,
    );
    expect(l.resumen.avancePromedioAbiertos).toBe(30);
  });

  it('sin planes abiertos el promedio no explota', () => {
    const l = armarLinea([plan({ codigo: 'C', avance: 100, fechaCierre: '2026-09-01' })], HOY);
    expect(l.resumen.avancePromedioAbiertos).toBe(0);
    expect(Number.isNaN(l.resumen.avancePromedioAbiertos)).toBe(false);
  });

  it('sin ningún plan no revienta ni inventa una ventana absurda', () => {
    const l = armarLinea([], HOY);
    expect(l.barras).toEqual([]);
    expect(l.resumen.total).toBe(0);
    expect(aMilis(l.desde)).not.toBeNull();
    expect(aMilis(l.hasta)!).toBeGreaterThan(aMilis(l.desde)!);
  });

  it('las marcas de mes caen dentro del lienzo y están en orden', () => {
    const l = armarLinea(
      [plan({ codigo: 'P1', fechaAprobacion: '2026-06-01', fechaObjetivo: '2026-12-01' })],
      HOY,
    );
    expect(l.meses.length).toBeGreaterThan(3);
    for (const m of l.meses) {
      expect(m.posicion).toBeGreaterThanOrEqual(0);
      expect(m.posicion).toBeLessThanOrEqual(1);
    }
    const posiciones = l.meses.map((m) => m.posicion);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });
});
