// app/components/sgsi/valoracion-riesgos/__tests__/PantallaAnalisisRiesgos.test.tsx
//
// REQ-SIG-20 §5 (P4, D7) — tarea 3.10 (la pantalla) y 3.13 (visitar no escribe nada).
//
// Tarea 3.10: la pantalla renderiza las filas del fixture, las tarjetas y la lista nunca se
// contradicen bajo un filtro, y una fila enlaza al overlay de la tarea 3.2 sobre Amenazas sin
// salir de la página.
//
// Tarea 3.13: «visitar no escribe nada» se prueba en dos capas. Esta pantalla no importa NINGÚN
// módulo de acciones — la comprobación estructural de abajo lo confirma leyendo el propio
// código fuente, el mismo criterio que `OverlayActivo.test.tsx` usó para «un componente, dos
// envoltorios» — y la consulta del servidor (`analisis-riesgos.query.ts`) no llama a ningún
// método de escritura de Prisma, comprobado en `analisis-riesgos.query.test.ts`.

import fs from 'fs';
import path from 'path';
import { render, screen, within } from '@testing-library/react';
import PantallaAnalisisRiesgos from '../PantallaAnalisisRiesgos';
import type { ActivoAnalizable } from '@/lib/sgsi/analisis-riesgos';
import type { UmbralRiesgo } from '@/lib/sgsi/riesgo-activo';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

const BANDAS: UmbralRiesgo[] = [
  { nombre: 'Crítico', desde: '20', hasta: '999999', orden: 1 },
  { nombre: 'Alto', desde: '10', hasta: '19.9999', orden: 2 },
  { nombre: 'Medio', desde: '4', hasta: '9.9999', orden: 3 },
  { nombre: 'Bajo', desde: '0', hasta: '3.9999', orden: 4 },
];

function activo(p: Partial<ActivoAnalizable> = {}): ActivoAnalizable {
  return {
    codigo: 'TEC-GEN-0001',
    nombre: 'Activo de prueba',
    valor: 5,
    criticidad: null,
    proceso: 'Gestión Tecnológica',
    propietario: 'Chief Operating Officer',
    persona: null,
    personaCorreo: null,
    riesgos: [
      {
        amenazaCodigo: 'A.24',
        amenazaNombre: 'Denegación de servicio',
        potencial: '25',
        residual: '25',
        obsoleto: false,
      },
    ],
    ...p,
  };
}

const ACTIVOS: ActivoAnalizable[] = [
  activo({ codigo: 'TEC-EQU-0003', valor: 5, proceso: 'Gestión Tecnológica' }),
  activo({
    codigo: 'TEC-GEN-0004',
    valor: 4,
    proceso: 'Gestión Financiera',
    riesgos: [
      { amenazaCodigo: 'A.11', amenazaNombre: 'Acceso no autorizado', potencial: '12', residual: '12', obsoleto: false },
    ],
  }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
});

describe('REQ-SIG-20 §5 · la pantalla renderiza lo que el fixture trae (tarea 3.10)', () => {
  it('muestra las dos filas y la tarjeta EN ANÁLISIS coincide con la lista', () => {
    render(
      <PantallaAnalisisRiesgos
        activos={ACTIVOS}
        bandas={BANDAS}
        umbral={4}
        procesos={['Gestión Tecnológica', 'Gestión Financiera']}
        propietarios={['Chief Operating Officer']}
        personas={[]}
      />,
    );

    expect(screen.getByText('TEC-EQU-0003')).toBeInTheDocument();
    expect(screen.getByText('TEC-GEN-0004')).toBeInTheDocument();

    const tarjetaEnAnalisis = screen.getByRole('button', { name: /EN ANÁLISIS/ });
    expect(within(tarjetaEnAnalisis).getByText('2')).toBeInTheDocument();
    expect(screen.getByText('2 activos · orden por peor residual')).toBeInTheDocument();
  });

  it('la fila enlaza al overlay en Amenazas sin salir de la página (reusa la tarea 3.2)', () => {
    render(
      <PantallaAnalisisRiesgos
        activos={ACTIVOS}
        bandas={BANDAS}
        umbral={4}
        procesos={['Gestión Tecnológica', 'Gestión Financiera']}
        propietarios={['Chief Operating Officer']}
        personas={[]}
      />,
    );

    const enlace = screen.getByRole('link', { name: 'TEC-EQU-0003' });
    expect(enlace).toHaveAttribute('href', expect.stringContaining('activo=TEC-EQU-0003'));
    expect(enlace).toHaveAttribute('href', expect.stringContaining('tab=amenazas'));
  });

  it('la tarjeta SIN PLAN muestra «—» y no 0: la Fase 4 no existe todavía', () => {
    render(
      <PantallaAnalisisRiesgos
        activos={ACTIVOS}
        bandas={BANDAS}
        umbral={4}
        procesos={['Gestión Tecnológica', 'Gestión Financiera']}
        propietarios={['Chief Operating Officer']}
        personas={[]}
      />,
    );
    const tarjetaSinPlan = screen.getByRole('button', { name: /SIN PLAN/ });
    expect(within(tarjetaSinPlan).getByText('—')).toBeInTheDocument();
    expect(within(tarjetaSinPlan).getByText('disponible en la Fase 4')).toBeInTheDocument();
  });
});

describe('REQ-SIG-20 §5 · un componente que no escribe (tarea 3.13)', () => {
  it('la pantalla no importa ningún módulo de acciones del servidor', () => {
    const ruta = path.join(process.cwd(), 'app/components/sgsi/valoracion-riesgos/PantallaAnalisisRiesgos.tsx');
    const fuente = fs.readFileSync(ruta, 'utf8');
    expect(fuente).not.toMatch(/from ['"]@\/app\/sgsi\/acciones/);
  });
});
