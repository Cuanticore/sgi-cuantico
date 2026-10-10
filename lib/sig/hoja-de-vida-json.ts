// lib/sig/hoja-de-vida-json.ts
//
// **Tareas 3.1 y 3.2 · la hoja de vida de un sistema, en JSON.**
//
// Constructor puro: sin Prisma, sin sesión, sin `Response`. Recibe filas ya consultadas y
// devuelve objetos planos, al estilo de `lib/sgsi/inventario-libro.ts`. Eso es lo que permite
// probar la forma sin levantar una base, y lo que deja la ruta reducida a consultar y envolver.
//
// LA DECISIÓN QUE ATRAVIESA TODO EL ARCHIVO: **no sale ningún `id` interno.**
//
// `id` es un autoincremental de Postgres. No significa nada afuera, cambia si la tabla se
// repuebla desde un respaldo, y un cliente que lo guarde queda atado a un detalle de la base
// que nadie le prometió. Pero la razón de fondo es otra: la Fase 4 define las escrituras como
// `PUT` idempotentes **por clave natural** (D6). Si la lectura entregara `id`, el primer agente
// que lo usara para escribir tendría dos identidades para la misma fila — y la idempotencia,
// que es toda la garantía de esa fase, dejaría de significar algo.
//
// Por eso cada colección se identifica por lo que el `@@unique` del schema ya declara como su
// llave: la letra de la puerta, el código del requisito, la versión de la liberación.
//
// SOBRE LAS PERSONAS. Sale el nombre y nada más. El expediente las nombra porque el FOR-TEC-04
// lo exige —quién verifica, quién autoriza, quién ejecutó la prueba—, pero un token de servicio
// no necesita correos ni documentos para generar el libro. Es la minimización que el SGSI le
// aplica a cualquier otro tratamiento, aplicada también acá.

/// Lo mínimo que este módulo necesita de una persona. Se declara así —y no con el tipo de
/// Prisma— para que la prueba pueda construir una sin traer el cliente entero, y para que
/// agregar una columna a `Persona` no cambie en silencio lo que la API publica.
interface PersonaLeve {
  nombre: string;
}

/// El nombre de una persona, o `null`. Nunca se omite el campo: un cliente no debería tener
/// que distinguir «no hay responsable» de «este endpoint no lo manda».
function nombreDe(persona: PersonaLeve | null | undefined): string | null {
  return persona?.nombre ?? null;
}

/// Una fecha en ISO 8601 UTC, o `null`.
///
/// `JSON.stringify` ya lo haría con un `Date`, pero dejarlo implícito significa que el día que
/// un campo llegue como cadena desde otra capa, la forma de la respuesta cambia sin que nadie
/// lo note y sin que ninguna prueba se ponga roja.
function fecha(valor: Date | null | undefined): string | null {
  return valor ? valor.toISOString() : null;
}

export interface SistemaLeve {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  criticidad: number | null;
  clasificacionId: number | null;
  trataDatosPersonales: boolean;
  rolTratamiento: string | null;
  rtoObjetivo: number | null;
  rpoObjetivo: number | null;
  contratado: boolean;
  faseActual: string;
  abiertaEn: Date | null;
  cerradaEn: Date | null;
  activo: boolean;
  producto?: { nombre: string } | null;
  propietario?: PersonaLeve | null;
  responsableTecnico?: PersonaLeve | null;
}

/// La ficha breve: lo que devuelve el listado, y la cabecera del expediente completo.
///
/// **`clasificacionId` es la única excepción a la regla de los identificadores internos, y es
/// una excepción de la mala clase: un hueco heredado, no una decisión.**
///
/// No hay `model Clasificacion` en el schema. La columna es un `Int?` suelto, sin llave
/// foránea y sin tabla detrás; `validarActualizacionSistema` ya lo deja anotado y no la valida
/// «porque inventar una lista de valores admitidos sería inventar un catálogo que nadie
/// decidió», y la pantalla de sistemas le pide a una persona que escriba a mano «id de la
/// clasificación» en una entrada numérica libre.
///
/// Sale igual porque el expediente lo lleva y omitirlo perdería el dato, pero sale con su
/// nombre verdadero: un número sin catálogo. Cuando la tabla exista, acá pasa a salir el
/// NOMBRE de la clasificación —como ya sale el del producto— y este párrafo se borra.
///
/// Es, además, el dato que el README de cualquier repositorio necesita para su cláusula de
/// clasificación (A.5.13), así que el hueco no es cosmético.
export function fichaDeSistema(s: SistemaLeve): Record<string, unknown> {
  return {
    codigo: s.codigo,
    nombre: s.nombre,
    descripcion: s.descripcion,
    tipo: s.tipo,
    producto: s.producto?.nombre ?? null,
    criticidad: s.criticidad,
    clasificacionId: s.clasificacionId,
    trataDatosPersonales: s.trataDatosPersonales,
    rolTratamiento: s.rolTratamiento,
    /// En minutos. No son decorativos: son el insumo del BIA anual que exige el sistema de
    /// continuidad, y hoy no existen en ninguna otra parte.
    rtoObjetivo: s.rtoObjetivo,
    rpoObjetivo: s.rpoObjetivo,
    contratado: s.contratado,
    faseActual: s.faseActual,
    abiertaEn: fecha(s.abiertaEn),
    cerradaEn: fecha(s.cerradaEn),
    activo: s.activo,
    propietario: nombreDe(s.propietario),
    responsableTecnico: nombreDe(s.responsableTecnico),
  };
}

/// Las filas tal como la ruta las consulta. Todo opcional porque la ficha breve no las trae.
export interface HojaCompleta extends SistemaLeve {
  puertas?: readonly PuertaLeve[];
  excepciones?: readonly ExcepcionLeve[];
  requisitos?: readonly RequisitoLeve[];
  pruebas?: readonly PruebaLeve[];
  tratamientos?: readonly TratamientoLeve[];
  liberaciones?: readonly LiberacionLeve[];
  componentes?: readonly ComponenteLeve[];
}

interface PuertaLeve {
  puerta: string;
  resultado: string;
  fecha: Date | null;
  observacion: string | null;
  verificadoPor?: PersonaLeve | null;
  autoriza?: PersonaLeve | null;
  evidenciaId: number | null;
  excepcion?: { codigo: string } | null;
}

interface ExcepcionLeve {
  codigo: string;
  puerta: string | null;
  justificacion: string;
  evaluacionRiesgo: string;
  fechaAprobacion: Date | null;
  fechaCierre: Date | null;
  cerradaEn: Date | null;
  notaCierre: string | null;
  aprobadaPor?: PersonaLeve | null;
  cerradaPor?: PersonaLeve | null;
}

interface RequisitoLeve {
  codigo: string;
  categoria: string;
  texto: string;
  origen: string | null;
  prioridad: string | null;
  estado: string;
  observacion: string | null;
}

interface PruebaLeve {
  codigo: string;
  tipo: string;
  versionProbada: string | null;
  fecha: Date | null;
  ejecutorExterno: string | null;
  criticos: number;
  altos: number;
  medios: number;
  bajos: number;
  observacion: string | null;
  ejecutor?: PersonaLeve | null;
}

interface TratamientoLeve {
  codigo: string;
  categoria: string;
  sensibles: boolean;
  finalidad: string;
  baseLegitimacion: string;
  titulares: string | null;
  volumen: string | null;
  ubicacionAlmacenamiento: string | null;
  transferenciaInternacional: boolean;
  paisDestino: string | null;
  garantiaAplicada: string | null;
  retencion: string | null;
  responsable?: PersonaLeve | null;
}

interface LiberacionLeve {
  version: string;
  fecha: Date | null;
  tipo: string;
  planReversion: boolean;
  resultado: string | null;
  observacion: string | null;
  autoriza?: PersonaLeve | null;
  ejecuta?: PersonaLeve | null;
}

interface ComponenteLeve {
  codigo: string;
  nombre: string;
  tipo: string | null;
  funcion: string | null;
  criticidad: string | null;
  licencia: string | null;
  version: string | null;
  ultimaEvaluacion: Date | null;
  vulnerabilidadesConocidas: string | null;
  estado: string;
}

/// El expediente entero: la ficha y sus siete colecciones hijas.
///
/// **Las siete aparecen siempre**, aunque vengan vacías. Un campo ausente obliga a cada cliente
/// a distinguir «no hay» de «no vino», y esa distinción se resuelve mal en algún lado; un
/// arreglo vacío no se puede malinterpretar.
export function hojaDeVidaCompleta(s: HojaCompleta): Record<string, unknown> {
  return {
    ...fichaDeSistema(s),

    puertas: (s.puertas ?? []).map((p) => ({
      puerta: p.puerta,
      resultado: p.resultado,
      fecha: fecha(p.fecha),
      observacion: p.observacion,
      // G5 · quien verifica no es quien autoriza. Dos campos porque el procedimiento asigna
      // esas dos autoridades a roles distintos, y colapsarlas acá borraría la separación.
      verificadoPor: nombreDe(p.verificadoPor),
      autoriza: nombreDe(p.autoriza),
      tieneEvidencia: p.evidenciaId !== null,
      excepcion: p.excepcion?.codigo ?? null,
    })),

    excepciones: (s.excepciones ?? []).map((e) => ({
      codigo: e.codigo,
      puerta: e.puerta,
      justificacion: e.justificacion,
      evaluacionRiesgo: e.evaluacionRiesgo,
      fechaAprobacion: fecha(e.fechaAprobacion),
      fechaCierre: fecha(e.fechaCierre),
      cerradaEn: fecha(e.cerradaEn),
      notaCierre: e.notaCierre,
      aprobadaPor: nombreDe(e.aprobadaPor),
      cerradaPor: nombreDe(e.cerradaPor),
    })),

    requisitos: (s.requisitos ?? []).map((r) => ({
      codigo: r.codigo,
      categoria: r.categoria,
      texto: r.texto,
      origen: r.origen,
      prioridad: r.prioridad,
      estado: r.estado,
      observacion: r.observacion,
    })),

    pruebas: (s.pruebas ?? []).map((p) => ({
      codigo: p.codigo,
      tipo: p.tipo,
      versionProbada: p.versionProbada,
      fecha: fecha(p.fecha),
      ejecutor: nombreDe(p.ejecutor) ?? p.ejecutorExterno,
      hallazgos: { criticos: p.criticos, altos: p.altos, medios: p.medios, bajos: p.bajos },
      observacion: p.observacion,
    })),

    tratamientos: (s.tratamientos ?? []).map((t) => ({
      codigo: t.codigo,
      categoria: t.categoria,
      sensibles: t.sensibles,
      finalidad: t.finalidad,
      baseLegitimacion: t.baseLegitimacion,
      titulares: t.titulares,
      volumen: t.volumen,
      ubicacionAlmacenamiento: t.ubicacionAlmacenamiento,
      transferenciaInternacional: t.transferenciaInternacional,
      paisDestino: t.paisDestino,
      garantiaAplicada: t.garantiaAplicada,
      retencion: t.retencion,
      responsable: nombreDe(t.responsable),
    })),

    liberaciones: (s.liberaciones ?? []).map((l) => ({
      version: l.version,
      fecha: fecha(l.fecha),
      tipo: l.tipo,
      planReversion: l.planReversion,
      resultado: l.resultado,
      observacion: l.observacion,
      autoriza: nombreDe(l.autoriza),
      ejecuta: nombreDe(l.ejecuta),
    })),

    componentes: (s.componentes ?? []).map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: c.tipo,
      funcion: c.funcion,
      criticidad: c.criticidad,
      licencia: c.licencia,
      version: c.version,
      ultimaEvaluacion: fecha(c.ultimaEvaluacion),
      vulnerabilidadesConocidas: c.vulnerabilidadesConocidas,
      estado: c.estado,
    })),
  };
}
