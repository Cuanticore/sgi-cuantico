// app/tokens/layout.tsx
//
// **2.9 · la pantalla de administración de `TokenServicio`, bajo permiso de Líderes SIG.**
//
// Vive en su propia raíz —`/tokens`, no `/tecnologia/tokens` ni `/sig/tokens`— por dos
// razones: la Fase 1 está en curso sobre `app/tecnologia/*` en otra rama y esta tarea no debe
// tocar ni un archivo de ese árbol; y `app/sig/layout.tsx` exige `operacion:ver`, un permiso
// que no tiene nada que ver con administrar identidades de máquina — acoplarlo ahí habría
// hecho depender esta pantalla de un gate que significa otra cosa.
//
// La puerta vive en el LAYOUT, igual criterio que `/tecnologia` y que `/sgsi`: una sola
// compuerta para toda la sección, no una por pantalla que alguien puede olvidar agregar en la
// próxima. `/tokens/:path*` está en el matcher de `middleware.ts`, así que sin sesión ni
// siquiera se llega a este chequeo.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';

export const dynamic = 'force-dynamic';

export default async function TokensLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);

  if (!puede(rol, 'tokenServicio:administrar')) {
    return (
      <div className="flex min-h-screen flex-col bg-app">
        <EncabezadoSig />
        <main className="px-8 pt-10 pb-14">
          <div
            className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border px-5 py-5"
            style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
          >
            <h1 className="text-17 font-bold" style={{ color: 'var(--hf-warn-text)' }}>
              No tienes acceso a la administración de tokens
            </h1>
            <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
              Emitir y revocar identidades de máquina para <code>/api/v1</code> está
              restringido a <span className="font-mono font-semibold">Líderes SIG</span>. Un
              token de servicio puede escribir en la hoja de vida del sistema, así que quien lo
              emite debe poder responder por él.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
