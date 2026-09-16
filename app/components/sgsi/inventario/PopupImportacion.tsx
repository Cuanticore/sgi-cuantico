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
import { useBloqueoDeSalida } from '@/app/lib/useBloqueoDeSalida';
import ResolucionFaltantes from './ResolucionFaltantes';
import type { Resolucion } from '@/lib/sgsi/catalogos-curables';
import { useRouter } from 'next/navigation';
import Popup from '@/app/components/sgsi/Popup';
import { analizarPlantilla, importarPlantilla } from '@/app/sgsi/acciones/importar';
import { COLUMNAS_PLANTILLA, COLUMNAS_PREVISTA, type Analisis } from '@/lib/sgsi/plantilla';
import type { BloqueParte, LineaParte, ParteConsolidado, Sustitucion } from '@/lib/sgsi/consolidado';

interface Props {
  onCerrar: () => void;
}

type Estado = 'inicio' | 'analizando' | 'revision' | 'importando' | 'listo';

const ENCABEZADO = new Map(COLUMNAS_PLANTILLA.map((c) => [c.clave, c.encabezado]));

/// How many lines of a block are shown before the "ver todas" toggle.
///
/// The real workbook has a block with 67 rejected lines and another with 58 warnings.
/// Printing them all would push the acceptance criteria — the part that says whether the
/// load is any good — several screens below the fold, so each list opens closed and, once
/// opened, scrolls inside its own box instead of stretching the popup.
const TOPE_LINEAS = 8;

export default function PopupImportacion({ onCerrar }: Props) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>('inicio');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);
  // Which capped lists the person opened, keyed by block and kind. Kept here and not in
  // each list so choosing another file starts the report closed again.
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  // Lo que la persona decidió sobre los nombres que el catálogo no tiene. Vive acá y no en
  // `ResolucionFaltantes` porque viaja en las DOS peticiones: revalidar con las decisiones
  // puestas, y después importar con ellas.
  const [resoluciones, setResoluciones] = useState<Resolucion[]>([]);

  const trabajando = estado === 'analizando' || estado === 'importando';

  // Recargar en medio de esto no cancela nada del lado del servidor: deja el trabajo
  // corriendo sin nadie que lea el resultado.
  useBloqueoDeSalida(trabajando);

  const faltantes = analisis?.faltantes ?? [];
  /// Cuántos nombres siguen sin decisión completa. Un «mapear» sin destino elegido cuenta
  /// como pendiente: la mitad de una decisión no es una decisión.
  const sinDecidir = faltantes.filter((f) => {
    const r = resoluciones.find(
      (x) =>
        x.catalogo === f.catalogo &&
        x.valor.trim().toLocaleLowerCase('es') === f.valor.trim().toLocaleLowerCase('es'),
    );
    if (!r) return true;
    // Un «mapear» sin destino y un «crear» con el nombre borrado son media decisión, que no
    // es una decisión. El servidor los rechaza igual; contarlos acá evita el viaje.
    return r.accion === 'mapear' ? r.destino === '' : r.nombre.trim() === '';
  }).length;
  // The import button has to stay on screen while the import runs, so the review step
  // covers both states rather than flipping back to "validate" mid-write.
  const enRevision = estado === 'revision' || estado === 'importando';

  const elegir = (f: File | null): void => {
    setArchivo(f);
    setAnalisis(null);
    setAviso(null);
    setAbiertas({});
    // Otro archivo nombra otros faltantes: conservar lo decidido para el anterior haría que
    // la carga escribiera decisiones que nadie tomó sobre ESTE libro.
    setResoluciones([]);
    setEstado('inicio');
  };

  /// El formulario con el archivo y lo decidido hasta ahora.
  const formulario = (f: File): FormData => {
    const datos = new FormData();
    datos.append('archivo', f);
    if (resoluciones.length > 0) datos.append('resoluciones', JSON.stringify(resoluciones));
    return datos;
  };

  /// Cerrar con trabajo en curso pide confirmación con palabras nuestras.
  ///
  /// El diálogo del navegador no deja elegir el texto —muestra el suyo genérico—, así que
  /// este es el único punto donde se puede explicar qué se está perdiendo.
  const cerrar = (): void => {
    if (
      trabajando &&
      !window.confirm(
        estado === 'importando'
          ? 'La importación está corriendo. Si cierras ahora no vas a saber si los activos entraron, y volver a importar el mismo archivo crearía otro juego de activos. ¿Cerrar de todas formas?'
          : '¿Cerrar y descartar la validación en curso?'
      )
    ) {
      return;
    }
    onCerrar();
  };

  const alternarLista = (clave: string): void => {
    setAbiertas((previo) => ({ ...previo, [clave]: !previo[clave] }));
  };

  const validar = async (): Promise<void> => {
    if (!archivo) return;
    setEstado('analizando');
    setAviso(null);
    const r = await analizarPlantilla(formulario(archivo));
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
    const r = await importarPlantilla(formulario(archivo));
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
      subtitulo="Descarga la plantilla, llénala y vuelve a subirla acá. Antes de escribir nada te muestro fila por fila qué encontré."
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
                onClick={cerrar}
                className="rounded-campo border border-border-field px-3 py-2 text-12 text-muted transition-colors hover:bg-subtle"
              >
                Cancelar
              </button>
              {faltantes.length > 0 ? (
                <button
                  type="button"
                  onClick={validar}
                  disabled={!archivo || trabajando || sinDecidir > 0}
                  className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: 'var(--hf-accent-500)' }}
                >
                  {/* No dice «Importar»: lo que hace es volver a validar con las decisiones
                      puestas. Recién cuando no queden nombres sin registrar aparece el botón
                      que escribe. */}
                  {estado === 'analizando'
                    ? 'Revalidando…'
                    : sinDecidir > 0
                      ? `Faltan ${sinDecidir} por decidir`
                      : 'Aplicar y revalidar'}
                </button>
              ) : enRevision && analisis && analisis.validas > 0 ? (
                <button
                  type="button"
                  onClick={importar}
                  disabled={trabajando}
                  className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: 'var(--hf-accent-500)' }}
                >
                  {/* El botón nombra la parte irreversible. «Importar 299 activos» es
                      verdad y está incompleto: describe lo que entra y calla lo que se va,
                      que es lo único que no se puede deshacer. */}
                  {estado === 'importando'
                    ? 'Importando…'
                    : analisis.consolidado?.sustitucion
                      ? `Borrar ${analisis.consolidado.sustitucion.activos} e importar ${analisis.validas}`
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

        {/* Mientras algo corre, una barra que se mueve y dice EN QUÉ va.
            Un botón que dice «Validando…» y no cambia en treinta segundos no distingue
            trabajo de cuelgue, y la salida que invita es recargar — que es justo lo que no
            hay que hacer. */}
        {trabajando && (
          <div
            role="status"
            aria-live="polite"
            aria-busy
            className="flex flex-col gap-2 rounded-campo border border-accent-border bg-accent-100 px-3.5 py-3"
          >
            <span className="text-12_5 font-semibold text-accent-700">
              {estado === 'analizando'
                ? 'Leyendo el archivo y revisando fila por fila contra los catálogos…'
                : 'Escribiendo los activos. No cierres ni recargues esta ventana.'}
            </span>
            <span className="text-11_5 text-accent-700 [text-wrap:pretty]">
              {estado === 'analizando'
                ? 'Todavía no se escribe nada: este paso sólo mira.'
                : 'Todo entra en una sola transacción, así que no queda medio inventario cargado.'}
            </span>
            <div className="h-1 overflow-hidden rounded-full bg-accent-border">
              <div className="h-full w-1/3 animate-[barrido_1.4s_ease-in-out_infinite] rounded-full bg-accent-700" />
            </div>
            <style>{'@keyframes barrido{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
          </div>
        )}

        {/* Los nombres que el catálogo no tiene. Van ARRIBA del parte de filas porque
            bloquean la carga y porque no son errores del archivo: son decisiones. */}
        {analisis?.faltantes && analisis.faltantes.length > 0 && analisis.opciones && (
          <section className="rounded-campo border border-hairline-strong bg-app px-4 py-3.5">
            <span className="text-12_5 font-bold text-primary">
              Nombres sin registrar
            </span>
            <div className="mt-2.5">
              <ResolucionFaltantes
                faltantes={analisis.faltantes}
                opciones={analisis.opciones}
                resoluciones={resoluciones}
                onCambiar={setResoluciones}
                deshabilitado={trabajando}
              />
            </div>
          </section>
        )}

        {/* Step 1 — the template. Generated from the database on every download, so its
            list of valid types, subtypes, areas and roles is never stale. */}
        <section className="rounded-campo border border-hairline-strong bg-app px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-12_5 font-bold text-primary">1 · Descarga la plantilla</span>
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
            <span className="text-12_5 font-bold text-primary">2 · Sube el archivo lleno</span>
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
                <span className="text-12_5 font-bold text-primary">3 · Revisa lo que encontré</span>
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
                {analisis.consolidado
                  ? 'Mostrar sólo lo rechazado'
                  : 'Mostrar sólo las filas con errores'}
              </label>
            )}

            {/* El consolidado no se dibuja con la prevista por columnas: sus filas no traen
                las claves de la plantilla, así que esa tabla saldría vacía. Va su propio
                parte, y el resto de la pantalla queda igual que siempre. */}
            {analisis.consolidado ? (
              <ParteDelConsolidado
                parte={analisis.consolidado}
                soloRechazadas={soloErrores}
                abiertas={abiertas}
                onAlternar={alternarLista}
              />
            ) : (
              <>
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
              </>
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

/// The V19 consolidated load, sheet by sheet.
///
/// The template path is one sheet of rows, so a table with a verdict column says everything.
/// The consolidated file is four blocks with their own counts, and the question it has to
/// answer at a glance is not "how many failed" but "what do I fix where": in the workbook,
/// or in the app afterwards.
/// Lo que la carga va a BORRAR, antes de que nadie confirme.
///
/// **Va primero y no al final del parte.** El resto del informe cuenta qué ENTRA; esto cuenta
/// qué SE VA, y es lo único de esta pantalla que no tiene vuelta atrás. Un aviso que hay que
/// buscar después de sesenta líneas de avisos no es un aviso.
///
/// Los riesgos con decisión humana se destacan aparte del total a propósito: los derivados se
/// recalculan solos, pero un tratamiento o una justificación son trabajo del SGSI y no
/// vuelven. Cuando ese número es cero se dice también — «no hay ninguno» es exactamente el
/// dato que deja confirmar tranquilo, y callarlo obligaría a suponerlo.
function AvisoDeSustitucion({ s }: { s: Sustitucion }) {
  const otros = [
    ['valoraciones', s.valoraciones],
    ['dependencias', s.dependencias],
    ['despliegues', s.despliegues],
    ['actas de borrado', s.actasBorrado],
    ['activos afectados por eventos', s.activosAfectados],
    ['asignaciones por activo', s.asignaciones],
  ].filter(([, n]) => (n as number) > 0);

  return (
    <section
      className="flex flex-col gap-2 rounded-campo border p-3"
      style={{ borderColor: 'var(--hf-danger-border)', background: 'var(--hf-danger-bg)' }}
    >
      <p className="text-12_5 font-semibold" style={{ color: 'var(--hf-danger-text)' }}>
        Esto SUSTITUYE al inventario: primero borra, después carga.
      </p>
      <p className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
        El Consolidado trae los códigos definitivos, y muchos ya están en uso apuntando a otro
        activo. Por eso la carga no puede escribir encima: borra el inventario actual y lo
        reemplaza. <strong className="font-semibold">No se puede deshacer.</strong>
      </p>
      <ul className="flex flex-col gap-0.5 text-11_5 text-secondary">
        <li>
          <strong className="font-semibold">{s.activos}</strong> activos y su valoración
        </li>
        <li>
          <strong className="font-semibold">{s.riesgos}</strong> riesgos —{' '}
          {s.riesgosConDecision === 0 ? (
            <>ninguno tiene tratamiento, estado, responsable ni justificación cargados</>
          ) : (
            <strong className="font-semibold" style={{ color: 'var(--hf-danger-text)' }}>
              {s.riesgosConDecision} con decisiones humanas que no se recuperan
            </strong>
          )}
        </li>
        {otros.map(([etiqueta, n]) => (
          <li key={etiqueta as string}>
            <strong className="font-semibold">{n as number}</strong> {etiqueta as string}
          </li>
        ))}
      </ul>
      <p className="text-11 text-muted">
        Los riesgos se vuelven a generar desde la valoración de los activos nuevos.
      </p>
    </section>
  );
}

function ParteDelConsolidado({
  parte,
  soloRechazadas,
  abiertas,
  onAlternar,
}: {
  parte: ParteConsolidado;
  soloRechazadas: boolean;
  abiertas: Record<string, boolean>;
  onAlternar: (clave: string) => void;
}) {
  // The filter keeps the meaning it has on the template path: hide everything that did load.
  // A block with nothing rejected has nothing left to show, so it leaves the list entirely.
  const bloques = soloRechazadas
    ? parte.bloques.filter((b) => b.rechazadas.length > 0)
    : parte.bloques;

  return (
    <div className="flex flex-col gap-3">
      {parte.sustitucion && <AvisoDeSustitucion s={parte.sustitucion} />}
      {bloques.map((b) => (
        <BloqueDelParte
          key={`${b.hoja}\u0000${b.titulo}`}
          bloque={b}
          soloRechazadas={soloRechazadas}
          abiertas={abiertas}
          onAlternar={onAlternar}
        />
      ))}

      {soloRechazadas && bloques.length === 0 && (
        <p className="text-11_5 text-muted">No hay líneas rechazadas: entró todo el archivo.</p>
      )}

      {parte.seriesSinContador.length > 0 && (
        <section className="flex flex-col gap-1.5 rounded-campo border border-hairline-strong bg-app px-3.5 py-3">
          <span className="text-12_5 font-bold text-primary">Series sin contador</span>
          <span className="max-w-[80ch] text-11_5 text-muted [text-wrap:pretty]">
            Estas series conservan el código que trae el libro, pero la app no puede emitir
            códigos nuevos para ellas. Nada queda sin cargar por esto.
          </span>
          <ul className="flex flex-col gap-1">
            {parte.seriesSinContador.map((s) => (
              <li key={s.serie} className="text-11_5 text-secondary [text-wrap:pretty]">
                <span className="font-mono text-11 text-primary">{s.serie}</span>
                {' — '}
                {s.motivo}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Vacío en la validación: los criterios se miden sobre lo escrito, y todavía no se
          escribió nada. Aparecen recién en el parte de la importación. */}
      {parte.criterios.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <span className="text-12_5 font-bold text-primary">Criterios de aceptación</span>
          <div className="overflow-x-auto rounded-campo border border-hairline-strong">
            <table className="w-full border-collapse text-11_5" style={{ minWidth: 760 }}>
              <thead>
                <tr className="bg-subtle text-left">
                  <th className="border-b border-hairline-strong px-2.5 py-2 font-mono text-10 tracking-[0.06em] text-label">
                    N°
                  </th>
                  {['Criterio', 'Esperado', 'Obtenido', 'Resultado'].map((c) => (
                    <th
                      key={c}
                      className="border-b border-hairline-strong px-2.5 py-2 font-semibold text-secondary whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parte.criterios.map((c) => (
                  <tr
                    key={c.numero}
                    style={c.cumple ? undefined : { background: 'var(--hf-danger-bg)' }}
                  >
                    <td className="border-b border-hairline-faint px-2.5 py-2 align-top font-mono text-10 text-faint">
                      {c.numero}
                    </td>
                    <td className="border-b border-hairline-faint px-2.5 py-2 align-top text-secondary [text-wrap:pretty]">
                      {c.texto}
                    </td>
                    <td className="border-b border-hairline-faint px-2.5 py-2 align-top text-secondary">
                      {c.esperado}
                    </td>
                    <td className="border-b border-hairline-faint px-2.5 py-2 align-top text-secondary">
                      {c.obtenido}
                    </td>
                    <td className="border-b border-hairline-faint px-2.5 py-2 align-top whitespace-nowrap">
                      <span
                        className="font-semibold"
                        style={{
                          color: c.cumple ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
                        }}
                      >
                        {c.cumple ? '✓ Cumple' : '✗ No cumple'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function BloqueDelParte({
  bloque,
  soloRechazadas,
  abiertas,
  onAlternar,
}: {
  bloque: BloqueParte;
  soloRechazadas: boolean;
  abiertas: Record<string, boolean>;
  onAlternar: (clave: string) => void;
}) {
  const base = `${bloque.hoja}\u0000${bloque.titulo}`;

  return (
    <section className="rounded-campo border border-hairline-strong bg-app">
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-hairline-faint px-3.5 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-12_5 font-bold text-primary">{bloque.titulo}</span>
          <span className="text-11 text-faint">Hoja «{bloque.hoja}»</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            texto={`${bloque.cargadas} cargadas`}
            fondo="var(--hf-accent-100)"
            borde="var(--hf-accent-border)"
            color="var(--hf-accent-700)"
          />
          {bloque.rechazadas.length > 0 && (
            <Chip
              texto={`${bloque.rechazadas.length} rechazadas`}
              fondo="var(--hf-danger-bg)"
              borde="var(--hf-danger-border)"
              color="var(--hf-danger-text)"
            />
          )}
          {bloque.avisos.length > 0 && (
            <Chip
              texto={`${bloque.avisos.length} con aviso`}
              fondo="var(--hf-warn-100)"
              borde="var(--hf-warn-border)"
              color="var(--hf-warn-text)"
            />
          )}
        </div>
      </header>

      {(bloque.rechazadas.length > 0 || (!soloRechazadas && bloque.avisos.length > 0)) && (
        <div className="flex flex-col gap-3 px-3.5 py-3">
          {bloque.rechazadas.length > 0 && (
            <ListaDeLineas
              etiqueta="RECHAZADA"
              encabezado="No entraron: hay que corregir el archivo y volver a subirlo."
              lineas={bloque.rechazadas}
              fondo="var(--hf-danger-bg)"
              borde="var(--hf-danger-border)"
              color="var(--hf-danger-text)"
              abierta={abiertas[`${base}\u0000rechazadas`] === true}
              onAlternar={() => onAlternar(`${base}\u0000rechazadas`)}
            />
          )}
          {!soloRechazadas && bloque.avisos.length > 0 && (
            <ListaDeLineas
              etiqueta="AVISO"
              encabezado="Entraron: queda algo por completar desde la app."
              lineas={bloque.avisos}
              fondo="var(--hf-warn-100)"
              borde="var(--hf-warn-border)"
              color="var(--hf-warn-text)"
              abierta={abiertas[`${base}\u0000avisos`] === true}
              onAlternar={() => onAlternar(`${base}\u0000avisos`)}
            />
          )}
        </div>
      )}
    </section>
  );
}

/// Una tanda de líneas del parte, con su consecuencia escrita adelante.
///
/// La etiqueta va también en CADA línea, y no sólo en el encabezado del grupo: con 67 líneas
/// la lista scrollea y el encabezado se pierde de vista, y ahí el color sería lo único que
/// separaría «no entró» de «entró con algo pendiente» — que es la distinción que el parte
/// existe para responder.
function ListaDeLineas({
  etiqueta,
  encabezado,
  lineas,
  fondo,
  borde,
  color,
  abierta,
  onAlternar,
}: {
  etiqueta: string;
  encabezado: string;
  lineas: LineaParte[];
  fondo: string;
  borde: string;
  color: string;
  abierta: boolean;
  onAlternar: () => void;
}) {
  const visibles = abierta ? lineas : lineas.slice(0, TOPE_LINEAS);
  const restantes = lineas.length - visibles.length;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-11_5 font-semibold [text-wrap:pretty]" style={{ color }}>
        {encabezado}
      </span>
      <ul
        className={`flex flex-col gap-1.5 ${
          abierta ? 'max-h-[18rem] overflow-y-auto pr-1' : ''
        }`}
      >
        {visibles.map((l, i) => (
          <li
            key={`${l.fila}\u0000${l.referencia}\u0000${i}`}
            className="rounded-campo border px-3 py-2 text-11_5 [text-wrap:pretty]"
            style={{ background: fondo, borderColor: borde, color }}
          >
            <span className="font-mono text-10 tracking-[0.06em]">
              {etiqueta} · FILA {l.fila}
            </span>{' '}
            <span className="font-semibold">{l.referencia.trim() || 'sin referencia'}</span>
            {' — '}
            {l.mensaje}
          </li>
        ))}
      </ul>
      {lineas.length > TOPE_LINEAS && (
        <button
          type="button"
          onClick={onAlternar}
          className="self-start rounded-campo border border-border-field px-2.5 py-1 text-11 font-semibold text-secondary transition-colors hover:bg-subtle"
        >
          {abierta ? 'Ver menos' : `Ver todas (${restantes} más)`}
        </button>
      )}
    </div>
  );
}
