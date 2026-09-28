'use client';

// app/components/sgsi/valoracion-riesgos/GrillaAnalisis.tsx
//
// La lista de «Análisis de riesgos», con AG Grid Community (MIT).
//
// ESTE COMPONENTE NO DECIDE NADA. Qué columnas hay, en qué orden, cómo ordenan y qué clase
// lleva cada fila vive en `lib/sgsi/columnas-analisis.ts`, que es puro y está probado sin
// renderizar. Acá sólo quedan los `cellRenderer` —que son React y no pueden vivir allá— y el
// cableado con la grilla. Si algo de esto empieza a tomar decisiones, va al módulo puro.
//
// POR QUÉ ESA SEPARACIÓN: la documentación de AG Grid desaconseja jsdom, y la suite de este
// repo es jsdom. Ver la cabecera de `columnas-analisis.ts`.
//
// LA GRILLA FILTRA, y avisa qué filas quedan visibles (`onFilasVisibles`). Las tarjetas se
// cuentan sobre ESAS filas y no sobre los filtros, así que no pueden contradecir a la lista.
// Es la mitad que hace seguro haber encendido el filtro; ver `COL_DEF_POR_DEFECTO`.
//
// `autoHeight`: la grilla crece con sus filas y no tiene barra vertical propia. Con decenas
// de filas es lo correcto —una lista que se lee de corrido—, y de paso la página tiene un
// solo desplazamiento en vez de dos anidados. Lo que cuesta: el encabezado ya no queda
// pegado, y la virtualización de filas se apaga. El día que esta grilla reciba cientos de
// filas, esto es lo primero que hay que revisar.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type ColumnState,
  type GridApi,
  type GridReadyEvent,
} from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import FranjaDeRiesgo from './FranjaDeRiesgo';
import { armarFilasArbol, esFilaDeRiesgo, type FilaArbol } from '@/lib/sgsi/arbol-analisis';
import {
  CLAVE_ESTADO_COLUMNAS,
  COL_DEF_POR_DEFECTO,
  claseDeFila,
  columnasAnalisis,
  disposicionAplicable,
  ordenDeFabrica,
  type DisposicionGuardada,
  type IdColumnaAnalisis,
  accesiblePlan,
} from '@/lib/sgsi/columnas-analisis';
import type { EstadoPlanActivo, FilaAnalisis, MapaRtoPorCriticidad } from '@/lib/sgsi/analisis-riesgos';
import { colorDeNivel, type NivelRiesgo } from '@/lib/sgsi/riesgo-activo';
import { colorDeNivelValor } from '@/lib/sgsi/valoracion-figura';
import { PuntoSinPlan } from '@/app/components/sgsi/planes/FranjaSinPlan';

const MODULOS = [AllCommunityModule];

/// El tema sale de los tokens `--hf-*`, no de los CSS heredados de AG Grid.
///
/// Importar `ag-theme-quartz.css` metería un segundo sistema de color peleando con el que la
/// aplicación ya tiene, y la grilla terminaría pareciéndose a AG Grid en vez de parecerse al
/// SGSI. La Theming API acepta valores CSS, así que las variables se pasan tal cual y el tema
/// sigue al tema de la aplicación sin una segunda tabla de colores que mantener.
const TEMA_SGSI = themeQuartz.withParams({
  backgroundColor: 'var(--hf-bg-surface)',
  foregroundColor: 'var(--hf-text-secondary)',
  borderColor: 'var(--hf-hairline-strong)',
  headerBackgroundColor: 'var(--hf-bg-subtle)',
  headerTextColor: 'var(--hf-text-muted)',
  rowHoverColor: 'var(--hf-bg-subtle)',
  selectedRowBackgroundColor: 'transparent',
  fontFamily: 'var(--font-sans)',
  fontSize: '12.5px',
  headerFontSize: '10px',
  headerFontWeight: 700,
  rowHeight: 34,
  headerHeight: 32,
  cellHorizontalPadding: 8,
  wrapperBorder: false,
  borderRadius: 0,
});

/// Lo que la grilla sabe hacer y la pantalla ofrece. Cada una necesita su API, así que nacen
/// acá; dónde se muestran es decisión de quien la monta.
export interface AccionesGrilla {
  exportarExcel: () => void;
  exportarCsv: () => void;
  limpiarFiltros: () => void;
  restablecer: () => void;
  columnas: ColumnaVisible[];
  releerColumnas: () => void;
  alternarColumna: (colId: string, visible: boolean) => void;
}

export interface ColumnaVisible {
  colId: string;
  nombre: string;
  visible: boolean;
}

export interface GrillaAnalisisProps {
  /// Ya filtradas y ya ordenadas por quien las monta. La grilla no recorta.
  filas: FilaAnalisis[];
  rtoPorCriticidad: MapaRtoPorCriticidad;
  /// Los códigos con deuda de plan, para el punto ámbar del renglón.
  sinPlanCodigos: Set<string>;
  /// El destino del código: el overlay de Amenazas, con los filtros vigentes en la URL.
  hrefDeFila: (codigo: string) => string;
  onRegistrarPlan: (codigo: string) => void;
  /// Se avisa cuando el lector ordena por una columna, para que el rótulo de arriba deje de
  /// afirmar un criterio que ya no rige y diga «orden personalizado».
  onOrdenPersonalizado: (personalizado: boolean) => void;
  /// `codigo → nombre` de las criticidades. La celda muestra «Importante» en vez de `C3`; la
  /// FILA sigue llevando sólo el código, que es el contrato con el negocio.
  criticidades: { codigo: string; nombre: string; descripcion: string | null }[];
  /// Las acciones de la grilla, entregadas a quien la monta para que las ponga donde quiera.
  ///
  /// Viven acá porque necesitan la API de la grilla, y se muestran arriba, en la franja del
  /// encabezado de la página: la lista se lee mejor sin una segunda barra de controles pegada
  /// encima. Es el mismo motivo por el que el título «Activos en análisis» se retiró.
  onAcciones: (acciones: AccionesGrilla | null) => void;
  /// Las filas que quedaron visibles tras filtrar. Las tarjetas se cuentan sobre esto: es lo
  /// que impide que digan un número distinto del que la lista muestra.
  onFilasVisibles: (filas: FilaAnalisis[]) => void;
}

export default function GrillaAnalisis({
  filas,
  rtoPorCriticidad,
  sinPlanCodigos,
  hrefDeFila,
  onRegistrarPlan,
  onOrdenPersonalizado,
  onFilasVisibles,
  criticidades,
  onAcciones,
}: GrillaAnalisisProps) {
  const api = useRef<GridApi<FilaArbol> | null>(null);
  const [listo, setListo] = useState(false);

  // Los renderizadores se rehacen cuando cambia lo que leen. `onRegistrarPlan` y `hrefDeFila`
  // vienen del padre: si no estuvieran en las dependencias, el botón de una fila seguiría
  // llamando a la versión vieja después de un cambio de filtros.
  const nombreDeCriticidad = useMemo(
    () => new Map(criticidades.map((c) => [c.codigo, c])),
    [criticidades],
  );

  // ── El árbol por activo ───────────────────────────────────────────────────────────────
  //
  // A MANO, PORQUE NO HAY OTRA. De los 67 módulos de `ag-grid-community` ninguno es de
  // agrupación ni de árbol: Row Grouping, Tree Data y Master/Detail son de AG Grid Enterprise,
  // 999 USD por desarrollador. `isFullWidthRow` sí está en Community, y con eso alcanza.
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(() => new Set());

  const alternar = useCallback((codigo: string) => {
    setExpandidos((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(codigo)) siguiente.delete(codigo);
      else siguiente.add(codigo);
      return siguiente;
    });
  }, []);

  const filasDelArbol = useMemo(
    () => armarFilasArbol(filas, new Map(filas.map((f) => [f.codigo, f.riesgos])), expandidos),
    [filas, expandidos],
  );

  // EL ÁRBOL SE COLAPSA AL ORDENAR O FILTRAR, Y ES DELIBERADO.
  //
  // AG Grid ordena y filtra sobre la lista PLANA: no sabe que estas filas son hijas de nadie.
  // Lo único que sostiene la relación es que el hijo viene detrás de su padre, así que en el
  // instante en que alguien ordena por «Peor residual» los hijos se reubican solos y quedan
  // bajo un activo que no es el suyo — sin que nada falle y sin que nadie se entere.
  //
  // Colapsar es visible y predecible. La alternativa —que cada hijo cargara las claves de
  // orden de su padre para viajar pegado— se descartó en el diseño: cualquier columna nueva
  // rompería la correspondencia EN SILENCIO, que es la peor propiedad posible.
  const colapsarArbol = useCallback(() => {
    setExpandidos((previos) => (previos.size === 0 ? previos : new Set()));
  }, []);

  const renderers = useMemo(
    () =>
      construirRenderers({
        sinPlanCodigos,
        hrefDeFila,
        onRegistrarPlan,
        nombreDeCriticidad,
        expandidos,
        alternar,
      }),
    [sinPlanCodigos, hrefDeFila, onRegistrarPlan, nombreDeCriticidad, expandidos, alternar],
  );

  const columnDefs = useMemo(
    () => columnasAnalisis({ rtoPorCriticidad, renderers }),
    [rtoPorCriticidad, renderers],
  );


  const guardarDisposicion = useCallback(() => {
    if (api.current === null) return;
    try {
      // Se guarda el orden de FÁBRICA junto al estado: es lo que permite descartar la
      // disposición sola el día que ese orden cambie, sin depender de que alguien suba una
      // versión a mano. Ver `disposicionAplicable`.
      const disposicion: DisposicionGuardada = {
        version: CLAVE_ESTADO_COLUMNAS,
        fabrica: ordenDeFabrica(columnDefs),
        estado: api.current.getColumnState(),
      };
      window.localStorage.setItem(CLAVE_ESTADO_COLUMNAS, JSON.stringify(disposicion));
    } catch {
      // Modo privado, almacenamiento lleno o bloqueado. La disposición es una comodidad: que
      // no se pueda guardar no puede tumbar la pantalla.
    }
  }, [columnDefs]);

  const alEstarLista = useCallback((evento: GridReadyEvent<FilaArbol>) => {
    api.current = evento.api;
    setListo(true);
    try {
      const guardado = window.localStorage.getItem(CLAVE_ESTADO_COLUMNAS);
      if (guardado === null) return;
      // Una disposición que ya no cuadra —porque cambió el orden de fábrica, o las columnas, o
      // porque llegó corrupta— se ignora y se usa la de fábrica. No se intenta rescatar a
      // medias: media disposición es peor que ninguna, porque nadie sabe cuál mitad está
      // viendo. Y una disposición vieja que esconde un cambio es peor todavía: el reporte que
      // llega es «el cambio no se aplicó».
      const estado = disposicionAplicable(JSON.parse(guardado), ordenDeFabrica(columnDefs));
      if (estado === null) return;
      evento.api.applyColumnState({ state: estado as ColumnState[], applyOrder: true });
    } catch {
      // Ídem: JSON corrupto o almacenamiento inaccesible caen acá y la grilla arranca de
      // fábrica, que es un estado correcto.
    }
  }, [columnDefs]);

  const alCambiarOrden = useCallback(() => {
    if (api.current === null) return;
    onOrdenPersonalizado(api.current.getColumnState().some((c) => c.sort != null));
  }, [onOrdenPersonalizado]);

  const restablecer = useCallback(() => {
    if (api.current === null) return;
    api.current.resetColumnState();
    try {
      window.localStorage.removeItem(CLAVE_ESTADO_COLUMNAS);
    } catch {
      // Ver `guardarDisposicion`.
    }
    onOrdenPersonalizado(false);
  }, [onOrdenPersonalizado]);

  /// Los códigos que la grilla tiene visibles, en el orden en que se ven.
  ///
  /// SÓLO ACTIVOS, Y ES LA CICATRIZ DEL `rowCount` OTRA VEZ. Con el árbol expandido, la lista
  /// de nodos de AG Grid trae también las franjas de riesgo: contarlas haría que el Excel
  /// pidiera «53 códigos» cuando hay 30 activos, y que la pantalla dijera «53 activos». Es el
  /// mismo defecto que abre `HARNESS.md` —un número que se infla porque dos piezas cuentan
  /// cosas distintas— y acá lo atrapó el compilador al retipar la grilla, no una prueba.
  const codigosVisibles = useCallback((): string[] => {
    const codigos: string[] = [];
    api.current?.forEachNodeAfterFilterAndSort((n) => {
      if (n.data !== undefined && n.data.tipo === 'activo') codigos.push(n.data.codigo);
    });
    return codigos;
  }, []);

  /// Las filas visibles se recalculan cuando el filtro cambia, cuando llegan datos nuevos y
  /// cuando se ordena. El orden importa porque el Excel respeta el que se esté viendo.
  const avisarVisibles = useCallback(() => {
    if (api.current === null) return;
    const visibles: FilaAnalisis[] = [];
    api.current.forEachNodeAfterFilterAndSort((n) => {
      // Las franjas de riesgo no son filas del análisis: quien cuenta «30 activos» cuenta
      // activos. Ver la nota de `codigosVisibles`.
      if (n.data !== undefined && n.data.tipo === 'activo') visibles.push(n.data);
    });
    onFilasVisibles(visibles);
  }, [onFilasVisibles]);

  /// Excel CON ESTILOS, que en AG Grid es función de Enterprise (999 USD por desarrollador).
  /// No hizo falta pagarla: `exceljs` ya es dependencia y ya genera los otros libros del
  /// SGSI, así que el archivo se arma en el servidor —`/api/sgsi/exportar-analisis`— con los
  /// MISMOS colores de banda que la pantalla, cosa que el export de la librería no sabría.
  ///
  /// Viajan los códigos y no los datos: las cifras se vuelven a derivar en el servidor. Una
  /// pestaña abierta desde ayer exportaría si no las cifras de ayer, diciendo que son de hoy.
  const exportarExcel = useCallback(() => {
    const codigos = codigosVisibles();
    const consulta = codigos.length === 0 ? '' : `?codigos=${encodeURIComponent(codigos.join(','))}`;
    // Un ancla con `download` y no `window.location.href`: esto es una DESCARGA, no una
    // navegación. Asignar `location` haría que el navegador tratara la respuesta como si
    // fuera a reemplazar la página —y de paso dispara la regla de ESLint que pide
    // `useRouter().push()`, que es para páginas y no para archivos—.
    const enlace = document.createElement('a');
    enlace.href = `/api/sgsi/exportar-analisis${consulta}`;
    enlace.download = '';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  }, [codigosVisibles]);

  const exportarCsv = useCallback(() => {
    api.current?.exportDataAsCsv({
      fileName: `analisis-de-riesgos-${new Date().toISOString().slice(0, 10)}.csv`,
    });
  }, []);

  const limpiarFiltros = useCallback(() => {
    api.current?.setFilterModel(null);
  }, []);

  // EL SELECTOR DE COLUMNAS, y por qué hay que escribirlo a mano.
  //
  // Dos columnas arrancan escondidas para que las trece quepan sin barra horizontal en un
  // portátil. Esconder algo que no se puede recuperar sería borrarlo — y el panel lateral que
  // AG Grid trae para esto es Enterprise. Así que va un desplegable propio: son treinta líneas
  // y evitan que «esconder» signifique «perder».
  const [visibilidad, setVisibilidad] = useState<ColumnaVisible[]>([]);

  const releerVisibilidad = useCallback(() => {
    if (api.current === null) return;
    setVisibilidad(
      api.current
        .getColumnDefs()
        ?.flatMap((c) => ('children' in c ? (c.children as ColDef<FilaAnalisis>[]) : [c as ColDef<FilaAnalisis>]))
        .filter((c): c is ColDef<FilaAnalisis> & { colId: string } => typeof c.colId === 'string')
        .map((c) => ({
          colId: c.colId,
          // El nombre completo cuando lo hay —`D` se lista como «Disponibilidad»—, porque en
          // una lista de casillas la letra sola no dice nada. `headerTooltip` puede no ser
          // texto en el tipo de AG Grid, así que se comprueba antes de usarlo.
          nombre:
            typeof c.headerTooltip === 'string' ? c.headerTooltip : (c.headerName ?? c.colId),
          visible: api.current?.getColumn(c.colId)?.isVisible() ?? true,
        })) ?? [],
    );
  }, []);

  const alternarColumna = useCallback(
    (colId: string, visible: boolean) => {
      api.current?.setColumnsVisible([colId], visible);
      guardarDisposicion();
      releerVisibilidad();
    },
    [guardarDisposicion, releerVisibilidad],
  );

  // El padre reordena `filas` cuando cambia el selector de orden. Si la grilla tenía un orden
  // por columna puesto, ese orden ganaría y el selector no haría nada visible: se limpia,
  // que es lo que el rótulo va a decir.
  useEffect(() => {
    if (api.current === null) return;
    api.current.applyColumnState({ defaultState: { sort: null } });
    onOrdenPersonalizado(false);
    // `filas` es la dependencia real: el efecto existe para reaccionar a que el padre la
    // cambió de orden, no a que cambiara la función.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas]);

  // Las acciones se publican hacia arriba en cuanto la grilla está lista, y se retiran al
  // desmontarse: si no, la pantalla seguiría mostrando botones que llaman a una grilla que ya
  // no existe.
  useEffect(() => {
    if (!listo) return;
    onAcciones({
      exportarExcel,
      exportarCsv,
      limpiarFiltros,
      restablecer,
      columnas: visibilidad,
      releerColumnas: releerVisibilidad,
      alternarColumna,
    });
    return () => onAcciones(null);
  }, [
    listo,
    exportarExcel,
    exportarCsv,
    limpiarFiltros,
    restablecer,
    visibilidad,
    releerVisibilidad,
    alternarColumna,
    onAcciones,
  ]);

  return (
    <div>
      {/* Sin altura fija: `autoHeight` crece con las filas y la página tiene un solo
          desplazamiento en vez de dos anidados. Ver la cabecera del archivo. */}
      <div style={{ width: '100%' }}>
        <AgGridProvider modules={MODULOS}>
          <AgGridReact<FilaArbol>
            theme={TEMA_SGSI}
            domLayout="autoHeight"
            rowData={filasDelArbol}
            // LAS COLUMNAS NUNCA VEN UNA FILA DE RIESGO, y por eso esta conversión es sana:
            // `isFullWidthRow` saca esas filas del camino de las celdas —las pinta
            // `FranjaDeRiesgo` de ancho completo— así que todo `ColDef` sólo recibe activos.
            // Tipar las columnas contra la unión obligaría a que cada `valueGetter` comprobara
            // un caso que no puede ocurrir, y ese ruido es peor que esta línea explicada.
            columnDefs={columnDefs as unknown as ColDef<FilaArbol>[]}
            defaultColDef={COL_DEF_POR_DEFECTO as unknown as ColDef<FilaArbol>}
            // La franja de riesgo no tiene código propio: se identifica por su padre y su
            // amenaza. Un id repetido haría que AG Grid reutilizara el nodo de otra fila.
            getRowId={(p) => {
              if (p.data.tipo === 'activo') return p.data.codigo;
              // La cabecera y los riesgos comparten padre: sin el discriminante, la cabecera
              // de «alarmantes» y la de «continuidad» del mismo activo chocarian de id.
              if (p.data.tipo === 'grupo') return `${p.data.padre}#${p.data.grupo}`;
              return `${p.data.padre}·${p.data.amenazaCodigo}`;
            }}
            getRowClass={(p) =>
              p.data === undefined || p.data.tipo !== 'activo'
                ? 'fila-riesgo-hija'
                : claseDeFila(p.data)
            }
            isFullWidthRow={(p) => esFilaDeRiesgo(p.rowNode.data)}
            fullWidthCellRenderer={FranjaDeRiesgo}
            onGridReady={alEstarLista}
            onFirstDataRendered={avisarVisibles}
            onFilterChanged={() => {
              colapsarArbol();
              avisarVisibles();
            }}
            onSortChanged={() => {
              colapsarArbol();
              alCambiarOrden();
              avisarVisibles();
            }}
            onRowDataUpdated={avisarVisibles}
            onColumnMoved={guardarDisposicion}
            onColumnResized={guardarDisposicion}
            onColumnVisible={guardarDisposicion}
            onColumnPinned={guardarDisposicion}
            suppressCellFocus
            // Sin paginación: son decenas de filas y la lista se lee de corrido, que es como
            // se usa. Paginar obligaría a cambiar de página para responder «cuántos hay».
            suppressMovableColumns={false}
          />
        </AgGridProvider>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————————————
// Los renderizadores. Son los MISMOS nodos que la `<table>` pintaba, movidos tal cual: el
// cambio es quién los coloca, no cómo se ven.
// ————————————————————————————————————————————————————————————————————————

interface ParametrosCelda {
  data?: FilaAnalisis;
  value?: unknown;
}

/// Exportada para probar la celda «Plan» sin montar la grilla: AG Grid no rinde filas en
/// jsdom, y esa celda SÍ decide algo —qué ofrece según lo que el activo tiene—. Ver
/// `__tests__/GrillaAnalisis.test.tsx`. El resto de los renderizadores no deciden nada.
export function construirRenderers(ctx: {
  sinPlanCodigos: Set<string>;
  hrefDeFila: (codigo: string) => string;
  onRegistrarPlan: (codigo: string) => void;
  nombreDeCriticidad: Map<string, { nombre: string; descripcion: string | null }>;
  /// Qué activos están expandidos, y cómo alternarlos. Viajan hasta el renderizador porque el
  /// expansor vive dentro de la celda «Código»: es la columna fijada, la única que no se pierde
  /// al desplazarse en horizontal, y abrir un activo cuyo código no se ve no significa nada.
  expandidos: ReadonlySet<string>;
  alternar: (codigo: string) => void;
}): Partial<Record<IdColumnaAnalisis, (p: ParametrosCelda) => React.ReactNode>> {
  // Función con nombre y no una flecha anónima: AG Grid la monta como componente, y un
  // componente sin nombre aparece como «Anonymous» en las herramientas de React —además de
  // que la regla `react/display-name` lo rechaza, con razón.
  const dimension = (codigo: 'D' | 'I' | 'C', nombre: string) => {
    function CeldaDimension(p: ParametrosCelda) {
      if (p.data === undefined) return null;
      const v = p.data.valores[codigo];
      return (
        <span
          aria-label={`${nombre} de ${p.data.codigo}`}
          title={`${nombre}: ${v}`}
          // Sin badge de color: el color es del AGREGADO, y repetirlo cuatro veces convierte
          // la fila en un semáforo ilegible. La que empata con el máximo va en negrita, que
          // es la pregunta real: «¿qué dimensión puso a este activo donde está?».
          className={`font-mono text-11_5 tabular-nums ${
            v === p.data.valor ? 'font-bold text-primary' : 'text-secondary'
          }`}
        >
          {v}
        </span>
      );
    }
    return CeldaDimension;
  };

  return {
    codigo: (p) => {
      if (p.data === undefined) return null;
      const codigo = p.data.codigo;
      const hijos = 'hijos' in p.data ? (p.data.hijos as number) : 0;
      const abierto = ctx.expandidos.has(codigo);
      return (
        <span className="inline-flex items-center gap-1.5">
          {/* EL CONTADOR DE RIESGOS SE FUE AL TÍTULO, y es una corrección a lo que yo mismo
              había escrito acá. Primero puse «▸23» visible con el argumento de que abrir es
              caro si no sabes cuántos hay. Medido en pantalla, no cabe: con el contador
              delante, la columna trunca el propio código —«COM-APP-000»— y la prueba del piso
              de ancho no deja ensanchar más sin provocar barra horizontal a 1280 px.
              Truncar el identificador del renglón es peor que un número que exige apuntar. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              ctx.alternar(codigo);
            }}
            disabled={hijos === 0}
            aria-expanded={abierto}
            title={
              hijos === 0
                ? 'Sin riesgos registrados'
                : `${hijos} ${hijos === 1 ? 'riesgo' : 'riesgos'}`
            }
            aria-label={
              hijos === 0
                ? `${codigo} no tiene riesgos registrados`
                : abierto
                  ? `Ocultar los ${hijos} riesgos de ${codigo}`
                  : `Ver los ${hijos} riesgos de ${codigo}`
            }
            className="flex-none rounded border border-border-default px-1 font-mono text-11 leading-[1.1] text-secondary transition-colors hover:border-accent-border hover:text-primary disabled:opacity-25"
          >
            {abierto ? '−' : '+'}
          </button>
          <Link
            href={ctx.hrefDeFila(codigo)}
            className="font-mono font-semibold text-brand-nav underline decoration-from-font underline-offset-2"
          >
            {codigo}
          </Link>
          {ctx.sinPlanCodigos.has(codigo) && <PuntoSinPlan />}
        </span>
      );
    },

    valor: (p) => {
      if (p.data === undefined) return null;
      return (
        <span
          aria-label={`Valor del activo ${p.data.codigo}`}
          title={`Valor del activo: max(D, I, C) = ${p.data.valor}`}
          className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[4px] px-1.5 font-mono text-11 font-semibold tabular-nums text-white"
          style={{ background: colorDeNivelValor(p.data.valor) }}
        >
          {p.data.valor}
        </span>
      );
    },

    D: dimension('D', 'Disponibilidad'),
    I: dimension('I', 'Integridad'),
    C: dimension('C', 'Confidencialidad'),

    // POR NOMBRE Y NO POR CÓDIGO: «Importante» dice algo, `C3` hay que saberlo. La descripción
    // larga del catálogo va en el título, que es donde cabe. El código queda de reserva por si
    // una criticidad no está en el catálogo que llegó — no se inventa un nombre.
    criticidad: (p) => {
      const codigo = p.data?.criticidad;
      if (codigo == null) return <span className="text-faint">sin clasificar</span>;
      const cat = ctx.nombreDeCriticidad.get(codigo);
      return (
        <span
          title={cat?.descripcion ?? `Criticidad ${codigo}`}
          className="inline-block rounded-badge border border-border-default bg-subtle px-2 py-0.5 text-11 font-semibold text-secondary-soft"
        >
          {cat?.nombre ?? codigo}
        </span>
      );
    },

    propietario: (p) => <span className="text-secondary">{p.data?.propietario ?? '—'}</span>,

    peorInherente: (p) => <CeldaBanda nivel={p.data?.peorInherente ?? null} />,
    peorResidual: (p) => <CeldaBanda nivel={p.data?.peorResidual ?? null} />,

    // LA CELDA PLAN, rehecha el 22/09/2026. Antes mostraba el estado —«pendiente» en ámbar,
    // «—», «✓ plan»— y al lado un botón «+ plan». Ahora muestra LA ACCIÓN, y el estado lo dicen
    // los DOS acentos del renglón: rojo cuando queda un residual en banda Alto o Crítico que
    // ningún plan cubre, ámbar cuando lo que falta es madurez de control. Ver `claseDeFila` en
    // `lib/sgsi/columnas-analisis.ts`; son dos preguntas distintas y no siempre coinciden.
    //
    // La acción se ofrece en TODAS las filas, incluidas las que no requieren plan: «no
    // requiere» significa que sus controles alcanzan lo exigido HOY, no que nadie pueda
    // decidir mejorarlos. Lo que cambia entre unas y otras es el ÉNFASIS, no la disponibilidad
    // — que es la distinción que se pidió: obligatorio en unas, opcional en otras.
    //
    // El texto visible es «Planes de T.» en los tres estados (22/09/2026, a pedido de quien
    // usa la pantalla). La distinción entre «ya hay plan» y «no hay ninguno» no desaparece:
    // se muda al nombre accesible y al título, que es lo que un lector de pantalla anuncia y
    // lo que aparece al posar el cursor. Los tres rótulos viven en `accesiblePlan`, probados.
    plan: (p) => {
      if (p.data === undefined) return null;
      const { codigo, estadoPlan, tienePlanes } = p.data;

      // LAS DOS PREGUNTAS, POR SEPARADO (22/09/2026). El enlace se ofrece si el activo TIENE
      // planes; el botón, si le FALTA alguno. Son independientes, y un activo puede estar en
      // las dos situaciones a la vez — entonces la celda dice las dos cosas, porque las dos
      // son ciertas.
      //
      // Antes el enlace dependía de `estadoPlan === 'con-plan'`, que es «hay brecha y está
      // cubierta»: un activo cuyos planes ya cerraron toda la brecha caía en `no-requiere` y
      // PERDÍA el enlace a los planes que lo lograron. Medido contra la base: `FIN-APP-0001`
      // (Siigo) y `PRO-APP-0002` (Cuantico Verify), ocho planes cada uno, ofrecían crear el
      // primero.
      const enlace = tienePlanes;
      const boton = !tienePlanes || estadoPlan === 'pendiente';
      const rotuloEnlace = accesiblePlan(codigo, estadoPlan, tienePlanes, 'enlace');
      const rotuloBoton = accesiblePlan(codigo, estadoPlan, tienePlanes, 'boton');
      const obligatorio = estadoPlan === 'pendiente';

      return (
        <span className="inline-flex items-center gap-1.5">
          {enlace && (
            <Link
              href="/sgsi/planes"
              title={rotuloEnlace.titulo}
              aria-label={rotuloEnlace.aria}
              className="text-11_5 font-semibold text-brand-nav underline decoration-from-font underline-offset-2"
            >
              {rotuloEnlace.texto}
            </Link>
          )}
          {boton && (
            <button
              onClick={() => ctx.onRegistrarPlan(codigo)}
              // El texto visible se repite en las treinta filas; sin esto, un lector de pantalla
              // anuncia treinta botones indistinguibles.
              aria-label={rotuloBoton.aria}
              title={rotuloBoton.titulo}
              className={
                obligatorio
                  ? 'rounded-campo border border-danger-border bg-surface px-1.5 py-0.5 text-11 font-bold text-danger hover:bg-subtle'
                  : 'rounded-campo border border-border-field px-1.5 py-0.5 text-11 font-medium text-faint hover:bg-subtle'
              }
            >
              {rotuloBoton.texto}
            </button>
          )}
          {/* «No se pudo evaluar» no es «no falta». Se dice, en vez de dejarlo pasar por
              opcional: un activo cuya brecha nadie midió no es un activo sin brecha. Y se dice
              tenga planes o no: lo que no se sabe es si alcanzan. */}
          {estadoPlan === 'sin-determinar' && (
            <span className="text-10_5 text-faint" title="Sin control principal designado (REQ-SIG-21)">
              sin evaluar
            </span>
          )}
        </span>
      );
    },
  };
}

/// El nivel con el color de su banda — el MISMO con el que la matriz pinta la casilla donde
/// ese activo cae, para que el renglón y la casilla se lean juntos.
///
/// El color nunca es el único portador: el renglón sigue diciendo la banda en palabras.
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

