'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Suspense } from 'react';

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

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
              <p className="mt-1 text-xs text-slate-400 font-medium tracking-widest uppercase">
                Cuadro de Mando de Indicadores
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
