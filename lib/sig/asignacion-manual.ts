// lib/sig/asignacion-manual.ts
//
// Las reglas de una asignación hecha a mano desde el popup de una persona.
//
// Puro y aparte de la acción por dos razones. La primera, la de siempre: una regla que sólo
// se puede comprobar montando la pantalla termina sin comprobarse. La segunda es de forma —
// la acción vive en un archivo `'use server'`, donde un `export const` tumba el despliegue,
// y acá hay constantes.
//
// ── QUÉ NO VALIDA ESTO, Y POR QUÉ ────────────────────────────────────────────────────────
//
// No comprueba que la persona exista, que esté activa ni que el contenido esté vigente: eso
// necesita la base y lo hace la acción. Acá está lo que se puede decidir mirando únicamente
// lo que el formulario trajo, que es también lo que el navegador puede comprobar antes de
// dejar apretar el botón. Las dos mitades corren: ésta para no dejar mandar algo que iba a
// fallar, la del servidor para que no alcance con no apretarlo.

export interface DatosAsignacionManual {
  /// El contenido del catálogo, cuando se asigna algo que ya existe.
  contenidoId?: number | null;
  /// El título y la descripción de una tarea puntual. Obligatorios cuando NO hay contenido,
  /// e ignorados por el modelo cuando lo hay.
  titulo?: string | null;
  descripcion?: string | null;
  /// `YYYY-MM-DD`, que es lo que un `input[type=date]` entrega.
  fechaLimite: string;
  motivo: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/// Todos los reparos, no el primero.
///
/// Devolver sólo el primero obliga a descubrir los defectos de a uno por intento, y con un
/// formulario de cinco campos eso son cinco viajes para enterarse de tres cosas.
export function validarAsignacionManual(datos: DatosAsignacionManual, hoy: Date): string[] {
  const errores: string[] = [];

  const tieneContenido = typeof datos.contenidoId === 'number' && datos.contenidoId > 0;
  const titulo = (datos.titulo ?? '').trim();
  const descripcion = (datos.descripcion ?? '').trim();

  // **El modelo IGNORA el título cuando hay contenido.** Aceptar los dos guardaría en
  // silencio algo distinto de lo que se escribió, y quien lo escribió creería que quedó.
  if (tieneContenido && titulo !== '') {
    errores.push(
      'Elige un contenido del catálogo o escribe una tarea puntual, no las dos cosas: ' +
        'con contenido, el título que escribas no se guarda.',
    );
  }

  if (!tieneContenido && titulo === '') {
    errores.push('Hace falta un contenido del catálogo, o el título de una tarea puntual.');
  }

  // El esquema pide título Y descripción cuando no hay contenido. Una puntual sin
  // descripción llega a la bandeja de alguien como un renglón que no dice qué hay que hacer.
  if (!tieneContenido && titulo !== '' && descripcion === '') {
    errores.push('Una tarea puntual necesita descripción: el título solo no dice qué hacer.');
  }

  if (!esFechaValida(datos.fechaLimite)) {
    errores.push('La fecha límite tiene que ser una fecha (AAAA-MM-DD).');
  } else if (datos.fechaLimite < comoDia(hoy)) {
    // **No se propone un plazo por omisión en ninguna parte de la pantalla**, y por eso acá
    // sólo se comprueba que no sea pasado: un «+30 días» sugerido sería el número inventado
    // que este repositorio no admite. Que venza HOY sí se acepta — es apretado, pero es una
    // decisión que alguien puede querer tomar.
    errores.push('La fecha límite ya pasó: la asignación nacería vencida.');
  }

  // Asignar tiene consecuencia: le abre trabajo a alguien y le corre un plazo. Dentro de seis
  // meses «¿por qué tengo esto?» tiene que tener respuesta en la bitácora. La reasignación ya
  // exige motivo, y no hay razón para que crear pese menos que mover.
  if (datos.motivo.trim() === '') {
    errores.push('Asignar exige motivo: queda en la bitácora y es lo que explica esta carga.');
  }

  return errores;
}

/// El `periodo` de una asignación manual es el mes de su fecha límite.
///
/// `periodo` es la etiqueta legible que la bandeja, los reportes y el planificador ya leen
/// —`2026-T3`, `2026-09`—, así que tiene que seguir significando un periodo. Meterle una
/// llave sintética para esquivar una restricción de unicidad rompería su sentido en todo lo
/// que ya la lee; eso se resuelve en el índice, no acá.
export function periodoDeFechaLimite(fechaLimite: string): string {
  if (!esFechaValida(fechaLimite)) {
    throw new Error(`«${fechaLimite}» no es una fecha: no se le puede derivar un periodo.`);
  }
  return fechaLimite.slice(0, 7);
}

/// Formato Y calendario. `2026-13-01` pasa la expresión regular y no es un mes, y
/// `2026-02-31` tampoco es un día: `Date` los corre al mes siguiente en silencio, así que se
/// comprueba que la fecha construida sea la misma que se escribió.
function esFechaValida(valor: string): boolean {
  if (!FECHA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

/// Hoy como `YYYY-MM-DD` en UTC, que es la escala en la que el resto del sistema compara
/// fechas. Comparar cadenas evita que la hora del servidor mueva el límite medio día.
function comoDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
