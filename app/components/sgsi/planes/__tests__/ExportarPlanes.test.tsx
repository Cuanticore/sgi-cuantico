// app/components/sgsi/planes/__tests__/ExportarPlanes.test.tsx
//
// El botón «Exportar» de la cabecera y lo único que decide: QUÉ le pide a la ruta.
//
// ── POR QUÉ ESTO SE PRUEBA ACÁ Y LA RUTA NO ─────────────────────────────────────────────
//
// La ruta necesita sesión, permiso y Prisma; montar un simulacro de las tres daría sensación
// de cobertura sin probar nada. Lo que SÍ se puede probar, y es donde vive la decisión, es el
// enlace: qué códigos manda la pantalla y con qué filtro dice que los eligió. Si el enlace
// miente, el archivo miente — y eso se ve desde acá, en milisegundos.
//
// ── EL CASO DE CERO FILAS NO ES TEÓRICO ─────────────────────────────────────────────────
//
// `9cd892c` arregló exactamente este defecto en el export del inventario: exportar con cero
// filas visibles bajaba los 378 activos, porque «sin códigos» se leía como «sin filtro». Acá
// la distinción es entre el parámetro AUSENTE (sin filtro: bajan todas) y el parámetro
// PRESENTE Y VACÍO (el filtro no dejó pasar ninguna: no baja ninguna).

import { fireEvent, render, screen } from '@testing-library/react';
import PlanesTratamiento, {
  pasaFiltroPlanes,
  type AccionVista,
} from '../PlanesTratamiento';

jest.mock('@/app/sgsi/acciones/plan', () => ({
  cambiarEstadoAccion: jest.fn(),
  darDeBajaAccion: jest.fn(),
  restaurarAccion: jest.fn(),
  guardarAccion: jest.fn(),
  crearAccionLibre: jest.fn(),
}));

jest.mock('@/app/sgsi/acciones/importar-planes', () => ({
  importarPlanes: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const BASE: AccionVista = {
  codigo: 'PT-001',
  accion: 'Elevar el control de acceso privilegiado',
  tipo: 'MITIGAR',
  origen: 'Brecha de madurez de A.8.2.',
  responsable: 'Gestión Tecnológica',
  aprueba: 'Líder del SIG',
  fechaObjetivo: '2027-06-30',
  fechaAprobacion: null,
  fechaCierre: null,
  estado: 'NO_INICIADA',
  avance: 0,
  verificacion: 'PENDIENTE',
  observacion: null,
  recursos: null,
  madurezAlcanzada: null,
  justificacionAceptacion: null,
  control: {
    codigo: 'A.8.2',
    nombre: 'Derechos de acceso privilegiado',
    capacidad: 'Gestión de identidad',
    lineaBase: 50,
    actual: 50,
    objetivo: 90,
  },
  alcance: null,
  controlId: 7,
  responsableId: 3,
  apruebaId: 5,
  madurezAlcanzadaId: null,
  instrumento: null,
  riesgoRemanente: null,
  fechaRevisionAceptacion: null,
};

const CERRADA: AccionVista = { ...BASE, codigo: 'PT-002', estado: 'CERRADA' };
const POLIZA: AccionVista = {
  ...BASE,
  codigo: 'PT-003',
  tipo: 'TRANSFERIR',
  estado: 'EN_EJECUCION',
  control: null,
  controlId: null,
};

function montar(acciones: AccionVista[] = [BASE, CERRADA, POLIZA]) {
  render(
    <PlanesTratamiento
      acciones={acciones}
      alcanceCalculable
      controles={[{ id: 7, codigo: 'A.8.2', nombre: 'Derechos de acceso privilegiado' }]}
      cargos={[
        { id: 3, nombre: 'Gestión Tecnológica' },
        { id: 5, nombre: 'Líder del SIG' },
      ]}
      madurez={[{ id: 30, nivel: 90, nombre: 'Definido' }]}
    />,
  );
}

function enlaceExportar(): HTMLAnchorElement {
  return screen.getByRole('link', { name: 'Exportar' }) as HTMLAnchorElement;
}

/// El `href` es relativo; `URL` necesita una base para poder leerle los parámetros.
function destino(): URL {
  return new URL(enlaceExportar().getAttribute('href') ?? '', 'http://x');
}

function filtrar(valor: string): void {
  fireEvent.change(screen.getByRole('combobox', { name: /filtrar/i }), { target: { value: valor } });
}

describe('el botón «Exportar» de la cabecera', () => {
  it('está junto a «Importar FOR-SIG-13», después de él', () => {
    montar();
    const importar = screen.getByRole('button', { name: 'Importar FOR-SIG-13' });
    const exportar = enlaceExportar();
    expect(importar.compareDocumentPosition(exportar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('dice en su título qué baja: dos hojas, los riesgos altos y las acciones', () => {
    montar();
    const titulo = enlaceExportar().getAttribute('title') ?? '';
    expect(titulo).toMatch(/dos hojas/i);
    expect(titulo).toMatch(/riesgos altos/i);
    expect(titulo).toMatch(/acciones/i);
  });

  it('pide la descarga al navegador en vez de abrirla', () => {
    montar();
    expect(enlaceExportar()).toHaveAttribute('download');
  });
});

describe('qué le pide el enlace a la ruta', () => {
  it('apunta a /api/sgsi/exportar-planes', () => {
    montar();
    expect(destino().pathname).toBe('/api/sgsi/exportar-planes');
  });

  it('sin filtro no manda códigos: bajan todas las acciones activas, incluidas las que esta pestaña todavía no vio', () => {
    montar();
    expect(destino().searchParams.has('codigos')).toBe(false);
    expect(destino().searchParams.has('filtro')).toBe(false);
  });

  it('con un filtro puesto manda los códigos visibles y el filtro en palabras', () => {
    montar();
    filtrar('CERRADA');
    const url = destino();
    expect(url.searchParams.get('codigos')).toBe('PT-002');
    expect(url.searchParams.get('filtro')).toBe('Cerrada');
  });

  it('el href cambia al cambiar el desplegable', () => {
    montar();
    filtrar('CERRADA');
    const cerrada = enlaceExportar().getAttribute('href');
    filtrar('MITIGAR');
    expect(enlaceExportar().getAttribute('href')).not.toBe(cerrada);
    expect(destino().searchParams.get('filtro')).toBe('Solo mitigar');
    expect(destino().searchParams.get('codigos')).toBe('PT-001,PT-002');
  });

  it('con cero acciones visibles manda «codigos» VACÍO, no lo omite', () => {
    // Omitirlo diría «sin filtro» y bajaría el plan entero: es el defecto de `9cd892c` con
    // otra ropa.
    montar([POLIZA]);
    filtrar('CERRADA');
    const url = destino();
    expect(url.searchParams.has('codigos')).toBe(true);
    expect(url.searchParams.get('codigos')).toBe('');
  });
});

describe('pasaFiltroPlanes · el predicado que decide qué se ve y qué se exporta', () => {
  const mitigarCerrada = { tipo: 'MITIGAR', estado: 'CERRADA' };
  const aceptarEnCurso = { tipo: 'ACEPTAR', estado: 'EN_EJECUCION' };
  const transferirSinIniciar = { tipo: 'TRANSFERIR', estado: 'NO_INICIADA' };

  it('«todas» deja pasar todo', () => {
    for (const a of [mitigarCerrada, aceptarEnCurso, transferirSinIniciar]) {
      expect(pasaFiltroPlanes(a, 'todas')).toBe(true);
    }
  });

  it('los tres estados miran el ESTADO, no el tipo', () => {
    expect(pasaFiltroPlanes(mitigarCerrada, 'CERRADA')).toBe(true);
    expect(pasaFiltroPlanes(aceptarEnCurso, 'CERRADA')).toBe(false);
    expect(pasaFiltroPlanes(aceptarEnCurso, 'EN_EJECUCION')).toBe(true);
    expect(pasaFiltroPlanes(transferirSinIniciar, 'NO_INICIADA')).toBe(true);
    expect(pasaFiltroPlanes(mitigarCerrada, 'NO_INICIADA')).toBe(false);
  });

  it('los dos tipos miran el TIPO, no el estado', () => {
    // `ACEPTAR` es tipo y no estado: preguntarle por el estado dejaría pasar cero filas
    // siempre, en silencio.
    expect(pasaFiltroPlanes(mitigarCerrada, 'MITIGAR')).toBe(true);
    expect(pasaFiltroPlanes(aceptarEnCurso, 'MITIGAR')).toBe(false);
    expect(pasaFiltroPlanes(aceptarEnCurso, 'ACEPTAR')).toBe(true);
    expect(pasaFiltroPlanes(transferirSinIniciar, 'ACEPTAR')).toBe(false);
  });
});
