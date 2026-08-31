// app/mi-sig/page.tsx
//
// Una sola pantalla, sin barra lateral (anotación del lienzo). El header es el de cinco
// pestañas; debajo, la identidad con los tres contadores y la bandeja agrupada.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import { leerBandeja } from './bandeja.query';
import BandejaClient from './bandeja.client';

export const dynamic = 'force-dynamic';

export default async function MiSigPage() {
  const session = await getServerSession(authOptions);
  const correo = (session?.user?.email ?? '').toLowerCase();
  const bandeja = await leerBandeja(correo);

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <BandejaClient bandeja={bandeja} />
    </div>
  );
}