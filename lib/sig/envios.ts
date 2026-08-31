// lib/sig/envios.ts
//
// El envío con su registro. La unique (tipo, periodo, personaId) hace idempotente el
// disparo (N3); SIN_SMTP y FALLO dejan rastro (N4); FALLO se reintenta en la siguiente
// corrida actualizando la fila (decisión 4 del plan).

import { prisma } from '@/lib/db';
import { enviarCorreo } from '@/lib/sgsi/notificaciones';

export type TipoEnvio = 'NUEVA' | 'PROXIMIDAD' | 'VENCIMIENTO' | 'SEMANAL' | 'MENSUAL';

export interface EnvioProgramado {
  tipo: TipoEnvio;
  periodo: string;
  personaId: number;
  para: string;
  asunto: string;
  texto: string;
  html?: string;
}

export interface ResultadoEnvio {
  enviado: boolean;
  omitido: boolean;
  resultado: 'ENVIADO' | 'SIN_SMTP' | 'FALLO' | 'OMITIDO';
  detalle: string;
}

/// Registra siempre: si ya está enviado, lo dice; si falla, el rastro queda.
export async function enviarNotificacion(envio: EnvioProgramado): Promise<ResultadoEnvio> {
  const existente = await prisma.envioNotificacion.findUnique({
    where: {
      tipo_periodo_personaId: {
        tipo: envio.tipo,
        periodo: envio.periodo,
        personaId: envio.personaId,
      },
    },
  });
  if (existente && existente.resultado === 'ENVIADO') {
    return { enviado: false, omitido: true, resultado: 'OMITIDO', detalle: 'ya enviado' };
  }

  const correo = await enviarCorreo(envio.para, envio.asunto, envio.texto, envio.html);

  if (existente) {
    await prisma.envioNotificacion.update({
      where: { id: existente.id },
      data: {
        resultado: correo.enviado ? 'ENVIADO' : correo.configurado ? 'FALLO' : 'SIN_SMTP',
        detalle: correo.detalle,
        enviadoEn: new Date(),
      },
    });
  } else {
    await prisma.envioNotificacion.create({
      data: {
        tipo: envio.tipo,
        periodo: envio.periodo,
        personaId: envio.personaId,
        resultado: correo.enviado ? 'ENVIADO' : correo.configurado ? 'FALLO' : 'SIN_SMTP',
        detalle: correo.detalle,
      },
    });
  }

  return {
    enviado: correo.enviado,
    omitido: false,
    resultado: correo.enviado ? 'ENVIADO' : correo.configurado ? 'FALLO' : 'SIN_SMTP',
    detalle: correo.detalle,
  };
}