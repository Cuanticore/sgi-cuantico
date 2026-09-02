'use client';

// app/mi-sig/bandeja.client.tsx
//
// La bandeja tal como la dibuja el lienzo: tres contadores con su cifra, chips de
// filtro, grupos con la vencida arriba y las realizadas colapsadas. El estado escrito
// acompaña siempre al color (regla transversal 09).

import { useState } from 'react';
import Link from 'next/link';
import type { Bandeja, TarjetaBandeja } from './bandeja.query';
import PanelCierre from './PanelCierre';

type Filtro = 'TODAS' | 'VENCIDAS' | 'POR_VENCER' | 'PENDIENTES';

const COLORES_TIPO: Record<string, { fondo: string; texto: string }> = {
  LECTURA: { fondo: '#e9f0fb', texto: '#12437f' },
  VERIFICACION: { fondo: '#fff3e6', texto: '#8a4407' },
  CAPACITACION: { fondo: '#e8f4ef', texto: '#0b5c44' },
  TAREA: { fondo: '#f5f7f6', texto: '#4a544f' },
};

const ETIQUETA_TIPO: Record<string, string> = {
  LECTURA: 'Lectura',
  VERIFICACION: 'Verificación',
  CAPACITACION: 'Capacitación',
  TAREA: 'Tarea',
};

export default function BandejaClient({ bandeja }: { bandeja: Bandeja }) {
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [colapsada, setColapsada] = useState(true);
  const [cerrando, setCerrando] = useState<TarjetaBandeja | null>(null);

  const todas = [...bandeja.vencidas, ...bandeja.porVencer, ...bandeja.pendientes];

  const porFiltro = (grupo: TarjetaBandeja[]) =>
    filtro === 'TODAS' ? grupo : grupo.filter((t) => encaja(t, filtro));

  const conteos = {
    TODAS: todas.length,
    VENCIDAS: bandeja.vencidas.length,
    POR_VENCER: bandeja.porVencer.length,
    PENDIENTES: bandeja.pendientes.length,
  };

  return (
    <main className="mx-auto w-full max-w-[1040px] flex-1 px-8 pb-16 pt-8">
      <section className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-23 font-bold text-primary">{bandeja.persona?.nombre ?? 'Bandeja'}</h1>
          <p className="text-12_5 text-muted">
            {bandeja.persona
              ? [bandeja.persona.area, bandeja.persona.cargo].filter(Boolean).join(' · ') || 'Mi SIG'
              : 'Mi SIG'}
          </p>
        </div>
        {/*
          Reportar vive acá porque cualquiera reporta (B3) y este es el único lugar del
          sistema al que todo el mundo llega. Estuvo enlazado solo desde la grilla de
          Operación, que un Colaborador no puede abrir: la capacidad existía y no había
          por dónde ejercerla.
        */}
        <div className="flex items-center gap-2">
          <Link
            href="/mi-sig/reportar"
            className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            Reportar hallazgo
          </Link>
          <Link
            href="/mi-sig/historial"
            className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 font-medium text-muted"
          >
            Mi historial
          </Link>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-4">
        <Contador cifra={bandeja.contadores.vencidas} etiqueta="Vencidas" color="#a52016" />
        <Contador cifra={bandeja.contadores.porVencer} etiqueta="Por vencer" color="#c25a1e" />
        <Contador cifra={bandeja.contadores.realizadasPeriodo} etiqueta="Realizadas" color="#0b5c44" />
      </section>

      <nav className="mt-6 flex items-center gap-2" aria-label="Filtrar la bandeja">
        {(['TODAS', 'VENCIDAS', 'POR_VENCER', 'PENDIENTES'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className="rounded-chip px-3.5 py-1.5 text-12 transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            style={{
              background: filtro === f ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: filtro === f ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
              fontWeight: filtro === f ? 600 : 500,
            }}
          >
            {etiquetaFiltro(f)} · {conteos[f]}
          </button>
        ))}
      </nav>

      <section className="mt-5 flex flex-col gap-6">
        <Grupo
          titulo="Vencidas · siguen exigibles"
          color="#a52016"
          tarjetas={porFiltro(bandeja.vencidas)}
          alCerrar={setCerrando}
        />
        <Grupo
          titulo="Por vencer esta semana"
          color="#8a4407"
          tarjetas={porFiltro(bandeja.porVencer)}
          alCerrar={setCerrando}
        />
        <Grupo
          titulo="Pendientes"
          color="#a3aca7"
          tarjetas={porFiltro(bandeja.pendientes)}
          alCerrar={setCerrando}
        />

        <div>
          <button
            onClick={() => setColapsada((c) => !c)}
            className="flex w-full items-center justify-between rounded-tarjeta px-4 py-3 text-12_5 font-semibold"
            style={{ background: '#eef7f1', color: '#0b5c44', border: '1px solid #c9e3d8' }}
            aria-expanded={!colapsada}
          >
            Realizadas este periodo · {bandeja.realizadas.length}
            <span>{colapsada ? '▸' : '▾'}</span>
          </button>
          {!colapsada && (
            <div className="mt-2 flex flex-col gap-2">
              {bandeja.realizadas.map((t) => (
                <Tarjeta key={t.id} tarjeta={t} alCerrar={setCerrando} />
              ))}
            </div>
          )}
        </div>
      </section>

      {cerrando && <PanelCierre tarjeta={cerrando} alCerrar={() => setCerrando(null)} />}
    </main>
  );
}

function encaja(t: TarjetaBandeja, filtro: Filtro): boolean {
  if (filtro === 'VENCIDAS') return t.vencida;
  if (filtro === 'POR_VENCER') return !t.vencida && t.dias >= 0 && t.dias <= 7;
  if (filtro === 'PENDIENTES') return !t.vencida && t.dias > 7;
  return true;
}

function etiquetaFiltro(f: Filtro): string {
  return { TODAS: 'Todas', VENCIDAS: 'Vencidas', POR_VENCER: 'Por vencer', PENDIENTES: 'Pendientes' }[f];
}

function Contador({ cifra, etiqueta, color }: { cifra: number; etiqueta: string; color: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <span className="font-mono text-26 font-semibold tabular-nums" style={{ color }}>
        {cifra}
      </span>
      <span className="text-12_5 text-muted">{etiqueta}</span>
    </div>
  );
}

function Grupo({
  titulo,
  color,
  tarjetas,
  alCerrar,
}: {
  titulo: string;
  color: string;
  tarjetas: TarjetaBandeja[];
  alCerrar: (t: TarjetaBandeja) => void;
}) {
  if (tarjetas.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-12_5 font-semibold" style={{ color }}>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {titulo}
      </h2>
      {tarjetas.map((t) => (
        <Tarjeta key={t.id} tarjeta={t} alCerrar={alCerrar} />
      ))}
    </div>
  );
}

function Tarjeta({
  tarjeta,
  alCerrar,
}: {
  tarjeta: TarjetaBandeja;
  alCerrar: (t: TarjetaBandeja) => void;
}) {
  const colores = COLORES_TIPO[tarjeta.tipo] ?? COLORES_TIPO.TAREA;
  const plazo = textoPlazo(tarjeta);
  return (
    <article
      className="flex items-center gap-4 rounded-tarjeta bg-surface px-5 py-4"
      style={{ border: '1px solid var(--hf-border-field)' }}
    >
      <span
        className="flex h-[34px] w-[74px] flex-none items-center justify-center rounded-[4px] font-mono text-8_5 font-semibold uppercase"
        style={{ background: colores.fondo, color: colores.texto }}
      >
        {ETIQUETA_TIPO[tarjeta.tipo] ?? tarjeta.tipo}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-13_5 font-medium text-primary">{tarjeta.titulo}</h3>
          {tarjeta.cierreAdministrativo && (
            <span
              className="flex-none rounded-[4px] px-1.5 py-0.5 font-mono text-9 font-semibold uppercase"
              style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
            >
              cierre administrativo
            </span>
          )}
        </div>
        <p className="truncate font-mono text-10_5 text-muted">
          {tarjeta.codigo}
          {tarjeta.procedimientoOrigen ? ` · ${tarjeta.procedimientoOrigen}` : ''}
        </p>
      </div>
      <span
        className="flex-none text-12 font-semibold"
        style={{ color: tarjeta.vencida ? 'var(--hf-danger-text)' : 'var(--hf-warn-text)' }}
      >
        {plazo}
      </span>
      <span className="flex-none text-11_5 text-muted">
        {tarjeta.fechaLimite.toISOString().slice(0, 10)}
      </span>
      <button
        onClick={() => alCerrar(tarjeta)}
        className="flex-none rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        style={{
          background: tarjeta.vencida
            ? 'var(--hf-danger-text)'
            : tarjeta.dias <= 7
              ? 'var(--hf-brand-nav)'
              : 'var(--hf-text-secondary-soft)',
        }}
      >
        {tarjeta.vencida || tarjeta.tipo === 'LECTURA' ? 'Leer y acusar' : 'Registrar'}
      </button>
    </article>
  );
}

function textoPlazo(t: TarjetaBandeja): string {
  if (t.vencida) {
    const dias = Math.abs(t.dias);
    return dias === 0 ? 'Vencida hoy' : `Vencida hace ${dias} día${dias === 1 ? '' : 's'}`;
  }
  if (t.dias === 0) return 'Vence hoy';
  return `Faltan ${t.dias} día${t.dias === 1 ? '' : 's'}`;
}