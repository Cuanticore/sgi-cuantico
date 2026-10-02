/**
 * @jest-environment node
 */

// app/api/v1/__tests__/toda-ruta-usa-con-token.test.ts
//
// **D5 · la red que sostiene la decisión, no la memoria de quien agregue el siguiente
// archivo.** `middleware.ts` enumera lo PROTEGIDO y deja fuera a `/api/v1` A PROPÓSITO (ver su
// comentario): meter la ruta en el matcher cambiaría un 401 con cuerpo por un 302 hacia HTML,
// que un cliente máquina no sabe interpretar. La contrapartida de dejarla fuera es que NADA
// la protege por default — así que esta prueba recorre el árbol entero de `app/api/v1/` y
// falla si algún manejador exportado de algún `route.ts` no está envuelto en `conToken`.
//
// **Por qué un análisis de AST y no un regex sobre el texto.** Un regex del estilo
// `/conToken\(/` pasaría aunque `conToken` sólo se mencionara en un comentario, o aunque se
// usara para envolver una ruta DISTINTA de la que de verdad exporta `GET`. Lo que hace falta
// demostrar es una propiedad estructural —«el valor exportado con el nombre de un verbo HTTP
// es el resultado de llamar a `conToken`, importado de `@/lib/api/con-token`»— y eso exige
// mirar el árbol sintáctico, no el texto.
//
// **La convención que esto impone, a propósito:** todo manejador de `/api/v1` se declara
// `export const GET = conToken('permiso', async (request, autor, contexto) => { ... })`, nunca
// `export async function GET(...) { ... }`. Una `function` declarada así podría envolver
// `conToken` en cualquier parte de su cuerpo —o en ninguna— sin que el árbol lo delate de
// forma confiable; una `const` asignada a una llamada no deja ambigüedad.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const RAIZ = path.join(process.cwd(), 'app', 'api', 'v1');
const VERBOS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function archivosDeRuta(dir: string): string[] {
  if (!statSyncSeguro(dir)?.isDirectory()) return [];
  const encontrados: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === '__tests__') continue;
    const ruta = path.join(dir, nombre);
    const info = statSync(ruta);
    if (info.isDirectory()) {
      encontrados.push(...archivosDeRuta(ruta));
    } else if (nombre === 'route.ts' || nombre === 'route.tsx') {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

function statSyncSeguro(ruta: string) {
  try {
    return statSync(ruta);
  } catch {
    return null;
  }
}

interface Hallazgo {
  archivo: string;
  manejador: string;
  envuelto: boolean;
}

/// Analiza un `route.ts`: por cada verbo HTTP exportado, dice si el valor exportado es
/// literalmente `conToken(...)`, importado de `@/lib/api/con-token`.
function analizar(archivo: string): Hallazgo[] {
  const texto = readFileSync(archivo, 'utf8');
  const fuente = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const importaConToken = fuente.statements.some((s) => {
    if (!ts.isImportDeclaration(s)) return false;
    if (!ts.isStringLiteral(s.moduleSpecifier)) return false;
    if (s.moduleSpecifier.text !== '@/lib/api/con-token') return false;
    const nombres = s.importClause?.namedBindings;
    return (
      !!nombres && ts.isNamedImports(nombres) && nombres.elements.some((e) => e.name.text === 'conToken')
    );
  });

  const hallazgos: Hallazgo[] = [];

  for (const s of fuente.statements) {
    const modificadores = ts.canHaveModifiers(s) ? (ts.getModifiers(s) ?? []) : [];
    const esExportado = modificadores.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!esExportado) continue;

    // `export async function GET(...) {}` — nunca envuelve de forma verificable (ver cabecera).
    if (ts.isFunctionDeclaration(s)) {
      const nombre = s.name?.text;
      if (nombre && VERBOS.has(nombre)) hallazgos.push({ archivo, manejador: nombre, envuelto: false });
      continue;
    }

    // `export const GET = conToken('permiso', manejador)`
    if (ts.isVariableStatement(s)) {
      for (const decl of s.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !VERBOS.has(decl.name.text)) continue;
        const nombre = decl.name.text;
        const llamaAConToken =
          !!decl.initializer &&
          ts.isCallExpression(decl.initializer) &&
          ts.isIdentifier(decl.initializer.expression) &&
          decl.initializer.expression.text === 'conToken';
        hallazgos.push({ archivo, manejador: nombre, envuelto: llamaAConToken && importaConToken });
      }
    }
  }

  return hallazgos;
}

const archivos = archivosDeRuta(RAIZ);
const hallazgos = archivos.flatMap(analizar);

describe('toda ruta de app/api/v1 pasa por conToken (D5)', () => {
  it('la prueba tiene algo que mirar: existe al menos un route.ts bajo app/api/v1', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('cada route.ts exporta al menos un manejador HTTP', () => {
    expect(hallazgos.length).toBeGreaterThan(0);
  });

  for (const h of hallazgos) {
    const relativo = path.relative(process.cwd(), h.archivo);
    it(`${relativo} → ${h.manejador} está envuelto en conToken`, () => {
      expect(h.envuelto).toBe(true);
    });
  }
});
