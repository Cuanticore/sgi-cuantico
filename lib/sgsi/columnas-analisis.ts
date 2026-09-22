// lib/sgsi/columnas-analisis.ts
//
// Las columnas de la grilla de «Análisis de riesgos», como DATO PURO.
//
// ESTE MÓDULO NO RENDERIZA NADA y de AG Grid sólo usa sus tipos. No es un capricho de
// arquitectura: la documentación de AG Grid desaconseja jsdom —sin soporte de layout, la
// virtualización no calcula qué filas caben y el grid puede no rendir ninguna— y recomienda
// verificar en navegador real. Si toda la lógica de la grilla viviera dentro del componente,
// la única forma de probarla sería Playwright, y la Regla 1 de HARNESS.md —prueba en rojo
// ANTES del arreglo— pasaría a costar un minuto por iteración en vez de un segundo. Una regla
// que cuesta eso se deja de cumplir.
//
// Así que acá vive todo lo que puede estar mal, probado en `__tests__/columnas-analisis.test.ts`
// en milisegundos, y el componente queda como cascarón sin decisiones.
//
// LO QUE NO ESTÁ ACÁ, a propósito: los `cellRenderer`, que son React y viven en
// `GrillaAnalisis.tsx`. Se inyectan por `opciones.renderers`, indexados por el mismo
// `IdColumnaAnalisis` que nombra a cada columna.
//
// LA GRILLA SÍ FILTRA, y las tarjetas cuentan lo que la grilla muestra. Son las dos mitades
// de la misma garantía: la pantalla no puede tener dos verdades sobre cuántos activos hay.
// Ver `COL_DEF_POR_DEFECTO` para la historia completa de esa decisión —que estuvo al revés
// durante unas horas del 21/09/2026— y `tarjetasDeFilas` en `analisis-riesgos.ts` para la
// mitad que hace que encender el filtro sea seguro.

import type { ColDef, ColGroupDef } from 'ag-grid-community';
import { esBandaAlarmante } from './alto-sin-plan';
import {
  compararPorCriticidad,
  type EstadoPlanActivo,
  type FilaAnalisis,
  type MapaRtoPorCriticidad,
} from './analisis-riesgos';
import { EXIGENCIA_POR_CRITICIDAD, REQUIERE_VERIFICACION } from './exigencia';
import type { NivelRiesgo } from './riesgo-activo';

/// Cada columna por su nombre. Es la clave con la que el componente engancha su renderizador
/// y con la que la disposición guardada se vuelve a leer, así que renombrar uno de estos
/// invalida las disposiciones guardadas — de ahí la versión en `CLAVE_ESTADO_COLUMNAS`.
export type IdColumnaAnalisis =
  | 'codigo'
  | 'nombre'
  | 'plan'
  | 'C'
  | 'I'
  | 'D'
  | 'valor'
  | 'criticidad'
  | 'proceso'
  | 'propietario'
  | 'cantidadAmenazas'
  | 'peorInherente'
  | 'peorResidual';

export const ID_GRUPO_DIMENSIONES = 'dimensiones';

/// Dónde se guarda la disposición que el lector arma.
export const CLAVE_ESTADO_COLUMNAS = 'sgsi:analisis-riesgos:columnas:v1';

/// Lo que se guarda: el estado de columnas **y el orden de fábrica con el que nació**.
export interface DisposicionGuardada {
  version: string;
  /// Los `colId` en el orden de fábrica del día en que se guardó.
  fabrica: string[];
  estado: unknown[];
}

/// Si una disposición guardada todavía se puede aplicar, o hay que volver a la de fábrica.
///
/// ESTO NACIÓ DE UN DEFECTO. El 21/09/2026 «Plan» se movió a la tercera posición, y quien ya
/// tenía una disposición guardada siguió viendo el orden viejo: el cambio parecía no haberse
/// aplicado. No era un defecto del cambio, era **la persistencia derrotándolo en silencio**, que
/// es peor — el reporte que llega es «no se aplicó» y el código dice que sí.
///
/// La versión en la clave no bastaba por dos motivos. Uno, sólo contemplaba que cambiaran los
/// `colId`, y acá no cambió ninguno: cambió el ORDEN. Dos, y más de fondo, **subirla a mano
/// depende de que alguien se acuerde**, y nadie se acuerda de invalidar el caché de otro.
///
/// Así que la disposición lleva consigo el orden de fábrica con el que nació y se descarta sola
/// cuando deja de coincidir. Se pierde la personalización de quien la tuviera, una vez. Es el
/// precio correcto: una disposición vieja que esconde un cambio cuesta mucho más que volver a
/// mover dos columnas.
export function disposicionAplicable(
  guardada: unknown,
  fabricaActual: readonly string[],
): unknown[] | null {
  // Nada de lo que venga de `localStorage` es de fiar: lo escribe el navegador de cualquiera y
  // puede llegar truncado, editado a mano o de otra versión de la aplicación.
  if (typeof guardada !== 'object' || guardada === null || Array.isArray(guardada)) return null;
  const d = guardada as Partial<DisposicionGuardada>;
  if (d.version !== CLAVE_ESTADO_COLUMNAS) return null;
  if (!Array.isArray(d.fabrica) || !Array.isArray(d.estado)) return null;
  if (d.fabrica.length !== fabricaActual.length) return null;
  if (d.fabrica.some((id, i) => id !== fabricaActual[i])) return null;
  return d.estado;
}

/// Los `colId` en el orden de fábrica, aplanando el grupo de dimensiones. Es lo que se guarda
/// junto a la disposición para poder detectar que el orden cambió.
export function ordenDeFabrica(
  columnas: readonly (ColDef<FilaAnalisis> | ColGroupDef<FilaAnalisis>)[],
): string[] {
  return columnas.flatMap((c) =>
    'children' in c
      ? (c.children as ColDef<FilaAnalisis>[]).map((h) => h.colId ?? '')
      : [(c as ColDef<FilaAnalisis>).colId ?? ''],
  );
}

/// Las tres dimensiones activas del modelo, en el orden de MAGERIT y del catálogo (D · I · C,
/// `orden` 1, 2, 3 del seed) — el mismo de `ValoresDimension`, el de la ficha del activo y el
/// de la matriz. Cuatro pantallas que muestran las mismas tres letras en órdenes distintos se
/// leen mal justo cuando hay que comparar dos activos.
///
/// A y T están modeladas e inactivas; el día que se activen, esto deja de poder ser una
/// constante y pasa a leerse de `Dimension`.
export const DIMENSIONES = [
  { codigo: 'D', nombre: 'Disponibilidad' },
  { codigo: 'I', nombre: 'Integridad' },
  { codigo: 'C', nombre: 'Confidencialidad' },
] as const;

/// El acento ROJO del renglón: **queda riesgo residual en banda Alto o Crítico que ningún plan
/// cubre** (`FilaAnalisis.altoSinPlan`).
///
/// CONSERVA EL NOMBRE Y ESTRECHA EL SIGNIFICADO, y en el mismo día cambió dos veces:
///
///   1. Nació marcando la BANDA del residual, sin mirar planes.
///   2. Pasó a marcar la BRECHA DE CONTROL sin cubrir (`estadoPlan === 'pendiente'`), al
///      retirarse la etiqueta ámbar «pendiente».
///   3. Ahora marca el RIESGO QUE QUEDA sin tratar, y lo del paso 2 se va a `CLASE_FILA_BRECHA`.
///
/// El paso 3 existe porque el paso 2 no decía nada de un activo con el control al día y el
/// residual en Alto — el caso que ISO/IEC 27001 6.1.3 no deja pasar sin una decisión escrita.
///
/// La banda no se queda sin señal: su columna sigue llevando color y palabra. Cada una en su
/// sitio.
export const CLASE_FILA_ALARMANTE = 'fila-alarmante';

/// El acento ámbar: deuda de MADUREZ. Es lo que `fila-alarmante` significaba hasta hoy.
export const CLASE_FILA_BRECHA = 'fila-brecha-pendiente';

/// Si el residual de un activo es de los que hay que ver sin leer la tabla.
///
/// `null` —«sin calcular»— **no se pinta**, y la distinción importa: pintarlo diría que el
/// riesgo es alto, y lo que pasa es que no se sabe. Es la misma doctrina que sostiene el
/// informe de valoración: eficacia desconocida no es riesgo alto ni riesgo bajo, es un estado
/// del modelo. La columna «Peor residual» ya lo dice con su propia palabra.
///
/// LA LISTA DE BANDAS YA NO VIVE ACÁ. Este archivo declaraba su propia `BANDAS_ALARMANTES`
/// mientras `alto-sin-plan.ts` declaraba otra igual, y dos listas que se separan es cómo la
/// grilla y el popup de planes terminan diciendo cosas distintas sobre la misma amenaza. Se
/// delega en `esBandaAlarmante`, que es la única dueña del criterio; acá queda sólo la
/// adaptación de `NivelRiesgo` —que es un tipo de la grilla— a su `banda`.
export function esResidualAlarmante(nivel: NivelRiesgo | null): boolean {
  return esBandaAlarmante(nivel === null ? null : nivel.banda);
}

/// Las clases de una fila: su banda residual, su estado de plan y el acento.
///
/// ESTO ERA `data-banda-residual` Y `data-estado-plan` en la `<table>`. AG Grid no expone
/// ninguna API para poner atributos `data-*` en el elemento de fila —sólo clases y estilos—,
/// así que el contrato pasa a clase. Sirve igual para las tres cosas que sostenía: se ve en
/// el inspector, se puede seleccionar, y se prueba. Y lo de fondo no cambia: la banda sigue
/// escrita **en palabras** en su columna, así que el color nunca es el único portador.
///
/// El nombre de la banda va sin tildes ni espacios en la clase (`Crítico` → `fila-banda--Critico`):
/// una clase con tilde es válida en CSS moderno pero se escapa distinto en cada herramienta, y
/// esta clase existe justamente para ser escrita a mano en un selector.
///
/// DOS ACENTOS, Y NUNCA LOS DOS A LA VEZ:
///
///   · ROJO (`fila-alarmante`)         queda riesgo residual Alto o Crítico SIN PLAN que lo cubra
///   · ÁMBAR (`fila-brecha-pendiente`) hay brecha de control sin cubrir, y ningún alto suelto
///
/// Son dos preguntas distintas —el riesgo que queda y la madurez del control— y se cruzan: una
/// brecha sin cubrir es una de las formas de que quede un residual alto, así que lo habitual es
/// que las dos se cumplan juntas.
///
/// EL `else` NO ES UN DETALLE DE ESTILO. Cuando las dos se cumplen gana el rojo, porque es el
/// problema más grave y el que manda la acción. Pintar los dos no informa más: da un renglón de
/// dos colores que no se puede leer, y en el caso más común. Sin el `else` ése sería el
/// comportamiento por defecto.
export function claseDeFila(fila: FilaAnalisis): string[] {
  const banda = fila.peorResidual === null ? 'sin-calcular' : sinTildes(fila.peorResidual.banda);
  const clases = [`fila-banda--${banda}`, `fila-plan--${fila.estadoPlan}`];
  if (fila.altoSinPlan) clases.push(CLASE_FILA_ALARMANTE);
  else if (fila.estadoPlan === 'pendiente') clases.push(CLASE_FILA_BRECHA);
  return clases;
}

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
}

/// Ordena dos niveles por su magnitud, de menor a mayor.
///
/// `null` —«sin calcular»— se ordena por debajo de todo lo medido. No es que valga cero: es
/// que no hay número que comparar, y un orden tiene que poner esas filas en algún lado. La
/// celda las sigue nombrando «sin calcular», que es lo que impide leerlas como «bajo».
export function compararNivel(a: NivelRiesgo | null, b: NivelRiesgo | null): number {
  return (a?.nivel ?? -1) - (b?.nivel ?? -1);
}

/// El nivel en palabras: lo que la celda muestra y lo que sale al CSV.
export function textoDeNivel(nivel: NivelRiesgo | null): string {
  return nivel === null ? 'sin calcular' : `${nivel.nivel} · ${nivel.banda}`;
}

/// El estado del plan en palabras, para el CSV — en pantalla lo pinta su renderizador.
///
/// `sin-determinar` se nombra por lo que es y no con un guion: un activo cuya brecha no se
/// pudo evaluar no es un activo sin brecha.
export function textoDeEstadoPlan(estado: EstadoPlanActivo): string {
  const palabras: Record<EstadoPlanActivo, string> = {
    'no-requiere': 'No requiere',
    'con-plan': 'Con plan',
    pendiente: 'Pendiente',
    'sin-determinar': 'Sin determinar',
  };
  return palabras[estado];
}

/// Lo que toda columna hereda: mover, redimensionar, ordenar y **filtrar**.
///
/// EL FILTRO ESTABA APAGADO HASTA EL 21/09/2026, y la decisión se revirtió el mismo día por
/// pedido de quien usa la pantalla. Conviene dejar escrito el porqué de las dos posturas,
/// porque el riesgo que motivaba apagarlo es real y sigue ahí:
///
/// Apagado, porque las cinco tarjetas y la lista salían de la misma llamada con los mismos
/// filtros y no podían contradecirse. Un filtro de la grilla rompía eso en el primer clic: la
/// tarjeta decía 30 y la grilla mostraba 12.
///
/// Encendido, porque los seis desplegables propios de la pantalla se retiraron y filtrar por
/// columna es mejor herramienta. Lo que impide que vuelva el defecto **no es apagar el
/// filtro**, es de dónde salen las tarjetas: ahora las cuenta `tarjetasDeFilas` sobre las
/// filas que la grilla tiene visibles, así que no pueden desacordar por construcción. La
/// garantía se movió de sitio; no se perdió.
///
/// `floatingFilter` a la vista y no escondido en un menú: un filtro que hay que descubrir es
/// un filtro que no se usa, y éstos reemplazaron a seis desplegables que estaban siempre
/// visibles.
export const COL_DEF_POR_DEFECTO: ColDef<FilaAnalisis> = {
  sortable: true,
  resizable: true,
  filter: true,
  floatingFilter: true,
  suppressHeaderMenuButton: false,
  minWidth: 44,
};

/// Lo que la página deja libre para la grilla en una ventana de 1280 px:
///
///     1280  ventana
///     − 15  barra de desplazamiento del navegador
///     − 244 barra lateral del SGSI (`--hf-sidebar-ancho`; plegada son 64 y entonces sobra)
///     − 64  relleno lateral de `main` (`px-8`)
///     − 40  relleno de la tarjeta que la contiene (`p-5`)
///     = 917
///
/// 1280 y no 1920 porque es el portátil corriente. Afinar los anchos contra una pantalla ancha
/// es cómo se coló el defecto que esto ataja: en 1920 se veía perfecto.
///
/// **ESTA CONSTANTE SE EQUIVOCÓ UNA VEZ Y CONVIENE SABER CÓMO.** Valía 1161 porque la fórmula
/// olvidaba la barra lateral, y había una prueba que «verificaba la aritmética» — con el mismo
/// término faltante. Un guardián sobre una fórmula incompleta no protege: la consagra. El
/// desborde siguió ahí, en 166 px, hasta que alguien lo midió en un navegador.
///
/// Por eso **la medición manda y esta constante no**: `e2e/analisis-riesgos.spec.ts` (paso 5b)
/// mide el contenedor de verdad, que además sigue a la barra lateral cuando se pliega. Esto es
/// sólo un piso conservador para poder fallar barato antes de llegar allá.
export const PRESUPUESTO_ANCHO_1280 = 917;

/// El ancho por debajo del cual la grilla NO puede encogerse, que es lo que de verdad decide
/// si aparece la barra horizontal.
///
/// `flex` reparte el SOBRANTE; no baja de los mínimos. Una grilla «toda flexible» con mínimos
/// generosos desborda exactamente igual que una de anchos fijos — sólo que no se nota hasta
/// que alguien la abre en una pantalla más angosta que la de quien la hizo.
export function anchoMinimoDeLaGrilla(
  columnas: readonly (ColDef<FilaAnalisis> | ColGroupDef<FilaAnalisis>)[],
): number {
  const sumar = (cols: readonly (ColDef<FilaAnalisis> | ColGroupDef<FilaAnalisis>)[]): number =>
    cols.reduce((total, c) => {
      if ('children' in c) return total + sumar(c.children as ColDef<FilaAnalisis>[]);
      const col = c as ColDef<FilaAnalisis>;
      // Una columna escondida no ocupa ancho. Sin esto, esconder columnas para que quepan no
      // serviría de nada: el piso seguiría igual.
      if (col.hide === true) return total;
      // Una columna con `flex` no puede bajar de su `minWidth`; una sin `flex` vale su `width`.
      const suyo = col.flex === undefined ? col.width : col.minWidth;
      return total + (suyo ?? COL_DEF_POR_DEFECTO.minWidth ?? 0);
    }, 0);
  return sumar(columnas);
}

type Renderizadores = Partial<Record<IdColumnaAnalisis, ColDef<FilaAnalisis>['cellRenderer']>>;

export interface OpcionesColumnas {
  /// `criticidad.codigo → rtoMinutos`. La columna «Criticidad» ordena por el RTO que el
  /// código representa, no por el código: es el criterio de §11.
  rtoPorCriticidad: MapaRtoPorCriticidad;
  /// Los `cellRenderer` de React, por columna. Vacío en las pruebas: lo que se prueba acá es
  /// la definición, no el pintado.
  renderers?: Renderizadores;
}

/// Las trece columnas, en el orden de fábrica.
///
/// Es la misma lista que la `<table>` mostraba y en el mismo orden: primero qué activo es
/// (código, nombre), después cuánto pesa (valor y sus tres dimensiones, criticidad), después
/// quién responde por él (proceso, propietario), y al final cómo va su riesgo (amenazas,
/// inherente, residual, plan). La grilla cambia quién controla la vista, no qué se muestra.
///
/// LOS ANCHOS SON `flex`, NO PÍXELES, salvo «Código». Con trece columnas en anchos fijos la
/// grilla siempre terminaba más ancha que la pantalla y aparecía la barra horizontal, que es
/// justo lo que se pidió quitar. Con `flex` el reparto suma el ancho disponible y no sobra
/// nada; `minWidth` evita que las angostas se aplasten hasta ser ilegibles, y si la ventana
/// es tan estrecha que ni los mínimos caben, la barra vuelve — que es lo correcto, porque
/// entonces la alternativa sería texto ilegible.
export function columnasAnalisis(
  opciones: OpcionesColumnas,
): (ColDef<FilaAnalisis> | ColGroupDef<FilaAnalisis>)[] {
  const { rtoPorCriticidad, renderers = {} } = opciones;
  const r = (id: IdColumnaAnalisis) => renderers[id];

  return [
    {
      colId: 'codigo',
      field: 'codigo',
      headerName: 'Código',
      // Fijada porque es la que identifica el renglón: con trece columnas y desplazamiento
      // horizontal, perder de vista cuál activo se está leyendo es perder la fila entera.
      pinned: 'left',
      width: 110,
      filter: 'agTextColumnFilter',
      cellRenderer: r('codigo'),
    },
    {
      colId: 'nombre',
      field: 'nombre',
      headerName: 'Nombre',
      flex: 3,
      minWidth: 100,
      filter: 'agTextColumnFilter',
      cellRenderer: r('nombre'),
    },
    {
      colId: 'plan',
      field: 'estadoPlan',
      headerName: 'Plan',
      width: 96,
      filter: 'agTextColumnFilter',
      valueFormatter: (p: { value?: EstadoPlanActivo }) =>
        p.value === undefined ? '' : textoDeEstadoPlan(p.value),
      cellRenderer: r('plan'),
    },
    {
      groupId: ID_GRUPO_DIMENSIONES,
      headerName: 'Valor por dimensión',
      // El encabezado agrupado es lo que la `<table>` no podía decir: que D, I y C son el
      // desglose del valor y no tres columnas sueltas más.
      // C · I · D acá, aunque `DIMENSIONES` siga en el orden D · I · C de MAGERIT y del
      // catálogo. El modelo no cambia; cambia cómo esta pantalla las presenta, que lo pidió
      // quien la usa. Se invierte en la presentación y no en la constante para que las otras
      // cuatro pantallas sigan coincidiendo entre sí.
      children: [...DIMENSIONES].reverse().map((d) => ({
        colId: d.codigo,
        headerName: d.codigo,
        // La columna sólo tiene ancho para la letra; el nombre completo es lo que un lector
        // de pantalla anuncia y lo que el `aria-label` de la `<table>` sostenía.
        headerTooltip: d.nombre,
        width: 44,
        filter: 'agNumberColumnFilter',
        // Cuarenta y cuatro píxeles no dan para una casilla de filtro: el filtro sigue
        // disponible en el menú del encabezado, que es donde cabe.
        floatingFilter: false,
        valueGetter: (p: { data?: FilaAnalisis }) =>
          p.data?.valores[d.codigo as 'D' | 'I' | 'C'] ?? null,
        cellRenderer: r(d.codigo as IdColumnaAnalisis),
      })),
    },
    {
      colId: 'valor',
      field: 'valor',
      headerName: 'Valor',
      headerTooltip: 'Valor del activo: max(D, I, C)',
      width: 56,
      filter: 'agNumberColumnFilter',
      cellRenderer: r('valor'),
    },
    {
      colId: 'criticidad',
      field: 'criticidad',
      headerName: 'Criticidad',
      headerTooltip:
        'La declara el negocio en FOR-SIG-12 columna 26; no se deriva del residual. Ordena por RTO, no por código.',
      width: 128,
      filter: 'agTextColumnFilter',
      // NO ordena por el código. Ordena por el RTO que el código representa (§11), llamando a
      // la MISMA función que usa el selector de orden de la pantalla. Un segundo comparador
      // acá sería la forma exacta de que la columna y el selector se separaran.
      comparator: (
        _a: unknown,
        _b: unknown,
        nodoA: { data?: FilaAnalisis },
        nodoB: { data?: FilaAnalisis },
      ) => {
        if (!nodoA.data || !nodoB.data) return 0;
        return compararPorCriticidad(nodoA.data, nodoB.data, rtoPorCriticidad);
      },
      cellRenderer: r('criticidad'),
    },
    {
      colId: 'proceso',
      field: 'proceso',
      headerName: 'Proceso',
      flex: 2,
      minWidth: 84,
      filter: 'agTextColumnFilter',
      cellRenderer: r('proceso'),
    },
    {
      colId: 'propietario',
      field: 'propietario',
      headerName: 'Propietario',
      flex: 2,
      minWidth: 84,
      filter: 'agTextColumnFilter',
      valueFormatter: (p: { value?: string | null }) => p.value ?? '—',
      cellRenderer: r('propietario'),
    },
    {
      colId: 'cantidadAmenazas',
      field: 'cantidadAmenazas',
      headerName: 'Amenazas',
      type: 'numericColumn',
      width: 72,
      floatingFilter: false,
      // Escondida de fábrica: es un conteo, no algo sobre lo que se actúe. Se enciende
      // desde «Columnas» — ver el porqué en `PRESUPUESTO_ANCHO_1280`.
      hide: true,
      filter: 'agNumberColumnFilter',
      cellRenderer: r('cantidadAmenazas'),
    },
    {
      colId: 'peorInherente',
      field: 'peorInherente',
      headerName: 'Peor inherente',
      width: 100,
      // Escondida de fábrica: es el riesgo ANTES de los controles, y lo que se mira para
      // decidir es el residual. Se enciende desde «Columnas».
      hide: true,
      filter: 'agTextColumnFilter',
      comparator: compararNivel,
      valueFormatter: (p: { value?: NivelRiesgo | null }) => textoDeNivel(p.value ?? null),
      cellRenderer: r('peorInherente'),
    },
    {
      colId: 'peorResidual',
      field: 'peorResidual',
      headerName: 'Peor residual',
      width: 88,
      filter: 'agTextColumnFilter',
      comparator: compararNivel,
      valueFormatter: (p: { value?: NivelRiesgo | null }) => textoDeNivel(p.value ?? null),
      cellRenderer: r('peorResidual'),
    },
  ];
}

// ── El tooltip de la columna «Criticidad» ───────────────────────────────────────────────
//
// La celda mostraba el nombre del catálogo y, al pasar el cursor, su descripción. Eso contesta
// «qué es C3» y deja sin contestar lo que la columna significa en ESTA pantalla: **cuánto
// exige**.
//
// La criticidad es un compromiso de TIEMPO —RTO y RPO— así que gobierna la DISPONIBILIDAD
// (REQ-SIG-23 §3.1), y su consecuencia visible es el nivel que le pide al control PRINCIPAL de
// las amenazas que degradan D. Ese número no está en el catálogo de criticidades: vive en
// `EXIGENCIA_POR_CRITICIDAD`, en `lib/sgsi/exigencia.ts`. Sin él, quien mira la columna ve una
// etiqueta y no ve por qué ese activo tiene brecha y el de al lado no.
//
// **No se duplica la tabla acá.** Se lee de su único dueño, por la misma razón por la que
// `BANDAS_ALARMANTES` dejó de estar dos veces: dos copias que se separan es cómo dos pantallas
// terminan diciendo cosas distintas del mismo activo.
//
// C1 merece frase propia. No pide un número mayor que C2 —los dos piden 90— sino **el mismo
// verificado**, y esa es justamente la distinción que un tooltip que sólo dijera «90 %» haría
// invisible.
export function tooltipDeCriticidad(
  codigo: string | null,
  catalogo: { nombre: string; descripcion: string | null } | undefined,
  rtoMinutos: number | null,
): string {
  if (codigo === null) {
    return 'Sin clasificar: el negocio no ha declarado el compromiso de servicio de este activo, así que no exige nada por esta vía. Su valoración de Disponibilidad puede seguir exigiendo por la suya.';
  }

  const nombre = catalogo?.nombre ?? codigo;
  const partes: string[] = [`${nombre} (${codigo})`];

  if (rtoMinutos !== null) partes.push(`RTO ${textoDeRto(rtoMinutos)}`);

  const exige = EXIGENCIA_POR_CRITICIDAD[codigo] ?? null;
  if (exige === null) {
    partes.push(
      'no exige un nivel mínimo por criticidad; la valoración de Disponibilidad puede seguir exigiendo por la suya',
    );
  } else {
    // Se dice el NIVEL EXIGIDO, que es el número que la columna está señalando cuando el
    // renglón se pinta: la brecha es exactamente lo que le falta al control principal para
    // llegar aquí. No es una meta a la que se aspira — es el minimo que esta criticidad pide.
    partes.push(
      `los controles principales de las amenazas que degradan Disponibilidad deben estar en ${exige} % de eficacia`,
    );
    if (REQUIERE_VERIFICACION.includes(codigo)) {
      // C1 no pide un número mayor que C2: pide el mismo VERIFICADO (REQ-SIG-23 §6.1). Un
      // tooltip que dijera sólo «90 %» haría invisible justamente lo que las distingue.
      partes.push('y además debe tener una verificación de eficacia vigente');
    }
  }

  if (catalogo?.descripcion) partes.push(catalogo.descripcion);
  return partes.join(' · ');
}

/// Minutos a una unidad que una persona lea sin dividir. El RTO es un compromiso que se dice
/// en voz alta —«diez minutos», «cuatro horas»—, no un número de minutos que alguien convierta.
function textoDeRto(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 1440) return `${Math.round(minutos / 60)} h`;
  return `${Math.round(minutos / 1440)} d`;
}

// ── Los rótulos de la celda «Plan» ──────────────────────────────────────────────────────
//
// El texto visible es «Planes de T.» en los tres estados (22/09/2026, a pedido de quien usa
// la pantalla). Antes decía «Crear Plan» o «Ver Plan», y esa diferencia era el portador
// textual que permitía leer la celda sin depender del color.
//
// **Al unificar el texto, la distinción se muda al nombre accesible y al título.** No
// desaparece: cambia de canal. Un lector de pantalla anuncia el `aria-label`, no el texto
// visible, así que quien navega sin ver sigue oyendo si ese activo ya tiene planes o no. Y al
// posar el cursor, el título dice además POR QUÉ es obligatorio u opcional.
//
// Vive acá y no en el componente por la razón de siempre: es una decisión sobre qué decir, y
// las decisiones se prueban. Un rótulo dentro del JSX es un rótulo que nadie vuelve a mirar.
export function accesiblePlan(
  codigo: string,
  estadoPlan: EstadoPlanActivo,
): { texto: string; aria: string; titulo: string } {
  const texto = 'Planes de T.';

  if (estadoPlan === 'con-plan') {
    return {
      texto,
      aria: `Ver los planes de tratamiento de ${codigo}`,
      titulo: `${codigo} ya tiene al menos un plan que cubre su brecha`,
    };
  }

  if (estadoPlan === 'pendiente') {
    return {
      texto,
      aria: `Crear un plan de tratamiento para ${codigo}`,
      titulo: `${codigo} tiene una brecha sin plan que la cubra`,
    };
  }

  // `no-requiere` y `sin-determinar`. «No requiere» significa que sus controles alcanzan lo
  // exigido HOY, no que nadie pueda decidir mejorarlos: el botón sigue disponible y lo que
  // cambia es el énfasis, no el acceso.
  return {
    texto,
    aria: `Crear un plan de tratamiento preventivo para ${codigo}`,
    titulo: `${codigo} no lo requiere hoy; crear un plan preventivo es una decisión válida`,
  };
}
