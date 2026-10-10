/**
 * @jest-environment node
 */

// lib/api/__tests__/problema.test.ts
//
// **Tarea 3.5 · errores uniformes en `problem+json`, con códigos estables y sin filtrar
// detalles internos.**
//
// POR QUÉ UN MÓDULO Y NO UN `Response.json` EN CADA RUTA. Un cliente máquina no lee prosa:
// decide con el código. Si cada ruta arma su propio cuerpo, el que consume la API termina
// con un `if` por ruta, y el día que una cambie la forma del error, el agente falla en
// silencio — con un 404 que no sabe distinguir de un 403.
//
// LO QUE SE PRUEBA, Y POR QUÉ CADA COSA:
//
//   1. el `type` es un código ESTABLE, no el título. El título se puede traducir o corregir;
//      el código es contrato y no se toca;
//   2. el estado del cuerpo y el de la respuesta son el mismo número. Dos fuentes de verdad
//      para lo mismo es una invitación a que se separen;
//   3. el tipo de medio es `application/problem+json`. Hoy `con-token.ts` DOCUMENTA que
//      responde eso y emite `application/json`, porque `Response.json()` no se lo pregunta a
//      nadie. Un cliente que ramifique por el tipo de medio no lo ve;
//   4. **el error interno nunca repite lo que le pasaron.** Es la única garantía de este
//      archivo que protege algo más que la ergonomía: un `detail` armado con el mensaje de
//      una excepción de Prisma publica nombres de tabla, de columna y fragmentos de SQL a
//      quien provocó el fallo;
//   5. ninguna respuesta de error se cachea. Un 403 guardado en un intermediario le niega la
//      ruta a quien sí tiene permiso.

import {
  problema,
  CODIGOS_DE_PROBLEMA,
  type CodigoProblema,
} from '../problema';

/// El cuerpo ya leído, con los campos de RFC 7807 que este repo usa.
async function cuerpoDe(r: Response): Promise<Record<string, unknown>> {
  return (await r.json()) as Record<string, unknown>;
}

describe('cada código de problema', () => {
  const codigos = Object.keys(CODIGOS_DE_PROBLEMA) as CodigoProblema[];

  it('el vocabulario no está vacío', () => {
    expect(codigos.length).toBeGreaterThan(0);
  });

  it.each(codigos)('«%s» responde con su estado y lo repite en el cuerpo', async (codigo) => {
    const r = problema(codigo, 'un detalle cualquiera');
    const cuerpo = await cuerpoDe(r);

    expect(r.status).toBe(CODIGOS_DE_PROBLEMA[codigo].estado);
    // Dos fuentes de verdad para el mismo número se separan tarde o temprano, y el cliente
    // que lea la equivocada decide mal.
    expect(cuerpo.status).toBe(r.status);
  });

  it.each(codigos)('«%s» lleva el código estable en `type`, no el título', async (codigo) => {
    const cuerpo = await cuerpoDe(problema(codigo, 'x'));

    expect(cuerpo.type).toBe(codigo);
    expect(cuerpo.title).toBe(CODIGOS_DE_PROBLEMA[codigo].titulo);
  });

  it.each(codigos)('«%s» se anuncia como problem+json', (codigo) => {
    // `Response.json()` pone `application/json` y no pregunta. Un cliente que ramifique por
    // el tipo de medio —lo que RFC 7807 espera que haga— no distinguiría un error de un
    // cuerpo normal.
    expect(problema(codigo, 'x').headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it.each(codigos)('«%s» no se cachea', (codigo) => {
    // Un 403 guardado por un intermediario le niega la ruta a quien sí tiene permiso, y un
    // 404 cacheado sobrevive a la creación del recurso que faltaba.
    expect(problema(codigo, 'x').headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('el error interno no filtra lo que pasó por dentro', () => {
  const FUGA =
    'Invalid `prisma.sistema.findUnique()` invocation: column "token_hash" does not exist';

  it('descarta el detalle recibido y responde siempre lo mismo', async () => {
    const cuerpo = await cuerpoDe(problema('error-interno', FUGA));

    // ESTA es la aserción que justifica el archivo. Publicar el mensaje de una excepción le
    // entrega al que provocó el fallo los nombres de tabla y columna, y a veces el SQL.
    expect(JSON.stringify(cuerpo)).not.toContain('token_hash');
    expect(JSON.stringify(cuerpo)).not.toContain('prisma');
  });

  it('dos fallos internos distintos son indistinguibles desde afuera', async () => {
    const uno = await cuerpoDe(problema('error-interno', 'se cayó la base'));
    const otro = await cuerpoDe(problema('error-interno', FUGA));

    expect(uno).toEqual(otro);
  });
});

describe('los demás problemas sí dicen lo que pasó', () => {
  it('un 404 nombra lo que no encontró: es información que el cliente ya tenía', () => {
    // No es una excepción a la regla de arriba: el código del sistema lo escribió quien
    // pregunta. Devolvérselo no le revela nada que no supiera, y sin eso no puede corregir.
    return expect(
      cuerpoDe(problema('no-encontrado', 'No existe el sistema «SIS-999».')),
    ).resolves.toMatchObject({ detail: 'No existe el sistema «SIS-999».' });
  });

  it('una petición inválida explica qué parámetro está mal', () => {
    return expect(
      cuerpoDe(problema('peticion-invalida', 'El parámetro «limite» admite entre 1 y 100.')),
    ).resolves.toMatchObject({ detail: 'El parámetro «limite» admite entre 1 y 100.' });
  });
});
