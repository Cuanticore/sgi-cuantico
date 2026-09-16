// scripts/verificar-informe.ts
//
// Genera el informe de valoración contra la base y comprueba que su mitad RESIDUAL diga algo.
// Word, Excel y PDF se arman los tres desde esta misma estructura (`DatosInforme`), así que
// verificarla acá cubre los tres formatos sin escribir un archivo.
//
//   DATABASE_URL=… npx tsx scripts/verificar-informe.ts

// `informe.query` declara `import 'server-only'`, que sólo resuelve dentro del bundler de
// Next. Acá se apunta al mismo módulo vacío que Next usa, para poder ejercer la consulta real
// desde la línea de comandos sin tocar la configuración del proyecto.
import Module from 'node:module';

const resolver = (Module as unknown as { _resolveFilename: (...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  peticion: unknown,
  ...resto: unknown[]
): string {
  const destino =
    peticion === 'server-only' ? 'next/dist/compiled/server-only/empty.js' : peticion;
  return resolver.call(this, destino, ...resto);
};

async function main(): Promise<void> {
  const { leerInforme } = await import('../app/sgsi/informe-valoracion/informe.query');
  const datos = await leerInforme();

  console.log(`capítulos (procesos): ${datos.capitulos.length}`);
  console.log(`activos: ${datos.totalActivos}   en análisis: ${datos.totalEnAnalisis}`);
  console.log(`aceptaciones formales de riesgo residual: ${datos.totalAceptaciones}`);

  const banda = new Map<string, number>();
  let sinCalcular = 0;
  let conMatrizResidual = 0;
  for (const c of datos.capitulos) {
    for (const x of c.porBandaResidual) banda.set(x.etiqueta, (banda.get(x.etiqueta) ?? 0) + x.n);
    sinCalcular += c.filas.filter((f) => f.bandaResidual === null).length;
    if (c.matrizResidual) conMatrizResidual += 1;
  }

  console.log('\nACTIVOS POR BANDA DE RESIDUAL (sumado sobre los capítulos):');
  for (const [k, v] of banda) console.log(`  ${k.padEnd(18)} ${v}`);

  console.log(`\nactivos con banda residual «sin calcular»: ${sinCalcular}`);
  console.log(
    `capítulos con MATRIZ RESIDUAL dibujada: ${conMatrizResidual} de ${datos.capitulos.length}`,
  );

  const traslado = new Map<string, number>();
  for (const c of datos.capitulos) {
    for (const t of c.traslado) {
      const k = `${t.inherente} → ${t.residual}`;
      traslado.set(k, (traslado.get(k) ?? 0) + t.n);
    }
  }
  console.log('\nTRASLADO inherente → residual (activos):');
  for (const [k, v] of [...traslado].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(30)} ${v}`);
  }

  // Una celda ocupada de la matriz residual es la prueba de que la mitad residual del
  // informe tiene contenido y no un aviso de «sin calcular».
  const ocupadas = (m: { conteos: number[][]; total: number } | null): number =>
    m === null ? -1 : m.conteos.flat().filter((n) => n > 0).length;
  const c0 = datos.capitulos[0];
  if (c0) {
    console.log(`\nmatriz del capítulo «${c0.proceso}» — celdas con riesgos:`);
    console.log(`  inherente ${ocupadas(c0.matrizInherente)}   residual ${ocupadas(c0.matrizResidual)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
