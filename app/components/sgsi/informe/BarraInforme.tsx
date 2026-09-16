'use client';

// app/components/sgsi/informe/BarraInforme.tsx
//
// Las opciones del informe: qué procesos, qué responsables, y en qué formato sale.
//
// ── NO SE IMPRIME ───────────────────────────────────────────────────────────────────────
//
// `print:hidden`. Es la única parte de esta pantalla que no es el documento, y aparecer en el
// PDF que se archiva la convertiría en parte de un acta.
//
// ── TODO SELECCIONADO ES LO MISMO QUE NADA SELECCIONADO ─────────────────────────────────
//
// Marcar los doce procesos y no marcar ninguno producen el mismo informe, así que producen la
// misma URL: sin el parámetro. Eso evita dos direcciones distintas para el mismo documento —y
// evita que la portada diga «12 procesos: …» con una lista de doce renglones cuando lo que
// hay que decir es «Todos los procesos».
//
// ── LOS TRES FORMATOS SALEN DEL MISMO RECORTE ───────────────────────────────────────────
//
// Word y Excel son enlaces a `/api/sgsi/informe-valoracion` con los mismos parámetros que
// tiene la página; el PDF es `window.print()` sobre lo que ya está en pantalla. Ninguno vuelve
// a pedir el recorte, así que ninguno puede salir con uno distinto del que se está viendo.

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

export default function BarraInforme({
  procesosDisponibles,
  responsablesDisponibles,
  procesosElegidos,
  responsablesElegidos,
}: {
  procesosDisponibles: string[];
  responsablesDisponibles: string[];
  procesosElegidos: string[];
  responsablesElegidos: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const [procesos, setProcesos] = useState<string[]>(procesosElegidos);
  const [responsables, setResponsables] = useState<string[]>(responsablesElegidos);

  /// La cadena de parámetros del recorte VIGENTE —el de la página, no el del popup a medio
  /// editar—. Las descargas tienen que salir con lo que se está viendo, no con lo que alguien
  /// dejó tildado sin aplicar.
  const consulta = useMemo(() => {
    const p = new URLSearchParams();
    if (procesosElegidos.length > 0) p.set('procesos', procesosElegidos.join(','));
    if (responsablesElegidos.length > 0) p.set('responsables', responsablesElegidos.join(','));
    return p.toString();
  }, [procesosElegidos, responsablesElegidos]);

  function alternar(lista: string[], valor: string): string[] {
    return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
  }

  function aplicar() {
    const p = new URLSearchParams(searchParams.toString());
    // Todo marcado es lo mismo que nada marcado: una sola URL para un solo documento.
    const todosProcesos = procesos.length === procesosDisponibles.length;
    const todosResponsables = responsables.length === responsablesDisponibles.length;

    if (procesos.length === 0 || todosProcesos) p.delete('procesos');
    else p.set('procesos', procesos.join(','));

    if (responsables.length === 0 || todosResponsables) p.delete('responsables');
    else p.set('responsables', responsables.join(','));

    setAbierto(false);
    router.push(`/sgsi/informe-valoracion${p.toString() ? `?${p}` : ''}`);
  }

  const hayRecorte = procesosElegidos.length > 0 || responsablesElegidos.length > 0;

  return (
    <div className="mb-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-15 font-semibold text-primary">
          Informe de valoración de activos
        </h1>

        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 font-semibold text-primary hover:bg-surface-hover"
        >
          Alcance
          {hayRecorte && (
            <span className="ml-1.5 rounded-full bg-accent-700 px-1.5 py-0.5 text-9 font-bold text-white">
              {procesosElegidos.length + responsablesElegidos.length}
            </span>
          )}
        </button>

        {/* El PDF es la impresión del navegador. No hay dependencia nueva ni una segunda
            plantilla: lo que se imprime es exactamente lo que se ve. */}
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 font-semibold text-primary hover:bg-surface-hover"
        >
          PDF
        </button>

        <a
          href={`/api/sgsi/informe-valoracion?formato=word${consulta ? `&${consulta}` : ''}`}
          className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 font-semibold text-primary hover:bg-surface-hover"
        >
          Word
        </a>

        <a
          href={`/api/sgsi/informe-valoracion?formato=excel${consulta ? `&${consulta}` : ''}`}
          className="rounded-campo bg-accent-700 px-3 py-1.5 text-11_5 font-semibold text-white hover:bg-accent-800"
        >
          Excel
        </a>
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
          onClick={() => setAbierto(false)}
        >
          <div
            className="w-full max-w-[760px] rounded-lg border border-border-field bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-13 font-semibold text-primary">Alcance del informe</h2>
            <p className="mb-4 text-11 text-secondary-soft">
              Sin selección, el informe cubre todo. Marcá sólo si querés recortarlo — y el
              recorte queda impreso en la portada, para que nadie lea un informe parcial
              creyendo que es completo.
            </p>

            <div className="grid gap-5 md:grid-cols-2">
              <Grupo
                titulo="Procesos"
                opciones={procesosDisponibles}
                elegidas={procesos}
                onAlternar={(v) => setProcesos((s) => alternar(s, v))}
                onTodos={() => setProcesos([])}
              />
              <Grupo
                titulo="Responsables"
                opciones={responsablesDisponibles}
                elegidas={responsables}
                onAlternar={(v) => setResponsables((s) => alternar(s, v))}
                onTodos={() => setResponsables([])}
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-campo border border-border-field px-3 py-1.5 text-11_5 font-semibold text-secondary hover:bg-surface-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={aplicar}
                className="rounded-campo bg-accent-700 px-4 py-1.5 text-11_5 font-semibold text-white hover:bg-accent-800"
              >
                Generar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  opciones,
  elegidas,
  onAlternar,
  onTodos,
}: {
  titulo: string;
  opciones: string[];
  elegidas: string[];
  onAlternar: (valor: string) => void;
  onTodos: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="etiqueta-campo text-9">{titulo.toUpperCase()}</span>
        <button
          type="button"
          onClick={onTodos}
          className="text-10_5 font-semibold text-accent-700 hover:underline"
        >
          {elegidas.length === 0 ? 'Todos (actual)' : 'Todos'}
        </button>
      </div>
      <div className="max-h-[320px] overflow-y-auto rounded-campo border border-border-field p-2">
        {opciones.length === 0 && (
          <p className="px-1 py-2 text-11 text-secondary-soft">No hay opciones para elegir.</p>
        )}
        {opciones.map((o) => (
          <label
            key={o}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-11_5 text-secondary hover:bg-surface-hover"
          >
            <input type="checkbox" checked={elegidas.includes(o)} onChange={() => onAlternar(o)} />
            <span className="truncate" title={o}>
              {o}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
