// lib/sgsi/__tests__/madurez.test.ts
//
// The reference figures are asserted here as pure arithmetic over the fixture, and a
// second time by the seed against the live database. One proves the formula; the pair
// proves the formula, the seed and the schema agree.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  advertenciaParcialNivelAlto,
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

  it('cuenta 93 controles, 86 aplicables y 7 no aplicables', () => {
    expect(m.total).toBe(93);
    expect(m.aplicables).toBe(86);
    expect(m.noAplicables).toBe(7);
    expect(m.parciales).toBe(0);
  });

  it('el índice de madurez es la media de la EFICACIA', () => {
    expect(m.indice).toBeCloseTo(86.7, 1);
  });

  it('el nivel típico es la mediana del nivel', () => {
    expect(m.nivelTipico).toBeCloseTo(3.0, 2);
  });

  it('el nivel medio se conserva solo como referencia', () => {
    expect(m.nivelMedio).toBeCloseTo(3.23, 2);
  });

  it('reproduce el resto del informe de progreso', () => {
    expect(m.enL3).toBe(75);
    expect(m.pctL3).toBeCloseTo(87.2, 1);
    expect(m.enObjetivo).toBe(26);
    expect(m.brechas).toBe(11);
    expect(m.avanceMedio).toBeCloseTo(3.1, 2);
    expect(m.brechaTotal).toBe(64);
  });

  it('el índice y el nivel medio son números distintos', () => {
    // Promediar el nivel ordinal en vez de la eficacia es el error que la v1 cometió.
    // La eficacia no es lineal, así que las dos cifras no pueden coincidir por azar.
    expect(m.indice / 100).not.toBeCloseTo(m.nivelMedio / 5, 2);
  });
});

describe('los controles no aplicables quedan fuera de los promedios', () => {
  it('no arrastran la media hacia abajo con un cero', () => {
    const controles: ControlMadurez[] = [
      { soa: 'si', lineaBase: 1, actual: 3, objetivo: 3 },
      { soa: 'si', lineaBase: 1, actual: 3, objetivo: 3 },
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
      { soa: 'parcial', lineaBase: 1, actual: 3, objetivo: 4 },
      { soa: 'no', lineaBase: null, actual: null, objetivo: null },
    ];
    const m = metricasMadurez(controles);

    expect(m.aplicables).toBe(1);
    expect(m.parciales).toBe(1);
    expect(m.noAplicables).toBe(1);
    expect(m.indice).toBeCloseTo(90, 5);
    expect(m.nivelTipico).toBe(3);
    expect(m.enL3).toBe(1);
    expect(m.brechas).toBe(0);
    expect(m.brechaTotal).toBe(1);
  });

  it('la derivación es simple: aplicable = soa != no', () => {
    expect(esAplicable('si')).toBe(true);
    expect(esAplicable('parcial')).toBe(true);
    expect(esAplicable('no')).toBe(false);
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

  it('la advertencia de nivel solo se dispara en L4/L5', () => {
    expect(advertenciaParcialNivelAlto(3)).toBe(false);
    expect(advertenciaParcialNivelAlto(4)).toBe(true);
    expect(advertenciaParcialNivelAlto(5)).toBe(true);
    expect(advertenciaParcialNivelAlto(null)).toBe(false);
  });
});

describe('las brechas se cuentan, no se promedian', () => {
  it('un control en L1 es una acción concreta, no un decimal', () => {
    const controles: ControlMadurez[] = [
      { soa: 'si', lineaBase: 0, actual: 1, objetivo: 4 },
      { soa: 'si', lineaBase: 3, actual: 5, objetivo: 5 },
    ];
    const m = metricasMadurez(controles);

    expect(m.brechas).toBe(1);
    expect(m.brechaTotal).toBe(3);
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
    // L3=0.9, L3=0.9, L2=0.5, L4=0.95, L3=0.9, L3=0.9 -> 5.05 / 6
    expect(eficaciaAmenaza(sinRelevancia([3, 3, 2, 4, 3, 3]))).toBeCloseTo(5.05 / 6, 6);
  });

  it('sin control principal el techo δ no interviene', () => {
    // Weighted and plain coincide when every weight is 1, and with no principal there is
    // nothing to cap against — so a weak member cannot pull the result below the mean.
    const plana = eficaciaAmenaza(sinRelevancia([2, 4, 4]));
    expect(plana).toBeCloseTo((0.5 + 0.95 + 0.95) / 3, 6);
    // The same set WITH the weakest named Principal is capped, and lower. That contrast is
    // the whole reason relevance is worth assigning.
    const conPrincipal = eficaciaAmenaza([
      { nivel: 2, peso: 3, esPrincipal: true },
      { nivel: 4, peso: 1, esPrincipal: false },
      { nivel: 4, peso: 1, esPrincipal: false },
    ]);
    expect(conPrincipal).toBeCloseTo(0.55, 6); // 0.5 + δ
    expect(conPrincipal).toBeLessThan(plana as number);
  });

  it('un control sin evaluar cuenta como eficacia 0, no se omite', () => {
    // A null LEVEL is not the same as a missing control: the pair exists, so it belongs in
    // the denominator. Dropping it would flatter the threat.
    expect(eficaciaAmenaza(sinRelevancia([null, 5]))).toBeCloseTo(0.5, 6);
  });

  it('una lista vacía da 0 — el caso «sin controles» lo decide quien llama', () => {
    // `eficaciaPorAmenaza` never calls this with an empty list: it leaves the threat's
    // efficacy at null instead, because unknown is not zero. This pins the boundary so the
    // distinction stays where it belongs.
    expect(eficaciaAmenaza([])).toBe(0);
  });
});
