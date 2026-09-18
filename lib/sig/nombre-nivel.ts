// lib/sig/nombre-nivel.ts
//
// La regla de identidad de un nivel del inventario, en un solo lugar.
//
// Sin esto, la identidad es el nombre literal —`findFirst({ grado, nombre, padreId })` con
// igualdad exacta, en `consolidado-carga.ts:408` y en `importar.ts:282`—, y una celda escrita
// `Productos` en vez de `PRODUCTOS` crea una rama nueva del árbol en vez de encontrar la que
// ya existe.
//
// Vive solo aquí y los escritores la importan. Tres copias de la misma regla se separan con
// el tiempo, y la que se queda corta sigue dando verde.

/// Mayúscula, sin espacios en los bordes y con los internos colapsados a uno.
///
/// **Conserva las tildes**: `CÓDIGO` y `CODIGO` siguen siendo distintos. Unirlos es una
/// decisión aparte, porque cada fusión obliga a elegir qué ortografía sobrevive.
export function normalizarNombreNivel(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toUpperCase();
}
