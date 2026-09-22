// app/__tests__/acentos-de-fila.test.ts
//
// Los acentos de fila de la grilla NO pueden dibujarse con `box-shadow: inset`.
//
// MEDIDO EN PANTALLA EL 22/09/2026, leyendo los píxeles renderizados y no el estilo calculado:
//
//     .ag-row  box-shadow: inset 20px 0 0 0 rgb(255,0,0)  ->  ffffff  NO PINTA
//     .ag-row  border-left: 20px solid rgb(0,200,0)       ->  00c800  pinta
//     .ag-row  ::before absoluto con z-index              ->  0000ff  pinta
//
// `getComputedStyle(fila).boxShadow` devuelve la sombra igual —la regla gana la cascada, la
// variable existe, el valor llega—, pero el navegador no la dibuja sobre una fila de AG Grid.
// Una prueba que lea el estilo calculado pasa en verde con la barra invisible.
//
// POR QUÉ IMPORTA MÁS DE LO QUE PARECE. La fila roja tiene además un fondo teñido, así que se
// distinguía igual y el fallo quedó tapado: se veía «arreglada». La ámbar **no tiene fondo a
// propósito** —es el acento menor—, así que sin barra quedaba **idéntica a una fila normal**.
// El renglón que la pantalla usa para decir «a este activo le falta madurez de control» no
// decía nada, y ninguna prueba protestaba.
//
// ES LA TERCERA VEZ QUE ESTA MISMA REGLA FALLA POR UN MOTIVO DISTINTO, y conviene tenerlas a
// la vista porque cada arreglo parecía cerrar el asunto:
//
//   1. 21/09 · vivía en `@layer components` y perdía contra el tema sin capa de AG Grid.
//   2. 22/09 · fuera de la capa, ganaba la cascada — y seguía sin dibujarse.
//   3. el color de la barra ámbar no alcanzaba el contraste 3:1 de la WCAG 1.4.11.
//
// Las tres compartían la forma: **cada pieza hacía su trabajo y la pantalla no mostraba nada.**
// Por eso esta prueba mira el archivo y no el estilo calculado: es la única de las tres capas
// que puede afirmarse sin un navegador.

import { readFileSync } from 'fs';
import { join } from 'path';

const CSS = readFileSync(join(__dirname, '..', 'globals.css'), 'utf8');

/// El bloque de declaraciones que sigue a un selector, sin entrar en anidamientos.
function bloqueDe(selector: string): string {
  const i = CSS.indexOf(selector);
  if (i === -1) return '';
  const abre = CSS.indexOf('{', i);
  const cierra = CSS.indexOf('}', abre);
  return CSS.slice(abre, cierra + 1);
}

const ACENTOS = ['.ag-row.fila-alarmante', '.ag-row.fila-brecha-pendiente'];

describe('los acentos de fila se dibujan con algo que el navegador pinta', () => {
  it('las dos reglas existen', () => {
    // Caso de control: sin esto, todo lo de abajo pasaría en verde por no encontrar nada.
    for (const sel of ACENTOS) expect(bloqueDe(sel)).not.toBe('');
  });

  it('ninguna usa box-shadow inset', () => {
    for (const sel of ACENTOS) {
      expect(bloqueDe(sel)).not.toMatch(/box-shadow\s*:[^;}]*inset/);
    }
  });

  it('cada una dibuja su barra con un pseudo-elemento posicionado', () => {
    for (const sel of ACENTOS) {
      expect(CSS).toMatch(new RegExp(`${sel.replace(/\./g, '\\.')}::before\\b`));
    }
  });

  it('el pseudo-elemento lleva content, posición y ancho', () => {
    for (const sel of ACENTOS) {
      const b = bloqueDe(`${sel}::before`);
      expect(b).toMatch(/content\s*:/);
      expect(b).toMatch(/position\s*:\s*absolute/);
      expect(b).toMatch(/width\s*:/);
    }
  });
});
