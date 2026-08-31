'use client';

// app/components/sig/SidebarEstrategico.tsx
//
// 244px, colapsable a 64px, mismo patrón que las otras sidebars. Las entradas del
// shell del artboard Riesgos: Partes, Legal, Riesgos, Mapa de calor, Materializaciones,
// DOFA, PESTEL y Parámetros, con el footer «Línea base».

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

export interface ContadoresEstrategico {
  partes: number;
  requisitos: number;
  riesgos: number;
  materializaciones: number;
  lineaBase: string;
  usuario: string;
  cuenta: string;
  permisos: string;
}

interface Entrada {
  etiqueta: string;
  abreviatura: string;
  href: string;
  contador?: keyof ContadoresEstrategico;
}

const ENTRADAS: Entrada[] = [
  { etiqueta: 'Riesgos y oportunidades', abreviatura: 'RIE', href: '/estrategico/riesgos', contador: 'riesgos' },
  { etiqueta: 'Mapa de calor', abreviatura: 'MAP', href: '/estrategico/mapa' },
  { etiqueta: 'Partes interesadas', abreviatura: 'PER', href: '/estrategico/partes', contador: 'partes' },
  { etiqueta: 'Requisitos legales', abreviatura: 'LEG', href: '/estrategico/legal', contador: 'requisitos' },
  { etiqueta: 'DOFA', abreviatura: 'DOF', href: '/estrategico/dofa' },
  { etiqueta: 'PESTEL', abreviatura: 'PES', href: '/estrategico/pestel' },
  { etiqueta: 'Materializaciones', abreviatura: 'MAT', href: '/estrategico/materializaciones', contador: 'materializaciones' },
  { etiqueta: 'Parámetros', abreviatura: 'PAR', href: '/estrategico/parametros' },
];

export default function SidebarEstrategico({ contadores }: { contadores: ContadoresEstrategico }) {
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
        >
          {abierto ? '⟨' : '⟩'}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 px-[11px]" style={{ margin: '0 0 6px' }}>
            <span
              className="whitespace-nowrap font-mono text-9 uppercase tracking-[0.07em]"
              style={{ color: 'var(--hf-text-label)' }}
            >
              {abierto ? 'Gestión estratégica' : 'EST'}
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
          </div>
          {ENTRADAS.map((e) => (
            <Item key={e.href} entrada={e} abierto={abierto} ruta={ruta} contadores={contadores} />
          ))}
        </div>
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
              {contadores.riesgos} riesgos y oportunidades
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
              <span className="truncate text-12 font-medium text-primary">{contadores.usuario}</span>
              <span className="truncate font-mono text-10" style={{ color: 'var(--hf-text-faint)' }}>
                {contadores.cuenta}
              </span>
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              title="Cerrar sesión"
              className="ml-auto flex-none rounded-[5px] border border-border-default bg-surface px-2 py-1 text-11 text-muted transition-colors hover:bg-app focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            >
              Salir
            </button>
          </div>
          <span className="text-10_5 [text-wrap:pretty]" style={{ color: 'var(--hf-text-label)' }}>
            {contadores.permisos}
          </span>
        </div>
      )}
    </aside>
  );
}

function Item({
  entrada,
  abierto,
  ruta,
  contadores,
}: {
  entrada: Entrada;
  abierto: boolean;
  ruta: string;
  contadores: ContadoresEstrategico;
}) {
  const activa = ruta === entrada.href || ruta.startsWith(`${entrada.href}/`);
  const meta = entrada.contador ? String(contadores[entrada.contador]) : '';

  return (
    <Link
      href={entrada.href}
      title={entrada.etiqueta}
      aria-current={activa ? 'page' : undefined}
      className="flex w-full items-center gap-2 rounded-[7px] transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      style={{
        justifyContent: abierto ? 'space-between' : 'center',
        padding: abierto ? '8px 11px' : '8px 0',
        fontSize: 13.5,
        fontWeight: 500,
        background: activa ? 'var(--hf-brand-100)' : 'transparent',
        color: activa ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
      }}
    >
      <span
        className="min-w-0 flex-1 whitespace-nowrap"
        style={
          abierto ? undefined : { fontFamily: 'var(--font-mono)', fontSize: 10.5, textAlign: 'center' }
        }
      >
        {abierto ? entrada.etiqueta : entrada.abreviatura}
      </span>
      {abierto && meta && (
        <span className="flex-none font-mono text-10" style={{ color: 'var(--hf-text-label)' }}>
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