// lib/sgsi/__tests__/columnas-analisis.test.ts
//
// Las columnas de la grilla de «Análisis de riesgos», probadas COMO DATO.
//
// Por qué esta prueba existe, y por qué no renderiza nada: la documentación de AG Grid
// desaconseja jsdom —sin soporte de layout, la virtualización no calcula qué filas caben y el
// grid puede no rendir ninguna— y recomienda verificar en navegador real. Si la única forma de
// probar la grilla fuera Playwright, la Regla 1 de HARNESS.md —prueba en rojo ANTES del
// arreglo— pasaría a costar un minuto por iteración en vez de un segundo, y una regla que
// cuesta eso se deja de cumplir.
//
// La salida es sacar de la grilla todo lo que puede estar mal. `columnas-analisis.ts` es puro:
// de AG Grid sólo usa sus tipos. Lo que queda en el componente es un cascarón sin decisiones.
//
// Es el mismo criterio con el que `lib/__tests__/use-server.test.ts` convirtió una clase de
// fallo de despliegue en una prueba de milisegundos.

import type { ColDef, ColGroupDef } from 'ag-grid-community';
import {
  CLASE_FILA_ALARMANTE,
  CLASE_FILA_BRECHA,
  CLAVE_ESTADO_COLUMNAS,
  COL_DEF_POR_DEFECTO,
  ID_GRUPO_DIMENSIONES,
  PRESUPUESTO_ANCHO_1280,
  anchoMinimoDeLaGrilla,
  disposicionAplicable,
  claseDeFila,
  columnasAnalisis,
  compararNivel,
  esResidualAlarmante,
  textoDeNivel,
  type IdColumnaAnalisis,
  tooltipDeCriticidad,
  accesiblePlan,
} from '../columnas-analisis';
import {
  FILTROS_ANALISIS_VACIOS,
  compararPorCriticidad,
  filasAnalisis,
  type ActivoAnalizable,
  type DatosAnalisis,
  type FilaAnalisis,
  type MapaRtoPorCriticidad,
  type RiesgoAnalizable,
} from '../analisis-riesgos';
import type { NivelRiesgo, UmbralRiesgo } from '../riesgo-activo';

const BANDAS: UmbralRiesgo[] = [
  { nombre: 'Crítico', desde: '20', hasta: '999999', orden: 1 },
  { nombre: 'Alto', desde: '10', hasta: '19.9999', orden: 2 },
  { nombre: 'Medio', desde: '4', hasta: '9.9999', orden: 3 },
  { nombre: 'Bajo', desde: '0', hasta: '3.9999', orden: 4 },
];

const RTO: MapaRtoPorCriticidad = new Map<string, number | null>([
  ['C1', 10],
  ['C2', 240],
  ['C3', 1440],
  ['C5', null],
]);

function riesgo(p: Partial<RiesgoAnalizable> = {}): RiesgoAnalizable {
  return {
    amenazaCodigo: 'A.24',
    amenazaNombre: 'Denegación de servicio',
    potencial: '25',
    residual: '25',
    obsoleto: false,
    degradacion: { D: 1, I: 0, C: 0 },
    ...p,
  };
}

function activo(p: Partial<ActivoAnalizable> = {}): ActivoAnalizable {
  return {
    codigo: 'TEC-GEN-0001',
    nombre: 'Activo de prueba',
    valor: 5,
    valores: { D: 5, I: 3, C: 2 },
    criticidad: null,
    proceso: 'Gestión Tecnológica',
    propietario: 'Chief Operating Officer',
    persona: null,
    personaCorreo: null,
    riesgos: [riesgo()],
    ...p,
  };
}

function datos(activos: ActivoAnalizable[]): DatosAnalisis {
  return { activos, bandas: BANDAS, umbral: 4 };
}

function fila(p: Partial<ActivoAnalizable> = {}): FilaAnalisis {
  return filasAnalisis(datos([activo(p)]), FILTROS_ANALISIS_VACIOS)[0];
}

const columnas = () => columnasAnalisis({ rtoPorCriticidad: RTO });

/// Aplana el grupo de dimensiones: lo que interesa contar son las COLUMNAS que el lector ve,
/// no los nodos del árbol de encabezados.
function planas(
  cols: (ColDef<FilaAnalisis> | ColGroupDef<FilaAnalisis>)[],
): ColDef<FilaAnalisis>[] {
  return cols.flatMap((c) =>
    'children' in c ? (c.children as ColDef<FilaAnalisis>[]) : [c as ColDef<FilaAnalisis>],
  );
}

const ids = (): (string | undefined)[] => planas(columnas()).map((c) => c.colId);

describe('las trece columnas, en su orden y con su nombre', () => {
  // Trece y no catorce: código, nombre, valor, D, I, C, criticidad, proceso, propietario,
  // amenazas, peor inherente, peor residual, plan. Es la misma lista que la `<table>` tenía,
  // en el mismo orden — la grilla cambia quién controla la vista, no qué se muestra.
  // «Plan» va TERCERA, junto a Nombre, y no al final (21/09/2026, a pedido de quien usa la
  // pantalla). Es la única columna con una acción: mandarla al extremo derecho obligaba a
  // recorrer diez columnas o a desplazarse para hacer lo único que se hace desde acá.
  const ESPERADAS: IdColumnaAnalisis[] = [
    'codigo',
    'nombre',
    'plan',
    'C',
    'I',
    'D',
    'valor',
    'criticidad',
    'proceso',
    'propietario',
    'cantidadAmenazas',
    'peorInherente',
    'peorResidual',
  ];

  it('están las trece, en el orden de fábrica', () => {
    expect(ids()).toEqual(ESPERADAS);
  });

  it('cada una lleva su encabezado visible', () => {
    const porId = new Map(planas(columnas()).map((c) => [c.colId, c.headerName]));
    expect(porId.get('codigo')).toBe('Código');
    expect(porId.get('peorResidual')).toBe('Peor residual');
    expect(porId.get('cantidadAmenazas')).toBe('Amenazas');
    expect(porId.get('plan')).toBe('Plan');
  });

  // El ancho de la columna sólo da para la letra; el nombre completo es lo que un lector de
  // pantalla anuncia, y era el contrato que la `<table>` sostenía con `aria-label`.
  it('D, I y C viven bajo un encabezado agrupado y conservan su nombre completo', () => {
    const grupo = columnas().find((c) => 'groupId' in c && c.groupId === ID_GRUPO_DIMENSIONES);
    expect(grupo).toBeDefined();
    const hijas = (grupo as ColGroupDef<FilaAnalisis>).children as ColDef<FilaAnalisis>[];
    // C · I · D, y no el D · I · C de MAGERIT: lo pidió quien usa la pantalla el 22/09/2026.
    // El orden del catálogo sigue siendo D · I · C y `DIMENSIONES` no cambió — lo que cambia es
    // cómo se presentan acá, que es una decisión de esta pantalla y no del modelo.
    expect(hijas.map((c) => c.colId)).toEqual(['C', 'I', 'D']);
    expect(hijas.map((c) => c.headerTooltip)).toEqual([
      'Confidencialidad',
      'Integridad',
      'Disponibilidad',
    ]);
  });

  it('«Código» viene fijada a la izquierda: es la que identifica el renglón', () => {
    const codigo = planas(columnas()).find((c) => c.colId === 'codigo');
    expect(codigo?.pinned).toBe('left');
  });
});

// ESTA PRUEBA AFIRMABA LO CONTRARIO, y se invirtió el 21/09/2026 por pedido de quien usa la
// pantalla, junto con el retiro de los seis desplegables propios.
//
// Decía: «la grilla NO filtra», porque las tarjetas y la lista salían de la misma llamada con
// los mismos filtros y un filtro de la grilla las habría separado en el primer clic —la
// tarjeta diciendo 30 y la grilla mostrando 12—.
//
// El riesgo era real y sigue ahí; lo que cambió es dónde se ataja. Las tarjetas ya no se
// cuentan desde los filtros sino desde las filas visibles (`tarjetasDeFilas`), así que no
// pueden desacordar por construcción. Se deja escrito el motivo y no sólo el cambio: una
// prueba que cambia de signo sin explicación parece un descuido seis meses después.
describe('la grilla filtra, y las tarjetas cuentan lo que muestra', () => {
  it('toda columna trae filtro, y a la vista', () => {
    expect(COL_DEF_POR_DEFECTO.filter).toBe(true);
    expect(COL_DEF_POR_DEFECTO.floatingFilter).toBe(true);
  });

  // El tipo importa: un filtro de texto sobre «Valor» ofrecería «contiene» donde la pregunta
  // real es «mayor que», y ordenaría 10 antes que 9.
  it('las columnas numéricas filtran como números, no como texto', () => {
    const porId = new Map(planas(columnas()).map((c) => [c.colId, c.filter]));
    expect(porId.get('valor')).toBe('agNumberColumnFilter');
    expect(porId.get('D')).toBe('agNumberColumnFilter');
    expect(porId.get('cantidadAmenazas')).toBe('agNumberColumnFilter');
    expect(porId.get('nombre')).toBe('agTextColumnFilter');
  });

  it('y sigue dejando mover, redimensionar y ordenar', () => {
    expect(COL_DEF_POR_DEFECTO.resizable).toBe(true);
    expect(COL_DEF_POR_DEFECTO.sortable).toBe(true);
  });
});

// Que no haya barra horizontal no es cosmético: con trece columnas en anchos fijos la grilla
// siempre terminaba más ancha que la pantalla. `flex` reparte el ancho disponible y no sobra
// nada.
describe('las columnas reparten el ancho en vez de desbordarlo', () => {
  it('las tres columnas de texto largo son flexibles', () => {
    const porId = new Map(planas(columnas()).map((c) => [c.colId, c]));
    expect(porId.get('nombre')?.flex).toBeGreaterThan(0);
    expect(porId.get('proceso')?.flex).toBeGreaterThan(0);
    expect(porId.get('propietario')?.flex).toBeGreaterThan(0);
  });

  it('pero ninguna puede aplastarse hasta ser ilegible', () => {
    for (const c of planas(columnas())) {
      const ancho = c.flex === undefined ? c.width : c.minWidth;
      expect(ancho ?? 0).toBeGreaterThanOrEqual(40);
    }
  });

  // ESTA PRUEBA NACIÓ DE UN DEFECTO, el 21/09/2026, y conviene contar cuál.
  //
  // La grilla se declaró «sin barra horizontal» porque las columnas usan `flex`. Era falso:
  // `flex` reparte el SOBRANTE, pero cada columna tiene un mínimo, y la suma de los mínimos es
  // un piso duro que `flex` no puede bajar. Ese piso era 1534 px, así que en una ventana de
  // 1280 —el portátil corriente, y el viewport por omisión de Playwright— se perdían tres
  // columnas detrás del scroll, incluida «Peor residual», que es la magnitud que ordena la
  // lista entera.
  //
  // Los cinco checks estaban en verde y el build compilaba. Lo encontró la PRIMERA ejecución
  // del recorrido de punta a punta, que es exactamente la forma de las cicatrices que
  // HARNESS.md documenta: ninguna pieza estaba mal, la suma sí.
  //
  // Así que el piso se mide acá, en milisegundos, y no en un navegador. Es el mismo criterio
  // que convirtió un fallo de despliegue en `use-server.test.ts`: si un error se puede volver
  // prueba barata, se vuelve.
  describe('el piso de ancho, que es lo que de verdad decide si hay barra horizontal', () => {
    it('la suma de los mínimos cabe en una ventana de 1280', () => {
      expect(anchoMinimoDeLaGrilla(columnas())).toBeLessThanOrEqual(PRESUPUESTO_ANCHO_1280);
    });

    // EL PRESUPUESTO SE EQUIVOCÓ UNA VEZ, Y LA FORMA DEL ERROR VALE MÁS QUE EL NÚMERO.
    //
    // La primera versión decía `1280 - 15 - 64 - 40 = 1161`: descontaba la barra del
    // navegador y el relleno de la página y de la tarjeta, y **olvidaba la barra lateral del
    // SGSI** (`--hf-sidebar-ancho: 244px`). Había además una prueba que «verificaba la
    // aritmética para que nadie subiera el presupuesto a mano» — y como el término faltaba en
    // las dos, el guardián fijó la fórmula en su propio error.
    //
    // La lección: un guardián sobre una fórmula incompleta no protege, consagra. Por eso la
    // medición en navegador (`e2e/analisis-riesgos.spec.ts`, paso 5b) es la que MANDA, y esta
    // constante es sólo un piso conservador para poder fallar barato antes de llegar allá.
    it('el presupuesto descuenta también la barra lateral del SGSI', () => {
      const BARRA_NAVEGADOR = 15;
      const SIDEBAR_SGSI = 244; // --hf-sidebar-ancho; plegada son 64 y entonces sobra más
      const RELLENO_PAGINA = 64; // px-8
      const RELLENO_TARJETA = 40; // p-5
      expect(PRESUPUESTO_ANCHO_1280).toBeLessThanOrEqual(
        1280 - BARRA_NAVEGADOR - SIDEBAR_SGSI - RELLENO_PAGINA - RELLENO_TARJETA,
      );
    });

    // Una columna escondida no ocupa ancho, así que no puede contar para el piso. Sin esto,
    // esconder columnas para que quepan no serviría de nada: el piso seguiría igual.
    it('las columnas escondidas no cuentan para el piso', () => {
      const conEscondida = anchoMinimoDeLaGrilla([
        { colId: 'x', width: 500, hide: true },
        { colId: 'y', width: 100 },
      ]);
      expect(conEscondida).toBe(100);
    });

    // LA HOLGURA SE GASTÓ, Y EN LO QUE ESTABA RESERVADA. El 21/09 esta prueba exigía 60 px
    // libres «para que una columna crezca sin reabrir el defecto», nombrando el caso: que
    // «Criticidad» pasara de `C3` a «Crítica continua». Eso ocurrió el 22/09 y la columna se
    // ensanchó de 78 a 128 px, que es exactamente para lo que la holgura existía.
    //
    // Baja a 25 px y no desaparece: un piso sin ningún margen vuelve a poner el desborde a un
    // cambio de distancia, y el margen es lo que permite que el siguiente ajuste no sea otra
    // ronda de recortes.
    it('y conserva un margen, aunque menor: la holgura se gastó donde debía', () => {
      expect(anchoMinimoDeLaGrilla(columnas())).toBeLessThanOrEqual(PRESUPUESTO_ANCHO_1280 - 25);
    });

    // Trece columnas no caben en 917 px sin volver ilegible cada celda, así que dos empiezan
    // escondidas. NO desaparecen: siguen existiendo y el lector las enciende desde
    // «Columnas». Esconder algo que no se puede recuperar sería borrarlo.
    it('dos columnas arrancan escondidas, y son las menos accionables', () => {
      const escondidas = planas(columnas())
        .filter((c) => c.hide === true)
        .map((c) => c.colId);
      expect(escondidas).toEqual(['cantidadAmenazas', 'peorInherente']);
    });

    it('pero las trece siguen existiendo: esconder no es borrar', () => {
      expect(planas(columnas())).toHaveLength(13);
    });
  });
});

// UNA DISPOSICIÓN GUARDADA NO PUEDE ESCONDER UN CAMBIO DE FÁBRICA.
//
// El 21/09/2026 «Plan» se movió a la tercera posición. Quien ya tenía una disposición guardada
// siguió viendo el orden viejo —«Plan» al final— y el cambio pareció no haberse aplicado. No
// era un defecto del cambio: era la persistencia derrotándolo en silencio, que es peor, porque
// el reporte que llega es «no se aplicó» y el código dice que sí.
//
// El comentario de `CLAVE_ESTADO_COLUMNAS` decía que la versión existe para cuando cambien los
// `colId`. Acá los ids no cambiaron: cambió el ORDEN. La versión a mano tampoco habría servido,
// porque alguien tiene que acordarse de subirla — y nadie se acuerda.
//
// Así que la disposición guarda además el orden de fábrica con el que nació, y se descarta
// sola cuando ese orden deja de coincidir. Se pierde la personalización de quien la tuviera,
// una vez; es el precio correcto: una disposición vieja que esconde el cambio cuesta más.
describe('la disposición guardada se descarta cuando cambia el orden de fábrica', () => {
  const FABRICA = ['codigo', 'nombre', 'plan'];
  const ESTADO = [{ colId: 'codigo' }, { colId: 'nombre' }, { colId: 'plan' }];
  const guardada = (p: Record<string, unknown> = {}) => ({
    version: CLAVE_ESTADO_COLUMNAS,
    fabrica: FABRICA,
    estado: ESTADO,
    ...p,
  });

  it('una disposición del mismo orden de fábrica se aplica', () => {
    expect(disposicionAplicable(guardada(), FABRICA)).toEqual(ESTADO);
  });

  it('si el orden de fábrica cambió, se descarta', () => {
    expect(disposicionAplicable(guardada(), ['codigo', 'plan', 'nombre'])).toBeNull();
  });

  it('si apareció una columna nueva, se descarta', () => {
    expect(disposicionAplicable(guardada(), [...FABRICA, 'valor'])).toBeNull();
  });

  it('si la versión no es la de hoy, se descarta', () => {
    expect(disposicionAplicable(guardada({ version: 'v0' }), FABRICA)).toBeNull();
  });

  // Nada de lo que venga de `localStorage` es de fiar: lo escribe el navegador de cualquiera y
  // puede llegar truncado, editado a mano o de otra versión de la aplicación.
  it.each([null, undefined, 42, 'texto', {}, { fabrica: FABRICA }, []])(
    'una disposición corrupta (%p) se descarta sin romper nada',
    (basura) => {
      expect(disposicionAplicable(basura, FABRICA)).toBeNull();
    },
  );
});

describe('ordenar por las columnas que no son escalares', () => {
  const nivel = (n: number, banda: string): NivelRiesgo =>
    ({ nivel: n, banda, figura: 'x' }) as NivelRiesgo;

  it('compararNivel ordena por magnitud, de menor a mayor', () => {
    expect(compararNivel(nivel(5, 'Medio'), nivel(25, 'Crítico'))).toBeLessThan(0);
    expect(compararNivel(nivel(25, 'Crítico'), nivel(5, 'Medio'))).toBeGreaterThan(0);
    expect(compararNivel(nivel(5, 'Medio'), nivel(5, 'Medio'))).toBe(0);
  });

  // «Sin calcular» no es riesgo cero: es un estado del modelo. Se ordena por debajo de todo
  // lo medido —no se puede hacer otra cosa con un número que no existe— y la celda lo sigue
  // diciendo en palabras, que es lo que impide leerlo como «bajo».
  it('«sin calcular» se ordena aparte de lo medido, y no se confunde con lo bajo', () => {
    expect(compararNivel(null, nivel(1, 'Bajo'))).toBeLessThan(0);
    expect(compararNivel(null, null)).toBe(0);
    expect(textoDeNivel(null)).toBe('sin calcular');
    expect(textoDeNivel(nivel(25, 'Crítico'))).toBe('25 · Crítico');
  });

  // La columna «Criticidad» no ordena por su código: ordena por el RTO que ese código
  // representa, que es el criterio de §11. Y lo hace llamando a la MISMA función que usa el
  // selector de orden, no a una copia.
  it('la columna Criticidad delega en compararPorCriticidad, sin un segundo comparador', () => {
    const c1 = fila({ codigo: 'TEC-GEN-0009', criticidad: 'C1' });
    const c3 = fila({ codigo: 'TEC-GEN-0001', criticidad: 'C3' });
    const col = planas(columnas()).find((c) => c.colId === 'criticidad');
    const comparar = col?.comparator as (
      a: unknown,
      b: unknown,
      na: { data: FilaAnalisis },
      nb: { data: FilaAnalisis },
    ) => number;

    expect(comparar(c1.criticidad, c3.criticidad, { data: c1 }, { data: c3 })).toBe(
      compararPorCriticidad(c1, c3, RTO),
    );
    expect(comparar(c3.criticidad, c1.criticidad, { data: c3 }, { data: c1 })).toBe(
      compararPorCriticidad(c3, c1, RTO),
    );
  });
});

// El contrato que la `<table>` llevaba en `data-banda-residual` y `data-estado-plan`.
//
// AG Grid no expone ninguna API para poner atributos `data-*` en el elemento de fila: sólo
// clases y estilos. Así que el contrato pasa a clase — que se inspecciona igual de bien desde
// el navegador y aquí se prueba pura.
describe('la fila dice su banda y su estado de plan sin depender del color', () => {
  // DOS ACENTOS DESDE EL 22/09/2026, Y NUNCA LOS DOS A LA VEZ. Conviene leer la historia
  // completa antes de volver a moverlos, porque el significado de `fila-alarmante` ya cambió
  // dos veces en el mismo día.
  //
  //   1. Nació marcando la BANDA del residual (Crítico o Alto).
  //   2. Pasó a marcar que el activo REQUIERE PLAN y no lo tiene (`estadoPlan === 'pendiente'`),
  //      al retirarse la etiqueta ámbar «pendiente».
  //   3. Ahora marca que queda RIESGO RESIDUAL ALTO O CRÍTICO SIN PLAN (`altoSinPlan`), y la
  //      deuda de madurez —lo que el paso 2 pintaba— se va al ámbar `fila-brecha-pendiente`.
  //
  // El paso 3 es el que este bloque de pruebas persigue. La razón es que `estadoPlan` y
  // `altoSinPlan` contestan preguntas distintas: la brecha del control y el riesgo que queda.
  // Un activo con el control al día y el residual en Alto no se marcaba de ninguna forma, que
  // es el vacío que REQ-SIG-24 §7 señala.
  //
  // Sigue siendo un acento por renglón. Cuando las dos condiciones se cumplen gana el rojo: es
  // el problema más grave y el que manda la acción. Un renglón con dos colores no es más
  // informativo, es ilegible.
  //
  // La banda NO se queda sin señal: la columna «Peor residual» sigue llevando su color y su
  // palabra, que es donde esa pregunta se responde. Cada señal en su sitio.
  it('el renglón se acentúa en rojo cuando queda riesgo alto sin plan', () => {
    const altoSuelto = { ...fila(), altoSinPlan: true };
    expect(claseDeFila(altoSuelto)).toContain(CLASE_FILA_ALARMANTE);
    expect(claseDeFila(altoSuelto)).not.toContain(CLASE_FILA_BRECHA);
  });

  // CAMBIÓ EL 22/09/2026, y es un cambio decidido, no una prueba relajada.
  //
  // Antes afirmaba `claseDeFila({ estadoPlan: 'pendiente' })` → `CLASE_FILA_ALARMANTE`, porque
  // el rojo significaba «requiere plan y no lo tiene» por brecha de control. Ese significado se
  // mudó al ámbar: el rojo pasó a ser del residual alto sin tratar. La afirmación de fondo —que
  // una brecha pendiente se ve— no se perdió, cambió de color.
  it('el renglón se acentúa en ámbar cuando hay brecha pendiente y ningún alto suelto', () => {
    const pendiente = { ...fila(), estadoPlan: 'pendiente' as const, altoSinPlan: false };
    expect(claseDeFila(pendiente)).toContain(CLASE_FILA_BRECHA);
    expect(claseDeFila(pendiente)).not.toContain(CLASE_FILA_ALARMANTE);
    expect(claseDeFila(pendiente)).toContain('fila-plan--pendiente');
  });

  // LA PRUEBA QUE IMPIDE EL RENGLÓN DE DOS COLORES. Las dos condiciones son independientes y
  // se cumplen juntas a menudo —una brecha de control sin cubrir es una de las formas de que
  // quede un residual alto—, así que sin este `else` el caso más común sería el ilegible.
  it('con las dos condiciones gana el rojo, y el ámbar no sale', () => {
    const ambas = { ...fila(), estadoPlan: 'pendiente' as const, altoSinPlan: true };
    expect(claseDeFila(ambas)).toContain(CLASE_FILA_ALARMANTE);
    expect(claseDeFila(ambas)).not.toContain(CLASE_FILA_BRECHA);
  });

  // CAMBIÓ EL 22/09/2026. Antes sólo afirmaba que un `con-plan` no lleva el rojo; ahora tiene
  // que afirmar que no lleva NINGUNO de los dos acentos, porque con dos clases en juego «no se
  // acentúa» dejó de poder comprobarse mirando una sola.
  it('un activo que ya tiene plan NO se acentúa, aunque su residual sea Crítico', () => {
    const critico = fila({ riesgos: [riesgo({ potencial: '25', residual: '25' })] });
    const conPlan = { ...critico, estadoPlan: 'con-plan' as const, altoSinPlan: false };
    expect(conPlan.peorResidual?.banda).toBe('Crítico');
    expect(claseDeFila(conPlan)).not.toContain(CLASE_FILA_ALARMANTE);
    expect(claseDeFila(conPlan)).not.toContain(CLASE_FILA_BRECHA);
    // La banda sigue diciéndose: pierde el acento del renglón, no la información.
    expect(claseDeFila(conPlan)).toContain('fila-banda--Critico');
  });

  // CAMBIÓ EL 22/09/2026. Antes la banda era irrelevante para el acento —de ahí el «tenga la
  // banda que tenga»— y bastaba `no-requiere` para descartar el rojo. Ahora la banda vuelve a
  // importar, así que el caso hay que fijarlo: `no-requiere` **y** `altoSinPlan` en falso, que
  // es un activo cuyo residual alto ya está cubierto por un plan.
  it('ni uno que no requiere plan y no tiene ningún alto suelto', () => {
    const alto = fila({ riesgos: [riesgo({ potencial: '12', residual: '12' })] });
    const noRequiere = { ...alto, estadoPlan: 'no-requiere' as const, altoSinPlan: false };
    expect(claseDeFila(noRequiere)).not.toContain(CLASE_FILA_ALARMANTE);
    expect(claseDeFila(noRequiere)).not.toContain(CLASE_FILA_BRECHA);
    expect(claseDeFila(noRequiere)).toContain('fila-banda--Alto');
  });

  // «No se pudo evaluar» no es «no falta». No se acentúa —acentuarlo afirmaría una brecha que
  // nadie midió— y lleva su propia clase para poder distinguirlo del resto.
  it('«sin determinar» no se acentúa: no miré no es no falta', () => {
    const sinDeterminar = { ...fila(), estadoPlan: 'sin-determinar' as const };
    expect(claseDeFila(sinDeterminar)).not.toContain(CLASE_FILA_ALARMANTE);
    expect(claseDeFila(sinDeterminar)).not.toContain(CLASE_FILA_BRECHA);
    expect(claseDeFila(sinDeterminar)).toContain('fila-plan--sin-determinar');
  });

  // La banda sigue viajando en la clase aunque ya no gobierne el acento: se sigue pudiendo
  // señalar una fila por su banda desde el inspector o desde una prueba.
  it('«sin calcular» se nombra como lo que es', () => {
    const sinCalcular = fila({ riesgos: [] });
    expect(sinCalcular.peorResidual).toBeNull();
    expect(claseDeFila(sinCalcular)).toContain('fila-banda--sin-calcular');
    expect(esResidualAlarmante(null)).toBe(false);
  });

  // Los cuatro estados de `EstadoPlanActivo` existen, pero hoy en la base sólo se ven dos
  // («pendiente» y «no-requiere»: 11 y 19 de las 30 filas, medido el 21/09/2026). Los dos que
  // no se ven probando a mano son justamente los que una prueba tiene que cubrir.
  it('los cuatro estados de plan tienen su clase, incluidos los dos que hoy no se ven', () => {
    const clase = (estado: FilaAnalisis['estadoPlan']) =>
      claseDeFila({ ...fila(), estadoPlan: estado });
    expect(clase('pendiente')).toContain('fila-plan--pendiente');
    expect(clase('no-requiere')).toContain('fila-plan--no-requiere');
    expect(clase('con-plan')).toContain('fila-plan--con-plan');
    expect(clase('sin-determinar')).toContain('fila-plan--sin-determinar');

    // CAMBIÓ EL 22/09/2026. Antes afirmaba `acentuados === ['pendiente']` sobre
    // `CLASE_FILA_ALARMANTE`: el rojo era del estado de plan. Ahora el estado de plan sólo
    // gobierna el ÁMBAR —el rojo depende de `altoSinPlan`, que acá es falso en las cuatro
    // filas—, así que la misma afirmación se hace sobre `CLASE_FILA_BRECHA` y el rojo tiene que
    // estar ausente de los cuatro.
    const ESTADOS = ['pendiente', 'no-requiere', 'con-plan', 'sin-determinar'] as const;
    expect(ESTADOS.filter((e) => clase(e).includes(CLASE_FILA_BRECHA))).toEqual(['pendiente']);
    expect(ESTADOS.filter((e) => clase(e).includes(CLASE_FILA_ALARMANTE))).toEqual([]);
  });
});

// ── El tooltip de Criticidad ────────────────────────────────────────────────────────────
//
// La celda mostraba sólo el nombre y, al pasar el cursor, la descripción del catálogo. Eso
// contesta «qué es C3» y no contesta lo que la columna significa de verdad en esta pantalla:
// CUÁNTO EXIGE. La criticidad gobierna la Disponibilidad, así que su consecuencia visible es
// el nivel que le pide al control principal de las amenazas que degradan D — y ese número
// vive en `EXIGENCIA_POR_CRITICIDAD`, no en el catálogo.
//
// Se prueba acá y no renderizando porque es una decisión sobre qué decir, no sobre cómo
// pintarlo: la misma razón por la que el resto de este módulo es puro.
describe('tooltipDeCriticidad', () => {
  const cat = (nombre: string, descripcion: string | null) => ({ nombre, descripcion });

  it('dice el nombre, el codigo y el nivel que exige sobre Disponibilidad', () => {
    const t = tooltipDeCriticidad('C3', cat('Importante', 'Respaldo restaurable.'), 1440);
    expect(t).toContain('Importante');
    expect(t).toContain('C3');
    expect(t).toContain('80');
    expect(t).toContain('Disponibilidad');
  });

  it('C1 anade que ademas exige verificacion vigente, que es lo que la distingue de C2', () => {
    const c1 = tooltipDeCriticidad('C1', cat('Crítica continua', null), 10);
    const c2 = tooltipDeCriticidad('C2', cat('Crítica', null), 240);
    expect(c1).toContain('90');
    expect(c2).toContain('90');
    expect(c1).toContain('verificación');
    expect(c2).not.toContain('verificación');
  });

  it('C5 no exige por esta via, y lo dice en vez de callarse', () => {
    const t = tooltipDeCriticidad('C5', cat('Sin compromiso', null), null);
    expect(t.toLowerCase()).toContain('no exige');
    expect(t).not.toMatch(/\d+\s*%/);
  });

  it('sin criticidad clasificada no inventa una exigencia', () => {
    const t = tooltipDeCriticidad(null, undefined, null);
    expect(t.toLowerCase()).toContain('sin clasificar');
    expect(t).not.toMatch(/\d+\s*%/);
  });

  it('incluye el RTO cuando el catalogo lo trae, porque es el compromiso que la define', () => {
    expect(tooltipDeCriticidad('C1', cat('Crítica continua', null), 10)).toContain('10');
    expect(tooltipDeCriticidad('C3', cat('Importante', null), null)).not.toContain('RTO');
  });
});

// ── La celda «Plan» ─────────────────────────────────────────────────────────────────────
//
// El texto visible pasó a ser «Planes de T.» en los dos estados (22/09/2026, a pedido de
// quien usa la pantalla). Eso quita el portador textual que distinguía «ya hay plan» de «no
// hay ninguno»: antes la celda decía «Ver Plan» o «Crear Plan» y se leía sin depender del
// color.
//
// Esta prueba existe para que esa distinción no desaparezca del todo. El texto es el mismo;
// el NOMBRE ACCESIBLE y el título siguen siendo distintos, que es lo que un lector de pantalla
// anuncia y lo que aparece al posar el cursor. Sin esto, el día que alguien «simplifique» los
// dos rótulos a uno solo, la celda dejaría de decir nada en ningún canal y nada fallaría.
describe('accesiblePlan', () => {
  it('el texto visible es el mismo en los tres estados', () => {
    expect(accesiblePlan('TEC-GEN-0004', 'con-plan').texto).toBe('Planes de T.');
    expect(accesiblePlan('TEC-GEN-0004', 'pendiente').texto).toBe('Planes de T.');
    expect(accesiblePlan('TEC-GEN-0004', 'no-requiere').texto).toBe('Planes de T.');
  });

  it('pero el nombre accesible SI distingue si ya hay plan', () => {
    const con = accesiblePlan('TEC-GEN-0004', 'con-plan');
    const sin = accesiblePlan('TEC-GEN-0004', 'pendiente');
    expect(con.aria).not.toBe(sin.aria);
    expect(con.aria).toMatch(/ver/i);
    expect(sin.aria).toMatch(/crear|registrar/i);
  });

  it('el nombre accesible nombra el activo: treinta filas con el mismo texto son treinta botones indistinguibles', () => {
    expect(accesiblePlan('TEC-GEN-0004', 'pendiente').aria).toContain('TEC-GEN-0004');
    expect(accesiblePlan('COM-APP-0001', 'con-plan').aria).toContain('COM-APP-0001');
  });

  it('el titulo dice por que es obligatorio o por que es opcional', () => {
    expect(accesiblePlan('X', 'pendiente').titulo).toMatch(/brecha/i);
    expect(accesiblePlan('X', 'no-requiere').titulo).toMatch(/no lo requiere|preventivo/i);
  });
});
