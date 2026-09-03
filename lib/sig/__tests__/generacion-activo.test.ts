// lib/sig/__tests__/generacion-activo.test.ts
//
// D3 · el alcance por activo. La costura mas importante del paquete.
//
// Lo que se prueba aca es lo que el documento promete Y lo que la base hoy hace inevitable:
// **234 de 247 activos vigentes NO tienen propietario, y NINGUN cargo esta ocupado por una
// persona activa.** Asi que el camino «sin propietario» no es un borde raro: es el camino
// normal el dia que esto se encienda, y tiene que funcionar sin perder la asignacion.

import {
  esFaltanteDePropietario,
  planificarGeneracion,
  type ActivoGenerable,
  type ObligacionGenerable,
} from '../generacion';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const HOY = d('2026-06-01');

const SERVIDOR = 1;
const PORTATIL = 2;

const ADA = { id: 1, activa: true, areaId: 3, cargoId: 7 };
const OTRA = { id: 5, activa: true, areaId: 3, cargoId: 7 };

/// El responsable de seguimiento de la obligacion: a donde va lo que no tiene propietario.
const SEGUIMIENTO = 99;

const anual: ObligacionGenerable = {
  id: 1,
  contenidoId: 10,
  alcance: 'TIPO_ACTIVO',
  alcancePersonaId: null,
  alcanceCargoId: null,
  alcanceAreaId: null,
  alcanceActivoId: null,
  alcanceTipoActivoId: null,
  alcanceNivelActivoId: null,
  responsableSeguimientoId: SEGUIMIENTO,
  periodicidad: 'ANUAL',
  fechaInicio: d('2026-01-01'),
  plazoDias: 30,
  activa: true,
};

/// Cinco activos: tres servidores y dos portatiles. Uno de cada tipo sin propietario, y uno
/// dado de baja que NUNCA debe generar.
const ACTIVOS: ActivoGenerable[] = [
  { id: 100, activo: true, tipoId: SERVIDOR, propietarioId: 7 },
  { id: 101, activo: true, tipoId: SERVIDOR, propietarioId: 7 },
  { id: 102, activo: true, tipoId: SERVIDOR, propietarioId: null },
  { id: 200, activo: true, tipoId: PORTATIL, propietarioId: 8 },
  { id: 201, activo: false, tipoId: SERVIDOR, propietarioId: 7 },
];

const plan = (obligacion: ObligacionGenerable, personas = [ADA], existentes: Parameters<typeof planificarGeneracion>[2] = []) =>
  planificarGeneracion([obligacion], personas, existentes, HOY, 90, ACTIVOS);

describe('alcance TIPO_ACTIVO', () => {
  // El caso que justifica la costura: UNA obligacion cubre todos los activos de un tipo, y
  // sigue viva cuando entre el siguiente.
  it('produce una asignacion POR ACTIVO vigente del tipo', () => {
    const r = plan({ ...anual, alcanceTipoActivoId: SERVIDOR });
    // ADA ocupa el cargo 7, propietario de 100 y 101. El 102 no tiene propietario y va al
    // responsable de seguimiento. El 201 esta de baja.
    expect(r.crear).toHaveLength(3);
    expect(r.crear.map((c) => c.activoId).sort()).toEqual([100, 101, 102]);
  });

  it('el activo dado de baja no genera nada', () => {
    const r = plan({ ...anual, alcanceTipoActivoId: SERVIDOR });
    expect(r.crear.some((c) => c.activoId === 201)).toBe(false);
  });

  // D3: «la asignacion NO se crea en el vacio — se dirige al responsable de seguimiento de
  // la obligacion y se marca el faltante. Un activo sin propietario es un hallazgo, no un
  // error de generacion.»
  it('el activo sin propietario va al responsable de seguimiento, no se descarta', () => {
    const r = plan({ ...anual, alcanceTipoActivoId: SERVIDOR });
    const huerfano = r.crear.find((c) => c.activoId === 102);
    expect(huerfano).toBeDefined();
    expect(huerfano?.personaId).toBe(SEGUIMIENTO);
  });

  // El propietario es un CARGO. Un activo cuyo cargo propietario no lo ocupa NADIE termina
  // igual que uno sin propietario — y es el caso real de hoy: ningun cargo esta ocupado.
  it('un cargo propietario que nadie ocupa tambien va al responsable', () => {
    const r = plan({ ...anual, alcanceTipoActivoId: PORTATIL });
    expect(r.crear).toHaveLength(1);
    expect(r.crear[0].personaId).toBe(SEGUIMIENTO);
    expect(r.crear[0].activoId).toBe(200);
  });

  // Si dos personas comparten el cargo propietario, las dos son propietarias del activo:
  // mismo criterio que el alcance por cargo, que ya reparte a todos los que lo ocupan.
  it('reparte a TODAS las personas que ocupan el cargo propietario', () => {
    const r = plan({ ...anual, alcanceTipoActivoId: SERVIDOR }, [ADA, OTRA]);
    const del100 = r.crear.filter((c) => c.activoId === 100);
    expect(del100.map((c) => c.personaId).sort()).toEqual([1, 5]);
  });

  // T1, y la razon por la que la unica del esquema paso a CUATRO columnas: con tres, una
  // persona con dos servidores en el mismo periodo solo cabia una vez. La migracion la
  // recrea con NULLS NOT DISTINCT para no perder la garantia en las que no son por activo.
  it('es idempotente POR ACTIVO: correr dos veces no duplica', () => {
    const primera = plan({ ...anual, alcanceTipoActivoId: SERVIDOR });
    const segunda = plan(
      { ...anual, alcanceTipoActivoId: SERVIDOR },
      [ADA],
      primera.crear.map((c) => ({
        obligacionId: 1,
        personaId: c.personaId,
        periodo: c.periodo,
        activoId: c.activoId,
      })),
    );
    expect(segunda.crear).toEqual([]);
  });

  // Una obligacion que no genera nada Y NO LO DICE es indistinguible de una que ya estaba
  // al dia. Por eso se rechaza con motivo en vez de devolver lista vacia.
  it('un tipo sin activos vigentes se RECHAZA con motivo, no en silencio', () => {
    const r = plan({ ...anual, alcanceTipoActivoId: 999 });
    expect(r.crear).toEqual([]);
    expect(r.rechazadas).toHaveLength(1);
    expect(r.rechazadas[0].motivo).toContain('ningún activo vigente');
  });
});

describe('alcance ACTIVO', () => {
  it('la obligacion puntual sobre un activo concreto genera una sola', () => {
    const r = plan({ ...anual, alcance: 'ACTIVO', alcanceActivoId: 100 });
    expect(r.crear).toHaveLength(1);
    expect(r.crear[0].activoId).toBe(100);
    expect(r.crear[0].personaId).toBe(1);
  });

  it('un activo de baja se rechaza con motivo', () => {
    const r = plan({ ...anual, alcance: 'ACTIVO', alcanceActivoId: 201 });
    expect(r.rechazadas[0].motivo).toContain('dado de baja');
  });
});

describe('alcance NIVEL_ACTIVO', () => {
  // Declarado en el enum y sin resolver a proposito: `NivelActivo` es de REQ-SIG-06 y no
  // existe. Devolver lista vacia se veria igual que «ya estaba todo generado».
  it('se rechaza nombrando la dependencia que falta', () => {
    const r = plan({ ...anual, alcance: 'NIVEL_ACTIVO', alcanceNivelActivoId: 1 });
    expect(r.crear).toEqual([]);
    expect(r.rechazadas[0].motivo).toContain('REQ-SIG-06');
  });
});

describe('esFaltanteDePropietario', () => {
  const obligacion = { responsableSeguimientoId: SEGUIMIENTO };

  it('es faltante cuando llego al responsable y el activo no tiene propietario', () => {
    expect(
      esFaltanteDePropietario({ personaId: SEGUIMIENTO, activoId: 102 }, obligacion, {
        propietarioId: null,
      }),
    ).toBe(true);
  });

  // El responsable de seguimiento puede ser TAMBIEN el propietario legitimo. Marcarlo seria
  // acusar un hueco que no existe.
  it('no es faltante si el activo si tiene propietario', () => {
    expect(
      esFaltanteDePropietario({ personaId: SEGUIMIENTO, activoId: 100 }, obligacion, {
        propietarioId: 7,
      }),
    ).toBe(false);
  });

  it('una asignacion sin activo nunca es faltante de propietario', () => {
    expect(esFaltanteDePropietario({ personaId: SEGUIMIENTO, activoId: null }, obligacion, null)).toBe(
      false,
    );
  });

  it('si llego a otra persona no es faltante', () => {
    expect(
      esFaltanteDePropietario({ personaId: 1, activoId: 100 }, obligacion, { propietarioId: null }),
    ).toBe(false);
  });
});
