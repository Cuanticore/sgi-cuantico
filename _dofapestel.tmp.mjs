import { readFileSync, writeFileSync } from 'node:fs';

for (const [archivo, tipo] of [
  ['app/estrategico/dofa/Dofa.client.tsx', 'DOFA'],
  ['app/estrategico/pestel/Pestel.client.tsx', 'PESTEL'],
]) {
  let s = readFileSync(archivo, 'utf8');

  // 1. Importar el formulario de creación.
  const importe = s.match(/import \{ [^}]*\} from '@\/app\/sig\/acciones\/estrategico';\n/);
  if (!importe) {
    console.error('no se encontró el import de acciones en', archivo);
    process.exit(1);
  }
  s = s.replace(
    importe[0],
    importe[0] + "import CrearAnalisis from '@/app/estrategico/CrearAnalisis.client';\n",
  );

  // 2. Estado del error, junto al de las entradas nuevas.
  s = s.replace(
    '  const [nuevas, setNuevas] = useState<Record<string, string>>({});',
    '  const [nuevas, setNuevas] = useState<Record<string, string>>({});\n' +
      '  const [error, setError] = useState<string | null>(null);',
  );

  // 3. El handler: en vez de `return` pelado, dice qué pasó.
  const viejo = `                    if (!nuevas[casilla]?.trim() || analisisId === null) return;
                    await agregarEntradaContexto(analisisId, {
                      casilla,
                      texto: nuevas[casilla],
                      efecto: meta.color === '#0b5c44' || meta.color === '#12437f' ? 'FAVORABLE' : 'ADVERSO',
                    });
                    window.location.reload();`;
  const nuevo = `                    // Antes acá había un \`return\` pelado: sin análisis o sin texto, el
                    // clic no hacía nada y la pantalla no lo decía. Un botón que se traga
                    // el clic es peor que uno deshabilitado.
                    if (analisisId === null) {
                      setError('Primero hay que crear el análisis.');
                      return;
                    }
                    if (!nuevas[casilla]?.trim()) {
                      setError('Escribí la entrada antes de agregarla.');
                      return;
                    }
                    setError(null);
                    const r = await agregarEntradaContexto(analisisId, {
                      casilla,
                      texto: nuevas[casilla].trim(),
                      efecto: meta.color === '#0b5c44' || meta.color === '#12437f' ? 'FAVORABLE' : 'ADVERSO',
                    });
                    if (!r.ok) {
                      setError(r.mensaje);
                      return;
                    }
                    window.location.reload();`;
  if (!s.includes(viejo)) {
    console.error('no se encontró el handler en', archivo);
    process.exit(1);
  }
  s = s.replace(viejo, nuevo);

  // 4. El campo y el botón, deshabilitados mientras no haya análisis.
  s = s.replace(
    /                  placeholder="Nueva entrada"\n/,
    '                  placeholder={analisisId === null ? `Creá el ${\'' +
      tipo +
      "'} primero` : 'Nueva entrada'}\n                  disabled={analisisId === null}\n",
  );
  s = s.replace(
    /                <button\n                  onClick=\{async \(\) => \{/,
    '                <button\n                  disabled={analisisId === null}\n                  onClick={async () => {',
  );
  s = s.replace(
    /                  className="rounded-campo px-3 py-1\.5 text-12 font-semibold text-white"\n/,
    '                  className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white disabled:opacity-40"\n',
  );

  writeFileSync(archivo, s);
  console.log('  ' + archivo + ' — handler, campo y botón corregidos');
}
