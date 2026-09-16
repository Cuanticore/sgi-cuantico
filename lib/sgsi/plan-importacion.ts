// lib/sgsi/plan-importacion.ts
//
// La lectura de FOR-SIG-13 «Plan de Tratamiento y Mejora»: de una fila del libro a un plan
// que el modelo acepte, o a un rechazo con su motivo escrito.
//
// Módulo PURO: sin Prisma y sin ExcelJS. Recibe filas ya extraídas —una lista de celdas— y los
// catálogos ya resueltos, y decide. Así una prueba puede pasarle la fila exacta que el cliente
// mandó y leer por qué se rechazó, sin base y sin archivo.
//
// ── NINGUNA FILA SE DESCARTA EN SILENCIO ────────────────────────────────────────────────
//
// Es la regla que gobierna todo este archivo. Una importación que dice «se crearon 40 de 57»
// sin decir qué pasó con las 17 restantes obliga a comparar a mano contra el Excel, que es
// justamente el trabajo que la importación venía a evitar. Cada fila sale o como plan válido o
// como rechazo con número de fila y motivo en castellano.
//
// Y NO SE ADIVINA. Un control que no coincide exactamente con el catálogo no se «aproxima» al
// más parecido: se rechaza diciendo qué se recibió y qué se esperaba. Un plan colgado del
// control equivocado es peor que un plan que no se creó — el primero se descubre en una
// auditoría, el segundo en la pantalla de resultados.
//
// ── LAS DOS CLASES DE PLAN ──────────────────────────────────────────────────────────────
//
// El formato es UNA matriz con «Plan de Tratamiento de Riesgos» y «Plan de Mejora». Las dos
// entran, y la diferencia queda en `clase` — una columna, no un texto enterrado en `origen`.
// Lo que las distingue en el modelo es qué se les puede exigir: a un plan de tratamiento se le
// puede pedir el riesgo que lo motiva; a uno de mejora, no. Exigírselo a los dos dejaría fuera
// la mitad de la matriz.

import type { ClasePlan, EstadoAccion, TipoAccion, VerificacionEficacia } from '@prisma/client';

/// Las columnas del formato, por índice base 0 dentro de la fila.
///
/// ── A–O SON EL FORMATO DEL CLIENTE, INTACTO ─────────────────────────────────────────────
///
/// Las quince primeras son las de FOR-SIG-13 v01, en su orden y con su nombre. No se reordenan
/// ni se renombran: el formato lo llena gente que ya lo conoce, y mover una columna convierte
/// un archivo a medio llenar en uno que importa mal sin avisar.
///
/// De P en adelante van las que el modelo exige y el formato no traía. Van AL FINAL y juntas,
/// bajo su propio encabezado, para que se lean como lo que son: lo que el sistema necesita
/// además de lo que el formato ya pedía.
export const COLUMNA = {
  tipoPlan: 0,
  id: 1,
  codigo: 2,
  proceso: 3,
  propietarioRiesgo: 4,
  actividad: 5,
  descripcion: 6,
  responsableEjecucion: 7,
  fechaTerminacion: 8,
  seguimiento: 9,
  fechaSeguimiento: 10,
  recursos: 11,
  verificacionEficacia: 12,
  observaciones: 13,
  madurezAlcanzada: 14,
  // ── lo que agrega el sistema ──────────────────────────────────────────────────────────
  tipoAccion: 15,
  control: 16,
  estado: 17,
  avance: 18,
  fechaAprobacion: 19,
  justificacionAceptacion: 20,
  fechaRevisionAceptacion: 21,
  instrumento: 22,
  riesgoRemanente: 23,
} as const;

/// Los encabezados, en orden. Se exportan para que el generador de la plantilla y el lector
/// usen la MISMA lista: una plantilla cuyos encabezados no coincidan con lo que el lector
/// espera es un archivo que se llena bien y se importa mal.
export const ENCABEZADOS: readonly string[] = [
  'Tipo de Plan',
  'Id',
  'Código del plan',
  'Proceso',
  'Propietario del riesgo',
  'Actividad',
  'Descripción',
  'Responsable de ejecución de actividad',
  'Fecha terminación',
  'Seguimiento',
  'Fecha de seguimiento',
  'Recursos o presupuesto',
  'Verificación de eficacia',
  'Observaciones',
  'Madurez alcanzada',
  'Tipo de acción',
  'Control',
  'Estado',
  'Avance %',
  'Fecha de aprobación',
  'Justificación de aceptación',
  'Fecha de revisión de la aceptación',
  'Instrumento',
  'Riesgo remanente',
];

/// Lo que el usuario elige en la lista de «Tipo de Plan», y a qué clase corresponde.
export const CLASES: Record<string, ClasePlan> = {
  'plan de tratamiento de riesgos': 'TRATAMIENTO',
  'plan de tratamiento': 'TRATAMIENTO',
  'plan de gestión de riesgos': 'TRATAMIENTO',
  'plan de gestion de riesgos': 'TRATAMIENTO',
  'plan de mejora': 'MEJORA',
  'plan de implementación de control': 'MEJORA',
  'plan de implementacion de control': 'MEJORA',
};

export const TIPOS_ACCION: Record<string, TipoAccion> = {
  mitigar: 'MITIGAR',
  transferir: 'TRANSFERIR',
  evitar: 'EVITAR',
  aceptar: 'ACEPTAR',
};

export const ESTADOS: Record<string, EstadoAccion> = {
  'no iniciada': 'NO_INICIADA',
  'no iniciado': 'NO_INICIADA',
  'en ejecución': 'EN_EJECUCION',
  'en ejecucion': 'EN_EJECUCION',
  'en curso': 'EN_EJECUCION',
  'en verificación': 'EN_VERIFICACION',
  'en verificacion': 'EN_VERIFICACION',
  cerrada: 'CERRADA',
  cerrado: 'CERRADA',
  cancelada: 'CANCELADA',
  cancelado: 'CANCELADA',
};

export const VERIFICACIONES: Record<string, VerificacionEficacia> = {
  pendiente: 'PENDIENTE',
  'verificada — eficaz': 'VERIFICADA_EFICAZ',
  'verificada - eficaz': 'VERIFICADA_EFICAZ',
  eficaz: 'VERIFICADA_EFICAZ',
  'verificada — no eficaz': 'VERIFICADA_NO_EFICAZ',
  'verificada - no eficaz': 'VERIFICADA_NO_EFICAZ',
  'no eficaz': 'VERIFICADA_NO_EFICAZ',
  'no aplica': 'NO_APLICA',
};

/// Los catálogos con los que se resuelven los textos de la hoja.
export interface CatalogosImportacion {
  /// Código en mayúsculas → id. El código es la llave: el nombre de un control cambia con las
  /// revisiones de la norma y el código no.
  controlesPorCodigo: ReadonlyMap<string, number>;
  /// Nombre normalizado → id, como respaldo para quien escriba «Gestión de accesos» en vez de
  /// «A.5.15».
  controlesPorNombre: ReadonlyMap<string, number>;
  /// Nombre normalizado → id de `CargoResponsable`.
  cargosPorNombre: ReadonlyMap<string, number>;
  /// Nivel → id de `EscalaMadurez`.
  madurezPorNivel: ReadonlyMap<number, number>;
}

export interface PlanImportado {
  /// La fila del libro de la que salió, base 1. Viaja hasta el informe final para que un
  /// rechazo se pueda señalar en el archivo.
  fila: number;
  clase: ClasePlan;
  /// El código que traía la hoja, si traía. `null` hace que se emita uno nuevo.
  codigoExistente: string | null;
  accion: string;
  descripcion: string | null;
  tipo: TipoAccion;
  controlId: number | null;
  proceso: string | null;
  responsableId: number;
  apruebaId: number;
  fechaObjetivo: string | null;
  fechaAprobacion: string | null;
  seguimiento: string | null;
  fechaSeguimiento: string | null;
  recursos: string | null;
  verificacion: VerificacionEficacia;
  observacion: string | null;
  madurezAlcanzadaId: number | null;
  estado: EstadoAccion;
  avance: number;
  justificacionAceptacion: string | null;
  fechaRevisionAceptacion: string | null;
  instrumento: string | null;
  riesgoRemanente: string | null;
}

export interface FilaRechazada {
  fila: number;
  /// Lo que se leyó, para poder encontrarla en el archivo aunque la fila haya cambiado de
  /// sitio. Sin esto, «fila 34» obliga a contar filas en un Excel con encabezados combinados.
  actividad: string;
  motivos: string[];
}

export interface ResultadoLectura {
  validas: PlanImportado[];
  rechazadas: FilaRechazada[];
  /// Filas en blanco que se saltaron. Se cuentan para que la suma cierre contra el archivo.
  vacias: number;
}

/// Texto de una celda, recortado. `null` para vacío — nunca cadena vacía, porque en el modelo
/// «sin observación» es `null` y guardar `''` haría que la pantalla mostrara un campo vacío
/// donde debería no mostrar nada.
export function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    const v = valor as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(v.richText)) return texto(v.richText.map((r) => r.text).join(''));
    if (typeof v.text === 'string') return texto(v.text);
    if (v.result !== undefined) return texto(v.result);
    return null;
  }
  const t = String(valor).trim();
  return t === '' ? null : t;
}

/// Normaliza para comparar: minúsculas, sin acentos, sin espacios de más.
///
/// Sin acentos porque el mismo cargo se escribe «Jefe de Tecnología» y «Jefe de Tecnologia»
/// según quién llene la celda, y rechazar por una tilde sería rechazar por nada.
export function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/// Una fecha de celda a `AAAA-MM-DD`. `undefined` cuando el valor no se puede leer como
/// fecha — que NO es lo mismo que celda vacía, y por eso se distingue de `null`.
export function fecha(valor: unknown): string | null | undefined {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) {
    // ExcelJS entrega las fechas en UTC. Se toman sus componentes UTC y no los locales: en
    // una máquina al oeste de Greenwich, `getDate()` sobre una fecha UTC de medianoche
    // devuelve el día ANTERIOR, y un plan que vence el 30 se guardaría venciendo el 29.
    return valor.toISOString().slice(0, 10);
  }
  const t = texto(valor);
  if (t === null) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/aaaa, que es como se escribe a mano en Colombia.
  const latino = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (latino) {
    return `${latino[3]}-${latino[2].padStart(2, '0')}-${latino[1].padStart(2, '0')}`;
  }
  return undefined;
}

/// El avance en porcentaje. Excel guarda «50 %» como 0,5, así que un valor entre 0 y 1 se
/// interpreta como fracción — salvo el 1 exacto, que es ambiguo y se toma como 100 %: nadie
/// registra un plan al 1 % y sí se registran muchos al 100 %.
export function avance(valor: unknown): number | undefined {
  if (valor === null || valor === undefined || valor === '') return 0;
  const t = texto(valor);
  if (t === null) return 0;
  const n = Number(t.replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(n) || n < 0) return undefined;
  const pct = n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n);
  return pct > 100 ? undefined : pct;
}

/// Lee una fila. `null` cuando está en blanco.
function leerFila(
  celdas: readonly unknown[],
  fila: number,
  catalogos: CatalogosImportacion,
): PlanImportado | FilaRechazada | null {
  const c = (i: number) => texto(celdas[i]);

  // Una fila está en blanco si no tiene NI actividad NI tipo de plan. Con cualquiera de las
  // dos se procesa y, si le falta lo demás, se rechaza con motivo — que es más útil que
  // saltarla: una fila a medio llenar es un olvido, no una fila vacía.
  const actividad = c(COLUMNA.actividad);
  const tipoPlanTexto = c(COLUMNA.tipoPlan);
  if (actividad === null && tipoPlanTexto === null) return null;

  const motivos: string[] = [];
  const rechazo = (): FilaRechazada => ({ fila, actividad: actividad ?? '(sin actividad)', motivos });

  // ── clase ────────────────────────────────────────────────────────────────────────────
  //
  // Sin «Tipo de Plan» se asume TRATAMIENTO en vez de rechazar: es el default del modelo y la
  // clase mayoritaria, y rechazar una fila completa por una lista desplegable que alguien no
  // tocó sería perder trabajo real por un campo administrativo.
  let clase: ClasePlan = 'TRATAMIENTO';
  if (tipoPlanTexto !== null) {
    const encontrada = CLASES[normalizar(tipoPlanTexto)];
    if (encontrada === undefined) {
      motivos.push(
        `«Tipo de Plan» no reconocido: «${tipoPlanTexto}». Se espera «Plan de Tratamiento de Riesgos» o «Plan de Mejora».`,
      );
    } else {
      clase = encontrada;
    }
  }

  if (actividad === null) motivos.push('Falta la «Actividad»: es lo que el plan se compromete a hacer.');

  // ── tipo de acción ───────────────────────────────────────────────────────────────────
  const tipoTexto = c(COLUMNA.tipoAccion);
  let tipo: TipoAccion = 'MITIGAR';
  if (tipoTexto === null) {
    // MITIGAR por omisión. Es lo que es un plan de tratamiento salvo que diga otra cosa, y las
    // otras tres clases exigen campos propios que nadie llena por accidente: si alguien quiso
    // aceptar y no lo marcó, el rechazo por falta de justificación se lo va a decir.
    tipo = 'MITIGAR';
  } else {
    const encontrado = TIPOS_ACCION[normalizar(tipoTexto)];
    if (encontrado === undefined) {
      motivos.push(
        `«Tipo de acción» no reconocido: «${tipoTexto}». Se espera Mitigar, Transferir, Evitar o Aceptar.`,
      );
    } else {
      tipo = encontrado;
    }
  }

  // ── control ──────────────────────────────────────────────────────────────────────────
  //
  // NO SE APROXIMA AL MÁS PARECIDO. Un plan colgado del control equivocado se descubre en una
  // auditoría; uno que no se creó se descubre en la pantalla de resultados, tres segundos
  // después de importar.
  const controlTexto = c(COLUMNA.control);
  let controlId: number | null = null;
  if (controlTexto !== null) {
    controlId =
      catalogos.controlesPorCodigo.get(controlTexto.toUpperCase().trim()) ??
      catalogos.controlesPorNombre.get(normalizar(controlTexto)) ??
      null;
    if (controlId === null) {
      motivos.push(`No existe el control «${controlTexto}». Usá su código, como A.5.15.`);
    }
  }
  if (tipo === 'MITIGAR' && controlId === null && controlTexto === null) {
    motivos.push(
      'Una acción de mitigación necesita el control que mejora: es la unidad de gestión del plan.',
    );
  }

  // ── los dos cargos ───────────────────────────────────────────────────────────────────
  //
  // Responsable y quien aprueba son DISTINTOS por diseño: ISO/IEC 27001 6.1.3 pide que el
  // dueño del riesgo apruebe, así que la regla de las dos personas es estructural. Acá no se
  // exige que sean distintos —el formato del cliente a veces pone el mismo cargo— pero sí que
  // los dos existan.
  const responsableTexto = c(COLUMNA.responsableEjecucion);
  const apruebaTexto = c(COLUMNA.propietarioRiesgo);
  const responsableId =
    responsableTexto === null ? null : (catalogos.cargosPorNombre.get(normalizar(responsableTexto)) ?? null);
  const apruebaId =
    apruebaTexto === null ? null : (catalogos.cargosPorNombre.get(normalizar(apruebaTexto)) ?? null);

  if (responsableTexto === null) motivos.push('Falta el «Responsable de ejecución de actividad».');
  else if (responsableId === null) motivos.push(`No existe el cargo «${responsableTexto}».`);

  if (apruebaTexto === null) motivos.push('Falta el «Propietario del riesgo», que es quien aprueba el plan.');
  else if (apruebaId === null) motivos.push(`No existe el cargo «${apruebaTexto}».`);

  // ── fechas ───────────────────────────────────────────────────────────────────────────
  const fObjetivo = fecha(celdas[COLUMNA.fechaTerminacion]);
  if (fObjetivo === undefined) {
    motivos.push(
      `«Fecha terminación» ilegible: «${c(COLUMNA.fechaTerminacion)}». Se espera 30/06/2027 o 2027-06-30.`,
    );
  }
  const fAprobacion = fecha(celdas[COLUMNA.fechaAprobacion]);
  if (fAprobacion === undefined) motivos.push(`«Fecha de aprobación» ilegible: «${c(COLUMNA.fechaAprobacion)}».`);
  const fSeguimiento = fecha(celdas[COLUMNA.fechaSeguimiento]);
  if (fSeguimiento === undefined) motivos.push(`«Fecha de seguimiento» ilegible: «${c(COLUMNA.fechaSeguimiento)}».`);
  const fRevision = fecha(celdas[COLUMNA.fechaRevisionAceptacion]);
  if (fRevision === undefined) motivos.push(`«Fecha de revisión de la aceptación» ilegible: «${c(COLUMNA.fechaRevisionAceptacion)}».`);

  // ── las reglas condicionales de ISO/IEC 27001 6.1.3 ──────────────────────────────────
  //
  // Las mismas que exige `registrarPlanCritico` del lado del servidor. Se comprueban acá para
  // que el rechazo diga qué falta EN QUÉ FILA, en vez de que la escritura falle a mitad del
  // archivo con un mensaje que no señala a ninguna.
  const justificacion = c(COLUMNA.justificacionAceptacion);
  const instrumento = c(COLUMNA.instrumento);
  const remanente = c(COLUMNA.riesgoRemanente);

  if (tipo === 'ACEPTAR') {
    if (justificacion === null) motivos.push('Aceptar un riesgo necesita la justificación de la aceptación.');
    if (fRevision === null) {
      motivos.push(
        'Aceptar un riesgo necesita fecha de revisión: una aceptación sin vencimiento es una que nadie vuelve a mirar.',
      );
    }
  }
  if (tipo === 'TRANSFERIR') {
    if (instrumento === null) motivos.push('Transferir necesita el instrumento (póliza, contrato o cláusula).');
    if (remanente === null) {
      motivos.push('Transferir necesita el riesgo remanente: transferir nunca mueve el riesgo completo.');
    }
  }

  // ── estado, avance, verificación, madurez ────────────────────────────────────────────
  const estadoTexto = c(COLUMNA.estado);
  let estado: EstadoAccion = 'NO_INICIADA';
  if (estadoTexto !== null) {
    const e = ESTADOS[normalizar(estadoTexto)];
    if (e === undefined) motivos.push(`«Estado» no reconocido: «${estadoTexto}».`);
    else estado = e;
  }

  const av = avance(celdas[COLUMNA.avance]);
  if (av === undefined) {
    motivos.push(`«Avance %» fuera de rango o ilegible: «${c(COLUMNA.avance)}». Se espera 0 a 100.`);
  }

  const verifTexto = c(COLUMNA.verificacionEficacia);
  let verificacion: VerificacionEficacia = 'PENDIENTE';
  if (verifTexto !== null) {
    const v = VERIFICACIONES[normalizar(verifTexto)];
    if (v === undefined) motivos.push(`«Verificación de eficacia» no reconocida: «${verifTexto}».`);
    else verificacion = v;
  }

  const madurezTexto = c(COLUMNA.madurezAlcanzada);
  let madurezAlcanzadaId: number | null = null;
  if (madurezTexto !== null) {
    const nivel = Number(String(madurezTexto).replace(/^L/i, '').replace('%', '').trim());
    madurezAlcanzadaId = Number.isFinite(nivel)
      ? (catalogos.madurezPorNivel.get(nivel) ?? null)
      : null;
    if (madurezAlcanzadaId === null) {
      motivos.push(`«Madurez alcanzada» no está en la escala: «${madurezTexto}».`);
    }
  }

  if (motivos.length > 0) return rechazo();

  // Un plan CERRADO con avance 0 es una contradicción que el formato deja escribir. Se
  // corrige en vez de rechazarse: la intención es inequívoca, y rechazar una fila por una
  // celda que alguien no actualizó al cerrar sería perder el cierre.
  const avanceFinal = estado === 'CERRADA' ? Math.max(av!, 100) : av!;

  return {
    fila,
    clase,
    codigoExistente: c(COLUMNA.codigo),
    accion: actividad!,
    descripcion: c(COLUMNA.descripcion),
    tipo,
    controlId,
    proceso: c(COLUMNA.proceso),
    responsableId: responsableId!,
    apruebaId: apruebaId!,
    fechaObjetivo: fObjetivo!,
    fechaAprobacion: fAprobacion!,
    seguimiento: c(COLUMNA.seguimiento),
    fechaSeguimiento: fSeguimiento!,
    recursos: c(COLUMNA.recursos),
    verificacion,
    observacion: c(COLUMNA.observaciones),
    madurezAlcanzadaId,
    estado,
    avance: avanceFinal,
    justificacionAceptacion: tipo === 'ACEPTAR' ? justificacion : null,
    fechaRevisionAceptacion: tipo === 'ACEPTAR' ? fRevision! : null,
    instrumento: tipo === 'TRANSFERIR' ? instrumento : null,
    riesgoRemanente: tipo === 'TRANSFERIR' ? remanente : null,
  };
}

function esRechazo(x: PlanImportado | FilaRechazada): x is FilaRechazada {
  return 'motivos' in x;
}

/// Lee todas las filas de datos. `primeraFila` es el número de la primera fila con datos en el
/// libro, base 1, y se usa sólo para poder señalarla en el informe.
export function leerFilas(
  filas: readonly (readonly unknown[])[],
  catalogos: CatalogosImportacion,
  primeraFila = 6,
): ResultadoLectura {
  const validas: PlanImportado[] = [];
  const rechazadas: FilaRechazada[] = [];
  let vacias = 0;

  filas.forEach((celdas, i) => {
    const r = leerFila(celdas, primeraFila + i, catalogos);
    if (r === null) vacias++;
    else if (esRechazo(r)) rechazadas.push(r);
    else validas.push(r);
  });

  return { validas, rechazadas, vacias };
}

/// El texto de `origen` de un plan importado.
///
/// `origen` es lo que ISO/IEC 27001 6.1.3 pide para justificar POR QUÉ existe la acción, y un
/// auditor lo lee tal cual. Para un plan importado, la respuesta honesta es de dónde vino: el
/// formato, la clase, el proceso y quién responde. No se le inventa un riesgo: un plan de la
/// matriz no cuelga de un par (activo, amenaza) concreto, y fabricar ese prefijo haría que
/// `origenCubreRiesgo` lo diera por cubriendo un riesgo que nadie decidió que cubriera.
export function origenImportado(plan: PlanImportado): string {
  const clase = plan.clase === 'MEJORA' ? 'Plan de Mejora' : 'Plan de Tratamiento de Riesgos';
  const partes = [`FOR-SIG-13 · ${clase}`];
  if (plan.proceso !== null) partes.push(plan.proceso);
  if (plan.codigoExistente !== null) partes.push(`fila del formato: ${plan.codigoExistente}`);
  return `${partes.join(' — ')}.`;
}
