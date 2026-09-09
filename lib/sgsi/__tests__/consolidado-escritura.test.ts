// lib/sgsi/__tests__/consolidado-escritura.test.ts
//
// REQ-SIG-12 §5 · `escribirPlan`, con un cliente de mentira que anota lo que se le pide.
//
// **Por qué vale la pena una prueba con doble.** El §8.4 exige que reimportar el mismo
// archivo no duplique, y la primera versión de `escribirPlan` cumplía eso para activos,
// dependencias y despliegues —porque esas tablas se vacían antes— y NO para los niveles, que
// siempre se creaban. La segunda carga del libro real dejó 170 nodos de grado 3 donde tenía
// que haber 85, y `Activo.nivelId` apuntando a una de las dos copias: el árbol mostraba
// ramas duplicadas, la mitad vacías.
//
// Los niveles no se pueden vaciar como las otras tablas: `Producto.nivelId` es NOT NULL,
// `@unique` y con `RESTRICT`, así que borrarlos rompería los productos. La única salida es
// REUTILIZAR el nodo que ya existe, y eso es exactamente lo que esta prueba fija.

import { escribirPlan, type PlanDeCarga } from '../consolidado-carga';
import { caminoDeNivel } from '../consolidado';

interface Llamada {
  tabla: string;
  metodo: string;
  args: unknown;
}

/// Un cliente de transacción de mentira: anota cada llamada y devuelve lo mínimo que
/// `escribirPlan` necesita para seguir. `nivelesExistentes` simula lo que ya está en la base.
function clienteFalso(nivelesExistentes: { id: number; grado: number; nombre: string; padreId: number | null }[]) {
  const llamadas: Llamada[] = [];
  let siguienteId = 1000;

  const anotar = (tabla: string, metodo: string) => (args: unknown) => {
    llamadas.push({ tabla, metodo, args });
    return Promise.resolve({ count: 0 });
  };

  const tx = {
    riesgoCalculo: { deleteMany: anotar('riesgoCalculo', 'deleteMany') },
    riesgoDegradacion: { deleteMany: anotar('riesgoDegradacion', 'deleteMany') },
    riesgo: { deleteMany: anotar('riesgo', 'deleteMany') },
    activoValor: {
      deleteMany: anotar('activoValor', 'deleteMany'),
      createMany: anotar('activoValor', 'createMany'),
    },
    actaBorradoActivo: { deleteMany: anotar('actaBorradoActivo', 'deleteMany') },
    activoAfectado: { deleteMany: anotar('activoAfectado', 'deleteMany') },
    dependenciaActivo: {
      deleteMany: anotar('dependenciaActivo', 'deleteMany'),
      createMany: anotar('dependenciaActivo', 'createMany'),
    },
    despliegue: {
      deleteMany: anotar('despliegue', 'deleteMany'),
      createMany: anotar('despliegue', 'createMany'),
    },
    asignacion: { deleteMany: anotar('asignacion', 'deleteMany') },
    contadorCodigo: { upsert: anotar('contadorCodigo', 'upsert') },
    nivelActivo: {
      findFirst: (args: { where: { grado: number; nombre: string; padreId: number | null } }) => {
        llamadas.push({ tabla: 'nivelActivo', metodo: 'findFirst', args });
        const { grado, nombre, padreId } = args.where;
        const hallado = nivelesExistentes.find(
          (n) => n.grado === grado && n.nombre === nombre && n.padreId === (padreId ?? null),
        );
        return Promise.resolve(hallado ? { id: hallado.id } : null);
      },
      create: (args: unknown) => {
        llamadas.push({ tabla: 'nivelActivo', metodo: 'create', args });
        return Promise.resolve({ id: siguienteId++ });
      },
      update: anotar('nivelActivo', 'update'),
    },
    activo: {
      deleteMany: anotar('activo', 'deleteMany'),
      update: anotar('activo', 'update'),
      create: (args: unknown) => {
        llamadas.push({ tabla: 'activo', metodo: 'create', args });
        return Promise.resolve({ id: siguienteId++ });
      },
    },
  };

  // El doble implementa exactamente el subconjunto que `escribirPlan` usa; el resto del
  // cliente de Prisma no participa de esta escritura.
  return { tx: tx as unknown as Parameters<typeof escribirPlan>[0], llamadas };
}

const NODO = (grado: 1 | 2 | 3, nombre: string, segmentos: string[], padre: string[] | null) => ({
  grado,
  nombre,
  camino: caminoDeNivel(segmentos),
  padreCamino: padre === null ? null : caminoDeNivel(padre),
  clase: grado === 1 ? ('EMPRESA' as const) : null,
});

const PLAN: PlanDeCarga = {
  activos: [],
  niveles: [
    NODO(1, 'CUANTICO', ['CUANTICO'], null),
    NODO(2, 'SIG', ['CUANTICO', 'SIG'], ['CUANTICO']),
    NODO(3, 'Documentación', ['CUANTICO', 'SIG', 'Documentación'], ['CUANTICO', 'SIG']),
  ],
  superiores: [],
  aristas: [],
  despliegues: [],
  contadores: [],
  seriesSinContador: [],
  bloques: [],
};

const DIMENSIONES = new Map([['D', 1], ['I', 2], ['C', 3]]);
const VALORES = new Map([[3, 30]]);

describe('§5.0 · el inventario anterior se borra en orden de claves foráneas', () => {
  it('los riesgos van después de sus cálculos y degradaciones, y el activo al final', async () => {
    const { tx, llamadas } = clienteFalso([]);
    await escribirPlan(tx, PLAN, DIMENSIONES, VALORES);

    const borrados = llamadas.filter((l) => l.metodo === 'deleteMany').map((l) => l.tabla);
    // Siete claves foráneas NOT NULL con RESTRICT, y una cadena de dos niveles: los riesgos
    // no se pueden borrar antes que sus cálculos ni que sus degradaciones.
    expect(borrados.indexOf('riesgoCalculo')).toBeLessThan(borrados.indexOf('riesgo'));
    expect(borrados.indexOf('riesgoDegradacion')).toBeLessThan(borrados.indexOf('riesgo'));
    expect(borrados.indexOf('riesgo')).toBeLessThan(borrados.indexOf('activo'));
    for (const tabla of ['activoValor', 'actaBorradoActivo', 'activoAfectado', 'dependenciaActivo']) {
      expect(borrados.indexOf(tabla)).toBeLessThan(borrados.indexOf('activo'));
    }
    expect(borrados[borrados.length - 1]).toBe('activo');
  });

  // `Asignacion` tiene única (obligación, persona, período, activo) con NULLS NOT DISTINCT.
  // Dejar que la clave foránea las anule colapsaría dos asignaciones de activos distintos en
  // la misma clave y la transacción abortaría contra el índice. Se borran, y SOLO las que
  // estaban acotadas a un activo: las demás no tienen nada que ver con esta carga.
  it('las asignaciones por activo se borran, no se anulan, y sólo esas', async () => {
    const { tx, llamadas } = clienteFalso([]);
    await escribirPlan(tx, PLAN, DIMENSIONES, VALORES);

    const asignacion = llamadas.find((l) => l.tabla === 'asignacion');
    expect(asignacion?.metodo).toBe('deleteMany');
    expect(asignacion?.args).toEqual({ where: { activoId: { not: null } } });
  });

  // Los niveles NO están en la lista, y es a propósito: `Producto.nivelId` es NOT NULL,
  // `@unique` y con RESTRICT, así que un borrado rompería los productos.
  it('los niveles NO se borran', async () => {
    const { tx, llamadas } = clienteFalso([]);
    await escribirPlan(tx, PLAN, DIMENSIONES, VALORES);
    expect(llamadas.filter((l) => l.tabla === 'nivelActivo' && l.metodo === 'deleteMany')).toEqual([]);
  });
});

describe('§8.4 · reimportar no duplica los niveles', () => {
  it('en una base sin niveles, los crea', async () => {
    const { tx, llamadas } = clienteFalso([]);
    await escribirPlan(tx, PLAN, DIMENSIONES, VALORES);
    expect(llamadas.filter((l) => l.tabla === 'nivelActivo' && l.metodo === 'create')).toHaveLength(3);
  });

  // EL BUG QUE ESTA PRUEBA FIJA. La segunda carga del libro real dejó 170 nodos de grado 3
  // donde tenía que haber 85.
  it('un nivel que ya existe se REUTILIZA, no se crea de nuevo', async () => {
    const { tx, llamadas } = clienteFalso([
      { id: 4, grado: 1, nombre: 'CUANTICO', padreId: null },
      { id: 5, grado: 2, nombre: 'SIG', padreId: 4 },
      { id: 6, grado: 3, nombre: 'Documentación', padreId: 5 },
    ]);
    await escribirPlan(tx, PLAN, DIMENSIONES, VALORES);

    expect(llamadas.filter((l) => l.tabla === 'nivelActivo' && l.metodo === 'create')).toEqual([]);
    expect(llamadas.filter((l) => l.tabla === 'nivelActivo' && l.metodo === 'update')).toHaveLength(3);
  });

  // La identidad de un nivel incluye a su PADRE. «Documentación» cuelga de once ramas del
  // libro, y buscar sólo por nombre y grado reutilizaría la de otra rama: los activos de once
  // ramas terminarían colgando del mismo nodo.
  it('la búsqueda incluye el padre, no sólo el nombre y el grado', async () => {
    const { tx, llamadas } = clienteFalso([]);
    await escribirPlan(tx, PLAN, DIMENSIONES, VALORES);

    const busquedas = llamadas.filter((l) => l.tabla === 'nivelActivo' && l.metodo === 'findFirst');
    expect(busquedas).toHaveLength(3);
    for (const b of busquedas) {
      expect(b.args).toHaveProperty('where.grado');
      expect(b.args).toHaveProperty('where.nombre');
      expect(b.args).toHaveProperty('where.padreId');
    }
  });

  // Un grado 1 reutilizado tiene que quedar apuntando a nulo como padre, y un grado 2 al id
  // REAL del grado 1 que se reutilizó — no al que se hubiera creado.
  it('un hijo cuelga del id del padre reutilizado', async () => {
    const { tx, llamadas } = clienteFalso([{ id: 4, grado: 1, nombre: 'CUANTICO', padreId: null }]);
    await escribirPlan(tx, PLAN, DIMENSIONES, VALORES);

    const busquedaG2 = llamadas.find(
      (l) =>
        l.tabla === 'nivelActivo' &&
        l.metodo === 'findFirst' &&
        (l.args as { where: { grado: number } }).where.grado === 2,
    );
    expect((busquedaG2?.args as { where: { padreId: number | null } }).where.padreId).toBe(4);
  });
});
