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
import { guardarDatosGenerales, guardarValoracion } from '@/app/sgsi/acciones/activos';

// `replace` se observa: cuando el guardado reemite el código, la ficha tiene que mudarse a
// la URL nueva. Un objeto nuevo por llamada no se puede afirmar, así que el router es uno
// solo y sus métodos son espías.
const router = { replace: jest.fn(), refresh: jest.fn(), push: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => router,
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
    {
      id: 1,
      codigo: 'C1',
      nombre: 'Crítica continua',
      rtoMinutos: 10,
      rpoMinutos: 5,
      descripcion: 'Multi-región activo-activo, o conmutación automática probada.',
    },
    {
      id: 4,
      codigo: 'C4',
      nombre: 'Estándar',
      rtoMinutos: 4320,
      rpoMinutos: 1440,
      descripcion: 'Respaldo diario, restauración bajo demanda.',
    },
  ],
  // E1 · una rama completa: raíz → nivel 2 → nivel 3. Es lo mínimo para que los tres
  // selects de la cabecera se encadenen de verdad y no sólo se dibujen.
  personas: [],
  niveles: [
    // `clase` sólo en la raíz: los grados 2 y 3 la heredan subiendo por `padreId`. Si se
    // guardara en los tres, un hijo podría contradecir a su padre.
    { id: 10, grado: 1, nombre: 'PRODUCTOS', padreId: null, clase: 'PRODUCTOS' as const, activo: true },
    { id: 20, grado: 2, nombre: 'MINTRACE', padreId: 10, clase: null, activo: true },
    { id: 30, grado: 3, nombre: 'Ambientes', padreId: 20, clase: null, activo: true },
  ],
  catalogoNivel3: [{ clase: 'PRODUCTOS' as const, nombre: 'CÓDIGO FUENTE', orden: 1 }],
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
    nivelId: null,
    datosCliente: 'POR_DEFINIR',
    datosPersonales: 'POR_DEFINIR',
    expuestoInternet: 'POR_DEFINIR',
    cantidad: 1,
    valores: { D: valor, I: valor, C: valor },
    riesgos: [],
    amenazasExcluidas: [],
    planes: [],
    cuentas: [],
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
        nivel: 90,
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
        nivel: 90,
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
      nivelId: null,
      datosCliente: 'POR_DEFINIR',
      datosPersonales: 'POR_DEFINIR',
      expuestoInternet: 'POR_DEFINIR',
      cantidad: 1,
      valores,
      riesgos: [],
      amenazasExcluidas: [],
      planes: [],
      cuentas: [],
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

  // REQ-SIG-20 §7.2 · el plan del riesgo, desde la amenaza. El vínculo plan↔riesgo no es
  // una columna: lo resuelve el servidor leyendo el prefijo de `AccionPlan.origen` y llega
  // en `activo.planes`. Acá se fija lo que decide la pantalla: con plan enlaza al plan
  // concreto; sin plan ofrece crearlo SOLO desde la banda Crítico, que es la que obliga a
  // planificar. Nunca las dos cosas a la vez.
  //
  // Los mismos dos controles, en L0 en vez de L3: sin eficacia que reste, el residual se
  // queda pegado al inherente (5 × 12 = 60) y cae en banda Crítico.
  const AMENAZA_CRITICA: AmenazaCatalogo = {
    ...AMENAZA_CON_CONTROLES,
    controles: AMENAZA_CON_CONTROLES.controles.map((c) => ({ ...c, nivel: 0 })),
  };

  it('en banda Crítico y sin plan, ofrece crearlo', () => {
    render(
      <FichaActivo
        activo={activoConValores('TEC-GEN-0006', { D: 5, I: 5, C: 5 })}
        catalogos={CATALOGOS_CON_DOS_DEGRADACIONES}
        amenazas={[AMENAZA_CRITICA]}
        navegacion={{ codigos: ['TEC-GEN-0006'] }}
        pestanaInicial="amenazas"
      />,
    );

    fireEvent.click(screen.getByText('A.24').closest('[role="button"]')!);

    expect(screen.getByRole('button', { name: '+ Crear plan de acción' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver plan/ })).not.toBeInTheDocument();
  });

  it('fuera de la banda Crítico no ofrece registrar plan, ni apagado', () => {
    // Los controles en L3 dejan el residual en 6 — banda Bajo. Este riesgo no exige plan,
    // así que no se ofrece: un botón deshabilitado invitaría a preguntarse qué falta para
    // encenderlo, y no falta nada.
    render(
      <FichaActivo
        activo={activoConValores('TEC-GEN-0008', { D: 5, I: 5, C: 5 })}
        catalogos={CATALOGOS_CON_DOS_DEGRADACIONES}
        amenazas={[AMENAZA_CON_CONTROLES]}
        navegacion={{ codigos: ['TEC-GEN-0008'] }}
        pestanaInicial="amenazas"
      />,
    );

    fireEvent.click(screen.getByText('A.24').closest('[role="button"]')!);

    expect(screen.queryByRole('button', { name: '+ Crear plan de acción' })).not.toBeInTheDocument();
  });

  it('un plan que ya existe se enseña aunque el riesgo ya no sea Crítico', () => {
    const conPlan: ActivoFicha = {
      ...activoConValores('TEC-GEN-0007', { D: 5, I: 5, C: 5 }),
      planes: [
        {
          amenazaCodigo: 'A.24',
          codigo: 'PT-001',
          accion: 'Segunda región en espera tibia',
          estado: 'EN_CURSO',
        },
      ],
    };

    render(
      <FichaActivo
        activo={conPlan}
        catalogos={CATALOGOS_CON_DOS_DEGRADACIONES}
        amenazas={[AMENAZA_CON_CONTROLES]}
        navegacion={{ codigos: ['TEC-GEN-0007'] }}
        pestanaInicial="amenazas"
      />,
    );

    fireEvent.click(screen.getByText('A.24').closest('[role="button"]')!);

    // Con los controles en L3 el residual es 6 — banda Bajo — y el enlace aparece igual:
    // puede haber bajado justamente porque el plan funcionó, y esconderlo ahí dejaría sin
    // rastro al plan que lo logró.
    // El ancla lleva hasta la fila del plan; sin ella el enlace dejaba a la persona en la
    // cabecera de una lista de noventa y tres.
    const enlace = screen.getByRole('link', { name: /Ver plan PT-001/ });
    expect(enlace).toHaveAttribute('href', '/sgsi/planes#PT-001');
    expect(
      screen.queryByRole('button', { name: '+ Crear plan de acción' }),
    ).not.toBeInTheDocument();
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
      nivelId: null,
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
      planes: [],
      cuentas: [],
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

// ===========================================================================
// REQ-SIG-21 §7 · los controles, agrupados por relevancia
// ===========================================================================
//
// La tabla listaba los controles en una sola tira plana y ponía la relevancia como un texto
// gris al lado del nombre. Con siete controles eso no se lee: no se ve cuál es el que manda,
// ni cuántos acompañan, ni por qué la eficacia dio lo que dio. El reparto 70/20/10 estaba
// calculado desde REQ-SIG-21 y no se veía por ninguna parte de esta pestaña.
//
// Se agrupa por CLASE, con el nombre del catálogo —Principal, Complementario, De apoyo— y no
// con el de la fórmula. Ver `lib/sgsi/__tests__/clases-relevancia.test.ts`.

describe('REQ-SIG-21 §7 · la tabla de controles va agrupada por relevancia', () => {
  const AMENAZA_CLASIFICADA: AmenazaCatalogo = {
    id: 1,
    codigo: 'A.24',
    nombre: 'Denegación de servicio',
    grupo: 'Grupo A',
    nota: null,
    frecuenciaId: 1,
    degradacion: { D: 1, I: 1, C: 1 },
    tipos: [1],
    controles: [
      // A propósito DESORDENADOS: el orden de llegada es el del catálogo, y la pantalla
      // tiene que reagruparlos ella. Si el test los diera ya ordenados, pasaría aunque la
      // pantalla no agrupara nada.
      {
        codigo: 'A.5.26',
        nombre: 'Respuesta a los incidentes de seguridad de la información',
        nivel: 90,
        soa: 'si',
        peso: 1,
        esPrincipal: false,
        relevancia: 'De apoyo',
        evidencia: '',
      },
      {
        codigo: 'A.8.14',
        nombre: 'Redundancia de las instalaciones de tratamiento de la información',
        nivel: 70,
        soa: 'si',
        peso: 3,
        esPrincipal: true,
        relevancia: 'Principal',
        evidencia: '',
      },
      {
        codigo: 'A.8.6',
        nombre: 'Gestión de la capacidad',
        nivel: 90,
        soa: 'si',
        peso: 2,
        esPrincipal: false,
        relevancia: 'Complementario',
        evidencia: '',
      },
    ],
  };

  function abrirAmenaza(amenaza: AmenazaCatalogo) {
    render(
      <FichaActivo
        activo={activo('TEC-GEN-0004', 5)}
        catalogos={CATALOGOS}
        amenazas={[amenaza]}
        navegacion={{ codigos: ['TEC-GEN-0004'] }}
        pestanaInicial="amenazas"
      />,
    );
    fireEvent.click(screen.getByText(amenaza.codigo).closest('[role="button"]')!);
  }

  it('cada clase tiene su encabezado, con el nombre del catálogo y su presupuesto', () => {
    abrirAmenaza(AMENAZA_CLASIFICADA);

    // «Complementario» es el 20 % y «De apoyo» el 10 %, que es como los nombra el selector
    // con el que se clasifica. La clase interna de la fórmula —`secundario`— no sale a
    // pantalla en ninguna parte.
    expect(screen.getByRole('group', { name: /Principal/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Complementario/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /De apoyo/ })).toBeInTheDocument();
    expect(screen.queryByText(/SECUNDARIO/)).not.toBeInTheDocument();

    expect(screen.getByRole('group', { name: /Principal/ })).toHaveTextContent('70%');
    expect(screen.getByRole('group', { name: /Complementario/ })).toHaveTextContent('20%');
    expect(screen.getByRole('group', { name: /De apoyo/ })).toHaveTextContent('10%');
  });

  it('cada control queda DENTRO de su grupo, no sólo debajo del encabezado', () => {
    abrirAmenaza(AMENAZA_CLASIFICADA);

    // Un `getByText` suelto pasaría aunque los tres controles siguieran en una tira plana.
    // Lo que se fija acá es la contención: el principal está en el grupo del principal.
    expect(screen.getByRole('group', { name: /Principal/ })).toHaveTextContent('A.8.14');
    expect(screen.getByRole('group', { name: /Complementario/ })).toHaveTextContent('A.8.6');
    expect(screen.getByRole('group', { name: /De apoyo/ })).toHaveTextContent('A.5.26');

    expect(screen.getByRole('group', { name: /Principal/ })).not.toHaveTextContent('A.5.26');
    expect(screen.getByRole('group', { name: /De apoyo/ })).not.toHaveTextContent('A.8.14');
  });

  it('los grupos van en orden de presupuesto: primero el que más pesa', () => {
    abrirAmenaza(AMENAZA_CLASIFICADA);

    const etiquetas = screen
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-label') ?? '')
      .filter((e) => /Principal|Complementario|De apoyo/.test(e));

    expect(etiquetas[0]).toMatch(/Principal/);
    expect(etiquetas[1]).toMatch(/Complementario/);
    expect(etiquetas[2]).toMatch(/De apoyo/);
  });

  it('un control sin relevancia cae en «sin clasificar», que no es un cuarto presupuesto', () => {
    // Puede pasar: `relevanciaId` es nullable y asociar un control desde el popup no obliga a
    // clasificarlo. Meterlo en cualquiera de las tres clases le inventaría un peso, y dejarlo
    // fuera de la tabla lo escondería. Va aparte y se dice.
    abrirAmenaza({
      ...AMENAZA_CLASIFICADA,
      controles: [
        ...AMENAZA_CLASIFICADA.controles,
        {
          codigo: 'A.5.30',
          nombre: 'Preparación de las TIC para la continuidad del negocio',
          nivel: 50,
          soa: 'si',
          peso: 1,
          esPrincipal: false,
          relevancia: null,
          evidencia: '',
        },
      ],
    });

    const sinClasificar = screen.getByRole('group', { name: /Sin clasificar/i });
    expect(sinClasificar).toHaveTextContent('A.5.30');
    expect(sinClasificar).not.toHaveTextContent('%');
  });
});

// El proceso o área, el tipo MAGERIT y el subtipo entran al mismo `datos` que el resto de la
// ficha, pero el contador de cambios se tomaba ANTES de que ellos llegaran. Los dos tests de
// abajo miran las dos caras de eso: el botón que no se enciende, y —peor— el cambio que se
// pierde sin decir nada cuando algo más sí encendió el botón.
describe('REQ-SIG-01 §3 · el cambio de clasificación cuenta como cambio pendiente', () => {
  // Tres procesos a propósito: dos prefijos distintos y DOS que comparten el mismo. El
  // código se reemite por lo que DICE, no por el id del área, así que mover el activo
  // entre los dos «TEC» no tiene que reemitir nada.
  const CATALOGOS_AREAS: Catalogos = {
    ...CATALOGOS,
    areas: [
      { id: 1, nombre: 'Gestión Tecnológica', prefijo: 'TEC' },
      { id: 2, nombre: 'Gestión Estratégica', prefijo: 'EST' },
      { id: 3, nombre: 'Infraestructura', prefijo: 'TEC' },
    ],
  };

  const mockGuardarDatosGenerales = guardarDatosGenerales as jest.Mock;
  const mockGuardarValoracion = guardarValoracion as jest.Mock;

  beforeEach(() => {
    mockGuardarDatosGenerales.mockReset();
    mockGuardarDatosGenerales.mockResolvedValue({
      ok: true,
      mensaje: 'Se guardaron los datos generales.',
    });
    mockGuardarValoracion.mockReset();
    mockGuardarValoracion.mockResolvedValue({ ok: true, mensaje: 'Se guardó la valoración.' });
    router.replace.mockReset();
    router.refresh.mockReset();
  });

  function ficha() {
    return render(
      <FichaActivo
        activo={activo('TEC-GEN-0020', 5)}
        catalogos={CATALOGOS_AREAS}
        amenazas={AMENAZAS}
        navegacion={{ codigos: ['TEC-GEN-0020'] }}
      />,
    );
  }

  it('mover el activo de proceso enciende el botón de guardar', () => {
    ficha();

    fireEvent.change(screen.getByLabelText('PROCESO O ÁREA'), { target: { value: '2' } });

    expect(screen.getByRole('button', { name: 'Guardar 1 cambio' })).toBeEnabled();
  });

  it('el proceso llega al servidor aunque lo acompañe un cambio que no es de datos generales', async () => {
    ficha();

    fireEvent.change(screen.getByLabelText('PROCESO O ÁREA'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Disponibilidad'), { target: { value: '4' } });

    fireEvent.click(screen.getByRole('button', { name: /^Guardar \d+ cambios?$/ }));

    await waitFor(() => expect(mockGuardarValoracion).toHaveBeenCalledTimes(1));
    expect(mockGuardarDatosGenerales).toHaveBeenCalledWith('TEC-GEN-0020', { areaId: 2 });
  });

  it('mover el activo a un proceso de otro prefijo avisa que el código se reemite, y en qué serie', () => {
    ficha();

    fireEvent.change(screen.getByLabelText('PROCESO O ÁREA'), { target: { value: '2' } });

    const aviso = screen.getByText('AL GUARDAR').closest('div')!;
    expect(aviso).toHaveTextContent('la serie EST-GEN');
    expect(aviso).toHaveTextContent('TEC-GEN-0020 queda retirado');
    // Lo que el aviso decía hasta hoy, y que el servidor dejó de cumplir hace dos commits.
    expect(aviso).not.toHaveTextContent('El código no cambia');
  });

  it('cuando el guardado reemite el código, la ficha se muda a la URL nueva', async () => {
    mockGuardarDatosGenerales.mockResolvedValue({
      ok: true,
      mensaje: 'Se guardó 1 campo. El código se reemitió: TEC-GEN-0020 → EST-GEN-0007.',
      codigoNuevo: 'EST-GEN-0007',
    });
    ficha();

    fireEvent.change(screen.getByLabelText('PROCESO O ÁREA'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Guardar \d+ cambios?$/ }));

    await waitFor(() => expect(mockGuardarDatosGenerales).toHaveBeenCalledTimes(1));
    // Sin esto la barra de direcciones se queda en un código retirado, que sólo resuelve
    // porque `cargarActivo` lo rescata por la bitácora. Funcionar por el rescate no es
    // funcionar.
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/sgsi/inventario/EST-GEN-0007'),
    );
  });

  it('un guardado que NO reemite el código se queda donde está', async () => {
    ficha();

    fireEvent.change(screen.getByLabelText('PROCESO O ÁREA'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^Guardar \d+ cambios?$/ }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('mover el activo a un proceso del MISMO prefijo no reemite nada, y el aviso lo dice', () => {
    ficha();

    fireEvent.change(screen.getByLabelText('PROCESO O ÁREA'), { target: { value: '3' } });

    const aviso = screen.getByText('AL GUARDAR').closest('div')!;
    expect(aviso).toHaveTextContent('El código no cambia');
    expect(aviso).not.toHaveTextContent('se reemite');
  });

  // En el alta no hay código que retirar: el de la cabecera es una previsualización que ya
  // se recalcula sola al cambiar el proceso. Un aviso de «al guardar» hablando de reemisión
  // —o negándola— ahí sólo puede confundir.
  it('en el alta el aviso de clasificación no aparece', () => {
    render(
      <FichaActivo
        activo={null}
        catalogos={CATALOGOS_AREAS}
        amenazas={AMENAZAS}
        navegacion={{ codigos: [] }}
      />,
    );

    fireEvent.change(screen.getByLabelText('PROCESO O ÁREA'), { target: { value: '2' } });

    expect(screen.queryByText('AL GUARDAR')).not.toBeInTheDocument();
  });
});

describe('El selector de Nivel 3 ofrece el catálogo, y no crea nada hasta guardar', () => {
  // EL DEFECTO QUE ESTE BLOQUE EXISTE PARA IMPEDIR. El selector ofrecía sólo los nodos que ya
  // colgaban del Nivel 2, así que un activo de código fuente en una rama que todavía no lo
  // tuviera obligaba a salir a `/tecnologia/niveles` a crear el nodo y volver.
  //
  // La regla de QUÉ se ofrece vive en `lib/sig/catalogo-nivel-3.ts` y se prueba ahí, sin montar
  // nada. Lo que se prueba acá es lo que sólo se ve montando: que elegir del catálogo **no
  // dispara ninguna acción**, y que al guardar viaja como `nivelNuevo` y no como `nivelId`.

  const mockGuardarDatosGenerales = guardarDatosGenerales as jest.Mock;

  beforeEach(() => {
    mockGuardarDatosGenerales.mockReset();
    mockGuardarDatosGenerales.mockResolvedValue({ ok: true, mensaje: 'Listo.' });
    router.replace.mockReset();
    router.refresh.mockReset();
  });

  function ficha() {
    return render(
      <FichaActivo
        activo={activo('TEC-GEN-0020', 5)}
        catalogos={CATALOGOS}
        amenazas={AMENAZAS}
        navegacion={{ codigos: ['TEC-GEN-0020'] }}
      />,
    );
  }

  /// Lleva la rama hasta MINTRACE, que tiene un solo hijo («Ambientes») y al que el catálogo de
  /// PRODUCTOS le puede aportar CÓDIGO FUENTE.
  function hastaMintrace() {
    fireEvent.change(screen.getByLabelText('NIVEL 1'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('NIVEL 2'), { target: { value: '20' } });
  }

  it('ofrece un nombre del catálogo que la rama todavía no tiene', () => {
    ficha();
    hastaMintrace();

    const nivel3 = screen.getByLabelText('NIVEL 3') as HTMLSelectElement;
    const textos = [...nivel3.options].map((o) => o.text);

    expect(textos).toContain('Ambientes');
    expect(textos).toContain('CÓDIGO FUENTE');
  });

  it('elegir del catálogo NO dispara ninguna acción', () => {
    ficha();
    hastaMintrace();

    fireEvent.change(screen.getByLabelText('NIVEL 3'), {
      target: { value: 'nuevo:CÓDIGO FUENTE' },
    });

    // Es la propiedad que hace que abrir el selector y arrepentirse no deje un nodo huérfano
    // en un árbol que el mapa y el grafo dibujan.
    expect(mockGuardarDatosGenerales).not.toHaveBeenCalled();
  });

  it('dice que el nodo se crea al guardar, y que salir sin guardar no crea nada', () => {
    ficha();
    hastaMintrace();

    fireEvent.change(screen.getByLabelText('NIVEL 3'), {
      target: { value: 'nuevo:CÓDIGO FUENTE' },
    });

    expect(screen.getByText(/Al guardar se crea «CÓDIGO FUENTE» bajo MINTRACE/)).toBeInTheDocument();
    expect(screen.getByText(/Si sales sin guardar, no se crea nada/)).toBeInTheDocument();
  });

  it('al guardar viaja como nivelNuevo, no como nivelId', async () => {
    ficha();
    hastaMintrace();

    fireEvent.change(screen.getByLabelText('NIVEL 3'), {
      target: { value: 'nuevo:CÓDIGO FUENTE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Guardar \d+ cambios?$/ }));

    await waitFor(() => expect(mockGuardarDatosGenerales).toHaveBeenCalledTimes(1));
    expect(mockGuardarDatosGenerales).toHaveBeenCalledWith('TEC-GEN-0020', {
      nivelNuevo: { nivel2Id: 20, nombre: 'CÓDIGO FUENTE' },
    });
  });

  it('elegir un nodo existente después de uno del catálogo limpia la intención', async () => {
    // Los dos son excluyentes: un activo no puede apuntar a un nodo y a la vez pedir que se cree
    // otro. Si `nivelNuevo` sobreviviera, el servidor lo resolvería y pisaría al elegido.
    ficha();
    hastaMintrace();

    fireEvent.change(screen.getByLabelText('NIVEL 3'), {
      target: { value: 'nuevo:CÓDIGO FUENTE' },
    });
    fireEvent.change(screen.getByLabelText('NIVEL 3'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /^Guardar \d+ cambios?$/ }));

    await waitFor(() => expect(mockGuardarDatosGenerales).toHaveBeenCalledTimes(1));
    expect(mockGuardarDatosGenerales).toHaveBeenCalledWith('TEC-GEN-0020', { nivelId: 30 });
  });
});
