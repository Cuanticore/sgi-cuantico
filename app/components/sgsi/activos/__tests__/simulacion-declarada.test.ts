// app/components/sgsi/activos/__tests__/simulacion-declarada.test.ts
//
// Cada control de la ficha declara lo que hace: el que guarda dice su ALCANCE, el que no
// guarda dice que es una simulación.
//
// ── LA HISTORIA, QUE EXPLICA POR QUÉ ESTA PRUEBA CAMBIÓ DE CONTENIDO ───────────────────
//
// El 28/09/2026, sobre producción, alguien cambió la madurez de un control en el panel de una
// amenaza, vio el residual bajar de 32 a 11,2 y preguntó si eso guardaba solo. No guardaba de
// ninguna forma: era un «qué pasaría si» con aspecto de campo editable. La primera versión de
// esta prueba exigía que ambos selectores lo declararan.
//
// El 29/09/2026 se decidió que **sí debe guardar** — cada control se evalúa por separado, eso
// mueve el residual de la amenaza y con él la lista de Análisis. Así que la madurez pasó a
// escribirse con `guardarMadurez`, la MISMA acción de la pantalla de controles: un solo
// escritor de `Control.actualId`.
//
// Entonces la advertencia vieja se volvió falsa. Repetir «no se guarda» sobre un selector que
// guarda es mentir al revés, y una prueba que la exigiera obligaría a mantener la mentira. Lo
// que hay que advertir ahora es el ALCANCE: la madurez es del control, y guardarla mueve el
// riesgo de todos los activos que tienen esa amenaza.
//
// El *efecto* Previene / Limita sigue sin entrar al cálculo, así que sigue siendo simulación y
// sigue teniendo que decirlo.

import { readFileSync } from 'fs';
import { join } from 'path';

const FUENTE = readFileSync(join(__dirname, '..', 'FichaActivo.tsx'), 'utf8');

/// El bloque de atributos del `<select>` que llama a `manejador`.
function selectQueLlama(manejador: string): string {
  const i = FUENTE.indexOf(`on${manejador}(clave`);
  if (i === -1) return '';
  const abre = FUENTE.lastIndexOf('<select', i);
  const cierra = FUENTE.indexOf('>', FUENTE.indexOf('className', i));
  return abre === -1 ? '' : FUENTE.slice(abre, cierra);
}

describe('la madurez del control, que SÍ se guarda', () => {
  it('el selector sigue existiendo', () => {
    // Caso de control: si desapareciera, todo lo de abajo pasaría en verde por vacío.
    expect(selectQueLlama('Madurez')).not.toBe('');
  });

  it('declara que se guarda', () => {
    expect(selectQueLlama('Madurez')).toMatch(/SE GUARDA/);
  });

  it('y declara el alcance, que es lo que de verdad hay que saber antes', () => {
    // Guardar sin avisar que mueve a los demás activos es el defecto simétrico del anterior.
    expect(selectQueLlama('Madurez')).toMatch(/todos los activos/i);
  });

  it('lo escribe la MISMA acción que la pantalla de controles', () => {
    // Dos escritores de `Control.actualId` es como las dos pantallas se separan.
    expect(FUENTE).toContain("guardarMadurez");
    expect(FUENTE).toContain("from '@/app/sgsi/acciones/controles'");
  });
});

describe('el efecto Previene / Limita, que NO se guarda', () => {
  it('el selector sigue existiendo', () => {
    expect(selectQueLlama('Efecto')).not.toBe('');
  });

  it('declara que es una simulación', () => {
    expect(selectQueLlama('Efecto')).toMatch(/SIMULACIÓN/);
  });
});

describe('el aviso visible del bloque de controles', () => {
  it('ya no dice que la madurez no se guarda', () => {
    // La frase vieja sobrevivió un día. Que no vuelva: un aviso falso enseña a ignorar los
    // avisos, y entonces el siguiente —el del alcance— tampoco se lee.
    expect(FUENTE).not.toMatch(/madurez y el efecto de cada control son una simulación/i);
  });

  it('advierte el alcance y enlaza a la pantalla dueña', () => {
    expect(FUENTE).toMatch(/se guarda, y es del control/i);
    expect(FUENTE).toContain('/sgsi/controles');
  });
});
