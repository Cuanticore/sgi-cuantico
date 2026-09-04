'use client';

// app/tecnologia/sistemas/Sistemas.client.tsx
//
// La hoja de vida con sus pestañas. **Las seis puertas viven acá**, en el sistema — es el
// panel que la pantalla de Productos dejó declarado como pendiente.
//
// **Ninguna puerta bloquea nada** (D17, G3). Registrar P4 como no superada no impide
// registrar P5: la ficha lo señala y sigue. La única operación que sí se impide es cerrar
// la hoja de vida sin P6.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cerrarHojaDeVida, crearSistema, registrarPuerta } from '@/app/sig/acciones/desarrollo';
import {
  ETIQUETA_PUERTA,
  ETIQUETA_RESULTADO_PUERTA,
  PUERTAS,
  type EstadoPuertas,
  type Puerta,
  type ResultadoPuerta,
  type Severidad,
  type Veredicto,
} from '@/lib/sig/desarrollo';

const COLOR_PUERTA: Record<ResultadoPuerta, { fondo: string; texto: string }> = {
  SUPERADA: { fondo: '#e6efe9', texto: '#0b5c44' },
  SUPERADA_CON_EXCEPCION: { fondo: '#fff3e6', texto: '#8a4407' },
  NO_SUPERADA: { fondo: '#fdeeeb', texto: '#a52016' },
  PENDIENTE: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)' },
};

const COLOR_VEREDICTO: Record<Veredicto, { fondo: string; texto: string }> = {
  BLOQUEA: { fondo: '#fdeeeb', texto: '#a52016' },
  BLOQUEA_SALVO_EXCEPCION: { fondo: '#fff3e6', texto: '#8a4407' },
  NO_BLOQUEA: { fondo: '#e6efe9', texto: '#0b5c44' },
};

const ETIQUETA_VEREDICTO: Record<Veredicto, string> = {
  BLOQUEA: 'bloquea',
  BLOQUEA_SALVO_EXCEPCION: 'bloquea salvo excepción',
  NO_BLOQUEA: 'no bloquea',
};

export interface FichaSistema {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  fase: string;
  criticidad: number | null;
  contratado: boolean;
  trataDatosPersonales: boolean;
  rolTratamiento: string | null;
  rtoObjetivo: number | null;
  rpoObjetivo: number | null;
  propietario: string | null;
  responsableTecnico: string | null;
  producto: string | null;
  clienteRef: string | null;
  activo: string | null;
  cerrada: boolean;
  abiertaEn: string | null;
  cerradaEn: string | null;
  excepcionesAbiertas: string[];
  puertas: {
    puerta: Puerta;
    resultado: ResultadoPuerta;
    fecha: string | null;
    verificadoPor: string | null;
    autoriza: string | null;
    excepcion: string | null;
    observacion: string | null;
  }[];
  requisitos: { codigo: string; categoria: string; texto: string; estado: string; prioridad: string | null }[];
  pruebas: {
    codigo: string;
    tipo: string;
    fecha: string;
    ejecutor: string | null;
    criticos: number;
    altos: number;
    medios: number;
    bajos: number;
    veredicto: Veredicto;
  }[];
  componentes: {
    nombre: string;
    tipo: string | null;
    version: string | null;
    licencia: string | null;
    criticidad: string | null;
    vulnerabilidades: string | null;
    estado: string;
  }[];
  liberaciones: { version: string; fecha: string; tipo: string; planReversion: boolean; resultado: string | null }[];
  tratamientos: number;
  faltantes: string[];
  vetoCierre: string | null;
}

const PESTANAS = ['identidad', 'puertas', 'requisitos', 'pruebas', 'componentes', 'liberaciones'] as const;

export default function SistemasClient({
  lista,
  ficha,
  pestana,
  elegidoCodigo,
  severidadBloquea,
  personas,
  productos,
  activos,
}: {
  lista: {
    id: number;
    codigo: string;
    nombre: string;
    fase: string;
    criticidad: number | null;
    trataDatosPersonales: boolean;
    cerrada: boolean;
    puertas: EstadoPuertas;
  }[];
  ficha: FichaSistema | null;
  pestana: string;
  elegidoCodigo: string | null;
  severidadBloquea: Severidad;
  personas: { id: number; nombre: string }[];
  productos: { id: number; nombre: string }[];
  activos: { id: number; etiqueta: string }[];
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [creando, setCreando] = useState(false);

  const irA = (codigo: string, t: string) =>
    router.push(`/tecnologia/sistemas?s=${codigo}${t === 'identidad' ? '' : `&t=${t}`}`);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex max-w-[104ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Hoja de vida del sistema</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            FOR-TEC-04. Registro único y acumulativo desde la concepción hasta el retiro.{' '}
            <strong className="font-semibold text-secondary">
              Un sistema sin hoja de vida abierta no debe desplegarse en productivo.
            </strong>
          </p>
        </div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="ml-auto flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {creando ? 'Cerrar' : 'Nuevo sistema'}
        </button>
      </div>

      {aviso && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12 leading-relaxed [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      {creando && (
        <FormularioSistema personas={personas} productos={productos} activos={activos} setAviso={setAviso} />
      )}

      {lista.length === 0 ? (
        <p className="mt-6 max-w-[86ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
          Ningún sistema con hoja de vida abierta. Cada desplegable con ciclo propio es un
          sistema; el producto los agrupa pero no tiene ciclo de vida propio.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3.5 xl:flex-row">
          <div className="flex w-full flex-none flex-col gap-2 xl:w-[288px]">
            {lista.map((x) => {
              const activa = x.codigo === elegidoCodigo;
              const total = x.puertas.superadas + x.puertas.conExcepcion;
              return (
                <button
                  key={x.codigo}
                  onClick={() => irA(x.codigo, pestana)}
                  aria-pressed={activa}
                  className="flex flex-col gap-1.5 rounded-tarjeta px-3 py-2.5 text-left"
                  style={{
                    background: activa ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${activa ? 'var(--hf-brand-200, #d3dceb)' : 'var(--hf-border-field)'}`,
                    opacity: x.cerrada ? 0.6 : 1,
                  }}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="font-mono text-9_5 font-semibold text-accent">{x.codigo}</span>
                    {x.trataDatosPersonales && (
                      <span
                        className="rounded-[3px] px-1.5 py-0.5 font-mono text-7_5 font-semibold uppercase"
                        style={{ background: '#efeafb', color: '#5b3fa0' }}
                        title="Trata datos personales (Ley 1581)"
                      >
                        PII
                      </span>
                    )}
                    <span className="ml-auto rounded-[3px] bg-subtle px-1.5 py-0.5 font-mono text-7_5 font-semibold uppercase text-muted">
                      {x.cerrada ? 'cerrada' : x.fase}
                    </span>
                  </span>
                  <span className="w-full text-12 leading-snug text-primary">{x.nombre}</span>
                  <span className="flex w-full items-center gap-2">
                    <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-subtle">
                      <span
                        className="block h-full"
                        style={{
                          width: `${(total / PUERTAS.length) * 100}%`,
                          background: x.puertas.noSuperadas > 0 ? '#a52016' : '#0b5c44',
                        }}
                      />
                    </span>
                    <span className="flex-none font-mono text-8_5 font-semibold text-muted">
                      {x.puertas.resumen}
                    </span>
                  </span>
                </button>
              );
            })}
            <p className="rounded-tarjeta border border-border-field bg-surface px-3 py-2.5 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
              El código <span className="font-mono">SIS-000</span> es inmutable y sobrevive al
              renombre. Es lo que sostiene la trazabilidad cuando el sistema cambia de nombre
              comercial.
            </p>
          </div>

          {ficha !== null && (
            <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
              <div className="flex flex-col gap-3 px-5 pt-4">
                <div className="flex flex-wrap items-start gap-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-11 font-semibold text-accent">{ficha.codigo}</span>
                      {ficha.criticidad !== null && (
                        <Etiqueta texto={`criticidad ${ficha.criticidad}`} fondo="var(--hf-bg-subtle)" color="var(--hf-text-muted)" />
                      )}
                      {ficha.trataDatosPersonales && (
                        <Etiqueta texto="Datos personales" fondo="#efeafb" color="#5b3fa0" />
                      )}
                      {ficha.contratado && (
                        <Etiqueta texto="Contratado" fondo="var(--hf-brand-100)" color="var(--hf-brand-nav)" />
                      )}
                    </span>
                    <span className="text-16 font-semibold leading-snug text-primary">{ficha.nombre}</span>
                  </div>
                  <span className="ml-auto flex gap-2">
                    {[
                      { etiqueta: 'RTO objetivo', valor: ficha.rtoObjetivo },
                      { etiqueta: 'RPO objetivo', valor: ficha.rpoObjetivo },
                    ].map((o) => (
                      <span
                        key={o.etiqueta}
                        className="flex flex-col gap-0.5 rounded-campo border border-border-field bg-subtle px-3 py-2"
                      >
                        <span className="etiqueta-campo">{o.etiqueta}</span>
                        <span className="font-mono text-13 font-semibold text-accent">
                          {o.valor === null ? '—' : `${o.valor} min`}
                        </span>
                      </span>
                    ))}
                  </span>
                </div>

                <div className="flex flex-wrap items-end gap-0.5 border-b border-border-field">
                  {PESTANAS.map((p) => {
                    const activa = pestana === p;
                    const n =
                      p === 'puertas'
                        ? ficha.puertas.filter((x) => x.resultado !== 'PENDIENTE').length
                        : p === 'requisitos'
                          ? ficha.requisitos.length
                          : p === 'pruebas'
                            ? ficha.pruebas.length
                            : p === 'componentes'
                              ? ficha.componentes.length
                              : p === 'liberaciones'
                                ? ficha.liberaciones.length
                                : null;
                    return (
                      <button
                        key={p}
                        onClick={() => irA(ficha.codigo, p)}
                        aria-pressed={activa}
                        className="flex items-center gap-1.5 rounded-t-[6px] px-3 py-2 text-12"
                        style={{
                          background: activa ? 'var(--hf-brand-100)' : 'transparent',
                          color: activa ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                          fontWeight: activa ? 600 : 500,
                          borderBottom: activa ? '2px solid var(--hf-brand-nav)' : '2px solid transparent',
                        }}
                      >
                        <span className="capitalize">{p}</span>
                        {n !== null && (
                          <span className="rounded-[3px] bg-subtle px-1.5 font-mono text-8 text-muted">{n}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {ficha.faltantes.length > 0 && (
                  <p
                    className="mb-4 rounded-tarjeta px-3.5 py-3 text-11 leading-relaxed [text-wrap:pretty]"
                    style={{ background: '#fff3e6', border: '1px solid #f2b473', color: '#8a4407' }}
                  >
                    {/* Señala; no impide guardar. El primero de la lista es el que más pesa. */}
                    <strong className="font-semibold">La hoja de vida está incompleta:</strong>{' '}
                    {ficha.faltantes.join(' · ')}.
                  </p>
                )}

                {pestana === 'identidad' && <Identidad f={ficha} setAviso={setAviso} />}
                {pestana === 'puertas' && (
                  <Puertas f={ficha} personas={personas} setAviso={setAviso} />
                )}
                {pestana === 'requisitos' && <ListaSimple filas={ficha.requisitos.map((r) => ({
                  clave: r.codigo,
                  titulo: r.texto,
                  meta: `${r.categoria}${r.prioridad === null ? '' : ` · ${r.prioridad}`}`,
                  estado: r.estado,
                }))} vacio="Sin requisitos de seguridad cargados." />}
                {pestana === 'pruebas' && <Pruebas f={ficha} severidad={severidadBloquea} />}
                {pestana === 'componentes' && <ListaSimple filas={ficha.componentes.map((c) => ({
                  clave: c.nombre,
                  titulo: `${c.nombre}${c.version === null ? '' : ` ${c.version}`}`,
                  meta: [c.tipo, c.licencia === null ? 'sin licencia declarada' : `licencia ${c.licencia}`, c.vulnerabilidades]
                    .filter((x) => x !== null && x !== '')
                    .join(' · '),
                  estado: c.estado,
                }))} vacio="Sin componentes de terceros declarados. El SBOM es lo que permite responder qué se rompe cuando sale una vulnerabilidad conocida." />}
                {pestana === 'liberaciones' && <ListaSimple filas={ficha.liberaciones.map((l) => ({
                  clave: l.version,
                  titulo: `${l.version} · ${l.tipo}`,
                  meta: `${l.fecha}${l.planReversion ? ' · con plan de reversión' : ' · SIN plan de reversión'}`,
                  estado: l.resultado ?? '—',
                }))} vacio="Sin liberaciones registradas. «Liberación» es qué se liberó; dónde corre lo registran los ambientes." />}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function Identidad({ f, setAviso }: { f: FichaSistema; setAviso: (a: { ok: boolean; texto: string }) => void }) {
  const [cerrando, setCerrando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { etiqueta: 'Tipo', valor: f.tipo },
          { etiqueta: 'Fase actual', valor: f.cerrada ? 'cerrada' : f.fase },
          { etiqueta: 'Producto', valor: f.producto ?? 'sin producto' },
          { etiqueta: 'Cliente o proceso', valor: f.clienteRef ?? '—' },
          { etiqueta: 'Propietario', valor: f.propietario ?? 'sin registrar' },
          { etiqueta: 'Responsable técnico', valor: f.responsableTecnico ?? 'sin registrar' },
          { etiqueta: 'Activo del inventario', valor: f.activo ?? 'no enlazado (ítem 50)', alerta: f.activo === null },
          {
            etiqueta: 'Datos personales',
            valor: f.trataDatosPersonales
              ? `sí · ${f.rolTratamiento ?? 'rol sin definir'} · ${f.tratamientos} registro(s)`
              : 'no',
            alerta: f.trataDatosPersonales && f.tratamientos === 0,
          },
          { etiqueta: 'Hoja abierta', valor: f.abiertaEn ?? '—' },
        ].map((d) => (
          <span key={d.etiqueta} className="flex flex-col gap-0.5">
            <span className="etiqueta-campo">{d.etiqueta}</span>
            <span
              className="text-12"
              style={d.alerta === true ? { color: '#a52016', fontWeight: 600 } : { color: 'var(--hf-text-primary)' }}
            >
              {d.valor}
            </span>
          </span>
        ))}
      </div>

      {f.descripcion !== null && (
        <p className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">{f.descripcion}</p>
      )}

      <p className="rounded-tarjeta border border-border-field bg-subtle px-3.5 py-3 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
        Los objetivos de recuperación no son decorativos: son el insumo del{' '}
        <strong className="font-semibold text-secondary">análisis de impacto al negocio</strong> que el
        sistema de continuidad exige cada año, y hoy no existen en ninguna otra parte.
      </p>

      {f.excepcionesAbiertas.length > 0 && (
        <p
          className="rounded-tarjeta px-3.5 py-3 text-11 leading-relaxed [text-wrap:pretty]"
          style={{ background: '#fff3e6', border: '1px solid #f2b473', color: '#8a4407' }}
        >
          {f.excepcionesAbiertas.length} excepción(es) abiertas:{' '}
          {f.excepcionesAbiertas.join(', ')}.{' '}
          <Link href="/tecnologia/excepciones" className="font-semibold underline">
            Ver en Excepciones
          </Link>
        </p>
      )}

      {!f.cerrada && (
        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          {f.vetoCierre !== null ? (
            // G11 · la única operación que este módulo sí impide, y se dice por qué en vez
            // de esconder el botón.
            <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
              <strong className="font-semibold">No se puede cerrar la hoja de vida todavía:</strong>{' '}
              {f.vetoCierre}.
            </p>
          ) : cerrando ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="etiqueta-campo">Por qué se cierra</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="entrada-campo" />
              </label>
              <div className="flex gap-2">
                <button
                  disabled={enviando || motivo.trim().length < 10}
                  onClick={async () => {
                    setEnviando(true);
                    const r = await cerrarHojaDeVida(f.id, motivo);
                    setEnviando(false);
                    setAviso({ ok: r.ok, texto: r.mensaje });
                    if (r.ok) setTimeout(() => window.location.reload(), 1200);
                  }}
                  className="rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--hf-brand-nav)' }}
                >
                  {enviando ? 'Cerrando…' : 'Cerrar la hoja de vida'}
                </button>
                <button onClick={() => setCerrando(false)} className="px-2 py-2 text-12 text-muted">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setCerrando(true)}
              className="self-start rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12 text-secondary"
            >
              Cerrar la hoja de vida
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Puertas({
  f,
  personas,
  setAviso,
}: {
  f: FichaSistema;
  personas: { id: number; nombre: string }[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [editando, setEditando] = useState<Puerta | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {PUERTAS.map((p) => {
        const fila = f.puertas.find((x) => x.puerta === p);
        const r = fila?.resultado ?? 'PENDIENTE';
        const c = COLOR_PUERTA[r];
        return (
          <div key={p} className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="w-[34px] flex-none rounded-[5px] py-1 text-center font-mono text-9_5 font-bold"
                style={{ background: c.fondo, color: c.texto }}
              >
                {p}
              </span>
              <span className="text-12_5 font-semibold text-primary">{ETIQUETA_PUERTA[p].split('· ')[1]}</span>
              <span
                className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 font-semibold uppercase"
                style={{ background: c.fondo, color: c.texto }}
              >
                {ETIQUETA_RESULTADO_PUERTA[r]}
              </span>
              {fila?.excepcion != null && (
                <Link href="/tecnologia/excepciones" className="font-mono text-9_5 font-medium text-accent hover:underline">
                  {fila.excepcion}
                </Link>
              )}
              <span className="ml-auto flex items-center gap-2.5">
                {fila?.fecha != null && <span className="font-mono text-9_5 text-faint">{fila.fecha}</span>}
                {!f.cerrada && (
                  <button
                    onClick={() => setEditando(editando === p ? null : p)}
                    className="rounded-campo border border-border-field bg-surface px-2.5 py-1 text-11 text-secondary"
                  >
                    Registrar
                  </button>
                )}
              </span>
            </div>
            {fila?.verificadoPor != null && (
              <span className="text-10_5 text-muted">
                Verificó {fila.verificadoPor} · autorizó {fila.autoriza ?? 'sin registrar'}
                {fila.observacion !== null && ` — ${fila.observacion}`}
              </span>
            )}
            {editando === p && (
              <FormularioPuerta
                sistemaId={f.id}
                puerta={p}
                personas={personas}
                setAviso={setAviso}
                onCerrar={() => setEditando(null)}
              />
            )}
          </div>
        );
      })}
      <p
        className="rounded-tarjeta px-3.5 py-3 text-10_5 leading-relaxed [text-wrap:pretty]"
        style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-200, #d3dceb)', color: 'var(--hf-brand-nav)' }}
      >
        <strong className="font-semibold">Las puertas no bloquean el avance.</strong> Registrar P4
        como no superada no impide registrar P5: la aplicación lo señala y sigue. Quien decide es
        PRO-TEC-04, no el software — una herramienta que bloquea sin conocer el contexto termina
        obligando a mentirle. F3 y F6 no tienen puerta: llevan controles continuos que se
        verifican con los 73 ítems, no en un punto de corte.
      </p>
    </div>
  );
}

function FormularioPuerta({
  sistemaId,
  puerta,
  personas,
  setAviso,
  onCerrar,
}: {
  sistemaId: number;
  puerta: Puerta;
  personas: { id: number; nombre: string }[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
  onCerrar: () => void;
}) {
  const [resultado, setResultado] = useState<ResultadoPuerta>('SUPERADA');
  const [verifica, setVerifica] = useState('');
  const [autoriza, setAutoriza] = useState('');
  const [observacion, setObservacion] = useState('');
  const [enviando, setEnviando] = useState(false);

  // G5 en pantalla: se avisa antes de enviar, y el servidor lo impone igual.
  const mismaPersona = verifica !== '' && verifica === autoriza;

  return (
    <div className="flex flex-col gap-2.5 border-t border-hairline pt-2.5">
      <div className="flex flex-wrap gap-1.5">
        {(['SUPERADA', 'SUPERADA_CON_EXCEPCION', 'NO_SUPERADA'] as const).map((r) => {
          const activo = resultado === r;
          const c = COLOR_PUERTA[r];
          return (
            <button
              key={r}
              onClick={() => setResultado(r)}
              aria-pressed={activo}
              className="rounded-chip px-3 py-1.5 text-11_5"
              style={{
                background: activo ? c.fondo : 'var(--hf-bg-surface)',
                border: `1px solid ${activo ? c.texto : 'var(--hf-border-field)'}`,
                color: activo ? c.texto : 'var(--hf-text-secondary-soft)',
                fontWeight: activo ? 600 : 500,
              }}
            >
              {ETIQUETA_RESULTADO_PUERTA[r]}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Quién verifica</span>
          <select value={verifica} onChange={(e) => setVerifica(e.target.value)} className="entrada-campo">
            <option value="">Elegir</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Quién autoriza</span>
          <select value={autoriza} onChange={(e) => setAutoriza(e.target.value)} className="entrada-campo">
            <option value="">Elegir</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      {mismaPersona && (
        <span className="text-10_5 leading-relaxed" style={{ color: '#a52016' }}>
          Quien verifica no puede ser quien autoriza: el procedimiento asigna esas dos autoridades
          a roles distintos.
        </span>
      )}
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Observación · opcional</span>
        <input value={observacion} onChange={(e) => setObservacion(e.target.value)} className="entrada-campo" />
      </label>
      {resultado === 'SUPERADA_CON_EXCEPCION' && (
        <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
          «Superada con excepción» necesita la excepción registrada antes, en{' '}
          <Link href="/tecnologia/excepciones" className="font-medium text-accent underline">
            Excepciones
          </Link>
          . Sin ella es sólo «no superada» con mejor nombre.
        </span>
      )}
      <div className="flex gap-2">
        <button
          disabled={enviando || verifica === '' || autoriza === '' || mismaPersona}
          onClick={async () => {
            setEnviando(true);
            const r = await registrarPuerta(sistemaId, puerta, {
              resultado,
              verificadoPorId: Number(verifica),
              autorizaId: Number(autoriza),
              observacion: observacion || undefined,
            });
            setEnviando(false);
            setAviso({ ok: r.ok, texto: r.mensaje });
            if (r.ok) setTimeout(() => window.location.reload(), 1200);
          }}
          className="rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {enviando ? 'Guardando…' : 'Registrar'}
        </button>
        <button onClick={onCerrar} className="px-2 py-2 text-12 text-muted">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Pruebas({ f, severidad }: { f: FichaSistema; severidad: Severidad }) {
  if (f.pruebas.length === 0) {
    return (
      <p className="text-12 text-muted [text-wrap:pretty]">
        Sin pruebas de seguridad registradas.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {f.pruebas.map((p) => {
        const c = COLOR_VEREDICTO[p.veredicto];
        return (
          <div key={p.codigo} className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-border-field bg-surface px-3.5 py-3">
            <span className="font-mono text-10 font-semibold text-accent">{p.codigo}</span>
            <span className="text-12 text-primary">{p.tipo}</span>
            <span className="font-mono text-9_5 text-muted">{p.fecha}</span>
            <span className="font-mono text-9_5 text-faint">{p.ejecutor ?? 'sin ejecutor'}</span>
            <span className="ml-auto flex items-center gap-2">
              {/* Los cuatro conteos se capturan; el veredicto se calcula. */}
              <span className="font-mono text-10_5 tabular-nums text-secondary">
                {p.criticos}c · {p.altos}a · {p.medios}m · {p.bajos}b
              </span>
              <span
                className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 font-semibold uppercase"
                style={{ background: c.fondo, color: c.texto }}
              >
                {ETIQUETA_VEREDICTO[p.veredicto]}
              </span>
            </span>
          </div>
        );
      })}
      <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
        Los cuatro conteos se capturan; <strong className="font-semibold">si bloquea o no se calcula</strong>{' '}
        contra el umbral vigente —hoy «{severidad.toLowerCase()} o peor»— y la excepción abierta si
        la hay. El umbral es un parámetro: endurecerlo cambia estos veredictos sin desplegar.
      </p>
    </div>
  );
}

function ListaSimple({
  filas,
  vacio,
}: {
  filas: { clave: string; titulo: string; meta: string; estado: string }[];
  vacio: string;
}) {
  if (filas.length === 0) {
    return <p className="text-12 leading-relaxed text-muted [text-wrap:pretty]">{vacio}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {filas.map((r) => (
        <div key={r.clave} className="flex flex-wrap items-center gap-3 rounded-campo border border-border-field bg-surface px-3.5 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-12 text-primary">{r.titulo}</span>
            <span className="block font-mono text-9_5 text-muted">{r.meta}</span>
          </span>
          <span className="flex-none rounded-[4px] bg-subtle px-2 py-0.5 font-mono text-8_5 uppercase text-muted">
            {r.estado}
          </span>
        </div>
      ))}
    </div>
  );
}

function FormularioSistema({
  personas,
  productos,
  activos,
  setAviso,
}: {
  personas: { id: number; nombre: string }[];
  productos: { id: number; nombre: string }[];
  activos: { id: number; etiqueta: string }[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('Aplicación web');
  const [productoId, setProductoId] = useState('');
  const [propietarioId, setPropietarioId] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [activoId, setActivoId] = useState('');
  const [contratado, setContratado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
      <Rotulo texto="Nuevo sistema" />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="entrada-campo" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="entrada-campo">
            {['Aplicación web', 'API', 'Integración', 'Componente'].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Producto · opcional</span>
          <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className="entrada-campo">
            <option value="">Sin producto</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Propietario</span>
          <select value={propietarioId} onChange={(e) => setPropietarioId(e.target.value)} className="entrada-campo">
            <option value="">Elegir</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Responsable técnico</span>
          <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="entrada-campo">
            <option value="">Elegir</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Activo del inventario · ítem 50</span>
          <select value={activoId} onChange={(e) => setActivoId(e.target.value)} className="entrada-campo">
            <option value="">Sin enlazar</option>
            {activos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-12_5 text-secondary">
        <input type="checkbox" checked={contratado} onChange={(e) => setContratado(e.target.checked)} />
        Desarrollo contratado · los ítems marcados CONTRATADO se suman, ninguno se resta
      </label>
      <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
        Nace con sus seis puertas pendientes. Una puerta que no existe y una pendiente se ven
        igual, y no lo son: crearlas de entrada es lo que permite decir «faltan cuatro».
      </span>
      <button
        disabled={enviando || nombre.trim() === ''}
        onClick={async () => {
          setEnviando(true);
          const r = await crearSistema({
            nombre,
            tipo,
            productoId: productoId === '' ? undefined : Number(productoId),
            propietarioId: propietarioId === '' ? undefined : Number(propietarioId),
            responsableTecnicoId: tecnicoId === '' ? undefined : Number(tecnicoId),
            activoId: activoId === '' ? undefined : Number(activoId),
            contratado,
          });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1300);
        }}
        className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Creando…' : 'Abrir la hoja de vida'}
      </button>
    </section>
  );
}

function Etiqueta({ texto, fondo, color }: { texto: string; fondo: string; color: string }) {
  return (
    <span
      className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-8 font-semibold uppercase tracking-[0.06em]"
      style={{ background: fondo, color }}
    >
      {texto}
    </span>
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
