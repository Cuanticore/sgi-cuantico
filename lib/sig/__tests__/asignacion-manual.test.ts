// lib/sig/__tests__/asignacion-manual.test.ts
//
// Asignar le abre trabajo a una persona y le corre un plazo. Los casos que importan son los
// que dejarían una asignación que nadie quiso: una que nace vencida, una cuyo título se
// escribió y el modelo ignora, o una sin motivo que dentro de seis meses no se puede
// explicar.

import { periodoDeFechaLimite, validarAsignacionManual } from '../asignacion-manual';

const HOY = new Date(Date.UTC(2026, 8, 18));

const base = {
  contenidoId: 4,
  titulo: null,
  descripcion: null,
  fechaLimite: '2026-10-31',
  motivo: 'ingreso fuera del periodo de inducción',
};

describe('validarAsignacionManual', () => {
  it('una asignación de contenido bien formada no tiene reparos', () => {
    expect(validarAsignacionManual(base, HOY)).toEqual([]);
  });

  it('una tarea puntual bien formada no tiene reparos', () => {
    expect(
      validarAsignacionManual(
        {
          ...base,
          contenidoId: null,
          titulo: 'Levantar el inventario del piso 3',
          descripcion: 'Recorrer y confirmar códigos contra el acta.',
        },
        HOY,
      ),
    ).toEqual([]);
  });

  // El modelo IGNORA el título cuando hay contenido (`prisma/schema.prisma`, Asignacion).
  // Aceptar los dos guardaría en silencio algo distinto de lo que se escribió, y quien lo
  // escribió creería que quedó.
  it('rechaza contenido y título a la vez, porque el título se perdería', () => {
    const errores = validarAsignacionManual({ ...base, titulo: 'Otra cosa' }, HOY);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/una cosa o la otra|no las dos/i);
  });

  it('rechaza cuando no hay ni contenido ni título', () => {
    const errores = validarAsignacionManual({ ...base, contenidoId: null }, HOY);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/contenido|título/i);
  });

  // El esquema pide título Y descripción cuando no hay contenido. Una tarea puntual con
  // título y sin descripción llega a la bandeja de alguien como un renglón sin decir qué hay
  // que hacer.
  it('una tarea puntual sin descripción se rechaza', () => {
    const errores = validarAsignacionManual(
      { ...base, contenidoId: null, titulo: 'Hacer algo', descripcion: '   ' },
      HOY,
    );
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/descripci/i);
  });

  it('rechaza una fecha límite anterior a hoy: nacería vencida', () => {
    const errores = validarAsignacionManual({ ...base, fechaLimite: '2026-09-17' }, HOY);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/vencida|ya pasó/i);
  });

  it('acepta que venza hoy mismo', () => {
    expect(validarAsignacionManual({ ...base, fechaLimite: '2026-09-18' }, HOY)).toEqual([]);
  });

  it('rechaza una fecha que no es una fecha', () => {
    expect(validarAsignacionManual({ ...base, fechaLimite: '' }, HOY)).toHaveLength(1);
    expect(validarAsignacionManual({ ...base, fechaLimite: '31/10/2026' }, HOY)).toHaveLength(1);
    expect(validarAsignacionManual({ ...base, fechaLimite: '2026-13-01' }, HOY)).toHaveLength(1);
  });

  it('exige motivo, y no le alcanza con espacios', () => {
    expect(validarAsignacionManual({ ...base, motivo: '' }, HOY)).toHaveLength(1);
    expect(validarAsignacionManual({ ...base, motivo: '   ' }, HOY)).toHaveLength(1);
  });

  // Los reparos se juntan: quien llena mal tres campos se entera de los tres de una vez, en
  // vez de descubrirlos de a uno por intento.
  it('devuelve todos los reparos juntos, no el primero', () => {
    const errores = validarAsignacionManual(
      { contenidoId: null, titulo: null, descripcion: null, fechaLimite: '2026-01-01', motivo: '' },
      HOY,
    );
    expect(errores.length).toBeGreaterThanOrEqual(3);
  });
});

describe('periodoDeFechaLimite', () => {
  // El `periodo` es la etiqueta legible que la bandeja y los reportes ya leen. Una
  // asignación manual usa el mes de su fecha límite, que es lo único que significa algo.
  it('es el mes de la fecha límite', () => {
    expect(periodoDeFechaLimite('2026-10-31')).toBe('2026-10');
    expect(periodoDeFechaLimite('2026-01-01')).toBe('2026-01');
  });

  it('no se inventa un periodo con una fecha que no es fecha', () => {
    expect(() => periodoDeFechaLimite('31/10/2026')).toThrow();
  });
});
