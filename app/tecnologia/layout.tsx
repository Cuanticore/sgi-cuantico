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
import { puede, rolDesdeGrupos, nombreDelRol } from '@/lib/sgsi/permisos';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import SidebarTecnologia, {
  type IdentidadTecnologia,
} from '@/app/components/sig/SidebarTecnologia';

export const dynamic = 'force-dynamic';

export default async function TecnologiaLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);

  if (!puede(rol, 'tecnologia:ver')) {
    return (
      <div className="flex min-h-screen flex-col bg-app">
        <EncabezadoSig />
        <SinAcceso />
      </div>
    );
  }

  // Barra propia, no la del SGSI. Envuelto en `ShellSig`, este módulo mostraba a la
  // izquierda el menú de otro —inventario, matrices, controles— y las suyas en una fila de
  // doce chips arriba. Las rutas son las mismas; lo que cambia es dónde se las encuentra.
  const identidad: IdentidadTecnologia = {
    usuario: session?.user?.name ?? session?.user?.email ?? 'Usuario',
    cuenta: `CUANTICO\\${(session?.user?.email ?? 'usuario').split('@')[0]}`,
    permisos: rol.grupos.length
      ? `Grupo ${rol.grupos.join(', ')} · ${nombreDelRol(rol)}`
      : 'Sin grupo del SIG en el Directorio.',
  };

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <div className="flex items-start">
        <SidebarTecnologia identidad={identidad} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function SinAcceso() {
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
        {/* La nota sobre «el rol vino del respaldo configurado» se fue con el respaldo: ya
            no hay otra procedencia posible. Quien quiera ver qué trae su token tiene
            `/mi-sig/diagnostico`, que lo dice identificador por identificador. */}
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
