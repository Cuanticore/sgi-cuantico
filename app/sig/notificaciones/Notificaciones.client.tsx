'use client';

// app/sig/notificaciones/Notificaciones.client.tsx
//
// El registro de envíos y el disparo manual. El registro va primero a propósito: el botón
// es un medio, y lo que sostiene N4 —«no me llegó el aviso» es verificable— es la tabla.
//
// El disparo es idempotente por la unique (tipo, periodo, personaId): correrlo dos veces
// no duplica correos. Por eso se puede apretar sin miedo si el servidor estuvo caído, y
// por eso el resultado distingue enviados de omitidos.

import { useMemo, useState } from 'react';
import { enviarNotificacionesPendientes } from '@/app/sig/acciones/envios';

export interface EnvioFila {
  id: number;
  tipo: string;
  periodo: string;
  resultado: string;
  persona: string;
  correo: string;
  enviadoEn: string;
  detalle: string | null;
}

const RESULTADO: Record<string, { etiqueta: string; fondo: string; texto: string }> = {
  ENVIADO: { etiqueta: 'Enviado', fondo: '#e6efe9', texto: '#0b5c44' },
  SIN_SMTP: { etiqueta: 'Sin SMTP', fondo: '#faf1d3', texto: '#6b5410' },
  FALLO: { etiqueta: 'Falló', fondo: '#fdeeeb', texto: '#a52016' },
  OMITIDO: { etiqueta: 'Omitido', fondo: '#f5f7f6', texto: '#4a544f' },
};

const TIPO: Record<string, string> = {
  NUEVA: 'Tarea nueva',
  PROXIMIDAD: 'Vence pronto',
  VENCIMIENTO: 'Vence hoy',
  SEMANAL: 'Resumen semanal',
  MENSUAL: 'Resumen mensual',
};

const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export default function NotificacionesClient({
  envios,
  porTipo,
  porResultado,
  configuracion,
}: {
  envios: EnvioFila[];
  porTipo: { clave: string; n: number }[];
  porResultado: { clave: string; n: number }[];
  configuracion: {
    hora: string;
    diaSemanal: string;
    diaMensual: string;
    liderSig: string;
    smtp: string;
  };
}) {
  const [filtro, setFiltro] = useState<string>('TODOS');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const visibles = useMemo(
    () => (filtro === 'TODOS' ? envios : envios.filter((e) => e.tipo === filtro)),
    [envios, filtro],
  );

  const smtpListo = configuracion.smtp === 'configurado';

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Notificaciones</h1>
          <p className="max-w-[86ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Cada correo del SIG queda registrado con su resultado. El disparo es idempotente:
            correrlo dos veces no duplica nada, así que se puede repetir si el servidor estuvo
            caído.
          </p>
        </div>
        <button
          onClick={async () => {
            setOcupado(true);
            setAviso(null);
            const r = await enviarNotificacionesPendientes();
            setOcupado(false);
            setAviso({
              ok: r.ok,
              texto: r.ok
                ? `${r.mensaje} · ${r.enviados} enviado(s), ${r.omitidos} omitido(s), ${r.avisos} aviso(s) preparado(s).`
                : r.mensaje,
            });
            if (r.ok && r.enviados > 0) setTimeout(() => window.location.reload(), 1500);
          }}
          disabled={ocupado}
          className="ml-auto flex-none rounded-campo px-4 py-2.5 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-brand-nav)', border: '1px solid var(--hf-brand-700)' }}
        >
          {ocupado ? 'Enviando…' : 'Enviar los pendientes'}
        </button>
      </div>

      {!smtpListo && (
        <p
          className="mt-4 max-w-[92ch] rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
        >
          <strong className="font-semibold">SMTP sin configurar.</strong> El disparo corre
          igual y cada correo queda registrado como <code className="font-mono">SIN_SMTP</code>:
          eso es a propósito, porque así el registro dice qué se habría enviado y a quién, en
          vez de no dejar rastro de la omisión.
        </p>
      )}

      {aviso && (
        <p
          className="mt-4 max-w-[92ch] rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      <section className="mt-5 flex flex-wrap gap-2.5">
        <Dato etiqueta="Hora de envío" valor={`desde las ${configuracion.hora}:00 UTC`} />
        <Dato
          etiqueta="Resumen semanal"
          valor={DIAS_SEMANA[Number(configuracion.diaSemanal) - 1] ?? configuracion.diaSemanal}
        />
        <Dato etiqueta="Resumen mensual" valor={`día ${configuracion.diaMensual}`} />
        <Dato etiqueta="Correo del líder SIG" valor={configuracion.liderSig} />
        <Dato etiqueta="SMTP" valor={configuracion.smtp} alerta={!smtpListo} />
      </section>

      <nav className="mt-5 flex flex-wrap items-center gap-1.5">
        {[{ clave: 'TODOS', n: envios.length }, ...porTipo].map((t) => {
          const activo = filtro === t.clave;
          return (
            <button
              key={t.clave}
              onClick={() => setFiltro(t.clave)}
              aria-pressed={activo}
              className="inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-12"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                fontWeight: activo ? 600 : 500,
              }}
            >
              {t.clave === 'TODOS' ? 'Todos' : (TIPO[t.clave] ?? t.clave)}
              <span className="font-mono text-10 opacity-75">{t.n}</span>
            </button>
          );
        })}
        <span className="ml-auto flex flex-wrap items-center gap-3">
          {porResultado.map((r) => {
            const e = RESULTADO[r.clave] ?? RESULTADO.OMITIDO;
            return (
              <span key={r.clave} className="inline-flex items-center gap-1.5">
                <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: e.texto }} />
                <span className="text-11 text-secondary-soft">
                  {e.etiqueta} · {r.n}
                </span>
              </span>
            );
          })}
        </span>
      </nav>

      <div className="mt-4 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Periodo</th>
              <th className="px-4 py-3 font-semibold">Para</th>
              <th className="px-4 py-3 font-semibold">Enviado</th>
              <th className="px-4 py-3 font-semibold">Resultado</th>
              <th className="px-4 py-3 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => {
              const r = RESULTADO[e.resultado] ?? RESULTADO.OMITIDO;
              return (
                <tr key={e.id} className="border-t border-border-default">
                  <td className="px-4 py-3 text-primary">{TIPO[e.tipo] ?? e.tipo}</td>
                  <td className="px-4 py-3 font-mono text-11 text-muted">{e.periodo}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-primary">{e.persona}</span>
                      <span className="font-mono text-10_5 text-muted">{e.correo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-11 text-muted">{e.enviadoEn}</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 uppercase"
                      style={{ background: r.fondo, color: r.texto }}
                    >
                      {r.etiqueta}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-11_5 text-muted">{e.detalle ?? '—'}</td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr className="border-t border-border-default">
                <td colSpan={6} className="px-4 py-8 text-center text-12 text-muted">
                  {envios.length === 0
                    ? 'Todavía no se envió ningún correo. Hasta ahora el disparo no tenía quién lo llamara.'
                    : 'Ningún envío de ese tipo.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-[104ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
        Se muestran los últimos {envios.length} envíos. Un <code className="font-mono">FALLO</code>{' '}
        se reintenta en la próxima corrida; un <code className="font-mono">ENVIADO</code> no,
        porque la unique de tipo, periodo y persona es lo que hace idempotente el disparo.
      </p>
    </main>
  );
}

function Dato({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <span
      className="flex flex-col gap-1 rounded-tarjeta px-3.5 py-2.5"
      style={{
        background: alerta ? 'var(--hf-warn-100)' : 'var(--hf-bg-surface)',
        border: `1px solid ${alerta ? 'var(--hf-warn-border)' : 'var(--hf-border-field)'}`,
      }}
    >
      <span className="etiqueta-campo" style={alerta ? { color: 'var(--hf-warn-text)' } : undefined}>
        {etiqueta}
      </span>
      <span
        className="text-12_5 font-medium"
        style={{ color: alerta ? 'var(--hf-warn-text)' : 'var(--hf-text-primary)' }}
      >
        {valor}
      </span>
    </span>
  );
}
