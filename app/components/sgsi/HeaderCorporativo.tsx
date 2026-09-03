'use client';

// app/components/sgsi/HeaderCorporativo.tsx
//
// The 58px bar over the whole application, ported from the prototype's own markup.
//
// The blues are the REAL corporate ones, taken from the existing app. The handoff
// reconstructed this bar from a screenshot and says so outright: "Al integrar, tomar los
// tokens reales (azules, tipografía, logo) del código existente y sustituir los valores
// aproximados de la tabla brand/*." Everything else — the gradient's three stops at 96°,
// the white CQ tile with dark blue type, the sizes, the tab weights — is the prototype's.

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

interface Props {
  usuario: string;
  /// Empty string hides the line. The methodology role name ("Líder del SIG") is a row in
  /// the permission table, not a title the person holds, so the bar no longer prints it.
  rol: string;
  cuenta: string;
  /// Las pestañas que esta sesión puede ver. Un Colaborador ve solo la primera.
  pestanas?: Pestana[];
}

export interface Pestana {
  etiqueta: string;
  href: string;
  /// Sin destino todavía: se dibuja pero no navega.
  deshabilitada?: boolean;
}

export default function HeaderCorporativo({ usuario, rol, cuenta, pestanas }: Props) {
  const ruta = usePathname();
  // Sin respaldo cableado. Acá había una lista de cinco pestañas «por si no llegan», y
  // `EncabezadoSig` —el único que renderiza este componente— siempre las pasa. Era código
  // muerto, y encima desactualizado: tenía Estratégico deshabilitada con `href` vacío
  // mientras sus siete rutas ya funcionaban. Un respaldo que nadie ejecuta no se mantiene,
  // y el día que se ejecutara mostraría la navegación de hace tres versiones.
  const visibles = pestanas ?? [];
  const enRaiz = (href: string) =>
    href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);

  return (
    <header
      className="sticky top-0 z-50 flex items-center"
      style={{
        gap: 18,
        padding: '0 22px',
        height: 'var(--hf-header-alto)',
        background:
          'linear-gradient(96deg, var(--hf-brand-900) 0%, var(--hf-brand-700) 46%, var(--hf-brand-500) 100%)',
        borderBottom: '1px solid #0a2350',
      }}
    >
      <Link href="/" className="flex items-center" style={{ gap: 11 }}>
        {/* El guepardo de la marca, en la baldosa blanca que el prototipo dibuja para
            «CQ». La imagen viene sin su círculo de fondo: la baldosa ya es blanca, y
            superponer otro blanco deja un borde visible si los dos no coinciden exacto.
            Va a 120 px para el tamaño final de 30, así que se ve nítido en retina. */}
        <span
          className="flex flex-none items-center justify-center overflow-hidden rounded-campo"
          style={{ width: 30, height: 30, background: '#ffffff' }}
        >
          <Image
            src="/guepardo.png"
            alt="Cuántico"
            width={120}
            height={120}
            priority
            style={{ width: 26, height: 26, objectFit: 'contain' }}
          />
        </span>
        <span className="flex flex-col" style={{ lineHeight: 1.1 }}>
          <span
            className="font-bold text-white"
            style={{ fontSize: 14, letterSpacing: '0.06em' }}
          >
            CUANTICO
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--hf-brand-300)' }}
          >
            SIG
          </span>
        </span>
      </Link>

      <nav className="flex items-center" style={{ gap: 4, marginLeft: 14 }}>
        {visibles.map((p) => {
          const activa = p.href !== '' && enRaiz(p.href);
          return p.deshabilitada ? (
            <span
              key={p.etiqueta}
              aria-disabled="true"
              title="Todavía sin pantallas construidas"
              className="rounded-[7px]"
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                padding: '7px 13px',
                color: '#bcd4f5',
                opacity: 0.6,
                cursor: 'not-allowed',
              }}
            >
              {p.etiqueta}
            </span>
          ) : (
            <Link
              key={p.href}
              href={p.href}
              aria-current={activa ? 'page' : undefined}
              className="rounded-[7px] transition-colors focus:outline-hidden focus:ring-2 focus:ring-white/50"
              style={{
                fontSize: 12.5,
                fontWeight: activa ? 600 : 500,
                padding: '7px 13px',
                background: activa ? 'rgba(255,255,255,0.18)' : 'transparent',
                color: activa ? '#ffffff' : '#bcd4f5',
              }}
              onMouseEnter={(e) => {
                if (!activa) e.currentTarget.style.background = 'rgba(255,255,255,0.16)';
              }}
              onMouseLeave={(e) => {
                if (!activa) e.currentTarget.style.background = 'transparent';
              }}
            >
              {p.etiqueta}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center" style={{ gap: 10 }}>
        {/* The account is always shown; the role line only when there is one. An empty
            line would leave the account floating half a row above where it belongs. */}
        <span className="hidden flex-col items-end sm:flex" style={{ lineHeight: 1.2 }}>
          {rol.trim() !== '' && (
            <span className="font-semibold text-white" style={{ fontSize: 12 }}>
              {rol}
            </span>
          )}
          <span className="font-mono" style={{ fontSize: 9.5, color: 'var(--hf-brand-300)' }}>
            {cuenta}
          </span>
        </span>

        <MenuDeCuenta usuario={usuario} cuenta={cuenta} rol={rol} />
      </div>
    </header>
  );
}

/// El avatar era un `span` sin nada detrás, y «Salir» vivía sólo en el pie de las barras
/// laterales. Un Colaborador NO VE ninguna barra lateral —Mi SIG no tiene—, así que no
/// tenía forma de cerrar sesión: quedaba dentro de la aplicación sin salida.
///
/// El menú va en la cabecera porque es lo único que ven todos los roles, y porque es donde
/// cualquiera lo busca. Las barras laterales conservan su «Salir»: quien lo tenía a mano no
/// lo pierde.
function MenuDeCuenta({
  usuario,
  cuenta,
  rol,
}: {
  usuario: string;
  cuenta: string;
  rol: string;
}) {
  const [abierto, setAbierto] = useState(false);

  // Escape cierra el menú. Un menú que sólo se cierra con el ratón deja al teclado
  // atrapado, y este es el menú que contiene la única salida de la aplicación.
  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [abierto]);

  return (
    <div className="relative flex-none">
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Cuenta de ${usuario}`}
        title={usuario}
        className="flex items-center justify-center rounded-full font-bold text-white"
        style={{
          width: 30,
          height: 30,
          fontSize: 11,
          background: abierto ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.16)',
          border: '1px solid rgba(255,255,255,0.3)',
        }}
      >
        {iniciales(usuario)}
      </button>

      {abierto && (
        <>
          {/* Cierra al hacer clic afuera sin atrapar el teclado. */}
          <button
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 flex w-60 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface shadow-lg"
          >
            <div className="flex flex-col gap-0.5 border-b border-hairline px-3.5 py-3">
              <span className="text-12_5 font-semibold text-primary">{usuario}</span>
              <span className="font-mono text-10 text-muted">{cuenta}</span>
              {rol.trim() !== '' && (
                <span className="text-11 text-muted">{rol}</span>
              )}
            </div>
            <Link
              href="/mi-sig"
              role="menuitem"
              onClick={() => setAbierto(false)}
              className="px-3.5 py-2.5 text-left text-12_5 text-secondary hover:bg-subtle"
            >
              Mi SIG
            </Link>
            <button
              role="menuitem"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="border-t border-hairline px-3.5 py-2.5 text-left text-12_5 font-medium hover:bg-subtle"
              style={{ color: 'var(--hf-danger-text)' }}
            >
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .map((parte) => parte[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  );
}
