// lib/sgsi/__tests__/valoracion-figura.test.ts

import {
  ANCHO_TRAZADO,
  RAMPA,
  SEPARACION,
  cabeLaEtiqueta,
  colorDeNivelValor,
  cortesDeEje,
  posicionUmbral,
  segmentos,
  tinteDeCelda,
} from '../valoracion-figura';
import { nivelesAscendentes, type NivelEscala, type Reparto } from '../valoracion-agregada';

const NIVELES: NivelEscala[] = nivelesAscendentes([
  { valor: 5, etiqueta: '5 — Muy Alto' },
  { valor: 4, etiqueta: '4 — Alto' },
  { valor: 3, etiqueta: '3 — Medio' },
  { valor: 2, etiqueta: '2 — Bajo' },
  { valor: 1, etiqueta: '1 — Muy Bajo' },
  { valor: 0, etiqueta: '0 — Irrelevante' },
]);

function reparto(porNivel: number[], sinValorar = 0): Reparto {
  const valorados = porNivel.reduce((t, n) => t + n, 0);
  return {
    porNivel,
    sinValorar,
    valorados,
    total: valorados + sinValorar,
    desdeUmbral: porNivel[4]! + porNivel[5]!,
  };
}

describe('la rampa', () => {
  it('son seis pasos, uno por nivel de la escala', () => {
    expect(RAMPA.length).toBe(NIVELES.length);
  });

  it('los tres oscuros son los tokens de marca tal cual', () => {
    expect(RAMPA.slice(3)).toEqual(['#2b52b8', '#1b3a8a', '#0c2461']);
  });

  it('el paso más claro NO es --hf-brand-100, que falla el contraste a 1.12:1', () => {
    expect(RAMPA[0]).not.toBe('#e9f0fb');
  });

  it('no hay verde ni rojo: un activo de valor 5 es valioso, no malo', () => {
    // Todos los pasos son azules: el canal rojo nunca domina y el verde nunca es el mayor.
    for (const hex of RAMPA) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
    }
  });

  it('el color del nivel se recorta a la rampa en vez de fallar', () => {
    expect(colorDeNivelValor(0)).toBe(RAMPA[0]);
    expect(colorDeNivelValor(5)).toBe(RAMPA[5]);
    expect(colorDeNivelValor(9)).toBe(RAMPA[5]);
    expect(colorDeNivelValor(-1)).toBe(RAMPA[0]);
  });
});

describe('tinteDeCelda', () => {
  it('celda en cero: sin tinte', () => {
    expect(tinteDeCelda(0, 40)).toBeNull();
  });

  it('sin tope no hay escala que aplicar', () => {
    expect(tinteDeCelda(3, 0)).toBeNull();
  });

  it('la celda más alta llega al tope del paso 2 al 18 %', () => {
    expect(tinteDeCelda(40, 40)).toContain('#4874c2');
    expect(tinteDeCelda(40, 40)).toContain('18.00%');
  });

  it('es proporcional a la cuenta dentro de su grupo', () => {
    expect(tinteDeCelda(20, 40)).toContain('9.00%');
  });
});

describe('segmentos · escala absoluta compartida (D-5)', () => {
  const larga = reparto([0, 2, 34, 230, 31, 2]);
  const corta = reparto([0, 3, 50, 234, 9, 3]);
  const escala = Math.max(larga.valorados, corta.valorados);

  it('los segmentos van de 0 a 5, de izquierda a derecha', () => {
    expect(segmentos(larga, NIVELES, escala, 4).map((s) => s.valor)).toEqual([1, 2, 3, 4, 5]);
  });

  it('los niveles en cero se omiten: un segmento de ancho cero no informa', () => {
    expect(segmentos(larga, NIVELES, escala, 4).some((s) => s.cuenta === 0)).toBe(false);
  });

  it('el largo significa cuántos activos, no una fracción del 100 %', () => {
    const media = reparto([0, 0, 0, 0, 0, escala / 2]);
    const s = segmentos(media, NIVELES, escala, 4);
    expect(s[0]!.ancho).toBeCloseTo(ANCHO_TRAZADO / 2, 5);
  });

  it('con la misma escala, la fila con menos valorados sale más corta', () => {
    const finLarga = (() => {
      const s = segmentos(larga, NIVELES, escala, 4);
      return s[s.length - 1]!.x + s[s.length - 1]!.ancho;
    })();
    const parcial = reparto([0, 1, 1, 1, 1, 1], 10);
    const s = segmentos(parcial, NIVELES, escala, 4);
    const finParcial = s[s.length - 1]!.x + s[s.length - 1]!.ancho;
    expect(finParcial).toBeLessThan(finLarga);
  });

  it('la barra completa termina en el ancho del trazado cuando es la más larga', () => {
    const s = segmentos(larga, NIVELES, escala, 4);
    const ultimo = s[s.length - 1]!;
    expect(ultimo.x + ultimo.ancho).toBeCloseTo(ANCHO_TRAZADO, 5);
  });

  it('los 2 px de separación se descuentan del ancho, salvo en el último', () => {
    const s = segmentos(larga, NIVELES, escala, 4);
    const px = ANCHO_TRAZADO / escala;
    expect(s[0]!.ancho).toBeCloseTo(Math.max(1, s[0]!.cuenta * px - SEPARACION), 5);
    const ultimo = s[s.length - 1]!;
    expect(ultimo.ancho).toBeCloseTo(ultimo.cuenta * px, 5);
  });

  it('marca los extremos, que son los únicos con esquinas redondeadas', () => {
    const s = segmentos(larga, NIVELES, escala, 4);
    expect(s.filter((x) => x.primero).length).toBe(1);
    expect(s.filter((x) => x.ultimo).length).toBe(1);
    expect(s[0]!.primero).toBe(true);
    expect(s[s.length - 1]!.ultimo).toBe(true);
  });

  it('dice qué segmentos entran al análisis, leyendo el umbral', () => {
    expect(segmentos(larga, NIVELES, escala, 4).filter((s) => s.entraAlAnalisis).map((s) => s.valor))
      .toEqual([4, 5]);
    expect(segmentos(larga, NIVELES, escala, 3).filter((s) => s.entraAlAnalisis).map((s) => s.valor))
      .toEqual([3, 4, 5]);
  });

  it('la fracción de fila se mide sobre los valorados, no sobre el total', () => {
    const parcial = reparto([0, 0, 0, 0, 5, 5], 10);
    const s = segmentos(parcial, NIVELES, 10, 4);
    expect(s[0]!.fraccionDeFila).toBeCloseTo(0.5, 5);
  });

  it('una fila sin nada valorado no dibuja nada', () => {
    expect(segmentos(reparto([0, 0, 0, 0, 0, 0], 12), NIVELES, 100, 4)).toEqual([]);
  });

  it('un inventario vacío no dibuja cuatro barras de ancho cero', () => {
    expect(segmentos(reparto([0, 0, 0, 0, 0, 0]), NIVELES, 0, 4)).toEqual([]);
  });
});

describe('posicionUmbral · la desalineación es el hallazgo', () => {
  const c = reparto([0, 2, 34, 230, 31, 2]);
  const i = reparto([0, 1, 64, 224, 8, 2]);
  const escala = 299;

  it('cae en la frontera del nivel del umbral de esa fila', () => {
    expect(posicionUmbral(c, NIVELES, escala, 4)).toBeCloseTo((266 / 299) * ANCHO_TRAZADO, 5);
  });

  it('cada fila la tiene en una x distinta, y por eso se ve qué dimensión manda', () => {
    expect(posicionUmbral(c, NIVELES, escala, 4)).not.toBeCloseTo(
      posicionUmbral(i, NIVELES, escala, 4)!,
      3,
    );
  });

  it('bajar el umbral a 3 mueve la marca sola', () => {
    expect(posicionUmbral(c, NIVELES, escala, 3)).toBeCloseTo((36 / 299) * ANCHO_TRAZADO, 5);
  });

  it('se omite cuando caería en un extremo de la barra', () => {
    const todoBajo = reparto([0, 0, 0, 10, 0, 0]);
    expect(posicionUmbral(todoBajo, NIVELES, escala, 4)).toBeNull();
    const todoAlto = reparto([0, 0, 0, 0, 10, 0]);
    expect(posicionUmbral(todoAlto, NIVELES, escala, 4)).toBeNull();
  });

  it('se omite cuando la fila no tiene nada valorado', () => {
    expect(posicionUmbral(reparto([0, 0, 0, 0, 0, 0], 5), NIVELES, escala, 4)).toBeNull();
  });
});

describe('cortesDeEje', () => {
  it('arranca en 0 y termina en la escala', () => {
    const cortes = cortesDeEje(299);
    expect(cortes[0]).toBe(0);
    expect(cortes[cortes.length - 1]).toBe(299);
  });

  it('los pasos son redondos', () => {
    expect(cortesDeEje(299)).toEqual([0, 100, 200, 299]);
    expect(cortesDeEje(20)).toEqual([0, 5, 10, 15, 20]);
  });

  it('con escala en cero no dibuja eje', () => {
    expect(cortesDeEje(0)).toEqual([0]);
  });
});

describe('cabeLaEtiqueta · un número recortado es peor que ninguno', () => {
  it('un segmento angosto no lleva etiqueta', () => {
    expect(cabeLaEtiqueta(12, 230)).toBe(false);
  });

  it('un segmento ancho sí', () => {
    expect(cabeLaEtiqueta(120, 230)).toBe(true);
  });

  it('la exigencia crece con los dígitos', () => {
    expect(cabeLaEtiqueta(26, 9)).toBe(true);
    expect(cabeLaEtiqueta(26, 230)).toBe(false);
  });
});
