/**
 * @jest-environment node
 */

// lib/sig/__tests__/autor.test.ts
//
// D2 · el autor se pasa; no se adivina. Este módulo es el tipo que hace posible que la Server
// Action y la ruta de API llamen a la MISMA función de dominio sin que ninguna de las dos
// vuelva a resolver identidad por su cuenta.
//
// D10 · un agente diligencia; una persona cierra. La separación no vive en el alcance del
// token —el vocabulario de permisos no distingue «cerrar una puerta» de «escribir en ella»—,
// vive en la CLASE del autor. `exigirAutorPersona` es el mecanismo que una acción de cierre
// usará en la Fase 4; acá se prueba que la clase es la barrera, sin importar cuánto alcance
// tenga el token.

import { puede, rolDesdeGrupos, type Rol } from '@/lib/sgsi/permisos';
import { autorizado, etiquetaDeBitacora, exigirAutorPersona, SoloPersonaError } from '../autor';

const ROL_LIDER: Rol = rolDesdeGrupos(['Líderes SIG']);
const ROL_COLABORADOR: Rol = rolDesdeGrupos([]);

describe('autorizado', () => {
  it('para una persona, delega en puede(rol, permiso)', () => {
    expect(autorizado({ clase: 'persona', personaId: 1, correo: 'ana@cuantico.com', rol: ROL_LIDER }, 'tecnologia:escribir')).toBe(
      puede(ROL_LIDER, 'tecnologia:escribir'),
    );
    expect(
      autorizado(
        { clase: 'persona', personaId: 2, correo: 'bob@cuantico.com', rol: ROL_COLABORADOR },
        'tecnologia:escribir',
      ),
    ).toBe(false);
  });

  it('para un servicio, consulta el alcance del token y no un rol', () => {
    const servicio = { clase: 'servicio' as const, tokenId: 1, nombre: 'robot-mintrace', alcance: ['tecnologia:escribir'] as const };
    expect(autorizado(servicio, 'tecnologia:escribir')).toBe(true);
    expect(autorizado(servicio, 'personas:administrar')).toBe(false);
  });

  it('un alcance vacío no autoriza nada', () => {
    const servicio = { clase: 'servicio' as const, tokenId: 1, nombre: 'vacio', alcance: [] as const };
    expect(autorizado(servicio, 'misig:ver')).toBe(false);
    expect(autorizado(servicio, 'tecnologia:ver')).toBe(false);
  });
});

describe('etiquetaDeBitacora', () => {
  it('una persona se identifica por su correo', () => {
    expect(
      etiquetaDeBitacora({ clase: 'persona', personaId: 1, correo: 'ana@cuantico.com', rol: ROL_LIDER }),
    ).toBe('ana@cuantico.com');
  });

  it('un servicio se identifica como api:<nombre>, y el token no aparece', () => {
    expect(
      etiquetaDeBitacora({ clase: 'servicio', tokenId: 7, nombre: 'robot-mintrace', alcance: ['tecnologia:escribir'] }),
    ).toBe('api:robot-mintrace');
  });
});

describe('exigirAutorPersona — D10, un agente diligencia; una persona cierra', () => {
  it('una persona pasa', () => {
    expect(() =>
      exigirAutorPersona({ clase: 'persona', personaId: 1, correo: 'ana@cuantico.com', rol: ROL_LIDER }, 'cerrar la puerta P3'),
    ).not.toThrow();
  });

  it('un token de servicio NO pasa, aunque su alcance tenga todos los permisos', () => {
    const servicioConTodo = {
      clase: 'servicio' as const,
      tokenId: 1,
      nombre: 'robot-con-todo',
      alcance: ['tecnologia:ver', 'tecnologia:escribir', 'tecnologia:administrar', 'personas:bloquear'] as const,
    };
    expect(() => exigirAutorPersona(servicioConTodo, 'cerrar la puerta P3')).toThrow(SoloPersonaError);
    expect(() => exigirAutorPersona(servicioConTodo, 'cerrar la puerta P3')).toThrow(/cerrar la puerta P3/);
  });
});
