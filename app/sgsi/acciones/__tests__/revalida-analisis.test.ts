// app/sgsi/acciones/__tests__/revalida-analisis.test.ts
//
// Quien recalcula riesgos tiene que invalidar la pantalla que los muestra.
//
// ── EL DEFECTO QUE ESTA PRUEBA EXISTE PARA IMPEDIR ─────────────────────────────────────
//
// `guardarMadurez` escribe la madurez de un control, corre `generarRiesgos` —que reescribe el
// residual de TODOS los riesgos que ese control mitiga— y revalida `/sgsi`, `/sgsi/controles`,
// `/sgsi/matrices`, `/sgsi/planes`, `/sgsi/inventario` y `/`.
//
// **No revalidaba `/sgsi/valoracion-riesgos`**, que es la lista de Análisis de riesgos: la
// pantalla donde se mira precisamente el residual que acaba de cambiar. Next sirve la versión
// cacheada, así que quien guardaba una madurez y volvía al Análisis veía las cifras de antes y
// concluía, con razón, que no se había guardado nada.
//
// Es la forma de las cicatrices de `HARNESS.md`: cada pieza hace bien su trabajo —la acción
// escribe, el generador recalcula, la pantalla pinta lo que le dan— y el defecto vive en el
// eslabón que nadie escribió.
//
// ── POR QUÉ VIGILA LA CLASE Y NO UN CASO ───────────────────────────────────────────────
//
// Hay diez llamadas a `generarRiesgos` repartidas en cuatro archivos de acciones. Probar
// `guardarMadurez` dejaría las otras nueve libres de repetir el mismo olvido, y el olvido no
// se ve: la acción devuelve «ok» y la pantalla miente en silencio. La regla es una sola y se
// afirma una sola vez.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ACCIONES = join(__dirname, '..');
/// LA RUTA, NO LA FORMA DE LA LLAMADA. Cuatro de los cinco archivos no llaman a
/// `revalidatePath` una vez por ruta: recorren una lista. Exigir el literal
/// `revalidatePath('/sgsi/valoracion-riesgos')` habría dado rojo sobre archivos ya
/// corregidos — la prueba estaría afirmando una sintaxis en vez de un invariante, que es
/// exactamente como un arnés aprende a mentir.
const RUTA_ANALISIS = "'/sgsi/valoracion-riesgos'";

/// Los archivos de acciones que recalculan riesgos.
function archivosQueRecalculan(): { nombre: string; fuente: string }[] {
  return readdirSync(ACCIONES)
    .filter((f) => f.endsWith('.ts'))
    .map((nombre) => ({ nombre, fuente: readFileSync(join(ACCIONES, nombre), 'utf8') }))
    .filter((a) => a.fuente.includes('generarRiesgos('));
}

describe('recalcular riesgos invalida la lista de Análisis', () => {
  const archivos = archivosQueRecalculan();

  it('hay archivos de acciones que recalculan', () => {
    // Caso de control: si `generarRiesgos` se renombrara, esta prueba pasaría en verde sin
    // vigilar nada. Que la lista no esté vacía es lo que la mantiene honesta.
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('cada uno revalida /sgsi/valoracion-riesgos', () => {
    const olvidadizos = archivos
      .filter((a) => !a.fuente.includes(RUTA_ANALISIS))
      .map((a) => a.nombre);
    expect(olvidadizos).toEqual([]);
  });

  it('y lo hace revalidando, no sólo nombrando la ruta en un comentario', () => {
    // El control de la regla de arriba: un archivo que mencione la ruta sin llamar nunca a
    // `revalidatePath` pasaría la primera aserción diciendo nada.
    for (const a of archivos) expect(a.fuente).toContain('revalidatePath');
  });
});
