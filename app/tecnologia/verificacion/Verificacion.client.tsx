'use client';

// app/tecnologia/verificacion/Verificacion.client.tsx
//
// **El «no aplica» no cuenta como incumplimiento, pero exige justificación escrita**: es la
// casilla que más se usa para esquivar un control, y la pantalla cuenta aparte las que
// están sin justificar.
//
// Esta pantalla es de LECTURA. Responder los ítems se hace donde se responde cualquier lista
// de verificación del módulo A —en la tarea, desde Mi SIG— y duplicar el editor acá sería
// el segundo motor que todo este módulo existe para no construir.

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ETIQUETA_PUERTA,
  ETIQUETA_RESPUESTA,
  PUERTAS,
  type Cumplimiento,
  type ValorRespuesta,
} from '@/lib/sig/desarrollo';

const COLOR: Record<ValorRespuesta | 'PENDIENTE', { punto: string; texto: string; fondo: string; borde: string }> = {
  CUMPLE: { punto: '#0f7a5a', texto: '#0b5c44', fondo: 'var(--hf-bg-surface)', borde: 'var(--hf-border-field)' },
  NO_CUMPLE: { punto: '#a52016', texto: '#a52016', fondo: '#fffbfa', borde: '#f2cdc6' },
  NO_APLICA: { punto: '#b6bdb9', texto: 'var(--hf-text-muted)', fondo: 'var(--hf-bg-surface)', borde: 'var(--hf-border-field)' },
  PENDIENTE: { punto: '#b8791a', texto: '#8a4407', fondo: '#fffaf3', borde: '#f2b473' },
};

export interface ItemFila {
  id: number;
  orden: number;
  texto: string;
  puerta: string | null;
  controlAnexoA: string | null;
  evidenciaEsperada: string | null;
  aplicaA: string;
  respuesta: ValorRespuesta | null;
  nota: string | null;
}

const MAPEO = [
  { concepto: 'El catálogo de 73 ítems', entidad: 'ContenidoSig de tipo VERIFICACION' },
  { concepto: 'Cada punto del catálogo', entidad: 'ItemVerificacion' },
  { concepto: 'Verificar una puerta de un sistema', entidad: 'Asignacion del módulo A' },
  { concepto: 'El resultado por ítem', entidad: 'RespuestaItem, que ya existía' },
];

export default function VerificacionClient({
  sistemas,
  sistemaCodigo,
  contratado,
  puertaElegida,
  items,
  cumplimiento,
  conteoPorPuerta,
  totalCatalogo,
  hayCatalogo,
}: {
  sistemas: { codigo: string; nombre: string; contratado: boolean }[];
  sistemaCodigo: string | null;
  contratado: boolean;
  puertaElegida: string;
  items: ItemFila[];
  cumplimiento: Cumplimiento;
  conteoPorPuerta: Record<string, number>;
  totalCatalogo: number;
  hayCatalogo: boolean;
}) {
  const router = useRouter();
  const irA = (codigo: string, p: string) =>
    router.push(`/tecnologia/verificacion?s=${codigo}${p === 'todas' ? '' : `&p=${p}`}`);

  const total = cumplimiento.cumple + cumplimiento.noCumple + cumplimiento.noAplica + cumplimiento.pendientes;

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex max-w-[106ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Verificación · los ítems de PTR-TEC-03</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            La guía PTR-TEC-03 aplicada a un sistema.{' '}
            <strong className="font-semibold text-secondary">No es un motor nuevo</strong>: es un
            contenido de tipo verificación del módulo A, y cada ejecución es una asignación.
          </p>
        </div>
        {sistemaCodigo !== null && (
          <label className="ml-auto flex flex-none flex-col gap-1.5">
            <span className="etiqueta-campo">Sistema</span>
            <select
              value={sistemaCodigo}
              onChange={(e) => irA(e.target.value, puertaElegida)}
              className="entrada-campo min-w-[280px]"
            >
              {sistemas.map((x) => (
                <option key={x.codigo} value={x.codigo}>
                  {x.codigo} · {x.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!hayCatalogo ? (
        <div className="mt-6 flex max-w-[92ch] flex-col gap-3">
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            <strong className="font-semibold text-secondary">El catálogo todavía no está cargado.</strong>{' '}
            Los ítems de PTR-TEC-03 son un contenido de tipo verificación con sus puntos, igual
            que cualquier otra lista del motor de tareas — no una tabla propia de este módulo. Se
            crean en{' '}
            <Link href="/sig/contenidos" className="font-medium text-accent underline">
              Contenidos
            </Link>{' '}
            y cada punto lleva su puerta, su control del Anexo A y su evidencia esperada.
          </p>
          <PanelMapeo />
        </div>
      ) : sistemaCodigo === null ? (
        <p className="mt-6 text-12_5 text-muted [text-wrap:pretty]">
          No hay sistemas con hoja de vida abierta contra los cuales verificar.
        </p>
      ) : (
        <>
          <nav className="mt-4 flex flex-wrap items-center gap-1.5">
            {(['todas', ...PUERTAS] as const).map((p) => {
              const activo = puertaElegida === p;
              const n = p === 'todas' ? total : (conteoPorPuerta[p] ?? 0);
              return (
                <button
                  key={p}
                  onClick={() => irA(sistemaCodigo, p)}
                  aria-pressed={activo}
                  className="flex flex-col items-center gap-0.5 rounded-[7px] px-3 py-1.5"
                  style={{
                    background: activo ? 'var(--hf-brand-nav)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                    color: activo ? '#ffffff' : 'var(--hf-text-secondary-soft)',
                  }}
                >
                  <span className="font-mono text-10 font-bold">{p === 'todas' ? 'TODAS' : p}</span>
                  <span className="text-10">{n}</span>
                </button>
              );
            })}
            <span className="ml-auto flex flex-wrap items-center gap-3">
              {[
                { k: 'CUMPLE' as const, n: cumplimiento.cumple },
                { k: 'NO_CUMPLE' as const, n: cumplimiento.noCumple },
                { k: 'NO_APLICA' as const, n: cumplimiento.noAplica },
                { k: 'PENDIENTE' as const, n: cumplimiento.pendientes },
              ].map((l) => (
                <span key={l.k} className="flex items-center gap-1.5">
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: COLOR[l.k].punto }} />
                  <span className="font-mono text-9 text-muted">
                    {l.k === 'PENDIENTE' ? 'Sin responder' : ETIQUETA_RESPUESTA[l.k]} {l.n}
                  </span>
                </span>
              ))}
            </span>
          </nav>

          {contratado && (
            <p
              className="mt-3 rounded-tarjeta px-4 py-2.5 text-11 leading-relaxed [text-wrap:pretty]"
              style={{ background: '#efeafb', border: '1px solid #d9cff2', color: '#5b3fa0' }}
            >
              {/* G10 · se suman, ninguno se resta. */}
              Desarrollo contratado: los ítems marcados «contratado» <strong className="font-semibold">se
              suman</strong> a los del catálogo normal. Cambia quién ejecuta y que la evidencia se
              exige por contrato, no el nivel de exigencia.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-3.5 xl:flex-row">
            <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {items.map((i) => {
                  const c = COLOR[i.respuesta ?? 'PENDIENTE'];
                  return (
                    <div
                      key={i.id}
                      className="mb-1 flex items-start gap-3 rounded-campo px-3 py-2.5"
                      style={{ background: c.fondo, border: `1px solid ${c.borde}` }}
                    >
                      <span className="w-[22px] flex-none pt-0.5 text-right font-mono text-9_5 text-faint">
                        {i.orden}
                      </span>
                      <span
                        className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-9 font-bold text-white"
                        style={{ background: c.punto }}
                      >
                        {i.respuesta === 'CUMPLE' ? '✓' : i.respuesta === 'NO_CUMPLE' ? '✕' : ''}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-12 leading-relaxed" style={{ color: c.texto }}>
                          {i.texto}
                        </span>
                        {i.evidenciaEsperada !== null && (
                          <span className="font-mono text-8_5 text-muted">{i.evidenciaEsperada}</span>
                        )}
                        {/* La justificación del «no aplica» se muestra, y su ausencia también. */}
                        {i.respuesta === 'NO_APLICA' && (
                          <span
                            className="font-mono text-8_5"
                            style={{ color: i.nota === null || i.nota.trim() === '' ? '#a52016' : 'var(--hf-text-muted)' }}
                          >
                            {i.nota === null || i.nota.trim() === ''
                              ? 'sin justificar'
                              : `justificado: ${i.nota}`}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-none flex-col items-end gap-1">
                        <span className="font-mono text-9_5 font-semibold" style={{ color: c.texto }}>
                          {i.respuesta === null ? 'Sin responder' : ETIQUETA_RESPUESTA[i.respuesta]}
                        </span>
                        <span className="flex gap-1">
                          {i.controlAnexoA !== null && (
                            <span className="rounded-[3px] bg-subtle px-1.5 py-0.5 font-mono text-7_5 font-semibold text-muted">
                              {i.controlAnexoA}
                            </span>
                          )}
                          {i.aplicaA === 'CONTRATADO' && (
                            <span
                              className="rounded-[3px] px-1.5 py-0.5 font-mono text-7_5 font-semibold"
                              style={{ background: '#efeafb', color: '#5b3fa0' }}
                            >
                              contratado
                            </span>
                          )}
                        </span>
                      </span>
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <p className="px-3 py-10 text-center text-12 text-muted [text-wrap:pretty]">
                    Ningún ítem en esta puerta.
                  </p>
                )}
              </div>
            </section>

            <aside className="flex w-full flex-none flex-col gap-3 xl:w-[372px]">
              <section
                className="flex flex-col gap-2.5 rounded-tarjeta bg-surface px-4 py-3.5"
                style={{ border: '1px solid var(--hf-brand-200, #d3dceb)' }}
              >
                <span className="etiqueta-campo text-accent">Cumplimiento de la verificación</span>
                <span className="flex items-baseline gap-2.5">
                  <span
                    className="font-mono text-30 font-semibold leading-none tabular-nums"
                    style={{
                      color:
                        cumplimiento.porcentaje === null
                          ? 'var(--hf-text-muted)'
                          : cumplimiento.porcentaje >= 80
                            ? '#0b5c44'
                            : cumplimiento.porcentaje >= 50
                              ? '#b8791a'
                              : '#a52016',
                    }}
                  >
                    {cumplimiento.porcentaje === null ? '—' : `${cumplimiento.porcentaje} %`}
                  </span>
                  <span className="text-11_5 text-muted [text-wrap:pretty]">
                    {cumplimiento.porcentaje === null
                      ? 'nada que medir todavía'
                      : `${cumplimiento.cumple} de ${cumplimiento.cumple + cumplimiento.noCumple + cumplimiento.pendientes} evaluables`}
                  </span>
                </span>

                {/* La barra reparte por categoría; el «no aplica» se dibuja en gris y NO
                    entra al porcentaje. */}
                <span className="flex h-2 overflow-hidden rounded-full bg-subtle">
                  {[
                    { n: cumplimiento.cumple, color: '#0f7a5a' },
                    { n: cumplimiento.noCumple, color: '#a52016' },
                    { n: cumplimiento.pendientes, color: '#b8791a' },
                    { n: cumplimiento.noAplica, color: '#d7dcd9' },
                  ].map((b, k) => (
                    <span
                      key={k}
                      className="block h-full"
                      style={{ width: total === 0 ? 0 : `${(b.n / total) * 100}%`, background: b.color }}
                    />
                  ))}
                </span>

                <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                  El «no aplica» no cuenta como incumplimiento, pero exige justificación escrita:
                  es la casilla que más se usa para esquivar un control.
                </span>

                {cumplimiento.noAplicaSinJustificar > 0 && (
                  <span
                    className="rounded-campo px-3 py-2 text-10_5 leading-relaxed [text-wrap:pretty]"
                    style={{ background: '#fffbfa', border: '1px solid #f2cdc6', color: '#a52016' }}
                  >
                    {cumplimiento.noAplicaSinJustificar} «no aplica» sin justificación escrita. Sin
                    la nota no hay forma de distinguir uno legítimo de uno cómodo.
                  </span>
                )}
              </section>

              <PanelMapeo />
            </aside>
          </div>

          <p className="mt-3 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
            Esta pantalla es de lectura. Responder los ítems se hace donde se responde cualquier
            lista de verificación del motor de tareas —en la tarea, desde{' '}
            <Link href="/mi-sig" className="font-medium text-accent underline">
              Mi SIG
            </Link>
            —, y duplicar el editor acá sería el segundo motor que todo este módulo existe para no
            construir. Se leen {totalCatalogo} ítems del catálogo.
          </p>
        </>
      )}
    </main>
  );
}

function PanelMapeo() {
  return (
    <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
      <span className="etiqueta-campo text-accent">Por qué reusa el motor del módulo A</span>
      {MAPEO.map((m) => (
        <div
          key={m.concepto}
          className="flex flex-col gap-0.5 rounded-campo border border-border-field bg-subtle px-3 py-2"
        >
          <span className="text-11 text-secondary">{m.concepto}</span>
          <span className="font-mono text-9_5 font-semibold text-accent">{m.entidad}</span>
        </div>
      ))}
      <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
        Construir un segundo motor de listas de verificación sería el error más caro del paquete:
        duplicaría el calendario, los vencimientos, los avisos y el cierre, que ya están
        construidos y probados.
      </span>
      <span
        className="rounded-campo px-3 py-2 text-10_5 leading-relaxed [text-wrap:pretty]"
        style={{ background: '#fffaf3', border: '1px solid #f2b473', color: '#8a4407' }}
      >
        Lo único que hubo que agregar a <span className="font-mono text-10">ItemVerificacion</span>:
        puerta, control del Anexo A, evidencia esperada y a quién aplica.
      </span>
    </section>
  );
}
