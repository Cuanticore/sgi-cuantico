'use client';

// app/components/sgsi/valoracion-riesgos/PantallaAnalisisRiesgos.tsx
//
// REQ-SIG-20 §5 (P4, D7) — «Análisis de riesgos»: los activos que alcanzan el umbral de
// valoración (los 37, no los 299), ordenados por peor residual, con cinco tarjetas y seis
// filtros que reescopan la lista y las tarjetas A LA VEZ.
//
// LAS TARJETAS Y LA LISTA NUNCA SE CONTRADICEN. Las dos salen de `lib/sgsi/analisis-riesgos.ts`
// con los MISMOS filtros (`filasAnalisis`/`tarjetasAnalisis`); esta pantalla no vuelve a filtrar
// nada por su cuenta. Es la misma garantía que REQ-SIG-18 §7.4 exigió para el inventario.
//
// LOS FILTROS VIVEN EN LA URL, igual que el inventario (REQ-SIG-18 §7.1): se hidratan del
// primer render y se reflejan con `router.replace` sin apilar historial, para que una vista
// filtrada sea enlazable — es lo que permite que la Fase 4 (`FranjaSinPlan`, tarea 4.17)
// enlace acá ya filtrado por «sin plan» sin que esta pantalla tenga que cambiar.
//
// EL CLIC EN UNA FILA abre el overlay del activo en Amenazas (`?activo=<código>&tab=amenazas`)
// reusando el contrato de la tarea 3.2 — no una ficha nueva, no una segunda derivación.
//
// LA COLUMNA «PLAN» Y LA TARJETA SIN PLAN degradan con elegancia mientras la Fase 4
// (`lib/sgsi/deuda-planes.ts`) no exista: `tarjetas.sinPlan` es `null`, no `0`, y las filas en
// banda Crítico muestran «Fase 4» en vez de inventar un «pendiente» o un «✓» que nadie calculó.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FILTROS_ANALISIS_VACIOS,
  SIN_ASIGNAR,
  TODAS_PERSONAS_ANALISIS,
  TODOS_PROCESOS,
  TODOS_PROPIETARIOS_ANALISIS,
  consultaDeFiltrosAnalisis,
  filasAnalisis,
  filtrosAnalisisDesdeUrl,
  parametrosDeFiltrosAnalisis,
  tarjetasAnalisis,
  type ActivoAnalizable,
  type CatalogosFiltroAnalisis,
  type EstadoPlanActivo,
  type FiltrosAnalisis,
} from '@/lib/sgsi/analisis-riesgos';
import type { UmbralRiesgo } from '@/lib/sgsi/riesgo-activo';
import { colorDeNivelValor } from '@/lib/sgsi/valoracion-figura';

export interface PantallaAnalisisRiesgosProps {
  activos: ActivoAnalizable[];
  bandas: UmbralRiesgo[];
  umbral: number;
  procesos: string[];
  propietarios: string[];
  personas: { correo: string; nombre: string }[];
}

export default function PantallaAnalisisRiesgos({
  activos,
  bandas,
  umbral,
  procesos,
  propietarios,
  personas,
}: PantallaAnalisisRiesgosProps) {
  const router = useRouter();
  const parametros = useSearchParams();

  const catalogos: CatalogosFiltroAnalisis = useMemo(
    () => ({ procesos, propietarios, personas: personas.map((p) => p.correo) }),
    [procesos, propietarios, personas],
  );

  // §7.1 · la hidratación es del PRIMER render y nada más — el mismo criterio que el
  // inventario, para que un filtro puesto a mano no se revierta solo.
  const [{ filtros, avisos: avisosDeUrl }, setLectura] = useState(() =>
    filtrosAnalisisDesdeUrl(parametros, catalogos),
  );
  const setFiltros = (f: (previos: FiltrosAnalisis) => FiltrosAnalisis): void =>
    setLectura((l) => ({ filtros: f(l.filtros), avisos: [] }));

  // Y la vuelta: cada cambio se refleja en la URL con `replace`, sin apilar historial y sin
  // saltar al tope (un cambio de filtro no es una navegación) — el mismo patrón que
  // `InventarioActivos.tsx` (REQ-SIG-18 §7.1). El primer render no vuelve a escribir la URL
  // que ya trajo: solo los cambios posteriores.
  const consulta = consultaDeFiltrosAnalisis(filtros);
  const ultimaConsulta = useRef<string | null>(null);
  useEffect(() => {
    if (ultimaConsulta.current === null) {
      ultimaConsulta.current = consulta;
      return;
    }
    if (ultimaConsulta.current === consulta) return;
    ultimaConsulta.current = consulta;
    router.replace(`/sgsi/valoracion-riesgos${consulta}`, { scroll: false });
  }, [consulta, router]);

  const datos = useMemo(() => ({ activos, bandas, umbral }), [activos, bandas, umbral]);

  // Sin resolutor de deuda: la Fase 4 (`lib/sgsi/deuda-planes.ts`) no existe todavía. Ver el
  // encabezado del módulo puro.
  const filas = useMemo(() => filasAnalisis(datos, filtros), [datos, filtros]);
  const tarjetas = useMemo(() => tarjetasAnalisis(datos, filtros), [datos, filtros]);
  // El total SIN filtrar, para el encabezado — que diga «37 de 299» siempre, no lo que el
  // filtro actual dejó ver.
  const totalEnAnalisis = useMemo(
    () => tarjetasAnalisis(datos, FILTROS_ANALISIS_VACIOS).enAnalisis.n,
    [datos],
  );

  const hayFiltros = consultaDeFiltrosAnalisis(filtros) !== '';

  if (totalEnAnalisis === 0 && !hayFiltros) {
    return (
      <main className="px-8 pt-6 pb-14">
        <Encabezado umbral={umbral} totalEnAnalisis={0} totalVigentes={activos.length} />
        <p className="parrafo mt-6 rounded-tarjeta border border-border-default bg-surface px-5 py-6 text-12_5 text-muted">
          Ningún activo alcanza hoy el umbral de {umbral}, así que no hay nada que analizar
          todavía.{' '}
          <Link href="/sgsi/valoracion" className="font-semibold text-brand-nav underline">
            Ir a Valoración de activos →
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="px-8 pt-6 pb-14">
      <Encabezado umbral={umbral} totalEnAnalisis={totalEnAnalisis} totalVigentes={activos.length} />

      {avisosDeUrl.length > 0 && (
        <div className="mt-3 rounded-campo border border-border-field bg-subtle px-3 py-2 text-11_5 text-muted">
          {avisosDeUrl.map((a) => (
            <p key={a}>{a}</p>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tarjeta
          etiqueta="EN ANÁLISIS"
          valor={`${tarjetas.enAnalisis.n}`}
          nota={`de ${tarjetas.enAnalisis.deTotal}`}
          activa={!hayFiltros}
          onClick={() => setFiltros(() => FILTROS_ANALISIS_VACIOS)}
        />
        <Tarjeta
          etiqueta="MUY ALTOS"
          valor={String(tarjetas.muyAltos)}
          nota="valor 5"
          activa={filtros.valor === 5}
          onClick={() => setFiltros((f) => ({ ...f, valor: f.valor === 5 ? 'ambos' : 5 }))}
        />
        <Tarjeta
          etiqueta="ALTOS"
          valor={String(tarjetas.altos)}
          nota="valor 4"
          activa={filtros.valor === 4}
          onClick={() => setFiltros((f) => ({ ...f, valor: f.valor === 4 ? 'ambos' : 4 }))}
        />
        <Tarjeta
          etiqueta="RESIDUAL CRÍTICO"
          valor={String(tarjetas.residualCritico)}
          nota="exigen plan (§7)"
          activa={filtros.estadoPlan === 'requiere-plan'}
          onClick={() =>
            setFiltros((f) => ({
              ...f,
              estadoPlan: f.estadoPlan === 'requiere-plan' ? 'todos' : 'requiere-plan',
            }))
          }
        />
        <Tarjeta
          etiqueta="SIN PLAN"
          valor={tarjetas.sinPlan === null ? '—' : String(tarjetas.sinPlan)}
          nota={tarjetas.sinPlan === null ? 'disponible en la Fase 4' : 'vencidos'}
          activa={filtros.estadoPlan === 'pendiente'}
          deshabilitada={tarjetas.sinPlan === null}
          onClick={() =>
            setFiltros((f) => ({
              ...f,
              estadoPlan: f.estadoPlan === 'pendiente' ? 'todos' : 'pendiente',
            }))
          }
        />
      </div>

      <FilaDeFiltros
        filtros={filtros}
        procesos={procesos}
        propietarios={propietarios}
        personas={personas}
        hayFiltros={hayFiltros}
        onCambiar={setFiltros}
        onLimpiar={() => setFiltros(() => FILTROS_ANALISIS_VACIOS)}
      />

      <section className="mt-5 rounded-tarjeta border border-border-default bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-15 font-bold text-primary">Activos en análisis</h2>
          <p className="text-11_5 text-faint">{filas.length} activos · orden por peor residual</p>
        </div>
        {filas.length === 0 ? (
          <p className="parrafo mt-4 text-12_5 text-muted">
            Ningún activo cumple esta combinación de filtros.
          </p>
        ) : (
          <div className="tabla-ancha mt-3">
            <table className="w-full border-collapse text-12_5">
              <thead>
                <tr className="border-b border-hairline-strong">
                  <th className="etiqueta-campo py-1.5 pr-3 text-left">Código</th>
                  <th className="etiqueta-campo py-1.5 pr-3 text-left">Nombre</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-center">Valor</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Criticidad</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Proceso</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Propietario</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Persona</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-right">Amenazas</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Peor inherente</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Peor residual</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Plan</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.codigo} className="border-b border-hairline-faint">
                    <td className="py-1.5 pr-3">
                      <Link
                        href={hrefDeFila(f.codigo, filtros)}
                        className="font-mono font-semibold text-brand-nav underline decoration-from-font underline-offset-2"
                      >
                        {f.codigo}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-secondary">{f.nombre}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[4px] px-1.5 font-mono text-11 font-semibold tabular-nums text-white"
                        style={{ background: colorDeNivelValor(f.valor) }}
                      >
                        {f.valor}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-faint">{f.criticidad ?? '—'}</td>
                    <td className="px-2 py-1.5 text-secondary">{f.proceso}</td>
                    <td className="px-2 py-1.5 text-secondary">{f.propietario ?? '—'}</td>
                    <td className="px-2 py-1.5 text-secondary">{f.persona ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-secondary">
                      {f.cantidadAmenazas}
                    </td>
                    <td className="px-2 py-1.5">
                      <CeldaBanda nivel={f.peorInherente} />
                    </td>
                    <td className="px-2 py-1.5">
                      <CeldaBanda nivel={f.peorResidual} />
                    </td>
                    <td className="px-2 py-1.5">
                      <CeldaPlan estado={f.estadoPlan} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

/// El destino de una fila: el overlay de la tarea 3.2 sobre Amenazas, con los seis filtros de
/// esta pantalla todavía en la URL — para que cerrar (`router.replace` quitando solo
/// `activo`/`tab`) vuelva exactamente a la lista filtrada que se estaba mirando.
function hrefDeFila(codigo: string, filtros: FiltrosAnalisis): string {
  const params = new URLSearchParams(parametrosDeFiltrosAnalisis(filtros));
  params.set('activo', codigo);
  params.set('tab', 'amenazas');
  return `/sgsi/valoracion-riesgos?${params.toString()}`;
}

function Encabezado({
  umbral,
  totalEnAnalisis,
  totalVigentes,
}: {
  umbral: number;
  totalEnAnalisis: number;
  totalVigentes: number;
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="titulo-pagina">Análisis de riesgos</h1>
      <p className="parrafo text-13 text-muted">
        Cuáles activos entran al análisis de riesgos y cómo van: los {totalEnAnalisis} de{' '}
        {totalVigentes} que alcanzan el umbral de {umbral} —«Valoración de activos» resume el
        inventario entero, esta pantalla resume solo los que ya generan riesgos—. Cada tarjeta y
        cada filtro reescopan la lista de abajo juntos: nunca cuentan cosas distintas.
      </p>
    </header>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  nota,
  activa,
  deshabilitada = false,
  onClick,
}: {
  etiqueta: string;
  valor: string;
  nota: string;
  activa: boolean;
  deshabilitada?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitada}
      aria-pressed={activa}
      className="flex flex-col items-start gap-1 rounded-tarjeta border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        borderColor: activa ? 'var(--hf-brand-nav)' : 'var(--hf-border-default)',
        background: activa ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
      }}
    >
      <span className="font-mono text-9_5 uppercase tracking-[0.07em] text-faint">{etiqueta}</span>
      <span className="text-22 font-bold tabular-nums text-primary">{valor}</span>
      <span className="text-11 text-muted">{nota}</span>
    </button>
  );
}

function CeldaBanda({ nivel }: { nivel: { nivel: number; banda: string } | null }) {
  if (nivel === null) {
    return <span className="text-11_5 text-faint">sin calcular</span>;
  }
  return (
    <span className="text-11_5 text-secondary">
      <span className="font-mono font-semibold tabular-nums">{nivel.nivel}</span> · {nivel.banda}
    </span>
  );
}

function CeldaPlan({ estado }: { estado: EstadoPlanActivo }) {
  if (estado === 'no-requiere') return <span className="text-11_5 text-faint">—</span>;
  if (estado === 'con-plan') {
    return (
      <Link
        href="/sgsi/planes"
        className="text-11_5 font-semibold text-brand-nav underline decoration-from-font underline-offset-2"
      >
        ✓ plan
      </Link>
    );
  }
  if (estado === 'pendiente') {
    return (
      <span
        className="rounded-[4px] px-1.5 py-0.5 text-11_5 font-semibold"
        style={{ background: 'var(--hf-warn-bg, #fef3c7)', color: 'var(--hf-warn-text)' }}
      >
        pendiente
      </span>
    );
  }
  // 'sin-determinar' — REQ-SIG-20 Fase 4 (lib/sgsi/deuda-planes.ts) todavía no existe.
  return (
    <span className="text-11_5 text-faint" title="El estado del plan lo determina la Fase 4 de este cambio.">
      Fase 4
    </span>
  );
}

function FilaDeFiltros({
  filtros,
  procesos,
  propietarios,
  personas,
  hayFiltros,
  onCambiar,
  onLimpiar,
}: {
  filtros: FiltrosAnalisis;
  procesos: string[];
  propietarios: string[];
  personas: { correo: string; nombre: string }[];
  hayFiltros: boolean;
  onCambiar: (f: (previos: FiltrosAnalisis) => FiltrosAnalisis) => void;
  onLimpiar: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2.5">
      <Select
        etiqueta="Proceso"
        valor={filtros.proceso}
        opciones={[TODOS_PROCESOS, ...procesos]}
        onChange={(v) => onCambiar((f) => ({ ...f, proceso: v }))}
      />
      <Select
        etiqueta="Propietario"
        valor={filtros.propietario}
        opciones={[TODOS_PROPIETARIOS_ANALISIS, ...propietarios, SIN_ASIGNAR]}
        onChange={(v) => onCambiar((f) => ({ ...f, propietario: v }))}
      />
      <Select
        etiqueta="Persona"
        valor={filtros.persona}
        opciones={[TODAS_PERSONAS_ANALISIS, ...personas.map((p) => p.correo), SIN_ASIGNAR]}
        rotulos={Object.fromEntries(personas.map((p) => [p.correo, p.nombre]))}
        onChange={(v) => onCambiar((f) => ({ ...f, persona: v }))}
        titulo="Activo.personaId está poco poblado hoy: pocos resultados es lo esperado, no un defecto."
      />
      <Select
        etiqueta="Valor"
        valor={String(filtros.valor)}
        opciones={['ambos', '4', '5']}
        rotulos={{ ambos: '4 y 5', '4': '4', '5': '5' }}
        onChange={(v) => onCambiar((f) => ({ ...f, valor: v === 'ambos' ? 'ambos' : (Number(v) as 4 | 5) }))}
      />
      <Select
        etiqueta="Banda del residual"
        valor={filtros.bandaResidual ?? 'Todos'}
        opciones={['Todos', 'rojo', 'verde', 'blanco']}
        onChange={(v) =>
          onCambiar((f) => ({ ...f, bandaResidual: v === 'Todos' ? null : (v as 'rojo' | 'verde' | 'blanco') }))
        }
      />
      <Select
        etiqueta="Estado del plan"
        valor={filtros.estadoPlan === 'requiere-plan' ? 'todos' : filtros.estadoPlan}
        opciones={['todos', 'pendiente', 'con-plan', 'no-requiere']}
        rotulos={{ todos: 'Todos', pendiente: 'Pendiente', 'con-plan': 'Con plan', 'no-requiere': 'No requiere' }}
        onChange={(v) => onCambiar((f) => ({ ...f, estadoPlan: v as FiltrosAnalisis['estadoPlan'] }))}
      />
      {hayFiltros && (
        <button onClick={onLimpiar} className="text-12 font-semibold text-brand-nav hover:underline">
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

function Select({
  etiqueta,
  valor,
  opciones,
  rotulos,
  onChange,
  titulo,
}: {
  etiqueta: string;
  valor: string;
  opciones: string[];
  rotulos?: Record<string, string>;
  onChange: (v: string) => void;
  titulo?: string;
}) {
  return (
    <label
      className="flex items-center gap-2 rounded-[7px] border border-border-field bg-surface py-1.5 pr-1.5 pl-3"
      title={titulo}
    >
      <span className="etiqueta-campo text-9_5">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[210px] rounded-[5px] border border-border-default bg-subtle px-2 py-1 text-12_5 font-medium text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      >
        {opciones.map((o) => (
          <option key={o} value={o}>
            {rotulos?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}
