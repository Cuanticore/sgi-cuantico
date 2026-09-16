// lib/sgsi/alcance-residual.ts
//
// Qué activos entran al acta de aprobación del riesgo residual, y quién firma cada proceso.
//
// Módulo PURO: sin Prisma y sin React. Lo que hay acá es lo que alguien firma, y una cuenta
// que necesita una base de datos para probarse es una cuenta que nadie prueba.
//
// ── EL COLAPSO A UNA BANDA ES EL DE `peorBanda`, Y NO UNA COPIA ─────────────────────────
//
// Un activo tiene muchos riesgos y el acta lo lista una sola vez, así que hay que reducirlos
// a una banda. Esa reducción ya existe en `informe-valoracion.ts` y se importa de allá.
//
// No es pereza: si esta pantalla y el informe de valoración discreparan sobre la banda de un
// activo, el acta firmada quedaría sin respaldo documental — diría que se aprobó un «Alto»
// que el informe imprime como «Crítico», y ninguno de los dos documentos podría explicar al
// otro.
//
// Con esa función viene su regla, que es la que de verdad importa acá: **basta con que UN
// riesgo del activo esté sin calcular para que el activo entero sea «sin calcular»**. Si a un
// activo con doce riesgos se le calculó el residual de once, la peor de esas once es una
// cifra optimista presentada como completa — y el riesgo que falta puede ser el peor de
// todos. Nadie puede firmar un techo que nadie midió.

import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import type { Umbral } from './clasificar';
import { peorBanda } from './informe-valoracion';

export interface ActivoParaAlcance {
  id: number;
  codigo: string;
  nombre: string;
  areaId: number;
  proceso: string;
  /// Las cifras residuales de TODOS sus riesgos vigentes, como llegan de Prisma
  /// (`Decimal.toString()`). `null` es «sin calcular», y uno solo contamina al activo entero.
  residuales: readonly (string | null)[];
}

export interface FilaAlcance {
  activoId: number;
  codigo: string;
  nombre: string;
  areaId: number;
  proceso: string;
  banda: string;
  cifra: string;
}

export interface Alcance {
  filas: FilaAlcance[];
  /// Activos excluidos porque al menos un riesgo suyo no tiene residual calculado.
  ///
  /// **No es un cero y no se puede sumar a `fueraDeBanda`.** Son dos ausencias distintas: la
  /// de acá es deuda del modelo —la eficacia de algún control no está establecida— y la otra
  /// es un riesgo medido que resultó bajo. Confundirlas hace que un tablero se vea completo
  /// cuando no lo está.
  sinCalcular: number;
  /// Activos con residual calculado que quedaron en una banda que no exige aprobación.
  fueraDeBanda: number;
}

/// Las bandas que exigen aprobación. Se nombran acá una sola vez para que el acta, las
/// tarjetas y el Excel digan exactamente las mismas.
export const BANDAS_APROBABLES = ['Crítico', 'Alto'] as const;

export function seleccionarAlcance(
  activos: readonly ActivoParaAlcance[],
  umbrales: readonly Umbral[],
  bandasAprobables: readonly string[] = BANDAS_APROBABLES,
): Alcance {
  const filas: FilaAlcance[] = [];
  let sinCalcular = 0;
  let fueraDeBanda = 0;

  for (const a of activos) {
    // Un activo sin riesgos no entra al análisis: no hay nada que calcular, y contarlo como
    // «sin calcular» afirmaría una causa —eficacia desconocida— que para él es falsa.
    if (a.residuales.length === 0) continue;

    const banda = peorBanda(
      a.residuales.map((r) => (r === null ? null : Number(r))),
      umbrales,
    );
    if (banda === null) {
      sinCalcular += 1;
      continue;
    }
    if (!bandasAprobables.includes(banda)) {
      fueraDeBanda += 1;
      continue;
    }

    // La cifra que se imprime es la PEOR, la misma de la que salió la banda. Se recalcula con
    // Decimal y no con Math.max sobre los Number de arriba porque es la cifra que queda
    // escrita en un documento firmado: el redondeo binario de un float no tiene por qué
    // aparecer ahí.
    let peor = new Decimal(a.residuales[0] as string);
    for (const r of a.residuales) {
      if (r !== null && new Decimal(r).gt(peor)) peor = new Decimal(r);
    }

    filas.push({
      activoId: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      areaId: a.areaId,
      proceso: a.proceso,
      banda,
      cifra: peor.toString(),
    });
  }

  // Peor primero: el acta se lee de arriba hacia abajo y el que más expone es el que primero
  // hay que mirar. El código desempata para que el orden sea determinista — dos activos con
  // la misma cifra no pueden salir en un orden distinto en cada emisión, o dos actas del
  // mismo alcance se verían diferentes.
  filas.sort((x, y) => {
    const d = new Decimal(y.cifra).comparedTo(new Decimal(x.cifra));
    return d !== 0 ? d : x.codigo.localeCompare(y.codigo);
  });

  return { filas, sinCalcular, fueraDeBanda };
}

/// SHA-256 de lo que el acta afirma: código, banda y cifra de cada activo, ordenado por código
/// para que el mismo alcance dé siempre la misma huella.
///
/// Es lo que permite decir «esta acta ya no describe el riesgo vigente». Sin ella, un acta
/// firmada seguiría afirmando para siempre unas cifras que cambiaron al día siguiente, y
/// nadie tendría cómo notarlo salvo comparando a mano.
///
/// **No entran el nombre ni el proceso, a propósito.** Renombrar un activo o moverlo de área
/// no cambia el riesgo que alguien aprobó, y hacer que eso invalide un acta firmada obligaría
/// a recoger las firmas otra vez por una corrección ortográfica.
export function huellaDeAlcance(filas: readonly FilaAlcance[]): string {
  const canonica = [...filas]
    .map((f) => `${f.codigo}|${f.banda}|${f.cifra}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(canonica).digest('hex');
}
