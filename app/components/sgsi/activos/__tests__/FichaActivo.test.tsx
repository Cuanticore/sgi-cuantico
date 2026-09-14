// app/components/sgsi/activos/__tests__/FichaActivo.test.tsx
//
// REQ-SIG-20 §3.1 (D-2, D-5) · gating de la valoración de riesgos: un activo bajo el umbral
// no calcula, no muestra filas y no cuenta riesgos en la insignia; las pestañas Amenazas y
// Matrices quedan visibles y deshabilitadas, con el motivo al pasar por encima. Un activo
// que sí alcanza el umbral sigue calculando y mostrando sus amenazas con normalidad.

import { render, screen } from '@testing-library/react';
import FichaActivo, {
  type ActivoFicha,
  type AmenazaCatalogo,
  type Catalogos,
  type Navegacion,
} from '../FichaActivo';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
}));

jest.mock('@/app/sgsi/acciones/activos', () => ({
  darDeBajaActivo: jest.fn(),
  guardarDatosGenerales: jest.fn(),
  guardarValoracion: jest.fn(),
}));

jest.mock('@/app/sgsi/acciones/riesgos', () => ({
  excepcionDegradacion: jest.fn(),
  excepcionFrecuencia: jest.fn(),
  guardarTratamiento: jest.fn(),
  quitarAmenazaDelActivo: jest.fn(),
  restaurarAmenaza: jest.fn(),
}));

// El popup del catálogo arrastra `next/cache` y con él media infraestructura de servidor,
// que en jsdom no arranca. No es lo que se prueba acá y llega cerrado, igual que
// PopupImportacion en InventarioActivos.test.tsx.
jest.mock('@/app/components/sgsi/parametros/PopupCatalogo', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../PopupControlesAmenaza', () => ({
  __esModule: true,
  default: () => null,
}));

const CATALOGOS: Catalogos = {
  areas: [{ id: 1, nombre: 'Gestión Tecnológica', prefijo: 'TEC' }],
  tipos: [{ id: 1, codigo: 'GEN', nombre: 'General', abreviatura: 'GEN' }],
  subtipos: [{ id: 1, tipoId: 1, codigo: 'GEN.1', nombre: 'General' }],
  cargos: [],
  cargosPropietario: [],
  cargosCustodio: [],
  ubicaciones: [],
  entornos: [],
  proveedores: [],
  escalaValor: [
    { id: 5, valor: 5, etiqueta: '5 — Muy Alto' },
    { id: 4, valor: 4, etiqueta: '4 — Alto' },
    { id: 3, valor: 3, etiqueta: '3 — Medio' },
    { id: 2, valor: 2, etiqueta: '2 — Bajo' },
    { id: 1, valor: 1, etiqueta: '1 — Muy Bajo' },
    { id: 0, valor: 0, etiqueta: '0 — Irrelevante' },
  ],
  escalaDegradacion: [{ id: 1, nombre: 'Muy alta', factor: '1.00', lectura: null }],
  escalaFrecuencia: [{ id: 1, nombre: 'Alta — mensual', corto: 'Alta', vecesAno: '12' }],
  escalaMadurez: [],
  bandasImpacto: [
    { nombre: 'Crítico', desde: '20', hasta: '100000', orden: 1, medio: 60 },
    { nombre: 'Bajo', desde: '0', hasta: '19.999', orden: 2, medio: 10 },
  ],
  bandasRiesgo: [
    { nombre: 'Crítico', desde: '25', hasta: '100000', orden: 1 },
    { nombre: 'Bajo', desde: '0', hasta: '24.999', orden: 2 },
  ],
  tratamientos: [],
  estados: [],
  contadores: [],
  activos: [],
  umbralValoracion: 4,
  deltaTechoEficacia: 0.05,
};

const AMENAZAS: AmenazaCatalogo[] = [
  {
    id: 1,
    codigo: 'A.1',
    nombre: 'Amenaza de prueba',
    grupo: 'Grupo A',
    nota: null,
    frecuenciaId: 1,
    degradacion: { D: 1, I: 1, C: 1 },
    tipos: [1],
    controles: [],
  },
];

function activo(codigo: string, valor: number): ActivoFicha {
  return {
    id: 1,
    codigo,
    codigoHeredado: null,
    nombre: `Activo ${codigo}`,
    descripcion: null,
    areaId: 1,
    tipoId: 1,
    subtipoId: 1,
    propietarioId: null,
    custodioId: null,
    ubicacionId: null,
    entornoId: null,
    proveedorId: null,
    superiorId: null,
    datosCliente: 'POR_DEFINIR',
    datosPersonales: 'POR_DEFINIR',
    expuestoInternet: 'POR_DEFINIR',
    cantidad: 1,
    valores: { D: valor, I: valor, C: valor },
    riesgos: [],
    amenazasExcluidas: [],
  };
}

const NAVEGACION: Navegacion = { codigos: ['TEC-GEN-0001'] };

describe('REQ-SIG-20 §3.1 · gating por umbral (D-2, D-5)', () => {
  it('un activo de valor 3 no deriva, cuenta cero en la insignia y las pestañas quedan deshabilitadas con el motivo', () => {
    render(
      <FichaActivo
        activo={activo('TEC-GEN-0001', 3)}
        catalogos={CATALOGOS}
        amenazas={AMENAZAS}
        navegacion={NAVEGACION}
        pestanaInicial="amenazas"
      />,
    );

    // La pasada de derivación no corrió: ninguna fila de amenaza, y el mensaje de la
    // pestaña vacía es el que se ve cuando `filas` está realmente vacío.
    expect(screen.queryByText('A.1')).not.toBeInTheDocument();
    expect(screen.getByText('Ninguna amenaza cumple el filtro actual.')).toBeInTheDocument();

    // La insignia de Amenazas no cuenta: dice «no requiere», nunca un número.
    const botonAmenazas = screen.getByText('Amenazas', { selector: 'span' }).closest('button')!;
    expect(botonAmenazas).toHaveTextContent('no requiere');
    expect(botonAmenazas).toBeDisabled();

    // Y dice por qué: el valor, el umbral y su fuente, con el puntero a Valoración.
    expect(botonAmenazas.title).toMatch(/vale 3/);
    expect(botonAmenazas.title).toMatch(/arranca en 4/);
    expect(botonAmenazas.title).toMatch(/Parametro\.umbral_valoracion/);
    expect(botonAmenazas.title).toMatch(/Valoración/);

    const botonResumen = screen
      .getByText('Resumen del activo', { selector: 'span' })
      .closest('button')!;
    expect(botonResumen).toBeDisabled();
  });

  it('un activo de valor 5 sí deriva y muestra al menos una fila', () => {
    render(
      <FichaActivo
        activo={activo('TEC-GEN-0002', 5)}
        catalogos={CATALOGOS}
        amenazas={AMENAZAS}
        navegacion={{ codigos: ['TEC-GEN-0002'] }}
        pestanaInicial="amenazas"
      />,
    );

    expect(screen.getByText('A.1')).toBeInTheDocument();

    const botonAmenazas = screen.getByText('Amenazas', { selector: 'span' }).closest('button')!;
    expect(botonAmenazas).toHaveTextContent('1 riesgos');
    expect(botonAmenazas).not.toBeDisabled();

    const botonResumen = screen
      .getByText('Resumen del activo', { selector: 'span' })
      .closest('button')!;
    expect(botonResumen).not.toBeDisabled();
  });
});
