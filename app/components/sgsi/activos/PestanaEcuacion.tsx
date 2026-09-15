'use client';

// app/components/sgsi/activos/PestanaEcuacion.tsx
//
// P8 (D3, REQ-SIG-20 tarea 2.3) · la pestaña Ecuación es de solo lectura: la edición pasa
// en Amenazas, acá se entiende el número. No dispara ninguna acción del servidor — ni una
// fila de bitácora por visitarla (spec risk-equation-traceability, "Read-only Ecuación
// tab, seven steps" + "Read-only and copyable as text").
//
// CERO ARITMÉTICA PROPIA. Todo lo que este componente muestra ya viene resuelto en
// `EcuacionResuelta` (lib/sgsi/ecuacion.ts) — el mismo objeto que alimenta la aritmética en
// vivo de la pestaña Amenazas (FichaActivo.tsx). Este archivo solo formatea y copia.

import { useState, type ReactNode } from 'react';
import { clasificar } from '@/lib/sgsi/clasificar';
import type { EcuacionResuelta } from '@/lib/sgsi/ecuacion';
import type { Catalogos } from './ficha.query';

interface Props {
  codigoAmenaza: string;
  nombreAmenaza: string;
  ecuacion: EcuacionResuelta;
  catalogos: Catalogos;
}

function cifra(valor: number): string {
  return valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function porcentaje(valor: number): string {
  return `${(valor * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}

export default function PestanaEcuacion({
  codigoAmenaza,
  nombreAmenaza,
  ecuacion,
  catalogos,
}: Props) {
  const [pasoCincoAbierto, setPasoCincoAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Clasificar es lectura de catálogo, no aritmética: la misma función que ya usa la fila
  // de Amenazas para colorear inherente y residual.
  const bandaInherente = clasificar(ecuacion.inherente, catalogos.bandasRiesgo);
  const bandaResidual =
    ecuacion.residual === null ? null : clasificar(ecuacion.residual, catalogos.bandasRiesgo);

  const texto = textoPlano({ codigoAmenaza, nombreAmenaza, ecuacion, bandaInherente, bandaResidual });

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const sinRelevancia = ecuacion.desgloseEficacia?.sinRelevanciaAsignada ?? false;

  return (
    <div
      role="region"
      aria-label={`Ecuación del riesgo de ${codigoAmenaza}`}
      className="flex flex-col gap-3.5 rounded-tarjeta border border-border-default bg-surface px-5 py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-14 font-bold text-primary">
            Ecuación — {codigoAmenaza} · {nombreAmenaza}
          </h3>
          <p className="text-11_5 text-muted">
            Solo lectura: la edición se hace en Amenazas. Visitar esta pestaña no guarda nada.
          </p>
        </div>
        <button
          type="button"
          onClick={copiar}
          className="flex-none rounded-campo border border-border-field px-3 py-1.5 text-11_5 font-semibold text-accent-700 transition-colors hover:bg-accent-50"
        >
          {copiado ? '✓ Copiado' : 'Copiar como texto'}
        </button>
      </div>

      <ol className="flex flex-col gap-2.5">
        <Paso
          numero={1}
          titulo="Valor del activo"
          formula="valor = max(v_D, v_I, v_C)"
          valor={cifra(ecuacion.valor.toNumber())}
        />

        <Paso numero={2} titulo="Impacto por dimensión" formula="impacto_d = v_d × degradación_d">
          <ul className="flex flex-col gap-1">
            {ecuacion.impactosPorDimension.map((p) => (
              <li key={p.dimension} className="font-mono text-11_5 text-secondary">
                {p.dimension}: ({p.valor} × {p.degradacion.toString()}) = {cifra(p.impacto.toNumber())}
                {p.excepcion.activa && (
                  <span className="ml-1.5 text-warn-text">
                    · excepción de degradación
                    {p.excepcion.justificacion ? `: ${p.excepcion.justificacion}` : ' (sin justificación aún)'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Paso>

        <Paso
          numero={3}
          titulo="Impacto"
          formula="impacto = max(impacto_D, impacto_I, impacto_C)"
          valor={cifra(ecuacion.impacto.toNumber())}
          nota="El máximo, no la suma: mantiene la escala 0–5."
        />

        <Paso
          numero={4}
          titulo="Riesgo inherente"
          formula="inherente = impacto × ARO"
          valor={`${cifra(ecuacion.inherente.toNumber())}${bandaInherente ? ` · ${bandaInherente}` : ''}`}
        >
          {ecuacion.excepcionFrecuencia.activa && (
            <p className="text-11_5 text-warn-text [text-wrap:pretty]">
              Excepción de frecuencia
              {ecuacion.excepcionFrecuencia.justificacion
                ? `: ${ecuacion.excepcionFrecuencia.justificacion}`
                : ' (sin justificación aún)'}
            </p>
          )}
        </Paso>

        <Paso
          numero={5}
          titulo="Eficacia de los controles"
          formula="e = media ponderada, acotada por el principal"
          valor={ecuacion.eficacia === null ? 'sin calcular' : porcentaje(ecuacion.eficacia)}
        >
          {ecuacion.excepcionMadurez.activa && (
            <p className="text-11_5 text-warn-text [text-wrap:pretty]">
              Excepción de madurez
              {ecuacion.excepcionMadurez.justificacion
                ? `: ${ecuacion.excepcionMadurez.justificacion}`
                : ' (sin justificación aún)'}
            </p>
          )}

          {ecuacion.desgloseEficacia === null ? (
            <p className="text-11_5 text-muted [text-wrap:pretty]">
              Ninguna amenaza tiene controles mapeados: la eficacia es desconocida, no cero.
            </p>
          ) : (
            <>
              {sinRelevancia && (
                <p className="text-11_5 text-warn-text [text-wrap:pretty]">
                  Sin relevancia asignada a los controles de esta amenaza: la eficacia es la
                  media simple y el techo del principal no opera (MET-SIG-01 v2).
                </p>
              )}

              {!sinRelevancia && (
                <button
                  type="button"
                  onClick={() => setPasoCincoAbierto((v) => !v)}
                  className="w-fit text-11_5 font-semibold text-accent-700 underline"
                  aria-expanded={pasoCincoAbierto}
                >
                  {pasoCincoAbierto
                    ? 'Ocultar desglose principal / secundario / de apoyo'
                    : 'Ver desglose principal / secundario / de apoyo'}
                </button>
              )}

              {!sinRelevancia && pasoCincoAbierto && (
                <ul className="flex flex-col gap-1">
                  {ecuacion.desgloseEficacia.controles.map((c) => (
                    <li key={c.codigo} className="font-mono text-11 text-secondary">
                      {c.codigo} · {c.relevancia ?? 'sin relevancia'}
                      {c.esPrincipal ? ' · principal' : ''} · L{c.nivel ?? '—'} ·{' '}
                      {porcentaje(c.eficaciaNivel)}
                    </li>
                  ))}
                  {ecuacion.desgloseEficacia.principal && (
                    <li className="text-11 text-muted">
                      Techo del principal: {porcentaje(ecuacion.desgloseEficacia.principal.eficaciaNivel)}{' '}
                      + δ = {porcentaje(ecuacion.desgloseEficacia.principal.techo)}
                    </li>
                  )}
                </ul>
              )}
            </>
          )}
        </Paso>

        <Paso
          numero={6}
          titulo="ARO residual"
          formula="ARO_res = ARO × (1 − e)"
          valor={ecuacion.aroResidual === null ? 'sin calcular' : cifra(ecuacion.aroResidual.toNumber())}
        />

        <Paso
          numero={7}
          titulo="Riesgo residual"
          formula="residual = impacto × ARO_res"
          valor={
            ecuacion.residual === null
              ? 'sin calcular'
              : `${cifra(ecuacion.residual.toNumber())}${bandaResidual ? ` · ${bandaResidual}` : ''}`
          }
        />
      </ol>

      <p className="text-11 text-faint [text-wrap:pretty]">
        El impacto no cambia entre el paso 4 y el paso 7: la eficacia reduce la frecuencia,
        nunca el daño. Un impacto residual distinto sería un error de implementación.
      </p>
    </div>
  );
}

function Paso({
  numero,
  titulo,
  formula,
  valor,
  nota,
  children,
}: {
  numero: number;
  titulo: string;
  formula: string;
  valor?: string;
  nota?: string;
  children?: ReactNode;
}) {
  return (
    <li className="rounded-[8px] border border-border-default bg-subtle px-3.5 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-9 tracking-[0.07em] text-label">PASO {numero}</span>
        <span className="text-13 font-semibold text-primary">{titulo}</span>
        <span className="font-mono text-10_5 text-muted">{formula}</span>
        {valor !== undefined && <span className="ml-auto cifra text-14_5 text-primary">{valor}</span>}
      </div>
      {nota && <p className="mt-1 text-11 text-faint [text-wrap:pretty]">{nota}</p>}
      {children && <div className="mt-1.5 flex flex-col gap-1">{children}</div>}
    </li>
  );
}

/// The exact same seven numbers, as plain text — for committee minutes or an auditor, per
/// spec risk-equation-traceability "Read-only and copyable as text".
function textoPlano({
  codigoAmenaza,
  nombreAmenaza,
  ecuacion,
  bandaInherente,
  bandaResidual,
}: {
  codigoAmenaza: string;
  nombreAmenaza: string;
  ecuacion: EcuacionResuelta;
  bandaInherente: string | null;
  bandaResidual: string | null;
}): string {
  const lineas: string[] = [
    `Ecuación — ${codigoAmenaza} (${nombreAmenaza})`,
    `1) valor = max(v_D, v_I, v_C) = ${ecuacion.valor.toString()}`,
    ...ecuacion.impactosPorDimension.map(
      (p) =>
        `2) impacto_${p.dimension} = ${p.valor} × ${p.degradacion.toString()} = ${p.impacto.toString()}` +
        (p.excepcion.activa ? ` (excepción: ${p.excepcion.justificacion ?? 'sin justificación aún'})` : ''),
    ),
    `3) impacto = max(impacto_D, impacto_I, impacto_C) = ${ecuacion.impacto.toString()}`,
    `4) inherente = impacto × ARO = ${ecuacion.inherente.toString()}${bandaInherente ? ` (${bandaInherente})` : ''}` +
      (ecuacion.excepcionFrecuencia.activa
        ? ` (excepción de frecuencia: ${ecuacion.excepcionFrecuencia.justificacion ?? 'sin justificación aún'})`
        : ''),
    `5) eficacia = ${ecuacion.eficacia === null ? 'sin calcular' : porcentaje(ecuacion.eficacia)}` +
      (ecuacion.desgloseEficacia?.sinRelevanciaAsignada
        ? ' (sin relevancia asignada — media simple, techo no opera)'
        : ''),
    `6) ARO residual = ARO × (1 − e) = ${
      ecuacion.aroResidual === null ? 'sin calcular' : ecuacion.aroResidual.toString()
    }`,
    `7) residual = impacto × ARO_res = ${
      ecuacion.residual === null ? 'sin calcular' : ecuacion.residual.toString()
    }${bandaResidual ? ` (${bandaResidual})` : ''}`,
    'El impacto no cambia entre el paso 4 y el paso 7: la eficacia reduce la frecuencia, nunca el daño.',
  ];
  return lineas.join('\n');
}
