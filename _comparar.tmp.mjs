// Compara una vista contra su lienzo. A diferencia de la auditoría automática anterior,
// esta corre CON datos y busca los textos ESTÁTICOS del diseño — los que tienen que estar
// aunque la base esté vacía. Los `{{...}}` del lienzo son plantilla y se descartan.
import { config } from 'dotenv';
config({ quiet: true });
import { encode } from 'next-auth/jwt';
import { readFileSync } from 'node:fs';

const BASE = 'http://localhost:3004';
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE + '/api/auth/providers')).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 2000));
}

const [lienzo, ruta] = process.argv.slice(2);

function normalizar(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/// Texto del lienzo que NO es plantilla ni dato: lo que la pantalla debe decir siempre.
function textosDelDiseno(html) {
  let s = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  s = s.replace(/<\/(h1|h2|h3|h4|p|li|button|span|div|td|th|label|a|summary)>/g, '\n');
  s = s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const fuera = new Set();
  for (const cruda of s.split('\n')) {
    const t = cruda.replace(/\s+/g, ' ').trim();
    if (t.length < 5 || t.length > 60) continue;
    if (t.includes('{{')) continue;              // plantilla del lienzo
    if (/^[\d.,%\s·/·-]+$/.test(t)) continue;    // dato numérico
    if (/^[A-Z]{2,3}$/.test(t)) continue;        // iniciales del avatar
    fuera.add(t);
  }
  return [...fuera];
}

const cookie = `next-auth.session-token=${await encode({
  token: { name: 'Diego Muñoz', email: 'diego.munoz@cuantico.com', grupos: ['Líderes SIG'] },
  secret: process.env.NEXTAUTH_SECRET,
})}`;

const res = await fetch(BASE + ruta, { redirect: 'manual', headers: { cookie } });
if (res.status !== 200) {
  console.log(`  ${ruta} respondió HTTP ${res.status}`);
  process.exit(1);
}
const pantalla = normalizar((await res.text()).replace(/<[^>]+>/g, ' '));

const esperados = textosDelDiseno(readFileSync(lienzo, 'utf8'));
const falta = esperados.filter((t) => !pantalla.includes(normalizar(t)));

console.log(`\n  ${lienzo}`);
console.log(`  → ${ruta}\n`);
console.log(`  textos estáticos del lienzo : ${esperados.length}`);
console.log(`  presentes en la pantalla    : ${esperados.length - falta.length}`);
console.log(`  ausentes                    : ${falta.length}\n`);
if (falta.length) {
  console.log('  LO QUE NO ENCUENTRO:');
  for (const t of falta) console.log(`    · ${t}`);
}
