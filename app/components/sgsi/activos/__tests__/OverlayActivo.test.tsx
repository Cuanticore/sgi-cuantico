// app/components/sgsi/activos/__tests__/OverlayActivo.test.tsx
//
// REQ-SIG-20 §6 (P3, D1) — el contrato de URL que abre la ficha de cualquier activo desde
// cualquier pantalla vía `?activo=<código>&tab=`.
//
// Tarea 3.1: un código que no existe avisa y no abre un overlay vacío — la pantalla de abajo
// queda intacta.
// Tarea 3.3: cerrar vuelve exactamente al origen — `router.replace` sin apilar historial,
// sin scrollear al techo, preservando los demás parámetros de la pantalla de abajo.
// Tarea 3.7: `?activo=…&tab=ecuacion` aterriza en Ecuación desde tres pantallas distintas, y
// el overlay renderiza literalmente la misma `FichaActivo` que la página completa — nunca
// una segunda ficha (comprobación estructural, no un comentario).

import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OverlayActivo from '../OverlayActivo';
import { abrirOverlayActivo, guardarDatosGenerales } from '@/app/sgsi/acciones/activos';
import type { ActivoFicha, AmenazaCatalogo, Catalogos } from '../FichaActivo';

const mockReplace = jest.fn();
const mockRefresh = jest.fn();
const mockPush = jest.fn();
let mockPathname = '/estrategico/riesgos';
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh, push: mockPush }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

// Las mismas exclusiones que FichaActivo.test.tsx: PopupCatalogo arrastra `next/cache` y
// media infraestructura de servidor que jsdom no arranca, y no es lo que se prueba acá.
jest.mock('@/app/components/sgsi/parametros/PopupCatalogo', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../PopupControlesAmenaza', () => ({
  __esModule: true,
  default: () => null,
}));

// Mismo motivo (REQ-SIG-20 §7, tarea 4.16): `PopupPlanCritico` importa `app/sgsi/acciones/
// plan.ts`, que también arrastra `next/cache`. La cola de críticos está vacía en estas
// pruebas — nunca se monta de verdad — así que llega cerrado como los otros dos.
jest.mock('../PopupPlanCritico', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/app/sgsi/acciones/activos', () => ({
  abrirOverlayActivo: jest.fn(),
  darDeBajaActivo: jest.fn(),
  guardarDatosGenerales: jest.fn(),
  guardarValoracion: jest.fn(),
}));

jest.mock('@/app/sgsi/acciones/riesgos', () => ({
  guardarSesionRiesgo: jest.fn(),
  guardarTratamiento: jest.fn(),
  quitarAmenazaDelActivo: jest.fn(),
  restaurarAmenaza: jest.fn(),
}));

const mockAbrirOverlayActivo = abrirOverlayActivo as jest.Mock;

const CATALOGOS: Catalogos = {
  catalogoNivel3: [],
  areas: [{ id: 1, nombre: 'Gestión Tecnológica', prefijo: 'TEC' }],
  tipos: [{ id: 1, codigo: 'GEN', nombre: 'General', abreviatura: 'GEN' }],
  subtipos: [{ id: 1, tipoId: 1, codigo: 'GEN.1', nombre: 'General' }],
  cargos: [],
  cargosPropietario: [],
  cargosCustodio: [],
  ubicaciones: [],
  entornos: [],
  proveedores: [],
  criticidades: [],
  personas: [],
  niveles: [],
  escalaValor: [
    { id: 5, valor: 5, etiqueta: '5 — Muy Alto' },
    { id: 4, valor: 4, etiqueta: '4 — Alto' },
  ],
  escalaDegradacion: [{ id: 1, nombre: 'Muy alta', factor: '1.00', lectura: null }],
  escalaFrecuencia: [{ id: 1, nombre: 'Alta — mensual', corto: 'Alta', vecesAno: '12' }],
  escalaMadurez: [],
  bandasImpacto: [{ nombre: 'Crítico', desde: '20', hasta: '100000', orden: 1, medio: 60 }],
  bandasRiesgo: [{ nombre: 'Crítico', desde: '25', hasta: '100000', orden: 1 }],
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
    codigo: 'A.24',
    nombre: 'Denegación de servicio',
    grupo: 'Grupo A',
    nota: null,
    frecuenciaId: 1,
    degradacion: { D: 1, I: 1, C: 1 },
    tipos: [1],
    controles: [],
  },
];

function activo(codigo: string): ActivoFicha {
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
    criticidadId: null,
    nivelId: null,
    datosCliente: 'POR_DEFINIR',
    datosPersonales: 'POR_DEFINIR',
    expuestoInternet: 'POR_DEFINIR',
    cantidad: 1,
    valores: { D: 5, I: 5, C: 5 },
    riesgos: [],
    amenazasExcluidas: [],
    planes: [],
    cuentas: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/estrategico/riesgos';
  mockSearchParams = new URLSearchParams();
});

describe('REQ-SIG-20 §6 (D1) · código inexistente (tarea 3.1)', () => {
  it('avisa y no abre un overlay vacío; la pantalla de abajo queda intacta', async () => {
    mockSearchParams = new URLSearchParams('activo=TEC-INEXISTENTE-9999');
    mockAbrirOverlayActivo.mockResolvedValue(null);

    render(
      <div>
        <p data-testid="pantalla-de-abajo">Filtros de la pantalla de abajo, intactos</p>
        <OverlayActivo />
      </div>,
    );

    expect(
      await screen.findByText(/TEC-INEXISTENTE-9999.*no corresponde a ningún activo/i),
    ).toBeInTheDocument();

    // Nunca se monta el diálogo grande de la ficha: un aviso no es un overlay vacío.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // La pantalla de abajo ni se desmonta ni pierde su estado.
    expect(screen.getByTestId('pantalla-de-abajo')).toBeInTheDocument();
    // Y no queda bloqueada para scrollear ni interactuar.
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('REQ-SIG-20 §6 (D1) · cerrar vuelve exactamente al origen (tarea 3.3)', () => {
  it('router.replace quita activo/tab, preserva el resto, sin scrollear y sin apilar historial', async () => {
    mockPathname = '/sgsi/planes';
    mockSearchParams = new URLSearchParams('proceso=TEC&activo=TEC-GEN-0004&tab=amenazas');
    mockAbrirOverlayActivo.mockResolvedValue({
      activo: activo('TEC-GEN-0004'),
      catalogos: CATALOGOS,
      amenazas: AMENAZAS,
    });

    render(<OverlayActivo />);

    const cerrar = await screen.findByRole('button', { name: 'Cerrar ficha' });
    fireEvent.click(cerrar);

    expect(mockReplace).toHaveBeenCalledWith('/sgsi/planes?proceso=TEC', { scroll: false });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('guardar dentro del overlay refresca la pantalla de abajo (router.refresh)', async () => {
    mockPathname = '/sgsi/planes';
    mockSearchParams = new URLSearchParams('activo=TEC-GEN-0004');
    mockAbrirOverlayActivo.mockResolvedValue({
      activo: activo('TEC-GEN-0004'),
      catalogos: CATALOGOS,
      amenazas: AMENAZAS,
    });
    (guardarDatosGenerales as jest.Mock).mockResolvedValue({
      ok: true,
      mensaje: 'Guardado.',
      cambios: 1,
    });

    render(<OverlayActivo />);

    const nombre = await screen.findByLabelText('Nombre del activo');
    fireEvent.change(nombre, { target: { value: 'Nombre editado desde el overlay' } });

    const botonGuardar = await screen.findByRole('button', { name: /Guardar \d+ cambio/ });
    fireEvent.click(botonGuardar);

    // `FichaActivo` no cambia para el overlay (D1: un componente, dos envoltorios): es la
    // misma llamada a `router.refresh()` que ya hace para la página completa, y acá refresca
    // lo que sea que esté montado debajo del overlay en ese momento.
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });
});

describe('REQ-SIG-20 §6 (D1) · deep link a Ecuación desde tres pantallas (tarea 3.7)', () => {
  it.each(['/sgsi/valoracion-riesgos', '/estrategico/riesgos', '/sgsi/planes'])(
    'con pathname %s, ?activo=TEC-GEN-0004&tab=ecuacion aterriza en Ecuación',
    async (pathname) => {
      mockPathname = pathname;
      mockSearchParams = new URLSearchParams('activo=TEC-GEN-0004&tab=ecuacion');
      mockAbrirOverlayActivo.mockResolvedValue({
        activo: activo('TEC-GEN-0004'),
        catalogos: CATALOGOS,
        amenazas: AMENAZAS,
      });

      render(<OverlayActivo />);

      const botonEcuacion = await screen.findByText('Ecuación', { selector: 'span' });
      await waitFor(() => {
        expect(botonEcuacion.closest('button')).toHaveAttribute('aria-current', 'page');
      });
    },
  );
});

describe('REQ-SIG-20 §6 (D1) · un componente, dos envoltorios (tarea 3.7)', () => {
  function extraerEspecificadorFichaActivo(rutaArchivo: string): string {
    const fuente = fs.readFileSync(rutaArchivo, 'utf8');
    const match = fuente.match(/import\s+FichaActivo\s*,?[^'"]*from\s+['"]([^'"]+)['"]/);
    if (match === null) {
      throw new Error(`No se encontró un import de FichaActivo en ${rutaArchivo}`);
    }
    return match[1];
  }

  function resolverEspecificador(especificador: string, archivoQueImporta: string): string {
    const base = especificador.startsWith('@/')
      ? path.join(process.cwd(), especificador.slice(2))
      : path.join(path.dirname(archivoQueImporta), especificador);
    return `${base}.tsx`;
  }

  it('OverlayActivo y la página completa importan el mismo archivo FichaActivo.tsx', () => {
    const rutaOverlay = path.join(
      process.cwd(),
      'app/components/sgsi/activos/OverlayActivo.tsx',
    );
    const rutaPagina = path.join(process.cwd(), 'app/sgsi/inventario/[codigo]/page.tsx');
    const rutaFichaActivo = path.join(
      process.cwd(),
      'app/components/sgsi/activos/FichaActivo.tsx',
    );

    const especOverlay = extraerEspecificadorFichaActivo(rutaOverlay);
    const especPagina = extraerEspecificadorFichaActivo(rutaPagina);

    expect(resolverEspecificador(especOverlay, rutaOverlay)).toBe(rutaFichaActivo);
    expect(resolverEspecificador(especPagina, rutaPagina)).toBe(rutaFichaActivo);
  });

  it('no existe una segunda ficha en el directorio de activos', () => {
    const dir = path.join(process.cwd(), 'app/components/sgsi/activos');
    const archivosFicha = fs
      .readdirSync(dir)
      .filter((f) => /ficha/i.test(f) && f.endsWith('.tsx'));
    expect(archivosFicha).toEqual(['FichaActivo.tsx']);
  });
});
