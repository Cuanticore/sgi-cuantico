// lib/sig/resumen.ts
//
// Qué correos hay que enviar y para quién. Puro a propósito: N1 (sin nada no se envía),
// N2 (un correo por persona) y la acotación del mensual por área son decisiones que se
// prueban sin SMTP. El envío en sí vive en lib/sig/envios.ts.

import {
  cumplimientoDePeriodo,
  deudaVencida,
  cierresAdministrativos,
  diasEntre,
  medianocheUtc,
  type AsignacionIndicador,
  type CumplimientoPeriodo,
} from './cumplimiento';

export interface TareaResumen {
  id: number;
  tipo: string;
  codigo: string;
  titulo: string;
  fechaLimite: Date;
  estado: string;
  correo: string;
  obligacionTitulo: string | null;
}

export interface TareaLinea {
  id: number;
  tipo: string;
  codigo: string;
  titulo: string;
  fechaLimite: Date;
  /// Días vencida (negativo) o días restantes (positivo); 0 = vence hoy.
  dias: number;
}

export interface ObligacionParaResponsable {
  titulo: string;
  abiertas: number;
  vencidas: number;
}

export interface SemanalPersona {
  vencidas: TareaLinea[];
  porVencer: TareaLinea[];
}

export interface SemanalResponsable {
  obligaciones: ObligacionParaResponsable[];
}

export interface PlanSemanal {
  /// Un correo por persona con pendientes (N2).
  paraPersona: Map<string, SemanalPersona>;
  /// Un correo por responsable de seguimiento (decisión 2 del plan).
  paraResponsable: Map<string, SemanalResponsable>;
}

export function planificarSemanales(
  asignaciones: readonly TareaResumen[],
  hoy: Date,
  responsableCorreo?: string,
): PlanSemanal {
  const paraPersona = new Map<string, SemanalPersona>();
  const porResponsable = new Map<string, SemanalResponsable>();

  for (const a of asignaciones) {
    if (a.estado !== 'PENDIENTE') continue;
    // Restar `diaDe` era un defecto: devuelve `YYYYMMDD`, que compara bien y resta mal.
    // Del 28 de agosto al 1 de septiembre daban 73 «dias», asi que una tarea que vencia
    // en CUATRO no entraba en `dias <= 7` y desaparecia del correo del lunes. Pasaba en
    // toda semana que cruzara un fin de mes: doce veces al año, en silencio.
    const dias = diasEntre(medianocheUtc(hoy), medianocheUtc(a.fechaLimite));
    const linea: TareaLinea = {
      id: a.id,
      tipo: a.tipo,
      codigo: a.codigo,
      titulo: a.titulo,
      fechaLimite: a.fechaLimite,
      dias,
    };
    const persona = paraPersona.get(a.correo) ?? { vencidas: [], porVencer: [] };
    if (dias < 0) persona.vencidas.push(linea);
    else if (dias <= 7) persona.porVencer.push(linea);
    paraPersona.set(a.correo, persona);

    if (responsableCorreo && a.obligacionTitulo) {
      const resp = porResponsable.get(responsableCorreo) ?? { obligaciones: [] };
      const existente = resp.obligaciones.find((o) => o.titulo === a.obligacionTitulo);
      if (existente) {
        existente.abiertas += 1;
        if (dias < 0) existente.vencidas += 1;
      } else {
        resp.obligaciones.push({
          titulo: a.obligacionTitulo,
          abiertas: 1,
          vencidas: dias < 0 ? 1 : 0,
        });
      }
      porResponsable.set(responsableCorreo, resp);
    }
  }

  // N1: quien no tiene nada no figura.
  for (const [correo, s] of paraPersona) {
    if (s.vencidas.length === 0 && s.porVencer.length === 0) paraPersona.delete(correo);
  }
  for (const [correo, r] of porResponsable) {
    if (r.obligaciones.every((o) => o.abiertas === 0)) porResponsable.delete(correo);
  }

  return { paraPersona, paraResponsable: porResponsable };
}

export interface AreaMensual {
  id: number;
  nombre: string;
  liderCorreo: string | null;
}

/// Una asignación del mes cerrado, con el área de su persona para acotar el resumen.
export interface TareaMensual extends TareaResumen {
  areaId: number | null;
  fechaCierre: Date | null;
  cerradaPor: number | null;
}

export interface ResumenMensual {
  areaNombre: string;
  /// El mes que cerró: { anio, mes } con mes 0-indexado.
  mes: { anio: number; mes: number };
  cumplimiento: CumplimientoPeriodo;
  deuda: { cantidad: number; masAntiguaDias: number | null };
  peorCumplimiento: { codigo: string; titulo: string; porciento: number | null }[];
  cierresAdministrativos: number;
  /// El cierre del mes ANTERIOR, para la comparacion de una frase que pide el lienzo.
  /// `null` cuando ese mes no tiene nada medible: «no se puede comparar» y «cerro en 0 %»
  /// no son lo mismo.
  mesAnterior: { anio: number; mes: number; porciento: number } | null;
}

/// El mensual (decisión 3): líderes de proceso por su área, y el líder del SIG con
/// todas. `asignaciones` trae solo las del mes que cerró, con el área de la persona
/// y su obligación resuelta; el cumplimiento, la deuda y los cierres administrativos
/// se calculan con las mismas reglas que la barra de Obligaciones (nunca contradicen).
/// El mes anterior al cerrado. Se calcula con `Date.UTC` y no restándole 1 al número de
/// mes: en enero eso daría −1, que es el defecto que ya dejó al resumen de diciembre —el que
/// cierra el año— sin salir nunca.
function mesPrevio(mes: { anio: number; mes: number }): { anio: number; mes: number } {
  const d = new Date(Date.UTC(mes.anio, mes.mes - 1, 1));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
}

export function planificarMensuales(
  asignaciones: readonly TareaMensual[],
  areas: readonly AreaMensual[],
  liderSigCorreo: string,
  mesCerrado: { anio: number; mes: number },
  /// Las del mes ANTERIOR, para la única comparación que el lienzo pide: una frase, no un
  /// gráfico. Sin ellas el resumen sigue saliendo — la comparación queda en `null` y la
  /// frase no se dibuja. Es opcional a propósito: un correo sin comparación es útil, y uno
  /// que no sale porque faltó un dato accesorio no le sirve a nadie.
  asignacionesMesAnterior: readonly TareaMensual[] = [],
): Map<string, ResumenMensual> {
  const resultado = new Map<string, ResumenMensual>();
  const anterior = mesPrevio(mesCerrado);

  const porcientoDe = (filas: readonly TareaMensual[]): number | null => {
    if (filas.length === 0) return null;
    return cumplimientoDePeriodo(
      filas.map((a) => ({
        id: a.id,
        estado: a.estado as AsignacionIndicador['estado'],
        fechaLimite: a.fechaLimite,
        fechaCierre: a.fechaCierre,
        personaId: 0,
        cerradaPor: a.cerradaPor,
      })),
    ).porciento;
  };

  const resumenDe = (
    nombre: string,
    filas: readonly TareaMensual[],
    filasAnteriores: readonly TareaMensual[],
  ): ResumenMensual => {
    const indicadores: AsignacionIndicador[] = filas.map((a) => ({
      id: a.id,
      estado: a.estado as AsignacionIndicador['estado'],
      fechaLimite: a.fechaLimite,
      fechaCierre: a.fechaCierre,
      personaId: 0,
      cerradaPor: a.cerradaPor,
    }));
    const cumplimiento = cumplimientoDePeriodo(indicadores);
    const deuda = deudaVencida(indicadores, mesCierre(mesCerrado));
    const cierres = cierresAdministrativos(indicadores);
    const porContenido = new Map<string, { asignadas: number; aTiempo: number }>();
    for (const a of filas) {
      if (a.estado !== 'REALIZADA' && a.estado !== 'PENDIENTE') continue;
      const c = porContenido.get(a.codigo) ?? { asignadas: 0, aTiempo: 0 };
      c.asignadas += 1;
      if (a.estado === 'REALIZADA' && a.fechaCierre !== null && a.fechaCierre <= a.fechaLimite) {
        c.aTiempo += 1;
      }
      porContenido.set(a.codigo, c);
    }
    const peor = [...porContenido.entries()]
      .map(([codigo, c]) => ({
        codigo,
        titulo: codigo,
        porciento: c.asignadas === 0 ? null : Math.round((c.aTiempo / c.asignadas) * 100),
      }))
      .sort((x, y) => (x.porciento ?? 0) - (y.porciento ?? 0))
      .slice(0, 3);
    const porcientoAnterior = porcientoDe(filasAnteriores);
    return {
      areaNombre: nombre,
      mes: mesCerrado,
      cumplimiento,
      deuda,
      peorCumplimiento: peor,
      cierresAdministrativos: cierres,
      // Sin mes anterior medible no hay comparación. `null` y no cero: «no se puede
      // comparar» y «cerró en 0 %» son dos cosas distintas, y confundirlas es cómo un
      // correo termina anunciando una caída que nunca ocurrió.
      mesAnterior: porcientoAnterior === null ? null : { ...anterior, porciento: porcientoAnterior },
    };
  };

  if (liderSigCorreo) {
    resultado.set(liderSigCorreo, resumenDe('Todas las áreas', asignaciones, asignacionesMesAnterior));
  }

  for (const area of areas) {
    if (!area.liderCorreo) continue;
    // Cada líder de proceso ve SOLO su área. Pasar `asignaciones` completo mandaba el
    // cumplimiento, la deuda y las peores obligaciones de TODA la organización bajo el
    // rótulo «tu área» del encabezado: una fuga entre áreas, no un rótulo impreciso.
    // `areaId` nulo es la persona sin área: no cuelga de ninguna, así que entra solo en el
    // resumen del líder del SIG —el mismo criterio que `proximasDelArea`—.
    resultado.set(
      area.liderCorreo,
      resumenDe(
        area.nombre,
        asignaciones.filter((a) => a.areaId === area.id),
        // El mes anterior tambien acotado al area: comparar el area contra la organizacion
        // entera seria la misma fuga que el filtro de arriba vino a cerrar.
        asignacionesMesAnterior.filter((a) => a.areaId === area.id),
      ),
    );
  }

  return resultado;
}

/// La fecha de cierre del mes (último día), para calcular la deuda contra el mes.
function mesCierre(mes: { anio: number; mes: number }): Date {
  return new Date(Date.UTC(mes.anio, mes.mes + 1, 0));
}
