// app/components/sgsi/inventario/__tests__/InventarioActivos.test.tsx
//
// El §7.1 de REQ-SIG-18 en su punto de contacto: que la pantalla LEA de veras los parámetros y
// que los ESCRIBA de vuelta. La traducción URL ⇄ filtros y el predicado están probados en
// `lib/sgsi/__tests__/inventario-filtros.test.ts`, que es donde vive la decisión; lo que no se
// puede probar ahí es que el componente los tenga enchufados, y eso es justo lo que estaba roto:
// el módulo no existía y el componente arrancaba en `FILTROS_VACIOS` ignorando la URL.
//
// El criterio 7 del §10 pide además abrir la URL **directamente en el navegador**. Eso no se
// prueba acá: `useSearchParams` está simulado. Lo que se prueba es que el primer render ya llega
// filtrado, que es la mitad que depende del código.

import { render, screen } from '@testing-library/react';
import InventarioActivos, { type ActivoVista } from '../InventarioActivos';
import type { DimensionActiva } from '@/lib/sgsi/valoracion-agregada';

const reemplazos: string[] = [];
let consulta = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (url: string) => reemplazos.push(url),
    refresh: () => {},
    push: () => {},
  }),
  useSearchParams: () => new URLSearchParams(consulta),
}));

jest.mock('@/app/sgsi/acciones/activos', () => ({
  guardarValoracion: jest.fn(),
}));

// El popup de importación arrastra `next/cache` y con él media infraestructura de servidor, que
// en jsdom no arranca. No es lo que se prueba acá y llega cerrado.
jest.mock('@/app/components/sgsi/inventario/PopupImportacion', () => ({
  __esModule: true,
  default: () => null,
}));

const DIMENSIONES: DimensionActiva[] = [
  { codigo: 'D', nombre: 'Disponibilidad' },
  { codigo: 'I', nombre: 'Integridad' },
  { codigo: 'C', nombre: 'Confidencialidad' },
];

const ESCALA = [
  { valor: 5, etiqueta: '5 — Muy Alto' },
  { valor: 4, etiqueta: '4 — Alto' },
  { valor: 3, etiqueta: '3 — Medio' },
  { valor: 2, etiqueta: '2 — Bajo' },
  { valor: 1, etiqueta: '1 — Muy Bajo' },
  { valor: 0, etiqueta: '0 — Irrelevante' },
];

const BANDAS = [
  { nombre: 'Crítico', desde: '25', hasta: '100000', orden: 1 },
  { nombre: 'Alto', desde: '5', hasta: '24.999', orden: 2 },
  { nombre: 'Medio', desde: '0.5', hasta: '4.999', orden: 3 },
  { nombre: 'Bajo', desde: '0', hasta: '0.499', orden: 4 },
];

function activo(p: Partial<ActivoVista> & { codigo: string }): ActivoVista {
  const D = p.D ?? 3;
  const I = p.I ?? 3;
  const C = p.C ?? 3;
  return {
    codigoHeredado: null,
    nombre: `Activo ${p.codigo}`,
    proceso: 'Tecnología',
    tipo: '[SW] Aplicaciones',
    subtipo: 'SW.1 Estándar',
    propietario: 'CEO',
    custodio: null,
    persona: null,
    personaCorreo: null,
    proveedor: null,
    nivel1: null,
    nivel2: null,
    nivel3: null,
    riesgos: [],
    ...p,
    D,
    I,
    C,
    valores: p.valores ?? { D, I, C },
  };
}

const ACTIVOS: ActivoVista[] = [
  activo({ codigo: 'A-01', propietario: 'CEO', custodio: 'Líder del SIG', D: 4, I: 2, C: 2 }),
  activo({ codigo: 'A-02', propietario: 'CEO', D: 2, I: 2, C: 4 }),
  activo({ codigo: 'A-03', propietario: 'Líder del SIG', D: 1, I: 1, C: 1 }),
  activo({
    codigo: 'A-04',
    propietario: 'Líder del SIG',
    persona: 'Juan Felipe Ruiz',
    personaCorreo: 'jruiz@cuantico.co',
    D: 3,
    I: 3,
    C: 3,
  }),
];

function pintar() {
  return render(
    <InventarioActivos
      activos={ACTIVOS}
      escala={ESCALA}
      bandas={BANDAS}
      umbralValoracion={4}
      dimensiones={DIMENSIONES}
    />,
  );
}

/// El contador del encabezado dice cuántos activos quedaron. Es la cifra que el criterio 6 del
/// §10 compara con la celda de la pantalla de Valoración.
function visibles(): number {
  return Number(screen.getByText(/^\d+ activos? · \d+ grupos?$/).textContent!.split(' ')[0]);
}

beforeEach(() => {
  reemplazos.length = 0;
  consulta = '';
});

describe('§7.1 · el primer render ya llega filtrado', () => {
  it('sin parámetros muestra el inventario entero', () => {
    pintar();
    expect(visibles()).toBe(ACTIVOS.length);
  });

  it('propietario filtra solo por propietario (§7.4)', () => {
    consulta = 'propietario=CEO';
    pintar();
    expect(visibles()).toBe(2);
  });

  it('responsable sigue aceptando propietario O custodio, sin cambios (D-4)', () => {
    consulta = 'responsable=Líder del SIG';
    pintar();
    // A-01 lo tiene como CUSTODIO, A-03 y A-04 como propietario.
    expect(visibles()).toBe(3);
  });

  it('valor filtra por el máximo cuando no viaja dimension (§7.2)', () => {
    consulta = 'valor=4';
    pintar();
    expect(visibles()).toBe(2);
  });

  it('dimension acota el valor a esa dimensión (§7.3)', () => {
    consulta = 'dimension=C&valor=4';
    pintar();
    expect(visibles()).toBe(1);
  });

  it('valorMinimo no es lo mismo que valor', () => {
    consulta = 'valorMinimo=3';
    pintar();
    expect(visibles()).toBe(3);
  });

  it('los parámetros se acumulan: es la intersección (§8)', () => {
    consulta = 'propietario=CEO&dimension=C&valor=4';
    pintar();
    expect(visibles()).toBe(1);
  });

  it('persona filtra por correo y conPersona acota a los entregados (§7.5)', () => {
    consulta = 'persona=jruiz%40cuantico.co';
    pintar();
    expect(visibles()).toBe(1);
    // Dos veces: el rótulo del filtro, que está siempre, y el encabezado de la columna, que
    // aparece solo cuando el filtro está puesto.
    expect(screen.getAllByText('CUSTODIO PERSONA').length).toBe(2);
    // El nombre sale dos veces: la opción del desplegable, que se rotula con el nombre y vale el
    // correo, y la celda del único activo que quedó.
    expect(screen.getAllByText('Juan Felipe Ruiz').length).toBe(2);
    expect(screen.getByRole('option', { name: 'Juan Felipe Ruiz' })).toHaveValue(
      'jruiz@cuantico.co',
    );
  });

  it('conPersona=1 deja solo los que tienen custodio persona', () => {
    consulta = 'conPersona=1';
    pintar();
    expect(visibles()).toBe(1);
  });

  it('persona=__sin__ deja los que no están entregados a nadie', () => {
    consulta = 'persona=__sin__';
    pintar();
    expect(visibles()).toBe(3);
  });

  it('la columna de la persona no aparece si el filtro no está puesto', () => {
    pintar();
    // Solo queda el rótulo del filtro: la columna costaría 150 px para decir «sin custodio
    // persona» en los 299 activos.
    expect(screen.getAllByText('CUSTODIO PERSONA').length).toBe(1);
  });
});

describe('§7.1 · un parámetro que no se puede honrar se avisa, no se descarta en silencio', () => {
  it('avisa del propietario que no está en el inventario y muestra todo', () => {
    consulta = 'propietario=Chief Legal Officer';
    pintar();
    expect(visibles()).toBe(ACTIVOS.length);
    expect(screen.getByRole('status').textContent).toMatch(/Chief Legal Officer/);
  });

  it('avisa de la dimensión inactiva y cae al valor del activo', () => {
    consulta = 'dimension=A&valor=4';
    pintar();
    expect(visibles()).toBe(2);
    expect(screen.getByRole('status').textContent).toMatch(/no existe o no está activa/);
  });

  it('avisa cuando valor y valorMinimo vienen juntos, y gana valor', () => {
    consulta = 'valor=4&valorMinimo=1';
    pintar();
    expect(visibles()).toBe(2);
    expect(screen.getByRole('status').textContent).toMatch(/valorMinimo/);
  });

  it('sin avisos no se dibuja la caja', () => {
    consulta = 'propietario=CEO';
    pintar();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('§7.1 · el estado se refleja de vuelta en la URL', () => {
  it('el primer render no navega: la URL ya dice lo que el estado dice', () => {
    consulta = 'propietario=CEO';
    pintar();
    expect(reemplazos).toEqual([]);
  });
});
