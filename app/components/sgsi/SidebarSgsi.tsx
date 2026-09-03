'use client';

// app/components/sgsi/SidebarSgsi.tsx
//
// 244px, sticky under the 58px header, own scroll, collapsible to 64px. Ported from the
// prototype's own markup rather than from the README's prose, because the two disagreed
// and the markup is the design.
//
// THREE groups, not two, and Indicadores is one of the entries:
//
//   SISTEMA INTEGRADO DE GESTIÓN   Indicadores · Resumen SGSI
//   SGSI · SEGURIDAD DE LA INFORMACIÓN   Inventario · Matrices · Madurez · Planes
//   CONFIGURACIÓN                  Parámetros · Amenazas y tipos · Metodología
//
// The active item is BLUE — brand/100 on brand/nav — not green. Navigation and filters
// moved to the corporate blue in v2.1 and the green is reserved for good state: maturity
// L4-L5 and low risk. Painting the active menu item green would spend the one colour that
// is supposed to mean "this is fine".
//
// Collapsed, each entry shows a unique three-letter abbreviation in mono with the full
// name in `title`, the group headers shrink to SIG / SGSI / ···, and the footer hides so
// the content area grows.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

export interface Contadores {
  activos: number;
  riesgos: number;
  controles: number;
  planes: number;
  amenazas: number;
  indicadores: number;
  lineaBase: string;
  /// Identity for the footer block: the prototype shows who is signed in, with which AD
  /// group, and what that grants.
  usuario: string;
  cuenta: string;
  rol: string;
  permisos: string;
}

interface Entrada {
  etiqueta: string;
  abreviatura: string;
  href: string;
  /// Right-hand counter. The prototype shows it only while expanded.
  contador?: keyof Contadores;
  literal?: string;
}

interface Grupo {
  titulo: string;
  tituloCorto: string;
  items: Entrada[];
  /// Sub-entries are indented and lighter: the prototype gives them 18px of left padding
  /// against 11px, 13px against 13.5px, and weight 400 against 500.
  sub?: boolean;
}

const GRUPOS: Grupo[] = [
  {
    titulo: 'Sistema Integrado de Gestión',
    tituloCorto: 'SIG',
    items: [
      { etiqueta: 'Indicadores', abreviatura: 'IND', href: '/', contador: 'indicadores' },
      // El lienzo de navegacion mueve «Cumplimiento de tareas» aca, junto a Indicadores:
      // las dos responden la misma pregunta —como va el sistema— y estaban en pestanas
      // distintas. Vivia bajo Actividades.
      { etiqueta: 'Cumplimiento de tareas', abreviatura: 'CUM', href: '/sig/tablero-tareas' },
      { etiqueta: 'Resumen SGSI', abreviatura: 'RSG', href: '/sgsi' },
      { etiqueta: 'Verificación del motor', abreviatura: 'VER', href: '/sgsi/verificacion' },
    ],
  },
  {
    titulo: 'SGSI · Seguridad de la información',
    tituloCorto: 'SGSI',
    items: [
      { etiqueta: 'Inventario de activos', abreviatura: 'INV', href: '/sgsi/inventario', contador: 'activos' },
      { etiqueta: 'Matrices de riesgo', abreviatura: 'MTZ', href: '/sgsi/matrices' },
      { etiqueta: 'Madurez de los controles', abreviatura: 'MAD', href: '/sgsi/controles', contador: 'controles' },
      { etiqueta: 'Planes de tratamiento', abreviatura: 'PLA', href: '/sgsi/planes', contador: 'planes' },
      { etiqueta: 'Eventos e incidentes', abreviatura: 'EVT', href: '/sgsi/eventos' },
    ],
  },
  {
    titulo: 'Configuración',
    tituloCorto: '···',
    sub: true,
    items: [
      { etiqueta: 'Parámetros', abreviatura: 'PAR', href: '/sgsi/parametros' },
      { etiqueta: 'Amenazas y tipos', abreviatura: 'AMZ', href: '/sgsi/amenazas', contador: 'amenazas' },
      { etiqueta: 'Metodología', abreviatura: 'MET', href: '/sgsi/metodologia', literal: 'MET-SIG-01' },
    ],
  },
];

export default function SidebarSgsi({ contadores }: { contadores: Contadores }) {
  const [colapsado, setColapsado] = useState(false);
  const ruta = usePathname();
  const abierto = !colapsado;

  return (
    <aside
      className="sticky flex shrink-0 flex-col overflow-y-auto border-r border-border-default bg-surface transition-[width] duration-200"
      style={{
        width: abierto ? 'var(--hf-sidebar-ancho)' : 'var(--hf-sidebar-colapsado)',
        top: 'var(--hf-header-alto)',
        height: 'calc(100vh - var(--hf-header-alto))',
        gap: 16,
        padding: '16px 0 18px',
      }}
    >
      <div className="flex flex-col px-3">
        <button
          onClick={() => setColapsado((c) => !c)}
          title={abierto ? 'Colapsar el menú' : 'Expandir el menú'}
          aria-label={abierto ? 'Colapsar el menú' : 'Expandir el menú'}
          className="h-[26px] w-[26px] flex-none rounded-campo border border-border-default bg-surface text-12 leading-none text-muted transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          style={{ alignSelf: abierto ? 'flex-end' : 'center' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--hf-brand-100-soft)';
            e.currentTarget.style.color = 'var(--hf-brand-nav)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--hf-bg-surface)';
            e.currentTarget.style.color = 'var(--hf-text-muted)';
          }}
        >
          {abierto ? '⟨' : '⟩'}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5">
        {GRUPOS.map((g, i) => (
          <div key={g.titulo} className="flex flex-col gap-0.5">
            {/* The header label sits next to a hairline that fills the rest of the row. */}
            <div
              className="flex items-center gap-2 px-[11px]"
              style={{ margin: i === 0 ? '0 0 6px' : '14px 0 6px' }}
            >
              <span
                className="whitespace-nowrap font-mono text-9 uppercase tracking-[0.07em]"
                style={{ color: 'var(--hf-text-label)' }}
              >
                {abierto ? g.titulo : g.tituloCorto}
              </span>
              <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
            </div>

            {g.items.map((e) => (
              <Item
                key={e.href}
                entrada={e}
                grupo={g}
                abierto={abierto}
                ruta={ruta}
                contadores={contadores}
              />
            ))}
          </div>
        ))}
      </nav>

      {abierto && (
        <div className="mt-auto flex flex-col gap-2.5 px-5">
          <div className="h-px" style={{ background: 'var(--hf-hairline-strong)' }} />

          <div className="flex flex-col gap-[5px]">
            <span
              className="font-mono text-9_5 uppercase tracking-[0.07em]"
              style={{ color: 'var(--hf-text-label)' }}
            >
              Línea base
            </span>
            <span className="text-12_5 font-medium text-primary">{contadores.lineaBase}</span>
            <span className="text-11_5" style={{ color: 'var(--hf-text-faint)' }}>
              {contadores.activos} activos · {contadores.riesgos} riesgos
            </span>
          </div>

          <div
            className="flex items-center gap-2 pt-2"
            style={{ borderTop: '1px solid var(--hf-hairline-strong)' }}
          >
            <span
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-10_5 font-bold"
              style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
            >
              {iniciales(contadores.usuario)}
            </span>
            <span className="flex min-w-0 flex-col">
              {/* The person's own name, not the methodology role. "Líder del SIG" names a
                  row in the permission table; what the session actually permits is spelled
                  out in the line below the footer. */}
              <span className="truncate text-12 font-medium text-primary">
                {contadores.rol.trim() !== '' ? contadores.rol : contadores.usuario}
              </span>
              <span
                className="truncate font-mono text-10"
                style={{ color: 'var(--hf-text-faint)' }}
              >
                {contadores.cuenta}
              </span>
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              title="Cerrar sesión"
              className="ml-auto flex-none rounded-[5px] border border-border-default bg-surface px-2 py-1 text-11 text-muted transition-colors hover:bg-app focus:outline-hidden focus:ring-2 focus:ring-accent-300"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--hf-danger-text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--hf-text-muted)';
              }}
            >
              Salir
            </button>
          </div>

          <span
            className="text-10_5 [text-wrap:pretty]"
            style={{ color: 'var(--hf-text-label)' }}
          >
            {contadores.permisos}
          </span>
        </div>
      )}
    </aside>
  );
}

function Item({
  entrada,
  grupo,
  abierto,
  ruta,
  contadores,
}: {
  entrada: Entrada;
  grupo: Grupo;
  abierto: boolean;
  ruta: string;
  contadores: Contadores;
}) {
  // "Indicadores" and "Resumen SGSI" are both roots, so they only light up on an exact
  // match; the rest stay active while you are anywhere beneath them.
  const esRaiz = entrada.href === '/' || entrada.href === '/sgsi';
  const activa = esRaiz ? ruta === entrada.href : ruta.startsWith(entrada.href);

  const meta = entrada.literal ?? (entrada.contador ? String(contadores[entrada.contador]) : '');

  return (
    <Link
      href={entrada.href}
      title={entrada.etiqueta}
      aria-current={activa ? 'page' : undefined}
      className="flex w-full items-center gap-2 rounded-[7px] transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      style={{
        justifyContent: abierto ? 'space-between' : 'center',
        padding: abierto ? `8px 11px 8px ${grupo.sub ? 18 : 11}px` : '8px 0',
        fontSize: grupo.sub ? 13 : 13.5,
        fontWeight: grupo.sub ? 400 : 500,
        background: activa ? 'var(--hf-brand-100)' : 'transparent',
        color: activa
          ? 'var(--hf-brand-nav)'
          : grupo.sub
            ? 'var(--hf-text-muted)'
            : 'var(--hf-text-secondary-soft)',
      }}
      onMouseEnter={(e) => {
        if (!activa) e.currentTarget.style.background = 'var(--hf-brand-100-soft)';
      }}
      onMouseLeave={(e) => {
        if (!activa) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        className="min-w-0 flex-1 whitespace-nowrap"
        style={
          abierto
            ? undefined
            : { fontFamily: 'var(--font-mono)', fontSize: 10.5, textAlign: 'center' }
        }
      >
        {abierto ? entrada.etiqueta : entrada.abreviatura}
      </span>
      {abierto && meta && (
        <span
          className="flex-none font-mono text-10"
          style={{ color: 'var(--hf-text-label)' }}
        >
          {meta}
        </span>
      )}
    </Link>
  );
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .map((p) => p[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  );
}
