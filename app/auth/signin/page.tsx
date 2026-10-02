'use client';

import { getProviders, signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  // Mi SIG es el destino por defecto, no el tablero de Indicadores: es lo único que toda
  // cuenta de la organización puede usar, y lo que le dice a la persona qué tiene pendiente.
  // Quien llegó desde una pantalla concreta vuelve a ella — `callbackUrl` sigue mandando.
  const callbackUrl = searchParams.get('callbackUrl') ?? '/mi-sig';

  // Se le pregunta al servidor qué proveedores tiene registrados, en vez de leer una
  // variable pública. Una segunda variable que dijera «hay acceso local» podría
  // desincronizarse de la que lo habilita, y la pantalla mostraría un formulario que el
  // servidor rechaza — o lo escondería estando disponible. Acá no hay dos verdades.
  const [hayAccesoLocal, setHayAccesoLocal] = useState(false);
  const [correo, setCorreo] = useState('');
  const [grupos, setGrupos] = useState('');

  useEffect(() => {
    let vigente = true;
    void getProviders().then((ps) => {
      if (vigente) setHayAccesoLocal(Boolean(ps?.['acceso-local']));
    });
    return () => {
      vigente = false;
    };
  }, []);

  const entrarLocal = (): void => {
    // Sin correo no hay a quién identificar, y la persona se registra con ese correo.
    if (correo.trim() === '') return;
    void signIn('acceso-local', { correo: correo.trim(), grupos, callbackUrl });
  };

  return (
    <div className="flex h-screen">
      {/* Left: auth background image */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <Image
          src="/auth.png"
          alt="Cuantico"
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* Right: sign-in panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-white px-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-4">
            <Image
              src="/logo.jpeg"
              alt="Cuantico"
              width={64}
              height={64}
              className="rounded-xl object-contain shadow-md"
            />
            <div className="text-center">
              <h1 className="text-2xl font-black tracking-widest text-slate-900 uppercase">
                Cuantico
              </h1>
              {/* The module is no longer a separate application: it lives inside the
                  Sistema Integrado de Gestión and shares this session. */}
              <p className="mt-1 text-xs text-slate-400 font-medium tracking-widest uppercase">
                Sistema Integrado de Gestión
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Intenta iniciar sesión con una cuenta diferente.
            </div>
          )}

          <button
            onClick={() => signIn('azure-ad', { callbackUrl })}
            className="w-full rounded-xl bg-[#1B3A8A] py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-[#0c2461]"
          >
            Siguiente
          </button>

          <p className="text-center text-xs text-slate-400">
            Acceso exclusivo para colaboradores de Cuantico
          </p>

          {/* Sólo en la máquina de quien programa, y sólo si el servidor lo ofrece.
              NO es `SGI_ROL_DEV` otra vez: acá se escriben GRUPOS, no un rol, así que el
              camino grupo -> rol -> permiso se recorre igual que en producción. Dejarlo en
              blanco entra como Colaborador, que es el piso real de cualquier cuenta sin
              grupo reconocido. */}
          {hayAccesoLocal && (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-4">
              <p className="text-xs font-semibold text-amber-900">Acceso local, sin Directorio</p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                Sólo existe fuera de producción. Los permisos salen de los grupos que escribas
                acá, igual que saldrían del Directorio.
              </p>

              <label className="mt-3 block text-[11px] font-medium text-amber-900" htmlFor="correo-local">
                Correo
              </label>
              <input
                id="correo-local"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="tu.nombre@cuantico.com"
                className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
              />

              <label className="mt-2 block text-[11px] font-medium text-amber-900" htmlFor="grupos-local">
                Grupos, separados por coma (vacío = Colaborador)
              </label>
              <input
                id="grupos-local"
                type="text"
                value={grupos}
                onChange={(e) => setGrupos(e.target.value)}
                placeholder="Líderes SIG"
                className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
              />

              <button
                onClick={entrarLocal}
                className="mt-3 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
              >
                Entrar sin Directorio
              </button>
            </div>
          )}

          {/* The application stores no passwords: permissions derive from Directory
              group membership. Saying so here is what an auditor looks for. */}
          <p className="text-center text-[11px] leading-relaxed text-slate-400">
            Autenticación integrada con el Directorio Activo. Los permisos se derivan de la
            pertenencia a grupos de AD.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
