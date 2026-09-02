import { readFileSync, writeFileSync } from 'node:fs';

for (const [p, tipo] of [
  ['app/estrategico/dofa/Dofa.client.tsx', 'DOFA'],
  ['app/estrategico/pestel/Pestel.client.tsx', 'PESTEL'],
]) {
  let s = readFileSync(p, 'utf8');

  const ancla = '      <div className="mt-6 grid grid-cols-2 gap-5">';
  if (!s.includes(ancla)) {
    console.error('ancla no encontrada en', p);
    process.exit(1);
  }

  const bloque = `      {analisisId === null && (
        <div className="mt-6">
          <CrearAnalisis tipo="${tipo}" />
        </div>
      )}

      {error && (
        <p className="mt-4 text-12_5" style={{ color: 'var(--hf-danger-text)' }}>
          {error}
        </p>
      )}

`;
  s = s.replace(ancla, bloque + ancla);
  writeFileSync(p, s);
  console.log('  ' + p + ' — formulario y aviso montados');
}
