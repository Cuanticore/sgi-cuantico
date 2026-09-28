'use client';

// app/components/sgsi/valoracion-riesgos/FranjaDeRiesgo.tsx
//
// Un riesgo del activo, cuando la fila está expandida.
//
// VA DE ANCHO COMPLETO Y NO BAJO LAS COLUMNAS DEL PADRE. Un riesgo no tiene «Proceso» ni
// «Propietario» propios —los tiene el activo—, y alinearlo bajo esas columnas diría que sí.
// Lo que sí es suyo: la amenaza, su residual, y el control que debería contenerla.
//
// LA BRECHA SE DICE ACÁ POR PRIMERA VEZ. Hasta hoy no se veía en ninguna pantalla: la columna
// «Plan» del padre resume el estado del ACTIVO —«pendiente», «no requiere»— sin decir de dónde
// sale, y la franja de REQ-SIG-23 §4.1 no está construida. Eso hacía que un activo con
// residual Alto saliera «No requiere» sin explicación posible desde la interfaz. Acá se lee:
// `exige 70 · el control está en 70 · sin brecha`.

import type { CustomCellRendererProps } from 'ag-grid-react';
import type { EstadoBrecha } from '@/lib/sgsi/exigencia';
import type { FilaArbol } from '@/lib/sgsi/arbol-analisis';

/// Lo que se dice de la brecha, en palabras, por cada forma que `EstadoBrecha` puede tomar.
///
/// LOS SIETE CASOS SE DICEN DISTINTO A PROPÓSITO. «No se pudo evaluar» y «no falta nada» son
/// hechos contrarios, y colapsarlos en «sin brecha» es exactamente el tablero que afirma con
/// precisión que no hay brechas — el defecto que `estadoPlanDe` ya evita aguas arriba.
function textoDeBrecha(b: EstadoBrecha): { texto: string; tono: 'falta' | 'cubre' | 'nose' } {
  switch (b.tipo) {
    case 'cubierto':
      return { texto: `exige ${b.exigido} · está en ${b.actual} · sin brecha`, tono: 'cubre' };
    case 'brecha':
      return {
        texto: `exige ${b.exigido} · está en ${b.actual} · faltan ${b.brecha} puntos`,
        tono: 'falta',
      };
    case 'brecha-de-verificacion':
      return {
        texto: `exige ${b.exigido} · está en ${b.actual} · falta la verificación de eficacia`,
        tono: 'falta',
      };
    case 'verificacion-sin-determinar':
      return {
        texto: `exige ${b.exigido} · está en ${b.actual} · no se pudo determinar la verificación`,
        tono: 'nose',
      };
    case 'sin-exigencia':
      return { texto: 'ni la criticidad ni la valoración exigen nada sobre esta amenaza', tono: 'cubre' };
    default:
      // `sin-principal` y `principal-sin-evaluar`: no es una brecha de cero, es una brecha que
      // NO SE PUDO EVALUAR. Decir «sin brecha» acá sería afirmar algo que nadie miró.
      return { texto: 'no se puede evaluar: falta designar o evaluar el control principal', tono: 'nose' };
  }
}

const TONO = {
  falta: 'text-danger-text',
  cubre: 'text-secondary',
  nose: 'text-warn-text',
} as const;

export default function FranjaDeRiesgo({ data }: CustomCellRendererProps<FilaArbol>) {
  if (data === undefined || data.tipo !== 'riesgo') return null;

  const b = textoDeBrecha(data.brecha);
  const residual = data.residual === null ? 'sin calcular' : data.residual;

  return (
    <div className="flex h-full items-center gap-3 border-b border-hairline-faint bg-subtle py-1.5 pl-[118px] pr-4">
      <span className="w-[54px] flex-none font-mono text-11 font-semibold text-secondary-soft">
        {data.amenazaCodigo}
      </span>
      <span className="min-w-0 flex-1 truncate text-11_5 text-secondary" title={data.amenazaNombre}>
        {data.amenazaNombre}
      </span>
      <span className="flex-none font-mono text-11 tabular-nums text-secondary">
        residual {residual}
      </span>
      <span className="w-[112px] flex-none font-mono text-11 text-muted">
        {data.principal === null ? 'sin principal' : `${data.principal.codigo}`}
      </span>
      <span className={`w-[300px] flex-none text-11 ${TONO[b.tono]}`}>{b.texto}</span>
    </div>
  );
}
