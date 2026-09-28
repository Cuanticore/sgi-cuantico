// app/components/sgsi/activos/__tests__/simulacion-declarada.test.ts
//
// Todo control de la ficha que NO persiste tiene que decirlo en su propio `title`.
//
// ── EL DEFECTO QUE ESTA PRUEBA EXISTE PARA IMPEDIR ─────────────────────────────────────
//
// El 28/09/2026, sobre producción, alguien cambió la madurez de `A.5.15` en el panel de una
// amenaza de `FIN-APP-0001`, vio el residual bajar de 32 a 11,2 y preguntó si eso guardaba
// solo. **No guardaba de ninguna forma.** La cabecera de `FichaActivo.tsx` lo dice desde
// siempre —«WHAT IS STILL NOT PERSISTED, AND WHY»— pero lo decía en un comentario, y quien
// usa la pantalla no lee comentarios: lee un selector habilitado, lo mueve, ve cambiar el
// número y concluye lo razonable.
//
// Peor que no guardar: **el botón «Guardar N cambios» ni siquiera lo cuenta**, así que no hay
// indicador que delate la diferencia. Se hace lo correcto y la pantalla deja creerlo.
//
// ── POR QUÉ SE DECLARA Y NO SE PERSISTE ────────────────────────────────────────────────
//
// La madurez de un control NO es del activo. El propio panel lo advierte: «Asociar o quitar un
// control cambia la eficacia de la amenaza y con ella el riesgo residual de TODOS los activos
// que la tienen: es una decisión de parametrización, no de este activo». Guardarla desde la
// ficha de uno movería los treinta. Su dueña es la pantalla «Madurez de los controles».
//
// ── POR QUÉ ES UNA GUARDIA SOBRE EL FUENTE ─────────────────────────────────────────────
//
// El bloque de controles vive detrás de la pestaña de amenazas y de un panel desplegado;
// montarlo para leer un atributo cuesta más de lo que aporta. Lo que hay que impedir es que
// alguien agregue mañana un tercer selector simulado sin la advertencia, y eso se ve en el
// archivo.

import { readFileSync } from 'fs';
import { join } from 'path';

const FUENTE = readFileSync(join(__dirname, '..', 'FichaActivo.tsx'), 'utf8');

/// El bloque de atributos de un `<select>` que llama a `manejador`.
function selectQueLlama(manejador: string): string {
  const i = FUENTE.indexOf(`on${manejador}(clave`);
  if (i === -1) return '';
  const abre = FUENTE.lastIndexOf('<select', i);
  const cierra = FUENTE.indexOf('>', FUENTE.indexOf('className', i));
  return abre === -1 ? '' : FUENTE.slice(abre, cierra);
}

/// Los dos que no tienen acción de guardado en el repositorio.
const SIMULADOS = ['Madurez', 'Efecto'];

describe('los controles que no persisten lo declaran', () => {
  it('los dos selectores simulados siguen existiendo', () => {
    // Caso de control: si mañana alguien les escribe la acción de guardado y desaparecen de
    // acá, esta prueba dejaría de vigilar algo y pasaría en verde por vacía.
    for (const m of SIMULADOS) expect(selectQueLlama(m)).not.toBe('');
  });

  it('cada uno avisa en su title que no se guarda', () => {
    for (const m of SIMULADOS) {
      expect(selectQueLlama(m)).toMatch(/no se guarda/i);
    }
  });

  it('y dice dónde se cambia de verdad', () => {
    // Avisar sin decir la salida deja a la persona igual de atascada, sólo que informada.
    for (const m of SIMULADOS) {
      expect(selectQueLlama(m)).toMatch(/Madurez de los controles|simulaci/i);
    }
  });

  it('la ficha enlaza a la pantalla dueña del dato', () => {
    expect(FUENTE).toContain('/sgsi/controles');
  });
});
