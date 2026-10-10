/**
 * @jest-environment node
 */

// lib/sig/__tests__/hoja-de-vida-json.test.ts
//
// **Tareas 3.1 y 3.2 · la hoja de vida en JSON, con sus siete colecciones hijas.**
//
// Se prueba la forma, no la consulta: este módulo es un constructor puro, sin Prisma y sin
// sesión, al estilo de `lib/sgsi/inventario-libro.ts`. Eso es lo que permite probar las
// invariantes que de verdad importan sin levantar una base.
//
// LAS CUATRO INVARIANTES, Y POR QUÉ CADA UNA:
//
//   1. **No sale ningún `id` interno.** Es la que más cuesta sostener y la que más paga. `id`
//      es un autoincremental de Postgres: no significa nada afuera, cambia si la tabla se
//      repuebla, y un cliente que lo guarde queda atado a un detalle de la base. Peor: la
//      Fase 4 define las escrituras como `PUT` idempotentes **por clave natural** (D6). Si la
//      lectura entregara `id`, el primer agente que lo use para escribir tendría dos
//      identidades para la misma fila, y la idempotencia dejaría de significar algo.
//
//   2. **Las siete colecciones aparecen siempre, aunque vacías.** Un campo ausente obliga a
//      todo cliente a distinguir «no hay» de «no vino», y esa distinción se resuelve mal en
//      algún lado. Un arreglo vacío no se puede malinterpretar.
//
//   3. **De una persona sale el nombre y nada más.** El expediente nombra personas porque el
//      FOR-TEC-04 lo exige —quién verifica, quién autoriza—, pero un token de servicio no
//      tiene por qué recibir correos ni documentos. Es el mismo criterio de minimización que
//      el SGSI le aplica a cualquier otro tratamiento.
//
//   4. **Las fechas salen en ISO 8601, en UTC.** `JSON.stringify` ya lo haría con un `Date`,
//      pero dejarlo implícito significa que el día que un campo llegue como cadena desde otra
//      capa, la forma cambia sin que nadie lo note.

import { fichaDeSistema, hojaDeVidaCompleta } from '../hoja-de-vida-json';

const PERSONA = { id: 7, nombre: 'Ana Pérez', correo: 'ana.perez@cuantico.com' };

const SISTEMA = {
  id: 42,
  codigo: 'SIS-001',
  nombre: 'MinTrace Trazabilidad',
  descripcion: 'Trazabilidad de lotes',
  tipo: 'APLICACION',
  criticidad: 4,
  clasificacionId: 3,
  trataDatosPersonales: true,
  rolTratamiento: 'RESPONSABLE' as const,
  rtoObjetivo: 240,
  rpoObjetivo: 60,
  contratado: false,
  faseActual: 'F4' as const,
  abiertaEn: new Date('2026-01-15T10:00:00.000Z'),
  cerradaEn: null,
  activo: true,
  producto: { id: 3, nombre: 'MinTrace' },
  propietario: PERSONA,
  responsableTecnico: null,
};

const COMPLETO = {
  ...SISTEMA,
  puertas: [
    {
      id: 11,
      puerta: 'P1' as const,
      resultado: 'SUPERADA' as const,
      fecha: new Date('2026-02-01T00:00:00.000Z'),
      observacion: 'Clasificación firmada',
      verificadoPor: PERSONA,
      autoriza: null,
      evidenciaId: 99,
      excepcion: null,
    },
  ],
  excepciones: [],
  requisitos: [
    {
      id: 21,
      codigo: 'REQ-01',
      categoria: 'AUTENTICACION',
      texto: 'Doble factor para administradores',
      origen: 'ISO 27001 A.8.5',
      prioridad: 'ALTA',
      estado: 'VERIFICADO',
      observacion: null,
    },
  ],
  pruebas: [],
  tratamientos: [],
  liberaciones: [],
  componentes: [],
};

describe('la ficha breve de un sistema', () => {
  const ficha = fichaDeSistema(SISTEMA) as Record<string, unknown>;

  it('lleva el código, que es la clave natural', () => {
    expect(ficha.codigo).toBe('SIS-001');
  });

  it('no expone ningún identificador interno', () => {
    expect(ficha).not.toHaveProperty('id');
    expect(ficha).not.toHaveProperty('productoId');
    expect(ficha).not.toHaveProperty('propietarioId');
  });

  it('del producto sale el nombre, no su fila', () => {
    expect(ficha.producto).toBe('MinTrace');
  });

  it('de una persona sale el nombre y nada más', () => {
    // Un token de servicio no necesita el correo de nadie para generar el FOR-TEC-04.
    expect(ficha.propietario).toBe('Ana Pérez');
    expect(JSON.stringify(ficha)).not.toContain('@cuantico.com');
  });

  it('una persona ausente sale como null, no se omite el campo', () => {
    expect(ficha.responsableTecnico).toBeNull();
    expect(Object.keys(ficha)).toContain('responsableTecnico');
  });

  it('las fechas salen en ISO 8601', () => {
    expect(ficha.abiertaEn).toBe('2026-01-15T10:00:00.000Z');
    expect(ficha.cerradaEn).toBeNull();
  });
});

describe('la hoja de vida completa', () => {
  const hoja = hojaDeVidaCompleta(COMPLETO) as Record<string, unknown>;

  it.each([
    'puertas',
    'excepciones',
    'requisitos',
    'pruebas',
    'tratamientos',
    'liberaciones',
    'componentes',
  ])('trae la colección «%s» aunque esté vacía', (nombre) => {
    // Un campo ausente obliga a cada cliente a distinguir «no hay» de «no vino», y esa
    // distinción se resuelve mal en algún lado. Un arreglo vacío no se puede malinterpretar.
    expect(Array.isArray(hoja[nombre])).toBe(true);
  });

  it('cada puerta se identifica por su letra, que es su clave natural', () => {
    const puertas = hoja.puertas as Record<string, unknown>[];
    expect(puertas[0].puerta).toBe('P1');
    expect(puertas[0]).not.toHaveProperty('id');
  });

  it('cada requisito se identifica por su código', () => {
    const requisitos = hoja.requisitos as Record<string, unknown>[];
    expect(requisitos[0].codigo).toBe('REQ-01');
    expect(requisitos[0]).not.toHaveProperty('id');
    expect(requisitos[0]).not.toHaveProperty('sistemaId');
  });

  it('NINGÚN identificador interno sobrevive en todo el documento', () => {
    // La aserción que sostiene la invariante 1 de punta a punta, y no colección por
    // colección: una hija nueva que se agregue mal cae acá aunque nadie le escriba su prueba.
    const plano = JSON.stringify(hoja);

    expect(plano).not.toMatch(/"id":/);
    expect(plano).not.toMatch(/"sistemaId":/);
    expect(plano).not.toMatch(/"evidenciaId":/);
    expect(plano).not.toMatch(/"propietarioId":/);
    expect(plano).not.toMatch(/"productoId":/);
  });

  it('`clasificacionId` es la única clave cruda que sale, y sale porque falta su catálogo', () => {
    // **No es una excepción de diseño: es un hueco heredado, y esta prueba es su recordatorio.**
    // No hay `model Clasificacion` en el schema; la columna es un `Int?` sin llave foránea, y
    // `validarActualizacionSistema` ya documenta que no la valida porque inventar la lista de
    // valores sería inventar un catálogo que nadie decidió. La pantalla, mientras tanto, le
    // pide a una persona que teclee «id de la clasificación».
    //
    // El día que la tabla exista, acá debe salir el NOMBRE —como ya sale el del producto— y
    // esta prueba tiene que ponerse roja para que alguien venga a borrarla.
    const claves = Object.keys(hoja).filter((k) => /Id$/.test(k));

    expect(claves).toEqual(['clasificacionId']);
  });

  it('incluye la ficha del sistema, sin repetirla aparte', () => {
    expect(hoja.codigo).toBe('SIS-001');
    expect(hoja.faseActual).toBe('F4');
  });
});
