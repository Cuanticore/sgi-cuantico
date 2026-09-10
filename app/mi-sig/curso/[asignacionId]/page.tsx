// app/mi-sig/curso/[asignacionId]/page.tsx
//
// P19 · esta ruta cae bajo el matcher de `/mi-sig/:path*` en `middleware.ts`, así que exige
// sesión sin agregar ninguna puerta nueva.

import { notFound } from 'next/navigation';
import { abrirIntento } from '@/app/mi-sig/acciones/curso';
import Player from './Player.client';

export default async function Page({ params }: { params: Promise<{ asignacionId: string }> }) {
  const { asignacionId } = await params;
  const id = Number(asignacionId);
  if (!Number.isInteger(id)) notFound();

  const apertura = await abrirIntento(id);
  if (!apertura.ok) {
    // P18 · cuando el curso no puede abrirse, la pantalla dice por qué. Un iframe en blanco
    // hace que la persona crea que la herramienta está rota y que quien administra no tenga
    // nada que mirar.
    return (
      <main style={{ padding: '24px', fontFamily: 'system-ui', maxWidth: '48rem' }}>
        <h1>No se pudo abrir el curso</h1>
        <p>{apertura.mensaje}</p>
      </main>
    );
  }

  return (
    <Player
      token={apertura.token as string}
      modelo={apertura.modelo as Record<string, string>}
      runnerUrl={apertura.runnerUrl as string}
      entradaUrl={apertura.entradaUrl as string}
      soloLectura={apertura.soloLectura === true}
    />
  );
}
