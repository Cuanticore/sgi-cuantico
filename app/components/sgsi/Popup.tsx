'use client';

// app/components/sgsi/Popup.tsx
//
// The shared popup shell. The handoff specifies ONE treatment for all six popups —
// overlay, white card at radius 12, top-aligned, a 28px × in the header, a scrolling
// body capped at 60–62vh — so it lives in one place rather than being re-described on
// each screen, where the fourth copy always drifts.
//
// Three things the per-screen copies did not have, and every dialog needs:
//   · Escape closes it. A modal you can only leave with the mouse is a trap.
//   · Focus moves into the card on open and returns to the opener on close, so the
//     keyboard does not get left behind on the page underneath.
//   · The page behind does not scroll while it is open.

import { useEffect, useRef } from 'react';

interface Props {
  titulo: string;
  subtitulo?: string;
  /// Maximum width in px. The handoff sizes each popup to its content.
  ancho: number;
  onCerrar: () => void;
  /// Rendered at the bottom, separated by a hairline: Cancel, Save, Delete.
  pie?: React.ReactNode;
  children: React.ReactNode;
}

export default function Popup({ titulo, subtitulo, ancho, onCerrar, pie, children }: Props) {
  const tarjeta = useRef<HTMLDivElement>(null);
  const origen = useRef<Element | null>(null);

  useEffect(() => {
    origen.current = document.activeElement;
    tarjeta.current?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTeclear);

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflowPrevio;
      // Returning focus to whatever opened the dialog is what keeps tab order sane.
      (origen.current as HTMLElement | null)?.focus?.();
    };
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-5 py-[78px]"
      style={{ background: 'var(--hf-overlay)' }}
      role="dialog"
      aria-modal
      aria-label={titulo}
      onClick={onCerrar}
    >
      <div
        ref={tarjeta}
        tabIndex={-1}
        className="flex w-full flex-col overflow-hidden rounded-modal bg-surface focus:outline-hidden"
        style={{ maxWidth: ancho, boxShadow: 'var(--hf-modal-shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline-strong px-5 pt-[17px] pb-3.5">
          <div className="flex flex-col gap-0.5">
            <div className="text-15 font-bold text-primary">{titulo}</div>
            {subtitulo && (
              <div className="max-w-[62ch] text-12 text-muted [text-wrap:pretty]">{subtitulo}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="h-7 w-7 flex-none rounded-campo border border-border-default bg-surface text-15 leading-none text-muted transition-colors hover:bg-app focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: '61vh' }}>
          {children}
        </div>

        {pie && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-hairline-strong px-5 py-3.5">
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}

/// Centred empty state, so an empty popup says why it is empty instead of looking broken.
export function PopupVacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-12_5 text-faint [text-wrap:pretty]">{children}</p>
  );
}
