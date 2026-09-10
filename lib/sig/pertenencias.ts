// lib/sig/pertenencias.ts
//
// **P3 · de dónde salen las tareas que una pertenencia produce.**
//
// El popup de REQ-SIG-15 no puede decir «se le asignarán 47 tareas» y nada más. «El cargo
// arrastra los activos»: a alguien con un cargo que es propietario de 40 activos, una
// obligación anual de revisión por tipo de activo le crea 40 asignaciones. Un 47 pelado se
// lee como un error y quien está guardando **no guarda**.
//
// ── La propiedad que hace que el número no pueda mentir ───────────────────────────────────
//
// Esto es una **proyección del plan**, no una segunda cuenta. Recibe el `crear` que
// `planificarGeneracion` produjo y lo reparte en cubetas; la suma de las cubetas es
// `crear.length`, siempre, por construcción. Así el «47» del popup y el `count(*)` de después
// no pueden divergir — que es el criterio 8 del §11 y la razón por la que P14 exige que
// guardar y generar ocurran en la misma transacción.
//
// Una previsión aparte —recontar obligaciones y multiplicar por periodos— habría sido más
// fácil de escribir y habría podido dar otro número que el plan. Ese es justamente el defecto
// que este módulo evita.

import type { AlcanceObligacion } from '@prisma/client';

import type { AsignacionACrear } from './generacion';

/// De dónde viene una asignación, dicho como lo diría quien mira el popup.
export type OrigenAsignacion =
  | 'AREA'
  | 'CARGO'
  /// Los activos cuyo propietario es el cargo de la persona. Es la cubeta que explica los
  /// números grandes y la que P3 pone de ejemplo.
  | 'ACTIVOS_DEL_CARGO'
  | 'GRUPO_INTERES'
  /// Lo que **no** viene de la pertenencia que se acaba de guardar: alcance `TODOS`,
  /// `PERSONA`, o una asignación de contenido directo sin obligación. Se habrían generado
  /// igual, pero la transacción las crea, así que se cuentan — o el número dejaría de cuadrar
  /// con el `count(*)`, que es lo único que lo hace verificable.
  | 'OTRO';

export interface RenglonDelDesglose {
  origen: OrigenAsignacion;
  cuantas: number;
  /// El nombre del destino, para la frase: «6 por el área Tecnología». `null` cuando el
  /// origen no tiene uno que nombrar.
  destino: string | null;
}

/// Lo mínimo que hace falta saber de una obligación para clasificar sus asignaciones.
export interface ObligacionDelDesglose {
  id: number;
  alcance: AlcanceObligacion;
  /// El nombre del área, del cargo, del tipo de activo o del grupo. `null` en `TODOS`.
  destino: string | null;
}

function cubetaDe(alcance: AlcanceObligacion): OrigenAsignacion {
  switch (alcance) {
    case 'AREA':
      return 'AREA';
    case 'CARGO':
      return 'CARGO';
    case 'GRUPO_INTERES':
      return 'GRUPO_INTERES';
    // Los tres alcances por activo caen juntos: a la persona la alcanzan **por su cargo**,
    // que es el propietario del activo, así que para quien mira el popup son «los activos de
    // ese cargo» y no tres orígenes distintos.
    case 'ACTIVO':
    case 'TIPO_ACTIVO':
    case 'NIVEL_ACTIVO':
      return 'ACTIVOS_DEL_CARGO';
    case 'PERSONA':
    case 'TODOS':
      return 'OTRO';
  }
}

/// Reparte el plan en renglones, de mayor a menor.
///
/// De mayor a menor porque el renglón que explica el número grande es el que alguien necesita
/// leer para no confundir 47 con un error.
export function desglosarPorOrigen(
  crear: readonly AsignacionACrear[],
  obligaciones: readonly ObligacionDelDesglose[],
): RenglonDelDesglose[] {
  const porId = new Map(obligaciones.map((o) => [o.id, o]));
  // La llave incluye el destino: dos obligaciones por área distinta no se colapsan en un
  // renglón que diría «6 por el área Tecnología» cuando tres eran de otra.
  const cubetas = new Map<string, RenglonDelDesglose>();

  for (const a of crear) {
    const obligacion = a.obligacionId === null ? undefined : porId.get(a.obligacionId);
    // Una obligación que el plan trae y la lista no: cae en OTRO y **no se descarta**.
    // Descartarla rompería la suma, que es la única propiedad que hace confiable el número.
    const origen = obligacion === undefined ? 'OTRO' : cubetaDe(obligacion.alcance);
    const destino = origen === 'OTRO' ? null : (obligacion?.destino ?? null);
    const clave = `${origen}|${destino ?? ''}`;
    const ya = cubetas.get(clave);
    if (ya) ya.cuantas += 1;
    else cubetas.set(clave, { origen, cuantas: 1, destino });
  }

  return [...cubetas.values()].sort((a, b) => b.cuantas - a.cuantas);
}

export function totalDelDesglose(desglose: readonly RenglonDelDesglose[]): number {
  return desglose.reduce((t, d) => t + d.cuantas, 0);
}

/// Las frases de P3, una por renglón. El número va primero porque es lo que se busca al leer.
export function frasesDelDesglose(desglose: readonly RenglonDelDesglose[]): string[] {
  return desglose.map((d) => {
    switch (d.origen) {
      case 'AREA':
        return `${d.cuantas} por el área ${d.destino}`;
      case 'CARGO':
        return `${d.cuantas} por el cargo ${d.destino}`;
      case 'ACTIVOS_DEL_CARGO':
        return `${d.cuantas} por los activos cuyo propietario es ese cargo (${d.destino})`;
      case 'GRUPO_INTERES':
        return `${d.cuantas} por el grupo ${d.destino}`;
      case 'OTRO':
        // Sin nombrar un destino que no existe. Decir «por el área null» sería peor que no
        // decir nada, y callar el renglón dejaría la suma sin explicar.
        return `${d.cuantas} que no dependen de esta pertenencia`;
    }
  });
}
