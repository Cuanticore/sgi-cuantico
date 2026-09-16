'use client';

// app/components/sgsi/planes/ImportarPlanes.tsx
//
// La importación de FOR-SIG-13, en dos pasos: primero se ve qué pasaría, después se aplica.
//
// ── EL ENSAYO NO SE PUEDE SALTAR ────────────────────────────────────────────────────────
//
// El botón de aplicar no existe hasta que hay un ensayo hecho sobre ESTE archivo. No es
// paternalismo: una importación crea decenas de filas de un golpe y deshacerlas es borrarlas
// una por una. El ensayo cuesta un clic y corre exactamente el mismo camino que la escritura,
// deteniéndose antes de escribir — así que lo que muestra es lo que va a pasar, no una
// aproximación.
//
// ── LOS RECHAZOS SE MUESTRAN ENTEROS ────────────────────────────────────────────────────
//
// Con su número de fila y su motivo, sin recortar la lista. «Se crearon 40 de 57» sin decir
// qué pasó con las otras 17 obliga a comparar a mano contra el Excel, que es exactamente el
// trabajo que esta pantalla venía a evitar.

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importarPlanes, type ResumenImportacion } from '@/app/sgsi/acciones/importar-planes';

export default function ImportarPlanes({ onCerrar }: { onCerrar: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [pendiente, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function correr(aplicar: boolean): void {
    if (!archivo) return;
    iniciar(async () => {
      const buffer = await archivo.arrayBuffer();
      const r = await importarPlanes(buffer, aplicar, motivo);
      setAviso({ ok: r.ok, texto: r.mensaje });
      setResumen(r.resumen ?? null);
      if (r.ok && aplicar) router.refresh();
    });
  }

  /// Elegir otro archivo invalida el ensayo. Sin esto, se podría ensayar un archivo y aplicar
  /// otro — que es la forma más silenciosa de escribir algo que nadie revisó.
  function elegir(f: File | null): void {
    setArchivo(f);
    setResumen(null);
    setAviso(null);
  }

  const ensayado = resumen !== null && !resumen.aplicado;
  const aplicado = resumen?.aplicado === true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-[880px] rounded-lg border border-border-field bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-14 font-semibold text-primary">Importar FOR-SIG-13</h2>
        <p className="mt-1 mb-4 text-11_5 text-secondary-soft">
          Las dos clases del formato entran: planes de tratamiento de riesgos y planes de
          mejora. Cada fila sale como plan creado o como rechazo con su motivo — ninguna se
          descarta en silencio.
        </p>

        <div className="mb-4 rounded-campo border border-dashed border-border-field p-3">
          <p className="mb-2 text-11_5 text-secondary">
            ¿No tenés la versión 02 del formato?{' '}
            <a
              href="/api/sgsi/plantilla-planes"
              className="font-semibold text-accent-700 hover:underline"
            >
              Descargala acá
            </a>{' '}
            — trae las listas desplegables pobladas con los controles y los cargos que existen
            hoy, y una hoja que explica qué pide cada columna.
          </p>
          <p className="text-10_5 text-label">
            La v01 también se puede importar: se leen las columnas que tenga. Las filas a las
            que les falte el tipo de acción o el control se rechazan, diciendo cuáles.
          </p>
        </div>

        <input
          ref={entrada}
          type="file"
          accept=".xlsx"
          onChange={(e) => elegir(e.target.files?.[0] ?? null)}
          className="mb-3 block w-full text-11_5 text-secondary file:mr-3 file:rounded-campo file:border file:border-border-field file:bg-surface file:px-3 file:py-1.5 file:text-11_5 file:font-semibold file:text-primary hover:file:bg-surface-hover"
        />

        <label className="mb-4 block">
          <span className="etiqueta-campo text-9">MOTIVO — QUEDA EN LA BITÁCORA</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Comité de seguridad del 16/09/2026"
            className="mt-1 w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          />
        </label>

        {aviso && (
          <div
            className={`mb-4 rounded-campo border px-3 py-2 text-11_5 ${
              aviso.ok
                ? 'border-accent-border bg-accent-100 text-accent-700'
                : 'border-danger-border bg-danger-bg text-danger-text'
            }`}
          >
            {aviso.texto}
          </div>
        )}

        {resumen && (
          <div className="mb-4 flex flex-col gap-3">
            {/* La suma, escrita. Es lo que permite verificar contra el archivo sin abrirlo. */}
            <p className="font-mono text-10 text-label">
              {resumen.filasLeidas} filas leídas = {resumen.creados.length}{' '}
              {resumen.aplicado ? 'creadas' : 'por crear'} + {resumen.yaExistian.length} ya
              existían + {resumen.rechazadas.length} rechazadas + {resumen.vacias} en blanco
            </p>

            {resumen.creados.length > 0 && (
              <Bloque titulo={`${resumen.aplicado ? 'Creados' : 'Se crearían'} (${resumen.creados.length})`}>
                <table className="w-full text-10_5">
                  <tbody>
                    {resumen.creados.map((c) => (
                      <tr key={c.fila} className="border-b border-hairline last:border-0">
                        <td className="py-1 pr-2 font-mono text-9_5 text-label">f.{c.fila}</td>
                        <td className="py-1 pr-2 font-mono font-semibold text-primary">{c.codigo}</td>
                        <td className="py-1 pr-2 text-secondary-soft">
                          {c.clase === 'MEJORA' ? 'Mejora' : 'Tratamiento'} · {c.tipo.toLowerCase()}
                        </td>
                        <td className="py-1 text-secondary">{c.accion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Bloque>
            )}

            {resumen.rechazadas.length > 0 && (
              <Bloque titulo={`Rechazadas (${resumen.rechazadas.length})`} tono="danger">
                <ul className="flex flex-col gap-1.5">
                  {resumen.rechazadas.map((r) => (
                    <li key={r.fila} className="text-10_5">
                      <span className="font-mono text-9_5 text-label">fila {r.fila}</span>{' '}
                      <span className="font-semibold text-primary">{r.actividad}</span>
                      <ul className="ml-4 list-disc text-secondary-soft">
                        {r.motivos.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Bloque>
            )}

            {resumen.yaExistian.length > 0 && (
              <Bloque titulo={`Ya existían (${resumen.yaExistian.length})`}>
                <p className="mb-1.5 text-10_5 text-secondary-soft">
                  No se tocan. Importar no es editar: sobrescribirlos podría borrar el avance
                  que alguien registró a mano.
                </p>
                <p className="font-mono text-10 text-secondary">
                  {resumen.yaExistian.map((y) => y.codigo).join(', ')}
                </p>
              </Bloque>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-campo border border-border-field px-3 py-1.5 text-11_5 font-semibold text-secondary hover:bg-surface-hover"
          >
            {aplicado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!aplicado && (
            <button
              type="button"
              onClick={() => correr(false)}
              disabled={!archivo || pendiente}
              className="rounded-campo border border-border-field bg-surface px-4 py-1.5 text-11_5 font-semibold text-primary hover:bg-surface-hover disabled:opacity-40"
            >
              {pendiente ? 'Leyendo…' : 'Ver qué pasaría'}
            </button>
          )}
          {ensayado && resumen.creados.length > 0 && (
            <button
              type="button"
              onClick={() => correr(true)}
              disabled={pendiente}
              className="rounded-campo bg-accent-700 px-4 py-1.5 text-11_5 font-semibold text-white hover:bg-accent-800 disabled:opacity-40"
            >
              {pendiente ? 'Importando…' : `Crear los ${resumen.creados.length} planes`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Bloque({
  titulo,
  tono,
  children,
}: {
  titulo: string;
  tono?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <details
      open
      className={`rounded-campo border p-3 ${
        tono === 'danger' ? 'border-danger-border bg-danger-bg' : 'border-border-field'
      }`}
    >
      <summary
        className={`cursor-pointer text-11_5 font-semibold ${
          tono === 'danger' ? 'text-danger-text' : 'text-primary'
        }`}
      >
        {titulo}
      </summary>
      {/* Alto acotado con desplazamiento propio: con 200 filas el popup dejaría los botones
          fuera de la pantalla, y el de aplicar es el que hay que poder alcanzar. */}
      <div className="mt-2 max-h-[260px] overflow-y-auto">{children}</div>
    </details>
  );
}
