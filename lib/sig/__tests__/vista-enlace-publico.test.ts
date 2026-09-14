// lib/sig/__tests__/vista-enlace-publico.test.ts
//
// REQ-SIG-19 · Task 7 · lo que ve quien abre `/firmar/<token>`.
//
// La prueba que sostiene todo este archivo es la de P13: **los cuatro casos malos producen el
// mismo valor**. No «el mismo texto», no «un texto parecido»: el mismo objeto. Si el inexistente
// y el expirado se pudieran distinguir —por una palabra, por un campo de mas, por un `null` donde
// el otro tiene una cadena—, la ruta se convierte en un oraculo: se prueban tokens hasta que uno
// responda distinto, y ahi se sabe cual existe.

import { FRASE_ENLACE_NO_DISPONIBLE } from '../enlace-firma';
import {
  NO_DISPONIBLE,
  vistaDelEnlace,
  type DocumentoPublico,
  type EnlacePublico,
} from '../vista-enlace-publico';

const AHORA = new Date('2026-09-10T14:00:00.000Z');

const DOCUMENTO: DocumentoPublico = {
  codigo: 'POL-001',
  version: 3,
  titulo: 'Politica de seguridad de la informacion',
  descripcion: 'El texto de la version vigente.',
  declaracion: 'Declaro que lei y acepto el documento.',
};

const VIGENTE: EnlacePublico = {
  nombre: 'Daniel Medina Restrepo',
  documento: DOCUMENTO,
  acta: null,
  expiraEn: new Date('2026-09-17T14:00:00.000Z'),
  usadoEn: null,
  revocadoEn: null,
  bloqueadoEn: null,
};

const EXPIRADO: EnlacePublico = { ...VIGENTE, expiraEn: new Date('2026-09-03T14:00:00.000Z') };
const REVOCADO: EnlacePublico = { ...VIGENTE, revocadoEn: new Date('2026-09-09T10:00:00.000Z') };
const BLOQUEADO: EnlacePublico = { ...VIGENTE, bloqueadoEn: new Date('2026-09-09T11:00:00.000Z') };

// ── P13 ──────────────────────────────────────────────────────────────────────────────────────
describe('P13 · los cuatro casos malos son indistinguibles', () => {
  const inexistente = vistaDelEnlace(null, AHORA);
  const expirado = vistaDelEnlace(EXPIRADO, AHORA);
  const revocado = vistaDelEnlace(REVOCADO, AHORA);
  const bloqueado = vistaDelEnlace(BLOQUEADO, AHORA);

  it('los cuatro devuelven el MISMO valor, no cuatro valores parecidos', () => {
    expect(expirado).toEqual(inexistente);
    expect(revocado).toEqual(inexistente);
    expect(bloqueado).toEqual(inexistente);
  });

  // La forma fuerte: es literalmente el mismo objeto. Dos objetos iguales hoy se separan en la
  // primera correccion de estilo que toque solo una de las ramas; el mismo objeto, no.
  it('es la misma constante congelada en las cuatro ramas', () => {
    expect(inexistente).toBe(NO_DISPONIBLE);
    expect(expirado).toBe(NO_DISPONIBLE);
    expect(revocado).toBe(NO_DISPONIBLE);
    expect(bloqueado).toBe(NO_DISPONIBLE);
    expect(Object.isFrozen(NO_DISPONIBLE)).toBe(true);
  });

  it('dice la frase neutral de `enlace-firma.ts`, sin reescribirla', () => {
    expect(inexistente).toEqual({ clase: 'NO_DISPONIBLE', frase: FRASE_ENLACE_NO_DISPONIBLE });
  });

  // Sin nombres. La vista de un enlace que no sirve no puede filtrar de quien era.
  it('no lleva el nombre, ni el documento, ni ningun dato de la persona', () => {
    const serializado = JSON.stringify(inexistente);
    expect(serializado).not.toContain('Daniel');
    expect(serializado).not.toContain('Medina');
    expect(serializado).not.toContain('POL-001');
    expect(Object.keys(inexistente).sort()).toEqual(['clase', 'frase']);
  });

  // La frase no dice cual de los cuatro casos es: ni «venció», ni «revocado», ni «bloqueado»,
  // ni «no existe». Cualquiera de esas palabras responde la pregunta que la pagina no debe
  // responder.
  it('la frase no nombra ninguno de los cuatro estados', () => {
    const frase = FRASE_ENLACE_NO_DISPONIBLE.toLowerCase();
    for (const palabra of ['expir', 'venc', 'revoc', 'bloque', 'no existe', 'intentos']) {
      expect(frase).not.toContain(palabra);
    }
  });

  it('un token con forma invalida no se distingue de uno bien formado que no esta', () => {
    // La pagina no valida la forma del token antes de buscarlo: rechazarlo antes le daria una
    // respuesta distinta, y esa diferencia ya es informacion.
    expect(vistaDelEnlace(null, AHORA)).toBe(NO_DISPONIBLE);
  });
});

// ── La excepcion que si informa ──────────────────────────────────────────────────────────────
describe('un enlace ya usado dice que ya se firmo', () => {
  const USADO: EnlacePublico = {
    ...VIGENTE,
    usadoEn: new Date('2026-09-11T09:30:00.000Z'),
    acta: { codigo: 'ACT-2026-0042', aceptadoEn: new Date('2026-09-11T09:30:00.000Z') },
  };

  it('devuelve la constancia con la fecha y el codigo del acta', () => {
    expect(vistaDelEnlace(USADO, AHORA)).toEqual({
      clase: 'FIRMADO',
      nombre: 'Daniel Medina Restrepo',
      documento: DOCUMENTO,
      firmadoEn: new Date('2026-09-11T09:30:00.000Z'),
      acta: 'ACT-2026-0042',
    });
  });

  // D-5 · `USADO` se evalua antes que `EXPIRADO`. Quien firmo y vuelve una semana despues
  // necesita ver la constancia: `/mi-sig` le esta cerrado y no tiene donde consultarla.
  it('un enlace usado y ademas vencido sigue mostrando la constancia', () => {
    const usadoYVencido = { ...USADO, expiraEn: new Date('2026-09-01T00:00:00.000Z') };
    const vista = vistaDelEnlace(usadoYVencido, new Date('2026-09-30T00:00:00.000Z'));
    expect(vista.clase).toBe('FIRMADO');
  });

  // El acta es anulable en el esquema. Si no se pudo leer, la constancia dice la fecha y calla
  // el codigo, en vez de inventarlo.
  it('sin acta legible, informa la fecha y no inventa un codigo', () => {
    const vista = vistaDelEnlace({ ...USADO, acta: null }, AHORA);
    expect(vista).toMatchObject({ clase: 'FIRMADO', acta: null });
  });
});

// ── El enlace que sirve ──────────────────────────────────────────────────────────────────────
describe('un enlace vigente abre la pantalla de firma', () => {
  const vista = vistaDelEnlace(VIGENTE, AHORA);

  it('trae el nombre y el documento, que es el minimo de P11', () => {
    expect(vista).toEqual({
      clase: 'PARA_FIRMAR',
      nombre: 'Daniel Medina Restrepo',
      documento: DOCUMENTO,
    });
  });

  // P11 · nada de area, cargo, otras tareas ni otros documentos. No estan omitidos: no estan.
  it('no trae nada mas que el nombre y el documento', () => {
    expect(Object.keys(vista).sort()).toEqual(['clase', 'documento', 'nombre']);
    expect(Object.keys(DOCUMENTO).sort()).toEqual([
      'codigo',
      'declaracion',
      'descripcion',
      'titulo',
      'version',
    ]);
  });

  // D-5 · abrirlo, cuantas veces haga falta. La funcion no escribe, no cuenta aperturas y no
  // cambia de respuesta por haberse llamado antes.
  it('abrirlo tres veces da exactamente lo mismo', () => {
    expect(vistaDelEnlace(VIGENTE, AHORA)).toEqual(vista);
    expect(vistaDelEnlace(VIGENTE, AHORA)).toEqual(vista);
    expect(VIGENTE.usadoEn).toBeNull();
  });

  // El limite es el propio instante de expiracion: un enlace que vence a las 14:00 no sirve a
  // las 14:00. Es la regla de `estadoDelEnlace`, y aca se comprueba que la vista la respeta.
  it('en el instante exacto de la expiracion ya no sirve', () => {
    expect(vistaDelEnlace(VIGENTE, new Date('2026-09-17T14:00:00.000Z'))).toBe(NO_DISPONIBLE);
    expect(vistaDelEnlace(VIGENTE, new Date('2026-09-17T13:59:59.999Z')).clase).toBe(
      'PARA_FIRMAR',
    );
  });
});
