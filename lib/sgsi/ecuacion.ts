// lib/sgsi/ecuacion.ts
//
// D3 (REQ-SIG-20, tarea 2.2) · la Ecuación es un espejo, no un segundo cálculo. Las siete
// pasos de MET-SIG-01 §7 resuelven con las mismas funciones que ya usa `generarRiesgos`
// (lib/sgsi/riesgos.ts) y el derive pass de `FichaActivo.tsx`: `calcularRiesgo` e
// `impactoDimension` de `formulas.ts`, `eficaciaAmenaza`/`eficaciaDeNivel` de
// `madurez.ts`. Nada acá vuelve a escribir `×`, `max` o `1 − e` por su cuenta.
//
// POR QUÉ EL PASO 7 COINCIDE AL CUARTO DECIMAL "POR CONSTRUCCIÓN":
// `calcularRiesgo` es la MISMA llamada que `generarRiesgos` hace para escribir
// `Riesgo.riesgoResidual`. Si esta función alguna vez implementara su propia
// multiplicación en lugar de llamar a `calcularRiesgo`, los dos números podrían separarse
// — que es exactamente el defecto que este módulo existe para prevenir (spec
// risk-equation-traceability, "Single arithmetic source").
//
// NO HAY IMPACTO RESIDUAL (regla del handoff): el paso 4 (inherente) y el paso 7
// (residual) comparten el mismo `impacto`. Lo único que baja entre uno y otro es la
// frecuencia — la eficacia reduce el ARO, nunca el impacto.
//
// PASO 5 Y LA RELEVANCIA QUE HOY NO EXISTE (Open Item 6, tasks.md): los 272 pares de
// `ControlAmenaza` tienen `relevanciaId` en null — ninguna amenaza tiene un control
// principal designado. `eficaciaAmenaza` (madurez.ts) ya degrada con elegancia a la media
// simple cuando no hay principal (esPrincipal siempre false), así que este módulo no
// necesita una rama especial para ese caso: solo expone `sinRelevanciaAsignada` para que
// la pantalla muestre el aviso. Asignar relevancia (REQ-SIG-21) no cambia esta función,
// cambia sus datos de entrada.

import Decimal from 'decimal.js';
import { calcularRiesgo, impactoDimension, valorActivo, type ValoresDimension } from './formulas';
import { eficaciaAmenaza, eficaciaDeNivel } from './madurez';

export type DimensionRiesgo = 'D' | 'I' | 'C';

/// Si el paso corrió bajo una excepción deliberada (`RiesgoDegradacion`,
/// `Riesgo.frecuenciaId` o `Riesgo.madurezId`), y su justificación escrita. `null` cuando
/// no hay excepción — nunca una cadena vacía disfrazando "no aplica".
export interface InfoExcepcion {
  activa: boolean;
  justificacion: string | null;
}

export interface ImpactoPorDimension {
  dimension: DimensionRiesgo;
  valor: number;
  degradacion: Decimal;
  impacto: Decimal;
  excepcion: InfoExcepcion;
}

/// Un control aplicable a la amenaza (SOA ≠ "No aplica"), con lo que `eficaciaAmenaza`
/// necesita para agregarlo. `relevancia` es el nombre de la relevancia asignada al par
/// `ControlAmenaza` — Principal, Secundario, De apoyo — o `null` cuando `relevanciaId`
/// todavía no se asignó, que es el estado de las 272 filas hoy.
export interface ControlParaEficacia {
  codigo?: string;
  nivel: number | null;
  peso: number;
  esPrincipal: boolean;
  relevancia: string | null;
}

export interface DesgloseEficacia {
  controles: (ControlParaEficacia & { eficaciaNivel: number })[];
  /// Presente solo cuando algún control de la lista es el principal declarado.
  principal: { codigo?: string; eficaciaNivel: number; techo: number } | null;
  /// True cuando ningún control de la lista tiene relevancia asignada: la media pasa a
  /// ser simple (MET-SIG-01 v2) y el techo del principal no interviene porque no hay
  /// principal que declarar. REQ-SIG-21 es quien corrige esto — acá solo se avisa.
  sinRelevanciaAsignada: boolean;
}

export interface EntradaEcuacion {
  valores: ValoresDimension;
  degradaciones: Record<DimensionRiesgo, Decimal.Value>;
  /// Solo las dimensiones con una fila `RiesgoDegradacion` vigente, con su justificación.
  excepcionesDegradacion?: Partial<Record<DimensionRiesgo, string>>;
  aro: Decimal.Value;
  /// Presente solo cuando `Riesgo.frecuenciaId` se aparta de la frecuencia de la amenaza.
  justificacionFrecuencia?: string | null;
  /// Los controles aplicables de la amenaza, con su madurez actual. Lista vacía cuando la
  /// amenaza no tiene ningún control mapeado — la eficacia queda desconocida, no cero.
  controles: readonly ControlParaEficacia[];
  /// Presente solo cuando `Riesgo.madurezId` reemplaza la eficacia agregada del grupo por
  /// la de un nivel elegido para este riesgo.
  excepcionMadurez?: { nivel: number; justificacion: string } | null;
  deltaTechoEficacia?: number;
}

export interface EcuacionResuelta {
  /// Paso 1 — valor = max(v_D, v_I, v_C)
  valor: Decimal;
  /// Paso 2 — impacto_d = v_d × degradación_d, una fila por dimensión
  impactosPorDimension: ImpactoPorDimension[];
  /// Paso 3 — impacto = max(impacto_D, impacto_I, impacto_C) — el máximo, no la suma
  impacto: Decimal;
  aro: Decimal;
  excepcionFrecuencia: InfoExcepcion;
  /// Paso 4 — inherente = impacto × ARO
  inherente: Decimal;
  /// Paso 5 — eficacia agregada de los controles. Null: sin controles mapeados,
  /// desconocida — nunca cero.
  eficacia: number | null;
  desgloseEficacia: DesgloseEficacia | null;
  excepcionMadurez: InfoExcepcion;
  /// Paso 6 — ARO_res = ARO × (1 − e). Null junto con el residual mientras e es
  /// desconocida.
  aroResidual: Decimal | null;
  /// Paso 7 — residual = impacto × ARO_res. La misma `calcularRiesgo` que
  /// `generarRiesgos` usa para escribir `Riesgo.riesgoResidual`.
  residual: Decimal | null;
}

const DIMENSIONES: readonly DimensionRiesgo[] = ['D', 'I', 'C'];

/// Resuelve las siete pasos de la ecuación para un riesgo. Pura: ni Prisma ni React,
/// para que el mismo cálculo sirva a la ficha (edición) y a la pestaña Ecuación
/// (lectura).
export function resolverEcuacion(entrada: EntradaEcuacion): EcuacionResuelta {
  const delta = entrada.deltaTechoEficacia ?? 0.05;

  const valor = valorActivo(entrada.valores);

  const impactosPorDimension: ImpactoPorDimension[] = DIMENSIONES.map((d) => {
    const justificacion = entrada.excepcionesDegradacion?.[d] ?? null;
    return {
      dimension: d,
      valor: entrada.valores[d],
      degradacion: new Decimal(entrada.degradaciones[d]),
      impacto: impactoDimension(entrada.valores[d], entrada.degradaciones[d]),
      excepcion: { activa: justificacion !== null, justificacion },
    };
  });

  const aplicables = entrada.controles;
  const eficacia = entrada.excepcionMadurez
    ? eficaciaDeNivel(entrada.excepcionMadurez.nivel)
    : aplicables.length === 0
      ? null
      : eficaciaAmenaza(aplicables, delta);

  // La única llamada que produce impacto/inherente/residual — exactamente la que
  // `generarRiesgos` usa para escribir la fila de `Riesgo`. Un residual desconocido se
  // pide con eficacia 0 y se descarta después (misma convención que el derive pass de
  // FichaActivo.tsx), nunca se muestra como si fuera un cero calculado.
  const salida = calcularRiesgo({
    valores: entrada.valores,
    degradaciones: entrada.degradaciones,
    aro: entrada.aro,
    eficacia: eficacia ?? 0,
  });

  const principal = aplicables.find((c) => c.esPrincipal) ?? null;
  const desgloseEficacia: DesgloseEficacia | null =
    aplicables.length === 0
      ? null
      : {
          controles: aplicables.map((c) => ({ ...c, eficaciaNivel: eficaciaDeNivel(c.nivel) })),
          principal: principal
            ? {
                codigo: principal.codigo,
                eficaciaNivel: eficaciaDeNivel(principal.nivel),
                techo: eficaciaDeNivel(principal.nivel) + delta,
              }
            : null,
          sinRelevanciaAsignada: aplicables.every((c) => c.relevancia === null),
        };

  return {
    valor,
    impactosPorDimension,
    impacto: salida.impacto,
    aro: new Decimal(entrada.aro),
    excepcionFrecuencia: {
      activa: (entrada.justificacionFrecuencia ?? null) !== null,
      justificacion: entrada.justificacionFrecuencia ?? null,
    },
    inherente: salida.riesgoPotencial,
    eficacia,
    desgloseEficacia,
    excepcionMadurez: {
      activa: entrada.excepcionMadurez != null,
      justificacion: entrada.excepcionMadurez?.justificacion ?? null,
    },
    aroResidual: eficacia === null ? null : salida.frecuenciaResidual,
    residual: eficacia === null ? null : salida.riesgoResidual,
  };
}
