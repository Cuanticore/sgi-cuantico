import 'server-only';

// lib/sgsi/notificaciones.ts
//
// Envío de menciones por correo (SMTP). Credenciales SOLO del entorno:
// SMTP_HOST, SMTP_PORT, SMTP_SECURE (STARTTLS), SMTP_USER, SMTP_PASS —
// nunca del código ni del repo. Sin configurar, toda función devuelve
// `{ configurado: false }` y es el llamador quien lo registra.

import nodemailer from 'nodemailer';

export interface ResultadoCorreo {
  enviado: boolean;
  configurado: boolean;
  detalle: string;
}

function transporte(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  // `SMTP_USERNAME`/`SMTP_PASSWORD` es la convención del .env; se acepta también
  // SMTP_USER/SMTP_PASS por compatibilidad con instalaciones anteriores.
  const user = process.env.SMTP_USERNAME ?? process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const puerto = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === 'true';
  return nodemailer.createTransport({
    host,
    port: puerto,
    secure,
    auth: { user, pass },
  });
}

export async function enviarCorreo(
  para: string,
  asunto: string,
  texto: string,
  html?: string,
): Promise<ResultadoCorreo> {
  const t = transporte();
  if (!t) {
    return { enviado: false, configurado: false, detalle: 'SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS)' };
  }
  try {
    const from = (process.env.SMTP_USERNAME ?? process.env.SMTP_USER) as string;
    await t.sendMail({
      from: `"SGSI Cuantico" <${from}>`,
      to: para,
      subject: asunto,
      text: texto,
      ...(html ? { html } : {}),
    });
    return { enviado: true, configurado: true, detalle: `enviado a ${para}` };
  } catch (error) {
    return {
      enviado: false,
      configurado: true,
      detalle: `falló el envío: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/// Correo de mención: quién, en qué control y la nota que lo contiene.
export function correoDeMencion(autor: string, codigoControl: string, nombreControl: string, nota: string) {
  const url = `${process.env.PUBLIC_URL ?? 'http://localhost:3004'}/sgsi/controles`;
  const asunto = `Te mencionaron en ${codigoControl} — ${nombreControl}`;
  const texto = [
    `${autor} te mencionó en el control ${codigoControl} ${nombreControl}.`,
    '',
    `Nota: “${nota.slice(0, 600)}”`,
    '',
    `Ver la pantalla del control: ${url}`,
  ].join('\n');
  const html = [
    `<p><strong>${autor}</strong> te mencionó en el control <code>${codigoControl}</code> — ${nombreControl}.</p>`,
    `<p><em>“${nota.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 600)}”</em></p>`,
    `<p><a href="${url}">Ver la pantalla del control</a></p>`,
  ].join('');
  return { asunto, texto, html };
}
