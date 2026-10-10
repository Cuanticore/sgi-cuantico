/**
 * @jest-environment node
 */

// app/api/v1/__tests__/toda-ruta-esta-en-el-catalogo.test.ts
//
// **La otra mitad de la red de la tarea 3.6.** `lib/api/catalogo-rutas.ts` sostiene que el
// documento OpenAPI no se puede desincronizar porque las rutas LEEN de él el permiso que
// aplican. Eso cubre una dirección del problema: un catálogo editado mal rompe la ruta.
//
// Falta la otra, y es la que de verdad pasa: **alguien agrega un `route.ts` nuevo y no le
// escribe entrada.** La ruta funciona —tiene su `conToken` con un permiso literal, la prueba
// de AST que ya existe queda contenta—, pero el documento no la menciona. Y un contrato que
// omite una ruta es peor que no tener contrato: quien lo lee cree conocer la superficie
// entera, y hay una puerta de la que no sabe nada.
//
// Es exactamente la forma del problema que este repo ya tiene medido en otro sitio: las 214
// casillas `[PENDIENTE]` del expediente SIS-001 no eran casillas mal llenadas, eran casillas
// que nadie supo que existían hasta que alguien contó.
//
// El recorrido del árbol copia a `toda-ruta-usa-con-token.test.ts`, que resolvió lo mismo
// para la envoltura. Donde aquél mira el AST —porque la propiedad a demostrar es
// estructural—, acá alcanza con el nombre del archivo: la correspondencia entre la ruta de
// disco de Next.js y la ruta de OpenAPI es puramente léxica.

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { OPERACIONES } from '@/lib/api/catalogo-rutas';

const RAIZ = path.join(process.cwd(), 'app', 'api', 'v1');

function archivosDeRuta(dir: string): string[] {
  const encontrados: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === '__tests__') continue;
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      encontrados.push(...archivosDeRuta(ruta));
    } else if (nombre === 'route.ts' || nombre === 'route.tsx') {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

/// `app/api/v1/sistemas/[codigo]/route.ts` -> `/sistemas/{codigo}`.
///
/// Los segmentos dinámicos de Next.js van entre corchetes y los de OpenAPI entre llaves; es
/// la única traducción que hace falta. Un segmento comodín (`[...ruta]`) no se traduce a
/// propósito: OpenAPI no tiene forma de expresarlo, y si algún día aparece uno bajo `/api/v1`
/// esta prueba tiene que fallar y obligar a decidir cómo se documenta, en vez de inventar una
/// correspondencia que nadie revisó.
function rutaDeApi(archivo: string): string {
  const relativa = path.relative(RAIZ, path.dirname(archivo));
  if (relativa === '') return '/';
  return (
    '/' +
    relativa
      .split(path.sep)
      .map((s) => (s.startsWith('[') && s.endsWith(']') ? `{${s.slice(1, -1)}}` : s))
      .join('/')
  );
}

const ARCHIVOS = archivosDeRuta(RAIZ);

describe('el catálogo de rutas y el árbol de archivos dicen lo mismo', () => {
  it('hay rutas que revisar', () => {
    // Sin esto, borrar `app/api/v1/` entero dejaría las dos aserciones de abajo en verde
    // comparando dos listas vacías.
    expect(ARCHIVOS.length).toBeGreaterThan(0);
  });

  it('ninguna ruta del árbol falta en el catálogo', () => {
    const enDisco = ARCHIVOS.map(rutaDeApi).sort();
    const enCatalogo = [...new Set(OPERACIONES.map((o) => o.ruta))].sort();

    // Se comparan las listas enteras y no `every(...)`: así el mensaje de fallo NOMBRA la
    // ruta que falta, en vez de decir «false no es true».
    expect(enDisco).toEqual(enCatalogo);
  });

  it('ningún segmento comodín se coló sin decidir cómo se documenta', () => {
    for (const archivo of ARCHIVOS) {
      expect(rutaDeApi(archivo)).not.toContain('...');
    }
  });
});
