'use client';

// app/sig/calendario/Calendario.client.tsx
//
// Mes y semana con el navegador, chips de área, leyenda de estados y el día seleccionado
// con su lista. Los colores de estado salen de globals.css.
//
// Tres cosas que la cabecera de este archivo prometía y no estaban:
//
//   · Los chips de área. Se anunciaban en el comentario y no existían.
//
//   · La vista «Semana». El botón cambiaba un estado que nadie leía: la malla siempre
//     dibujaba el mes. Un control que no hace nada es peor que un control que falta,
//     porque el que falta se nota.
//
//   · «Por vencer». Estaba en la leyenda con su color y la malla nunca lo pintaba, porque
//     el umbral de siete días no se aplicaba acá. Ahora la regla vive una sola vez, en
//     `lib/sig/cierre.ts`, y la usan la bandeja, el correo semanal y esta malla.
//
// El color acompaña al estado escrito y nunca lo reemplaza (nota del lienzo): cada marca
// lleva su punto de color Y su etiqueta, y el aside repite el estado en palabras.

import { useMemo, useState } from 'react';
import { estadoDeVencimiento, type EstadoVencimiento } from '@/lib/sig/cierre';

export interface MarcaCalendario {
  id: number;
  fecha: string;
  estado: 'PENDIENTE' | 'REALIZADA' | 'NO_APLICA' | 'ANULADA';
  persona: string;
  area: string | null;
  titulo: string;
  codigo: string;
  periodo: string;
}

/// Los cuatro estados del lienzo. `punto` es el color del indicador; `fondo` y `texto`
/// visten la marca dentro de la celda.
const ESTADO: Record<
  EstadoVencimiento,
  { etiqueta: string; punto: string; fondo: string; texto: string }
> = {
  VENCIDA: { etiqueta: 'Vencida', punto: '#a52016', fondo: '#fdeeeb', texto: '#a52016' },
  POR_VENCER: { etiqueta: 'Por vencer', punto: '#c25a1e', fondo: '#fff3e6', texto: '#8a4407' },
  PENDIENTE: { etiqueta: 'Pendiente', punto: '#12437f', fondo: '#eef2f8', texto: '#12437f' },
  REALIZADA: { etiqueta: 'Realizada', punto: '#0f7a5a', fondo: '#e6efe9', texto: '#0b5c44' },
};

const ORDEN_ESTADOS: EstadoVencimiento[] = ['VENCIDA', 'POR_VENCER', 'PENDIENTE', 'REALIZADA'];

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/// El lunes de la semana que contiene esa fecha. La semana arranca en lunes porque así la
/// dibuja el lienzo y así se lee un calendario de trabajo.
function lunesDe(fecha: Date): Date {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export default function CalendarioClient({
  marcas,
  areas,
}: {
  marcas: MarcaCalendario[];
  areas: string[];
}) {
  const hoy = useMemo(() => new Date(), []);
  const [vista, setVista] = useState<'mes' | 'semana'>('mes');
  /// El ancla del periodo visible: el día 1 en vista mes, el lunes en vista semana. Una
  /// sola fecha para las dos vistas evita que cambiar de vista salte a otro periodo.
  const [ancla, setAncla] = useState<Date>(() => new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1)));
  const [area, setArea] = useState<string>('TODAS');
  const [seleccionado, setSeleccionado] = useState<string>(() => iso(hoy));

  const visibles = useMemo(
    () => (area === 'TODAS' ? marcas : marcas.filter((m) => m.area === area)),
    [marcas, area],
  );

  const porDia = useMemo(() => {
    const m = new Map<string, MarcaCalendario[]>();
    for (const marca of visibles) {
      const lista = m.get(marca.fecha) ?? [];
      lista.push(marca);
      m.set(marca.fecha, lista);
    }
    return m;
  }, [visibles]);

  const celdas = useMemo(() => {
    if (vista === 'semana') {
      const lunes = lunesDe(ancla);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(lunes);
        d.setUTCDate(d.getUTCDate() + i);
        return iso(d);
      });
    }
    const anio = ancla.getUTCFullYear();
    const mes = ancla.getUTCMonth();
    const offset = (new Date(Date.UTC(anio, mes, 1)).getUTCDay() + 6) % 7;
    const dias = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const lista: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= dias; d++) {
      lista.push(`${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return lista;
  }, [vista, ancla]);

  function navegar(delta: number) {
    setAncla((previo) => {
      if (vista === 'semana') {
        const d = lunesDe(previo);
        d.setUTCDate(d.getUTCDate() + delta * 7);
        return d;
      }
      return new Date(Date.UTC(previo.getUTCFullYear(), previo.getUTCMonth() + delta, 1));
    });
  }

  const rotuloPeriodo = useMemo(() => {
    if (vista === 'mes') {
      return `${MESES[ancla.getUTCMonth()]} de ${ancla.getUTCFullYear()}`;
    }
    const lunes = lunesDe(ancla);
    const domingo = new Date(lunes);
    domingo.setUTCDate(domingo.getUTCDate() + 6);
    const mismoMes = lunes.getUTCMonth() === domingo.getUTCMonth();
    return mismoMes
      ? `${lunes.getUTCDate()}–${domingo.getUTCDate()} de ${MESES[lunes.getUTCMonth()]}`
      : `${lunes.getUTCDate()} de ${MESES[lunes.getUTCMonth()]} – ${domingo.getUTCDate()} de ${MESES[domingo.getUTCMonth()]}`;
  }, [vista, ancla]);

  const delDia = porDia.get(seleccionado) ?? [];

  return (
    <main className="flex flex-1 flex-col px-8 pt-7 pb-14">
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Calendario</h1>
          <p className="text-12_5 text-muted">
            Las asignaciones en su fecha límite. El color acompaña al estado escrito, nunca lo
            reemplaza.
          </p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          <span className="flex items-center gap-0.5 rounded-campo border border-border-field bg-surface p-[3px]">
            {(['mes', 'semana'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                aria-pressed={vista === v}
                className="rounded-[4px] px-3 py-1 text-12 font-medium capitalize"
                style={{
                  background: vista === v ? 'var(--hf-brand-100)' : 'transparent',
                  color: vista === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)',
                }}
              >
                {v}
              </button>
            ))}
          </span>
          <span className="flex items-center gap-2.5 rounded-campo border border-border-field bg-surface px-3 py-1.5">
            <button
              onClick={() => navegar(-1)}
              aria-label={vista === 'mes' ? 'Mes anterior' : 'Semana anterior'}
              className="text-13 text-muted"
            >
              ‹
            </button>
            <span className="min-w-[172px] text-center text-12_5 font-semibold text-primary">
              {rotuloPeriodo}
            </span>
            <button
              onClick={() => navegar(1)}
              aria-label={vista === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}
              className="text-13 text-muted"
            >
              ›
            </button>
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {['TODAS', ...areas].map((a) => {
          const activo = area === a;
          return (
            <button
              key={a}
              onClick={() => setArea(a)}
              aria-pressed={activo}
              className="rounded-chip px-3 py-1.5 text-12"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                fontWeight: activo ? 600 : 500,
              }}
            >
              {a === 'TODAS' ? 'Todas las áreas' : a}
            </button>
          );
        })}
        <span className="ml-auto flex flex-wrap items-center gap-3.5">
          {ORDEN_ESTADOS.map((e) => (
            <span key={e} className="inline-flex items-center gap-1.5">
              <span
                className="h-[9px] w-[9px] rounded-[3px]"
                style={{ background: ESTADO[e].punto }}
              />
              <span className="text-11 text-secondary-soft">{ESTADO[e].etiqueta}</span>
            </span>
          ))}
        </span>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col rounded-tarjeta border border-border-field bg-surface px-4 pb-4 pt-3.5">
          <div className="mb-2 grid grid-cols-7 gap-1.5">
            {DIAS.map((d) => (
              <span key={d} className="etiqueta-campo text-center">
                {d}
              </span>
            ))}
          </div>
          <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-1.5">
            {celdas.map((fecha, i) =>
              fecha === null ? (
                <span key={`vacia-${i}`} />
              ) : (
                <Celda
                  key={fecha}
                  fecha={fecha}
                  hoy={hoy}
                  marcas={porDia.get(fecha) ?? []}
                  elegida={seleccionado === fecha}
                  onElegir={() => setSeleccionado(fecha)}
                />
              ),
            )}
          </div>
        </div>

        <aside className="flex w-[336px] flex-none flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
          <div className="flex flex-col gap-1 border-b border-hairline px-4.5 py-4">
            <span className="etiqueta-campo">Día seleccionado</span>
            <span className="text-15 font-semibold text-primary">{enPalabras(seleccionado)}</span>
            <span className="text-11_5 text-muted">
              {delDia.length === 1 ? '1 vencimiento' : `${delDia.length} vencimientos`}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3.5 py-3">
            {delDia.map((m) => {
              const e = ESTADO[estadoDeVencimiento(m.estado, new Date(`${m.fecha}T00:00:00.000Z`), hoy)];
              const vencida = e.etiqueta === 'Vencida';
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-1.5 rounded-tarjeta px-3.5 py-2.5"
                  style={{
                    background: vencida ? '#fdeeeb' : 'var(--hf-bg-subtle)',
                    border: `1px solid ${vencida ? '#f2cdc6' : 'var(--hf-border-field)'}`,
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="rounded-[4px] px-1.5 py-0.5 font-mono text-8_5 uppercase"
                      style={{ background: e.fondo, color: e.texto }}
                    >
                      {e.etiqueta}
                    </span>
                    <span className="font-mono text-9_5 text-muted">{m.codigo}</span>
                  </span>
                  <span className="text-12_5 font-medium leading-snug text-primary">{m.titulo}</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="flex h-[19px] w-[19px] items-center justify-center rounded-full text-8_5 font-bold"
                      style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
                    >
                      {iniciales(m.persona)}
                    </span>
                    <span className="text-11_5 text-secondary-soft">{m.persona}</span>
                  </span>
                </div>
              );
            })}
            {delDia.length === 0 && (
              <span className="px-2 py-7 text-center text-12 leading-relaxed text-label">
                Ningún vencimiento este día.
                <br />
                Elegí otro en la malla.
              </span>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Celda({
  fecha,
  hoy,
  marcas,
  elegida,
  onElegir,
}: {
  fecha: string;
  hoy: Date;
  marcas: MarcaCalendario[];
  elegida: boolean;
  onElegir: () => void;
}) {
  const conMarcas = marcas.length > 0;
  return (
    <button
      onClick={onElegir}
      aria-pressed={elegida}
      className="flex min-h-[84px] flex-col items-start gap-1 rounded-[8px] p-1.5 text-left"
      style={{
        background: elegida ? 'var(--hf-brand-100)' : conMarcas ? 'var(--hf-bg-subtle)' : 'var(--hf-bg-surface)',
        border: `1px solid ${elegida ? 'var(--hf-brand-nav)' : conMarcas ? 'var(--hf-border-field)' : 'var(--hf-hairline)'}`,
      }}
    >
      <span className="flex w-full items-center justify-between">
        <span
          className="font-mono text-11"
          style={{
            color: elegida
              ? 'var(--hf-brand-nav)'
              : conMarcas
                ? 'var(--hf-text-primary)'
                : 'var(--hf-text-label)',
            fontWeight: elegida || conMarcas ? 600 : 400,
          }}
        >
          {Number(fecha.slice(8))}
        </span>
        {marcas.length > 2 && (
          <span className="font-mono text-9 text-muted">+{marcas.length - 2}</span>
        )}
      </span>
      <span className="flex w-full flex-col gap-[3px]">
        {marcas.slice(0, 2).map((m) => {
          const e = ESTADO[estadoDeVencimiento(m.estado, new Date(`${m.fecha}T00:00:00.000Z`), hoy)];
          return (
            <span
              key={m.id}
              className="flex w-full items-center gap-1.5 rounded-[3px] px-1.5 py-0.5"
              style={{ background: e.fondo }}
            >
              <span
                className="h-[5px] w-[5px] flex-none rounded-full"
                style={{ background: e.punto }}
              />
              <span
                className="min-w-0 flex-1 truncate text-left text-9_5 font-medium"
                style={{ color: e.texto }}
              >
                {m.persona}
              </span>
            </span>
          );
        })}
      </span>
    </button>
  );
}

/// «15 de septiembre de 2026». La fecha cruda en una cabecera obliga a leer dígitos.
function enPalabras(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split('-');
  return `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${anio}`;
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
