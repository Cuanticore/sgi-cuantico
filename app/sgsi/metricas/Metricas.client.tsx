'use client';

// app/sgsi/metricas/Metricas.client.tsx
//
// **O10 · el umbral no está en el código.** Cada métrica trae el suyo y su sentido, y la
// pantalla dibuja la línea de umbral donde ese dato la ponga.
//
// **La tendencia es la alerta, no el dato suelto.** Un valor sobre el umbral y tres meses
// consecutivos sobre el umbral son dos conversaciones distintas, y la ficha las separa.
//
// El color nunca viaja solo: la barra roja lleva su valor arriba y la alerta de ese periodo
// aparece listada abajo con su texto.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { definirMetrica, registrarMedicion } from '@/app/sig/acciones/metricas';
import {
  alertasDeLaSerie,
  enAlerta,
  escalaDeLaSerie,
  ETIQUETA_ESTADO_METRICA,
  ETIQUETA_SENTIDO,
  formatearNumero,
  rachaDeAlerta,
  textoDeAlerta,
  type EstadoMetrica,
  type Medicion,
  type SentidoMetrica,
} from '@/lib/sig/metricas';

const VERDE = '#0f7a5a';
const ROJO = '#a52016';

const COLOR_ESTADO: Record<EstadoMetrica, { fondo: string; texto: string }> = {
  EN_ALERTA: { fondo: '#fdeeeb', texto: ROJO },
  EN_RANGO: { fondo: '#e6efe9', texto: '#0b5c44' },
  SIN_REGISTRAR: { fondo: '#fff3e6', texto: '#8a4407' },
};

export interface FilaMetrica {
  codigo: string;
  titulo: string;
  periodicidad: string;
  umbral: number;
  sentido: SentidoMetrica;
  ultimo: number | null;
  estado: EstadoMetrica;
}

export interface FichaMetrica {
  codigo: string;
  control: string;
  titulo: string;
  unidad: string;
  umbral: number;
  sentido: SentidoMetrica;
  periodicidad: string;
  responsable: string;
  serie: Medicion[];
  racha: number;
  tareas: Record<string, { id: number; etiqueta: string }>;
}

export default function MetricasClient({
  lista,
  elegidoCodigo,
  personas,
  ficha,
}: {
  lista: FilaMetrica[];
  elegidoCodigo: string | null;
  personas: { id: number; nombre: string }[];
  ficha: FichaMetrica | null;
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [definiendo, setDefiniendo] = useState(false);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[90ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Métricas del SGSI</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Unidad, umbral y periodicidad. Superar el umbral genera alerta y, si procede, una
            tarea. La serie no tiene fin de año: no hay una hoja nueva cada enero.
          </p>
        </div>
        <button
          onClick={() => setDefiniendo((v) => !v)}
          className="ml-auto flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {definiendo ? 'Cerrar' : 'Nueva métrica'}
        </button>
      </div>

      {definiendo && <FormularioMetrica personas={personas} setAviso={setAviso} />}

      {aviso && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        <div className="flex w-full flex-none flex-col gap-1 rounded-tarjeta border border-border-field bg-surface p-2 xl:w-[360px]">
          {lista.map((m) => {
            const activa = m.codigo === elegidoCodigo;
            const e = COLOR_ESTADO[m.estado];
            const alerta = m.ultimo !== null && enAlerta(m.ultimo, { umbral: m.umbral, sentido: m.sentido });
            return (
              <button
                key={m.codigo}
                onClick={() => router.push(`/sgsi/metricas?m=${m.codigo}`)}
                aria-pressed={activa}
                className="flex flex-col gap-1.5 rounded-campo px-3 py-2.5 text-left"
                style={{
                  background: activa ? 'var(--hf-brand-100)' : 'transparent',
                  border: `1px solid ${activa ? 'var(--hf-brand-200, #d3dceb)' : 'transparent'}`,
                }}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="font-mono text-10 font-semibold text-accent">{m.codigo}</span>
                  <span className="font-mono text-9_5 text-muted">{m.periodicidad}</span>
                  <span className="ml-auto">
                    <Etiqueta texto={ETIQUETA_ESTADO_METRICA[m.estado]} fondo={e.fondo} color={e.texto} />
                  </span>
                </span>
                <span className="w-full text-12_5 font-medium leading-snug text-primary">{m.titulo}</span>
                <span className="flex w-full items-baseline gap-2">
                  <span
                    className="font-mono text-16 font-semibold tabular-nums"
                    style={{ color: m.ultimo === null ? 'var(--hf-text-muted)' : alerta ? ROJO : VERDE }}
                  >
                    {m.ultimo === null ? '—' : formatearNumero(m.ultimo)}
                  </span>
                  <span className="font-mono text-9_5 text-faint">umbral {formatearNumero(m.umbral)}</span>
                </span>
              </button>
            );
          })}
          {lista.length === 0 && (
            <p className="px-3 py-8 text-center text-12 text-muted [text-wrap:pretty]">
              Ninguna métrica definida todavía. Las métricas del SGSI alimentan el informe de
              la 9.1 y son distintas de los indicadores del SGC.
            </p>
          )}
        </div>

        {ficha !== null && <Ficha ficha={ficha} setAviso={setAviso} />}
      </div>
    </main>
  );
}

/// El alta. **El umbral y su sentido se piden acá, no después**: una métrica sin umbral no
/// puede decir si está cumpliendo, y una sin sentido no sabe de qué lado está lo malo.
function FormularioMetrica({
  personas,
  setAviso,
}: {
  personas: { id: number; nombre: string }[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [control, setControl] = useState('');
  const [titulo, setTitulo] = useState('');
  const [unidad, setUnidad] = useState('');
  const [umbral, setUmbral] = useState('');
  const [sentido, setSentido] = useState<SentidoMetrica>('MENOR_ES_MEJOR');
  const [periodicidad, setPeriodicidad] = useState('MENSUAL');
  const [responsableId, setResponsableId] = useState('');
  const [enviando, setEnviando] = useState(false);

  const listo =
    codigo.trim() !== '' &&
    control.trim() !== '' &&
    titulo.trim() !== '' &&
    unidad.trim() !== '' &&
    umbral !== '' &&
    responsableId !== '';

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
      <Rotulo texto="Nueva métrica" />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Código" valor={codigo} onChange={setCodigo} marcador="MET-05" />
        <Campo etiqueta="Control del Anexo A" valor={control} onChange={setControl} marcador="A.8.8" />
        <Campo etiqueta="Unidad" valor={unidad} onChange={setUnidad} marcador="días, %, incidentes" />
        <Campo etiqueta="Umbral" valor={umbral} onChange={setUmbral} marcador="15" numero />
      </div>
      <Campo etiqueta="Título" valor={titulo} onChange={setTitulo} marcador="Qué mide, en una línea" />

      <div className="flex flex-col gap-1">
        <span className="etiqueta-campo">Sentido · de qué lado está lo malo</span>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'MENOR_ES_MEJOR', texto: 'Menor es mejor · cruza al SUBIR del umbral' },
              { id: 'MAYOR_ES_MEJOR', texto: 'Mayor es mejor · cruza al BAJAR del umbral' },
            ] as const
          ).map((o) => {
            const activo = sentido === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setSentido(o.id)}
                aria-pressed={activo}
                className="rounded-campo px-3 py-1.5 text-11_5"
                style={{
                  background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                  border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                  color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  fontWeight: activo ? 600 : 500,
                }}
              >
                {o.texto}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Periodicidad</span>
          <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)} className="entrada-campo">
            {['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'].map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Responsable · recibe la tarea si cruza</span>
          <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="entrada-campo">
            <option value="">Elegir</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        disabled={!listo || enviando}
        onClick={async () => {
          setEnviando(true);
          const r = await definirMetrica({
            codigo,
            controlAnexoA: control,
            titulo,
            unidad,
            umbral: Number(umbral),
            sentido,
            // El enum viaja como cadena porque el `select` sólo ofrece valores válidos y
            // el servidor los valida contra el enum de Prisma igual.
            periodicidad: periodicidad as never,
            responsableId: Number(responsableId),
          });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1200);
        }}
        className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Guardando…' : 'Definir la métrica'}
      </button>
    </section>
  );
}

function Campo({
  etiqueta,
  valor,
  onChange,
  marcador,
  numero,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  marcador?: string;
  numero?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      <input
        type={numero ? 'number' : 'text'}
        step={numero ? 'any' : undefined}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="entrada-campo"
        placeholder={marcador}
      />
    </label>
  );
}

function Ficha({
  ficha,
  setAviso,
}: {
  ficha: FichaMetrica;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [registrando, setRegistrando] = useState(false);
  const definicion = { umbral: ficha.umbral, sentido: ficha.sentido };
  const escala = escalaDeLaSerie(ficha.serie, definicion);
  const alertas = alertasDeLaSerie(ficha.serie, definicion);
  const ultimo = ficha.serie.length === 0 ? null : ficha.serie[ficha.serie.length - 1];

  return (
    <section className="min-w-0 flex-1 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
      <div className="flex flex-wrap items-start gap-3 border-b border-hairline px-5 py-4">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-center gap-2.5">
            <span className="font-mono text-11 font-semibold text-accent">{ficha.codigo}</span>
            <span className="rounded-[4px] bg-subtle px-2 py-0.5 font-mono text-8_5 uppercase tracking-[0.07em] text-muted">
              {ficha.control}
            </span>
          </span>
          <span className="text-16 font-semibold leading-snug text-primary">{ficha.titulo}</span>
        </span>
        <button
          onClick={() => setRegistrando((v) => !v)}
          className="flex-none rounded-campo px-3.5 py-2 text-12 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {registrando ? 'Cerrar' : 'Registrar un periodo'}
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        {registrando && (
          <FormularioMedicion codigo={ficha.codigo} unidad={ficha.unidad} setAviso={setAviso} />
        )}

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Dato etiqueta="Unidad" valor={ficha.unidad} />
          <Dato
            etiqueta="Umbral"
            valor={`${formatearNumero(ficha.umbral)} · ${ETIQUETA_SENTIDO[ficha.sentido]}`}
            color={ROJO}
          />
          <Dato etiqueta="Periodicidad" valor={ficha.periodicidad} />
          <Dato etiqueta="Responsable" valor={ficha.responsable} />
        </div>

        <div className="flex flex-col gap-3">
          <Rotulo texto="Serie" derecha={`${ficha.serie.length} periodos`} />

          {ficha.serie.length === 0 ? (
            <p className="text-11_5 text-muted [text-wrap:pretty]">
              Sin mediciones. Una métrica sin registrar no está cumpliendo: está sin medir.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div
                className="relative flex h-[188px] min-w-[420px] items-end gap-2 rounded-tarjeta border border-border-field bg-subtle px-3 pt-3"
                role="img"
                aria-label={`Serie de ${ficha.codigo}: ${ficha.serie.map((p) => `${p.periodo} ${formatearNumero(p.valor)}`).join(', ')}. Umbral ${formatearNumero(ficha.umbral)}.`}
              >
                {/* La línea de umbral. Se dibuja siempre, aunque ningún valor se le
                    acerque: sin ella el gráfico no tiene contra qué leerse. */}
                <span
                  className="pointer-events-none absolute left-3 right-3 h-0.5 opacity-50"
                  style={{ background: ROJO, bottom: `calc(${escala.alturaUmbral * 140}px + 26px)` }}
                />
                <span
                  className="pointer-events-none absolute right-3 font-mono text-9 font-semibold"
                  style={{ color: ROJO, bottom: `calc(${escala.alturaUmbral * 140}px + 31px)` }}
                >
                  umbral {formatearNumero(ficha.umbral)}
                </span>

                {ficha.serie.map((p) => {
                  const sobre = enAlerta(p.valor, definicion);
                  const alto = Math.max(escala.alturaDe(p.valor) * 140, 4);
                  return (
                    <span key={p.periodo} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                      <span
                        className="font-mono text-9_5 font-semibold tabular-nums"
                        style={{ color: sobre ? ROJO : VERDE }}
                      >
                        {formatearNumero(p.valor)}
                      </span>
                      <span
                        title={`${p.periodo}: ${formatearNumero(p.valor)} ${ficha.unidad}${sobre ? ' · cruza el umbral' : ''}`}
                        className="w-full rounded-t-[4px]"
                        style={{ height: `${alto}px`, background: sobre ? ROJO : VERDE }}
                      />
                      <span className="font-mono text-8_5 text-muted">{p.periodo}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: VERDE }} />
              <span className="text-11 text-secondary">Dentro del umbral</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: ROJO }} />
              <span className="text-11 text-secondary">Cruza el umbral · genera alerta</span>
            </span>
            <span className="ml-auto text-11 text-muted">Un periodo no se puede registrar dos veces.</span>
          </div>

          {/* La tendencia, dicha aparte del dato. Es la diferencia entre «se pasó una vez»
              y «lleva tres periodos del mismo lado». */}
          {ficha.racha >= 2 && ultimo !== null && (
            <p
              className="rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
              style={{ background: '#fdeeeb', border: '1px solid #f2cdc6', color: ROJO }}
            >
              {ficha.racha} periodos consecutivos del mismo lado del umbral. La tendencia es la
              alerta, no el dato suelto.
            </p>
          )}
        </div>

        {alertas.length > 0 && (
          <div className="flex flex-col gap-2">
            <Rotulo texto="Alertas generadas" color={ROJO} />
            {alertas.map((a) => {
              const tarea = ficha.tareas[a.periodo];
              // La racha hasta ESE periodo, no la de hoy: una alerta vieja no debe heredar
              // la tendencia de la serie posterior.
              const hasta = ficha.serie.slice(0, ficha.serie.findIndex((s) => s.periodo === a.periodo) + 1);
              return (
                <div
                  key={a.periodo}
                  className="flex flex-wrap items-start gap-3 rounded-tarjeta px-3.5 py-3"
                  style={{ background: '#fdeeeb', border: '1px solid #f2cdc6' }}
                >
                  <span className="w-[62px] flex-none font-mono text-11 font-semibold" style={{ color: ROJO }}>
                    {a.periodo}
                  </span>
                  <span className="min-w-0 flex-1 text-12 leading-relaxed [text-wrap:pretty]" style={{ color: ROJO }}>
                    {textoDeAlerta(a, definicion, ficha.unidad, rachaDeAlerta(hasta, definicion))}
                  </span>
                  {tarea !== undefined ? (
                    <a href="/sig/tareas" className="flex-none font-mono text-9_5 font-medium text-accent hover:underline">
                      {tarea.etiqueta}
                    </a>
                  ) : (
                    // Una alerta anterior a que la tarea se abriera automáticamente. Se dice
                    // en vez de dejarlo en blanco: el blanco parece un enlace roto.
                    <span className="flex-none font-mono text-9_5 text-muted">sin tarea</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p
          className="rounded-tarjeta px-3.5 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-200, #d3dceb)', color: 'var(--hf-brand-nav)' }}
        >
          Estas métricas alimentan el{' '}
          <strong className="font-semibold">informe de la cláusula 9.1</strong> y la revisión
          por la dirección sin transcripción manual. Son distintas de los indicadores del SGC,
          que siguen viviendo en su tablero: conviene que no se dupliquen.
        </p>
      </div>
    </section>
  );
}

function FormularioMedicion({
  codigo,
  unidad,
  setAviso,
}: {
  codigo: string;
  unidad: string;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [periodo, setPeriodo] = useState('');
  const [valor, setValor] = useState('');
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="flex flex-wrap items-end gap-2.5 rounded-campo border border-border-field bg-subtle px-3.5 py-3">
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Periodo</span>
        <input
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="entrada-campo w-[130px]"
          placeholder="2026-09"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Valor · {unidad}</span>
        <input
          type="number"
          step="any"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="entrada-campo w-[130px]"
        />
      </label>
      <button
        disabled={enviando || periodo.trim() === '' || valor === ''}
        onClick={async () => {
          setEnviando(true);
          const r = await registrarMedicion(codigo, { periodo: periodo.trim(), valor: Number(valor) });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1400);
        }}
        className="rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Guardando…' : 'Registrar'}
      </button>
      <span className="min-w-[220px] flex-1 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
        Si cruza el umbral se abre una tarea al responsable en el mismo movimiento. La alerta
        no se guarda como tal: se calcula del valor contra el umbral vigente.
      </span>
    </div>
  );
}

function Dato({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <span className="flex flex-col gap-1.5 rounded-tarjeta border border-border-field bg-subtle px-3.5 py-3">
      <span className="etiqueta-campo">{etiqueta}</span>
      <span className="font-mono text-14 font-semibold" style={{ color: color ?? 'var(--hf-text-primary)' }}>
        {valor}
      </span>
    </span>
  );
}

function Rotulo({ texto, derecha, color }: { texto: string; derecha?: string; color?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em]"
        style={{ color: color ?? 'var(--hf-accent-600, var(--hf-brand-nav))' }}
      >
        {texto}
      </span>
      <span className="h-px flex-1 bg-hairline" />
      {derecha !== undefined && <span className="flex-none font-mono text-9 text-faint">{derecha}</span>}
    </span>
  );
}

function Etiqueta({ texto, fondo, color }: { texto: string; fondo: string; color: string }) {
  return (
    <span
      className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-8_5 font-semibold uppercase tracking-[0.06em]"
      style={{ background: fondo, color }}
    >
      {texto}
    </span>
  );
}
