'use client';

// app/components/sgsi/inventario/PopupImportacion.tsx
//
// Bulk import, start to finish, in one popup: download the template, fill it, upload it,
// see what it found, and only then commit.
//
// The middle step is the point. An import that writes straight from the file leaves the
// person guessing which rows made it in; this one validates first, shows the verdict row
// by row with the line number, and asks before writing anything. Rows with errors are
// listed rather than silently dropped — a skipped row nobody was told about is the defect
// this screen exists to avoid.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Popup from '@/app/components/sgsi/Popup';
import { analizarPlantilla, importarPlantilla } from '@/app/sgsi/acciones/importar';
import { COLUMNAS_PLANTILLA, COLUMNAS_PREVISTA, type Analisis } from '@/lib/sgsi/plantilla';

interface Props {
  onCerrar: () => void;
}

type Estado = 'inicio' | 'analizando' | 'revision' | 'importando' | 'listo';

const ENCABEZADO = new Map(COLUMNAS_PLANTILLA.map((c) => [c.clave, c.encabezado]));

export default function PopupImportacion({ onCerrar }: Props) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>('inicio');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);

  const trabajando = estado === 'analizando' || estado === 'importando';
  // The import button has to stay on screen while the import runs, so the review step
  // covers both states rather than flipping back to "validate" mid-write.
  const enRevision = estado === 'revision' || estado === 'importando';

  const elegir = (f: File | null): void => {
    setArchivo(f);
    setAnalisis(null);
    setAviso(null);
    setEstado('inicio');
  };

  const validar = async (): Promise<void> => {
    if (!archivo) return;
    setEstado('analizando');
    setAviso(null);
    const datos = new FormData();
    datos.append('archivo', archivo);
    const r = await analizarPlantilla(datos);
    setAnalisis(r);
    if (r.ok) {
      setEstado('revision');
      setSoloErrores(r.conErrores > 0);
    } else {
      setEstado('inicio');
      setAviso({ ok: false, texto: r.mensaje });
    }
  };

  const importar = async (): Promise<void> => {
    if (!archivo) return;
    setEstado('importando');
    const datos = new FormData();
    datos.append('archivo', archivo);
    const r = await importarPlantilla(datos);
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) {
      setEstado('listo');
      // The inventory, the matrices and the counters all move with this, so the whole
      // route re-renders rather than patching the grid in place.
      router.refresh();
    } else {
      setEstado('revision');
    }
  };

  const filasVisibles =
    analisis?.filas.filter((f) => !soloErrores || f.errores.length > 0) ?? [];

  return (
    <Popup
      titulo="Importar activos desde plantilla"
      subtitulo="Descargá la plantilla, llenala y volvé a subirla acá. Antes de escribir nada te muestro fila por fila qué encontré."
      ancho={1020}
      onCerrar={onCerrar}
      pie={
        <>
          {estado === 'listo' ? (
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors"
              style={{ background: 'var(--hf-accent-500)' }}
            >
              Listo
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCerrar}
                disabled={trabajando}
                className="rounded-campo border border-border-field px-3 py-2 text-12 text-muted transition-colors hover:bg-subtle disabled:opacity-50"
              >
                Cancelar
              </button>
              {enRevision && analisis && analisis.validas > 0 ? (
                <button
                  type="button"
                  onClick={importar}
                  disabled={trabajando}
                  className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: 'var(--hf-accent-500)' }}
                >
                  {estado === 'importando'
                    ? 'Importando…'
                    : `Importar ${analisis.validas} ${analisis.validas === 1 ? 'activo' : 'activos'}`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={validar}
                  disabled={!archivo || trabajando}
                  className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: 'var(--hf-accent-500)' }}
                >
                  {estado === 'analizando' ? 'Validando…' : 'Validar archivo'}
                </button>
              )}
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {aviso && (
          <div
            role="status"
            className="rounded-campo border px-3.5 py-3 text-12_5 [text-wrap:pretty]"
            style={
              aviso.ok
                ? {
                    background: 'var(--hf-accent-100)',
                    borderColor: 'var(--hf-accent-border)',
                    color: 'var(--hf-accent-700)',
                  }
                : {
                    background: 'var(--hf-danger-bg)',
                    borderColor: 'var(--hf-danger-border)',
                    color: 'var(--hf-danger-text)',
                  }
            }
          >
            {aviso.texto}
          </div>
        )}

        {/* Step 1 — the template. Generated from the database on every download, so its
            list of valid types, subtypes, areas and roles is never stale. */}
        <section className="rounded-campo border border-hairline-strong bg-app px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-12_5 font-bold text-primary">1 · Descargá la plantilla</span>
              <span className="max-w-[68ch] text-11_5 text-muted [text-wrap:pretty]">
                Trae los valores válidos de tipos, subtipos, procesos, cargos y la escala de
                valoración tal como están hoy en la base. El código del activo no se llena: lo
                emite el sistema.
              </span>
            </div>
            <a
              href="/api/sgsi/plantilla-activos"
              className="flex-none rounded-campo border border-accent-border bg-accent-100 px-3.5 py-2 text-12_5 font-semibold text-accent-700 transition-colors hover:bg-accent-border"
            >
              Descargar plantilla .xlsx
            </a>
          </div>
        </section>

        {/* Step 2 — the file. */}
        <section className="rounded-campo border border-hairline-strong bg-app px-4 py-3.5">
          <div className="flex flex-col gap-2.5">
            <span className="text-12_5 font-bold text-primary">2 · Subí el archivo lleno</span>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={entrada}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => elegir(e.target.files?.[0] ?? null)}
                disabled={trabajando}
                className="text-12 text-secondary file:mr-3 file:rounded-campo file:border file:border-border-field file:bg-surface file:px-3 file:py-1.5 file:text-12 file:font-semibold file:text-secondary hover:file:bg-subtle"
              />
              {archivo && (
                <span className="font-mono text-11 text-faint">
                  {(archivo.size / 1024).toFixed(0)} KB
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Step 3 — the verdict, before anything is written. */}
        {analisis?.ok && (
          <section className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-12_5 font-bold text-primary">3 · Revisá lo que encontré</span>
                <span className="text-11_5 text-muted">{analisis.mensaje}</span>
              </div>
              <div className="flex items-center gap-2">
                <Chip
                  texto={`${analisis.validas} listas`}
                  fondo="var(--hf-accent-100)"
                  borde="var(--hf-accent-border)"
                  color="var(--hf-accent-700)"
                />
                {analisis.conErrores > 0 && (
                  <Chip
                    texto={`${analisis.conErrores} con errores`}
                    fondo="var(--hf-danger-bg)"
                    borde="var(--hf-danger-border)"
                    color="var(--hf-danger-text)"
                  />
                )}
              </div>
            </div>

            {analisis.conErrores > 0 && (
              <label className="flex items-center gap-2 text-11_5 text-secondary">
                <input
                  type="checkbox"
                  checked={soloErrores}
                  onChange={(e) => setSoloErrores(e.target.checked)}
                  className="accent-accent-500"
                />
                Mostrar sólo las filas con errores
              </label>
            )}

            <div className="overflow-x-auto rounded-campo border border-hairline-strong">
              <table className="w-full border-collapse text-11_5" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="bg-subtle text-left">
                    <th className="border-b border-hairline-strong px-2.5 py-2 font-mono text-10 tracking-[0.06em] text-label">
                      FILA
                    </th>
                    {COLUMNAS_PREVISTA.map((c) => (
                      <th
                        key={c}
                        className="border-b border-hairline-strong px-2.5 py-2 font-semibold text-secondary whitespace-nowrap"
                      >
                        {ENCABEZADO.get(c) ?? c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasVisibles.map((f) => {
                    const mal = f.errores.length > 0;
                    return (
                      <tr key={f.fila} style={mal ? { background: 'var(--hf-danger-bg)' } : undefined}>
                        <td className="border-b border-hairline-faint px-2.5 py-2 align-top font-mono text-10 text-faint">
                          {f.fila}
                        </td>
                        {COLUMNAS_PREVISTA.map((c) => (
                          <td
                            key={c}
                            className="border-b border-hairline-faint px-2.5 py-2 align-top text-secondary"
                          >
                            {f.lectura[c]?.trim() ? (
                              f.lectura[c]
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {analisis.conErrores > 0 && (
              <ul className="flex flex-col gap-1.5">
                {analisis.filas
                  .filter((f) => f.errores.length > 0)
                  .map((f) => (
                    <li
                      key={f.fila}
                      className="rounded-campo border px-3 py-2 text-11_5 [text-wrap:pretty]"
                      style={{
                        background: 'var(--hf-danger-bg)',
                        borderColor: 'var(--hf-danger-border)',
                        color: 'var(--hf-danger-text)',
                      }}
                    >
                      <span className="font-mono text-10">FILA {f.fila}</span>{' '}
                      <span className="font-semibold">
                        {f.lectura.nombre?.trim() || f.lectura.codigoHeredado?.trim() || 'sin nombre'}
                      </span>
                      {' — '}
                      {f.errores.join(' ')}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Popup>
  );
}

function Chip({
  texto,
  fondo,
  borde,
  color,
}: {
  texto: string;
  fondo: string;
  borde: string;
  color: string;
}) {
  return (
    <span
      className="rounded-chip border px-2.5 py-1 text-11 font-semibold"
      style={{ background: fondo, borderColor: borde, color }}
    >
      {texto}
    </span>
  );
}
