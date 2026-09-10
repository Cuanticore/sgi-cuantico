// lib/sig/soportes-sharepoint.ts
//
// DÓNDE va un soporte publicado, CÓMO se llama y CUÁNDO vale reintentar.
//
// Puro y sin red a propósito: el módulo que habla con Graph no se puede probar sin salir a
// internet, y estas decisiones sí. Mismo criterio que `trabajos-catalogo.ts` frente a
// `trabajos.ts`.

import type { FalloGraph } from '@/lib/sgsi/graph-fallo';

export type CausaGraph = FalloGraph['causa'];

/// Los caracteres que SharePoint rechaza en el nombre de un archivo o carpeta.
const PROHIBIDOS = /["*:<>?/\\|]/g;

/// El nombre completo (base incluida) no puede pasar de 400 caracteres en SharePoint. 120
/// para el archivo deja margen de sobra para la carpeta base del SIG, que ya es larga.
export const LARGO_MAXIMO_ARCHIVO = 120;

export function sanear(nombre: string): string {
  return nombre
    .replace(PROHIBIDOS, '-')
    .replace(/^[~$]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/// D-3 · la carpeta es la parte local del correo corporativo. Única en el tenant, legible
/// al navegar la biblioteca, y sobrevive a un cambio de nombre de la persona.
export function nombreDeCarpeta(correo: string): string {
  const arroba = correo.indexOf('@');
  const local = arroba === -1 ? correo : correo.slice(0, arroba);
  const limpio = sanear(local.toLowerCase());
  if (limpio === '') {
    throw new Error(`el correo «${correo}» no tiene parte local utilizable como carpeta`);
  }
  return limpio;
}

export interface DatosDelSoporte {
  /// El código del acta. Es la llave: se preserva incluso al recortar el nombre.
  codigo: string;
  documentoCodigo: string | null;
  documentoVersion: number | null;
  aceptadoEn: Date;
  extension: string;
}

export function nombreDeArchivo(d: DatosDelSoporte): string {
  const codigo = sanear(d.codigo);
  // Misma convención de fecha que el resto de `lib/sig/` (`generacion.ts:256`).
  const fecha = d.aceptadoEn.toISOString().slice(0, 10);
  const sufijo = `.${d.extension.replace(/^\./, '')}`;
  const documento =
    d.documentoCodigo === null
      ? null
      : d.documentoVersion === null
        ? sanear(d.documentoCodigo)
        : `${sanear(d.documentoCodigo)} v${d.documentoVersion}`;

  const completo = [codigo, documento, fecha].filter((p) => p !== null && p !== '').join(' — ');
  if (completo.length + sufijo.length <= LARGO_MAXIMO_ARCHIVO) return completo + sufijo;

  const cabeza = `${codigo} — `;
  const cola = ` — ${fecha}${sufijo}`;
  const disponible = LARGO_MAXIMO_ARCHIVO - cabeza.length - cola.length;
  if (disponible <= 0 || documento === null) return `${codigo}${sufijo}`;
  return `${cabeza}${documento.slice(0, disponible).trimEnd()}${cola}`;
}

export function rutaCompleta(base: string, carpeta: string, archivo: string): string {
  return `${base.replace(/^\/+|\/+$/g, '')}/${carpeta}/${archivo}`;
}

/// P9 · las esperas del reintento. Crecen porque una caída de Graph que dura una hora no se
/// arregla consultando cada minuto, y se estancan en 24 h porque más allá de eso el
/// problema ya no es transitorio y alguien tiene que mirarlo.
const ESPERAS_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000, 86_400_000];

export const INTENTOS_MAXIMOS = ESPERAS_MS.length;

/// `SIN_CONFIGURAR` no gasta intento: no hay nada que reintentar hasta que las variables
/// existan, y quemar la cola mientras alguien configura el entorno dejaría todo BLOQUEADO
/// por un motivo que se resolvió solo.
export function gastaIntento(causa: CausaGraph): boolean {
  return causa !== 'SIN_CONFIGURAR';
}

export function debeReintentar(causa: CausaGraph, intentos: number): boolean {
  if (causa === 'SIN_PERMISO' || causa === 'NO_EXISTE') return false;
  if (causa === 'SIN_CONFIGURAR') return true;
  return intentos < INTENTOS_MAXIMOS;
}

export function esperaAntesDeReintentar(intentos: number): number {
  const indice = Math.min(Math.max(intentos, 1), ESPERAS_MS.length) - 1;
  return ESPERAS_MS[indice];
}

export function estadoTrasFallo(causa: CausaGraph, intentos: number): 'PENDIENTE' | 'BLOQUEADO' {
  return debeReintentar(causa, intentos) ? 'PENDIENTE' : 'BLOQUEADO';
}

/// Si la causa es del entorno, los soportes que siguen en el lote van a fallar igual: 300
/// llamadas condenadas sólo llenan el registro de ruido.
export function debeDetenerElLote(causa: CausaGraph): boolean {
  return causa === 'SIN_CONFIGURAR' || causa === 'CREDENCIAL_RECHAZADA' || causa === 'SIN_RED';
}
