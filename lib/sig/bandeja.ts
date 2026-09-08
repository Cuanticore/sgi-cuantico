// lib/sig/bandeja.ts
//
// Las dos frases que la bandeja pone delante de la persona para que decida: el verbo del
// botón y el plazo. Viven acá, puras, porque son reglas —no adornos— y una regla que solo
// se puede comprobar montando la pantalla entera termina sin comprobarse.

export type TipoTarjeta = 'LECTURA' | 'VERIFICACION' | 'CAPACITACION' | 'TAREA';

/// El verbo del botón lo fija el TIPO de contenido, nunca el vencimiento.
///
/// Se decidía con `vencida || tipo === 'LECTURA' ? 'Leer y acusar' : 'Registrar'`, y esa
/// condición mentía dos veces: una tarea vencida ofrecía «Leer y acusar» y abría el panel
/// de nota, y «Diligenciar» —el verbo del lienzo para una verificación— no aparecía en
/// ninguna pantalla del sistema. Un botón que anuncia un panel distinto del que abre le
/// enseña a la persona a no leerlo.
///
/// Que la asignación esté vencida cambia la urgencia, no el trabajo: sigue afectando el
/// color del botón, que es donde la urgencia se ve sin leer.
const VERBO: Record<TipoTarjeta, string> = {
  LECTURA: 'Leer y acusar',
  VERIFICACION: 'Diligenciar',
  TAREA: 'Registrar',
  CAPACITACION: 'Registrar',
};

export function verboDeCierre(tipo: string): string {
  // Un tipo que no conocemos cae en «Registrar», que es lo que abre el panel genérico de
  // nota: el verbo acompaña al panel real, no a una suposición sobre el tipo.
  return VERBO[tipo as TipoTarjeta] ?? VERBO.TAREA;
}

/// El plazo en palabras, con el mismo verbo en los dos sentidos.
///
/// Decía «Faltan 4 días» frente a «Vencida hace 6 días»: dos verbos distintos para la misma
/// escala obligan a releer para saber de qué lado del plazo se está. El lienzo usa «vence»
/// en ambos, y nombra el día siguiente —«Vence mañana»— porque «Vence en 1 día» hace contar
/// justo cuando ya no hay margen para contar mal.
export function textoPlazo(plazo: { vencida: boolean; dias: number }): string {
  if (plazo.vencida) {
    const dias = Math.abs(plazo.dias);
    return dias === 0 ? 'Vencida hoy' : `Vencida hace ${dias} día${dias === 1 ? '' : 's'}`;
  }
  if (plazo.dias === 0) return 'Vence hoy';
  if (plazo.dias === 1) return 'Vence mañana';
  return `Vence en ${plazo.dias} días`;
}
