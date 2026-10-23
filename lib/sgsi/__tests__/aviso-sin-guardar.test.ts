// lib/sgsi/__tests__/aviso-sin-guardar.test.ts
//
// El panel de una amenaza es un modal: tapa el pie de la ficha, donde vive «Guardar N
// cambios». Quien cambia la madurez de un control ve moverse el residual y no tiene forma de
// saber que eso está PENDIENTE de guardar hasta que cierra el panel.
//
// El 29/09/2026 alguien preguntó, sobre producción, si eso guardaba solo. Aquel día no se
// guardaba de ninguna forma. Hoy sí, y la pregunta que queda es la siguiente: «¿ya quedó?».

import { avisoSinGuardar } from '../aviso-sin-guardar';

describe('avisoSinGuardar', () => {
  it('sin cambios no dice nada', () => {
    // Una insignia permanente enseña a no mirarla, y entonces tampoco se ve el día que importa.
    expect(avisoSinGuardar(0, false)).toBeNull();
  });

  it('con un cambio lo dice en singular', () => {
    expect(avisoSinGuardar(1, false)?.texto).toBe('1 cambio sin guardar · cierra este panel para guardarlo');
  });

  it('con varios, en plural', () => {
    expect(avisoSinGuardar(3, false)?.texto).toBe('3 cambios sin guardar · cierra este panel para guardarlos');
  });

  it('manda cerrar el panel, no pulsar Guardar', () => {
    // El botón está detrás del modal: decir «pulsa Guardar» sería mandar a alguien a un sitio
    // al que no puede llegar desde donde está.
    expect(avisoSinGuardar(2, false)?.texto).toContain('cierra este panel');
    expect(avisoSinGuardar(2, false)?.texto).not.toMatch(/pulsa|bot[óo]n/i);
  });

  it('mientras guarda, informa en vez de pedir', () => {
    const a = avisoSinGuardar(2, true);
    expect(a?.texto).toBe('Guardando…');
    expect(a?.enVuelo).toBe(true);
  });

  it('un número negativo no inventa un aviso', () => {
    // El control: si el contador llegara mal, el panel no debe afirmar que hay algo pendiente.
    expect(avisoSinGuardar(-1, false)).toBeNull();
  });
});
