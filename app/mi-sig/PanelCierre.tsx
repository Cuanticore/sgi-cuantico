'use client';

// app/mi-sig/PanelCierre.tsx
//
// El panel lateral (396px) que el lienzo dibuja: un panel distinto por tipo de contenido.
// La validación vive en el servidor (R4) — acá solo se arma la petición.

import { useState } from 'react';
import type { TarjetaBandeja } from './bandeja.query';
import { cerrarAsignacion } from '@/app/sig/acciones/tareas';

export default function PanelCierre({
  tarjeta,
  alCerrar,
}: {
  tarjeta: TarjetaBandeja;
  alCerrar: () => void;
}) {
  const [versionLeida, setVersionLeida] = useState(false);
  const [asistio, setAsistio] = useState<boolean | null>(null);
  const [calificacion, setCalificacion] = useState('');
  const [respuestas, setRespuestas] = useState<Record<number, 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA'>>({});
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const esVerificacion = tarjeta.tipo === 'VERIFICACION';

  async function registrar() {
    setEnviando(true);
    setError(null);
    setMensaje(null);
    const bytes = archivo ? Array.from(new Uint8Array(await archivo.arrayBuffer())) : [];
    const resultado = await cerrarAsignacion(tarjeta.id, {
      versionLeida: tarjeta.tipo === 'LECTURA' && versionLeida ? `v${tarjeta.version}` : undefined,
      asistio: tarjeta.tipo === 'CAPACITACION' ? (asistio ?? undefined) : undefined,
      calificacion:
        tarjeta.tipo === 'CAPACITACION' && calificacion !== '' ? Number(calificacion) : undefined,
      nota: nota || undefined,
      respuestas:
        esVerificacion && Object.keys(respuestas).length > 0
          ? Object.entries(respuestas).map(([itemId, respuesta]) => ({
              itemId: Number(itemId),
              respuesta,
            }))
          : undefined,
      archivo:
        archivo && (tarjeta.tipo === 'TAREA' || tarjeta.tipo === 'CAPACITACION')
          ? { nombre: archivo.name, mime: archivo.type || 'application/octet-stream', bytes }
          : undefined,
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.mensaje);
    } else {
      setMensaje(resultado.mensaje);
      setTimeout(alCerrar, 900);
    }
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-[396px] flex-col overflow-y-auto bg-surface shadow-xl"
      style={{ borderLeft: '1px solid var(--hf-border-field)' }}
      aria-label="Cerrar asignación"
    >
      <header
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--hf-hairline-strong)' }}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-10_5 uppercase" style={{ color: 'var(--hf-text-label)' }}>
            {ETIQUETA[tarjeta.tipo]} · {tarjeta.codigo}
          </span>
          <h2 className="truncate text-15 font-semibold text-primary">{tarjeta.titulo}</h2>
        </div>
        <button
          onClick={alCerrar}
          aria-label="Cerrar panel"
          className="flex-none rounded-[5px] px-2 py-1 text-15 text-muted hover:bg-app focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          ✕
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-5 py-5">
        {tarjeta.tipo === 'LECTURA' && (
          <section className="flex flex-col gap-3">
            <div
              className="flex flex-col gap-1 rounded-campo px-4 py-3"
              style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-200)' }}
            >
              <span className="text-12 font-semibold" style={{ color: 'var(--hf-brand-nav)' }}>
                {tarjeta.documentoNombre ?? tarjeta.titulo}
              </span>
              <span className="font-mono text-10_5 text-muted">
                Versión {tarjeta.version}
                {tarjeta.documentoVersion ? ` · ${tarjeta.documentoVersion}` : ''}
              </span>
              {/*
                El lienzo pone «Abrir el documento →» acá, y con razón: pedirle a alguien que
                declare haber leído un documento que no puede abrir convierte el acuse en una
                formalidad. `documentoUrl` ya llegaba al cliente y nadie lo usaba.
              */}
              {tarjeta.documentoUrl && (
                <a
                  href={tarjeta.documentoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit text-12 font-semibold underline underline-offset-2"
                  style={{ color: 'var(--hf-brand-nav)' }}
                >
                  Abrir el documento →
                </a>
              )}
            </div>
            <label className="flex items-start gap-2 text-12_5 text-primary">
              <input
                type="checkbox"
                checked={versionLeida}
                onChange={(e) => setVersionLeida(e.target.checked)}
                className="mt-0.5"
              />
              Declaro haber leído la versión {tarjeta.version}
            </label>
            <p className="text-11_5 text-muted">Queda usuario, fecha, hora y versión leída.</p>
          </section>
        )}

        {tarjeta.tipo === 'CAPACITACION' && (
          <section className="flex flex-col gap-3">
            <span className="etiqueta-campo">Asistencia</span>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setAsistio(v)}
                  aria-pressed={asistio === v}
                  className="flex-1 rounded-campo px-3 py-2 text-12_5 font-medium"
                  style={{
                    background: asistio === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    color: asistio === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    border: '1px solid var(--hf-border-field)',
                  }}
                >
                  {v ? 'Asistió' : 'No asistió'}
                </button>
              ))}
            </div>
            {asistio && tarjeta.exigeEvaluacion && (
              <div className="flex flex-col gap-1.5">
                <label className="flex flex-col gap-1">
                  <span className="etiqueta-campo">Calificación</span>
                  <input
                    type="number"
                    value={calificacion}
                    onChange={(e) => setCalificacion(e.target.value)}
                    className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                    placeholder={`Mínima ${tarjeta.notaMinima ?? '—'}`}
                  />
                </label>
              </div>
            )}
            <p className="text-11_5 text-muted">
              La calificación se valida contra la nota mínima del contenido.
            </p>
          </section>
        )}

        {esVerificacion && (
          <section className="flex flex-col gap-3">
            <span className="etiqueta-campo">Ítems de verificación</span>
            {tarjeta.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1.5 rounded-campo border border-border-field bg-surface p-3"
              >
                <span className="text-12_5 font-medium text-primary">{item.texto}</span>
                <div className="flex gap-1.5">
                  {(['CUMPLE', 'NO_CUMPLE', 'NO_APLICA'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setRespuestas({ ...respuestas, [item.id]: v })}
                      aria-pressed={respuestas[item.id] === v}
                      disabled={v === 'NO_APLICA' && !item.permiteNoAplica}
                      className="rounded-campo px-2.5 py-1 text-11 font-medium disabled:opacity-40"
                      style={{
                        background:
                          respuestas[item.id] === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                        color:
                          respuestas[item.id] === v
                            ? 'var(--hf-brand-nav)'
                            : 'var(--hf-text-secondary-soft)',
                        border: '1px solid var(--hf-border-field)',
                      }}
                    >
                      {v === 'CUMPLE' ? 'Cumple' : v === 'NO_CUMPLE' ? 'No cumple' : 'No aplica'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {(tarjeta.tipo === 'TAREA' || tarjeta.tipo === 'CAPACITACION') && (
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Anexo · opcional</span>
            <input
              type="file"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
            />
            {/* El lienzo nombra qué se espera: un anexo sin ejemplo se deja vacío. */}
            <span className="text-11 text-muted">
              {archivo
                ? archivo.name
                : tarjeta.tipo === 'CAPACITACION'
                  ? 'Certificado o constancia · arrastra un archivo o busca en tu equipo'
                  : 'Arrastra un archivo o busca en tu equipo'}
            </span>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">
            {tarjeta.tipo === 'TAREA' ? 'Qué se hizo' : 'Nota'}
          </span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={4}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          />
        </label>

        {error && (
          <p
            className="rounded-campo px-3 py-2 text-12"
            style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
          >
            {error}
          </p>
        )}
        {mensaje && (
          <p
            className="rounded-campo px-3 py-2 text-12"
            style={{ background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }}
          >
            {mensaje}
          </p>
        )}
      </div>

      <footer
        className="flex items-center justify-end gap-2 px-5 py-4"
        style={{ borderTop: '1px solid var(--hf-hairline-strong)' }}
      >
        <button
          onClick={alCerrar}
          className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-muted"
        >
          Cancelar
        </button>
        <button
          onClick={registrar}
          disabled={enviando}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {enviando ? 'Guardando…' : 'Registrar'}
        </button>
      </footer>
    </aside>
  );
}

const ETIQUETA: Record<string, string> = {
  LECTURA: 'Lectura',
  VERIFICACION: 'Verificación',
  CAPACITACION: 'Capacitación',
  TAREA: 'Tarea',
};