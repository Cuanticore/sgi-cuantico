// lib/sgsi/responsables-v19.ts
//
// Los tres valores de responsable que V19 escribe y que no son cargos (H-19), y el cargo
// real al que corresponden.
//
// **Por qué existe, y por qué acá.** El importador resuelve el cargo por nombre y, cuando no
// lo encuentra, deja la casilla en null y avisa (`consolidado-lectura.ts:303-307`). Esa es la
// conducta correcta frente a un valor desconocido, y la equivocada frente a un valor que la
// organización sí conoce y escribe distinto: «Cada usuario» no es un cargo, pero el activo
// tiene dueño y es Operations & Services Manager.
//
// Es un módulo puro y no una constante dentro del importador porque lo llaman **dos**: el
// importador, para que la próxima carga no reintroduzca los nulls, y la corrección de los
// registros ya cargados (REQ-SIG-18 §15.5, Ruta B). Con una copia en cada lado, corregir la
// base y reimportar darían resultados distintos — que es justo el defecto que §15.6 cierra.
//
// **Es una curita y hay que decirlo.** Mientras el libro diga «Cliente», esta tabla hay que
// mantenerla. El arreglo de fondo es que el dueño de V19 corrija esas tres celdas (§15.6), y
// entonces esta tabla queda sin usarse en vez de sin existir — que es la forma segura de
// retirarla.

/// De lo que V19 escribe, al cargo real de `CargoResponsable`.
///
/// Las tres salen de H-19 de REQ-SIG-12 y su destino lo fijó REQ-SIG-18 §15.3. **Ninguna
/// clave puede ser un cargo del catálogo**: traduciría un valor que ya era válido.
export const SINONIMOS_RESPONSABLE: Readonly<Record<string, string>> = {
  'Cada usuario': 'Operations & Services Manager',
  'External Legal Counsel': 'Chief Legal Officer',
  Cliente: 'Chief Operating Officer',
};

/// La misma comparación que usa el resolutor del importador
/// (`consolidado-lectura.ts:150-152`): insensible a caso y a acentos. Si acá se comparara
/// distinto, una celda escrita «CLIENTE» se escaparía de la traducción y volvería a caer en
/// null — el defecto se vería arreglado en las pruebas y no en el libro real.
function igual(a: string, b: string): boolean {
  return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
}

export function esResponsableGenerico(valor: string): boolean {
  const v = valor.trim();
  if (v === '') return false;
  return Object.keys(SINONIMOS_RESPONSABLE).some((k) => igual(k, v));
}

export interface ResponsableTraducido {
  /// El nombre con el que hay que buscar en el catálogo.
  nombre: string;
  /// El valor original **sólo cuando hubo traducción**, para que quien llame pueda reportarla.
  /// `null` cuando el valor pasó intacto: un mapeo callado es tan malo como el null callado
  /// que reemplaza (§15.6).
  original: string | null;
}

export function traducirResponsable(valor: string): ResponsableTraducido {
  const v = valor.trim();
  if (v === '') return { nombre: '', original: null };
  const clave = Object.keys(SINONIMOS_RESPONSABLE).find((k) => igual(k, v));
  if (clave === undefined) return { nombre: valor, original: null };
  return { nombre: SINONIMOS_RESPONSABLE[clave], original: v };
}
