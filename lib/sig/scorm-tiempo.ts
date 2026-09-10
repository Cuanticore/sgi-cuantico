// lib/sig/scorm-tiempo.ts
//
// Las duraciones del modelo de datos de SCORM 2004 (`timeinterval (second, 10, 2)`), que
// son ISO 8601 y no segundos.
//
// Puro y aparte porque es la conversión que, si se equivoca, no falla: guarda un número
// plausible pero falso, y el informe de capacitación lo repite sin que nada avise.

const PATRON =
  /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

const SEGUNDOS = {
  anio: 31_536_000,
  mes: 2_592_000,
  dia: 86_400,
  hora: 3_600,
  minuto: 60,
};

/// `null` cuando no es una duración válida. Es `null` y no `0` a propósito: el llamador
/// tiene que poder devolverle 406 al curso, y un cero silencioso le haría creer que su
/// valor se aceptó.
export function aSegundos(duracion: string): number | null {
  if (duracion === 'P' || duracion === '' || duracion === 'PT') return null;
  const m = PATRON.exec(duracion);
  if (m === null) return null;
  const n = (i: number) => (m[i] === undefined ? 0 : Number(m[i]));
  return (
    n(1) * SEGUNDOS.anio +
    n(2) * SEGUNDOS.mes +
    n(3) * SEGUNDOS.dia +
    n(4) * SEGUNDOS.hora +
    n(5) * SEGUNDOS.minuto +
    n(6)
  );
}

export function aDuracion(segundos: number): string {
  const total = Math.max(0, segundos);
  const horas = Math.floor(total / SEGUNDOS.hora);
  const minutos = Math.floor((total % SEGUNDOS.hora) / SEGUNDOS.minuto);
  const resto = total % SEGUNDOS.minuto;
  // Los segundos se escriben sin decimales cuando son enteros: `PT1H23M45S` y no
  // `PT1H23M45.00S`, que es lo que un curso espera leer de vuelta.
  const seg = Number.isInteger(resto) ? String(resto) : resto.toFixed(2);
  return `PT${horas}H${minutos}M${seg}S`;
}

/// Suma la sesión al total. Una sesión inválida se ignora en vez de perder el acumulado:
/// el tiempo ya invertido por la persona no se borra por un valor mal formado del curso.
export function sumarDuraciones(total: string, sesion: string): string {
  const a = aSegundos(total) ?? 0;
  const b = aSegundos(sesion) ?? 0;
  return aDuracion(a + b);
}
