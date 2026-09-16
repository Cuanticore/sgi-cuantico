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
import type { DesgloseEficacia, EcuacionResuelta } from '@/lib/sgsi/ecuacion';
import type { AporteClase } from '@/lib/sgsi/madurez';
import type { Catalogos } from './ficha.query';
import { criterioClase, rotuloClase, TONO_CLASE } from './clases-relevancia';

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

/// Puntos porcentuales: lo que una clase APORTA a la eficacia, que no es su media.
function puntos(valor: number): string {
  return `${(valor * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} pp`;
}

/// El reparto por clase del paso 5: presupuesto, media dentro de la clase y aporte. No
/// calcula nada — `desglosarEficaciaAmenaza` ya resolvió cada fila.
function FilaClase({ aporte }: { aporte: AporteClase }) {
  const renormalizado = Math.abs(aporte.presupuesto - aporte.presupuestoNominal) > 1e-9;
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 flex-none self-center rounded-[2px]"
          style={{ backgroundColor: TONO_CLASE[aporte.clase] }}
        />
        <span className="font-mono text-10_5 tracking-[0.06em] text-primary">
          {rotuloClase(aporte.clase)}
        </span>
        <span className="font-mono text-10_5 text-muted">
          {porcentaje(aporte.presupuesto)}
          {renormalizado && ` (nominal ${porcentaje(aporte.presupuestoNominal)}, renormalizado)`}
          {' · '}
          {aporte.controles} {aporte.controles === 1 ? 'control' : 'controles'} · media{' '}
          {porcentaje(aporte.media)}
        </span>
        <span className="ml-auto cifra text-12 text-primary">aporta {puntos(aporte.aporte)}</span>
      </div>
      <p className="pl-[18px] text-10_5 text-faint [text-wrap:pretty]">
        {criterioClase(aporte.clase)}
      </p>
    </li>
  );
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

          <DesgloseDelPaso5
            desglose={ecuacion.desgloseEficacia}
            eficacia={ecuacion.eficacia}
            abierto={pasoCincoAbierto}
            alternar={() => setPasoCincoAbierto((v) => !v)}
          />
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

/// REQ-SIG-21 §7 · el paso 5 dice CON QUÉ REGLA se calculó. Sin eso la diferencia entre una
/// amenaza v2 y una v3 es invisible en pantalla, y por eso el problema lo fue durante todo
/// el interino. Cero aritmética propia: cada cifra sale de `desglose.agregacion`, que
/// `desglosarEficaciaAmenaza` (lib/sgsi/madurez.ts) ya resolvió.
function DesgloseDelPaso5({
  desglose,
  eficacia,
  abierto,
  alternar,
}: {
  desglose: DesgloseEficacia | null;
  eficacia: number | null;
  abierto: boolean;
  alternar: () => void;
}) {
  if (desglose === null) {
    return (
      <p className="text-11_5 text-muted [text-wrap:pretty]">
        Esta amenaza no tiene controles mapeados: la eficacia es desconocida, no cero.
      </p>
    );
  }

  const agregacion = desglose.agregacion;
  const sinRelevancia = desglose.sinRelevanciaAsignada;

  return (
    <>
      {agregacion.error !== null ? (
        <p className="text-11_5 text-warn-text [text-wrap:pretty]">
          Eficacia sin calcular por un error de datos: {agregacion.error}
        </p>
      ) : agregacion.regla === 'media-simple' ? (
        <p className="text-11_5 text-warn-text [text-wrap:pretty]">
          {sinRelevancia
            ? 'Sin relevancia asignada a los controles de esta amenaza'
            : 'Sin control Principal designado en esta amenaza'}
          : los {agregacion.evaluados} controles evaluados pesan igual y el techo del
          principal no opera. Se calculó con la media simple (MET-SIG-01 v2); el método
          aprobado es la media ponderada acotada (v3 §7.4).
        </p>
      ) : (
        <p className="text-11_5 text-secondary [text-wrap:pretty]">
          Media ponderada acotada por el control principal (MET-SIG-01 v3 §7.4), con el
          presupuesto 70 / 20 / 10 de REQ-SIG-21 §4.
        </p>
      )}

      {agregacion.sinEvaluar > 0 && (
        <p className="text-11_5 text-muted [text-wrap:pretty]">
          {agregacion.sinEvaluar} de {agregacion.sinEvaluar + agregacion.evaluados} controles
          quedaron fuera de la media por no estar evaluados: «sin evaluar» es un juicio
          pendiente, no un L0.
        </p>
      )}

      {agregacion.regla === 'ponderada-acotada' && agregacion.error === null && (
        <ul className="flex flex-col gap-1.5">
          {agregacion.clases.map((c) => (
            <FilaClase key={c.clase} aporte={c} />
          ))}
          {agregacion.bruta !== null && agregacion.techo !== null && (
            <li className="text-11 text-muted [text-wrap:pretty]">
              Media ponderada {porcentaje(agregacion.bruta)} · techo del principal{' '}
              {porcentaje(agregacion.techo)} (eficacia del principal + δ).{' '}
              {agregacion.techoActua ? (
                <strong className="text-warn-text">
                  El techo actúa: la corta a {porcentaje(eficacia ?? 0)}. Subir el control
                  principal es lo único que mueve este riesgo.
                </strong>
              ) : (
                'El techo no actúa: el principal está por encima de la media.'
              )}
            </li>
          )}
        </ul>
      )}

      <button
        type="button"
        onClick={alternar}
        className="w-fit text-11_5 font-semibold text-accent-700 underline"
        aria-expanded={abierto}
      >
        {abierto
          ? 'Ocultar el detalle control por control'
          : 'Ver el detalle control por control'}
      </button>

      {abierto && (
        <ul className="flex flex-col gap-1">
          {desglose.controles.map((c) => (
            <li key={c.codigo} className="font-mono text-11 text-secondary">
              {c.codigo} · {c.relevancia ?? 'sin relevancia'}
              {c.esPrincipal ? ' · principal' : ''} ·{' '}
              {c.nivel === null ? 'sin evaluar' : `L${c.nivel} · ${porcentaje(c.eficaciaNivel)}`}
            </li>
          ))}
        </ul>
      )}
    </>
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
      (ecuacion.desgloseEficacia?.agregacion.regla === 'media-simple'
        ? ' (sin relevancia asignada — media simple MET-SIG-01 v2, el techo no opera)'
        : ''),
    // REQ-SIG-21 §7 · el acta del comité tiene que poder decir con qué regla salió el
    // número, no sólo cuál fue.
    ...(ecuacion.desgloseEficacia?.agregacion.clases ?? []).map(
      (c) =>
        `   ${c.clase} · ${porcentaje(c.presupuesto)} de presupuesto · ${c.controles} control(es)` +
        ` · media ${porcentaje(c.media)} · aporta ${(c.aporte * 100).toFixed(1)} pp`,
    ),
    ...(ecuacion.desgloseEficacia?.agregacion.techo != null
      ? [
          `   techo del principal = ${porcentaje(ecuacion.desgloseEficacia.agregacion.techo)}` +
            (ecuacion.desgloseEficacia.agregacion.techoActua
              ? ` — ACTÚA: recorta la media ponderada de ${porcentaje(ecuacion.desgloseEficacia.agregacion.bruta ?? 0)}`
              : ' — no actúa'),
        ]
      : []),
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
