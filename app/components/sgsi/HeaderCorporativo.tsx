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

const PESTANAS: Pestana[] = [
  { etiqueta: 'Mi SIG', href: '/mi-sig' },
  { etiqueta: 'Indicadores', href: '/' },
  { etiqueta: 'Estratégico', href: '', deshabilitada: true },
  { etiqueta: 'SGSI', href: '/sgsi' },
  { etiqueta: 'Operación', href: '/sig/obligaciones' },
];

export default function HeaderCorporativo({ usuario, rol, cuenta, pestanas }: Props) {
  const ruta = usePathname();
  const visibles = pestanas ?? PESTANAS;
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
              title="Disponible con el módulo D"
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

        <span
          className="flex flex-none items-center justify-center rounded-full font-bold text-white"
          style={{
            width: 30,
            height: 30,
            fontSize: 11,
            background: 'rgba(255,255,255,0.16)',
            border: '1px solid rgba(255,255,255,0.3)',
          }}
          title={usuario}
        >
          {iniciales(usuario)}
        </span>
      </div>
    </header>
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
