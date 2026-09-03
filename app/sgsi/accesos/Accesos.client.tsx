'use client';

// app/sgsi/accesos/Accesos.client.tsx
//
// **O13 · un acceso vigente sin solicitud que lo respalde es un hallazgo.** La fila se
// pinta y el panel lo cuenta, pero el sistema NO lo bloquea ni lo retira solo: la revisión
// tiene que explicar por qué existe o retirarlo, y esa decisión es de una persona.
//
// El color nunca viaja solo (invariante 9): la fila en rojo lleva además la etiqueta «sin
// sustento» en su columna, porque quien no distingue el rojo tiene que poder leer lo mismo.

import { useRouter } from 'next/navigation';

export interface AccesoFila {
  id: number;
  persona: string;
  perfil: string;
  sistema: string;
  desde: string;
  /// Nulo significa vigente. No es lo mismo que una fecha en el futuro.
  hasta: string | null;
  sustento: string | null;
}

const ROJO = '#a52016';
const VERDE = '#0b5c44';
const AMBAR = '#8a4407';

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

/// `dd/mm/aa`, el formato del lienzo. Se parte la cadena en vez de construir un `Date`
/// para no reintroducir el corrimiento de zona horaria: la fecha ya viene en ISO desde el
/// servidor y acá sólo se reordena.
function corto(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

function largo(iso: string): string {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const [a, m, d] = iso.split('-');
  return `${Number(d)} de ${meses[Number(m) - 1]} de ${a}`;
}

export default function AccesosClient({
  fecha,
  hoy,
  cierres,
  totalRelaciones,
  accesos,
}: {
  fecha: string;
  hoy: string;
  cierres: string[];
  totalRelaciones: number;
  accesos: AccesoFila[];
}) {
  const router = useRouter();
  const sinSustento = accesos.filter((a) => a.sustento === null);
  const personas = new Set(accesos.map((a) => a.persona)).size;

  const irA = (f: string) => router.push(f === hoy ? '/sgsi/accesos' : `/sgsi/accesos?fecha=${f}`);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[92ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Accesos y perfiles</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Persona y perfil son una{' '}
            <strong className="font-semibold text-secondary">relación con vigencia</strong>, no una
            casilla en una cuadrícula. Por eso se puede preguntar quién tenía qué en una fecha
            pasada.
          </p>
        </div>
        {/* La solicitud es el paso previo del acceso, y su pantalla todavía no existe.
            Se dibuja deshabilitada en vez de omitirse: un botón que falta parece una
            función que no existe, y acá lo que falta es la pantalla, no el modelo. */}
        <button
          disabled
          title="La pantalla de solicitudes es parte de REQ-SIG-07 y todavía no está construida."
          className="ml-auto flex-none cursor-not-allowed rounded-campo px-4 py-2 text-12_5 font-semibold text-white opacity-45"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          Solicitar acceso
        </button>
      </div>

      {/* El control que lo cambia todo. Va arriba de la tabla y no en una barra de filtros
          porque no filtra: cambia la pregunta. */}
      <section className="mt-4 flex flex-wrap items-center gap-4 rounded-tarjeta border bg-surface px-4 py-3" style={{ borderColor: 'var(--hf-brand-200, #d3dceb)' }}>
        <span className="flex flex-col gap-0.5">
          <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
            Estado de los accesos a fecha
          </span>
          <span className="text-11_5 text-muted [text-wrap:pretty]">
            Es la pregunta que hace un auditor, y la que una cuadrícula de casillas no puede
            responder.
          </span>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {[hoy, ...cierres].map((f) => {
            const activa = f === fecha;
            return (
              <button
                key={f}
                onClick={() => irA(f)}
                aria-pressed={activa}
                className="rounded-campo px-3 py-1.5 text-11_5"
                style={{
                  background: activa ? 'var(--hf-bg-surface)' : 'transparent',
                  border: `1px solid ${activa ? 'var(--hf-brand-200, #d3dceb)' : 'transparent'}`,
                  color: activa ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  fontWeight: activa ? 600 : 500,
                }}
              >
                {f === hoy ? 'Hoy' : corto(f)}
              </button>
            );
          })}
          {/* Cualquier fecha, no sólo los atajos: los cierres son una comodidad, no el
              conjunto de preguntas que se pueden hacer. */}
          <input
            type="date"
            value={fecha}
            onChange={(e) => e.target.value && irA(e.target.value)}
            className="entrada-campo py-1"
            aria-label="Otra fecha"
          />
        </span>
      </section>

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        <section className="min-w-0 flex-1 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
            <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
              Vigentes al {largo(fecha)}
            </span>
            <span className="font-mono text-9_5 text-faint">
              {accesos.length} relaciones · {personas} personas
            </span>
            <span className="ml-auto flex gap-3">
              {[
                { etiqueta: 'Con sustento', color: '#0f7a5a' },
                { etiqueta: 'Sin sustento', color: ROJO },
              ].map((l) => (
                <span key={l.etiqueta} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: l.color }} />
                  <span className="text-11 text-secondary">{l.etiqueta}</span>
                </span>
              ))}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-12_5">
              <thead>
                <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
                  <th className="px-4 py-2.5 font-semibold">Persona</th>
                  <th className="px-4 py-2.5 font-semibold">Perfil</th>
                  <th className="px-4 py-2.5 font-semibold">Desde</th>
                  <th className="px-4 py-2.5 font-semibold">Hasta</th>
                  <th className="px-4 py-2.5 font-semibold">Sustento</th>
                </tr>
              </thead>
              <tbody>
                {accesos.map((a) => {
                  const sin = a.sustento === null;
                  return (
                    <tr
                      key={a.id}
                      className="border-t border-border-default"
                      style={sin ? { background: '#fdeeeb' } : undefined}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span
                            className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-9 font-bold"
                            style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
                          >
                            {iniciales(a.persona)}
                          </span>
                          <span className="text-12 text-primary">{a.persona}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-12_5 font-medium text-primary">{a.perfil}</div>
                        <div className="font-mono text-9_5 text-muted">{a.sistema}</div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-11 text-secondary">{corto(a.desde)}</td>
                      <td className="px-4 py-2.5 font-mono text-11" style={{ color: a.hasta === null ? VERDE : AMBAR }}>
                        {a.hasta === null ? 'Vigente' : corto(a.hasta)}
                      </td>
                      <td className="px-4 py-2.5">
                        {sin ? (
                          <span
                            className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 font-semibold uppercase tracking-[0.06em]"
                            style={{ background: '#fdeeeb', color: ROJO, border: `1px solid ${ROJO}33` }}
                          >
                            Sin sustento
                          </span>
                        ) : (
                          <span className="font-mono text-10 font-medium text-accent">{a.sustento}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {accesos.length === 0 && (
              <p className="px-4 py-8 text-center text-12 text-muted [text-wrap:pretty]">
                {totalRelaciones === 0
                  ? 'No hay accesos cargados todavía. La matriz del consultor no se importó, y el modelo no inventa las relaciones que esa matriz tiene.'
                  : `Ninguna relación estaba vigente el ${largo(fecha)}. Hay ${totalRelaciones} en total, todas fuera de esa fecha.`}
              </p>
            )}
          </div>
        </section>

        <aside className="flex w-full flex-none flex-col gap-3.5 xl:w-[336px]">
          <section className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
            <Rotulo texto="Revisión del periodo" />
            {[
              { valor: accesos.length, etiqueta: 'accesos vigentes a la fecha consultada', color: 'var(--hf-brand-nav)' },
              { valor: sinSustento.length, etiqueta: 'sin una solicitud que los respalde', color: sinSustento.length > 0 ? ROJO : VERDE },
              { valor: personas, etiqueta: 'personas con al menos un acceso', color: 'var(--hf-brand-nav)' },
            ].map((r) => (
              <span key={r.etiqueta} className="flex items-baseline gap-2.5">
                <span
                  className="w-[30px] flex-none text-right font-mono text-17 font-semibold tabular-nums"
                  style={{ color: r.color }}
                >
                  {r.valor}
                </span>
                <span className="flex-1 text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
                  {r.etiqueta}
                </span>
              </span>
            ))}
            {/* El lienzo pone acá «Cerrar la revisión trimestral». No hay dónde guardar ese
                cierre —no existe una tabla de revisiones de acceso— ni fuente que diga que
                la cadencia es trimestral. Se dibuja deshabilitado y con el motivo: un botón
                que guarda en ninguna parte es peor que un botón apagado. */}
            <button
              disabled
              className="mt-1 cursor-not-allowed rounded-campo px-3.5 py-2 text-12 font-semibold text-white opacity-45"
              style={{ background: 'var(--hf-brand-nav)' }}
            >
              Cerrar la revisión
            </button>
            <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
              Falta el modelo para registrar el cierre y la fuente que fije cada cuánto se
              revisa. Ninguna de las dos se inventa acá.
            </span>
          </section>

          {sinSustento.length > 0 && (
            <section
              className="flex flex-col gap-2.5 rounded-tarjeta px-4 py-3.5"
              style={{ background: '#fdeeeb', border: '1px solid #f2cdc6' }}
            >
              <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em]" style={{ color: ROJO }}>
                Accesos sin sustento
              </span>
              <span className="text-11_5 leading-relaxed [text-wrap:pretty]" style={{ color: ROJO }}>
                {sinSustento.length === 1
                  ? 'Un acceso vigente no tiene solicitud que lo respalde. La revisión debe explicar por qué existe o retirarlo.'
                  : `${sinSustento.length} accesos vigentes no tienen solicitud que los respalde. La revisión debe explicar por qué existen o retirarlos.`}
              </span>
              {/* El hallazgo se levanta en Mejora, con el origen apuntando acá. La pantalla
                  señala; no retira el acceso sola. */}
              <a
                href={`/mi-sig/reportar?origen=SGSI&referencia=${encodeURIComponent(`Revisión de accesos al ${fecha}`)}`}
                className="self-start rounded-campo px-3 py-2 text-11_5 font-semibold text-white"
                style={{ background: ROJO, border: '1px solid #8a1f16' }}
              >
                Levantar hallazgo
              </a>
            </section>
          )}

          <section className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
            <Rotulo texto="Lo que esto reemplaza" />
            <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
              La matriz del consultor pone{' '}
              <strong className="font-semibold">una columna por empleado</strong>. Cada ingreso o
              salida obliga a alterar la estructura de la tabla, y el histórico de quién tuvo qué
              acceso se pierde al sobrescribir la celda.
            </span>
            <div className="flex flex-col gap-1.5 rounded-campo border border-border-field bg-subtle px-3 py-2.5">
              <span className="font-mono text-8_5 uppercase tracking-[0.06em] text-faint">
                En el sistema
              </span>
              <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
                Una fila por relación, con fecha de inicio y de fin. Dar de alta a alguien es
                insertar filas; darlo de baja es cerrarlas. La estructura nunca cambia y el pasado
                no se pierde.
              </span>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Rotulo({ texto }: { texto: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
        {texto}
      </span>
      <span className="h-px flex-1 bg-hairline" />
    </span>
  );
}
