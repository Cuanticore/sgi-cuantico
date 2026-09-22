// lib/sig/formacion.ts
//
// Qué cuenta como formación, y cómo se dice el avance de un curso.
//
// Vive acá —puro, sin Prisma y sin sesión— por la misma razón que `bandeja.ts`: son reglas,
// no adornos, y una regla que sólo se puede comprobar montando la pantalla entera termina
// sin comprobarse. La pestaña Pendientes y la pestaña Formación redactan el mismo avance;
// si cada una lo armara por su cuenta, el día que una diga «45%» y la otra «empezado»
// nadie va a poder decir cuál miente.
//
// **Y vive acá y no en la acción por una razón dura**: `TIPOS_DE_FORMACION` es un
// `export const`, y un `export const` dentro de un archivo `'use server'` tumba el
// despliegue. Es la cicatriz del 16/09/2026 que `HARNESS.md` documenta.

/// Los dos tipos de contenido que son formación.
///
/// **Se DECLARAN, no se infieren de tener un paquete SCORM cargado.** El esquema ya explica
/// por qué (`prisma/schema.prisma`, `TipoContenido.CURSO_VIRTUAL`): el reproductor se
/// activaba cuando una CAPACITACION resultaba tener paquete, así que el tipo decía una cosa
/// y el comportamiento dependía de un adjunto. Repetir esa inferencia acá reintroduciría el
/// mismo defecto en otra pantalla.
///
/// Una LECTURA de una política no es formación aunque enseñe algo, y una VERIFICACION
/// tampoco. Se cuentan entre los pendientes; no entran a la pestaña de formación.
export const TIPOS_DE_FORMACION = ['CAPACITACION', 'CURSO_VIRTUAL'] as const;

export type TipoDeFormacion = (typeof TIPOS_DE_FORMACION)[number];

/// La clase de un curso virtual. `null` en todo lo que no es un curso virtual.
export type ClaseCurso = 'PAQUETE' | 'ENLACE';

export type EstadoDeIntento = 'EN_CURSO' | 'SUSPENDIDO' | 'COMPLETADO' | 'ABANDONADO';

export function esFormacion(tipo: string): boolean {
  return (TIPOS_DE_FORMACION as readonly string[]).includes(tipo);
}

/// ¿Hay un intento del curso EN MARCHA? Es lo único que separa «Iniciar» de «Reanudar».
///
/// **Es una función y no un `.some()` suelto en la consulta por una razón concreta.** Hasta
/// el 21/09/2026 lo resolvía un filtro de Prisma —`where: { estado: 'EN_CURSO' }`— y ese
/// filtro tuvo que irse: redactar el avance necesita también los intentos SUSPENDIDOS, que
/// son justamente el caso de «Guardado en el 50% para seguir». Al quedar como una expresión
/// suelta junto a una lista sin filtrar, «simplificarla» a `intentos.length > 0` se ve
/// inocente y cambia el verbo del botón para una asignación cuyo único intento está
/// abandonado o completado.
///
/// SUSPENDIDO tampoco cuenta, y es deliberado: un curso guardado para seguir se reanuda,
/// pero lo que la tarjeta necesita saber es si hay una sesión viva. Esa distinción la
/// redacta `progresoDeCurso` con su propia frase.
export function hayIntentoEnCurso(intentos: readonly { estado: string }[]): boolean {
  return intentos.some((i) => i.estado === 'EN_CURSO');
}

/// Lo que este módulo necesita de un intento. Deliberadamente menos que `IntentoScorm`: el
/// `cmi` completo, el tiempo y la ip no deciden nada de lo que se redacta acá.
export interface IntentoParaProgreso {
  numero: number;
  estado: string;
  /// 0–1, tal como SCORM lo define. `null` es «el paquete no lo reportó», que NO es cero.
  progressMeasure: number | null;
  ultimaActividadEn: Date;
}

export interface ProgresoDeCurso {
  /// Cuántos intentos hay en total. El avance es el del último, pero «va por el 20%» se lee
  /// distinto cuando es el cuarto intento.
  intentos: number;
  /// El número del intento VIGENTE, que es el más alto.
  numero: number;
  estado: EstadoDeIntento;
  /// 0–100, o `null` cuando el paquete no reportó `progressMeasure`. **`null` no es 0.**
  porcentaje: number | null;
  /// La frase ya redactada, una sola vez y en un solo lugar.
  etiqueta: string;
  /// `YYYY-MM-DD` de la última actividad del intento vigente.
  ultimaActividadEn: string | null;
}

/// El avance del intento VIGENTE, que es el del número más alto — **no el del mejor**.
///
/// La pregunta que contesta esta pestaña es dónde está la persona ahora. Quien reprobó con
/// el 90% y volvió a empezar está en el 5%, no en el 90%: mostrar el mejor haría creer que
/// está por terminar justo cuando acaba de arrancar de nuevo. El mejor resultado se ve en la
/// calificación, y el historial completo en el expediente.
export function progresoDeCurso(intentos: IntentoParaProgreso[]): ProgresoDeCurso | null {
  if (intentos.length === 0) return null;

  // Se busca el máximo en vez de confiar en el orden de quien llama: la consulta puede
  // ordenar por fecha, y un intento reanudado tiene actividad más reciente que uno posterior
  // que nadie tocó.
  const vigente = intentos.reduce((a, b) => (b.numero > a.numero ? b : a));
  const estado = comoEstado(vigente.estado);
  const porcentaje =
    vigente.progressMeasure === null ? null : Math.round(vigente.progressMeasure * 100);

  return {
    intentos: intentos.length,
    numero: vigente.numero,
    estado,
    porcentaje,
    etiqueta: etiquetaDe(estado, porcentaje),
    ultimaActividadEn: vigente.ultimaActividadEn.toISOString().slice(0, 10),
  };
}

/// Por qué no hay avance que mostrar, cuando no lo hay. `null` es «no hay nada que explicar»:
/// o el curso sí tiene avance, o lo que se está mirando no es un curso y hablar de avance
/// ahí sería hablar de algo que nunca existió.
///
/// Son tres motivos y cada uno significa otra cosa. Una sola frase genérica para los tres
/// dejaría a quien mira sin saber si el curso está sin empezar, si es presencial o si corre
/// afuera del sistema — que son tres acciones distintas de su parte.
export function fraseSinProgreso(
  tipo: string,
  claseCurso: ClaseCurso | null,
  tieneIntentos: boolean,
): string | null {
  if (tipo === 'CAPACITACION') return 'No es un curso en línea: se registra asistencia';
  if (tipo !== 'CURSO_VIRTUAL') return null;
  if (claseCurso === 'ENLACE') return 'Curso externo: el avance no vuelve al sistema';
  if (claseCurso === 'PAQUETE') return tieneIntentos ? null : 'Sin abrir';
  // Un curso virtual sin clase declarada todavía no es ninguna de las dos cosas, y REQ-SIG-26
  // existe justamente para poder decir cuál falta en vez del genérico «no tiene contenido».
  return 'Curso sin clase declarada: falta decir si es paquete o enlace';
}

/// La decisión completa, en una sola llamada: el avance cuando se puede conocer, y la razón
/// cuando no. Las dos pestañas llaman acá y no a las dos funciones por separado, porque el
/// caso torcido —un curso por enlace con intentos colgados— sólo se resuelve bien si alguien
/// mira las dos cosas a la vez.
export function avanceDelCurso(
  tipo: string,
  claseCurso: ClaseCurso | null,
  intentos: IntentoParaProgreso[],
): { progreso: ProgresoDeCurso | null; sinProgresoPorque: string | null } {
  // **Sólo un curso con PAQUETE puede tener avance conocido.** La base no impide que un
  // curso de clase ENLACE tenga intentos colgados —de cuando el curso era otra cosa, por
  // ejemplo—, y si los tuviera, informar su avance sería afirmar algo sobre un curso que
  // corre fuera del sistema. El sistema no puede saberlo; decir que sí es peor que callarse.
  const puedeTenerAvance = tipo === 'CURSO_VIRTUAL' && claseCurso === 'PAQUETE';
  const progreso = puedeTenerAvance ? progresoDeCurso(intentos) : null;

  return {
    progreso,
    sinProgresoPorque:
      progreso !== null ? null : fraseSinProgreso(tipo, claseCurso, intentos.length > 0),
  };
}

/// Un estado que no conocemos se trata como abandonado y no se inventa una frase: es el
/// único de los cuatro que no afirma nada sobre el avance.
function comoEstado(valor: string): EstadoDeIntento {
  return valor === 'EN_CURSO' || valor === 'SUSPENDIDO' || valor === 'COMPLETADO'
    ? valor
    : 'ABANDONADO';
}

/// La tabla de redacción, en un solo lugar.
///
/// El caso que manda es `porcentaje === null` con el intento empezado: ahí NO se escribe un
/// porcentaje. Un «0%» en esa casilla afirma que la persona no avanzó nada, y lo único que
/// el sistema sabe es que el paquete no lo dijo.
function etiquetaDe(estado: EstadoDeIntento, porcentaje: number | null): string {
  if (estado === 'COMPLETADO') return 'Terminado';
  if (estado === 'ABANDONADO') return 'Intento abandonado';
  if (estado === 'SUSPENDIDO') {
    return porcentaje === null ? 'Guardado para seguir' : `Guardado en el ${porcentaje}% para seguir`;
  }
  return porcentaje === null ? 'Empezado; el curso no reporta avance' : `Va por el ${porcentaje}%`;
}
