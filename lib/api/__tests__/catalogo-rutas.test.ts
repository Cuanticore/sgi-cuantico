/**
 * @jest-environment node
 */

// lib/api/__tests__/catalogo-rutas.test.ts
//
// **Tarea 3.6 · documento OpenAPI servido por la propia aplicación, generado del código y no
// escrito aparte.**
//
// EL PROBLEMA QUE ESTO EVITA, Y QUE YA ESTÁ MEDIDO EN ESTE PROYECTO. La propuesta de la hoja
// de vida nació de un expediente trasladado a mano: 464 comentarios de celda, 214 casillas
// `[PENDIENTE]` y 156 valores que no calzaron en sus listas. Esa es la forma que toma un
// documento que se mantiene aparte de la cosa que describe. Un `openapi.yaml` escrito a mano
// es el mismo animal: nace exacto y se desincroniza al tercer cambio, y lo peor es que SIGUE
// PARECIENDO EXACTO — nadie puede ver desde afuera que ya miente.
//
// CÓMO SE EVITA ACÁ, Y POR QUÉ NO ALCANZA CON «generar el documento desde un objeto». Si el
// catálogo fuera sólo la fuente del documento, seguiría siendo un archivo aparte: alguien
// cambia el permiso de una ruta y el catálogo no se entera. Lo que lo sostiene es que **la
// ruta LEE del catálogo lo que necesita para funcionar**: el permiso que le pasa a `conToken`
// sale de acá. Un catálogo desactualizado no produce un documento equivocado — produce una
// ruta que no autoriza lo que debe, y eso sí se nota.
//
// La segunda mitad de la red vive en `app/api/v1/__tests__/toda-ruta-esta-en-el-catalogo.test.ts`,
// que recorre el árbol de archivos y falla si hay una ruta sin entrada.
//
// POR QUÉ NO SE AGREGA UNA LIBRERÍA. La tarea 4.5 deja anotado que hoy no hay ninguna
// librería de esquemas en el repo y que la decisión está abierta. Un generador de OpenAPI
// tira de esa misma cuerda; mientras la decisión no se tome, el catálogo se describe con
// tipos de TypeScript y el documento se arma con un objeto literal. Son treinta líneas y no
// comprometen la decisión.

import {
  OPERACIONES,
  documentoOpenApi,
  operacion,
  type OperacionApi,
} from '../catalogo-rutas';
import { CODIGOS_DE_PROBLEMA } from '../problema';
import { TODOS_LOS_PERMISOS } from '@/lib/sgsi/permisos';

describe('el catálogo de operaciones', () => {
  it('no está vacío', () => {
    expect(OPERACIONES.length).toBeGreaterThan(0);
  });

  it('cada operación tiene un identificador único', () => {
    const ids = OPERACIONES.map((o) => o.id);
    // El `operationId` es lo que usan los generadores de cliente para nombrar la función.
    // Dos iguales producen un cliente donde una de las dos rutas simplemente no existe.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada método y ruta aparecen una sola vez', () => {
    const claves = OPERACIONES.map((o) => `${o.metodo} ${o.ruta}`);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it.each(OPERACIONES.map((o) => [o.id, o] as const))(
    '«%s» exige un permiso del vocabulario existente',
    (_id, op: OperacionApi) => {
      // El spec lo pide con todas las letras: el alcance de un token se expresa con los
      // valores de `Permiso`, y no se introduce un segundo vocabulario de autorización.
      expect(TODOS_LOS_PERMISOS).toContain(op.permiso);
    },
  );

  it.each(OPERACIONES.map((o) => [o.id, o] as const))(
    '«%s» declara un parámetro por cada marcador de su ruta',
    (_id, op: OperacionApi) => {
      const marcadores = [...op.ruta.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const enRuta = op.parametros.filter((p) => p.en === 'path').map((p) => p.nombre);

      expect(enRuta.sort()).toEqual(marcadores.sort());
      // Un parámetro de ruta opcional no existe: sin él la URL no se forma.
      for (const p of op.parametros.filter((x) => x.en === 'path')) {
        expect(p.obligatorio).toBe(true);
      }
    },
  );

  it.each(OPERACIONES.map((o) => [o.id, o] as const))(
    '«%s» declara problemas que existen en el vocabulario',
    (_id, op: OperacionApi) => {
      for (const p of op.problemas) {
        expect(Object.keys(CODIGOS_DE_PROBLEMA)).toContain(p);
      }
    },
  );

  it('`operacion` falla nombrando el identificador que no existe', () => {
    // Una ruta que pida una entrada inexistente tiene que reventar al cargar el módulo, no
    // responder 500 en la primera petición de un cliente.
    expect(() => operacion('no-existe')).toThrow(/no-existe/);
  });
});

describe('el documento OpenAPI', () => {
  const doc = documentoOpenApi() as Record<string, never>;

  it('declara la versión de la especificación', () => {
    expect(String(doc.openapi)).toMatch(/^3\.1/);
  });

  it('declara el esquema de seguridad que la API usa de verdad', () => {
    // `Authorization: Bearer <secreto>` es lo que `conToken` lee. Un documento que declarara
    // otra cosa —una clave por cabecera propia, por ejemplo— produciría clientes que fallan
    // con 401 sin que nadie entienda por qué.
    const esquemas = (doc.components as Record<string, Record<string, Record<string, string>>>)
      .securitySchemes;
    const unico = Object.values(esquemas)[0];

    expect(unico.type).toBe('http');
    expect(unico.scheme).toBe('bearer');
  });

  it('toda operación exige seguridad: no hay rutas públicas en /api/v1', () => {
    const seguridad = doc.security as unknown[];
    expect(seguridad.length).toBeGreaterThan(0);
  });

  it('publica todas las operaciones del catálogo y ninguna de más', () => {
    const paths = doc.paths as Record<string, Record<string, unknown>>;
    const publicadas = Object.entries(paths).flatMap(([ruta, metodos]) =>
      Object.keys(metodos).map((m) => `${m} ${ruta}`),
    );
    const esperadas = OPERACIONES.map((o) => `${o.metodo} ${o.ruta}`);

    expect(publicadas.sort()).toEqual(esperadas.sort());
  });

  it('cada operación documenta el 401 y el 403, que `conToken` puede devolver siempre', () => {
    const paths = doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>;

    for (const metodos of Object.values(paths)) {
      for (const op of Object.values(metodos)) {
        // No se declaran operación por operación: los pone el generador, porque TODA ruta de
        // `/api/v1` pasa por la envoltura. Declararlos a mano en cada entrada sería la misma
        // repetición que termina en que una se olvida.
        expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['401', '403']));
      }
    }
  });

  it('los errores se documentan como problem+json, que es lo que la API emite', () => {
    const paths = doc.paths as Record<
      string,
      Record<string, { responses: Record<string, { content?: Record<string, unknown> }> }>
    >;
    const primera = Object.values(Object.values(paths)[0])[0];

    expect(Object.keys(primera.responses['401'].content ?? {})).toContain(
      'application/problem+json',
    );
  });
});
