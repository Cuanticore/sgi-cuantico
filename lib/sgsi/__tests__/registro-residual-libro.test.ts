// lib/sgsi/__tests__/registro-residual-libro.test.ts

import { filasDelRegistro, type RenglonRegistro } from '../registro-residual-libro';

const BASE: RenglonRegistro = {
  codigo: 'TEC-SRV-0001',
  nombre: 'Servidor de aplicaciones',
  proceso: 'Tecnología',
  banda: 'Alto',
  cifra: '4.5',
  planCodigo: 'PT-014',
  firmante: 'Ana Ruiz',
  fechaFirma: '2026-09-20',
};

describe('filasDelRegistro', () => {
  // Una celda vacía en un registro que se archiva no distingue «nadie firmó» de «se nos
  // olvidó llenarlo». La palabra sí.
  it('dice «pendiente de firma» y no vacío cuando el proceso no ha firmado', () => {
    const [f] = filasDelRegistro([{ ...BASE, firmante: null, fechaFirma: null }]);
    expect(f.firmante).toBe('Pendiente de firma');
    expect(f.fechaFirma).toBe('');
  });

  it('conserva el plan citado, y pone una raya cuando no hay', () => {
    expect(filasDelRegistro([BASE])[0].planCodigo).toBe('PT-014');
    expect(filasDelRegistro([{ ...BASE, planCodigo: null }])[0].planCodigo).toBe('—');
  });

  it('marca la banda Crítica como excepción al criterio', () => {
    const [f] = filasDelRegistro([{ ...BASE, banda: 'Crítico' }]);
    expect(f.observacion).toContain('Excepción');
  });

  it('no marca excepción en banda Alta', () => {
    expect(filasDelRegistro([BASE])[0].observacion).toBe('');
  });

  it('conserva el orden que recibe', () => {
    const filas = filasDelRegistro([
      { ...BASE, codigo: 'A-1' },
      { ...BASE, codigo: 'A-2' },
    ]);
    expect(filas.map((f) => f.codigo)).toEqual(['A-1', 'A-2']);
  });
});
