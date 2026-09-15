// app/components/sgsi/activos/overlay-tabs.ts
//
// REQ-SIG-20 §6 (P3, D1) — tarea 3.4: el contrato de URL del overlay nombra dos de las
// cuatro pestañas distinto de como `FichaActivo` las nombra puertas adentro —
// `general` en vez de `valoracion`, `matrices` en vez de `resumen`. Amenazas y Ecuación se
// escriben igual en los dos lados.
//
// La función acepta CUALQUIERA de las dos grafías porque la tarea 3.5 pide que la página
// completa (`/sgsi/inventario/[codigo]`) también entienda ambas: hoy solo entendía la
// interna — y ni siquiera esa lista incluía `ecuacion`, así que un enlace `?tab=ecuacion` a
// la página completa caía en Valoración sin avisar. Esta es la única función que decide la
// pestaña desde una URL en toda la app; el overlay y la página completa la comparten.

import type { Pestana } from './FichaActivo';

const ALIAS_A_INTERNA: Record<string, Pestana> = {
  // Grafía del overlay (P3 §6 del handoff).
  general: 'valoracion',
  amenazas: 'amenazas',
  matrices: 'resumen',
  ecuacion: 'ecuacion',
  // Grafía interna, aceptada también (tarea 3.5).
  valoracion: 'valoracion',
  resumen: 'resumen',
};

/// Resuelve el parámetro `tab` de una URL — la del overlay o la de la página completa,
/// cualquiera de las dos grafías — a la pestaña interna que `FichaActivo` entiende. Un
/// valor ausente o no reconocido cae a `valoracion`, la única pestaña que nunca está
/// bloqueada por el umbral (D-2).
export function pestanaInternaDesdeUrl(
  valor: string | null | undefined,
  porDefecto: Pestana = 'valoracion',
): Pestana {
  if (valor === null || valor === undefined) return porDefecto;
  return ALIAS_A_INTERNA[valor] ?? porDefecto;
}
