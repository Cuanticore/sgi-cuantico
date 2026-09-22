// lib/sgsi/__tests__/riesgo-activo.test.ts
//
// Tarea 1.11 (REQ-SIG-20) · `nivelDeRiesgoDelActivo` es el módulo que la ficha, el
// inventario y `app/api/sgsi/exportar-activos/route.ts` comparten para colapsar los
// riesgos de un activo en un nivel. Un activo bajo el umbral no genera `Riesgo` en
// absoluto, así que llega acá con una lista de figuras vacía — y el contrato es null, no
// cero: "no calculado" y "cero" son afirmaciones distintas (invariante «not calculated is
// not zero»).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HEX_DE_VARIABLE_RIESGO,
  RAMPA_RIESGO,
  RAMPA_RIESGO_HEX,
  hexDeColorDeRiesgo,
  nivelDeRiesgoDelActivo,
  type UmbralRiesgo,
} from '../riesgo-activo';

const BANDAS: UmbralRiesgo[] = [
  { nombre: 'Crítico', desde: '25', hasta: '100000', orden: 1 },
  { nombre: 'Alto', desde: '5', hasta: '24.999', orden: 2 },
  { nombre: 'Medio', desde: '0.5', hasta: '4.999', orden: 3 },
  { nombre: 'Bajo', desde: '0', hasta: '0.499', orden: 4 },
];

describe('nivelDeRiesgoDelActivo · null es "no calculado", nunca 0 (tarea 1.11)', () => {
  it('un activo sin ningún Riesgo (bajo el umbral) devuelve null, no 0', () => {
    expect(nivelDeRiesgoDelActivo([], BANDAS)).toBeNull();
  });

  it('figuras todas null (residual sin calcular) también devuelve null', () => {
    expect(nivelDeRiesgoDelActivo([null, null], BANDAS)).toBeNull();
  });

  it('triangulación: con al menos una figura real, sí calcula el mayor nivel', () => {
    const resultado = nivelDeRiesgoDelActivo(['1.2', '30.5', null], BANDAS);
    expect(resultado).not.toBeNull();
    expect(resultado!.banda).toBe('Crítico');
    expect(resultado!.nivel).toBe(5);
    expect(resultado!.figura).toBe('30.5');
  });
});

// ============================================================================
// LA PALETA · el guardián que no existía
// ============================================================================
//
// El HEX de las bandas estuvo copiado a mano en cinco archivos, y ninguna prueba del repo
// leía `app/globals.css`: cambiar un color allá y olvidar una copia dejaba TODO en verde
// mientras la aplicación pintaba dos colores distintos. Ahora hay un solo dueño
// —`PALETA_RIESGO` en `riesgo-activo.ts`— y la única copia que queda es la del CSS, porque
// el navegador no puede leer TypeScript. Esta prueba es lo que la vigila: lee el CSS de
// verdad y lo compara renglón por renglón contra la constante.

/// El valor de una propiedad personalizada en `app/globals.css`, del bloque `:root`.
function delCss(css: string, variable: string): string | null {
  const m = new RegExp(`${variable}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css);
  return m ? m[1].toLowerCase() : null;
}

describe('la paleta de riesgo · un solo dueño del HEX', () => {
  const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

  it('cada HEX de la rampa es el mismo que declara app/globals.css', () => {
    // Por posición de banda, el mismo orden de `RAMPA_RIESGO`: la peor primero.
    const variables = [
      ['--hf-risk-critico-bg', '--hf-risk-critico-fg'],
      ['--hf-risk-alto-bg', '--hf-risk-alto-fg'],
      ['--hf-risk-medio-bg', '--hf-risk-medio-fg'],
      ['--hf-risk-bajo-bg', '--hf-risk-bajo-fg'],
    ];
    expect(RAMPA_RIESGO_HEX).toHaveLength(variables.length);
    variables.forEach(([bg, fg], i) => {
      expect({ bg: delCss(css, bg), fg: delCss(css, fg) }).toEqual(RAMPA_RIESGO_HEX[i]);
    });
  });

  it('la rampa de pantalla y la de HEX describen las mismas bandas, en el mismo orden', () => {
    expect(RAMPA_RIESGO).toHaveLength(RAMPA_RIESGO_HEX.length);
    RAMPA_RIESGO.forEach((color, i) => {
      expect(hexDeColorDeRiesgo(color.bg)).toBe(RAMPA_RIESGO_HEX[i].bg);
      expect(hexDeColorDeRiesgo(color.fg)).toBe(RAMPA_RIESGO_HEX[i].fg);
    });
  });

  it('el diccionario cubre las ocho variables y ninguna más', () => {
    expect(Object.keys(HEX_DE_VARIABLE_RIESGO).sort()).toEqual([
      '--hf-risk-alto-bg',
      '--hf-risk-alto-fg',
      '--hf-risk-bajo-bg',
      '--hf-risk-bajo-fg',
      '--hf-risk-critico-bg',
      '--hf-risk-critico-fg',
      '--hf-risk-medio-bg',
      '--hf-risk-medio-fg',
    ]);
  });

  it('un color que no es de esta paleta devuelve null, no un color inventado', () => {
    expect(hexDeColorDeRiesgo('var(--hf-brand-nav)')).toBeNull();
    expect(hexDeColorDeRiesgo('')).toBeNull();
  });

  it('un hex literal pasa tal cual: quien traduce no tiene que preguntar primero', () => {
    expect(hexDeColorDeRiesgo('#1B3A8A')).toBe('#1b3a8a');
  });
});
