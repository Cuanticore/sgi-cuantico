// lib/sig/__tests__/alcance-equivalente.test.ts
//
// **La previsión y la generación tienen que resolver el MISMO conjunto.**
//
// `prevision.ts:10-13` declara la duplicación con todas las letras: «la resolución del
// alcance vive acá y en `planificarGeneracion`, y eso es una duplicación consciente […] así
// que **se prueba que las dos digan lo mismo sobre el mismo conjunto**».
//
// Esa prueba no existía. `prevision.test.ts` ejercita `personasAlcanzadas` **sola**, y
// `resolverAlcance` era una función privada de `generacion.ts` que ningún test importaba. La
// equivalencia —lo único que sostiene la duplicación— nunca se comprobó, y el precio ya se
// pagó una vez: `prevision.ts` declaraba su propia union de seis valores mientras el enum
// tenía siete, así que devolvía cero para `NIVEL_ACTIVO` en silencio mientras el generador sí
// lo conocía. `prevision.ts:26-33` documenta ese incidente.
//
// **Lo que esta prueba compra, y ya se cobró una vez.** Al agregarse `GRUPO_INTERES` al enum,
// esta red disparó cuatro errores de compilación antes de que nadie corriera nada: el `Record`
// de abajo, el `switch` de `resolverAlcance`, el `switch` de `personasAlcanzadas` y la union
// de la pantalla. Los cuatro son lugares que tenían que resolver el alcance nuevo, y los
// cuatro habrían devuelto cero en silencio.
//
// Y después atrapó lo que le faltaba: la comparación de `GRUPO_INTERES` **pasaba** con los dos
// lados devolviendo `[]`, y la aserción de «resuelve al menos una persona» —que existe
// justamente contra eso— la hizo fallar hasta que el fixture tuvo membresías. Una equivalencia
// entre dos ceros no prueba nada, y es el modo de falla exacto que `NIVEL_ACTIVO` tuvo.

// El enum entra como TIPO y no como valor: importarlo como valor arrastra el runtime de
// Prisma, que no arranca en jsdom. Y sale mejor así — la exhaustividad se comprueba en
// COMPILACIÓN con el `Record` de abajo, que es más fuerte que una prueba: si entra
// `GRUPO_INTERES` y nadie lo clasifica, falla `tsc`, no un `it`.
import type { AlcanceObligacion } from '@prisma/client';

import {
  activosAlcanzados as activosDeGeneracion,
  resolverAlcance,
  type ActivoGenerable,
  type ObligacionGenerable,
  type PersonaGenerable,
} from '../generacion';
import {
  activosAlcanzados as activosDePrevision,
  personasAlcanzadas,
  type ActivoDelInventario,
  type EntradaPrevision,
  type PersonaDelCenso,
} from '../prevision';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const ANTIGUO = d('2020-01-01');

/// Los ids de destino son los mismos en las dos entradas, para que la comparación sea de la
/// REGLA y no de los datos.
const AREA = 3;
const CARGO = 7;
const PERSONA = 1;
const TIPO = 5;
const ACTIVO = 100;
const NIVEL = 9;
const GRUPO = 11;
const SEGUIMIENTO = 99;

/// Nueve personas: tres del área 3, dos del cargo 7, una inactiva que NUNCA debe contarse, y
/// el responsable de seguimiento, que en producción siempre está en el censo.
const CENSO: (PersonaGenerable & PersonaDelCenso)[] = [
  { id: 1, activa: true, areaId: AREA, cargoId: CARGO, ingreso: ANTIGUO, areaDesde: ANTIGUO, cargoDesde: ANTIGUO, gruposDesde: [{ grupoId: GRUPO, desde: ANTIGUO }] },
  { id: 2, activa: true, areaId: AREA, cargoId: CARGO, ingreso: ANTIGUO, areaDesde: ANTIGUO, cargoDesde: ANTIGUO, gruposDesde: [{ grupoId: GRUPO, desde: ANTIGUO }] },
  { id: 3, activa: true, areaId: AREA, cargoId: 8, ingreso: ANTIGUO, areaDesde: ANTIGUO, cargoDesde: ANTIGUO },
  { id: 4, activa: true, areaId: 4, cargoId: 8, ingreso: ANTIGUO, areaDesde: ANTIGUO, cargoDesde: ANTIGUO },
  { id: 5, activa: false, areaId: AREA, cargoId: CARGO, ingreso: ANTIGUO, areaDesde: ANTIGUO, cargoDesde: ANTIGUO, gruposDesde: [{ grupoId: GRUPO, desde: ANTIGUO }] },
  { id: SEGUIMIENTO, activa: true, areaId: 9, cargoId: 9, ingreso: ANTIGUO, areaDesde: ANTIGUO, cargoDesde: ANTIGUO },
];

/// Cinco activos: dos del tipo 5 con propietario, uno del tipo 5 sin propietario, uno de otro
/// tipo, y uno dado de baja que ninguno de los dos lados debe contar.
const INVENTARIO: (ActivoGenerable & ActivoDelInventario)[] = [
  { id: 100, activo: true, tipoId: TIPO, propietarioId: CARGO },
  { id: 101, activo: true, tipoId: TIPO, propietarioId: CARGO },
  { id: 102, activo: true, tipoId: TIPO, propietarioId: null },
  { id: 200, activo: true, tipoId: 6, propietarioId: CARGO },
  { id: 201, activo: false, tipoId: TIPO, propietarioId: CARGO },
];

const OBLIGACION: ObligacionGenerable = {
  id: 1,
  contenidoId: 10,
  alcance: 'TODOS',
  alcancePersonaId: PERSONA,
  alcanceCargoId: CARGO,
  alcanceAreaId: AREA,
  alcanceActivoId: ACTIVO,
  alcanceTipoActivoId: TIPO,
  alcanceNivelActivoId: NIVEL,
  alcanceGrupoInteresId: GRUPO,
  responsableSeguimientoId: SEGUIMIENTO,
  periodicidad: 'MENSUAL',
  fechaInicio: d('2026-09-01'),
  plazoDias: 15,
  activa: true,
  creadaEn: ANTIGUO,
};

const ENTRADA: EntradaPrevision = {
  alcance: 'TODOS',
  alcancePersonaId: PERSONA,
  alcanceCargoId: CARGO,
  alcanceAreaId: AREA,
  alcanceActivoId: ACTIVO,
  alcanceTipoActivoId: TIPO,
  alcanceGrupoInteresId: GRUPO,
  periodicidad: 'MENSUAL',
  fechaInicio: d('2026-09-01'),
  plazoDias: 15,
};

/// **La red, y está en el sistema de tipos.**
///
/// `Record<AlcanceObligacion, …>` obliga a que **cada** valor del enum de Prisma esté acá.
/// El día que REQ-SIG-15 agregue `GRUPO_INTERES`, este objeto **no compila** hasta que
/// alguien decida si resuelve personas o activos — y una vez clasificado, las pruebas de
/// abajo lo comparan en los dos lados automáticamente.
///
/// Es la propiedad que `prevision.ts:26-33` pide y que un arreglo escrito a mano no da: un
/// `AlcanceObligacion[]` con seis de siete valores compila perfecto y se ve completo.
const UNIDAD: Record<AlcanceObligacion, 'persona' | 'activo'> = {
  PERSONA: 'persona',
  CARGO: 'persona',
  AREA: 'persona',
  TODOS: 'persona',
  // REQ-SIG-15 · lo clasificó esta red: al agregarse al enum, `tsc` se negó a compilar hasta
  // que alguien decidiera de qué lado estaba. Es la propiedad que `NIVEL_ACTIVO` no tuvo.
  GRUPO_INTERES: 'persona',
  ACTIVO: 'activo',
  TIPO_ACTIVO: 'activo',
  NIVEL_ACTIVO: 'activo',
};

const TODOS_LOS_ALCANCES = Object.keys(UNIDAD) as AlcanceObligacion[];

/// Los que resuelven PERSONAS. Para éstos los dos lados tienen que dar el mismo conjunto.
const POR_PERSONA = TODOS_LOS_ALCANCES.filter((a) => UNIDAD[a] === 'persona');

/// Los que resuelven ACTIVOS. `personasAlcanzadas` devuelve `[]` **a propósito**: la unidad
/// es el activo, no la persona, y `prevision.ts:115-116` lo dice. La equivalencia que hay que
/// comprobar en éstos es la de `activosAlcanzados`.
const POR_ACTIVO = TODOS_LOS_ALCANCES.filter((a) => UNIDAD[a] === 'activo');

describe('el enum está cubierto entero', () => {
  it('las dos listas reparten todos los valores y ninguno queda en las dos', () => {
    expect(POR_PERSONA.length + POR_ACTIVO.length).toBe(TODOS_LOS_ALCANCES.length);
    for (const a of POR_PERSONA) expect(POR_ACTIVO).not.toContain(a);
  });

  // Si esta cifra cambia sin que nadie toque las pruebas de abajo, es que entró un alcance
  // nuevo. La cuenta está acá para que el cambio se vea en el diff.
  it('hoy el enum tiene ocho valores', () => {
    expect(TODOS_LOS_ALCANCES).toHaveLength(8);
  });
});

describe('los alcances por persona resuelven el mismo conjunto', () => {
  it.each(POR_PERSONA)('%s', (alcance) => {
    const { destinatarios, rechazo } = resolverAlcance(
      { ...OBLIGACION, alcance },
      CENSO,
      INVENTARIO,
    );
    expect(rechazo).toBeNull();

    const deGeneracion = [...new Set(destinatarios.map((x) => x.personaId))].sort((a, b) => a - b);
    const dePrevision = personasAlcanzadas({ ...ENTRADA, alcance }, CENSO)
      .map((p) => p.id)
      .sort((a, b) => a - b);

    expect(deGeneracion).toEqual(dePrevision);
  });

  // Y que no sea trivialmente vacío en los dos: una equivalencia entre dos ceros no prueba
  // nada. Es el modo de falla exacto que `NIVEL_ACTIVO` tuvo durante meses.
  it.each(POR_PERSONA)('%s resuelve al menos una persona', (alcance) => {
    expect(personasAlcanzadas({ ...ENTRADA, alcance }, CENSO).length).toBeGreaterThan(0);
  });

  it('ninguno de los dos cuenta a la persona inactiva', () => {
    for (const alcance of POR_PERSONA) {
      const { destinatarios } = resolverAlcance({ ...OBLIGACION, alcance }, CENSO, INVENTARIO);
      expect(destinatarios.map((x) => x.personaId)).not.toContain(5);
      expect(personasAlcanzadas({ ...ENTRADA, alcance }, CENSO).map((p) => p.id)).not.toContain(5);
    }
  });
});

describe('los alcances por activo resuelven el mismo conjunto de activos', () => {
  // `NIVEL_ACTIVO` queda fuera de esta comparación porque ninguno de los dos lo resuelve
  // todavía: el generador lo RECHAZA con motivo y la previsión devuelve lista vacía. Su caso
  // propio está más abajo.
  it.each(['ACTIVO', 'TIPO_ACTIVO'] as const)('%s', (alcance) => {
    const deGeneracion = activosDeGeneracion({ ...OBLIGACION, alcance }, INVENTARIO)
      .map((a) => a.id)
      .sort((a, b) => a - b);
    const dePrevision = activosDePrevision({ ...ENTRADA, alcance }, INVENTARIO)
      .map((a) => a.id)
      .sort((a, b) => a - b);

    expect(deGeneracion).toEqual(dePrevision);
    expect(deGeneracion.length).toBeGreaterThan(0);
  });

  it('ninguno de los dos cuenta el activo dado de baja', () => {
    for (const alcance of ['ACTIVO', 'TIPO_ACTIVO'] as const) {
      expect(activosDeGeneracion({ ...OBLIGACION, alcance }, INVENTARIO).map((a) => a.id)).not.toContain(201);
      expect(activosDePrevision({ ...ENTRADA, alcance }, INVENTARIO).map((a) => a.id)).not.toContain(201);
    }
  });

  // La asimetría declarada: en estos alcances la previsión NO cuenta personas, porque la
  // unidad es el activo. No es un hueco, es el diseño — y se fija acá para que nadie la
  // «arregle» haciendo que devuelva personas.
  it.each(POR_ACTIVO)('%s: la previsión no cuenta personas, a propósito', (alcance) => {
    expect(personasAlcanzadas({ ...ENTRADA, alcance }, CENSO)).toEqual([]);
  });
});

describe('NIVEL_ACTIVO sigue sin resolver, y los dos lados lo dicen igual', () => {
  // El generador lo RECHAZA con motivo en vez de devolver lista vacía, que se vería igual que
  // «ya estaba todo generado». La previsión devuelve cero activos. Ninguno de los dos
  // inventa un conjunto.
  it('la generación lo rechaza nombrando lo que falta decidir', () => {
    const { destinatarios, rechazo } = resolverAlcance(
      { ...OBLIGACION, alcance: 'NIVEL_ACTIVO' },
      CENSO,
      INVENTARIO,
    );
    expect(destinatarios).toEqual([]);
    expect(rechazo).not.toBeNull();
    expect(rechazo).toContain('nivel');
  });

  it('y la previsión no cuenta ningún activo', () => {
    expect(activosDePrevision({ ...ENTRADA, alcance: 'NIVEL_ACTIVO' }, INVENTARIO)).toEqual([]);
  });
});

describe('el activo sin propietario va al responsable de seguimiento en los dos lados', () => {
  // D3 · «la asignación no se crea en el vacío». La generación lo dirige al responsable; la
  // previsión lo cuenta en `activosSinDueno`. Son dos formas de decir lo mismo y tienen que
  // coincidir en el NÚMERO, o la pantalla promete una carga que no llega.
  it('la generación lo dirige y la previsión lo cuenta', () => {
    const { destinatarios } = resolverAlcance(
      { ...OBLIGACION, alcance: 'TIPO_ACTIVO' },
      CENSO,
      INVENTARIO,
    );
    const huerfano = destinatarios.filter((x) => x.activoId === 102);
    expect(huerfano).toHaveLength(1);
    expect(huerfano[0].personaId).toBe(SEGUIMIENTO);

    const cargosOcupados = new Set(CENSO.filter((p) => p.activa).map((p) => p.cargoId));
    const sinDueno = activosDePrevision({ ...ENTRADA, alcance: 'TIPO_ACTIVO' }, INVENTARIO).filter(
      (a) => a.propietarioId === null || !cargosOcupados.has(a.propietarioId),
    );
    expect(sinDueno.map((a) => a.id)).toEqual([102]);
  });
});
