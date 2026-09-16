// lib/sgsi/codigo-activo.ts
//
// El código del activo, `AAA-TTT-NNNN`, y qué pasa cuando deja de describirlo.
//
// EL CÓDIGO NACIÓ INMUTABLE, Y POR BUENAS RAZONES. REQ-SIG-01 §3 lo fijó así y medio
// sistema se apoya en eso: la carga del consolidado V19 se negó explícitamente a
// recalcularlo («se romperían todas sus referencias en Dependencias, Ambiente y Grafo»,
// `docs/handoff_sig/carga-consolidado-activos-v19.md`), y hay ~12 activos cuyo prefijo YA
// no coincide con su proceso justamente porque nadie se los tocó.
//
// LO QUE CAMBIA ACÁ, Y QUÉ EXIGE A CAMBIO. Mover un activo de proceso ahora reemite su
// código, porque un `TEC-…` dentro de Gestión Estratégica es una etiqueta que miente. El
// precio es que el código deja de ser un identificador perpetuo, y eso solo es aceptable si
// el código viejo SIGUE RESOLVIENDO al mismo activo. De ahí las dos funciones de abajo:
//
//   - `codigoDebeReemitirse` decide cuándo. Solo cuando cambia lo que el código DICE — el
//     prefijo del proceso o la abreviatura del tipo. Cambiar de área entre dos procesos que
//     comparten prefijo no reemite nada: el código seguiría diciendo lo mismo.
//
//   - `reemplazarActivoEnOrigen` arregla lo único que ata por texto y no por id: el prefijo
//     verificable de `AccionPlan.origen` (`lib/sgsi/origen-plan.ts`). Sin esto, reemitir un
//     código haría que TODOS los planes del activo dejaran de cubrir sus riesgos de golpe
//     —`origenCubreRiesgo` compara por código— y el activo aparecería «sin plan» al
//     instante, con el reloj de la deuda arrancando de cero. No es una posibilidad remota:
//     es lo que pasaría siempre.
//
// EL NÚMERO NUNCA SE REUSA, TAMPOCO AL REEMITIR. El consecutivo sale del `ContadorCodigo`
// del par (área, tipo) DESTINO, que solo incrementa. El número que el activo dejaba atrás
// no vuelve a la bolsa: queda retirado, igual que el de un activo dado de baja.

import { formatearOrigen, parsearOrigen } from './origen-plan';

/// Las dos partes del código que describen al activo. El consecutivo no entra: no describe
/// nada, solo distingue.
export interface DescriptoresCodigo {
  prefijoArea: string;
  abreviaturaTipo: string;
}

/// Si el código dejó de decir la verdad y hay que reemitirlo.
///
/// Compara lo que el código DICE, no los ids: dos áreas distintas con el mismo prefijo
/// producen el mismo código, y reemitirlo sería gastar un consecutivo para llegar a un
/// código equivalente al que ya había.
export function codigoDebeReemitirse(
  antes: DescriptoresCodigo,
  despues: DescriptoresCodigo,
): boolean {
  return (
    antes.prefijoArea !== despues.prefijoArea ||
    antes.abreviaturaTipo !== despues.abreviaturaTipo
  );
}

/// Arma `AAA-TTT-NNNN`. El consecutivo llega ya reservado por el contador — esta función no
/// decide números, solo los viste.
export function formatearCodigoActivo(
  descriptores: DescriptoresCodigo,
  consecutivo: number,
): string {
  return `${descriptores.prefijoArea}-${descriptores.abreviaturaTipo}-${String(consecutivo).padStart(4, '0')}`;
}

/// Reapunta un `AccionPlan.origen` al código nuevo del activo, conservando el riesgo, la
/// amenaza y la narrativa humana.
///
/// `null` cuando este origen no hay que tocarlo: o no trae el prefijo verificable (un plan
/// nacido desde la pantalla de controles, que no cubre ningún riesgo puntual), o es de otro
/// activo. Devolver `null` en vez del texto original obliga a quien llama a distinguir
/// «no cambió» de «cambió», y evita reescrituras que no escriben nada.
export function reemplazarActivoEnOrigen(
  origen: string,
  codigoAnterior: string,
  codigoNuevo: string,
): string | null {
  const partes = parsearOrigen(origen);
  if (partes === null || partes.activoCodigo !== codigoAnterior) return null;
  return formatearOrigen(
    partes.riesgoCodigo,
    codigoNuevo,
    partes.amenazaCodigo,
    partes.justificacion,
  );
}

/// El consecutivo que se puede emitir sin chocar, dado lo que dice el contador y lo que
/// dice la serie.
///
/// ── POR QUÉ NO ALCANZA CON EL CONTADOR ──────────────────────────────────────────────────
///
/// `ContadorCodigo` está indexado por **(área, tipo)** y el código se forma con **(prefijo,
/// abreviatura)**. Parece lo mismo y no lo es: la carga del V19 preservó los códigos del
/// libro, y ahí hay activos cuyo prefijo NO corresponde a su proceso — «134 códigos con
/// prefijo TEC pero sólo 122 activos en Gestión Tecnológica». Esos códigos ocupan números de
/// la serie `TEC-…` sin haber incrementado el contador de (Gestión Tecnológica, tipo).
///
/// Resultado: el contador puede ir por detrás del máximo real de su serie, y el número que
/// entrega ya está tomado. La escritura entonces choca contra la única de `Activo.codigo` y
/// la operación se cae — que es exactamente lo que impedía mover un activo de proceso.
///
/// La corrección es mirar las dos fuentes y quedarse con la mayor. El contador sigue siendo
/// la autoridad de «cuántos emití»; la serie es la autoridad de «cuáles están tomados».
export function siguienteConsecutivo(delContador: number, maximoDeLaSerie: number): number {
  return Math.max(delContador, maximoDeLaSerie + 1);
}

/// El consecutivo de un código `AAA-TTT-NNNN`, o 0 si no se puede leer.
///
/// Devuelve 0 —y no `null`— porque quien la usa busca un MÁXIMO: un código ilegible no debe
/// hacer fallar el cálculo, sólo no aportar nada.
export function consecutivoDe(codigo: string): number {
  const n = Number(codigo.slice(-4));
  return Number.isInteger(n) && n > 0 ? n : 0;
}
