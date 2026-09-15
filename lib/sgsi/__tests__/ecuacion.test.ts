// lib/sgsi/__tests__/ecuacion.test.ts
//
// REQ-SIG-20 D3 (tarea 2.1) · la Ecuación no es un segundo cálculo: compone
// formulas.ts/madurez.ts en siete pasos, y el paso 7 coincide con lo que
// `generarRiesgos` (lib/sgsi/riesgos.ts) ya escribe en `Riesgo.riesgoResidual` — por
// construcción, no por casualidad, porque ambos llaman a la misma `calcularRiesgo`.
//
// La entrada de este archivo imita la forma de TEC-GEN-0004 × A.24 (Denegación de
// servicio), citado en tasks.md y design.md como el par de referencia para probar la
// paridad al cuarto decimal — los valores son representativos del dataset (activo
// valorado 5/5/4, amenaza con degradación fuerte en Disponibilidad, dos controles
// preventivos), no una lectura literal de la base: `ecuacion.ts` es puro y no toca
// Prisma, así que la prueba no lo necesita.

import { calcularRiesgo } from '../formulas';
import { resolverEcuacion, type EntradaEcuacion } from '../ecuacion';

const ENTRADA_TEC_GEN_0004_A24: EntradaEcuacion = {
  valores: { D: 5, I: 5, C: 4 },
  degradaciones: { D: '1.00', I: '0', C: '0' },
  aro: 1,
  controles: [
    { codigo: 'A.8.20', nivel: 3, peso: 1, esPrincipal: false, relevancia: null },
    { codigo: 'A.8.6', nivel: 3, peso: 1, esPrincipal: false, relevancia: null },
  ],
};

describe('resolverEcuacion — las siete pasos, TEC-GEN-0004 × A.24 (D3, tarea 2.1)', () => {
  it('paso 1: el valor es el máximo de las tres dimensiones', () => {
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    expect(r.valor.toNumber()).toBe(5);
  });

  it('paso 2: el impacto por dimensión es valor × degradación, una fila por dimensión', () => {
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    expect(r.impactosPorDimension).toHaveLength(3);
    const enD = r.impactosPorDimension.find((p) => p.dimension === 'D');
    expect(enD?.impacto.toNumber()).toBe(5);
    const enI = r.impactosPorDimension.find((p) => p.dimension === 'I');
    expect(enI?.impacto.toNumber()).toBe(0);
  });

  it('paso 3: el impacto es el máximo de los impactos por dimensión, no la suma', () => {
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    expect(r.impacto.toNumber()).toBe(5);
  });

  it('paso 4: el inherente es impacto × ARO', () => {
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    expect(r.inherente.toNumber()).toBe(5);
  });

  it('paso 5: la eficacia agregada de los controles aplicables', () => {
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    expect(r.eficacia).toBeCloseTo(0.9, 10);
  });

  it('paso 6: el ARO residual es ARO × (1 − eficacia)', () => {
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    expect(r.aroResidual).not.toBeNull();
    expect(r.aroResidual!.toNumber()).toBeCloseTo(0.1, 10);
  });

  it('paso 7: el residual coincide, al cuarto decimal, con calcularRiesgo — la misma aritmética', () => {
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    const salidaDirecta = calcularRiesgo({
      valores: ENTRADA_TEC_GEN_0004_A24.valores,
      degradaciones: ENTRADA_TEC_GEN_0004_A24.degradaciones,
      aro: ENTRADA_TEC_GEN_0004_A24.aro,
      eficacia: 0.9,
    });
    expect(r.residual).not.toBeNull();
    expect(r.residual!.toFixed(4)).toBe(salidaDirecta.riesgoResidual.toFixed(4));
    // Y coincide con el número concreto que la tabla del handoff documenta para este caso.
    expect(r.residual!.toNumber()).toBe(0.5);
  });

  it('el impacto no cambia entre el paso 4 y el paso 7 — no hay impacto residual', () => {
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    // inherente e impacto comparten la misma base: solo la frecuencia se reduce.
    expect(r.inherente.toNumber()).toBe(r.impacto.toNumber());
  });
});

describe('resolverEcuacion — excepciones surgen en su propio paso, con justificación', () => {
  it('una excepción de degradación en una dimensión se refleja en el paso 2, con su motivo', () => {
    const entrada: EntradaEcuacion = {
      ...ENTRADA_TEC_GEN_0004_A24,
      excepcionesDegradacion: { D: 'Réplica activo-activo reduce la degradación observada' },
    };
    const r = resolverEcuacion(entrada);
    const enD = r.impactosPorDimension.find((p) => p.dimension === 'D');
    expect(enD?.excepcion.activa).toBe(true);
    expect(enD?.excepcion.justificacion).toBe(
      'Réplica activo-activo reduce la degradación observada',
    );
    const enI = r.impactosPorDimension.find((p) => p.dimension === 'I');
    expect(enI?.excepcion.activa).toBe(false);
  });

  it('una excepción de frecuencia se refleja en su propio paso, con su motivo', () => {
    const entrada: EntradaEcuacion = {
      ...ENTRADA_TEC_GEN_0004_A24,
      aro: 4,
      justificacionFrecuencia: 'Histórico de incidentes de este activo es más frecuente que el de la amenaza',
    };
    const r = resolverEcuacion(entrada);
    expect(r.excepcionFrecuencia.activa).toBe(true);
    expect(r.excepcionFrecuencia.justificacion).toContain('Histórico de incidentes');
    expect(r.aro.toNumber()).toBe(4);
  });

  it('sin ninguna excepción, los tres pasos que podrían llevarla no la muestran', () => {
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    expect(r.impactosPorDimension.every((p) => !p.excepcion.activa)).toBe(true);
    expect(r.excepcionFrecuencia.activa).toBe(false);
    expect(r.excepcionMadurez.activa).toBe(false);
  });

  it('una excepción de madurez reemplaza la eficacia agregada por la del nivel elegido', () => {
    const entrada: EntradaEcuacion = {
      ...ENTRADA_TEC_GEN_0004_A24,
      excepcionMadurez: { nivel: 2, justificacion: 'El principal quedó fuera de servicio esta semana' },
    };
    const r = resolverEcuacion(entrada);
    expect(r.eficacia).toBeCloseTo(0.5, 10); // eficaciaDeNivel(2)
    expect(r.excepcionMadurez.activa).toBe(true);
    expect(r.excepcionMadurez.justificacion).toContain('principal quedó fuera de servicio');
  });
});

describe('resolverEcuacion — paso 5 sin controles: desconocido, no cero', () => {
  it('sin controles mapeados, la eficacia y el residual quedan null — no en cero', () => {
    const entrada: EntradaEcuacion = { ...ENTRADA_TEC_GEN_0004_A24, controles: [] };
    const r = resolverEcuacion(entrada);
    expect(r.eficacia).toBeNull();
    expect(r.aroResidual).toBeNull();
    expect(r.residual).toBeNull();
    expect(r.desgloseEficacia).toBeNull();
    // El inherente SÍ está calculado: lo desconocido es la eficacia, no el impacto.
    expect(r.inherente.toNumber()).toBe(5);
  });
});

describe('resolverEcuacion — paso 5 expandible, hoy siempre degrada sin relevancia (Open Item 6)', () => {
  it('sin relevancia asignada en ningún control, el desglose lo dice y no hay principal', () => {
    // El estado real de las 272 filas de `ControlAmenaza` hoy: relevanciaId null en
    // todas. La media pasa a ser simple y el techo no interviene — MET-SIG-01 v2, lo que
    // REQ-SIG-21 viene a corregir con la regla 70/20/10 (fuera de alcance acá).
    const r = resolverEcuacion(ENTRADA_TEC_GEN_0004_A24);
    expect(r.desgloseEficacia).not.toBeNull();
    expect(r.desgloseEficacia!.sinRelevanciaAsignada).toBe(true);
    expect(r.desgloseEficacia!.principal).toBeNull();
    expect(r.desgloseEficacia!.controles).toHaveLength(2);
  });

  it('con relevancia asignada, el desglose expone el principal y su techo — probado aunque hoy no ocurra', () => {
    const entrada: EntradaEcuacion = {
      ...ENTRADA_TEC_GEN_0004_A24,
      controles: [
        { codigo: 'A.8.20', nivel: 2, peso: 3, esPrincipal: true, relevancia: 'Principal' },
        { codigo: 'A.8.6', nivel: 4, peso: 1, esPrincipal: false, relevancia: 'De apoyo' },
      ],
    };
    const r = resolverEcuacion(entrada);
    expect(r.desgloseEficacia!.sinRelevanciaAsignada).toBe(false);
    expect(r.desgloseEficacia!.principal).not.toBeNull();
    expect(r.desgloseEficacia!.principal!.codigo).toBe('A.8.20');
    // eficaciaDeNivel(2) = 0.5, techo = 0.5 + 0.05
    expect(r.desgloseEficacia!.principal!.techo).toBeCloseTo(0.55, 10);
    // El techo efectivamente cubre la eficacia final, tal como exige MET-SIG-01 §7.4.
    expect(r.eficacia).toBeLessThanOrEqual(r.desgloseEficacia!.principal!.techo);
  });
});
