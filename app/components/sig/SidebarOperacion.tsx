'use client';

// app/components/sig/SidebarOperacion.tsx
//
// 244px, colapsable a 64px, mismo patrón que SidebarSgsi pero con los grupos de
// Operación: el lienzo dibuja cuatro entradas bajo «Operación» (OBL/CAL/TAR/CON) y
// Personas bajo «Configuración» (sub), con el footer «Periodo» en vez de «Línea base».

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

export interface ContadoresOperacion {
  obligaciones: number;
  tareas: number;
  contenidos: number;
  personas: number;
  periodo: string;
  usuario: string;
  cuenta: string;
  permisos: string;
}

interface Entrada {
  etiqueta: string;
  abreviatura: string;
  href: string;
  contador?: keyof ContadoresOperacion;
  sub?: boolean;
}

interface Grupo {
  titulo: string;
  tituloCorto: string;
  items: Entrada[];
  sub?: boolean;
}

// Spec §4: la sidebar se agrupa con separadores: TAREAS · MEJORA · AUDITORÍA ·
// CONFIGURACIÓN.
const GRUPOS: Grupo[] = [
  {
    titulo: 'Motor',
    tituloCorto: 'MOT',
    items: [
      { etiqueta: 'Obligaciones', abreviatura: 'OBL', href: '/sig/obligaciones', contador: 'obligaciones' },
      { etiqueta: 'Calendario', abreviatura: 'CAL', href: '/sig/calendario' },
      { etiqueta: 'Tareas', abreviatura: 'TAR', href: '/sig/tareas', contador: 'tareas' },
      { etiqueta: 'Contenidos', abreviatura: 'CON', href: '/sig/contenidos', contador: 'contenidos' },
      { etiqueta: 'Notificaciones', abreviatura: 'NOT', href: '/sig/notificaciones' },
    ],
  },
  {
    titulo: 'Mejora',
    tituloCorto: 'MEJ',
    items: [
      { etiqueta: 'Hallazgos', abreviatura: 'HAL', href: '/sig/hallazgos' },
      { etiqueta: 'Acciones', abreviatura: 'ACC', href: '/sig/mejora' },
    ],
  },
  {
    titulo: 'Auditoría',
    tituloCorto: 'AUD',
    items: [
      { etiqueta: 'Programa anual', abreviatura: 'PRG', href: '/sig/auditorias/programa' },
      { etiqueta: 'Auditorías', abreviatura: 'AUD', href: '/sig/auditorias' },
      { etiqueta: 'Auditorías externas', abreviatura: 'EXT', href: '/sig/auditorias/externas' },
      { etiqueta: 'Tablero de auditoría', abreviatura: 'TAU', href: '/sig/tablero-auditoria' },
      { etiqueta: 'Normas y requisitos', abreviatura: 'NRM', href: '/sig/normas' },
    ],
  },
  {
    // El lienzo le da a Personas su propia pestana, con Colaboradores y Fichas al lado.
    // Ese modulo (REQ-SIG-09) no esta construido, asi que la pestana aterriza en
    // `/sig/personas`, cuya unica barra lateral es esta: quitar la entrada dejaria la
    // pantalla sin nada que la marque como activa. Se mueve cuando exista su barra.
    titulo: 'Configuración',
    tituloCorto: '···',
    sub: true,
    items: [
      { etiqueta: 'Personas', abreviatura: 'PER', href: '/sig/personas', contador: 'personas', sub: true },
      { etiqueta: 'Colaboradores', abreviatura: 'COL', href: '/sig/colaboradores', sub: true },
      { etiqueta: 'Procesos', abreviatura: 'PCS', href: '/sig/procesos', sub: true },
    ],
  },
];

export default function SidebarOperacion({ contadores }: { contadores: ContadoresOperacion }) {
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
        {GRUPOS.map((g, i) => (
          <div key={g.titulo} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 px-[11px]" style={{ margin: i === 0 ? '0 0 6px' : '14px 0 6px' }}>
              <span
                className="whitespace-nowrap font-mono text-9 uppercase tracking-[0.07em]"
                style={{ color: 'var(--hf-text-label)' }}
              >
                {abierto ? g.titulo : g.tituloCorto}
              </span>
              <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
            </div>
            {g.items.map((e) => (
              <Item key={e.href} entrada={e} grupo={g} abierto={abierto} ruta={ruta} contadores={contadores} />
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
              Periodo
            </span>
            <span className="text-12_5 font-medium text-primary">{contadores.periodo}</span>
            <span className="text-11_5" style={{ color: 'var(--hf-text-faint)' }}>
              {contadores.obligaciones} obligaciones · {contadores.tareas} asignaciones
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
  grupo,
  abierto,
  ruta,
  contadores,
}: {
  entrada: Entrada;
  grupo: Grupo;
  abierto: boolean;
  ruta: string;
  contadores: ContadoresOperacion;
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
        padding: abierto ? `8px 11px 8px ${entrada.sub ? 18 : 11}px` : '8px 0',
        fontSize: entrada.sub ? 13 : 13.5,
        fontWeight: entrada.sub ? 400 : 500,
        background: activa ? 'var(--hf-brand-100)' : 'transparent',
        color: activa
          ? 'var(--hf-brand-nav)'
          : entrada.sub
            ? 'var(--hf-text-muted)'
            : 'var(--hf-text-secondary-soft)',
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