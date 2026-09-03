// lib/sig/colaboradores.ts
//
// REQ-SIG-09 · Gestión de Colaboradores.
//
// La decisión que define el módulo: **nómina y contratistas van en una sola tabla, con un
// solo proceso.** De las 38 personas activas sólo 6 son de nómina; un diseño que trate al
// contratista como caso aparte deja fuera del control a la mayoría de la organización. Y es
// correcto por el fondo: la seguridad de la información no distingue el tipo de contrato —
// un contratista firma el mismo acuerdo, recibe la misma inducción y se le revocan los
// accesos el mismo día.
//
// Lo único que el tipo de contrato cambia son las afiliaciones y la liquidación: cinco
// casillas. Separar los dos grupos duplicaría el proceso entero para ahorrarse esas cinco.
//
// **El estado no se almacena.** Ni acá ni en la base. Se calcula, y por eso el tipo de
// contrato sobrevive al retiro — que es exactamente lo que hoy se pierde.

export type OrigenPersona = 'DIRECTORIO' | 'MANUAL';

export interface ColaboradorBase {
  id: number;
  /// El espejo del Directorio: lo escribe la sincronización.
  activa: boolean;
  /// El retiro de la ORGANIZACIÓN, con su fecha. Es una fecha y no un booleano porque el
  /// criterio 2 pide «consultar la lista al 31/12/2025 y ver a quién estaba activo ese
  /// día», y eso un booleano no lo responde.
  retiradoEn: Date | null;
  origen: OrigenPersona;
}

/// Si la persona está activa HOY.
///
/// Dos fuentes del mismo hecho, y por eso se leen juntas: `retiradoEn` es la decisión de la
/// organización y `activa` es lo que dice el Directorio. Basta una para dar de baja —quien
/// desapareció del Directorio no puede entrar aunque nadie haya escrito su retiro, y quien
/// se retiró no vuelve a estar activo porque su cuenta siga viva unos días.
export function estaActiva(p: ColaboradorBase): boolean {
  return p.retiradoEn === null && p.activa;
}

/// Si la persona estaba activa en una FECHA dada. Criterio de aceptación 2.
///
/// Sólo `retiradoEn` puede responder esto: `activa` es el estado de hoy y no tiene historia.
/// Una persona sin fecha de retiro se considera activa en cualquier fecha posterior a su
/// ingreso; sin fecha de ingreso, se asume que ya estaba —no se inventa un alta.
export function estabaActivaEn(
  p: ColaboradorBase & { fechaIngreso?: Date | null },
  fecha: Date,
): boolean {
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (p.fechaIngreso != null && dia(p.fechaIngreso) > dia(fecha)) return false;
  if (p.retiradoEn === null) return true;
  // El día del retiro TODAVÍA estaba: se retira al terminar el día, no al empezarlo. C4
  // dice que los accesos se revocan «el mismo día de la terminación», así que ese día la
  // persona trabajó y una consulta de ese día tiene que verla.
  return dia(p.retiradoEn) >= dia(fecha);
}

export type ClaveAnomalia =
  | 'ACTIVA_SIN_CUENTA'
  | 'INACTIVA_CON_ACCESOS'
  | 'SALIO_SIN_ACTA'
  | 'ACCESOS_SIN_FIRMAR';

export interface Anomalia {
  clave: ClaveAnomalia;
  etiqueta: string;
  /// Por qué importa. La lista lo muestra: un conteo sin consecuencia no mueve a nadie.
  consecuencia: string;
  /// `false` cuando no se puede calcular todavía porque su módulo no existe. Se declara
  /// igual: un tablero que muestra dos anomalías de cuatro y no dice que faltan dos
  /// asegura que el sistema está mejor de lo que se sabe.
  calculable: boolean;
  personas: number[];
}

export interface DatosDeAnomalias {
  personas: (ColaboradorBase & { fechaIngreso?: Date | null })[];
  /// Ids de personas con al menos un acta de borrado seguro.
  conActaDeBorrado: Set<number>;
  /// Ids con accesos vigentes. `null` mientras `AccesoPersona` (REQ-SIG-07) no exista: es
  /// distinto de un conjunto vacío, que afirmaría que nadie tiene accesos.
  conAccesosVigentes: Set<number> | null;
  /// Ids que suscribieron los CUATRO compromisos. `null` mientras `ActaAceptacion`
  /// (REQ-SIG-02) no exista.
  conLosCuatroCompromisos: Set<number> | null;
}

/// Las cuatro anomalías que la lista responde sola (§5.1).
///
/// Todas son cruces entre listas que hoy viven separadas, y ninguna requiere que alguien se
/// acuerde de mirar. Dos se pueden calcular ya; las otras dos dependen de módulos de fases
/// posteriores y se devuelven marcadas como no calculables en vez de omitirse.
export function anomalias(datos: DatosDeAnomalias): Anomalia[] {
  const activas = datos.personas.filter(estaActiva);
  const inactivas = datos.personas.filter((p) => !estaActiva(p));

  return [
    {
      clave: 'ACTIVA_SIN_CUENTA',
      etiqueta: 'Activas sin cuenta del Directorio',
      consecuencia: 'no pueden recibir asignaciones ni firmar',
      calculable: true,
      // C1: `origen = MANUAL` es una anomalía de la vinculación, no una categoría válida.
      personas: activas.filter((p) => p.origen === 'MANUAL').map((p) => p.id),
    },
    {
      clave: 'INACTIVA_CON_ACCESOS',
      etiqueta: 'Inactivas con accesos vigentes',
      consecuencia: 'es el «acceso sin sustento» de REQ-SIG-07',
      calculable: datos.conAccesosVigentes !== null,
      personas:
        datos.conAccesosVigentes === null
          ? []
          : inactivas.filter((p) => datos.conAccesosVigentes!.has(p.id)).map((p) => p.id),
    },
    {
      clave: 'SALIO_SIN_ACTA',
      etiqueta: 'Salieron sin acta de borrado seguro',
      consecuencia: 'la desvinculación no está completa aunque ya no tengan cuenta',
      calculable: true,
      // Sólo quien tiene FECHA de retiro. Alguien que desapareció del Directorio sin que
      // nadie registrara su retiro es la otra anomalía, no ésta: acusarlo de no tener acta
      // señalaría a Tecnología por un dato que Talento Humano no puso.
      personas: datos.personas
        .filter((p) => p.retiradoEn !== null && !datos.conActaDeBorrado.has(p.id))
        .map((p) => p.id),
    },
    {
      clave: 'ACCESOS_SIN_FIRMAR',
      etiqueta: 'Con accesos sin haber firmado los cuatro compromisos',
      consecuencia: 'C3: ningún acceso se habilita antes de suscribirlos (PRO-TAL-01)',
      calculable: datos.conAccesosVigentes !== null && datos.conLosCuatroCompromisos !== null,
      personas:
        datos.conAccesosVigentes === null || datos.conLosCuatroCompromisos === null
          ? []
          : activas
              .filter(
                (p) =>
                  datos.conAccesosVigentes!.has(p.id) &&
                  !datos.conLosCuatroCompromisos!.has(p.id),
              )
              .map((p) => p.id),
    },
  ];
}

/// C3 · la puerta de accesos. Cerrada mientras falte CUALQUIERA de los cuatro compromisos.
///
/// `null` cuando no se puede saber todavía —`ActaAceptacion` es de REQ-SIG-02 y no existe—
/// y eso NO es lo mismo que «cerrada»: una puerta que se dibuja cerrada porque falta el
/// módulo se lee como que la persona no firmó, y es una acusación sin dato detrás.
export function puertaDeAccesos(
  compromisosSuscritos: number | null,
  compromisosExigidos = 4,
): { abierta: boolean; faltan: number } | null {
  if (compromisosSuscritos === null) return null;
  const faltan = Math.max(0, compromisosExigidos - compromisosSuscritos);
  return { abierta: faltan === 0, faltan };
}

/// La composición real por tipo de contrato, ordenada de mayor a menor.
///
/// Es la cifra que sostiene la decisión del módulo: si de 38 activos sólo 6 son de nómina,
/// tratar al contratista como caso aparte deja fuera a la mayoría.
export function composicionPorContrato(
  personas: readonly (ColaboradorBase & { tipoContrato: string | null })[],
): { etiqueta: string; n: number }[] {
  const conteo = new Map<string, number>();
  for (const p of personas.filter(estaActiva)) {
    // «Sin tipo» se cuenta y se nombra: es un dato que falta, y esconderlo haría que los
    // porcentajes de la composición no sumaran el total de activos.
    const clave = p.tipoContrato ?? 'Sin tipo de contrato';
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([etiqueta, n]) => ({ etiqueta, n }))
    .sort((a, b) => b.n - a.n || a.etiqueta.localeCompare(b.etiqueta));
}
