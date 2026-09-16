// prisma/__tests__/relevancias.test.ts
//
// REQ-SIG-21 · las 272 relevancias control–amenaza tienen DOS portadores, y este archivo
// existe para que no puedan discrepar.
//
//   · `prisma/data/relevancia-pendiente.csv` es el que lee `prisma/seeds/iso.ts`, y por eso
//     es el que MANDA: `leerAsignacionRelevancia` alimenta un `upsert` con
//     `update: { relevanciaId }`, así que una siembra con la columna vacía no deja las
//     asignaciones quietas — las pone en null, las 272.
//   · La migración `…_req_sig_21_relevancias` es la que aplica lo mismo sobre una base que
//     ya existe, que es el único camino que corre el despliegue (`prisma migrate deploy`;
//     la siembra no corre en CI).
//
// Dos portadores del mismo hecho es exactamente la forma de los tres bugs del 15/09 que
// documenta HARNESS.md: ninguna pieza estaba mal, lo que fallaba era la composición. Acá el
// modo de falla concreto sería recalificar un control en el CSV, desplegar, y que producción
// siguiera con la relevancia vieja porque la migración ya estaba aplicada — sin que nada
// fallara ni se pusiera rojo. Comparar los dos conjuntos cuesta milisegundos.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATOS = join(__dirname, '..', 'data');
const MIGRACION = join(
  __dirname,
  '..',
  'migrations',
  '20260916160000_req_sig_21_relevancias',
  'migration.sql',
);

const VALORES = ['Principal', 'Complementario', 'De apoyo'] as const;
type Relevancia = (typeof VALORES)[number];

interface Par {
  amenaza: string;
  control: string;
  relevancia: string;
}

/// El nombre del control va entre comillas y PUEDE LLEVAR COMAS —«Requisitos legales,
/// estatutarios, reglamentarios y contractuales»—, así que se leen los bordes, igual que
/// `leerAsignacionRelevancia` en el seed. Partir por coma y confiar en el índice 6 devuelve
/// basura en 17 de las 272 filas.
function leerCsv(): Par[] {
  const crudo = readFileSync(join(DATOS, 'relevancia-pendiente.csv'), 'utf8').replace(/^﻿/, '');
  return crudo
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((linea) => {
      const campos = linea.split(',');
      return {
        amenaza: campos[0].trim(),
        control: campos[1].trim(),
        relevancia: campos[campos.length - 1].trim(),
      };
    });
}

/// Las tuplas `('A.10','A.8.24','De apoyo')` del INSERT de la migración.
function leerMigracion(): Par[] {
  const sql = readFileSync(MIGRACION, 'utf8');
  const tuplas = sql.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g);
  return [...tuplas].map((m) => ({ amenaza: m[1], control: m[2], relevancia: m[3] }));
}

function clave(p: Par): string {
  return `${p.amenaza}|${p.control}|${p.relevancia}`;
}

describe('REQ-SIG-21 · las relevancias están versionadas', () => {
  it('el CSV tiene los 272 pares clasificados, sin ninguno en blanco', () => {
    const pares = leerCsv();
    const enBlanco = pares.filter((p) => p.relevancia === '');

    expect(enBlanco).toEqual([]);
    expect(pares).toHaveLength(272);
  });

  it('el CSV solo usa los tres valores del catálogo `relevancia_control`', () => {
    // Un valor fuera de esta lista no es un error de escritura que alguien note: el seed lo
    // rechaza con `Relevancia desconocida en el CSV`, pero recién al sembrar.
    const invalidos = leerCsv().filter((p) => !VALORES.includes(p.relevancia as Relevancia));

    expect(invalidos).toEqual([]);
  });

  it('cada amenaza tiene exactamente un Principal — ni cero ni dos', () => {
    // Cero principales deja la amenaza en la regla v2 (media simple, sin techo) sin decirlo.
    // Dos es un error de datos que `desglosarEficaciaAmenaza` rechaza: el techo sería
    // ambiguo. Las dos cosas se ven acá y no seis meses después en una matriz.
    const principalesPorAmenaza = new Map<string, number>();
    for (const p of leerCsv()) {
      const previos = principalesPorAmenaza.get(p.amenaza) ?? 0;
      principalesPorAmenaza.set(p.amenaza, previos + (p.relevancia === 'Principal' ? 1 : 0));
    }
    const mal = [...principalesPorAmenaza.entries()].filter(([, n]) => n !== 1);

    expect(mal).toEqual([]);
    expect(principalesPorAmenaza.size).toBe(57);
  });

  it('el CSV cubre exactamente los pares de `control-amenaza.json`, sin sobrar ni faltar', () => {
    // El CSV se generó del mapeo; si alguien agrega un par al JSON y no al CSV, esa amenaza
    // queda clasificada A MEDIAS, que es el estado que el seed rechaza de plano.
    const mapeo: { amenaza: string; control: string }[] = JSON.parse(
      readFileSync(join(DATOS, 'control-amenaza.json'), 'utf8'),
    );
    const enJson = new Set(mapeo.map((p) => `${p.amenaza}|${p.control}`));
    const enCsv = new Set(leerCsv().map((p) => `${p.amenaza}|${p.control}`));

    expect([...enJson].filter((k) => !enCsv.has(k))).toEqual([]);
    expect([...enCsv].filter((k) => !enJson.has(k))).toEqual([]);
  });

  it('la migración declara EXACTAMENTE las mismas 272 asignaciones que el CSV', () => {
    // La prueba que justifica el archivo. El CSV manda (lo lee el seed) y la migración lo
    // aplica sobre la base viva; que digan cosas distintas es una divergencia silenciosa:
    // ninguna de las dos falla sola.
    const enCsv = new Set(leerCsv().map(clave));
    const enSql = new Set(leerMigracion().map(clave));

    expect([...enCsv].filter((k) => !enSql.has(k)).sort()).toEqual([]);
    expect([...enSql].filter((k) => !enCsv.has(k)).sort()).toEqual([]);
    expect(enSql.size).toBe(272);
  });
});
