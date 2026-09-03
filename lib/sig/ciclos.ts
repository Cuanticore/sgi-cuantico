// lib/sig/ciclos.ts
//
// Los ciclos de vinculación y desvinculación (REQ-SIG-09 §2.1).
//
// Dos reglas sostienen este módulo, y las dos son fáciles de romper sin darse cuenta:
//
// **Criterio 5 · cambiar el tipo de vinculación NO cambia ninguno de los siete pasos de
// seguridad.** «Un solo proceso para nómina y contratistas: lo de seguridad de la
// información es idéntico; sólo cambia lo administrativo» (lienzo). Si el filtro por tipo
// llegara a tocar un paso de seguridad, el argumento entero del módulo se cae.
//
// **C4 · ningún paso de la desvinculación depende de otro.** PRO-TAL-03: «la revocación de
// accesos se ejecuta el mismo día de la terminación, SIN ESPERAR a la liquidación ni al paz
// y salvo». Si la pantalla encadena los pasos en orden, está contradiciendo el
// procedimiento — así que acá no hay prerrequisitos, y hay una prueba que lo fija.

export type CicloColaborador = 'VINCULACION' | 'DESVINCULACION';
export type GrupoPaso = 'SEGURIDAD' | 'ADMINISTRATIVO';
export type AplicaA = 'TODOS' | 'NOMINA' | 'CONTRATISTA';

export interface Paso {
  id: number;
  ciclo: CicloColaborador;
  grupo: GrupoPaso;
  aplicaA: AplicaA;
  codigo: string;
  texto: string;
  fuente: string | null;
  orden: number;
}

/// Los pasos que aplican a una persona según su tipo de vinculación.
///
/// El filtro por tipo sólo puede recortar los ADMINISTRATIVO. Está escrito así —y no como
/// una condición sobre `aplicaA` a secas— para que la regla sea visible en el código y no
/// sólo en los datos: si alguien cargara mañana un paso de seguridad con
/// `aplicaA = NOMINA`, este filtro lo devolvería igual para todos, y la prueba
/// correspondiente explica por qué eso es lo correcto.
export function pasosAplicables(
  pasos: readonly Paso[],
  ciclo: CicloColaborador,
  esNomina: boolean,
): Paso[] {
  return pasos
    .filter((p) => p.ciclo === ciclo)
    .filter((p) => {
      // Criterio 5: los de seguridad son idénticos para todos, sin excepción.
      if (p.grupo === 'SEGURIDAD') return true;
      if (p.aplicaA === 'TODOS') return true;
      return esNomina ? p.aplicaA === 'NOMINA' : p.aplicaA === 'CONTRATISTA';
    })
    .sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo));
}

export interface ProgresoDeGrupo {
  grupo: GrupoPaso;
  hechos: number;
  total: number;
  /// Los que faltan, con su texto. La pantalla los nombra: decir «faltan 3» manda a
  /// buscarlos.
  pendientes: { codigo: string; texto: string }[];
}

/// El avance de un ciclo, por grupo.
///
/// Se reporta SEPARADO por grupo y no como un porcentaje único: un trámite con lo
/// administrativo completo y la seguridad a medias no está «al 70 %», está sin hacer lo que
/// importa. Un solo número los promedia y esconde justamente eso.
export function progresoDelCiclo(
  pasos: readonly Paso[],
  completados: ReadonlySet<number>,
  ciclo: CicloColaborador,
  esNomina: boolean,
): ProgresoDeGrupo[] {
  const aplicables = pasosAplicables(pasos, ciclo, esNomina);
  const grupos: GrupoPaso[] = ['SEGURIDAD', 'ADMINISTRATIVO'];
  return grupos.map((grupo) => {
    const suyos = aplicables.filter((p) => p.grupo === grupo);
    const pendientes = suyos.filter((p) => !completados.has(p.id));
    return {
      grupo,
      hechos: suyos.length - pendientes.length,
      total: suyos.length,
      pendientes: pendientes.map((p) => ({ codigo: p.codigo, texto: p.texto })),
    };
  });
}

/// **C4 · si este paso se puede ejecutar ya.**
///
/// Devuelve SIEMPRE `true`, y eso no es un descuido: es la regla. PRO-TAL-03 exige que la
/// revocación de accesos se haga el mismo día de la terminación sin esperar a nada, y
/// cualquier prerrequisito la retrasaría. La función existe para que el punto quede escrito
/// y con prueba, en vez de ser la ausencia de un `if` que alguien agregue de buena fe.
export function dependeDeOtroPaso(): false {
  return false;
}

/// Las obligaciones que siguen vivas después de la salida (C7).
///
/// El registro de una persona inactiva NO se borra. Se muestran en la ficha porque son la
/// razón: cinco años para las obligaciones generales, indefinido para secretos
/// empresariales y código fuente.
export interface ObligacionSubsistente {
  texto: string;
  vigencia: string;
  fuente: string;
}

export const OBLIGACIONES_SUBSISTENTES: ObligacionSubsistente[] = [
  {
    texto: 'Confidencialidad de la información conocida durante la relación',
    vigencia: 'cinco años desde la terminación',
    fuente: 'PRO-TAL-01 · acuerdo de confidencialidad',
  },
  {
    texto: 'Secretos empresariales y código fuente',
    vigencia: 'indefinida',
    fuente: 'PRO-TAL-01',
  },
  {
    texto: 'No divulgación de datos personales tratados por cuenta de la organización',
    vigencia: 'mientras subsista el deber legal',
    fuente: 'Ley 1581 · autorización de tratamiento',
  },
];

/// C5 · el mismo trámite aplica al **cambio de cargo** que deja accesos sin sustento.
///
/// Es el origen más común de los «accesos sin sustento» que marca REQ-SIG-07: nadie piensa
/// en revisar accesos cuando alguien asciende, porque no se fue. Devuelve el motivo para
/// que la pantalla lo diga con esas palabras.
export function motivoDelTramite(
  retiradoEn: Date | null,
  cambioDeCargo: boolean,
): { aplica: boolean; motivo: string } {
  if (retiradoEn !== null) {
    return { aplica: true, motivo: 'terminación de la vinculación' };
  }
  if (cambioDeCargo) {
    return {
      aplica: true,
      motivo:
        'cambio de cargo que deja accesos sin sustento — el mismo trámite aplica, y es el ' +
        'origen más común de los accesos sin sustento',
    };
  }
  return { aplica: false, motivo: 'la persona sigue vinculada y en el mismo cargo' };
}

export const ETIQUETA_GRUPO: Record<GrupoPaso, string> = {
  SEGURIDAD: 'Seguridad de la información · igual para todos',
  ADMINISTRATIVO: 'Administrativo · según el tipo de vinculación',
};
