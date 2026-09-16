// lib/sgsi/__tests__/madurez.test.ts
//
// The reference figures are asserted here as pure arithmetic over the fixture, and a
// second time by the seed against the live database. One proves the formula; the pair
// proves the formula, the seed and the schema agree.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  advertenciaParcialNivelAlto,
  desglosarEficaciaAmenaza,
  eficaciaAmenaza,
  esAplicable,
  metricasMadurez,
  validarNuevoSoa,
  type ControlMadurez,
} from '../madurez';

interface ControlFixture {
  soa: 'si' | 'parcial' | 'no';
  base: number | null;
  act: number | null;
  obj: number | null;
}

function cargarFixture(): ControlMadurez[] {
  const ruta = join(process.cwd(), 'prisma', 'data', 'iso-controles.json');
  const { controles } = JSON.parse(readFileSync(ruta, 'utf8')) as {
    controles: ControlFixture[];
  };
  return controles.map((c) => ({
    soa: c.soa,
    lineaBase: c.base,
    actual: c.act,
    objetivo: c.obj,
  }));
}

describe('métricas de madurez contra las cifras del libro', () => {
  const m = metricasMadurez(cargarFixture());

  it('cuenta 93 controles aplicables, cero exclusión y siete de alcance adaptado', () => {
    expect(m.total).toBe(93);
    expect(m.aplicables).toBe(93);
    expect(m.noAplicables).toBe(0);
    expect(m.parciales).toBe(7);
  });

  it('la línea base del GAP cubre 92 de 93: A.7.13 quedó sin evaluar', () => {
    expect(m.conLineaBase).toBe(92);
  });

  it('el índice de madurez es la media de la EFICACIA', () => {
    // REQ-SIG-24 §5 · tras la traducción POR EFICACIA (L3→90, L4→90) el índice baja de
    // 86.7 a 84.9: la traducción es casi neutra, y eso es una virtud. Todo el movimiento
    // del tablero tiene que venir de la recalificación a mano, no de un cambio de escala.
    expect(m.indice).toBeCloseTo(84.9, 1);
  });

  it('el escalón típico es la mediana, ahora en puntos', () => {
    expect(m.nivelTipico).toBeCloseTo(90, 2);
  });

  it('el escalón medio ya no es una cifra aparte', () => {
    expect(m.nivelMedio).toBeCloseTo(84.88, 2);
  });

  it('reproduce el resto del informe de progreso', () => {
    expect(m.enGestionado).toBe(75);
    expect(m.pctGestionado).toBeCloseTo(87.2, 1);
    // 26 → 70: L3 y L4 colapsan en 90, así que un control «en L3 con objetivo L4» pasa a
    // estar en objetivo. Esos cinco puntos de eficacia nunca fueron accionables — es el
    // mismo argumento por el que la exigencia de C1 no son cinco puntos más (§6.1) —,
    // pero el plan de mejora se aplana y hay que saberlo.
    expect(m.enObjetivo).toBe(70);
    expect(m.brechas).toBe(11);
    // El avance contra el GAP de marzo, ahora en PUNTOS y no en niveles.
    expect(m.avanceMedio).toBeCloseTo(79.76, 1);
    expect(m.brechaTotal).toBe(490);
  });

  it('el índice y el escalón medio COINCIDEN, y eso es lo nuevo', () => {
    // Cambió de signo a propósito. Con la curva PILAR la eficacia no era lineal, el nivel
    // era ordinal y promediarlo era incorrecto en rigor: por eso hacían falta dos cifras y
    // una advertencia de no confundirlas. La escala de REQ-SIG-24 es de RAZÓN —la eficacia
    // ES el número—, así que promediar el escalón y promediar la eficacia son la misma
    // operación. La distinción que obligaba a llevar dos métricas desaparece.
    expect(m.indice).toBeCloseTo(m.nivelMedio, 10);
  });
});

describe('los controles no aplicables quedan fuera de los promedios', () => {
  it('no arrastran la media hacia abajo con un cero', () => {
    const controles: ControlMadurez[] = [
      { soa: 'si', lineaBase: 10, actual: 90, objetivo: 90 },
      { soa: 'si', lineaBase: 10, actual: 90, objetivo: 90 },
      { soa: 'no', lineaBase: null, actual: null, objetivo: null },
    ];
    const m = metricasMadurez(controles);

    expect(m.aplicables).toBe(2);
    expect(m.noAplicables).toBe(1);
    expect(m.indice).toBeCloseTo(90, 5);
  });
});

describe('los controles PARCIAL cuentan como aplicables', () => {
  it('entran en todos los indicadores y no cuentan como exclusión', () => {
    const controles: ControlMadurez[] = [
      { soa: 'parcial', lineaBase: 10, actual: 80, objetivo: 90 },
      { soa: 'no', lineaBase: null, actual: null, objetivo: null },
    ];
    const m = metricasMadurez(controles);

    expect(m.aplicables).toBe(1);
    expect(m.parciales).toBe(1);
    expect(m.noAplicables).toBe(1);
    expect(m.indice).toBeCloseTo(80, 5);
    expect(m.nivelTipico).toBe(80);
    expect(m.enGestionado).toBe(1);
    expect(m.brechas).toBe(0);
    expect(m.brechaTotal).toBe(10);
  });

  it('la derivación es simple: aplicable = soa != no', () => {
    expect(esAplicable('si')).toBe(true);
    expect(esAplicable('parcial')).toBe(true);
    expect(esAplicable('no')).toBe(false);
  });
});

describe('un control aplicable todavía no evaluado no cuenta como 0 %', () => {
  it('la pendiente de evaluación es un dato ausente, no un cero', () => {
    const controles: ControlMadurez[] = [
      { soa: 'si', lineaBase: 50, actual: null, objetivo: 90 },
      { soa: 'si', lineaBase: 0, actual: 90, objetivo: 90 },
    ];
    const m = metricasMadurez(controles);

    expect(m.aplicables).toBe(2);
    expect(m.indice).toBeCloseTo(90, 5);
    expect(m.enGestionado).toBe(1);
    expect(m.pctGestionado).toBe(100);
    expect(m.brechas).toBe(0);
    expect(m.brechaTotal).toBe(0);
    expect(m.conLineaBase).toBe(2);
  });
});

describe('validación de un cambio de SOA', () => {
  it('no exige justificación cuando aplica', () => {
    expect(validarNuevoSoa('si', '')).toEqual([]);
  });

  it('«no» exige justificación escrita — 6.1.3 d', () => {
    const errores = validarNuevoSoa('no', '   ');
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('justificación');
  });

  it('«parcial» exige justificación escrita', () => {
    expect(validarNuevoSoa('parcial', '')).toHaveLength(1);
    expect(validarNuevoSoa('parcial', 'Cubre la nube, no las instalaciones físicas.')).toEqual([]);
  });

  it('la advertencia sólo se dispara en el escalón más alto', () => {
    expect(advertenciaParcialNivelAlto(80)).toBe(false);
    expect(advertenciaParcialNivelAlto(90)).toBe(true);
    expect(advertenciaParcialNivelAlto(100)).toBe(true);
    expect(advertenciaParcialNivelAlto(null)).toBe(false);
  });
});

describe('las brechas se cuentan, no se promedian', () => {
  it('un control en 10 % es una acción concreta, no un decimal', () => {
    const controles: ControlMadurez[] = [
      { soa: 'si', lineaBase: 0, actual: 10, objetivo: 90 },
      { soa: 'si', lineaBase: 90, actual: 100, objetivo: 100 },
    ];
    const m = metricasMadurez(controles);

    expect(m.brechas).toBe(1);
    expect(m.brechaTotal).toBe(80);
  });
});

// The plain-mean fallback for a pair with NO relevance assigned.
//
// `lib/sgsi/riesgos.ts` maps a null `relevanciaId` to `{peso: 1, esPrincipal: false}`, and
// the schema comment calls that mapping "the whole point" of making the column nullable — it
// is what let the 272 workbook pairs be recorded and the residual risk be computed at all.
// It had no test: the aggregation was exercised only with relevance already resolved, so a
// regression in the fallback would have gone straight through the suite and turned every
// residual figure silently wrong.
describe('eficaciaAmenaza sin relevancia asignada', () => {
  const sinRelevancia = (niveles: (number | null)[]) =>
    niveles.map((nivel) => ({ nivel, peso: 1, esPrincipal: false }));

  it('es la media plana, que es el AVERAGE del libro', () => {
    // 0.9 + 0.9 + 0.5 + 0.8 + 0.9 + 0.9 -> 4.9 / 6
    expect(eficaciaAmenaza(sinRelevancia([90, 90, 50, 80, 90, 90]))).toBeCloseTo(4.9 / 6, 6);
  });

  it('sin control principal el techo δ no interviene', () => {
    // Weighted and plain coincide when every weight is 1, and with no principal there is
    // nothing to cap against — so a weak member cannot pull the result below the mean.
    const plana = eficaciaAmenaza(sinRelevancia([50, 90, 90]));
    expect(plana).toBeCloseTo((0.5 + 0.9 + 0.9) / 3, 6);
    // The same set WITH the weakest named Principal is capped, and lower. That contrast is
    // the whole reason relevance is worth assigning.
    const conPrincipal = eficaciaAmenaza([
      { nivel: 50, peso: 3, esPrincipal: true },
      { nivel: 90, peso: 1, esPrincipal: false },
      { nivel: 90, peso: 1, esPrincipal: false },
    ]);
    // 0.55 es la MEDIA BRUTA por presupuesto —0.875×0.5 + 0.125×0.9—, no el techo.
    //
    // Con δ = 0.05 las dos cifras coincidían en 0.55 y la prueba no podía distinguir cuál
    // de las dos estaba midiendo. Al pasar δ a 0.10 (un escalón de la escala nueva) el
    // techo sube a 0.60, deja de morder, y queda a la vista que quien baja el resultado es
    // el PRESUPUESTO del principal —el 70 %—, no el recorte. El techo sigue siendo la red
    // para el caso extremo: con el principal en 0 % la bruta lee 0.28 y el techo la manda
    // a 0.10, que es su razón de ser.
    const desglose = desglosarEficaciaAmenaza([
      { nivel: 50, peso: 3, esPrincipal: true },
      { nivel: 90, peso: 1, esPrincipal: false },
      { nivel: 90, peso: 1, esPrincipal: false },
    ]);
    expect(conPrincipal).toBeCloseTo(0.55, 6);
    expect(desglose.techo).toBeCloseTo(0.6, 6);
    expect(desglose.techoActua).toBe(false);
    expect(conPrincipal).toBeLessThan(plana as number);
  });

  it('con el principal en 0 % el techo sí actúa, y ahí gana su sueldo', () => {
    // Sin techo, el presupuesto por clase mete un PISO incondicional: las otras dos clases
    // aportan su parte pase lo que pase, y la eficacia leería 28 % con el control clave
    // inexistente. Es el enmascaramiento que REQ-SIG-21 §4 vino a cerrar.
    const d = desglosarEficaciaAmenaza([
      { nivel: 0, peso: 3, esPrincipal: true },
      { nivel: 90, peso: 2, esPrincipal: false },
      { nivel: 90, peso: 1, esPrincipal: false },
    ]);
    expect(d.bruta).toBeGreaterThan(0.25);
    expect(d.techoActua).toBe(true);
    expect(d.eficacia).toBeCloseTo(0.1, 6); // 0 + δ
  });

  // REQ-SIG-21 §8 · ESTA PRUEBA CAMBIÓ DE SIGNO, a propósito. Antes fijaba que un control
  // sin evaluar entraba al promedio como eficacia 0. El requerimiento lo revierte: el mismo
  // módulo ya excluía los no evaluados en `metricasMadurez` («Sin evaluar» y «Por evaluar»
  // son juicios pendientes, no L0) y los metía como cero acá, a una función de distancia.
  // Excluirlos SUBE la eficacia de las amenazas físicas y BAJA su residual — el signo
  // contrario al resto del requerimiento, y el motivo por el que hay que verlo.
  it('un control sin evaluar queda fuera del promedio: «sin evaluar» no es 0 %', () => {
    expect(eficaciaAmenaza(sinRelevancia([null, 100]))).toBeCloseTo(1, 6);
    const d = desglosarEficaciaAmenaza(sinRelevancia([null, 100]));
    expect(d.sinEvaluar).toBe(1);
    expect(d.evaluados).toBe(1);
  });

  it('una amenaza con TODOS sus controles sin evaluar da eficacia desconocida, no cero', () => {
    // Criterio de aceptación 6: el residual queda «sin calcular», que es el estado honesto
    // y ya está soportado aguas abajo.
    expect(eficaciaAmenaza(sinRelevancia([null, null]))).toBeNull();
  });

  it('una lista vacía da null — desconocido no es cero', () => {
    // `eficaciaPorAmenaza` deja la eficacia de la amenaza en null cuando no hay pares. Esta
    // prueba fija el mismo contrato en la función pura, para que las dos digan lo mismo.
    expect(eficaciaAmenaza([])).toBeNull();
  });
});
