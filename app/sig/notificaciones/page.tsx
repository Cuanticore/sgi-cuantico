// app/sig/notificaciones/page.tsx
//
// El registro de cada correo del SIG y el disparo manual.
//
// `enviarNotificacionesPendientes` no tenía llamador: ni una ruta, ni un cron, ni un
// script. El correo del SIG NUNCA se disparaba, así que los avisos de vencimiento, el
// resumen semanal y el mensual del líder existían en el código y no en la realidad.
//
// La pantalla es sobre todo el REGISTRO, no el botón. N4 dice que «no me llegó el aviso»
// tiene que ser una afirmación verificable, y para eso hace falta poder ver qué se envió,
// a quién, cuándo y con qué resultado — incluidos los `SIN_SMTP` y los `FALLO`, que son
// justamente los que explican una omisión.

import { prisma } from '@/lib/db';
import NotificacionesClient from './Notificaciones.client';

export const dynamic = 'force-dynamic';

export default async function NotificacionesPage() {
  const [envios, porTipo, porResultado] = await Promise.all([
    prisma.envioNotificacion.findMany({
      orderBy: { id: 'desc' },
      take: 200,
      include: { persona: { select: { nombre: true, correo: true } } },
    }),
    prisma.envioNotificacion.groupBy({ by: ['tipo'], _count: { _all: true } }),
    prisma.envioNotificacion.groupBy({ by: ['resultado'], _count: { _all: true } }),
  ]);

  return (
    <NotificacionesClient
      envios={envios.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        periodo: e.periodo,
        resultado: e.resultado,
        persona: e.persona.nombre,
        correo: e.persona.correo,
        enviadoEn: e.enviadoEn.toISOString().slice(0, 16).replace('T', ' '),
        detalle: e.detalle ?? null,
      }))}
      porTipo={porTipo.map((t) => ({ clave: t.tipo, n: t._count._all }))}
      porResultado={porResultado.map((t) => ({ clave: t.resultado, n: t._count._all }))}
      configuracion={{
        // Lo que decide si el disparo hace algo. Mostrarlo evita el diagnóstico a ciegas
        // cuando alguien aprieta el botón y el resultado dice «fuera de la hora».
        hora: process.env.SGI_CORREO_HORA ?? '7',
        diaSemanal: process.env.SGI_CORREO_DIA_SEMANAL ?? '1',
        diaMensual: process.env.SGI_CORREO_DIA_MENSUAL ?? '1',
        liderSig: process.env.SGI_CORREO_LIDER_SIG ? 'configurada' : 'sin configurar',
        smtp: process.env.SMTP_HOST ? 'configurado' : 'sin configurar',
      }}
    />
  );
}
