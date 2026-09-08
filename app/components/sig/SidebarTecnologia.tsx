'use client';

// app/components/sig/SidebarTecnologia.tsx
//
// 244px, colapsable a 64px, mismo patrón que SidebarSgsi y SidebarEstrategico.
//
// Tecnología venía envuelta en `ShellSig`, así que a la izquierda mostraba el menú del
// SGSI —inventario, matrices, controles, parámetros— y sus doce pantallas colgaban de una
// fila de chips arriba. Quien entraba al mapa tecnológico veía el módulo de otro y tenía
// que leer doce chips seguidos para encontrar el suyo.
//
// Las doce rutas ya existían: acá no se construye ninguna pantalla, se las agrupa en los
// cuatro grupos del lienzo de navegación —Mapa, Ambientes y productos, Desarrollo seguro,
// Equipos— que son las cuatro preguntas distintas que el módulo responde.
//
// Sin contadores, a diferencia de las otras barras. El lienzo no los pide y ninguno de los
// que se podrían poner mide algo que se decida desde el menú: un número de adorno enseña a
// no mirar los números que sí importan.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

export interface IdentidadTecnologia {
  usuario: string;
  cuenta: string;
  permisos: string;
}

interface Entrada {
  etiqueta: string;
  abreviatura: string;
  href: string;
}

interface Grupo {
  titulo: string;
  tituloCorto: string;
  items: Entrada[];
}

const GRUPOS: Grupo[] = [
  {
    titulo: 'Mapa',
    tituloCorto: 'MAP',
    items: [
      { etiqueta: 'Mapa tecnológico', abreviatura: 'MAP', href: '/tecnologia/mapa' },
      { etiqueta: 'Grafo', abreviatura: 'GRA', href: '/tecnologia/grafo' },
      { etiqueta: 'Niveles', abreviatura: 'NIV', href: '/tecnologia/niveles' },
      { etiqueta: 'Dependencias', abreviatura: 'DEP', href: '/tecnologia/dependencias' },
      { etiqueta: 'Impacto', abreviatura: 'IMP', href: '/tecnologia/impacto' },
    ],
  },
  {
    titulo: 'Ambientes y productos',
    tituloCorto: 'AMB',
    items: [
      { etiqueta: 'Ambientes', abreviatura: 'AMB', href: '/tecnologia/ambientes' },
      { etiqueta: 'Productos y proyectos', abreviatura: 'PRD', href: '/tecnologia/productos' },
    ],
  },
  {
    titulo: 'Desarrollo seguro',
    tituloCorto: 'DEV',
    items: [
      { etiqueta: 'Sistemas', abreviatura: 'SIS', href: '/tecnologia/sistemas' },
      { etiqueta: 'Excepciones', abreviatura: 'EXC', href: '/tecnologia/excepciones' },
      { etiqueta: 'Verificación', abreviatura: 'VRF', href: '/tecnologia/verificacion' },
      { etiqueta: 'Datos personales', abreviatura: 'DAT', href: '/tecnologia/datos-personales' },
    ],
  },
  {
    titulo: 'Equipos',
    tituloCorto: 'EQU',
    items: [
      { etiqueta: 'Equipos de colaboradores', abreviatura: 'EQU', href: '/tecnologia/equipos' },
    ],
  },
];

export default function SidebarTecnologia({ identidad }: { identidad: IdentidadTecnologia }) {
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
              <Item key={e.href} entrada={e} abierto={abierto} ruta={ruta} />
            ))}
          </div>
        ))}
      </nav>

      {abierto && (
        <div className="mt-auto flex flex-col gap-2.5 px-5">
          <div className="h-px" style={{ background: 'var(--hf-hairline-strong)' }} />
          <div
            className="flex items-center gap-2 pt-2"
            style={{ borderTop: '1px solid var(--hf-hairline-strong)' }}
          >
            <span
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-10_5 font-bold"
              style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
            >
              {iniciales(identidad.usuario)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-12 font-medium text-primary">{identidad.usuario}</span>
              <span className="truncate font-mono text-10" style={{ color: 'var(--hf-text-faint)' }}>
                {identidad.cuenta}
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
            {identidad.permisos}
          </span>
        </div>
      )}
    </aside>
  );
}

function Item({ entrada, abierto, ruta }: { entrada: Entrada; abierto: boolean; ruta: string }) {
  const activa = ruta === entrada.href || ruta.startsWith(`${entrada.href}/`);

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
