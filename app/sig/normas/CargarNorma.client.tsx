'use client';

// app/sig/normas/CargarNorma.client.tsx
//
// Reemplaza el `alert()` que decía «los numerales son un catálogo, no una constante del
// código». La frase era cierta y no había nada detrás.
//
// Tres pasos, y el del medio es el que importa: descargar la plantilla, ANALIZARLA para ver
// qué va a pasar con cada fila, y sólo entonces importar. El catálogo es normativo — los
// numerales son la referencia que citan las notas de auditoría — así que actualizar el
// título de uno ya auditado reescribe lo que esas notas señalan. Nada se aplica sin que
// alguien lo haya visto antes.

import { useState } from 'react';
import { analizarNormaExcel, importarNormaExcel } from '@/app/sig/acciones/normas';
import type { Lectura } from '@/lib/sig/plantilla-normas';

const COLOR_DECISION: Record<string, { fondo: string; texto: string; etiqueta: string }> = {
  AGREGAR: { fondo: 'var(--hf-accent-100)', texto: 'var(--hf-accent-700)', etiqueta: 'Agregar' },
  ACTUALIZAR: { fondo: 'var(--hf-warn-100)', texto: 'var(--hf-warn-text)', etiqueta: 'Actualizar' },
  SIN_CAMBIO: { fondo: 'var(--hf-hairline)', texto: 'var(--hf-text-muted)', etiqueta: 'Sin cambio' },
};

export default function CargarNorma({ normaId }: { normaId: number | null }) {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);

  function reiniciar() {
    setArchivo(null);
    setLectura(null);
    setAviso(null);
    setSoloErrores(false);
  }

  async function analizar() {
    if (!archivo || normaId === null) return;
    setOcupado(true);
    setAviso(null);
    const fd = new FormData();
    fd.set('normaId', String(normaId));
    fd.set('archivo', archivo);
    const r = await analizarNormaExcel(fd);
    setLectura(r.lectura);
    setAviso({ ok: r.ok, texto: r.mensaje });
    setOcupado(false);
  }

  async function importar() {
    if (!archivo || normaId === null) return;
    setOcupado(true);
    const fd = new FormData();
    fd.set('normaId', String(normaId));
    fd.set('archivo', archivo);
    const r = await importarNormaExcel(fd);
    setAviso({ ok: r.ok, texto: r.mensaje });
    setOcupado(false);
    if (r.ok && r.agregados + r.actualizados > 0) {
      setTimeout(() => window.location.reload(), 1600);
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        disabled={normaId === null}
        className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        Cargar norma
      </button>
    );
  }

  const visibles = lectura
    ? soloErrores
      ? lectura.filas.filter((f) => f.errores.length > 0)
      : lectura.filas
    : [];

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-15 font-bold text-primary">Cargar numerales desde Excel</h2>
        <button
          onClick={() => {
            setAbierto(false);
            reiniciar();
          }}
          className="text-12_5 text-muted"
        >
          Cerrar
        </button>
      </div>

      <ol className="flex flex-col gap-3">
        <li className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">1 · La plantilla</span>
          <p className="max-w-[74ch] text-11_5 text-muted [text-wrap:pretty]">
            Llega con los numerales que la norma ya tiene. Agregá los que falten al final y
            corregí los títulos que estén mal.
          </p>
          <a
            href={`/api/sig/plantilla-normas?normaId=${normaId}`}
            className="w-fit rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5 font-medium text-muted"
          >
            Descargar plantilla .xlsx
          </a>
        </li>

        <li className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">2 · Revisar antes de importar</span>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setLectura(null);
                setAviso(null);
              }}
              className="text-12_5"
            />
            <button
              onClick={analizar}
              disabled={!archivo || ocupado}
              className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5 font-medium text-muted disabled:opacity-50"
            >
              {ocupado ? 'Leyendo…' : 'Revisar archivo'}
            </button>
          </div>
        </li>
      </ol>

      {aviso && (
        <p
          className="text-12_5 [text-wrap:pretty]"
          style={{ color: aviso.ok ? 'var(--hf-text-secondary)' : 'var(--hf-danger-text)' }}
        >
          {aviso.texto}
        </p>
      )}

      {lectura && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['Agregar', lectura.agregar, 'var(--hf-accent-700)'],
              ['Actualizar', lectura.actualizar, 'var(--hf-warn-text)'],
              ['Sin cambio', lectura.sinCambio, 'var(--hf-text-muted)'],
              ['Con errores', lectura.conErrores, 'var(--hf-danger-text)'],
            ].map(([etiqueta, n, color]) => (
              <span
                key={String(etiqueta)}
                className="rounded-chip border border-border-field px-3 py-1 text-12"
                style={{ color: String(color) }}
              >
                {String(etiqueta)} · {String(n)}
              </span>
            ))}
            {lectura.conErrores > 0 && (
              <label className="ml-2 flex items-center gap-1.5 text-12 text-muted">
                <input
                  type="checkbox"
                  checked={soloErrores}
                  onChange={(e) => setSoloErrores(e.target.checked)}
                />
                Sólo las filas con errores
              </label>
            )}
          </div>

          <div className="max-h-[22rem] overflow-auto rounded-campo border border-border-field">
            <table className="w-full text-left text-12">
              <thead className="sticky top-0 bg-subtle">
                <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
                  <th className="px-3 py-2 font-semibold">Fila</th>
                  <th className="px-3 py-2 font-semibold">Numeral</th>
                  <th className="px-3 py-2 font-semibold">Título</th>
                  <th className="px-3 py-2 font-semibold">Auditable</th>
                  <th className="px-3 py-2 font-semibold">Qué va a pasar</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const d = COLOR_DECISION[f.decision];
                  const malo = f.errores.length > 0;
                  return (
                    <tr
                      key={f.fila}
                      className="border-t border-hairline"
                      style={malo ? { background: 'var(--hf-danger-bg)' } : undefined}
                    >
                      <td className="px-3 py-1.5 font-mono text-11 text-muted">{f.fila}</td>
                      <td className="px-3 py-1.5 font-mono">{f.numeral || '—'}</td>
                      <td className="px-3 py-1.5">
                        {f.titulo || '—'}
                        {malo && (
                          <span className="block text-11" style={{ color: 'var(--hf-danger-text)' }}>
                            {f.errores.join(' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{f.auditable ? 'Sí' : 'No'}</td>
                      <td className="px-3 py-1.5">
                        {malo ? (
                          <span className="text-11 font-semibold" style={{ color: 'var(--hf-danger-text)' }}>
                            No se importa
                          </span>
                        ) : (
                          <span
                            className="rounded-[3px] px-1.5 py-0.5 text-11 font-semibold"
                            style={{ background: d.fondo, color: d.texto }}
                          >
                            {d.etiqueta}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={importar}
              disabled={ocupado || lectura.agregar + lectura.actualizar === 0}
              className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--hf-accent-500)' }}
            >
              {ocupado
                ? 'Importando…'
                : `Importar ${lectura.agregar + lectura.actualizar} numeral(es)`}
            </button>
            <span className="text-11_5 text-muted">
              Las filas con errores y las que ya están iguales no se tocan.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
