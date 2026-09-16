// lib/sgsi/gantt-planes.ts
//
// La línea de tiempo de los planes de tratamiento y mejora, y el resumen que la encabeza.
//
// Módulo PURO: sin Prisma, sin React y sin `new Date()` adentro. La fecha de HOY llega por
// argumento, y eso no es purismo — es lo que permite probar «este plan está vencido» sin que
// la prueba empiece a fallar sola el día que pase la fecha del fixture. Un Gantt cuyas
// pruebas caducan es un Gantt que nadie vuelve a tocar.
//
// ── LO QUE UN GANTT TIENE QUE RESPONDER, Y CASI NINGUNO RESPONDE ────────────────────────
//
// Dibujar barras es fácil. La pregunta que alguien se hace frente a un plan de tratamiento no
// es «¿cuándo termina?» sino **«¿va a llegar?»**, y eso no se lee de una barra: se lee de
// comparar cuánto tiempo se consumió contra cuánto avance hay. Un plan al 30 % con el 80 %
// del plazo gastado está en problemas aunque su fecha todavía no haya llegado, y un Gantt que
// sólo pinta la barra lo muestra exactamente igual que a uno al 30 % recién empezado.
//
// Por eso cada barra trae `desvio`: avance menos tiempo consumido, en puntos porcentuales. Es
// la única cifra de este módulo que no se puede leer del calendario.
//
// ── LO QUE NO SE DIBUJA SE CUENTA ───────────────────────────────────────────────────────
//
// Un plan sin fecha objetivo no tiene barra. No se le inventa una —ni «hoy», ni «fin de
// año»—: se cuenta aparte y se dice. Un plan invisible en un tablero de seguimiento es un
// plan que nadie va a reclamar, y la razón por la que no se ve tiene que estar escrita.

/// Un plan tal como la línea de tiempo lo necesita. Vista PLANA: la consulta resuelve nombres
/// y fechas a `AAAA-MM-DD`, y este módulo ordena y mide.
export interface PlanDeLinea {
  codigo: string;
  accion: string;
  tipo: string;
  responsable: string;
  /// `AAAA-MM-DD`. El arranque de la barra.
  fechaAprobacion: string | null;
  /// `AAAA-MM-DD`. Sin ella no hay barra que dibujar.
  fechaObjetivo: string | null;
  fechaCierre: string | null;
  estado: string;
  /// 0 a 100.
  avance: number;
  control: string | null;
}

/// Cómo va un plan respecto de su plazo. Es lo que da el color de la barra.
export type EstadoLinea =
  /// Cerrado. Ya no compite por atención.
  | 'CERRADO'
  /// Pasó la fecha objetivo y no está cerrado.
  | 'VENCIDO'
  /// Dentro del plazo, pero el avance va por detrás del tiempo consumido.
  | 'EN_RIESGO'
  /// Dentro del plazo y el avance acompaña.
  | 'EN_PLAZO'
  /// Todavía no arrancó: la fecha de aprobación es futura.
  | 'NO_INICIADO';

export interface BarraPlan {
  plan: PlanDeLinea;
  /// Posición del arranque dentro de la ventana, de 0 a 1.
  inicio: number;
  /// Ancho dentro de la ventana, de 0 a 1. Nunca 0: una barra de ancho cero es una barra que
  /// no se puede ni ver ni señalar con el ratón, y un plan de un solo día existe igual.
  ancho: number;
  estado: EstadoLinea;
  /// Qué fracción del plazo se consumió, de 0 a 1. Por encima de 1 se recorta: «un 300 % del
  /// plazo» no es una lectura, y lo que importa —que se pasó— ya lo dice `VENCIDO`.
  consumido: number;
  /// Avance menos tiempo consumido, en puntos porcentuales. Negativo es ir por detrás.
  ///
  /// `null` cuando el plan todavía no arrancó: antes de empezar, no ir avanzando no es un
  /// retraso, y marcarlo en rojo llenaría el tablero de alarmas falsas el día que se aprueban
  /// diez planes con fecha de inicio futura.
  desvio: number | null;
}

export interface ResumenLinea {
  total: number;
  /// Los que no se pueden dibujar, y por qué. Se cuentan aparte para que la suma cuadre.
  sinFechaObjetivo: number;
  porEstado: { estado: EstadoLinea; n: number }[];
  /// Promedio de avance sobre los planes NO cerrados. Incluir los cerrados —todos al 100 %—
  /// haría subir la cifra justamente cuando se cierra algo, que es cuando menos informa sobre
  /// lo que queda por hacer.
  avancePromedioAbiertos: number;
  /// Cuántos van por detrás de su plazo. Es la cifra que manda en el tablero.
  enRiesgo: number;
  vencidos: number;
}

export interface LineaDeTiempo {
  barras: BarraPlan[];
  /// Los que no tienen fecha objetivo. Van en una lista aparte, debajo, nunca escondidos.
  sinFecha: PlanDeLinea[];
  /// La ventana, en `AAAA-MM-DD`.
  desde: string;
  hasta: string;
  /// Las marcas de mes de la ventana, con su posición de 0 a 1.
  meses: { etiqueta: string; posicion: number }[];
  resumen: ResumenLinea;
}

const DIA = 86_400_000;

/// `AAAA-MM-DD` a milisegundos UTC. `null` para lo que no se pueda leer.
///
/// Se parsea a mano en vez de con `new Date(texto)`: `new Date('2026-09-16')` es UTC pero
/// `new Date('2026-9-16')` es local, y una fecha que se corre un día según cómo venga escrita
/// convierte un plan que vence hoy en uno vencido ayer.
export function aMilis(fecha: string | null): number | null {
  if (fecha === null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (m === null) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function aTexto(milis: number): string {
  return new Date(milis).toISOString().slice(0, 10);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/// El umbral de desvío a partir del cual un plan se marca EN_RIESGO, en puntos porcentuales.
///
/// Diez y no cero: con cero, cualquier plan cuyo avance se registre en saltos —del 25 % al
/// 50 %— pasaría a rojo cada vez que el calendario avanza un día entre dos registros, y el
/// tablero estaría en rojo permanente por la forma en que se cargan los datos, no por cómo
/// van los planes. Un tablero que siempre alarma es uno que se deja de mirar.
export const HOLGURA_DESVIO = 10;

/// Cómo va un plan. Es la decisión central de este módulo.
export function estadoDeLinea(
  plan: PlanDeLinea,
  hoyMilis: number,
): { estado: EstadoLinea; consumido: number; desvio: number | null } {
  const inicio = aMilis(plan.fechaAprobacion);
  const fin = aMilis(plan.fechaObjetivo);

  // Cerrado gana sobre todo lo demás, incluso sobre vencido. Un plan que se cerró tarde ya no
  // es una deuda abierta: es historia, y dejarlo en rojo compitiendo por atención con lo que
  // sí está pendiente es lo que hace que un tablero deje de servir.
  if (plan.fechaCierre !== null || plan.estado === 'CERRADA' || plan.estado === 'CERRADO') {
    return { estado: 'CERRADO', consumido: 1, desvio: null };
  }
  if (fin === null) return { estado: 'NO_INICIADO', consumido: 0, desvio: null };
  if (inicio !== null && hoyMilis < inicio) {
    return { estado: 'NO_INICIADO', consumido: 0, desvio: null };
  }
  if (hoyMilis > fin) return { estado: 'VENCIDO', consumido: 1, desvio: plan.avance - 100 };

  const arranque = inicio ?? fin;
  const total = Math.max(fin - arranque, DIA);
  const consumido = Math.min(Math.max((hoyMilis - arranque) / total, 0), 1);
  const desvio = plan.avance - consumido * 100;

  return {
    estado: desvio < -HOLGURA_DESVIO ? 'EN_RIESGO' : 'EN_PLAZO',
    consumido,
    desvio,
  };
}

const ORDEN_ESTADO: EstadoLinea[] = ['VENCIDO', 'EN_RIESGO', 'EN_PLAZO', 'NO_INICIADO', 'CERRADO'];

/// Arma la línea de tiempo entera.
///
/// El orden de las barras es por URGENCIA y no por fecha: vencidos arriba, después en riesgo,
/// y los cerrados al final. Un Gantt ordenado por fecha esconde lo vencido en medio de la
/// lista justamente cuando es lo único que hay que mirar.
export function armarLinea(
  planes: readonly PlanDeLinea[],
  hoy: Date,
  margenDias = 15,
): LineaDeTiempo {
  const hoyMilis = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());

  const conFecha = planes.filter((p) => aMilis(p.fechaObjetivo) !== null);
  const sinFecha = planes.filter((p) => aMilis(p.fechaObjetivo) === null);

  // La ventana abarca todo lo dibujable MÁS hoy: un Gantt donde la línea de hoy cae fuera del
  // lienzo no deja ver si algo está por vencer, que es para lo que se abre.
  const puntos: number[] = [hoyMilis];
  for (const p of conFecha) {
    const i = aMilis(p.fechaAprobacion);
    const f = aMilis(p.fechaObjetivo)!;
    if (i !== null) puntos.push(i);
    puntos.push(f);
  }
  const margen = margenDias * DIA;
  const desde = Math.min(...puntos) - margen;
  const hasta = Math.max(...puntos) + margen;
  const ventana = Math.max(hasta - desde, DIA);

  const barras: BarraPlan[] = conFecha.map((plan) => {
    const fin = aMilis(plan.fechaObjetivo)!;
    // Sin fecha de aprobación la barra arranca en la ventana, no en el fin: un plan aprobado
    // sin registrar la fecha sigue teniendo un plazo que corre, y dibujarlo como un punto el
    // día del vencimiento lo haría parecer instantáneo.
    const inicioMilis = aMilis(plan.fechaAprobacion) ?? desde;
    const { estado, consumido, desvio } = estadoDeLinea(plan, hoyMilis);
    const inicio = (Math.min(inicioMilis, fin) - desde) / ventana;
    // Mínimo de medio punto porcentual de ancho: una barra de cero no se ve ni se puede
    // señalar, y un plan de un solo día existe igual que uno de un año.
    const ancho = Math.max((fin - Math.min(inicioMilis, fin)) / ventana, 0.005);
    return { plan, inicio, ancho, estado, consumido, desvio };
  });

  barras.sort(
    (a, b) =>
      ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado) ||
      (aMilis(a.plan.fechaObjetivo)! - aMilis(b.plan.fechaObjetivo)!) ||
      a.plan.codigo.localeCompare(b.plan.codigo),
  );

  // Las marcas de mes: el primer día de cada mes dentro de la ventana.
  const meses: { etiqueta: string; posicion: number }[] = [];
  const primero = new Date(desde);
  let cursor = Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() + 1, 1);
  while (cursor < hasta) {
    const d = new Date(cursor);
    meses.push({
      etiqueta: `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      posicion: (cursor - desde) / ventana,
    });
    cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }

  const cuenta = (e: EstadoLinea) => barras.filter((b) => b.estado === e).length;
  const abiertos = planes.filter(
    (p) => p.fechaCierre === null && p.estado !== 'CERRADA' && p.estado !== 'CERRADO',
  );

  return {
    barras,
    sinFecha,
    desde: aTexto(desde),
    hasta: aTexto(hasta),
    meses,
    resumen: {
      total: planes.length,
      sinFechaObjetivo: sinFecha.length,
      porEstado: ORDEN_ESTADO.map((e) => ({ estado: e, n: cuenta(e) })),
      // Con cero abiertos el promedio no es 0 %, es indefinido — y se dice con 0 sólo porque
      // no hay nada que promediar, no porque nadie haya avanzado. La pantalla lo distingue
      // mirando `total` contra los cerrados.
      avancePromedioAbiertos:
        abiertos.length === 0
          ? 0
          : Math.round(abiertos.reduce((s, p) => s + p.avance, 0) / abiertos.length),
      enRiesgo: cuenta('EN_RIESGO'),
      vencidos: cuenta('VENCIDO'),
    },
  };
}

/// La posición de HOY dentro de la ventana, de 0 a 1. La línea vertical del Gantt.
export function posicionDeHoy(linea: LineaDeTiempo, hoy: Date): number {
  const desde = aMilis(linea.desde)!;
  const hasta = aMilis(linea.hasta)!;
  const hoyMilis = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.min(Math.max((hoyMilis - desde) / Math.max(hasta - desde, DIA), 0), 1);
}
