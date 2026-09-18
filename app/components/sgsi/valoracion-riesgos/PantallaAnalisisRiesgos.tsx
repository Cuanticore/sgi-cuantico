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
//
// EL ORDEN (criterio §14.12, segunda mitad) es peor residual por defecto —el orden que ya
// existía— o criticidad (RTO), reusando sin cambios `ordenarPorCriticidad` de
// `lib/sgsi/analisis-riesgos.ts`. Vive en estado LOCAL, no en la URL: a diferencia de los seis
// filtros de `FiltrosAnalisis`, el orden no cambia QUÉ filas se muestran, solo en qué
// secuencia — meterlo en ese tipo cerrado y probado mezclaría dos preguntas distintas
// («¿cuáles activos?» vs. «¿en qué orden?») en un solo contrato. Reordenar nunca cambia
// `filas.length` ni las tarjetas: ambas siguen leyendo el mismo arreglo de `filasAnalisis`,
// solo se le aplica `ordenarPorCriticidad` encima cuando corresponde.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FILTROS_ANALISIS_VACIOS,
  SIN_ASIGNAR,
  TODAS_CRITICIDADES,
  TODAS_PERSONAS_ANALISIS,
  TODOS_PROCESOS,
  TODOS_PROPIETARIOS_ANALISIS,
  consultaDeFiltrosAnalisis,
  filasAnalisis,
  filtrosAnalisisDesdeUrl,
  ordenarPorCriticidad,
  parametrosDeFiltrosAnalisis,
  tarjetasAnalisis,
  type ActivoAnalizable,
  type CatalogosFiltroAnalisis,
  type EstadoPlanActivo,
  type FiltrosAnalisis,
  type MapaRtoPorCriticidad,
} from '@/lib/sgsi/analisis-riesgos';
import { construirResolverDeuda, type AccionPlanParaDeuda } from '@/lib/sgsi/deuda-planes';
import { colorDeNivel, type NivelRiesgo, type UmbralRiesgo } from '@/lib/sgsi/riesgo-activo';
import { colorDeNivelValor } from '@/lib/sgsi/valoracion-figura';
import FranjaSinPlan, { PuntoSinPlan, type FilaFranjaSinPlan } from '@/app/components/sgsi/planes/FranjaSinPlan';
import PopupPlanesActivo from './PopupPlanesActivo';

/// Criterio §14.12 (segunda mitad) · las dos secuencias que esta pantalla ofrece. `'residual'`
/// es el orden que ya existía y sigue siendo el predeterminado; `'criticidad'` reusa
/// `ordenarPorCriticidad` sin escribir un segundo comparador.
type OrdenAnalisis = 'residual' | 'criticidad';

export interface PantallaAnalisisRiesgosProps {
  activos: ActivoAnalizable[];
  bandas: UmbralRiesgo[];
  umbral: number;
  procesos: string[];
  propietarios: string[];
  personas: { correo: string; nombre: string }[];
  /// REQ-SIG-20 §7 (D4, tarea 4.10-4.11) · crudos: esta pantalla reconstruye
  /// `ResolverDeudaPlan` con `construirResolverDeuda` porque sus filtros reescopan sin ida y
  /// vuelta al servidor y una función no cruza ese límite.
  accionesParaDeuda: AccionPlanParaDeuda[];
  /// La franja nombrada (tarea 4.17), ya resuelta con antigüedad.
  sinPlan: FilaFranjaSinPlan[];
  /// Criterio §14.12 (segunda mitad) · `codigo → rtoMinutos` de `CriticidadNegocio`, plano —
  /// la pantalla arma acá el `MapaRtoPorCriticidad` que `ordenarPorCriticidad` necesita, un
  /// `Map` no cruza el límite servidor→cliente como prop. Opcional con default `[]` para no
  /// romper a quien todavía no lo provee.
  criticidadesRto?: { codigo: string; rtoMinutos: number | null }[];
}

export default function PantallaAnalisisRiesgos({
  activos,
  bandas,
  umbral,
  procesos,
  propietarios,
  personas,
  accionesParaDeuda,
  sinPlan,
  criticidadesRto = [],
}: PantallaAnalisisRiesgosProps) {
  const router = useRouter();
  const parametros = useSearchParams();
  /// El activo cuyo popup de planes está abierto. `null` = ninguno.
  const [activoParaPlan, setActivoParaPlan] = useState<string | null>(null);

  const catalogos: CatalogosFiltroAnalisis = useMemo(
    () => ({
      procesos,
      propietarios,
      personas: personas.map((p) => p.correo),
      // Los códigos ya viajan para ordenar por criticidad (§14.12); acá sirven además como
      // catálogo del filtro, sin una segunda consulta que podría desacordar con aquella.
      criticidades: criticidadesRto.map((c) => c.codigo),
    }),
    [procesos, propietarios, personas, criticidadesRto],
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

  // REQ-SIG-20 §7 (tarea 4.10-4.11) · el mismo `construirResolverDeuda` puro que
  // `lib/sgsi/deuda-planes-lectura.ts` usa del lado del servidor, reconstruido acá sobre los
  // `AccionPlan` crudos — la única forma de que una función cruce el límite servidor→cliente
  // es no ser una función: viajan los datos, se reconstruye la MISMA derivación.
  const resolverDeuda = useMemo(() => construirResolverDeuda(accionesParaDeuda), [accionesParaDeuda]);

  const filas = useMemo(() => filasAnalisis(datos, filtros, resolverDeuda), [datos, filtros, resolverDeuda]);
  const tarjetas = useMemo(
    () => tarjetasAnalisis(datos, filtros, resolverDeuda),
    [datos, filtros, resolverDeuda],
  );

  // Criterio §14.12 (segunda mitad) · el orden es local, no un filtro: no cambia `filas`, solo
  // en qué secuencia se muestran las mismas filas ya filtradas (ver comentario de cabecera).
  const [orden, setOrden] = useState<OrdenAnalisis>('residual');
  const rtoPorCriticidad: MapaRtoPorCriticidad = useMemo(
    () => new Map(criticidadesRto.map((c) => [c.codigo, c.rtoMinutos])),
    [criticidadesRto],
  );
  const filasOrdenadas = useMemo(
    () => (orden === 'criticidad' ? ordenarPorCriticidad(filas, rtoPorCriticidad) : filas),
    [filas, orden, rtoPorCriticidad],
  );
  // El total SIN filtrar, para el encabezado — que diga «37 de 299» siempre, no lo que el
  // filtro actual dejó ver.
  const totalEnAnalisis = useMemo(
    () => tarjetasAnalisis(datos, FILTROS_ANALISIS_VACIOS, resolverDeuda).enAnalisis.n,
    [datos, resolverDeuda],
  );
  const sinPlanCodigos = useMemo(() => new Set(sinPlan.map((f) => f.activoCodigo)), [sinPlan]);

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
          etiqueta="CON BRECHA"
          valor={String(tarjetas.conBrecha)}
          nota="no alcanzan lo exigido"
          activa={filtros.estadoPlan === 'requiere-plan'}
          onClick={() =>
            setFiltros((f) => ({
              ...f,
              estadoPlan: f.estadoPlan === 'requiere-plan' ? 'todos' : 'requiere-plan',
            }))
          }
        />
        {/* REQ-SIG-24 §7 · va SEPARADA de CON BRECHA a propósito: sumarlas diría que hay
            brechas donde nadie miró. Mientras REQ-SIG-21 no asigne las 272 relevancias,
            ninguna amenaza tiene control principal designado y esta cifra es la medida de
            cuánto del análisis todavía no se puede hacer. */}
        <Tarjeta
          etiqueta="SIN DETERMINAR"
          valor={String(tarjetas.sinDeterminar)}
          nota="sin control principal → REQ-SIG-21"
          activa={false}
          onClick={() => {}}
        />
        <Tarjeta
          etiqueta="SIN PLAN"
          valor={tarjetas.sinPlan === null ? '—' : String(tarjetas.sinPlan)}
          nota="con brecha, sin plan"
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

      <div className="mt-5">
        <FranjaSinPlan filas={sinPlan} />
      </div>

      <FilaDeFiltros
        filtros={filtros}
        procesos={procesos}
        propietarios={propietarios}
        personas={personas}
        criticidades={catalogos.criticidades}
        hayFiltros={hayFiltros}
        onCambiar={setFiltros}
        onLimpiar={() => setFiltros(() => FILTROS_ANALISIS_VACIOS)}
      />

      <section className="mt-5 rounded-tarjeta border border-border-default bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-15 font-bold text-primary">Activos en análisis</h2>
          <div className="flex items-baseline gap-3">
            <p className="text-11_5 text-faint">
              {filas.length} activos ·{' '}
              {orden === 'residual' ? 'orden por peor residual' : 'orden por criticidad (RTO)'}
            </p>
            <Select
              etiqueta="Orden"
              valor={orden}
              opciones={['residual', 'criticidad']}
              rotulos={{ residual: 'Peor residual', criticidad: 'Criticidad (RTO)' }}
              onChange={(v) => setOrden(v as OrdenAnalisis)}
            />
          </div>
        </div>
        {filasOrdenadas.length === 0 ? (
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
                  {/* Una columna por dimensión, además del máximo. El encabezado lleva la
                      letra —no hay ancho para más— y el nombre completo va en el accesible,
                      que es también lo que un lector de pantalla anuncia. */}
                  {DIMENSIONES.map((d) => (
                    <th
                      key={d.codigo}
                      scope="col"
                      aria-label={d.nombre}
                      title={d.nombre}
                      className="etiqueta-campo px-1 py-1.5 text-center"
                    >
                      {d.codigo}
                    </th>
                  ))}
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Criticidad</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Proceso</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Propietario</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-right">Amenazas</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Peor inherente</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Peor residual</th>
                  <th className="etiqueta-campo px-2 py-1.5 text-left">Plan</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((f) => (
                  <tr
                    key={f.codigo}
                    // La banda y el estado del plan viajan como atributos y no sólo como
                    // color: el color lo lee quien ve, esto lo lee quien filtra la tabla con
                    // el inspector, y las pruebas.
                    data-banda-residual={f.peorResidual?.banda ?? 'sin-calcular'}
                    data-estado-plan={f.estadoPlan}
                    className={`border-b border-hairline-faint ${
                      esResidualAlarmante(f.peorResidual) ? 'bg-danger-bg' : ''
                    }`}
                  >
                    <td className="py-1.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Link
                          href={hrefDeFila(f.codigo, filtros)}
                          className="font-mono font-semibold text-brand-nav underline decoration-from-font underline-offset-2"
                        >
                          {f.codigo}
                        </Link>
                        {sinPlanCodigos.has(f.codigo) && <PuntoSinPlan />}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-secondary">{f.nombre}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        aria-label={`Valor del activo ${f.codigo}`}
                        title={`Valor del activo: max(D, I, C) = ${f.valor}`}
                        className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[4px] px-1.5 font-mono text-11 font-semibold tabular-nums text-white"
                        style={{ background: colorDeNivelValor(f.valor) }}
                      >
                        {f.valor}
                      </span>
                    </td>
                    {/* Las tres dimensiones, sin badge de color: el color es del AGREGADO y
                        repetirlo cuatro veces convierte la fila en un semáforo ilegible. La
                        que empata con el máximo va en negrita, que es la pregunta real —
                        «¿qué dimensión puso a este activo donde está?». */}
                    {DIMENSIONES.map((d) => {
                      const v = f.valores[d.codigo];
                      return (
                        <td key={d.codigo} className="px-1 py-1.5 text-center">
                          <span
                            aria-label={`${d.nombre} de ${f.codigo}`}
                            title={`${d.nombre}: ${v}`}
                            className={`font-mono text-11_5 tabular-nums ${
                              v === f.valor ? 'font-bold text-primary' : 'text-secondary'
                            }`}
                          >
                            {v}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5">
                      {f.criticidad === null ? (
                        <span className="text-faint">sin clasificar</span>
                      ) : (
                        <span className="inline-block rounded-badge border border-border-default bg-subtle px-2 py-0.5 font-mono text-11 font-semibold text-secondary-soft">
                          {f.criticidad}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-secondary">{f.proceso}</td>
                    <td className="px-2 py-1.5 text-secondary">{f.propietario ?? '—'}</td>
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
                      <span className="inline-flex items-center gap-2">
                        <CeldaPlan estado={f.estadoPlan} />
                        {/* SE OFRECE EN TODAS LAS FILAS, y antes no.
                            Se escondía sobre los activos `no-requiere` para no invitar a
                            registrar trabajo que nadie pidió. La decisión se revirtió el
                            18/09/2026: «no requiere» significa que sus controles alcanzan lo
                            exigido HOY, no que nadie pueda decidir mejorarlos. Un plan
                            preventivo sobre un control que ya cumple es una decisión legítima
                            de quien lo registra —así lo dice también `planes-por-amenaza.ts`
                            sobre la brecha: ordena la lista, no la filtra— y esconder el botón
                            obligaba a salir a la pantalla de Planes para tomarla. */}
                        <button
                          onClick={() => setActivoParaPlan(f.codigo)}
                          // El texto visible es «+ plan» en las treinta filas; sin esto,
                          // un lector de pantalla anuncia treinta botones indistinguibles.
                          aria-label={`Registrar planes de tratamiento para ${f.codigo}`}
                          title={`Registrar planes de tratamiento para ${f.codigo}`}
                          className="rounded-campo border border-border-field px-1.5 py-0.5 text-11 font-semibold text-secondary-soft hover:bg-subtle"
                        >
                          + plan
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {activoParaPlan !== null && (
        <PopupPlanesActivo
          key={activoParaPlan}
          activoCodigo={activoParaPlan}
          onCerrar={() => setActivoParaPlan(null)}
          // El popup registra; refrescar la lista es de quien la monta. Sin esto la columna
          // «Plan» seguiría diciendo «pendiente» sobre un activo que acaba de recibir uno.
          onRegistrado={() => router.refresh()}
        />
      )}
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
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="titulo-pagina mr-auto">Análisis de riesgos</h1>
        {/* Acceso SECUNDARIO, deliberadamente discreto: el informe sale del inventario
            completo y no del recorte que esta pantalla está mostrando, así que un botón
            primario acá prometería «informe de lo que estoy viendo», que no es lo que hace.
            El alcance se elige adentro. */}
        <Link
          href="/sgsi/informe-valoracion"
          className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 font-semibold text-primary hover:bg-surface-hover"
        >
          Generar informe
        </Link>
      </div>
      <p className="parrafo text-13 text-muted">
        Cuáles activos entran al análisis de riesgos y cómo van: los {totalEnAnalisis} de{' '}
        {totalVigentes} que alcanzan el umbral de {umbral} —«Valoración de activos» resume el
        inventario entero, esta pantalla resume solo los que ya generan riesgos—. Cada tarjeta y
        cada filtro reescopan la lista de abajo juntos: nunca cuentan cosas distintas.
      </p>
    </header>
  );
}

/// Las tres dimensiones activas del modelo, en el orden de MAGERIT y del catálogo.
///
/// El orden es D · I · C y no el que se pida en una conversación suelta: es el mismo de
/// `ValoresDimension`, el de la ficha del activo y el del seed (`orden` 1, 2, 3). Cuatro
/// pantallas que muestran las mismas tres letras en órdenes distintos se leen mal justo
/// cuando hay que comparar dos activos.
///
/// A y T están modeladas e inactivas en el catálogo; el día que se activen, esto deja de
/// poder ser una constante y pasa a leerse de `Dimension` — igual que `valorMaximo` ya
/// itera las activas en vez de tres constantes.
const DIMENSIONES = [
  { codigo: 'D', nombre: 'Disponibilidad' },
  { codigo: 'I', nombre: 'Integridad' },
  { codigo: 'C', nombre: 'Confidencialidad' },
] as const;

/// Las bandas cuyo residual pinta el renglón.
///
/// **Se nombran por su nombre y no por el orden del umbral** porque el catálogo es editable:
/// `UmbralRiesgo` se parametriza y alguien puede insertar una banda intermedia. Un `orden <= 2`
/// pintaría entonces la banda equivocada sin que nada falle.
const BANDAS_ALARMANTES = ['Crítico', 'Alto'];

/// Si el residual de un activo es de los que hay que ver sin leer la tabla.
///
/// `null` —«sin calcular»— **no se pinta**, y la distinción importa: pintarlo diría que el
/// riesgo es alto, y lo que pasa es que no se sabe. Es la misma doctrina que sostiene el
/// informe de valoración: eficacia desconocida no es riesgo alto ni riesgo bajo, es un estado
/// del modelo. La columna «Peor residual» ya lo dice con su propia palabra.
function esResidualAlarmante(nivel: NivelRiesgo | null): boolean {
  return nivel !== null && BANDAS_ALARMANTES.includes(nivel.banda);
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

/// El nivel con el color de su banda — el MISMO con el que la matriz pinta la casilla donde
/// ese activo cae. Desde la opción B una casilla ocupada se pinta con la banda de su peor
/// contenido, así que el renglón y la casilla coinciden y las dos vistas se leen juntas.
///
/// El color nunca es el único portador: el renglón sigue diciendo la banda en palabras, para
/// quien no pueda verlo.
function CeldaBanda({ nivel }: { nivel: NivelRiesgo | null }) {
  if (nivel === null) {
    return <span className="text-11_5 text-faint">sin calcular</span>;
  }
  const c = colorDeNivel(nivel);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-campo px-2 py-0.5 text-11_5 font-semibold"
      style={c === null ? undefined : { background: c.bg, color: c.fg }}
      title={`Cae en la casilla ${nivel.banda} de la matriz · ${nivel.figura}`}
    >
      <span className="font-mono tabular-nums">{nivel.nivel}</span> · {nivel.banda}
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
  criticidades,
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
  /// Los códigos `C1`..`C5`, en el orden del catálogo. Salen de `criticidadesRto`, que ya
  /// viaja para ordenar por criticidad: una sola fuente, sin un segundo catálogo que se
  /// pueda desacordar con aquel.
  criticidades: readonly string[];
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
      {/* REQ-SIG-20 §11 (P9) · la criticidad va junto a Valor y no al final: las dos
          responden «cuánto importa este activo», y el orden del renglón agrupa primero
          quién responde por él (proceso, propietario, persona) y después cuánto pesa. */}
      <Select
        etiqueta="Criticidad"
        valor={filtros.criticidad}
        opciones={[TODAS_CRITICIDADES, ...criticidades, SIN_ASIGNAR]}
        rotulos={{ [SIN_ASIGNAR]: 'Sin clasificar' }}
        onChange={(v) => onCambiar((f) => ({ ...f, criticidad: v }))}
        titulo="La declara el negocio en FOR-SIG-12 columna 26; no se deriva del residual. Hoy casi todo el inventario está sin clasificar."
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
