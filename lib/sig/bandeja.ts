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

export function verboDeCierre(tipo: string, cursoIniciado = false): string {
  // REQ-SIG-24 · un curso no se «registra»: se INICIA la primera vez y se REANUDA si ya hay
  // un intento empezado. Es el mismo verbo que el panel ya usa en su enlace («Iniciar el
  // curso» / «Reanudar el curso»), traído al botón de la bandeja para que los dos coincidan.
  // «Registrar» —el fallback— invita a declarar una nota a mano, que es justo lo que un curso
  // con paquete no permite (P14).
  if (tipo === 'CURSO_VIRTUAL') return cursoIniciado ? 'Reanudar' : 'Iniciar';

  // Un tipo que no conocemos cae en «Registrar», que es lo que abre el panel genérico de
  // nota: el verbo acompaña al panel real, no a una suposición sobre el tipo.
  return VERBO[tipo as TipoTarjeta] ?? VERBO.TAREA;
}

/// REQ-SIG-24 · un curso con paquete se abre DIRECTO en el player; el resto pasa por el panel.
///
/// El panel de cierre existe para declarar nota, asistencia o firma. Un curso con paquete no
/// declara nada a mano —lo cierra el propio curso (P14)—, así que ese panel sólo agregaba un
/// clic y una explicación antes de lo único que se puede hacer: abrir el curso. Se salta.
///
/// `tienePaqueteScorm` es la condición entera: un curso de ENLACE no tiene paquete (tiene URL)
/// y ningún otro tipo puede traer uno, así que esto es cierto exactamente cuando hay un curso
/// que ejecutar. Devuelve la URL del player, o `null` para abrir el panel como el resto.
export function enlaceDirectoAlCurso(tarjeta: { tienePaqueteScorm: boolean; id: number }): string | null {
  return tarjeta.tienePaqueteScorm ? `/mi-sig/curso/${tarjeta.id}` : null;
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
