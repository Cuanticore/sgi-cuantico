'use client';

// app/components/sgsi/Pestanas.tsx
//
// Pestañas con navegación de teclado REAL (REQ-SIG-15 P1).
//
// Hoy no hay componente de pestañas en el proyecto: los chips de Activas/Inactivas/Todas de
// la pantalla de Personas son botones con estado, y eso alcanza para tres filtros. Un popup
// de cuatro secciones no: quien navega con teclado necesita llegar a la pestaña, moverse con
// las flechas y saber cuál está activa sin verla.
//
// **Vive en su propio archivo y no en línea dentro del popup** por la misma razón que
// `Popup.tsx`: la cuarta copia siempre deriva. Y acá derivar significa que una pantalla
// termina con `aria-selected` y otra sin él, que es la clase de diferencia que nadie nota
// hasta que alguien no puede usar la aplicación.
//
// El patrón es el de WAI-ARIA para `tablist` con activación manual:
//
//   · `role="tablist"` en el contenedor, `role="tab"` en cada botón y `role="tabpanel"` en
//     el cuerpo, enlazados con `aria-controls` / `aria-labelledby`;
//   · **un solo punto de tabulación**: la pestaña activa tiene `tabIndex={0}` y las demás
//     `-1`, así que Tab entra al grupo y sale de él en vez de recorrer las cuatro. Es lo que
//     hace que un formulario con pestañas no cueste cuatro tabulaciones extra por sección;
//   · las flechas mueven Y activan, con Home y End a los extremos.

import { useCallback, useId, useRef } from 'react';

export interface Pestana<T extends string> {
  clave: T;
  etiqueta: string;
  /// Un número al lado de la etiqueta: cuántos contactos, cuántas licencias. Se omite cuando
  /// no aporta —una pestaña de datos base no tiene cuántos— en vez de mostrar un cero que
  /// se lee como «no hay nada» cuando lo que hay no se cuenta.
  cuantos?: number;
  /// Marca la pestaña que necesita atención. La usa el caso de la aceptación de lineamientos
  /// sin firmar, que es un bloqueo y no un adorno.
  atencion?: boolean;
}

interface Props<T extends string> {
  pestanas: readonly Pestana<T>[];
  activa: T;
  onCambiar: (clave: T) => void;
  /// Para que los `id` de `aria-controls` no choquen si hay dos grupos de pestañas en la
  /// misma página. `useId` lo resuelve solo, pero un prefijo legible ayuda a depurar.
  nombre?: string;
  children: React.ReactNode;
}

export default function Pestanas<T extends string>({
  pestanas,
  activa,
  onCambiar,
  nombre = 'pestanas',
  children,
}: Props<T>) {
  const base = useId();
  const idDePestana = (clave: T) => `${nombre}-${base}-tab-${clave}`;
  const idDePanel = (clave: T) => `${nombre}-${base}-panel-${clave}`;
  const botones = useRef<Map<T, HTMLButtonElement>>(new Map());

  /// Mueve el foco Y activa, que es la conducta que WAI-ARIA llama «activación automática».
  /// Se elige ésa y no la manual porque cada panel es contenido ya cargado: no hay costo en
  /// mostrarlo, y obligar a pulsar Enter después de la flecha es un paso que nadie descubre.
  const irA = useCallback(
    (indice: number) => {
      const total = pestanas.length;
      if (total === 0) return;
      // Circular: de la última a la primera. Es lo que espera quien mantiene la flecha.
      const destino = pestanas[((indice % total) + total) % total];
      onCambiar(destino.clave);
      botones.current.get(destino.clave)?.focus();
    },
    [pestanas, onCambiar],
  );

  const alTeclear = (e: React.KeyboardEvent, indice: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        irA(indice + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        irA(indice - 1);
        break;
      case 'Home':
        e.preventDefault();
        irA(0);
        break;
      case 'End':
        e.preventDefault();
        irA(pestanas.length - 1);
        break;
      default:
        // Todo lo demás pasa: Escape lo maneja el popup, y Tab tiene que salir del grupo.
        break;
    }
  };

  return (
    <div className="flex flex-col">
      <div
        role="tablist"
        aria-label={nombre}
        className="flex flex-wrap items-center gap-1 border-b border-hairline-strong"
      >
        {pestanas.map((p, i) => {
          const seleccionada = p.clave === activa;
          return (
            <button
              key={p.clave}
              ref={(el) => {
                if (el) botones.current.set(p.clave, el);
                else botones.current.delete(p.clave);
              }}
              type="button"
              role="tab"
              id={idDePestana(p.clave)}
              aria-selected={seleccionada}
              aria-controls={idDePanel(p.clave)}
              // El único punto de tabulación del grupo. Sin esto, Tab recorre las cuatro
              // pestañas antes de llegar al primer campo del formulario.
              tabIndex={seleccionada ? 0 : -1}
              onClick={() => onCambiar(p.clave)}
              onKeyDown={(e) => alTeclear(e, i)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-12_5 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-300 ${
                seleccionada
                  ? 'border-accent font-semibold text-primary'
                  : 'border-transparent text-muted hover:text-secondary'
              }`}
            >
              {p.etiqueta}
              {p.cuantos !== undefined && (
                <span className="text-10_5 text-faint">{p.cuantos}</span>
              )}
              {p.atencion === true && (
                // El punto no lleva texto: la pestaña ya dice de qué es, y el motivo vive
                // dentro del panel. `aria-hidden` porque repetirlo en el nombre accesible
                // haría que el lector lea «atención» cuatro veces al recorrer el grupo.
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 flex-none rounded-full"
                  style={{ background: 'var(--hf-warn-text)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Un solo panel, el de la pestaña activa. Los demás no se renderizan: con cuatro
          secciones de formulario, montarlas todas para esconder tres significa cuatro
          consultas de catálogo y cuatro veces el estado. */}
      <div
        role="tabpanel"
        id={idDePanel(activa)}
        aria-labelledby={idDePestana(activa)}
        // Tabulable para que quien llega con Tab desde la pestaña entre al panel aunque su
        // primer elemento no sea enfocable — un panel que empieza con un párrafo, por caso.
        tabIndex={0}
        className="pt-4 focus:outline-hidden"
      >
        {children}
      </div>
    </div>
  );
}
