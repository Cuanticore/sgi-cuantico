// app/tecnologia/layout.tsx
//
// **La puerta de lectura del módulo, y vive en el LAYOUT a propósito.** Es la misma
// decisión que en `/sgsi`: siete pantallas acordándose cada una de comprobar son siete
// oportunidades de olvidarse, y la octava que alguien agregue se olvidaría por omisión.
// Acá, una ruta nueva bajo `/tecnologia` queda protegida en el momento en que existe.
//
// El middleware sólo prueba que hay sesión —`withAuth` comprueba autenticación, no
// autorización—, así que sin esta puerta cualquier cuenta del tenant podría leer el mapa
// tecnológico completo: las IP, las URL, los puertos y los servicios marcados como legacy.
// Es exactamente el mapa que alguien necesitaría para atacar la organización.

import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos, type OrigenRol } from '@/lib/sgsi/permisos';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import ShellSig from '@/app/components/sgsi/ShellSig';

export const dynamic = 'force-dynamic';

export default async function TecnologiaLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);

  if (!puede(rol, 'tecnologia:ver')) {
    return (
      <div className="flex min-h-screen flex-col bg-app">
        <EncabezadoSig />
        <SinAcceso origen={rol.origen} />
      </div>
    );
  }

  return (
    <ShellSig>
      <div className="flex flex-1 flex-col">
        <NavTecnologia />
        {children}
      </div>
    </ShellSig>
  );
}

/// La navegación del módulo. Las pantallas que todavía no existen **se dibujan
/// deshabilitadas con su motivo** en vez de omitirse: una sección que falta y no se ve es
/// indistinguible de una que se decidió no construir.
function NavTecnologia() {
  const rutas: { etiqueta: string; href: string | null }[] = [
    { etiqueta: 'Mapa tecnológico', href: null },
    { etiqueta: 'Niveles', href: null },
    { etiqueta: 'Ambientes', href: '/tecnologia/ambientes' },
    { etiqueta: 'Productos y proyectos', href: null },
    { etiqueta: 'Dependencias', href: '/tecnologia/dependencias' },
    { etiqueta: 'Impacto', href: '/tecnologia/impacto' },
    { etiqueta: 'Equipos', href: null },
  ];

  return (
    <nav className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-8 py-2.5">
      {rutas.map((r) =>
        r.href === null ? (
          <span
            key={r.etiqueta}
            title="Todavía no construida (REQ-SIG-06)"
            className="cursor-not-allowed rounded-chip px-3 py-1.5 text-12 text-faint opacity-60"
          >
            {r.etiqueta}
          </span>
        ) : (
          <Link
            key={r.etiqueta}
            href={r.href}
            className="rounded-chip px-3 py-1.5 text-12 font-medium text-secondary hover:bg-subtle"
          >
            {r.etiqueta}
          </Link>
        ),
      )}
    </nav>
  );
}

function SinAcceso({ origen }: { origen: OrigenRol }) {
  return (
    <main className="px-8 pt-10 pb-14">
      <div
        className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border px-5 py-5"
        style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
      >
        <h1 className="text-17 font-bold" style={{ color: 'var(--hf-warn-text)' }}>
          No tenés acceso a Gestión Tecnológica
        </h1>
        <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
          Tu sesión es válida, pero tu cuenta no pertenece al grupo del Directorio Activo que
          da acceso a este módulo. El mapa tecnológico incluye direcciones, puertos y
          servicios internos, y no se muestra sin él.
        </p>
        <p className="text-12" style={{ color: 'var(--hf-warn-text)' }}>
          <span className="font-mono font-semibold">Líderes SIG</span> — acceso completo al
          sistema
        </p>
        {origen !== 'directorio' && (
          <p className="text-11_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text-soft)' }}>
            Nota para quien administra: el token de esta sesión no trae el claim de grupos, así
            que el rol vino del respaldo configurado y no del Directorio.
          </p>
        )}
        <Link
          href="/mi-sig"
          className="mt-1 w-fit rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          Ir a Mi SIG
        </Link>
      </div>
    </main>
  );
}
