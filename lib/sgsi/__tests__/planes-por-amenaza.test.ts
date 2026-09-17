// lib/sgsi/__tests__/planes-por-amenaza.test.ts
//
// Qué planes hay que crear cuando alguien pide «plan para estas amenazas» desde la grilla de
// Análisis de riesgos. La pregunta no es trivial porque las unidades no coinciden: se eligen
// AMENAZAS y se crean PLANES, y un plan es sobre un CONTROL.

import {
  agruparAmenazasEnPlanes,
  type AmenazaParaPlan,
} from '../planes-por-amenaza';

function amenaza(p: Partial<AmenazaParaPlan> & { amenazaCodigo: string }): AmenazaParaPlan {
  return {
    amenazaNombre: `Amenaza ${p.amenazaCodigo}`,
    principalCodigo: 'A.8.12',
    principalNombre: 'Prevención de fuga de datos',
    brecha: 20,
    planExistente: null,
    ...p,
  };
}

describe('agruparAmenazasEnPlanes', () => {
  it('varias amenazas con el MISMO control principal son UN solo plan', () => {
    // Es la razón de existir del módulo. A.8.12 es principal de 84 riesgos; pedir «plan para
    // todas» no puede crear 84 planes idénticos sobre el mismo control — la propia acción de
    // servidor los rechazaría uno a uno por deduplicación, y quien lo pidió vería 83 errores.
    const r = agruparAmenazasEnPlanes([
      amenaza({ amenazaCodigo: 'E.14' }),
      amenaza({ amenazaCodigo: 'E.19' }),
      amenaza({ amenazaCodigo: 'A.11' }),
    ]);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].principalCodigo).toBe('A.8.12');
    expect(r.grupos[0].amenazas.map((a) => a.amenazaCodigo)).toEqual(['A.11', 'E.14', 'E.19']);
  });

  it('controles principales distintos son planes distintos', () => {
    const r = agruparAmenazasEnPlanes([
      amenaza({ amenazaCodigo: 'E.14', principalCodigo: 'A.8.12' }),
      amenaza({ amenazaCodigo: 'A.24', principalCodigo: 'A.5.29', brecha: 40 }),
    ]);
    expect(r.grupos.map((g) => g.principalCodigo)).toEqual(['A.5.29', 'A.8.12']);
  });

  it('ordena por brecha descendente: el plan que más falta va primero', () => {
    const r = agruparAmenazasEnPlanes([
      amenaza({ amenazaCodigo: 'E.14', principalCodigo: 'A.8.12', brecha: 20 }),
      amenaza({ amenazaCodigo: 'A.24', principalCodigo: 'A.5.29', brecha: 40 }),
      amenaza({ amenazaCodigo: 'A.30', principalCodigo: 'A.6.3', brecha: 10 }),
    ]);
    expect(r.grupos.map((g) => g.principalCodigo)).toEqual(['A.5.29', 'A.8.12', 'A.6.3']);
  });

  it('el grupo lleva la PEOR brecha de sus amenazas, que es la que fija el objetivo', () => {
    // Un plan que cerrara la brecha menor dejaría abierta la mayor sobre el mismo control, y
    // el control quedaría «con plan» sin estarlo de verdad.
    const r = agruparAmenazasEnPlanes([
      amenaza({ amenazaCodigo: 'E.14', brecha: 20 }),
      amenaza({ amenazaCodigo: 'E.19', brecha: 40 }),
    ]);
    expect(r.grupos[0].peorBrecha).toBe(40);
  });

  it('una amenaza que ya tiene plan se excluye, y se dice cuál', () => {
    // Crear un segundo plan sobre lo mismo es lo que convierte la lista en un inventario de
    // duplicados. Se informa el existente para poder ir a verlo.
    const r = agruparAmenazasEnPlanes([
      amenaza({ amenazaCodigo: 'E.14', planExistente: 'PT-016' }),
      amenaza({ amenazaCodigo: 'E.19' }),
    ]);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].amenazas.map((a) => a.amenazaCodigo)).toEqual(['E.19']);
    expect(r.excluidas).toEqual([
      { amenaza: expect.objectContaining({ amenazaCodigo: 'E.14' }), motivo: 'ya-cubierta' },
    ]);
  });

  it('una amenaza sin control principal se excluye: no se le inventa uno', () => {
    // El plan necesita saber qué control mejora. Elegir «el de menor madurez» acá sería
    // registrar sobre un control que nadie designó como el que contiene esta amenaza.
    const r = agruparAmenazasEnPlanes([
      amenaza({ amenazaCodigo: 'E.14', principalCodigo: null, principalNombre: null }),
    ]);
    expect(r.grupos).toHaveLength(0);
    expect(r.excluidas[0].motivo).toBe('sin-principal');
  });

  it('«ya cubierta» gana sobre «sin principal»: la razón que se informa es la útil', () => {
    const r = agruparAmenazasEnPlanes([
      amenaza({ amenazaCodigo: 'E.14', principalCodigo: null, planExistente: 'PT-016' }),
    ]);
    expect(r.excluidas[0].motivo).toBe('ya-cubierta');
  });

  it('una amenaza sin brecha se agrupa igual: registrar un plan es una decisión de quien lo pide', () => {
    // La brecha ORDENA la lista, no la filtra. Un plan preventivo sobre un control que hoy
    // cumple es legítimo, y la pantalla ya deja elegir qué amenazas entran.
    const r = agruparAmenazasEnPlanes([amenaza({ amenazaCodigo: 'E.14', brecha: null })]);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].peorBrecha).toBeNull();
  });

  it('no pierde ni duplica: grupos + excluidas suman lo que entró', () => {
    // La invariante que permite decirle a quien lo pide «estas 12 amenazas producen 3 planes»
    // sin que ninguna se haya evaporado por el camino.
    const entrada = [
      amenaza({ amenazaCodigo: 'E.14' }),
      amenaza({ amenazaCodigo: 'E.19', planExistente: 'PT-016' }),
      amenaza({ amenazaCodigo: 'A.24', principalCodigo: 'A.5.29' }),
      amenaza({ amenazaCodigo: 'A.30', principalCodigo: null }),
    ];
    const r = agruparAmenazasEnPlanes(entrada);
    const salieron = [
      ...r.grupos.flatMap((g) => g.amenazas.map((a) => a.amenazaCodigo)),
      ...r.excluidas.map((e) => e.amenaza.amenazaCodigo),
    ];
    expect(salieron.sort()).toEqual(entrada.map((a) => a.amenazaCodigo).sort());
  });

  it('sin amenazas no hay planes ni excluidas', () => {
    expect(agruparAmenazasEnPlanes([])).toEqual({ grupos: [], excluidas: [] });
  });
});
