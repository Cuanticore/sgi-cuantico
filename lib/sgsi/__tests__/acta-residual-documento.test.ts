// lib/sgsi/__tests__/acta-residual-documento.test.ts

import { actaResidualHtml, type DatosActaResidual } from '../acta-residual-documento';
import type { FilaAlcance, FirmanteProceso } from '../alcance-residual';

const ALTO: FilaAlcance = {
  activoId: 1,
  codigo: 'TEC-SRV-0001',
  nombre: 'Servidor de aplicaciones',
  areaId: 1,
  proceso: 'Tecnología',
  banda: 'Alto',
  cifra: '4.5',
};

const CRITICO: FilaAlcance = {
  activoId: 2,
  codigo: 'TEC-BDD-0002',
  nombre: 'Base de datos de clientes',
  areaId: 1,
  proceso: 'Tecnología',
  banda: 'Crítico',
  cifra: '8.1',
};

const RESOLUBLE: FirmanteProceso = {
  areaId: 1,
  proceso: 'Tecnología',
  cargoId: 10,
  cargoNombre: 'Líder de Tecnología',
  candidatos: [{ id: 100, nombre: 'Ana Ruiz' }],
  resoluble: true,
  activos: 2,
};

function datos(p: Partial<DatosActaResidual> = {}): DatosActaResidual {
  return {
    codigo: 'ARR-2026-001',
    periodo: '2026',
    generadaEn: '2026-09-16',
    generadaPor: 'Daniel Medina',
    alcanceHash: 'a'.repeat(64),
    sinCalcular: 0,
    filas: [],
    firmantes: [],
    ...p,
  };
}

describe('actaResidualHtml', () => {
  it('separa las excepciones al criterio de los activos en banda Alta', () => {
    const html = actaResidualHtml(datos({ filas: [ALTO, CRITICO] }));
    expect(html).toContain('Excepciones al criterio de aceptación');
    expect(html).toContain('Activos en banda Alta');
    expect(html).toContain('TEC-BDD-0002');
    expect(html).toContain('TEC-SRV-0001');
  });

  it('sin activos críticos no imprime la sección de excepciones', () => {
    const html = actaResidualHtml(datos({ filas: [ALTO] }));
    expect(html).not.toContain('Excepciones al criterio de aceptación');
  });

  it('dice en el acta cuántos activos quedaron sin calcular', () => {
    const html = actaResidualHtml(datos({ filas: [ALTO], sinCalcular: 12 }));
    expect(html).toContain('sin calcular');
    expect(html).toContain('>12<');
  });

  // Un acta que no lo dice se lee como si cubriera todo el inventario.
  it('cuando no hay activos sin calcular lo dice igual, con un cero', () => {
    const html = actaResidualHtml(datos({ filas: [ALTO], sinCalcular: 0 }));
    expect(html).toContain('sin calcular');
    expect(html).toContain('>0<');
  });

  it('rotula los procesos sin firmante resoluble en la hoja de firmas', () => {
    const html = actaResidualHtml(
      datos({
        filas: [ALTO],
        firmantes: [
          { ...RESOLUBLE, cargoId: null, cargoNombre: null, candidatos: [], resoluble: false },
        ],
      }),
    );
    expect(html).toContain('Sin firmante resoluble');
  });

  it('nombra a los candidatos cuando el proceso sí es resoluble', () => {
    const html = actaResidualHtml(datos({ filas: [ALTO], firmantes: [RESOLUBLE] }));
    expect(html).toContain('Ana Ruiz');
    expect(html).not.toContain('Sin firmante resoluble');
  });

  it('imprime la huella del alcance en la constancia', () => {
    const html = actaResidualHtml(datos({ alcanceHash: 'b'.repeat(64) }));
    expect(html).toContain('b'.repeat(64));
  });

  it('escapa el HTML de los nombres', () => {
    const html = actaResidualHtml(
      datos({ filas: [{ ...ALTO, nombre: '<script>alert(1)</script>' }] }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
