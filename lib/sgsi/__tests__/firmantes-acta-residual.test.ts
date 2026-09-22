// lib/sgsi/__tests__/firmantes-acta-residual.test.ts
//
// EL CASO QUE NADIE CUBRIÓ: que NINGÚN proceso tenga firmante.
//
// `PantallaRiesgoResidual.tsx` documenta en su cabecera que «sin firmante resoluble» y
// «pendiente de firma» son cosas distintas, y las trata distinto — previó ALGUNOS procesos
// irresolubles. No previó TODOS, y es el estado real hoy: medido contra la base el
// 2026-09-22, **las 10 áreas activas están sin cargo líder** y los firmantes resolubles son 0.
// (Caso de control de esa medición: hay 5 personas activas con cargo y 5 cargos distintos con
// persona, así que no es que la consulta viniera vacía.)
//
// Con cero resolubles pasan tres cosas, y las tres son de la misma familia que el defecto de
// la exportación del inventario: **lo problemático queda fuera del denominador y el tablero
// se ve completo.**
//
//   1. «Procesos firmados» dice «0 / 0», que se lee como «no falta ninguno».
//   2. «Pendientes de firma» dice «0», por `resolubles - firmados` = 0 − 0.
//   3. «Emitir el acta» sigue ofrecido, y emitir congela cifras, quema un consecutivo
//      `ARR-…` que no se recicla y genera un PDF con su sha256 — un acta que, por
//      `estado-acta-residual.ts:57`, NO PUEDE LLEGAR NUNCA a `APROBADA`, porque esa guarda
//      exige `procesos > 0`. La única salida es anularla, y anular deja registro permanente.
//
// Y una cuarta, de redacción: la nota de la tarjeta dice «El cargo líder del proceso no tiene
// persona activa», que es UNA de las dos causas. Hoy la real es la otra —el área no tiene
// cargo líder en absoluto—, así que quien la lea irá a buscar personas que faltan en vez de
// asignaciones que faltan. El `title` de la fila, en el mismo archivo, ya dice las dos: la
// que miente es la que se ve primero.

import {
  notaSinFirmante,
  puedeEmitirActa,
  resumenDeFirmantes,
  textoPendientesDeFirma,
  textoProcesosFirmados,
  type FirmanteResoluble,
} from '../firmantes-acta-residual';

/// Un área sin cargo líder: la causa (a), y la de las 10 de hoy.
const SIN_CARGO: FirmanteResoluble = { cargoId: null, candidatos: [], resoluble: false };

/// Un cargo que existe pero no tiene a nadie activo: la causa (b).
const CARGO_VACIO: FirmanteResoluble = { cargoId: 7, candidatos: [], resoluble: false };

/// Un proceso que sí puede firmar.
const FIRMABLE: FirmanteResoluble = {
  cargoId: 3,
  candidatos: [{ id: 1, nombre: 'Jefe de Tecnología' }],
  resoluble: true,
};

describe('resumenDeFirmantes · las dos causas se cuentan por separado', () => {
  it('distingue «sin cargo líder» de «cargo sin persona activa»', () => {
    const r = resumenDeFirmantes([SIN_CARGO, SIN_CARGO, CARGO_VACIO, FIRMABLE]);
    expect(r).toEqual({
      total: 4,
      resolubles: 1,
      sinCargoLider: 2,
      cargoSinPersona: 1,
      sinResolver: 3,
    });
  });

  it('el estado real de hoy: diez áreas, ninguna con cargo líder', () => {
    const r = resumenDeFirmantes(Array.from({ length: 10 }, () => SIN_CARGO));
    expect(r.resolubles).toBe(0);
    expect(r.sinCargoLider).toBe(10);
    expect(r.cargoSinPersona).toBe(0);
  });
});

describe('notaSinFirmante · un mensaje por causa, no uno para las dos', () => {
  it('nombra la falta de cargo líder cuando es la única causa', () => {
    const nota = notaSinFirmante(resumenDeFirmantes([SIN_CARGO, SIN_CARGO]));
    expect(nota).toContain('cargo líder');
    // Lo que NO puede decir: que el cargo no tiene persona, porque no hay cargo.
    expect(nota).not.toContain('persona activa');
  });

  it('nombra la falta de persona cuando es la única causa', () => {
    const nota = notaSinFirmante(resumenDeFirmantes([CARGO_VACIO]));
    expect(nota).toContain('persona activa');
  });

  it('con las dos causas mezcladas las nombra a las dos, con su cuenta', () => {
    const nota = notaSinFirmante(resumenDeFirmantes([SIN_CARGO, CARGO_VACIO, CARGO_VACIO]));
    expect(nota).toContain('1');
    expect(nota).toContain('2');
    expect(nota).toContain('cargo líder');
    expect(nota).toContain('persona activa');
  });

  it('cuando no falta nadie no inventa una deuda', () => {
    expect(notaSinFirmante(resumenDeFirmantes([FIRMABLE]))).toBe('');
  });
});

describe('las dos tarjetas que se ven completas cuando no lo están', () => {
  it('«Procesos firmados» NO dice «0 / 0» cuando nadie puede firmar', () => {
    const texto = textoProcesosFirmados(0, 0);
    expect(texto).not.toBe('0 / 0');
    expect(texto.toLowerCase()).toContain('sin firmantes');
  });

  it('«Pendientes de firma» NO dice «0» cuando nadie puede firmar', () => {
    const texto = textoPendientesDeFirma(true, 0, 0);
    expect(texto).not.toBe('0');
    expect(texto.toLowerCase()).toContain('nadie');
  });

  it('con firmantes de verdad las dos siguen contando como siempre', () => {
    expect(textoProcesosFirmados(2, 5)).toBe('2 / 5');
    expect(textoPendientesDeFirma(true, 2, 5)).toBe('3');
  });

  it('sin acta emitida, «Pendientes de firma» sigue siendo una raya', () => {
    expect(textoPendientesDeFirma(false, 0, 5)).toBe('—');
  });
});

describe('puedeEmitirActa · la guarda que no existía', () => {
  it('no se emite un acta que nadie podría firmar jamás', () => {
    const r = puedeEmitirActa(11, 0);
    expect(r.puede).toBe(false);
    if (!r.puede) expect(r.motivo).toMatch(/firmante|firmar/i);
  });

  it('con ALGUNOS irresolubles sí se emite: eso está previsto a propósito', () => {
    // El denominador excluye a los irresolubles justamente para que una deuda del catálogo de
    // cargos no deje el acta eternamente sin aprobar. El defecto es el caso límite, no el
    // diseño: bloquear acá rompería lo que funciona.
    expect(puedeEmitirActa(11, 1).puede).toBe(true);
  });

  it('sigue sin emitirse un acta sin activos, que ya se validaba antes', () => {
    expect(puedeEmitirActa(0, 5).puede).toBe(false);
  });

  it('con activos y firmantes, se emite', () => {
    expect(puedeEmitirActa(11, 5).puede).toBe(true);
  });
});
