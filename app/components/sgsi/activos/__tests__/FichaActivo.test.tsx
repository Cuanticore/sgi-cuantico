// app/components/sgsi/activos/__tests__/FichaActivo.test.tsx
//
// REQ-SIG-20 §3.1 (D-2, D-5) · gating de la valoración de riesgos: un activo bajo el umbral
// no calcula, no muestra filas y no cuenta riesgos en la insignia; las pestañas Amenazas y
// Matrices quedan visibles y deshabilitadas, con el motivo al pasar por encima. Un activo
// que sí alcanza el umbral sigue calculando y mostrando sus amenazas con normalidad.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FichaActivo, {
  type ActivoFicha,
  type AmenazaCatalogo,
  type Catalogos,
  type Navegacion,
} from '../FichaActivo';
import { guardarSesionRiesgo, guardarTratamiento } from '@/app/sgsi/acciones/riesgos';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
}));

jest.mock('@/app/sgsi/acciones/activos', () => ({
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

// Mismo motivo (REQ-SIG-20 §7, tarea 4.16): `PopupPlanCritico` importa `app/sgsi/acciones/
// plan.ts`, que también arrastra `next/cache`. Acá SÍ se observa qué props recibe — la
// cola de críticos (tarea 4.16) es justo lo que se prueba en el describe de abajo — pero
// el componente real nunca se monta, para no arrastrar esa infraestructura de servidor.
jest.mock('../PopupPlanCritico', () => ({
  __esModule: true,
  default: ({
    activoCodigo,
    amenazaCodigo,
    onCerrar,
  }: {
    activoCodigo: string;
    amenazaCodigo: string;
    onCerrar: () => void;
    onRegistrado?: (codigo: string) => void;
  }) => (
    <div>
      <span>{`PopupPlanCritico: ${activoCodigo} · ${amenazaCodigo}`}</span>
      <button onClick={onCerrar}>cerrar-critico</button>
    </div>
  ),
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
  criticidades: [
    { id: 1, codigo: 'C1', nombre: 'Crítica continua', rtoMinutos: 10, rpoMinutos: 5 },
    { id: 4, codigo: 'C4', nombre: 'Estándar', rtoMinutos: 4320, rpoMinutos: 1440 },
  ],
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
    criticidadId: null,
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

describe('REQ-SIG-20 §11.3 (tarea 4.7) · aviso de coherencia criticidad/disponibilidad', () => {
  it('C1 con D = 3 muestra el aviso, sin bloquear el guardado', () => {
    render(
      <FichaActivo
        activo={{ ...activo('TEC-GEN-0010', 3), criticidadId: 1 }}
        catalogos={CATALOGOS}
        amenazas={AMENAZAS}
        navegacion={{ codigos: ['TEC-GEN-0010'] }}
      />,
    );
    expect(screen.getByText(/exige una recuperación rápida/)).toBeInTheDocument();
    // No hay ningún control deshabilitado por el aviso: D17 dice «avisa, no bloquea».
    expect(screen.getByLabelText('Nombre del activo')).toBeEnabled();
  });

  it('D = 5 con C4 no muestra ningún aviso: son declaraciones distintas y compatibles', () => {
    render(
      <FichaActivo
        activo={{ ...activo('TEC-GEN-0011', 5), criticidadId: 4 }}
        catalogos={CATALOGOS}
        amenazas={AMENAZAS}
        navegacion={{ codigos: ['TEC-GEN-0011'] }}
      />,
    );
    expect(screen.queryByText(/exige una recuperación rápida/)).not.toBeInTheDocument();
  });
});

describe('REQ-SIG-20 D3 (tarea 2.4) · aritmética en vivo en Amenazas', () => {
  const CATALOGOS_CON_DOS_DEGRADACIONES: Catalogos = {
    ...CATALOGOS,
    escalaDegradacion: [
      { id: 1, nombre: 'Muy alta', factor: '1.00', lectura: null },
      { id: 2, nombre: 'Media', factor: '0.50', lectura: null },
    ],
  };

  const AMENAZA_CON_CONTROLES: AmenazaCatalogo = {
    id: 1,
    codigo: 'A.24',
    nombre: 'Denegación de servicio',
    grupo: 'Grupo A',
    nota: null,
    frecuenciaId: 1,
    degradacion: { D: 1, I: 1, C: 1 },
    tipos: [1],
    controles: [
      {
        codigo: 'A.8.20',
        nombre: 'Protección contra DoS',
        nivel: 3,
        soa: 'si',
        peso: 1,
        esPrincipal: false,
        // Las 272 filas de `ControlAmenaza` tienen `relevanciaId` en null hoy (Open Item 6).
        relevancia: null,
        evidencia: '',
      },
      {
        codigo: 'A.8.6',
        nombre: 'Gestión de la capacidad',
        nivel: 3,
        soa: 'si',
        peso: 1,
        esPrincipal: false,
        relevancia: null,
        evidencia: '',
      },
    ],
  };

  function activoConValores(codigo: string, valores: { D: number; I: number; C: number }): ActivoFicha {
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
      datosCliente: 'POR_DEFINIR',
      datosPersonales: 'POR_DEFINIR',
      expuestoInternet: 'POR_DEFINIR',
      cantidad: 1,
      valores,
      riesgos: [],
      amenazasExcluidas: [],
    };
  }

  it('cambiar el combo de degradación actualiza el paréntesis y el impacto en vivo, antes de guardar', () => {
    render(
      <FichaActivo
        activo={activoConValores('TEC-GEN-0004', { D: 5, I: 3, C: 2 })}
        catalogos={CATALOGOS_CON_DOS_DEGRADACIONES}
        amenazas={[AMENAZA_CON_CONTROLES]}
        navegacion={{ codigos: ['TEC-GEN-0004'] }}
        pestanaInicial="amenazas"
      />,
    );

    // Abrir la fila — la aritmética en vivo está en el detalle expandido.
    fireEvent.click(screen.getByText('A.24').closest('[role="button"]')!);

    // El impacto arranca en 5 — lo pone la dimensión D (5 × 1.00), que hoy es la mayor.
    expect(screen.getByText('D: (5 × 1) = 5')).toBeInTheDocument();
    expect(screen.getByText('impacto = max(…) = 5')).toBeInTheDocument();

    // Bajar la degradación de D a Media (factor 0.50).
    fireEvent.change(screen.getByLabelText('Degradación en Disponibilidad de A.24'), {
      target: { value: '2' },
    });

    // El paréntesis de D y el impacto máximo se actualizan los dos: ahora I (3 × 1.00 = 3)
    // manda, no D (5 × 0.50 = 2.5) — la prueba de que "impacto = max(...)" recalcula en vivo.
    expect(screen.getByText('D: (5 × 0.5) = 2,5')).toBeInTheDocument();
    expect(screen.getByText('impacto = max(…) = 3')).toBeInTheDocument();

    // Y nada de esto disparó ninguna acción de guardado: es un what-if, no una escritura.
    expect(guardarTratamiento).not.toHaveBeenCalled();
  });

  it('sin relevancia asignada en los controles, el paso 5 avisa junto a la eficacia (Open Item 6)', () => {
    render(
      <FichaActivo
        activo={activoConValores('TEC-GEN-0005', { D: 5, I: 5, C: 5 })}
        catalogos={CATALOGOS_CON_DOS_DEGRADACIONES}
        amenazas={[AMENAZA_CON_CONTROLES]}
        navegacion={{ codigos: ['TEC-GEN-0005'] }}
        pestanaInicial="amenazas"
      />,
    );

    fireEvent.click(screen.getByText('A.24').closest('[role="button"]')!);

    expect(screen.getByText(/Sin relevancia asignada/)).toBeInTheDocument();
  });
});

describe('REQ-SIG-20 §10 (D5, tareas 4.14-4.15) · diálogo de notas de fin de sesión', () => {
  const CATALOGOS_SESION: Catalogos = {
    ...CATALOGOS,
    escalaDegradacion: [
      { id: 1, nombre: 'Muy alta', factor: '1.00', lectura: null },
      { id: 2, nombre: 'Media', factor: '0.50', lectura: null },
    ],
    escalaFrecuencia: [
      { id: 1, nombre: 'Alta — mensual', corto: 'Alta', vecesAno: '12' },
      { id: 2, nombre: 'Media — trimestral', corto: 'Media', vecesAno: '4' },
    ],
  };

  const AMENAZA_R0001: AmenazaCatalogo = {
    id: 1,
    codigo: 'A.24',
    nombre: 'Denegación de servicio',
    grupo: 'Grupo A',
    nota: null,
    frecuenciaId: 1,
    degradacion: { D: 1, I: 1, C: 1 },
    tipos: [1],
    controles: [],
  };

  function activoConRiesgo(): ActivoFicha {
    return {
      id: 1,
      codigo: 'TEC-GEN-0004',
      codigoHeredado: null,
      nombre: 'Activo TEC-GEN-0004',
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
      datosCliente: 'POR_DEFINIR',
      datosPersonales: 'POR_DEFINIR',
      expuestoInternet: 'POR_DEFINIR',
      cantidad: 1,
      valores: { D: 5, I: 5, C: 5 },
      riesgos: [
        {
          codigo: 'R-0001',
          amenazaId: 1,
          impacto: null,
          riesgoPotencial: null,
          frecuenciaResidual: null,
          riesgoResidual: null,
          frecuenciaId: null,
          madurezId: null,
          tratamientoId: null,
          estadoId: null,
          responsableId: null,
          observacion: null,
          justificacion: null,
          origen: 'PARAMETRIZACION',
          degradacion: [],
        },
      ],
      amenazasExcluidas: [],
    };
  }

  const mockGuardarSesionRiesgo = guardarSesionRiesgo as jest.Mock;

  beforeEach(() => {
    mockGuardarSesionRiesgo.mockReset();
    mockGuardarSesionRiesgo.mockResolvedValue({
      ok: true,
      mensaje: 'Se guardaron 2 campos de R-0001, con la nota registrada.',
      cambios: 2,
    });
  });

  it('dos cambios de sesión abren un único diálogo con las dos filas; nota vacía no confirma (spec "Dialog lists the pending changes", "Empty note blocks the save")', async () => {
    render(
      <FichaActivo
        activo={activoConRiesgo()}
        catalogos={CATALOGOS_SESION}
        amenazas={[AMENAZA_R0001]}
        navegacion={{ codigos: ['TEC-GEN-0004'] }}
        pestanaInicial="amenazas"
      />,
    );

    // Dos cambios de sesión: una degradación y una frecuencia. Ninguno pide su propia
    // justificación — spec "Changes accumulate without prompting": no aparece ningún
    // diálogo por campo acá, sólo al guardar.
    fireEvent.change(screen.getByLabelText('Degradación en Disponibilidad de A.24'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Frecuencia esperada de A.24'), {
      target: { value: '2' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Guardar 2 cambios/ }));

    expect(screen.getByText('Notas de la sesión')).toBeInTheDocument();
    expect(screen.getByText(/Degradación D — A\.24/)).toBeInTheDocument();
    expect(screen.getByText(/Frecuencia — A\.24/)).toBeInTheDocument();

    // Nota vacía: confirmar queda deshabilitado y no llama a guardarSesionRiesgo — el
    // único bloqueo deliberado de D17 en este cambio.
    const confirmar = screen.getByRole('button', { name: 'Confirmar y guardar' });
    expect(confirmar).toBeDisabled();
    fireEvent.click(confirmar);
    expect(mockGuardarSesionRiesgo).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByLabelText('Notas — qué cambió en la realidad y por qué'),
      { target: { value: 'Ajuste tras revisión de servidores' } },
    );
    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);

    // El diálogo se cierra apenas se confirma, sin esperar la respuesta del servidor.
    expect(screen.queryByText('Notas de la sesión')).not.toBeInTheDocument();

    await waitFor(() => expect(mockGuardarSesionRiesgo).toHaveBeenCalledTimes(1));
    expect(mockGuardarSesionRiesgo).toHaveBeenCalledWith(
      'R-0001',
      { degradacion: { D: 2 }, frecuenciaId: 2 },
      'Ajuste tras revisión de servidores',
    );
  });

  it('residual crítico abre el popup prellenado sin condicionar el guardado (D4, tarea 4.16 — spec "Save succeeds, popup opens")', async () => {
    mockGuardarSesionRiesgo.mockResolvedValue({
      ok: true,
      mensaje: 'Se guardó 1 campo de R-0001, con la nota registrada.',
      cambios: 1,
      critico: { activoCodigo: 'TEC-GEN-0004', amenazaCodigo: 'A.24' },
    });

    render(
      <FichaActivo
        activo={activoConRiesgo()}
        catalogos={CATALOGOS_SESION}
        amenazas={[AMENAZA_R0001]}
        navegacion={{ codigos: ['TEC-GEN-0004'] }}
        pestanaInicial="amenazas"
      />,
    );

    fireEvent.change(screen.getByLabelText('Frecuencia esperada de A.24'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar 1 cambio/ }));
    fireEvent.change(
      screen.getByLabelText('Notas — qué cambió en la realidad y por qué'),
      { target: { value: 'Sube la frecuencia' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }));

    // D17: el guardado en sí no espera nada del popup — YA se llamó a guardarSesionRiesgo
    // apenas se confirmó la nota. El popup crítico es una consecuencia, no una condición.
    await waitFor(() => expect(mockGuardarSesionRiesgo).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText('PopupPlanCritico: TEC-GEN-0004 · A.24'),
    ).toBeInTheDocument();

    // Cerrar sin registrar saca el crítico de la cola — no queda ningún popup pendiente.
    fireEvent.click(screen.getByRole('button', { name: 'cerrar-critico' }));
    expect(screen.queryByText('PopupPlanCritico: TEC-GEN-0004 · A.24')).not.toBeInTheDocument();
  });
});
