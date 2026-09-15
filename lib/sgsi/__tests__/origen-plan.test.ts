// lib/sgsi/__tests__/origen-plan.test.ts
//
// REQ-SIG-20 §7.2 (D-4, D4, tarea 4.8) · el prefijo `origen:v1|R-0123|TEC-GEN-0004|A.24 ·
// <rationale>` tiene que formatear y volver a parsear exactamente lo mismo, y tiene que
// devolver `null` — nunca lanzar — ante un `AccionPlan.origen` preexistente que no lo trae.

import {
  formatearOrigen,
  origenCubreRiesgo,
  parsearOrigen,
  type OrigenPlan,
} from '../origen-plan';

describe('formatearOrigen — el prefijo verificable', () => {
  it('arma el prefijo con los tres campos y la narrativa después de " · "', () => {
    const texto = formatearOrigen('R-0123', 'TEC-GEN-0004', 'A.24', 'Residual crítico sin plan');
    expect(texto).toBe('origen:v1|R-0123|TEC-GEN-0004|A.24 · Residual crítico sin plan');
  });

  it('rechaza una justificación vacía: un prefijo sin narrativa legible no sirve', () => {
    expect(() => formatearOrigen('R-0123', 'TEC-GEN-0004', 'A.24', '')).toThrow();
    expect(() => formatearOrigen('R-0123', 'TEC-GEN-0004', 'A.24', '   ')).toThrow();
  });
});

describe('parsearOrigen — el round-trip', () => {
  it('round-trip exacto: parsear lo que formatearOrigen devolvió reproduce los cuatro campos', () => {
    const texto = formatearOrigen('R-0123', 'TEC-GEN-0004', 'A.24', 'Residual crítico sin plan');
    const parsed = parsearOrigen(texto);
    expect(parsed).toEqual<OrigenPlan>({
      version: 'v1',
      riesgoCodigo: 'R-0123',
      activoCodigo: 'TEC-GEN-0004',
      amenazaCodigo: 'A.24',
      justificacion: 'Residual crítico sin plan',
    });
  });

  it('la narrativa puede contener "|" y " · " sin romper el round-trip', () => {
    const justificacion = 'Activo | crítico · con separadores propios · dentro del texto';
    const texto = formatearOrigen('R-0009', 'TEC-SER-0051', 'A.11', justificacion);
    expect(parsearOrigen(texto)?.justificacion).toBe(justificacion);
  });

  it('un origen preexistente sin el prefijo devuelve null, no una excepción', () => {
    const legado =
      'Agregada desde Controles y madurez. El control está en L2 con objetivo L4.';
    expect(parsearOrigen(legado)).toBeNull();
  });

  it('un texto vacío devuelve null', () => {
    expect(parsearOrigen('')).toBeNull();
  });

  it('un prefijo truncado (campos faltantes) devuelve null en vez de partes vacías', () => {
    expect(parsearOrigen('origen:v1|R-0123|TEC-GEN-0004')).toBeNull();
    expect(parsearOrigen('origen:v1|R-0123|TEC-GEN-0004|A.24')).toBeNull(); // sin " · " ni narrativa
    expect(parsearOrigen('origen:v1||TEC-GEN-0004|A.24 · texto')).toBeNull(); // riesgoCodigo vacío
  });

  it('un prefijo de otra versión no coincide (v2 hipotético)', () => {
    expect(parsearOrigen('origen:v2|R-0123|TEC-GEN-0004|A.24 · texto')).toBeNull();
  });
});

describe('origenCubreRiesgo', () => {
  const origen: OrigenPlan = {
    version: 'v1',
    riesgoCodigo: 'R-0123',
    activoCodigo: 'TEC-GEN-0004',
    amenazaCodigo: 'A.24',
    justificacion: 'Residual crítico sin plan',
  };

  it('coincide cuando activo y amenaza son iguales', () => {
    expect(origenCubreRiesgo(origen, { activoCodigo: 'TEC-GEN-0004', amenazaCodigo: 'A.24' })).toBe(
      true,
    );
  });

  it('no coincide con otro activo aunque la amenaza sea la misma', () => {
    expect(
      origenCubreRiesgo(origen, { activoCodigo: 'TEC-EQU-0003', amenazaCodigo: 'A.24' }),
    ).toBe(false);
  });

  it('no coincide con otra amenaza del mismo activo', () => {
    expect(
      origenCubreRiesgo(origen, { activoCodigo: 'TEC-GEN-0004', amenazaCodigo: 'A.11' }),
    ).toBe(false);
  });
});
