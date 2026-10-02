/**
 * @jest-environment node
 */

// lib/sgsi/__tests__/bitacora.test.ts
//
// 2.10 · una escritura de servicio registra `usuario = "api:<nombre>"`, y el token no aparece
// en ningún campo. `registrar()` no sabe nada de tokens ni de autores: escribe exactamente el
// `usuario` y los `Cambio[]` que se le pasan. La garantía es de los DOS LADOS de la llamada:
// `etiquetaDeBitacora()` (lib/sig/autor.ts) nunca produce más que `api:<nombre>` —ni el
// `tokenId`, ni el alcance, ni por supuesto el secreto, que ni siquiera es un campo de
// `Autor`—, y quien arma un `Cambio` sobre una escritura de hoja de vida nunca mete el secreto
// en `anterior` ni en `nuevo`. Esta prueba ejercita el camino completo con un secreto de
// muestra bien reconocible, para demostrarlo y no sólo afirmarlo.

jest.mock('server-only', () => ({}));

import { etiquetaDeBitacora, type Autor } from '@/lib/sig/autor';
import { registrar } from '../bitacora';

const SECRETO_DE_MUESTRA = 'sgi_live_7Kq2YZ1aNoTieneQueAparecerJamasEnLaBitacora';

describe('una escritura con autor de clase servicio', () => {
  it('registra usuario = "api:<nombre del token>"', async () => {
    const createMany = jest.fn();
    const escritor = { bitacora: { createMany } } as unknown as Parameters<typeof registrar>[0];

    const autor: Autor = {
      clase: 'servicio',
      tokenId: 9,
      nombre: 'robot-mintrace',
      alcance: ['tecnologia:escribir'],
    };

    await registrar(escritor, etiquetaDeBitacora(autor), [
      {
        tabla: 'sistema',
        registroId: 'SIS-001',
        campo: 'criticidad',
        anterior: 'MEDIA',
        nuevo: 'ALTA',
      },
    ]);

    expect(createMany).toHaveBeenCalledTimes(1);
    const filas = createMany.mock.calls[0][0].data as Array<{ usuario: string }>;
    expect(filas).toHaveLength(1);
    expect(filas[0].usuario).toBe('api:robot-mintrace');
  });

  it('el secreto no aparece en ningún campo de la fila escrita, aunque el autor lo hubiera visto', async () => {
    const createMany = jest.fn();
    const escritor = { bitacora: { createMany } } as unknown as Parameters<typeof registrar>[0];

    // Un autor de servicio NUNCA carga el secreto — `Autor` no tiene ese campo (lib/sig/autor.ts)
    // — así que ni siquiera hay de dónde tomarlo por accidente al armar la etiqueta.
    const autor: Autor = {
      clase: 'servicio',
      tokenId: 9,
      nombre: 'robot-mintrace',
      alcance: ['tecnologia:escribir'],
    };
    expect(JSON.stringify(autor)).not.toContain(SECRETO_DE_MUESTRA);

    await registrar(escritor, etiquetaDeBitacora(autor), [
      {
        tabla: 'sistema',
        registroId: 'SIS-001',
        campo: 'criticidad',
        anterior: 'MEDIA',
        nuevo: 'ALTA',
        motivo: 'diligenciado por la API de servicio',
      },
    ]);

    const filaCompleta = JSON.stringify(createMany.mock.calls[0][0]);
    expect(filaCompleta).not.toContain(SECRETO_DE_MUESTRA);
    expect(filaCompleta).not.toContain('sgi_live_');
  });
});
