// lib/sig/__tests__/pertenencias.test.ts
//
// **P3 · el desglose por origen, y por qué es obligatorio y no un adorno.**
//
// «El cargo arrastra los activos.» Una persona a la que se le pone un cargo que es
// propietario de 40 activos, con una obligación anual de revisión por tipo de activo, recibe
// 40 asignaciones. Un número pelado de «40» sin decir de dónde sale hace que alguien lo lea
// como un error y **no guarde**.
//
// La propiedad que estas pruebas fijan es la que hace que el número no pueda mentir: el
// desglose es una **proyección del plan**, no una segunda cuenta. La suma de sus renglones es
// exactamente `plan.crear.length`, así que el «se le asignarán 47 tareas» y el `count(*)`
// posterior no pueden divergir — que es el criterio 8 del §11.

import {
  desglosarPorOrigen,
  frasesDelDesglose,
  totalDelDesglose,
  type ObligacionDelDesglose,
} from '../pertenencias';
import type { AsignacionACrear } from '../generacion';

function asignacion(obligacionId: number, activoId: number | null = null): AsignacionACrear {
  return {
    obligacionId,
    contenidoId: 10,
    personaId: 1,
    periodo: '2026-09',
    fechaApertura: new Date('2026-09-01T00:00:00.000Z'),
    fechaLimite: new Date('2026-09-16T00:00:00.000Z'),
    activoId,
  };
}

const OBLIGACIONES: ObligacionDelDesglose[] = [
  { id: 1, alcance: 'AREA', destino: 'Tecnología' },
  { id: 2, alcance: 'CARGO', destino: 'Coordinador de Infraestructura' },
  { id: 3, alcance: 'TIPO_ACTIVO', destino: 'Equipamiento informático' },
  { id: 4, alcance: 'GRUPO_INTERES', destino: 'Desarrolladores' },
  { id: 5, alcance: 'TODOS', destino: null },
];

describe('la suma del desglose es el plan completo', () => {
  // Es la propiedad que sostiene el criterio 8: el número informado ES el número creado.
  it('ningún renglón se pierde y ninguno se cuenta dos veces', () => {
    const crear = [
      ...Array.from({ length: 6 }, () => asignacion(1)),
      asignacion(2),
      ...Array.from({ length: 40 }, (_, i) => asignacion(3, 100 + i)),
    ];
    const desglose = desglosarPorOrigen(crear, OBLIGACIONES);
    const suma = desglose.reduce((t, d) => t + d.cuantas, 0);
    expect(suma).toBe(crear.length);
    expect(suma).toBe(47);
  });

  it('un plan vacío no produce renglones', () => {
    expect(desglosarPorOrigen([], OBLIGACIONES)).toEqual([]);
  });
});

describe('cada origen en su renglón', () => {
  it('reparte área, cargo y los activos del cargo', () => {
    const crear = [
      ...Array.from({ length: 6 }, () => asignacion(1)),
      asignacion(2),
      ...Array.from({ length: 40 }, (_, i) => asignacion(3, 100 + i)),
    ];
    const desglose = desglosarPorOrigen(crear, OBLIGACIONES);
    expect(desglose).toEqual([
      { origen: 'ACTIVOS_DEL_CARGO', cuantas: 40, destino: 'Equipamiento informático' },
      { origen: 'AREA', cuantas: 6, destino: 'Tecnología' },
      { origen: 'CARGO', cuantas: 1, destino: 'Coordinador de Infraestructura' },
    ]);
  });

  // De mayor a menor: el renglón que explica el número grande va primero, porque es el que
  // alguien necesita leer para no confundir 47 con un error.
  it('ordena de mayor a menor', () => {
    const crear = [asignacion(1), asignacion(2), asignacion(2), asignacion(3, 100)];
    const cuantas = desglosarPorOrigen(crear, OBLIGACIONES).map((d) => d.cuantas);
    expect(cuantas).toEqual([...cuantas].sort((a, b) => b - a));
  });

  it('el grupo de interés tiene su propio renglón', () => {
    const crear = [asignacion(4), asignacion(4)];
    expect(desglosarPorOrigen(crear, OBLIGACIONES)).toEqual([
      { origen: 'GRUPO_INTERES', cuantas: 2, destino: 'Desarrolladores' },
    ]);
  });

  // `TODOS` y `PERSONA` no vienen de la pertenencia que se acaba de guardar: se habrían
  // generado igual. Pero **se cuentan**, porque la transacción las crea y el número tiene que
  // cuadrar con el `count(*)`. Van en su propio renglón para que quede claro que no son
  // consecuencia del cambio.
  it('lo que no viene de la pertenencia va aparte y se cuenta igual', () => {
    const crear = [asignacion(1), asignacion(5), asignacion(5)];
    const desglose = desglosarPorOrigen(crear, OBLIGACIONES);
    expect(desglose).toEqual([
      { origen: 'OTRO', cuantas: 2, destino: null },
      { origen: 'AREA', cuantas: 1, destino: 'Tecnología' },
    ]);
    expect(desglose.reduce((t, d) => t + d.cuantas, 0)).toBe(3);
  });
});

describe('cuando el plan trae una obligación que no está en la lista', () => {
  // No se inventa un origen ni se descarta la asignación: descartarla rompería la suma, que
  // es la única propiedad que hace confiable el número.
  it('cae en OTRO y la suma sigue cuadrando', () => {
    const crear = [asignacion(1), asignacion(999)];
    const desglose = desglosarPorOrigen(crear, OBLIGACIONES);
    expect(desglose.reduce((t, d) => t + d.cuantas, 0)).toBe(2);
    expect(desglose.some((d) => d.origen === 'OTRO' && d.cuantas === 1)).toBe(true);
  });

  it('una asignación sin obligación —de contenido directo— también', () => {
    const suelta: AsignacionACrear = { ...asignacion(1), obligacionId: null };
    const desglose = desglosarPorOrigen([suelta], OBLIGACIONES);
    expect(desglose).toEqual([{ origen: 'OTRO', cuantas: 1, destino: null }]);
  });
});

describe('las frases que la pantalla muestra', () => {
  it('arma el texto de P3 con el número y su origen', () => {
    const crear = [
      ...Array.from({ length: 6 }, () => asignacion(1)),
      asignacion(2),
      ...Array.from({ length: 40 }, (_, i) => asignacion(3, 100 + i)),
    ];
    const frases = frasesDelDesglose(desglosarPorOrigen(crear, OBLIGACIONES));
    expect(frases).toEqual([
      '40 por los activos cuyo propietario es ese cargo (Equipamiento informático)',
      '6 por el área Tecnología',
      '1 por el cargo Coordinador de Infraestructura',
    ]);
  });

  it('el singular no dice «1 tareas»', () => {
    const frases = frasesDelDesglose(desglosarPorOrigen([asignacion(1)], OBLIGACIONES));
    expect(frases).toEqual(['1 por el área Tecnología']);
  });

  it('sin destino no deja el nombre en blanco', () => {
    const frases = frasesDelDesglose(desglosarPorOrigen([asignacion(5)], OBLIGACIONES));
    expect(frases).toEqual(['1 que no dependen de esta pertenencia']);
  });
});

describe('el titular del mensaje', () => {
  it('dice cuántas en total', () => {
    const crear = [asignacion(1), asignacion(2)];
    const desglose = desglosarPorOrigen(crear, OBLIGACIONES);
    expect(totalDelDesglose(desglose)).toBe(2);
  });

  it('cero es un resultado legítimo y se puede decir', () => {
    expect(totalDelDesglose([])).toBe(0);
  });
});

