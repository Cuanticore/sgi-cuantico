// app/mi-sig/bandeja.query.ts
//
// La bandeja de la persona, agrupada tal como la dibuja el lienzo: vencidas arriba,
// luego por vencer, luego pendientes, y las realizadas colapsadas al final. Vencida,
// por vencer y «hace N días» se CALCULAN al leer (R3); el estado guardado nunca cambia.

import { prisma } from '@/lib/db';
import { diasHasta, esVencida } from '@/lib/sig/cierre';
import { avanceDelCurso, hayIntentoEnCurso, type ProgresoDeCurso } from '@/lib/sig/formacion';

export type EstadoBandeja = 'PENDIENTE' | 'REALIZADA' | 'NO_APLICA' | 'ANULADA';

export interface TarjetaBandeja {
  id: number;
  tipo: 'CAPACITACION' | 'LECTURA' | 'VERIFICACION' | 'TAREA' | 'CURSO_VIRTUAL';
  /// Cualquier tipo puede exigir firma. Cuando la exige, el cierre pasa por los tres pasos
  /// de leer/aceptar/firmar en vez del panel normal.
  exigeFirma: boolean;
  declaracion: string | null;
  codigo: string;
  titulo: string;
  descripcion: string;
  procedimientoOrigen: string | null;
  version: number;
  periodo: string;
  fechaLimite: Date;
  /// Cuándo se cerró. Nula mientras siga abierta, y también en una realizada antigua a la
  /// que nadie le grabó la fecha: la fila de realizadas la distingue de un cierre sin fecha
  /// en vez de inventarle una.
  fechaCierre: Date | null;
  estado: EstadoBandeja;
  vencida: boolean;
  /// Días desde la fecha límite si está vencida; negativos si faltan.
  dias: number;
  exigeEvaluacion: boolean;
  notaMinima: number | null;
  /// P14 · con paquete SCORM, el cierre lo hace el player: el formulario de asistencia y
  /// nota desaparece. Dejar los dos caminos abiertos permitiría declararse aprobado en el
  /// curso que no se abrió, y anularía la razón de ser del player.
  tienePaqueteScorm: boolean;
  /// REQ-SIG-26 · qué clase de curso virtual es. `null` en todo lo que no es un curso.
  ///
  /// El panel **dejó de inferirlo** de si había paquete o URL cargados: con la clase
  /// declarada puede decir CUÁL de las dos cosas falta cuando el curso está vacío, en vez
  /// del genérico «no tiene contenido cargado», y sabe si el cierre lo hace el reproductor
  /// o la declaración de la persona sin adivinarlo.
  claseCurso: 'PAQUETE' | 'ENLACE' | null;
  /// REQ-SIG-24 · si esta asignación ya tiene un intento del curso empezado. Es lo único
  /// que separa «Iniciar» de «Reanudar», y se pregunta acá —no en el cliente— porque la
  /// bandeja ya trae todo lo que la tarjeta necesita decir.
  cursoIniciado: boolean;
  /// El avance del curso, ya redactado. `null` cuando no hay nada que decir: sin intentos, o
  /// porque lo que se está mirando no es un curso de paquete y hablar de avance ahí sería
  /// hablar de algo que nunca existió.
  ///
  /// **Por qué no basta `cursoIniciado`.** Hasta el 21/09/2026 la bandeja sólo llevaba ese
  /// booleano, así que la persona que estaba haciendo el curso no tenía dónde ver cuánto
  /// llevaba: el porcentaje existía en la base y lo veía **únicamente un administrador**, en
  /// `/sig/colaboradores/[id]`. Se migró un paquete de SCORM 1.2 a 2004 justamente para
  /// tener `cmi.progress_measure`, y quien lo recorría no iba a verlo.
  ///
  /// La frase viene hecha de `progresoDeCurso` y la pantalla la repite tal cual. Si la
  /// pantalla la recompusiera a partir del porcentaje habría dos redacciones del mismo
  /// hecho, y el día que una diga «45%» y la otra «empezado» nadie podría decir cuál miente.
  progreso: ProgresoDeCurso | null;
  documentoVersion: string | null;
  documentoUrl: string | null;
  documentoNombre: string | null;
  /// Cierre administrativo (R5): visible en la bandeja.
  cierreAdministrativo: boolean;
  /// Ítems de una verificación, con sus flags reales (R4).
  items: { id: number; texto: string; obligatorio: boolean; permiteNoAplica: boolean }[];
}

export interface Bandeja {
  persona: { nombre: string; area: string | null; cargo: string | null } | null;
  contadores: { vencidas: number; porVencer: number; realizadasPeriodo: number };
  vencidas: TarjetaBandeja[];
  porVencer: TarjetaBandeja[];
  pendientes: TarjetaBandeja[];
  realizadas: TarjetaBandeja[];
}

export async function leerBandeja(correo: string): Promise<Bandeja> {
  const persona = await prisma.persona.findUnique({
    where: { correo },
    select: { nombre: true, area: { select: { nombre: true } }, cargo: { select: { nombre: true } } },
  });
  if (!persona) {
    return {
      persona: null,
      contadores: { vencidas: 0, porVencer: 0, realizadasPeriodo: 0 },
      vencidas: [],
      porVencer: [],
      pendientes: [],
      realizadas: [],
    };
  }

  const filas = await prisma.asignacion.findMany({
    where: { persona: { correo } },
    orderBy: [{ fechaLimite: 'asc' }],
    include: {
      // `paquetes` viaja con el contenido por los dos caminos —el directo y el de la
      // obligación— porque la tarjeta se arma con el que haya: traerlo sólo en uno haría
      // que la misma capacitación mostrara el formulario manual según de dónde colgara.
      contenido: {
        include: { items: { orderBy: { orden: 'asc' } }, paquetes: { select: { id: true }, take: 1 } },
      },
      obligacion: {
        include: {
          contenido: {
            include: { items: { orderBy: { orden: 'asc' } }, paquetes: { select: { id: true }, take: 1 } },
          },
        },
      },
      cerradaPorPersona: { select: { nombre: true } },
      // **Sin filtro por estado y sin `take`, y las dos cosas importan.**
      //
      // Antes era `{ where: { estado: 'EN_CURSO' }, select: { id: true }, take: 1 }`, porque
      // la única pregunta era binaria. Ahora hay que redactar el avance, y eso necesita el
      // intento VIGENTE —el de número más alto— que puede estar `SUSPENDIDO`: ése es
      // justamente el caso de «Guardado en el 50% para seguir», el más útil de todos y el
      // que el filtro de `EN_CURSO` dejaba fuera.
      //
      // `cursoIniciado` conserva su significado exacto y se calcula abajo sobre esta misma
      // lista. Derivarlo de «hay algún intento» habría cambiado el verbo del botón para una
      // asignación con un intento abandonado, que es otra cosa.
      intentosScorm: {
        select: { numero: true, estado: true, progressMeasure: true, ultimaActividadEn: true },
      },
    },
  });

  const hoy = new Date();

  const tarjetas: TarjetaBandeja[] = filas.map((f) => {
    const contenido = f.contenido ?? f.obligacion?.contenido;
    const fechaLimite = f.fechaLimite;
    const vencida = esVencida(f.estado, fechaLimite, hoy);
    // Se restaba `diaDe`, que empaqueta la fecha como `YYYYMMDD`: entre el 31 de agosto y
    // el 1 de septiembre daba 70 «días». La bandeja agrupa y redacta el plazo con este
    // número, así que el último día de cada mes movía las tarjetas de grupo y anunciaba
    // plazos imposibles. `diasHasta` cuenta días calendario, que es lo que se lee.
    const dias = diasHasta(fechaLimite, hoy);
    return {
      id: f.id,
      tipo: contenido?.tipo ?? 'TAREA',
      codigo: contenido?.codigo ?? '—',
      titulo: contenido?.titulo ?? f.titulo ?? 'Asignación puntual',
      descripcion: contenido?.descripcion ?? f.descripcion ?? '',
      procedimientoOrigen: contenido?.procedimientoOrigen ?? null,
      version: contenido?.version ?? 1,
      periodo: f.periodo,
      fechaLimite,
      fechaCierre: f.fechaCierre,
      estado: f.estado as EstadoBandeja,
      vencida,
      dias,
      exigeEvaluacion: contenido?.exigeEvaluacion ?? false,
      // El mecanismo de firma no es un TIPO de contenido: cualquiera puede exigirla.
      exigeFirma: contenido?.exigeFirma ?? false,
      declaracion: contenido?.declaracion ?? null,
      notaMinima: contenido?.notaMinima ? Number(contenido.notaMinima) : null,
      tienePaqueteScorm: (contenido?.paquetes.length ?? 0) > 0,
      claseCurso: contenido?.claseCurso ?? null,
      cursoIniciado: hayIntentoEnCurso(f.intentosScorm),
      // `avanceDelCurso` decide también CUÁNDO callarse: sólo un CURSO_VIRTUAL de clase
      // PAQUETE puede tener avance conocido, y para el resto devuelve `null` en vez de
      // inventar una frase. Esa regla vive en `formacion.ts` y se reusa acá en lugar de
      // repetirse, que es lo que hace que la pestaña Pendientes y la pestaña Formación no
      // puedan redactar el mismo avance de dos maneras distintas.
      progreso: avanceDelCurso(
        contenido?.tipo ?? 'TAREA',
        contenido?.claseCurso ?? null,
        f.intentosScorm.map((i) => ({
          numero: i.numero,
          estado: i.estado,
          // `Decimal` de Prisma. `null` es «el paquete no lo reportó», y NO es cero.
          progressMeasure: i.progressMeasure === null ? null : Number(i.progressMeasure),
          ultimaActividadEn: i.ultimaActividadEn,
        })),
      ).progreso,
      documentoVersion: contenido?.documentoVersion ?? null,
      documentoUrl: contenido?.documentoUrl ?? null,
      documentoNombre: contenido?.documentoNombre ?? null,
      cierreAdministrativo: f.cerradaPor !== null && f.cerradaPor !== f.personaId,
      items: (contenido?.items ?? []).map((i) => ({
        id: i.id,
        texto: i.texto,
        obligatorio: i.obligatorio,
        permiteNoAplica: i.permiteNoAplica,
      })),
    };
  });

  const exigibles = tarjetas.filter((t) => t.estado === 'PENDIENTE');
  const realizadas = tarjetas.filter((t) => t.estado === 'REALIZADA');

  const dentroDe = (dias: number) =>
    exigibles.filter((t) => !t.vencida && t.dias >= 0 && t.dias <= dias);
  const fueraDe = (dias: number) => exigibles.filter((t) => !t.vencida && t.dias > dias);

  return {
    persona: { nombre: persona.nombre, area: persona.area?.nombre ?? null, cargo: persona.cargo?.nombre ?? null },
    contadores: {
      vencidas: exigibles.filter((t) => t.vencida).length,
      porVencer: exigibles.filter((t) => !t.vencida && t.dias <= 7).length,
      realizadasPeriodo: realizadas.length,
    },
    vencidas: exigibles.filter((t) => t.vencida),
    porVencer: dentroDe(7),
    pendientes: fueraDe(7),
    realizadas,
  };
}