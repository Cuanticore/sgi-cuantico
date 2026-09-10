// lib/sig/scorm-abandono.ts
//
// Cuándo un intento sin actividad se da por abandonado. Puro para que el umbral se pruebe
// sin esperar doce horas.

const POR_OMISION_MINUTOS = 720;

export function umbralDeAbandono(variable: string | undefined): number {
  const minutos = Number(variable);
  if (!Number.isFinite(minutos) || minutos <= 0) return POR_OMISION_MINUTOS * 60_000;
  return minutos * 60_000;
}

export function estaAbandonado(ultimaActividad: Date, ahora: Date, umbralMs: number): boolean {
  return ahora.getTime() - ultimaActividad.getTime() > umbralMs;
}
