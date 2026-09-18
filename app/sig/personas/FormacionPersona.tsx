'use client';

// app/sig/personas/FormacionPersona.tsx
//
// La pestaña **Formación**: qué está cursando esta persona, qué cursó, y qué se decidió que
// no iba a cursar.
//
// ── POR QUÉ ESTO NO ES EL EXPEDIENTE ─────────────────────────────────────────────────────
//
// `/sig/colaboradores/[id]` ya tiene un bloque «Intentos de curso en línea» con cada intento,
// su hora, su tiempo y lo que el curso reportó. Esto no lo reemplaza: contesta otra pregunta.
// Acá se responde **«¿se formó?»**, que es lo que se pregunta mientras se le edita el
// contrato; allá se responde «¿qué pasó exactamente en el intento 2?», que se pregunta
// sentado. El enlace al final lleva de una a la otra.
//
// ── TRES GRUPOS, Y EL TERCERO ES EL QUE SUELE FALTAR ─────────────────────────────────────
//
// `NO_APLICA` y `ANULADA` no son «realizada» y no son «pendiente»: son decisiones que alguien
// tomó con motivo. Meterlas en cualquiera de los otros dos grupos convierte una exención
// documentada en una laguna o en un logro. Va colapsado porque casi siempre está vacío.
//
// ── UNA FORMACIÓN CERRADA NO TIENE AVANCE ────────────────────────────────────────────────
//
// Tiene resultado. Por eso el grupo de realizadas no pinta progreso: un «100%» al lado de
// «aprobó» sugiere dos hechos donde hay uno. El servidor ya manda `progreso` en `null` para
// todo lo que no está pendiente.

import Link from 'next/link';
import { useState } from 'react';

import { textoPlazo } from '@/lib/sig/bandeja';
import type { FilaFormacion } from '@/app/sig/acciones/persona-actividad';

const NOMBRE_TIPO: Record<string, string> = {
  CAPACITACION: 'Capacitación',
  CURSO_VIRTUAL: 'Curso virtual',
};

export default function FormacionPersona({
  personaId,
  enCurso,
  realizadas,
  noCursadas,
  error,
  administra,
}: {
  personaId: number;
  /// `null` mientras no llegaron. Vacío es «no tiene ninguna», que es otra cosa.
  enCurso: FilaFormacion[] | null;
  realizadas: FilaFormacion[] | null;
  noCursadas: FilaFormacion[] | null;
  error: string | null;
  administra: boolean;
}) {
  const [verNoCursadas, setVerNoCursadas] = useState(false);

  // P2 · sin el permiso no se pide nada, así que no se puede quedar «cargando» para siempre.
  if (!administra) {
    return (
      <p className="text-12 text-muted [text-wrap:pretty]">
        No se muestra: ver la formación de otra persona exige{' '}
        <code>personas:administrar</code>, que da el grupo Líderes SIG del Directorio.
      </p>
    );
  }
  if (error !== null) {
    return <p className="text-12 text-danger-text [text-wrap:pretty]">{error}</p>;
  }
  if (enCurso === null || realizadas === null || noCursadas === null) {
    return <p className="text-12_5 text-faint">Cargando su formación…</p>;
  }

  const nada = enCurso.length === 0 && realizadas.length === 0 && noCursadas.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {nada && (
        <p className="text-12 text-muted [text-wrap:pretty]">
          No tiene formación asignada. No es lo mismo que «no se formó»: acá sólo aparece la
          formación que el SIG le asignó — una capacitación externa que nadie registró como
          asignación no la conoce el sistema.
        </p>
      )}

      <Grupo titulo="En curso y pendiente" filas={enCurso} conPlazo />
      <Grupo titulo="Realizada" filas={realizadas} />

      {noCursadas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setVerNoCursadas((v) => !v)}
            aria-expanded={verNoCursadas}
            className="flex w-fit items-center gap-2 text-left"
          >
            <span className="etiqueta-campo text-9">
              No se va a cursar ({noCursadas.length})
            </span>
            <span className="text-10_5 text-accent-700">
              {verNoCursadas ? 'ocultar' : 'desplegar'}
            </span>
          </button>
          {verNoCursadas && (
            <>
              <p className="text-10_5 text-faint [text-wrap:pretty]">
                No son huecos: son decisiones que alguien tomó con motivo. Una exención
                documentada contada como pendiente sería una alarma falsa, y contada como
                realizada sería un cumplimiento que nadie cumplió.
              </p>
              <ul className="flex flex-col gap-1.5">
                {noCursadas.map((f) => (
                  <Fila key={f.asignacionId} f={f} conPlazo={false} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!nada && (
        <>
          <Link
            href={`/sig/colaboradores/${personaId}`}
            className="w-fit text-11_5 font-semibold text-accent-700 hover:underline"
          >
            Ver el expediente completo →
          </Link>
          <p className="text-10_5 leading-relaxed text-label [text-wrap:pretty]">
            Acá está si se formó. El expediente tiene cada intento con su hora, su tiempo y lo
            que el curso reportó.
          </p>
        </>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  filas,
  conPlazo = false,
}: {
  titulo: string;
  filas: FilaFormacion[];
  conPlazo?: boolean;
}) {
  if (filas.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="etiqueta-campo text-9">
        {titulo} ({filas.length})
      </span>
      <ul className="flex flex-col gap-1.5">
        {filas.map((f) => (
          <Fila key={f.asignacionId} f={f} conPlazo={conPlazo} />
        ))}
      </ul>
    </div>
  );
}

function Fila({ f, conPlazo }: { f: FilaFormacion; conPlazo: boolean }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-campo border border-border-default bg-subtle px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 text-12_5 text-primary">
          <span className="font-mono text-10_5 text-accent-700">{f.codigo}</span> {f.titulo}
        </span>
        <span className="shrink-0 font-mono text-9 uppercase text-label">
          {NOMBRE_TIPO[f.tipo] ?? f.tipo}
          {f.claseCurso !== null && ` · ${f.claseCurso.toLowerCase()}`}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {/* Pendiente: dónde está. Cerrada: cómo terminó. Nunca las dos cosas. */}
        {f.progreso !== null && (
          <span className="text-11 text-secondary">
            {f.progreso.etiqueta}
            {f.progreso.intentos > 1 &&
              ` · intento ${f.progreso.numero} de ${f.progreso.intentos}`}
            {f.progreso.ultimaActividadEn !== null &&
              ` · última actividad ${f.progreso.ultimaActividadEn}`}
          </span>
        )}
        {f.progreso === null && f.sinProgresoPorque !== null && (
          <span className="text-11 text-faint">{f.sinProgresoPorque}</span>
        )}

        {f.estado === 'REALIZADA' && (
          <span className="text-11 text-secondary">
            {f.aprobado === null
              ? 'Cerrada'
              : f.aprobado
                ? 'Aprobado'
                : 'No aprobado'}
            {/* `null` es «no reportó nota», que NO es un cero. Se dice así en vez de
                escribir un número que nadie midió. */}
            {f.calificacion === null
              ? ' · sin nota reportada'
              : ` · ${f.calificacion}${f.notaMinima === null ? '' : ` (mínimo ${f.notaMinima})`}`}
            {f.tiempoTotal !== null && ` · ${f.tiempoTotal}`}
          </span>
        )}

        {(f.estado === 'NO_APLICA' || f.estado === 'ANULADA') && (
          <span className="text-11" style={{ color: 'var(--hf-warn-text)' }}>
            {f.estado === 'NO_APLICA' ? 'No aplica' : 'Anulada'}
            {f.motivo !== null && ` · ${f.motivo}`}
          </span>
        )}
      </div>

      <span className="text-10_5 text-faint">
        {conPlazo
          ? textoPlazo({ vencida: f.vencida, dias: f.dias })
          : f.fechaCierre !== null
            ? `Cerrada el ${f.fechaCierre.slice(0, 10)}`
            : `Vencía el ${f.fechaLimite.slice(0, 10)}`}
      </span>
    </li>
  );
}
