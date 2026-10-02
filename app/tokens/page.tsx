// app/tokens/page.tsx
//
// 2.9 · lista los tokens con prefijo y último uso, y deja emitir y revocar. El permiso de
// acceso ya lo comprobó el layout; acá sólo se lee.

import { diasDormido, estaDormido, listar } from '@/lib/api/token-servicio';
import TokensClient from './Tokens.client';

export const dynamic = 'force-dynamic';

export default async function TokensPage() {
  const ahora = new Date();
  const filas = (await listar()).map((t) => ({
    id: t.id,
    nombre: t.nombre,
    prefijo: t.prefijo,
    alcance: t.alcance,
    expiraEn: t.expiraEn.toISOString(),
    creadoEn: t.creadoEn.toISOString(),
    creadoPor: t.creadoPor,
    ultimoUsoEn: t.ultimoUsoEn?.toISOString() ?? null,
    revocadoEn: t.revocadoEn?.toISOString() ?? null,
    motivoRevocacion: t.motivoRevocacion,
    diasDormido: t.revocadoEn === null ? diasDormido(t, ahora) : null,
    dormido: t.revocadoEn === null && estaDormido(t, ahora),
    vencido: t.expiraEn.getTime() <= ahora.getTime(),
  }));

  return <TokensClient filas={filas} />;
}
