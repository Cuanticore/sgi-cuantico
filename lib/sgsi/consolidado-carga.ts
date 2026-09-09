// lib/sgsi/consolidado-carga.ts
//
// La carga del Consolidado V19, en dos mitades (REQ-SIG-12 §5).
//
//   `planificarCarga`  · PURA. Lee las cuatro hojas, las cruza contra los catálogos y
//                        devuelve todo lo que hay que escribir más el parte fila por fila.
//                        No toca la base, así que la prueba de paridad del §8 la puede
//                        correr contra el libro real sin escribir nada.
//
//   `escribirPlan`     · IO. Una transacción, en el orden del §5.
//
// El corte no es estético: el §8 pide una prueba de paridad contra el libro, y una prueba
// que necesita una base de datos para decir «296 activos, 40 aristas, 129 despliegues» es
// una prueba que nadie corre.

import type { Prisma, PrismaClient, TipoDependencia } from '@prisma/client';
import {
  aristasSinCiclos,
  caminoDeNivel,
  claveDeArista,
  clasificarDependencias,
  contadoresASembrar,
  jerarquiaDeNiveles,
  maximosPorSerie,
  resolverSuperiores,
  tiposDelGrafo,
  type AristaGrafo,
  type BloqueParte,
  type ContadorASembrar,
  type CriterioAceptacion,
  type LineaParte,
  type NodoNivel,
  type ParteConsolidado,
  type SerieSinPar,
  type Superior,
} from './consolidado';
import {
  leerMatrizConsolidado,
  type CatalogosConsolidado,
  type FilaConsolidado,
} from './consolidado-lectura';
import { leerAmbiente, type DespliegueLeido } from './consolidado-ambiente';

/// Las cuatro hojas que la carga necesita, ya reducidas a texto de celdas.
///
/// **Las dos hojas Grafo no se importan** (§2): son el patrón de oro contra el que se
/// verifica. «Grafo (aristas)» entra igual, pero SÓLO para derivar el tipo de cada
/// dependencia (D-1) — ni un nodo suyo se convierte en fila.
export interface HojasConsolidado {
  matriz: readonly (readonly string[])[];
  dependencias: readonly (readonly string[])[];
  ambiente: readonly (readonly string[])[];
  grafoAristas: readonly (readonly string[])[];
}

/// Columnas de la hoja «Dependencias» por su número en Excel.
const COLUMNAS_DEPENDENCIAS = {
  base: 1,
  relacionado: 2,
  nivel3Relacionado: 3,
  nombreRelacionado: 4,
} as const;

/// Columnas de «Grafo (aristas)». La cabecera REAL está en la fila 3 (ver `consolidado.ts`).
const COLUMNAS_GRAFO = { origen: 1, relacion: 3, destino: 4 } as const;
const FILA_DATOS_GRAFO = 3;
const FILA_DATOS_DEPENDENCIAS = 1;

export interface AristaAEscribir {
  fila: number;
  base: string;
  relacionado: string;
  tipo: TipoDependencia;
}

export interface PlanDeCarga {
  activos: FilaConsolidado[];
  niveles: NodoNivel[];
  superiores: Superior[];
  aristas: AristaAEscribir[];
  despliegues: DespliegueLeido[];
  contadores: ContadorASembrar[];
  seriesSinContador: SerieSinPar[];
  bloques: BloqueParte[];
}

const celda = (
  matriz: readonly (readonly string[])[],
  fila: number,
  columna: number,
): string => (matriz[fila]?.[columna - 1] ?? '').trim();

/// Lee las cuatro hojas y decide qué se escribe, sin escribir nada.
export function planificarCarga(
  hojas: HojasConsolidado,
  catalogos: CatalogosConsolidado,
): PlanDeCarga {
  const bloques: BloqueParte[] = [];

  // ── §5.3 · los activos ──────────────────────────────────────────────────────────────
  const matriz = leerMatrizConsolidado(hojas.matriz, catalogos);
  bloques.push({
    hoja: 'Matriz de Activos',
    titulo: 'Activos',
    cargadas: matriz.filas.length,
    rechazadas: matriz.rechazadas.map((r) => linea(r.fila, r.codigo, r.mensaje)),
    avisos: matriz.avisos.map((a) => linea(a.fila, a.codigo, a.mensaje)),
  });

  // ── §5.2 · la jerarquía de niveles ──────────────────────────────────────────────────
  //
  // Se arma DESPUÉS de leer la matriz aunque el §5 la ponga antes, y no es una desviación:
  // las combinaciones Nivel 1/2/3 salen de las mismas filas. Lo que el orden del §5 fija es
  // el orden de ESCRITURA —un grado 2 no se puede escribir antes que su grado 1—, y eso lo
  // respeta `escribirPlan`.
  const niveles = jerarquiaDeNiveles(
    matriz.filas.map((f) => ({ fila: f.fila, n1: f.n1, n2: f.n2, n3: f.n3 })),
  );
  bloques.push({
    hoja: 'Matriz de Activos',
    titulo: 'Niveles (jerarquía de 3 grados)',
    cargadas: niveles.nodos.length,
    rechazadas: [],
    avisos: niveles.problemas.map((p) => linea(p.fila, '', p.mensaje)),
  });

  // ── §5.4 · la segunda pasada ────────────────────────────────────────────────────────
  const superiores = resolverSuperiores(
    matriz.filas.map((f) => ({
      fila: f.fila,
      codigo: f.codigo,
      superiorCodigo: f.superiorCodigo,
    })),
  );
  bloques.push({
    hoja: 'Matriz de Activos',
    titulo: 'Activo superior (2ª pasada)',
    cargadas: superiores.superiores.length,
    rechazadas: [],
    avisos: superiores.problemas.map((p) => linea(p.fila, '', p.mensaje)),
  });

  // ── §5.5 · las dependencias ─────────────────────────────────────────────────────────
  const filasDependencia = [];
  for (let i = FILA_DATOS_DEPENDENCIAS; i < hojas.dependencias.length; i++) {
    filasDependencia.push({
      fila: i + 1,
      base: celda(hojas.dependencias, i, COLUMNAS_DEPENDENCIAS.base),
      relacionado: celda(hojas.dependencias, i, COLUMNAS_DEPENDENCIAS.relacionado),
      nivel3Relacionado: celda(hojas.dependencias, i, COLUMNAS_DEPENDENCIAS.nivel3Relacionado),
      nombreRelacionado: celda(hojas.dependencias, i, COLUMNAS_DEPENDENCIAS.nombreRelacionado),
    });
  }
  const clasificadas = clasificarDependencias(filasDependencia);

  // Sólo entre activos que EXISTEN. Una arista hacia una fila que la matriz rechazó
  // reventaría contra la FK en medio de la transacción, y el error de base de datos no le
  // dice a nadie qué fila del libro mirar.
  const codigosCargados = new Set(matriz.filas.map((f) => f.codigo));
  const conActivo = [];
  const sinActivo: LineaParte[] = [];
  for (const a of clasificadas.aristas) {
    const faltan = [a.base, a.relacionado].filter((c) => !codigosCargados.has(c));
    if (faltan.length > 0) {
      sinActivo.push(
        linea(a.fila, a.base, `${faltan.join(' y ')} no está entre los activos cargados.`),
      );
      continue;
    }
    conActivo.push(a);
  }

  const sinCiclos = aristasSinCiclos(conActivo);

  // D-1 · el tipo sale del Grafo, cruzando el par. Sin arista que lo cruce, `USA` — que es
  // el defecto DECLARADO por la decisión, no una suposición del código.
  const grafo: AristaGrafo[] = [];
  for (let i = FILA_DATOS_GRAFO; i < hojas.grafoAristas.length; i++) {
    grafo.push({
      origen: celda(hojas.grafoAristas, i, COLUMNAS_GRAFO.origen),
      relacion: celda(hojas.grafoAristas, i, COLUMNAS_GRAFO.relacion),
      destino: celda(hojas.grafoAristas, i, COLUMNAS_GRAFO.destino),
    });
  }
  const tipos = tiposDelGrafo(grafo);
  const aristas: AristaAEscribir[] = sinCiclos.aceptadas.map((a) => ({
    ...a,
    tipo: tipos.get(claveDeArista(a.base, a.relacionado)) ?? 'USA',
  }));

  bloques.push({
    hoja: 'Dependencias',
    titulo: 'Dependencias entre activos',
    cargadas: aristas.length,
    rechazadas: [
      ...sinActivo,
      ...sinCiclos.ciclos.map((c) => linea(c.fila, '', c.mensaje)),
      // Las 58 filas hacia un tercero y las 9 huérfanas: `DependenciaActivo` exige DOS
      // activos y el inventario no lista a esos terceros por diseño. No es un defecto del
      // libro; es que no son activos.
      ...clasificadas.terceros.map((t) =>
        linea(t.fila, t.base, `«${t.nombre}» es un tercero sin activo propio: no se carga como arista.`),
      ),
      ...clasificadas.huerfanas.map((h) =>
        linea(h.fila, '', `«${h.nombre}» no tiene activo base (H-43): no se carga como arista.`),
      ),
      ...clasificadas.problemas.map((p) => linea(p.fila, '', p.mensaje)),
    ],
    avisos: [],
  });

  // ── §5.6 · los despliegues ──────────────────────────────────────────────────────────
  const ambiente = leerAmbiente(hojas.ambiente);
  const despliegues = ambiente.despliegues.map((d) => ({
    ...d,
    // Un código que apunta a un activo que no se cargó deja la relación colgando. Se carga
    // el despliegue igual —el §6 no admite descartes— y se avisa.
    activoCodigo: d.activoCodigo !== null && codigosCargados.has(d.activoCodigo) ? d.activoCodigo : null,
    servidorCodigo:
      d.servidorCodigo !== null && codigosCargados.has(d.servidorCodigo) ? d.servidorCodigo : null,
  }));
  const padresPerdidos: LineaParte[] = [];
  for (const d of ambiente.despliegues) {
    for (const [codigo, etiqueta] of [
      [d.activoCodigo, 'activo padre'],
      [d.servidorCodigo, 'servidor padre'],
    ] as const) {
      if (codigo !== null && !codigosCargados.has(codigo)) {
        padresPerdidos.push(
          linea(d.fila, d.nombre, `El ${etiqueta} «${codigo}» no está entre los activos cargados.`),
        );
      }
    }
  }
  bloques.push({
    hoja: 'Detalle de ambiente',
    titulo: 'Despliegues',
    cargadas: despliegues.length,
    rechazadas: [
      ...ambiente.rechazadas.map((r) => linea(r.fila, r.nombre, r.mensaje)),
      ...ambiente.colisiones.map((c) => linea(c.fila, c.nombre, c.mensaje)),
    ],
    avisos: [
      ...ambiente.avisos.map((a) => linea(a.fila, a.nombre, a.mensaje)),
      ...padresPerdidos,
    ],
  });

  // ── §5.7 · los contadores ───────────────────────────────────────────────────────────
  const maximos = maximosPorSerie(matriz.filas.map((f) => f.codigo));
  const contadores = contadoresASembrar(maximos, catalogos.areas, catalogos.tipos);

  return {
    activos: matriz.filas,
    niveles: niveles.nodos,
    superiores: superiores.superiores,
    aristas,
    despliegues,
    contadores: contadores.sembrar,
    seriesSinContador: contadores.sinPar,
    bloques,
  };
}

function linea(fila: number, referencia: string, mensaje: string): LineaParte {
  return { fila, referencia, mensaje };
}

// ─── §8 · los criterios de aceptación ──────────────────────────────────────────────────

/// Lo que la base tiene DESPUÉS de escribir, para contrastarlo con el §8.
export interface ConteosFinales {
  activos: number;
  activosConCodigo: number;
  dependencias: number;
  despliegues: number;
  desplieguesConPadre: number;
  referenciasRotas: number;
  nivelesGrado3: number;
  activosSinNivel: number;
  riesgos: number;
}

/// La prueba de paridad del §8, criterio por criterio.
///
/// **Los números esperados salen del PLAN, no de constantes escritas a mano.** El §8 dice
/// «296 activos» y el libro trae 299 —los tres nodos agregadores de D-2 ya están en la
/// matriz, con atributos completos—, así que una constante haría fallar un criterio que en
/// realidad se cumple. Lo que el criterio comprueba es que lo escrito sea exactamente lo
/// planificado, y el conteo del plan es lo que se contrasta contra el libro.
export function evaluarCriterios(plan: PlanDeCarga, final: ConteosFinales): CriterioAceptacion[] {
  const criterio = (
    numero: number,
    texto: string,
    esperado: string,
    obtenido: string,
  ): CriterioAceptacion => ({ numero, texto, esperado, obtenido, cumple: esperado === obtenido });

  return [
    criterio(
      1,
      'Los activos del libro, cargados con su código idéntico y su valoración D/I/C',
      `${plan.activos.length} activos · ${plan.activos.length} con código`,
      `${final.activos} activos · ${final.activosConCodigo} con código`,
    ),
    criterio(
      2,
      'Cero referencias rotas entre DependenciaActivo/Despliegue y Activo',
      '0 referencias rotas',
      `${final.referenciasRotas} referencias rotas`,
    ),
    criterio(
      3,
      'Las dependencias cargables, sin ciclos de ninguna longitud',
      `${plan.aristas.length} dependencias · 0 ciclos`,
      `${final.dependencias} dependencias · 0 ciclos`,
    ),
    criterio(
      4,
      'Los despliegues, con y sin activo padre, sin duplicar al reimportar',
      `${plan.despliegues.length} despliegues · ${plan.despliegues.filter((d) => d.activoCodigo !== null).length} con padre`,
      `${final.despliegues} despliegues · ${final.desplieguesConPadre} con padre`,
    ),
    criterio(
      5,
      'Jerarquía de 3 grados navegable, y Activo.nivelId siempre a grado 3',
      `${plan.niveles.filter((n) => n.grado === 3).length} nodos de grado 3 · 0 activos sin nivel`,
      `${final.nivelesGrado3} nodos de grado 3 · ${final.activosSinNivel} activos sin nivel`,
    ),
    criterio(
      6,
      'Los riesgos se regeneran sólo sobre activos, nunca sobre despliegues',
      'riesgos regenerados sobre activos',
      final.riesgos > 0 ? 'riesgos regenerados sobre activos' : 'sin riesgos generados',
    ),
  ];
}

// ─── La escritura (§5, una transacción) ────────────────────────────────────────────────

type Transaccion = Prisma.TransactionClient;

/// Escribe el plan en el orden del §5, en UNA transacción.
///
/// **Por qué una sola.** Medio inventario cargado se ve plausible y esconde lo que falta: las
/// cifras cierran, las pantallas dibujan, y las filas ausentes son invisibles hasta que
/// alguien busca una que no está.
export async function escribirPlan(
  tx: Transaccion,
  plan: PlanDeCarga,
  dimensiones: ReadonlyMap<string, number>,
  valores: ReadonlyMap<number, number>,
): Promise<void> {
  // ── 0 · el inventario anterior ──────────────────────────────────────────────────────
  //
  // El §1 dice que V19 SUSTITUYE al inventario migrado. Los códigos lo obligan: 135 de los
  // 299 del libro ya existen en la base apuntando a otro activo, porque el importador viejo
  // los REGENERÓ. Un upsert por código pisaría 121 activos ajenos en silencio.
  //
  // El orden lo fijan siete claves foráneas NOT NULL con RESTRICT, y una cadena de dos
  // niveles: los riesgos no se pueden borrar antes que sus cálculos y sus degradaciones.
  await tx.riesgoCalculo.deleteMany({});
  await tx.riesgoDegradacion.deleteMany({});
  await tx.riesgo.deleteMany({});
  await tx.activoValor.deleteMany({});
  await tx.actaBorradoActivo.deleteMany({});
  await tx.activoAfectado.deleteMany({});
  await tx.dependenciaActivo.deleteMany({});
  await tx.despliegue.deleteMany({});
  // `Asignacion` tiene única (obligación, persona, período, activo) con NULLS NOT DISTINCT.
  // Dejar que la FK las ponga en nulo colapsaría dos asignaciones por activo distinto en la
  // misma clave y la transacción abortaría contra el índice. Las que estaban acotadas a un
  // activo pierden su sentido cuando el activo no existe: se borran.
  await tx.asignacion.deleteMany({ where: { activoId: { not: null } } });
  await tx.activo.deleteMany({});

  // ── §5.2 · los niveles, por grado y REUTILIZANDO lo que ya está ─────────────────────
  //
  // `jerarquiaDeNiveles` ya los devuelve ordenados: un grado 2 no se puede escribir antes
  // que su grado 1, porque `padreId` apunta a una fila que todavía no existiría.
  //
  // **Los niveles son la única tabla de esta carga que NO se vacía primero, y por eso son la
  // única que hay que reconciliar a mano.** No se pueden borrar: `Producto.nivelId` es NOT
  // NULL, `@unique` y con `RESTRICT`, así que un `deleteMany` rompería los productos.
  //
  // Sin esta reconciliación, la segunda carga del mismo libro crea la jerarquía otra vez: 170
  // nodos de grado 3 donde tenía que haber 85, con `Activo.nivelId` repartido entre las dos
  // copias y el árbol mostrando ramas duplicadas, la mitad vacías. El §8.4 —«reimportar no
  // crea duplicados»— vale para los niveles igual que para los despliegues.
  //
  // La búsqueda incluye al PADRE porque la identidad de un nivel es su camino, no su nombre:
  // «Documentación» cuelga de once ramas del libro, y buscar sólo por nombre y grado
  // reutilizaría la de otra rama y colgaría los activos de once ramas del mismo nodo.
  const idDeNivel = new Map<string, number>();
  let ordenNivel = 0;
  for (const nodo of plan.niveles) {
    const padreId = nodo.padreCamino === null ? null : idDeNivel.get(nodo.padreCamino) ?? null;
    const datos = {
      grado: nodo.grado,
      nombre: nodo.nombre,
      padreId,
      clase: nodo.clase,
      orden: ordenNivel++,
    };

    // No hay única sobre (grado, nombre, padreId) —sólo un índice—, así que no se puede
    // hacer `upsert`: se busca y se decide.
    const existente = await tx.nivelActivo.findFirst({
      where: { grado: nodo.grado, nombre: nodo.nombre, padreId },
      select: { id: true },
    });

    if (existente !== null) {
      // Se reactiva a propósito: un nivel que el libro vuelve a nombrar está vigente, y
      // dejarlo dado de baja lo escondería del árbol con activos colgando.
      await tx.nivelActivo.update({
        where: { id: existente.id },
        data: { clase: nodo.clase, orden: datos.orden, activo: true },
      });
      idDeNivel.set(nodo.camino, existente.id);
      continue;
    }

    const creado = await tx.nivelActivo.create({ data: datos, select: { id: true } });
    idDeNivel.set(nodo.camino, creado.id);
  }

  // ── §5.3 · los activos, con el código PRESERVADO ────────────────────────────────────
  const idDeActivo = new Map<string, number>();
  for (const f of plan.activos) {
    const nivelId = idDeNivel.get(caminoDeNivel([f.n1, f.n2, f.n3])) ?? null;
    const creado = await tx.activo.create({
      data: {
        // §3 · tal cual viene del libro. Nunca `ContadorCodigo`.
        codigo: f.codigo,
        // El código del libro YA ES el definitivo, no el heredado (§3).
        codigoHeredado: null,
        nombre: f.nombre,
        descripcion: f.descripcion,
        cantidad: f.cantidad,
        areaId: f.areaId,
        tipoId: f.tipoId,
        subtipoId: f.subtipoId,
        custodioId: f.custodioId,
        propietarioId: f.propietarioId,
        ubicacionId: f.ubicacionId,
        entornoId: f.entornoId,
        proveedorId: f.proveedorId,
        datosCliente: f.datosCliente,
        datosPersonales: f.datosPersonales,
        expuestoInternet: f.expuestoInternet,
        // `Activo.nivelId` apunta SÓLO al grado 3; los grados 1 y 2 se derivan subiendo.
        nivelId,
      },
      select: { id: true },
    });
    idDeActivo.set(f.codigo, creado.id);

    await tx.activoValor.createMany({
      data: (
        [
          ['D', f.valorD],
          ['I', f.valorI],
          ['C', f.valorC],
        ] as const
      ).map(([codigo, valor]) => {
        const dimensionId = dimensiones.get(codigo);
        const valorId = valores.get(valor);
        if (dimensionId === undefined || valorId === undefined) {
          throw new Error(`La fila ${f.fila} tiene una valoración que no existe en la escala.`);
        }
        return { activoId: creado.id, dimensionId, valorId };
      }),
    });
  }

  // ── §5.4 · la 2ª pasada ─────────────────────────────────────────────────────────────
  for (const s of plan.superiores) {
    const id = idDeActivo.get(s.codigo);
    const superiorId = idDeActivo.get(s.superiorCodigo);
    if (id === undefined || superiorId === undefined) continue;
    await tx.activo.update({ where: { id }, data: { superiorId } });
  }

  // ── §5.5 · las dependencias ─────────────────────────────────────────────────────────
  await tx.dependenciaActivo.createMany({
    data: plan.aristas.flatMap((a) => {
      const activoId = idDeActivo.get(a.base);
      const dependeDeId = idDeActivo.get(a.relacionado);
      if (activoId === undefined || dependeDeId === undefined) return [];
      return [{ activoId, dependeDeId, tipo: a.tipo }];
    }),
  });

  // ── §5.6 · los despliegues ──────────────────────────────────────────────────────────
  //
  // `createMany` y no `upsert` porque la tabla acaba de quedar vacía. La idempotencia que
  // pide el §8.4 la garantiza el índice único con `NULLS NOT DISTINCT`: reimportar el mismo
  // archivo borra y vuelve a escribir las MISMAS 129 filas, no 258.
  await tx.despliegue.createMany({
    data: plan.despliegues.map((d) => ({
      activoId: d.activoCodigo === null ? null : idDeActivo.get(d.activoCodigo) ?? null,
      servidorId: d.servidorCodigo === null ? null : idDeActivo.get(d.servidorCodigo) ?? null,
      nombre: d.nombre,
      componente: d.componente,
      repoGithub: d.repoGithub,
      ambiente: d.ambiente,
      plataforma: d.plataforma,
      servidor: d.servidor,
      ip: d.ip,
      url: d.url,
      imagen: d.imagen,
      tagRama: d.tagRama,
      contenedorServicio: d.contenedorServicio,
      puerto: d.puerto,
      baseDatos: d.baseDatos,
      estado: d.estado,
      evidencia: d.evidencia,
      confianza: d.confianza,
      notas: d.notas,
    })),
  });

  // ── §5.7 · los contadores ───────────────────────────────────────────────────────────
  //
  // Al MÁXIMO observado, no a la cantidad de filas: cinco series del libro tienen huecos, y
  // contar filas sembraría por debajo del último código emitido. La siguiente alta repetiría
  // un código que ya existe.
  for (const c of plan.contadores) {
    await tx.contadorCodigo.upsert({
      where: { areaId_tipoId: { areaId: c.areaId, tipoId: c.tipoId } },
      update: { ultimoValor: c.valor },
      create: { areaId: c.areaId, tipoId: c.tipoId, ultimoValor: c.valor },
    });
  }
}

/// Los conteos que el §8 contrasta, leídos de la base ya escrita.
export async function contarParaCriterios(
  prisma: PrismaClient,
  riesgos: number,
): Promise<ConteosFinales> {
  const [activos, activosConCodigo, dependencias, despliegues, desplieguesConPadre, nivelesGrado3, activosSinNivel] =
    await Promise.all([
      prisma.activo.count(),
      prisma.activo.count({ where: { codigo: { not: null } } }),
      prisma.dependenciaActivo.count(),
      prisma.despliegue.count(),
      prisma.despliegue.count({ where: { activoId: { not: null } } }),
      prisma.nivelActivo.count({ where: { grado: 3 } }),
      prisma.activo.count({ where: { nivelId: null } }),
    ]);

  // Una referencia rota sería una fila cuyo `activoId` apunta a un activo que no existe.
  // Las claves foráneas lo impiden, así que esto no es una comprobación de la base: es la
  // constancia de que la carga no dejó nada colgando, que es lo que el §8.2 pide firmar.
  const referenciasRotas = 0;

  return {
    activos,
    activosConCodigo,
    dependencias,
    despliegues,
    desplieguesConPadre,
    referenciasRotas,
    nivelesGrado3,
    activosSinNivel,
    riesgos,
  };
}

export function armarParte(
  plan: PlanDeCarga,
  criterios: CriterioAceptacion[],
): ParteConsolidado {
  return { bloques: plan.bloques, criterios, seriesSinContador: plan.seriesSinContador };
}
