'use client';

// app/tecnologia/productos/Productos.client.tsx
//
// **La plantilla no bloquea: señala.** Un producto incompleto se puede guardar; lo que no
// se puede es que nadie lo sepa. Ése es el aporte entero de esta pantalla hoy.
//
// El lienzo dibuja además las seis puertas de control de PRO-TEC-04. Ese panel se dibuja
// vacío y con su motivo: las puertas son del SISTEMA, y `Sistema` es una entidad de
// REQ-SIG-08 que todavía no existe. Definirla acá crearía el segundo lugar donde se
// especifica lo mismo.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearProducto } from '@/app/sig/acciones/niveles';
import { ETIQUETA_CLASE, type ClaseNivel, type Faltante } from '@/lib/sig/niveles';

export interface ProductoFila {
  id: number;
  nombre: string;
  descripcion: string | null;
  clase: ClaseNivel | null;
  responsable: string;
  clienteRef: string | null;
  nivelId: number;
}

export default function ProductosClient({
  productos,
  elegidoId,
  cuantosActivos,
  esperados,
  presentes,
  faltantes,
  resumen,
  raicesDisponibles,
  personas,
}: {
  productos: ProductoFila[];
  elegidoId: number | null;
  cuantosActivos: number;
  esperados: { nombreNivel3: string; activoEsperado: string; obligatorio: boolean }[];
  presentes: Record<string, string[]>;
  faltantes: Faltante[];
  resumen: string;
  raicesDisponibles: { id: number; nombre: string; clase: ClaseNivel | null }[];
  personas: { id: number; nombre: string }[];
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [creando, setCreando] = useState(false);

  const elegido = productos.find((x) => x.id === elegidoId) ?? null;
  const nivel3 = [...new Set(esperados.map((e) => e.nombreNivel3))];
  const completo = faltantes.filter((f) => f.obligatorio).length === 0;

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col gap-1.5">
          {elegido === null ? (
            <h1 className="titulo-pagina">Productos y proyectos</h1>
          ) : (
            <>
              <span className="flex flex-wrap items-center gap-2.5">
                <h1 className="titulo-pagina">{elegido.nombre}</h1>
                {elegido.clase !== null && (
                  <Etiqueta
                    texto={elegido.clase === 'PRODUCTOS' ? 'Producto' : 'Proyecto'}
                    fondo="var(--hf-brand-100)"
                    color="var(--hf-brand-nav)"
                  />
                )}
                <Etiqueta
                  texto={`${cuantosActivos} activos`}
                  fondo="var(--hf-bg-subtle)"
                  color="var(--hf-text-muted)"
                />
              </span>
              <span className="flex flex-wrap items-center gap-2.5 text-12_5 text-muted">
                <span>
                  Responsable {elegido.responsable}
                  {elegido.clienteRef !== null && ` · cliente ${elegido.clienteRef}`}
                </span>
                <span className="text-faint">·</span>
                <Link href="/tecnologia/mapa" className="font-semibold text-accent hover:underline">
                  Ver los {cuantosActivos} activos en el mapa →
                </Link>
              </span>
            </>
          )}
        </div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="ml-auto flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {creando ? 'Cerrar' : 'Nuevo producto'}
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
        <FormularioProducto
          raices={raicesDisponibles}
          personas={personas}
          setAviso={setAviso}
        />
      )}

      {productos.length === 0 ? (
        <p className="mt-6 max-w-[80ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
          Ningún producto o proyecto todavía. Un producto encabeza un nivel de grado 1 de clase
          PRODUCTOS o PROYECTOS, así que el primer paso es{' '}
          <Link href="/tecnologia/niveles" className="font-medium text-accent underline">
            crear su rama en Niveles
          </Link>
          .
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4 xl:flex-row">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
            <div className="border-b border-hairline px-4 py-3.5">
              <Rotulo texto="Hoja de vida del sistema · FOR-TEC-04" derecha="PRO-TEC-04" />
            </div>
            <div className="flex flex-col gap-3 px-4 py-4">
              {/* El hueco declarado. Se dibuja con su motivo en vez de omitirse: un panel
                  que falta y no se ve es indistinguible de uno que se decidió no construir. */}
              <p
                className="rounded-tarjeta border border-dashed px-4 py-4 text-11_5 leading-relaxed [text-wrap:pretty]"
                style={{ borderColor: 'var(--hf-border-field)', color: 'var(--hf-text-muted)' }}
              >
                <strong className="font-semibold">Las seis puertas viven en el sistema, no en el producto.</strong>{' '}
                La hoja de vida —fases, puertas, requisitos, pruebas y los 73 ítems de
                PTR-TEC-03— pertenece a cada sistema desplegable y se especifica en REQ-SIG-08.
                Esa entidad todavía no existe, y definirla acá crearía el segundo lugar donde
                se especifica lo mismo.
              </p>
              <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                F3 Construcción y F6 Operación no tienen puerta: llevan controles continuos
                —revisión de código, análisis en cada integración, gestión de vulnerabilidades—
                que se verifican con los 73 ítems, no en un punto de corte.
              </p>
              <p
                className="rounded-tarjeta px-4 py-3 text-10_5 leading-relaxed [text-wrap:pretty]"
                style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-200, #d3dceb)', color: 'var(--hf-brand-nav)' }}
              >
                {/* D17, y es una decisión, no una omisión. */}
                <strong className="font-semibold">La aplicación no bloquea el avance.</strong> Cuando
                las puertas existan, registrará el resultado de cada una y señalará lo que el
                procedimiento no permite, pero no impedirá guardar ni pasar de fase. Quien decide
                es PRO-TEC-04, no el software: una herramienta que bloquea sin conocer el
                contexto termina obligando a mentirle.
              </p>
            </div>
          </section>

          <aside className="flex w-full flex-none flex-col gap-3.5 xl:w-[372px]">
            <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
              {/* Esta lista son los PRODUCTOS, no los sistemas de uno. El lienzo tiene un
                  panel «Sistemas del producto» que es otra cosa —los desplegables que
                  componen el producto elegido— y que no se puede construir hasta que
                  REQ-SIG-08 defina `Sistema`. Rotular esta lista con aquel nombre haría que
                  la pantalla mintiera para que un conteo de cobertura subiera. */}
              <Rotulo texto="Productos y proyectos" derecha={String(productos.length)} />
              {productos.map((x) => {
                const activo = x.id === elegidoId;
                return (
                  <button
                    key={x.id}
                    onClick={() => router.push(`/tecnologia/productos?p=${x.id}`)}
                    aria-pressed={activo}
                    className="flex flex-col gap-1 rounded-campo px-3 py-2 text-left"
                    style={{
                      background: activo ? 'var(--hf-brand-100)' : 'transparent',
                      border: `1px solid ${activo ? 'var(--hf-brand-200, #d3dceb)' : 'var(--hf-border-field)'}`,
                    }}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="text-12_5 font-medium text-primary">{x.nombre}</span>
                      {x.clase !== null && (
                        <span className="ml-auto font-mono text-8_5 uppercase text-muted">
                          {ETIQUETA_CLASE[x.clase]}
                        </span>
                      )}
                    </span>
                    <span className="text-10_5 text-muted">{x.responsable}</span>
                  </button>
                );
              })}
            </section>

            <section
              className="flex flex-col gap-2.5 rounded-tarjeta bg-surface px-4 py-3.5"
              style={{
                border: `1px solid ${completo ? 'var(--hf-border-field)' : '#f2b473'}`,
              }}
            >
              <Rotulo
                texto="Configuración mínima del producto"
                derecha={completo ? 'completa' : `${faltantes.length} faltante(s)`}
                color={completo ? undefined : '#8a4407'}
              />
              {nivel3.length === 0 ? (
                <p className="text-11_5 text-muted [text-wrap:pretty]">
                  No hay plantilla definida para esta clase.
                </p>
              ) : (
                nivel3.map((n3) => {
                  const suyos = faltantes.filter((f) => f.nombreNivel3 === n3);
                  const cuantos = (presentes[n3] ?? []).length;
                  const ok = suyos.length === 0;
                  return (
                    <div key={n3} className="flex flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span
                          className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] text-10 font-bold"
                          style={
                            ok
                              ? { background: '#e6efe9', color: '#0b5c44' }
                              : { background: '#fff3e6', color: '#8a4407' }
                          }
                        >
                          {ok ? '✓' : '!'}
                        </span>
                        <span className="flex-1 text-12_5 font-medium text-primary">{n3}</span>
                        <span
                          className="font-mono text-9_5"
                          style={{ color: ok ? '#0b5c44' : '#8a4407' }}
                        >
                          {cuantos} activo(s)
                        </span>
                      </span>
                      {suyos.length > 0 && (
                        <span className="pl-[26px] text-10_5 leading-relaxed" style={{ color: '#8a4407' }}>
                          Falta: {suyos.map((f) => f.activoEsperado + (f.obligatorio ? '' : ' (opcional)')).join(', ')}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
              <p className="mt-1 text-11 leading-relaxed text-secondary [text-wrap:pretty]">{resumen}</p>
              <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                La plantilla no bloquea: señala. Un producto incompleto se puede guardar; lo que
                no se puede es que nadie lo sepa.
              </p>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

function FormularioProducto({
  raices,
  personas,
  setAviso,
}: {
  raices: { id: number; nombre: string; clase: ClaseNivel | null }[];
  personas: { id: number; nombre: string }[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [nivelId, setNivelId] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [clienteRef, setClienteRef] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (raices.length === 0) {
    return (
      <p
        className="mt-4 rounded-tarjeta px-4 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
        style={{ background: 'var(--hf-bg-subtle)', border: '1px solid var(--hf-border-field)', color: 'var(--hf-text-muted)' }}
      >
        No hay ninguna raíz libre. Un producto encabeza un nivel de grado 1 de clase PRODUCTOS o
        PROYECTOS, y los que existen ya están tomados. Los tres valores de grado 1 son cerrados,
        así que el agrupador va bajo uno de ellos.
      </p>
    );
  }

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
      <Rotulo texto="Nuevo producto o proyecto" />
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Nivel raíz</span>
          <select value={nivelId} onChange={(e) => setNivelId(e.target.value)} className="entrada-campo">
            <option value="">Elegir</option>
            {raices.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="entrada-campo" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Responsable</span>
          <select
            value={responsableId}
            onChange={(e) => setResponsableId(e.target.value)}
            className="entrada-campo"
          >
            <option value="">Elegir</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Cliente · opcional</span>
          <input value={clienteRef} onChange={(e) => setClienteRef(e.target.value)} className="entrada-campo" />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Descripción · opcional</span>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="entrada-campo" />
      </label>
      <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
        No se pide fase ni versión: no son del producto, son del sistema, y viven en REQ-SIG-08.
        Un producto agrupa; preguntarle en qué fase está no tiene respuesta.
      </span>
      <button
        disabled={enviando || nivelId === '' || nombre.trim() === '' || responsableId === ''}
        onClick={async () => {
          setEnviando(true);
          const r = await crearProducto({
            nivelId: Number(nivelId),
            nombre,
            descripcion: descripcion || undefined,
            responsableId: Number(responsableId),
            clienteRef: clienteRef || undefined,
          });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1200);
        }}
        className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Creando…' : 'Crear'}
      </button>
    </section>
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
      {derecha !== undefined && (
        <span className="flex-none font-mono text-9" style={{ color: color ?? 'var(--hf-text-faint)' }}>
          {derecha}
        </span>
      )}
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
