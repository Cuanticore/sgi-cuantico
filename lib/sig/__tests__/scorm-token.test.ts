// lib/sig/__tests__/scorm-token.test.ts
//
// P4 · cada ejecución lleva un token firmado. Sin esto, cambiar un número en la URL
// alcanzaría para escribir en el intento de otra persona.

import { firmarIntento, motivoDe, verificarIntento } from '../scorm-token';

const SECRETO = 'secreto-de-prueba';

describe('token de intento', () => {
  it('ida y vuelta devuelve el intento', () => {
    const token = firmarIntento(42, SECRETO, 900);
    expect(verificarIntento(token, SECRETO)).toEqual(expect.objectContaining({ intentoId: 42 }));
  });

  it('un token manipulado no vale', () => {
    const token = firmarIntento(42, SECRETO, 900);
    const otro = token.slice(0, -3) + 'aaa';
    expect(verificarIntento(otro, SECRETO)).toBeNull();
  });

  it('un token firmado con otro secreto no vale', () => {
    expect(verificarIntento(firmarIntento(42, 'otro', 900), SECRETO)).toBeNull();
  });

  it('un token vencido no vale', () => {
    expect(verificarIntento(firmarIntento(42, SECRETO, -1), SECRETO)).toBeNull();
  });

  it('basura no revienta', () => {
    expect(verificarIntento('', SECRETO)).toBeNull();
    expect(verificarIntento('a.b.c', SECRETO)).toBeNull();
  });
});

// EL DEFECTO QUE ESTO CIERRA.
//
// El token se emitia UNA vez, con 900 s, y no se renovaba en ninguna parte. A partir del
// minuto 15 de un curso todo guardado se rechazaba: el autoguardado de cada 60 s, y tambien
// el commit final de `Terminate`. Una induccion de 40 minutos terminaba con la persona
// habiendo hecho el curso entero y la asignacion SIN CERRAR.
//
// Y el aviso que veia decia «este intento ya se cerro», que ademas era falso: el intento
// seguia abierto, lo que habia vencido era el token. Por eso `motivoDe` distingue las dos
// cosas — un mensaje que manda a buscar el problema donde no esta cuesta mas que no darlo.
describe('motivoDe · por que no vale un token', () => {
  it('vencido se distingue de invalido', () => {
    expect(motivoDe(firmarIntento(42, SECRETO, -1), SECRETO)).toBe('vencido');
  });

  it('manipulado es invalido, no vencido', () => {
    const token = firmarIntento(42, SECRETO, 900);
    expect(motivoDe(token.slice(0, -3) + 'aaa', SECRETO)).toBe('invalido');
  });

  it('firmado con otro secreto es invalido', () => {
    expect(motivoDe(firmarIntento(42, 'otro', 900), SECRETO)).toBe('invalido');
  });

  it('basura es invalida', () => {
    expect(motivoDe('', SECRETO)).toBe('invalido');
    expect(motivoDe('a.b.c', SECRETO)).toBe('invalido');
  });

  it('uno bueno no tiene motivo', () => {
    expect(motivoDe(firmarIntento(42, SECRETO, 900), SECRETO)).toBeNull();
  });

  // Un token vencido se distingue de uno falso SIN aceptarlo: la firma se comprueba igual,
  // y sólo después se mira la fecha. Si no, decir «vencido» sobre una firma inválida le
  // contaría a un atacante que acertó el secreto.
  it('un vencido con firma rota es invalido, no vencido', () => {
    const vencido = firmarIntento(42, SECRETO, -1);
    expect(motivoDe(vencido.slice(0, -3) + 'aaa', SECRETO)).toBe('invalido');
  });
});

// La vigencia por defecto tiene que alcanzar para un curso real. 900 s no alcanzaba para
// una induccion, y el numero no estaba escrito en ningun lado que se pudiera revisar.
describe('vigencia por defecto', () => {
  it('dura una hora', () => {
    const antes = Math.floor(Date.now() / 1000);
    const r = verificarIntento(firmarIntento(42, SECRETO), SECRETO);
    expect(r).not.toBeNull();
    expect(r!.exp - antes).toBeGreaterThanOrEqual(3600);
    expect(r!.exp - antes).toBeLessThanOrEqual(3601);
  });
});
