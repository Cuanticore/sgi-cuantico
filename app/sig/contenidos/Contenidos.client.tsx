'use client';

// app/sig/contenidos/Contenidos.client.tsx
//
// Lista a la izquierda, ficha a la derecha, tal como el lienzo (lista 428px + ficha).

import { useState } from 'react';

export interface ContenidoFila {
  id: number;
  codigo: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  procedimientoOrigen: string | null;
  version: number;
  documentoCodigo: string | null;
  documentoNombre: string | null;
  documentoVersion: string | null;
  documentoUrl: string | null;
  modalidad: string | null;
  duracionHoras: number | null;
  exigeEvaluacion: boolean;
  notaMinima: number | null;
  items: { id: number; orden: number; texto: string; obligatorio: boolean; permiteNoAplica: boolean }[];
  asignadoPor: number;
}

export default function ContenidosClient({ contenidos }: { contenidos: ContenidoFila[] }) {
  const [seleccionado, setSeleccionado] = useState<number | null>(contenidos[0]?.id ?? null);
  const seleccion = contenidos.find((c) => c.id === seleccionado) ?? null;

  return (
    <main className="flex flex-1 gap-6 px-8 pt-7 pb-14">
      <div className="flex w-[428px] shrink-0 flex-col gap-2">
        <h1 className="titulo-pagina">Contenidos</h1>
        <p className="text-12_5 text-muted">{contenidos.length} activos</p>
        <div className="mt-3 flex flex-col gap-1">
          {contenidos.map((c) => (
            <button
              key={c.id}
              onClick={() => setSeleccionado(c.id)}
              className="flex flex-col gap-0.5 rounded-campo px-3 py-2.5 text-left transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
              style={{
                background: seleccionado === c.id ? 'var(--hf-brand-100)' : 'transparent',
              }}
            >
              <span className="flex items-center gap-2">
                <span
                  className="font-mono text-10_5"
                  style={{
                    color: seleccionado === c.id ? 'var(--hf-brand-nav)' : 'var(--hf-text-label)',
                  }}
                >
                  {c.codigo}
                </span>
                <span
                  className="rounded-[4px] px-1.5 py-0.5 font-mono text-8_5 uppercase"
                  style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
                >
                  {c.tipo}
                </span>
              </span>
              <span className="text-12_5 font-medium text-primary">{c.titulo}</span>
            </button>
          ))}
        </div>
      </div>

      {seleccion ? (
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-10_5" style={{ color: 'var(--hf-text-label)' }}>
                {seleccion.codigo} · versión {seleccion.version}
              </span>
              <h2 className="text-16 font-semibold text-primary">{seleccion.titulo}</h2>
              {seleccion.procedimientoOrigen && (
                <span className="font-mono text-11 text-muted">{seleccion.procedimientoOrigen}</span>
              )}
            </div>
          </div>

          <p className="text-12_5 text-muted [text-wrap:pretty]">{seleccion.descripcion}</p>

          {seleccion.tipo === 'LECTURA' && (
            <section className="flex flex-col gap-2 rounded-campo border border-border-field bg-surface p-4">
              <span className="etiqueta-campo">Documento referenciado</span>
              <span className="text-13 font-medium text-primary">
                {seleccion.documentoNombre ?? seleccion.documentoCodigo ?? '—'}
              </span>
              <span className="font-mono text-11 text-muted">
                {seleccion.documentoCodigo} · v{seleccion.documentoVersion}
              </span>
              <p
                className="rounded-campo px-3 py-2 text-11_5"
                style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
              >
                La gestión documental está fuera del alcance: el documento vive donde hoy se
                administra.
              </p>
            </section>
          )}

          {seleccion.tipo === 'CAPACITACION' && (
            <section className="flex flex-col gap-1 rounded-campo border border-border-field bg-surface p-4 text-12_5">
              <span className="text-muted">
                {seleccion.modalidad ?? 'Modalidad sin definir'} · {seleccion.duracionHoras ?? '—'} h
              </span>
              <span className="text-muted">
                {seleccion.exigeEvaluacion
                  ? `Exige evaluación · nota mínima ${seleccion.notaMinima ?? '—'}`
                  : 'Sin evaluación'}
              </span>
            </section>
          )}

          {seleccion.tipo === 'VERIFICACION' && (
            <section className="flex flex-col gap-2">
              <span className="etiqueta-campo">Ítems de verificación</span>
              {seleccion.items.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-3 rounded-campo border border-border-field bg-surface px-4 py-2.5"
                >
                  <span className="text-12_5 text-primary">
                    {i.orden}. {i.texto}
                  </span>
                  <span className="flex flex-none gap-1.5">
                    <span
                      className="rounded-[4px] px-1.5 py-0.5 font-mono text-9"
                      style={{
                        background: i.obligatorio ? 'var(--hf-brand-100)' : 'var(--hf-bg-app)',
                        color: 'var(--hf-brand-nav)',
                      }}
                    >
                      {i.obligatorio ? 'Obligatorio' : 'Opcional'}
                    </span>
                    <span
                      className="rounded-[4px] px-1.5 py-0.5 font-mono text-9"
                      style={{
                        background: i.permiteNoAplica ? 'var(--hf-warn-100)' : 'var(--hf-bg-app)',
                        color: 'var(--hf-warn-text)',
                      }}
                    >
                      {i.permiteNoAplica ? 'Admite N/A' : 'Sin N/A'}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          )}

          <p className="text-11_5 text-muted">
            Asignado por {seleccion.asignadoPor} obligación(es).
          </p>
        </div>
      ) : (
        <p className="text-12_5 text-muted">Sin contenidos.</p>
      )}
    </main>
  );
}