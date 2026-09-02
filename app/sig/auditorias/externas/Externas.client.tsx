'use client';

// app/sig/auditorias/externas/Externas.client.tsx
//
// Lista con filtros y la ficha: entidad, fechas, alcance, el aviso de que el informe
// adjunto es obligatorio (C8) y los hallazgos capturados.

import { useMemo, useState } from 'react';
import NuevaExterna from './NuevaExterna.client';

export interface ExternaFila {
  id: number;
  entidad: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string | null;
  alcance: string;
  objeto: string;
  lider: string;
  cerrada: boolean;
  hallazgos: number;
}

const TIPO_BADGE: Record<string, { fondo: string; texto: string; etiqueta: string }> = {
  EXTERNA: { fondo: '#fdeeeb', texto: '#a52016', etiqueta: 'Certificación' },
  PROVEEDOR: { fondo: '#e8f4ef', texto: '#0b5c44', etiqueta: 'Proveedor' },
};

export default function ExternasClient({
  filas,
  personas,
}: {
  filas: ExternaFila[];
  personas: { id: number; nombre: string }[];
}) {
  const [filtro, setFiltro] = useState<'todas' | 'EXTERNA' | 'PROVEEDOR'>('todas');
  const [seleccion, setSeleccion] = useState<ExternaFila | null>(null);

  const visibles = useMemo(
    () => (filtro === 'todas' ? filas : filas.filter((f) => f.tipo === filtro)),
    [filas, filtro],
  );

  return (
    <main className="flex flex-1 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <h1 className="titulo-pagina">Auditorías externas y a proveedores</h1>
          <NuevaExterna personas={personas} />
        </div>
        <nav className="mt-4 flex items-center gap-2">
          {(['todas', 'EXTERNA', 'PROVEEDOR'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFiltro(t)}
              aria-pressed={filtro === t}
              className="rounded-chip px-3.5 py-1.5 text-12"
              style={{
                background: filtro === t ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: filtro === t ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: '1px solid var(--hf-border-field)',
              }}
            >
              {t === 'todas' ? 'Todas' : t === 'EXTERNA' ? 'Certificadora' : 'Segunda parte'} ·{' '}
              {t === 'todas' ? filas.length : filas.filter((f) => f.tipo === t).length}
            </button>
          ))}
        </nav>

        <div className="mt-4 flex flex-col gap-2">
          {visibles.map((f) => (
            <button
              key={f.id}
              onClick={() => setSeleccion(f)}
              className="flex items-center justify-between gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3 text-left"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                  style={(() => {
                    const b = TIPO_BADGE[f.tipo] ?? TIPO_BADGE.EXTERNA;
                    return { background: b.fondo, color: b.texto };
                  })()}
                >
                  {(TIPO_BADGE[f.tipo] ?? TIPO_BADGE.EXTERNA).etiqueta}
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-13 font-medium text-primary">{f.entidad}</span>
                  <span className="block font-mono text-10_5 text-muted">
                    {f.fechaInicio}
                    {f.fechaFin ? ` · ${f.fechaFin}` : ''} · {f.alcance}
                  </span>
                </div>
              </div>
              <div className="flex flex-none items-center gap-3">
                <span
                  className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                  style={
                    f.cerrada
                      ? { background: '#e6efe9', color: '#0b5c44' }
                      : { background: '#eef2f8', color: '#12437f' }
                  }
                >
                  {f.cerrada ? 'Cerrada' : 'En curso'}
                </span>
                <span className="font-mono text-11 text-muted">{f.hallazgos} hallazgo(s)</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {seleccion && (
        <aside className="ml-6 flex h-fit w-[356px] shrink-0 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
          <div className="flex items-start gap-3 border-b border-hairline px-5 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2">
                <span
                  className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 uppercase"
                  style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
                >
                  {seleccion.tipo === 'EXTERNA' ? 'Externa' : 'Proveedor'}
                </span>
                <span className="truncate text-13 font-semibold text-primary">
                  {seleccion.entidad}
                </span>
              </span>
              <span className="text-11_5 leading-snug text-muted">{seleccion.objeto}</span>
            </div>
            <button
              onClick={() => setSeleccion(null)}
              aria-label="Cerrar la ficha"
              className="flex-none text-14 text-muted"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4">
            {/* Los campos rotulados del lienzo. Antes eran una sola línea de prosa con la
                fecha, el líder y el objeto pegados por puntos: leíble como frase, inútil
                para buscar un dato concreto. */}
            <div className="grid grid-cols-2 gap-3.5">
              <Dato
                etiqueta="Fechas"
                valor={
                  seleccion.fechaFin
                    ? `${seleccion.fechaInicio} → ${seleccion.fechaFin}`
                    : `${seleccion.fechaInicio} → en curso`
                }
                mono
              />
              <Dato etiqueta="Auditor líder" valor={seleccion.lider} />
            </div>

            {/* El resultado se DERIVA: no hay campo que lo guarde, y no debería haberlo.
                Una auditoría cerrada sin hallazgos y otra cerrada con nueve no son el
                mismo resultado, y eso ya está en los datos. */}
            <Dato
              etiqueta="Resultado"
              valor={
                !seleccion.cerrada
                  ? 'En curso'
                  : seleccion.hallazgos === 0
                    ? 'Cerrada sin hallazgos'
                    : `Cerrada con ${seleccion.hallazgos} hallazgo(s)`
              }
              color={
                !seleccion.cerrada
                  ? 'var(--hf-warn-text)'
                  : seleccion.hallazgos === 0
                    ? 'var(--hf-accent-700)'
                    : 'var(--hf-danger-text)'
              }
            />

            <Dato etiqueta="Alcance" valor={seleccion.alcance} alto />

            <div className="flex flex-col gap-2">
              <Regla etiqueta="Informe" />
              {/* El lienzo dibuja la tarjeta del PDF con su «Descargar». No se pone un
                  enlace muerto: el modelo NO tiene dónde guardar el adjunto —ni
                  `Auditoria` ni `InformeAuditoria` tienen campo de archivo, y `Evidencia`
                  se ata a un control o a un registro de realizado, no a una auditoría—.
                  Decirlo es lo único honesto: un «Descargar» que no descarga es peor que
                  la ausencia, porque hace creer que el informe está guardado. */}
              <p
                className="rounded-tarjeta px-3.5 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
                style={{
                  background: 'var(--hf-warn-100)',
                  border: '1px solid var(--hf-warn-border)',
                  color: 'var(--hf-warn-text)',
                }}
              >
                <strong className="font-semibold">El adjunto no tiene dónde guardarse.</strong>{' '}
                C8 dice que el informe es obligatorio —una auditoría externa registrada sin su
                informe no es evidencia de nada—, y el modelo todavía no tiene el campo:{' '}
                <code className="font-mono">Evidencia</code> se ata a un control o a un
                registro de realizado, no a una auditoría. Falta una migración, y hasta
                entonces el informe vive donde hoy se administra.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Regla etiqueta="Hallazgos" cola={String(seleccion.hallazgos)} />
              <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
                {seleccion.hallazgos === 0
                  ? 'Ninguna nota de esta auditoría generó un hallazgo todavía.'
                  : `${seleccion.hallazgos} nota(s) se promovieron a Mejora: cada NC y cada OM abre un hallazgo con su origen tipado a esta auditoría.`}
              </p>
            </div>
          </div>
        </aside>
      )}
    </main>
  );
}

function Dato({
  etiqueta,
  valor,
  mono,
  alto,
  color,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  alto?: boolean;
  color?: string;
}) {
  return (
    <span className="flex flex-col gap-1.5">
      <span className="etiqueta-campo">{etiqueta}</span>
      <span
        className={`entrada-campo leading-relaxed ${mono ? 'font-mono text-12' : ''} ${alto ? 'min-h-[52px]' : ''}`}
        style={color ? { color, fontWeight: 500 } : undefined}
      >
        {valor}
      </span>
    </span>
  );
}

function Regla({ etiqueta, cola }: { etiqueta: string; cola?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
        {etiqueta}
      </span>
      <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
      {cola && <span className="font-mono text-9_5 text-label">{cola}</span>}
    </span>
  );
}