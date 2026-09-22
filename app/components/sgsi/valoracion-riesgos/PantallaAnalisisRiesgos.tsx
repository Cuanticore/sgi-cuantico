'use client';

// app/components/sgsi/valoracion-riesgos/PantallaAnalisisRiesgos.tsx
//
// REQ-SIG-20 §5 (P4, D7) — «Análisis de riesgos»: los activos que alcanzan el umbral de
// valoración (30 de 378 vigentes, umbral 4, medido el 21/09/2026), ordenados por peor
// residual, con seis tarjetas y una grilla que el lector filtra por columna.
//
// LAS TARJETAS Y LA LISTA NUNCA SE CONTRADICEN. Es la garantía más importante de esta
// pantalla —la misma que REQ-SIG-18 §7.4 exigió para el inventario— y la forma de sostenerla
// CAMBIÓ el 21/09/2026, así que conviene leerla con cuidado antes de tocar nada:
//
//   Antes · las tarjetas y la lista salían de la misma llamada con los mismos filtros
//           (`tarjetasAnalisis`/`filasAnalisis`), y la pantalla no filtraba por su cuenta.
//   Ahora · filtra la grilla, y las tarjetas cuentan LAS FILAS QUE LA GRILLA DEJA VISIBLES
//           (`tarjetasDeFilas`). No pueden desacordar porque cuentan el mismo arreglo.
//
// Lo que NO se puede hacer es volver a contar las tarjetas desde `FiltrosAnalisis` dejando
// el filtro de la grilla encendido: ahí es donde la tarjeta diría 30 y la lista mostraría 12.
//
// LOS SEIS DESPLEGABLES SE RETIRARON, pero `FiltrosAnalisis` NO: se sigue hidratando de la
// URL en el primer render, porque otras pantallas enlazan acá ya filtrado —`FranjaSinPlan`
// (tarea 4.17) enlaza por «sin plan»— y ese contrato no es de esta pantalla romperlo. Lo que
// desapareció es la fila de campos, no la capacidad de llegar acá con un recorte puesto.
//
// EL CLIC EN UNA FILA abre el overlay del activo en Amenazas (`?activo=<código>&tab=amenazas`)
// reusando el contrato de la tarea 3.2 — no una ficha nueva, no una segunda derivación.
//
// EL ORDEN (criterio §14.12, segunda mitad) es peor residual por defecto —el orden que ya
// existía— o criticidad (RTO), reusando sin cambios `ordenarPorCriticidad` de
// `lib/sgsi/analisis-riesgos.ts`. Vive en estado LOCAL, no en la URL: a diferencia de los seis
// filtros de `FiltrosAnalisis`, el orden no cambia QUÉ filas se muestran, solo en qué
// secuencia — meterlo en ese tipo cerrado y probado mezclaría dos preguntas distintas
// («¿cuáles activos?» vs. «¿en qué orden?») en un solo contrato. Reordenar nunca cambia
// `filas.length` ni las tarjetas: ambas siguen leyendo el mismo arreglo de `filasAnalisis`,
// solo se le aplica `ordenarPorCriticidad` encima cuando corresponde.
//
// LA LISTA LA PINTA AG GRID (Community, MIT) desde el 21/09/2026, y ya no una `<table>`
// escrita a mano. Lo que eso agrega es que el lector controla la vista: mover, redimensionar,
// ocultar y fijar columnas, ordenar por varias a la vez, y que su disposición siga ahí mañana.
// Trece columnas no caben en una pantalla, y antes no había forma de decidir cuáles ver.
//
// Las decisiones de la grilla —qué columnas, en qué orden, cómo ordenan, qué clase lleva
// cada fila— viven en `lib/sgsi/columnas-analisis.ts`, puro y probado sin renderizar. La
// documentación de AG Grid desaconseja jsdom y la suite de este repo es jsdom: sin esa
// separación, la Regla 1 del harness pasaría a costar un arranque de navegador por iteración.

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FILTROS_ANALISIS_VACIOS,
  consultaDeFiltrosAnalisis,
  filasAnalisis,
  filtrosAnalisisDesdeUrl,
  parametrosDeFiltrosAnalisis,
  tarjetasAnalisis,
  tarjetasDeFilas,
  type ActivoAnalizable,
  type CatalogosFiltroAnalisis,
  type FilaAnalisis,
  type FiltrosAnalisis,
  type MapaRtoPorCriticidad,
} from '@/lib/sgsi/analisis-riesgos';
import { construirResolverDeuda, type AccionPlanParaDeuda } from '@/lib/sgsi/deuda-planes';
import type { UmbralRiesgo } from '@/lib/sgsi/riesgo-activo';
import FranjaSinPlan, { type FilaFranjaSinPlan } from '@/app/components/sgsi/planes/FranjaSinPlan';
import PopupPlanesActivo from './PopupPlanesActivo';
import type { AccionesGrilla } from './GrillaAnalisis';

/// AG Grid no aporta nada al HTML inicial y sí lo engorda, así que entra por `next/dynamic`
/// con `ssr: false`. El reemplazo mientras carga reserva un alto parecido al de la grilla
/// para que la página no dé un salto cuando llega.
const GrillaAnalisis = dynamic(() => import('./GrillaAnalisis'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center text-12_5 text-faint">
      Cargando la lista…
    </div>
  ),
});

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
  criticidadesRto?: { codigo: string; rtoMinutos: number | null; nombre?: string; descripcion?: string | null }[];
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

  // LAS TARJETAS CUENTAN LO QUE LA GRILLA MUESTRA, y no lo que los filtros dicen.
  //
  // Desde que los seis desplegables se retiraron y filtra la grilla, contar desde
  // `FiltrosAnalisis` dejaría a las tarjetas ciegas a lo que la grilla esconda: dirían 30
  // mientras la lista muestra 12. `tarjetasDeFilas` cuenta las filas visibles, así que las
  // dos no pueden desacordar por construcción.
  //
  // Arranca con todas las filas porque la grilla todavía no ha avisado: es el mismo número
  // que dirá en cuanto avise, no un valor de relleno.
  const [filasVisibles, setFilasVisibles] = useState<FilaAnalisis[] | null>(null);
  const tarjetas = useMemo(
    () => tarjetasDeFilas(filasVisibles ?? filas, activos.length),
    [filasVisibles, filas, activos.length],
  );

  // Y si además el lector ordenó por una columna de la grilla, el rótulo tiene que decirlo:
  // seguir afirmando «por peor residual» sobre una lista ordenada por proceso sería mentir.
  const [ordenPersonalizado, setOrdenPersonalizado] = useState(false);
  // Las acciones de la grilla suben hasta acá para mostrarse en la franja del encabezado,
  // junto a «Generar informe». La lista se lee mejor sin una segunda barra de controles pegada
  // encima; es el mismo motivo por el que el título de la sección se retiró.
  const [acciones, setAcciones] = useState<AccionesGrilla | null>(null);
  const [menuColumnas, setMenuColumnas] = useState(false);
  const criticidadesParaLaGrilla = useMemo(
    () =>
      criticidadesRto.map((c) => ({
        codigo: c.codigo,
        nombre: c.nombre ?? c.codigo,
        descripcion: c.descripcion ?? null,
      })),
    [criticidadesRto],
  );
  const rtoPorCriticidad: MapaRtoPorCriticidad = useMemo(
    () => new Map(criticidadesRto.map((c) => [c.codigo, c.rtoMinutos])),
    [criticidadesRto],
  );
  // El total SIN filtrar, para el encabezado — que diga «37 de 299» siempre, no lo que el
  // filtro actual dejó ver.
  const totalEnAnalisis = useMemo(
    () => tarjetasAnalisis(datos, FILTROS_ANALISIS_VACIOS, resolverDeuda).enAnalisis.n,
    [datos, resolverDeuda],
  );
  const sinPlanCodigos = useMemo(() => new Set(sinPlan.map((f) => f.activoCodigo)), [sinPlan]);

  // Los filtros vigentes viajan en el enlace de cada código, para que cerrar el overlay vuelva
  // exactamente a la lista filtrada que se estaba mirando. Memorizado porque la grilla lo usa
  // como dependencia de sus renderizadores: una función nueva en cada render los rehace todos.
  const hrefDeFilaConFiltros = useCallback(
    (codigo: string) => hrefDeFila(codigo, filtros),
    [filtros],
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
      <Encabezado
        umbral={umbral}
        totalEnAnalisis={totalEnAnalisis}
        totalVigentes={activos.length}
        acciones={acciones}
        menuColumnas={menuColumnas}
        onAlternarMenu={() => {
          acciones?.releerColumnas();
          setMenuColumnas((v) => !v);
        }}
      />

      {avisosDeUrl.length > 0 && (
        <div className="mt-3 rounded-campo border border-border-field bg-subtle px-3 py-2 text-11_5 text-muted">
          {avisosDeUrl.map((a) => (
            <p key={a}>{a}</p>
          ))}
        </div>
      )}

      {/* LAS SEIS EN UNA SOLA LÍNEA. Antes eran `md:grid-cols-5` con seis tarjetas, así que
          la sexta bajaba sola a un segundo renglón y se leía como si fuera de otra categoría.
          Con seis columnas y menos relleno caben las seis, y el bloque vuelve a leerse como
          lo que es: un solo marcador de seis cifras. En pantallas angostas siguen bajando de
          a dos, que es lo correcto — apretar seis en un móvil las haría ilegibles. */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tarjeta
          etiqueta="EN ANÁLISIS"
          valor={`${tarjetas.enAnalisis.n}`}
          nota={`de ${tarjetas.deTotalSinFiltrar}`}
        />
        <Tarjeta etiqueta="MUY ALTOS" valor={String(tarjetas.muyAltos)} nota="valor 5" />
        <Tarjeta etiqueta="ALTOS" valor={String(tarjetas.altos)} nota="valor 4" />
        <Tarjeta
          etiqueta="CON BRECHA"
          valor={String(tarjetas.conBrecha)}
          nota="no alcanzan lo exigido"
        />
        {/* REQ-SIG-24 §7 · va SEPARADA de CON BRECHA a propósito: sumarlas diría que hay
            brechas donde nadie miró. Mientras REQ-SIG-21 no asigne las 272 relevancias,
            ninguna amenaza tiene control principal designado y esta cifra es la medida de
            cuánto del análisis todavía no se puede hacer. */}
        <Tarjeta
          etiqueta="SIN DETERMINAR"
          valor={String(tarjetas.sinDeterminar)}
          nota="sin control principal"
        />
        <Tarjeta etiqueta="SIN PLAN" valor={String(tarjetas.sinPlan)} nota="con brecha, sin plan" />
      </div>

      <div className="mt-5">
        <FranjaSinPlan filas={sinPlan} />
      </div>

      {/* LOS SEIS DESPLEGABLES SE RETIRARON EL 21/09/2026 y filtra la grilla, por columna.
          Lo que se gana: filtrar por cualquiera de las trece columnas y no por seis campos
          elegidos de antemano, con el filtro donde está el dato. Lo que había que cuidar es
          que las tarjetas siguieran contando lo mismo que la lista, y eso lo resuelve
          `tarjetasDeFilas` sobre las filas visibles — ver arriba.

          `FiltrosAnalisis` NO desapareció: sigue leyéndose de la URL, porque otras pantallas
          enlazan acá ya filtrado y ese contrato no es de esta pantalla romperlo. */}

      {/* SIN TÍTULO «Activos en análisis». El h1 de la página ya dice qué es esto, y el
          párrafo de abajo lo explica; repetirlo encima de la lista sólo empujaba la grilla
          hacia abajo. El conteo y el selector de orden se fueron a la barra de la grilla,
          que ahora es la única franja de controles encima de la lista. */}
      <section className="mt-5 rounded-tarjeta border border-border-default bg-surface p-5">
        {filas.length === 0 ? (
          <p className="parrafo text-12_5 text-muted">
            Ningún activo cumple esta combinación de filtros.
          </p>
        ) : (
          <div>
            {/* El conteo se queda, aunque las acciones se hayan ido arriba. Es la garantía de
                esta pantalla hecha visible: este número y el de la tarjeta EN ANÁLISIS salen
                del mismo arreglo, y verlos juntos es lo que permite notar de un vistazo si
                alguna vez dejaran de coincidir. Una línea de texto no es una barra de
                controles. */}
            <p className="mb-2 text-11_5 text-faint">
              {tarjetas.enAnalisis.n} activos · {rotuloDeOrden(ordenPersonalizado)}
            </p>
            <GrillaAnalisis
              filas={filas}
              rtoPorCriticidad={rtoPorCriticidad}
              sinPlanCodigos={sinPlanCodigos}
              hrefDeFila={hrefDeFilaConFiltros}
              onRegistrarPlan={setActivoParaPlan}
              onOrdenPersonalizado={setOrdenPersonalizado}
              onFilasVisibles={setFilasVisibles}
              criticidades={criticidadesParaLaGrilla}
              onAcciones={setAcciones}
            />
            {tarjetas.enAnalisis.n === 0 && (
              <p className="parrafo mt-4 text-12_5 text-muted">
                Los filtros de la grilla no dejaron ninguna fila. Quita alguno con «Limpiar
                filtros».
              </p>
            )}
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

/// El rótulo dice el orden EFECTIVO.
///
/// EL SELECTOR «ORDEN» SE RETIRÓ el 22/09/2026 y no se perdió nada, que es lo que hay que
/// saber antes de echarlo de menos. Tenía dos opciones y las dos siguen alcanzables desde la
/// grilla: «peor residual» pulsando la cabecera de esa columna, y «criticidad (RTO)» pulsando
/// la de Criticidad — esa columna **no ordena por el código sino por el RTO** (§11), con el
/// mismo `compararPorCriticidad` que usaba el selector. Un control con nombre propio para algo
/// que la cabecera ya hacía era interfaz duplicada.
///
/// Si el lector ordenó por una columna, seguir afirmando «orden por peor residual» sobre una
/// grilla ordenada por proceso sería una mentira barata, del tipo que esta pantalla evita en
/// todas partes.
function rotuloDeOrden(personalizado: boolean): string {
  return personalizado ? 'orden personalizado' : 'orden por peor residual';
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
  acciones,
  menuColumnas,
  onAlternarMenu,
}: {
  umbral: number;
  totalEnAnalisis: number;
  totalVigentes: number;
  /// Las acciones de la grilla, que se muestran acá y no encima de la lista. `null` mientras
  /// la grilla no haya cargado — entra por `next/dynamic`, así que hay un instante sin ellas.
  acciones?: AccionesGrilla | null;
  menuColumnas?: boolean;
  onAlternarMenu?: () => void;
}) {
  return (
    <header className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="titulo-pagina mr-auto">Análisis de riesgos</h1>
        {/* Acceso SECUNDARIO, deliberadamente discreto: el informe sale del inventario
            completo y no del recorte que esta pantalla está mostrando, así que un botón
            primario acá prometería «informe de lo que estoy viendo», que no es lo que hace.
            El alcance se elige adentro. */}
        {acciones != null && onAlternarMenu !== undefined && (
          <BarraDeAcciones
            acciones={acciones}
            menuAbierto={menuColumnas === true}
            onAlternarMenu={onAlternarMenu}
          />
        )}
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

/// Una cifra de las seis.
///
/// DEJÓ DE SER UN BOTÓN el 21/09/2026. Antes cada tarjeta aplicaba uno de los seis filtros
/// propios de la pantalla; esos filtros se retiraron y ahora filtra la grilla, así que un
/// botón que ya no filtra nada sería una promesa falsa. La tarjeta pasa a ser lo que en
/// realidad es: un marcador de lo que la lista está mostrando.
///
/// Más angosta que antes —menos relleno, cifra algo menor— para que las seis quepan en una
/// línea. La sexta bajaba sola a un segundo renglón y se leía como de otra categoría.
/// Las acciones de la grilla, en la franja del encabezado.
///
/// Vivían pegadas encima de la lista y subieron acá el 22/09/2026, junto con el retiro del
/// título «Activos en análisis»: dos franjas de controles entre el encabezado y la primera
/// fila hacían que la lista empezara con el ojo ya cansado.
///
/// El selector de columnas es propio y no el panel lateral de AG Grid, que es Enterprise. Hace
/// falta porque dos columnas arrancan escondidas para que las trece quepan sin barra
/// horizontal — y esconder algo que no se puede recuperar es borrarlo.
function BarraDeAcciones({
  acciones,
  menuAbierto,
  onAlternarMenu,
}: {
  acciones: AccionesGrilla;
  menuAbierto: boolean;
  onAlternarMenu: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={acciones.exportarExcel}
        // Se nombra «lo que estás viendo» a propósito: el informe formal sale del inventario
        // completo por «Generar informe», no de este recorte.
        title="Descarga lo que estás viendo, con los colores de banda. No es el informe de valoración."
        className="rounded-campo border border-border-field bg-surface px-2 py-1 text-11 font-semibold text-secondary-soft hover:bg-subtle"
      >
        Exportar a Excel
      </button>
      <button
        onClick={acciones.exportarCsv}
        title="El mismo recorte, en texto plano y sin formato."
        className="text-11 font-semibold text-brand-nav hover:underline"
      >
        CSV
      </button>
      <button
        onClick={acciones.limpiarFiltros}
        className="text-11 font-semibold text-brand-nav hover:underline"
      >
        Limpiar filtros
      </button>
      <div className="relative">
        <button
          onClick={onAlternarMenu}
          aria-expanded={menuAbierto}
          className="text-11 font-semibold text-brand-nav hover:underline"
        >
          Columnas
        </button>
        {menuAbierto && (
          <div
            role="group"
            aria-label="Columnas visibles"
            className="absolute right-0 z-20 mt-1 max-h-[320px] w-[220px] overflow-auto rounded-campo border border-border-default bg-surface p-2 shadow-lg"
          >
            {acciones.columnas.map((c) => (
              <label
                key={c.colId}
                className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1 text-11_5 text-secondary hover:bg-subtle"
              >
                <input
                  type="checkbox"
                  checked={c.visible}
                  onChange={(e) => acciones.alternarColumna(c.colId, e.target.checked)}
                />
                {c.nombre}
              </label>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={acciones.restablecer}
        className="text-11 font-semibold text-brand-nav hover:underline"
      >
        Restablecer columnas
      </button>
    </div>
  );
}

function Tarjeta({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota: string }) {
  return (
    <div className="flex flex-col items-start gap-0.5 rounded-tarjeta border border-border-default bg-surface px-3 py-2.5">
      <span className="font-mono text-9_5 uppercase tracking-[0.06em] text-faint">{etiqueta}</span>
      <span className="text-19 font-bold tabular-nums text-primary">{valor}</span>
      <span className="text-10_5 leading-tight text-muted">{nota}</span>
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
