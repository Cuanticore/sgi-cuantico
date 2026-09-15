'use client';

// app/components/sgsi/activos/OverlayActivo.tsx
//
// REQ-SIG-20 §6 (P3, D1) — el contrato de URL que abre la ficha de cualquier activo desde
// cualquier pantalla: `?activo=<código>&tab=general|amenazas|matrices|ecuacion`. Se monta
// UNA SOLA VEZ en la raíz (`app/layout.tsx`) porque los layouts (Server Components) no
// reciben `searchParams` — solo un Client Component con `useSearchParams` los lee, y para
// que el contrato valga en cualquier pantalla ese componente tiene que vivir por encima de
// todas ellas, no dentro de una sección.
//
// ES UN COMPONENTE, DOS ENVOLTORIOS (D1, tarea 3.7): lo que se renderiza acá adentro es la
// misma `FichaActivo` que `/sgsi/inventario/[codigo]` sirve como página completa. Si algún
// día hace falta una segunda ficha, el requerimiento está roto — las dos pantallas se
// desincronizan en el primer cambio que solo se aplique a una.
//
// Un código que no resuelve a un activo NO abre un overlay vacío: avisa y deja la pantalla
// de abajo tal cual estaba (tarea 3.1) — sin backdrop, sin bloqueo de scroll, sin robar el
// foco. Cerrar usa `router.replace` con `scroll: false`: sin esa opción, cualquier
// navegación —incluido un replace— scrollea al techo de la página, que es exactamente lo
// contrario de "la pantalla de abajo queda como estaba" (tarea 3.3). Guardar no necesita
// nada especial acá: `FichaActivo` ya llama `router.refresh()` al guardar, y eso refresca
// la ruta que esté activa en ese momento — la pantalla de abajo, sea cual sea.

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import FichaActivo from './FichaActivo';
import type { DatosOverlayActivo } from './ficha.query';
import { abrirOverlayActivo } from '@/app/sgsi/acciones/activos';
import { pestanaInternaDesdeUrl } from './overlay-tabs';

/// El overlay no es una pantalla de recorrido: es una edición puntual desde donde sea que
/// se abrió. Una lista vacía apaga Atrás/Siguiente sin pedirle nada nuevo a `FichaActivo`.
const SIN_NAVEGACION = { codigos: [] as string[] };

function AvisoNoEncontrado({ codigo, onCerrar }: { codigo: string; onCerrar: () => void }) {
  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 z-[70] w-[min(92vw,28rem)] -translate-x-1/2 rounded-campo border px-4 py-3 text-13 shadow-lg [text-wrap:pretty]"
      style={{
        background: 'var(--hf-danger-bg)',
        borderColor: 'var(--hf-danger-border)',
        color: 'var(--hf-danger-text)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <span>
          El código «{codigo}» no corresponde a ningún activo. No se abrió nada.
        </span>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className="text-15 leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function ModalFicha({ onCerrar, children }: { onCerrar: () => void; children: ReactNode }) {
  // Mismo tratamiento que el shell compartido de Popup.tsx: Escape cierra, y la pantalla de
  // abajo no scrollea detrás del overlay mientras está abierto.
  useEffect(() => {
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTeclear);

    return () => {
      document.body.style.overflow = overflowPrevio;
      document.removeEventListener('keydown', alTeclear);
    };
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Ficha del activo"
      className="fixed inset-0 z-[70] flex justify-center overflow-y-auto px-4 py-6"
      style={{ background: 'var(--hf-overlay)' }}
    >
      <div className="relative h-fit w-full max-w-[1200px]">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar ficha"
          className="absolute top-2 right-2 z-[71] h-8 w-8 rounded-campo border border-border-default bg-surface text-16 leading-none text-muted transition-colors hover:bg-app focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          ×
        </button>
        <div
          className="overflow-hidden rounded-modal bg-surface"
          style={{ boxShadow: 'var(--hf-modal-shadow)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function ContenidoOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const codigo = searchParams.get('activo');
  const tabUrl = searchParams.get('tab');

  // Guardado junto con el código que lo produjo: así el render puede distinguir "todavía
  // cargando este código" de "esto es la respuesta de un código anterior" sin tener que
  // resetear nada por su cuenta — un `setState` síncrono al principio del efecto es
  // exactamente lo que `react-hooks/set-state-in-effect` desaconseja. El único `setState`
  // vive dentro del `.then()`, que es la forma que la regla sí acepta.
  const [resultado, setResultado] = useState<{
    codigo: string;
    datos: DatosOverlayActivo | null;
  } | null>(null);

  useEffect(() => {
    if (codigo === null) return;
    let vivo = true;
    void abrirOverlayActivo(codigo).then((r) => {
      if (!vivo) return;
      setResultado({ codigo, datos: r });
    });
    return () => {
      vivo = false;
    };
  }, [codigo]);

  const cerrar = (): void => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('activo');
    params.delete('tab');
    const query = params.toString();
    // `scroll: false` es lo que hace que cerrar no te devuelva al techo de la pantalla de
    // abajo: sin esto, `router.replace` scrollea a top como cualquier navegación — y el
    // requisito (tarea 3.3) es exactamente lo contrario, preservar el scroll intacto.
    router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  if (codigo === null) return null;

  // Ni cargando este código todavía, ni la respuesta de un código anterior que ya no es
  // el actual: nada que mostrar mientras se resuelve.
  if (resultado === null || resultado.codigo !== codigo) return null;

  if (resultado.datos === null) {
    return <AvisoNoEncontrado codigo={codigo} onCerrar={cerrar} />;
  }

  const datos = resultado.datos;

  return (
    <ModalFicha onCerrar={cerrar}>
      <FichaActivo
        activo={datos.activo}
        catalogos={datos.catalogos}
        amenazas={datos.amenazas}
        navegacion={SIN_NAVEGACION}
        pestanaInicial={pestanaInternaDesdeUrl(tabUrl)}
      />
    </ModalFicha>
  );
}

export default function OverlayActivo() {
  return (
    <Suspense fallback={null}>
      <ContenidoOverlay />
    </Suspense>
  );
}
