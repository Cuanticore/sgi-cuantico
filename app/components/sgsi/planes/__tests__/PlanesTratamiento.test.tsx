// app/components/sgsi/planes/__tests__/PlanesTratamiento.test.tsx
//
// ── EL DENOMINADOR DE LOS DOS KPI QUE NO CUENTAN TODO EL PLAN ────────────────────────────
//
// «Salto pendiente» y «Riesgos alcanzados» se calculan sólo sobre las acciones que tienen
// control: una póliza de ciberriesgo no mueve la madurez de nada y no contiene ninguna
// amenaza, así que aporta 0 a las dos. Eso es correcto — y la cifra se lee igual como si
// cubriera el plan entero.
//
// Es la misma forma de defecto que el acta de riesgo residual tuvo el 21/09: un denominador
// que sólo contaba los casos resolubles mostraba «0 / 0», y «0 / 0» se lee como «no queda
// nada por hacer». La cifra no miente; lo que miente es lo que uno cree que abarca.
//
// El denominador sólo aparece cuando los dos números difieren: decir «sobre 19 de 19» es
// ruido, y el ruido termina en que nadie lee el pie cuando sí dice algo.

import { render, screen } from '@testing-library/react';
import PlanesTratamiento, { type AccionVista } from '../PlanesTratamiento';

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

/// La póliza: sin control, así que no aporta ni salto ni riesgos alcanzados.
const POLIZA: AccionVista = {
  ...BASE,
  codigo: 'PT-002',
  accion: 'Adquirir póliza de ciberriesgo',
  tipo: 'TRANSFERIR',
  control: null,
  controlId: null,
  instrumento: 'Póliza de ciberriesgo 2027',
  riesgoRemanente: 'El deducible',
};

function montar(acciones: AccionVista[], alcanceCalculable = true) {
  render(
    <PlanesTratamiento
      acciones={acciones}
      alcanceCalculable={alcanceCalculable}
      controles={[{ id: 7, codigo: 'A.8.2', nombre: 'Derechos de acceso privilegiado' }]}
      cargos={[
        { id: 3, nombre: 'Gestión Tecnológica' },
        { id: 5, nombre: 'Líder del SIG' },
      ]}
      madurez={[{ id: 30, nivel: 90, nombre: 'Definido' }]}
    />,
  );
}

describe('el pie de los KPI dice sobre cuántas acciones se calculó', () => {
  it('con una acción sin control, el pie del salto nombra el denominador', () => {
    montar([BASE, { ...BASE, codigo: 'PT-003' }, POLIZA]);
    expect(screen.getByText(/Σ máx\(0, objetivo − actual\) · sobre 2 de 3 acciones/)).toBeInTheDocument();
  });

  it('con una acción sin control, el pie de los riesgos alcanzados también', () => {
    montar([BASE, { ...BASE, codigo: 'PT-003' }, POLIZA]);
    expect(screen.getByText(/sobre el inventario real · sobre 2 de 3 acciones/)).toBeInTheDocument();
  });

  it('cuando todas tienen control no se dice nada: «sobre 2 de 2» es ruido', () => {
    montar([BASE, { ...BASE, codigo: 'PT-003' }]);
    expect(screen.getByText('Σ máx(0, objetivo − actual)')).toBeInTheDocument();
    expect(screen.queryByText(/sobre \d+ de \d+ acciones/)).toBeNull();
  });

  it('sin el cruce control-amenaza no se agrega denominador a una cifra que no se calculó', () => {
    // «sin calcular · sobre 2 de 3 acciones» sería precisar el alcance de una cifra que no
    // existe. El pie ya dice qué falta, y eso es lo que hay que leer.
    montar([BASE, { ...BASE, codigo: 'PT-003' }, POLIZA], false);
    expect(screen.getByText('falta el cruce control-amenaza')).toBeInTheDocument();
  });
});

describe('el botón de crear', () => {
  it('«Acción nueva» va a la izquierda de «Importar FOR-SIG-13»', () => {
    // Es la acción principal de la pantalla; importar un FOR-SIG-13 es la excepcional.
    montar([BASE]);
    const nueva = screen.getByRole('button', { name: 'Acción nueva' });
    const importar = screen.getByRole('button', { name: 'Importar FOR-SIG-13' });
    expect(nueva.compareDocumentPosition(importar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('no abre ningún popup hasta que se pulsa', () => {
    montar([BASE]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
