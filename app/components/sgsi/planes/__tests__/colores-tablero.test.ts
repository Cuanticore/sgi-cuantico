// app/components/sgsi/planes/__tests__/colores-tablero.test.ts
//
// La escala de color del tablero de planes. Es una escala SEMÁNTICA —urgencia y resultado—,
// y lo único que se puede probar de un hexadecimal es que diga algo distinto de sus vecinos.

import { COLOR } from '../GanttPlanes';

describe('la escala de color del tablero', () => {
  it('los cinco estados se ven distintos entre sí', () => {
    // Dos estados con la misma barra es un tablero que no distingue lo que dice distinguir,
    // y es el defecto que un copiar-pegar produce sin que nadie lo note.
    const barras = Object.values(COLOR).map((c) => c.barra);
    expect(new Set(barras).size).toBe(barras.length);
  });

  it('un plan CERRADO no se pinta con el gris de uno NO INICIADO', () => {
    // Estaba en gris —#b9c4cd contra #8b97a3—, así que cerrar un plan lo apagaba en vez de
    // mostrarlo terminado. Cerrar es el resultado que el sistema persigue, no un archivado.
    expect(COLOR.CERRADO.barra).not.toBe(COLOR.NO_INICIADO.barra);
    expect(COLOR.CERRADO.texto).not.toBe(COLOR.NO_INICIADO.texto);
  });

  it('CERRADO y EN_PLAZO no comparten color: son cosas distintas', () => {
    // «Va a llegar» y «llegó» tienen que poder leerse aparte en la misma barra de estados.
    expect(COLOR.CERRADO.barra).not.toBe(COLOR.EN_PLAZO.barra);
  });

  it('cada estado trae su etiqueta escrita: el color nunca es el único portador', () => {
    for (const [estado, c] of Object.entries(COLOR)) {
      expect(c.etiqueta.trim()).not.toBe('');
      expect(c.etiqueta).not.toBe(estado);
    }
  });
});
