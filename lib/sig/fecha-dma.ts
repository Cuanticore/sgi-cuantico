// lib/sig/fecha-dma.ts
//
// Convierte entre lo que se GUARDA (ISO `yyyy-mm-dd`, lo que un `<input type="date">` y la
// base entienden) y lo que la persona VE y ESCRIBE (`dd/mm/aaaa`, el orden de Colombia).
//
// Existe porque el `<input type="date">` nativo muestra el formato del IDIOMA DEL NAVEGADOR,
// no el del documento (`lang="es"` no basta): en un equipo configurado en inglés aparece
// `mm/dd/yyyy`, y quien escribe el día en el casillero del mes forma una fecha inválida que el
// navegador descarta sin avisar. El campo quedaba vacío y «no guardaba» —no era un fallo de
// guardado, era una fecha que nunca llegó a formarse—. Con un campo de texto propio el orden
// es el mismo en cualquier equipo.

/// De `yyyy-mm-dd` (o vacío/basura) a `dd/mm/aaaa` para mostrar.
export function isoAdma(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (m === null) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/// De lo que la persona escribe (`dd/mm/aaaa`) a lo que se guarda.
///
/// - `''`   → vacío: borrar la fecha es una acción válida, no un error.
/// - `null` → incompleto o imposible: NO se inventa una fecha a medio escribir ni una que no
///            existe en el calendario (31 de abril, 29 de febrero en año no bisiesto).
/// - ISO    → una fecha real, lista para guardar.
export function dmaAiso(texto: string): string | null {
  const limpio = texto.trim();
  if (limpio === '') return '';

  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(limpio);
  if (m === null) return null;

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  if (mes < 1 || mes > 12) return null;

  // `new Date(anio, mes, 0)` es el último día del mes `mes` (1-based): el día 0 retrocede al
  // final del mes anterior en la numeración 0-based de JS. Así el 29/02 sólo pasa en bisiesto
  // y el 31 sólo en los meses que lo tienen — sin una tabla de días por mes que mantener.
  const ultimoDia = new Date(anio, mes, 0).getDate();
  if (dia < 1 || dia > ultimoDia) return null;

  const dd = String(dia).padStart(2, '0');
  const mm = String(mes).padStart(2, '0');
  return `${anio}-${mm}-${dd}`;
}
