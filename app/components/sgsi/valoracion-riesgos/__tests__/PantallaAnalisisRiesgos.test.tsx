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
import { fireEvent, render, screen, within } from '@testing-library/react';
import PantallaAnalisisRiesgos from '../PantallaAnalisisRiesgos';
import type { ActivoAnalizable } from '@/lib/sgsi/analisis-riesgos';
import type { UmbralRiesgo } from '@/lib/sgsi/riesgo-activo';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, refresh: jest.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/sgsi/valoracion-riesgos',
}));

// El popup de planes importa las acciones de servidor, y ésas arrastran `next/cache` —que
// en jsdom no arranca—. Se simula por la misma razón que `FichaActivo.test.tsx` simula el
// suyo: lo que se prueba acá es la grilla, no el popup. Su decisión de fondo —cuántos planes
// salen de N amenazas— está probada aparte, y pura, en `planes-por-amenaza.test.ts`.
jest.mock('../PopupPlanesActivo', () => ({
  __esModule: true,
  default: ({ activoCodigo, onCerrar }: { activoCodigo: string; onCerrar: () => void }) => (
    <div role="dialog" aria-label={`Planes de ${activoCodigo}`}>
      <button onClick={onCerrar}>Cerrar</button>
    </div>
  ),
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
    valores: { D: 5, I: 5, C: 5 },
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
        degradacion: { D: 1, I: 0, C: 0 },
        principal: { codigo: 'A.8.14', nivel: 50 },
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
      // Su principal SÍ alcanza lo exigido (90 %), así que este activo está cubierto y no
      // entra en SIN PLAN — es el contraste que hace legible la cifra del otro.
      { amenazaCodigo: 'A.11', amenazaNombre: 'Acceso no autorizado', potencial: '12', residual: '12', obsoleto: false, degradacion: { D: 1, I: 0, C: 0 }, principal: { codigo: 'A.5.30', nivel: 90 } },
    ],
  }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
});

/// Tres activos que cubren las tres situaciones que el renglón tiene que distinguir:
/// residual Crítico, residual Alto y residual Medio.
const TRES_BANDAS: ActivoAnalizable[] = [
  // residual 25 → Crítico (≥ 20)
  activo({ codigo: 'TEC-EQU-0003' }),
  // residual 12 → Alto (10–19.9999), y su principal en 90 % así que NO requiere plan: es el
  // caso que separa «alto» de «sin plan», que son dos preguntas distintas.
  activo({
    codigo: 'TEC-GEN-0004',
    riesgos: [
      { amenazaCodigo: 'A.11', amenazaNombre: 'Acceso no autorizado', potencial: '12', residual: '12', obsoleto: false, degradacion: { D: 1, I: 0, C: 0 }, principal: { codigo: 'A.5.30', nivel: 90 } },
    ],
  }),
  // residual 5 → Medio (4–9.9999)
  activo({
    codigo: 'FIN-DAT-0007',
    proceso: 'Gestión Financiera',
    riesgos: [
      { amenazaCodigo: 'A.7', amenazaNombre: 'Error de usuario', potencial: '5', residual: '5', obsoleto: false, degradacion: { D: 1, I: 0, C: 0 }, principal: { codigo: 'A.5.30', nivel: 90 } },
    ],
  }),
];

function pintarGrilla(activos: ActivoAnalizable[] = TRES_BANDAS) {
  return render(
    <PantallaAnalisisRiesgos
      activos={activos}
      bandas={BANDAS}
      umbral={4}
      procesos={['Gestión Tecnológica', 'Gestión Financiera']}
      propietarios={['Chief Operating Officer']}
      personas={[]}
      accionesParaDeuda={[]}
      sinPlan={[]}
    />,
  );
}

function renglonDe(codigo: string): HTMLElement {
  const fila = screen.getByRole('link', { name: codigo }).closest('tr');
  if (fila === null) throw new Error(`No se encontró el renglón de ${codigo}`);
  return fila;
}

describe('El renglón se pinta por la MAGNITUD del residual', () => {
  // Lo que se lee de un vistazo en una grilla de treinta filas es el color, no una columna.
  // Y lo que hay que ver primero es dónde quedó alto el riesgo DESPUÉS de los controles.
  it('residual Crítico pinta el renglón', () => {
    pintarGrilla();
    const fila = renglonDe('TEC-EQU-0003');
    expect(fila).toHaveAttribute('data-banda-residual', 'Crítico');
    expect(fila.className).toContain('bg-danger-bg');
  });

  it('residual Alto pinta el renglón aunque el activo NO requiera plan', () => {
    pintarGrilla();
    const fila = renglonDe('TEC-GEN-0004');
    expect(fila).toHaveAttribute('data-banda-residual', 'Alto');
    expect(fila).toHaveAttribute('data-estado-plan', 'no-requiere');
    expect(fila.className).toContain('bg-danger-bg');
  });

  it('residual Medio no se pinta', () => {
    pintarGrilla();
    const fila = renglonDe('FIN-DAT-0007');
    expect(fila).toHaveAttribute('data-banda-residual', 'Medio');
    expect(fila.className).not.toContain('bg-danger-bg');
  });

  // El color no puede ser la única señal: quien no distingue el rojo, o lee con lector de
  // pantalla, tiene que enterarse igual. La columna «Peor residual» ya lo dice en palabras.
  it('el rojo acompaña al texto, no lo reemplaza', () => {
    pintarGrilla();
    // `textContent` y no `getByText`: la celda parte el nivel y la banda en dos nodos
    // («5» · «Crítico»), y lo que se comprueba acá es que la palabra esté, no cómo se maqueta.
    expect(renglonDe('TEC-EQU-0003').textContent).toContain('Crítico');
  });
});

describe('El valor por dimensión no se pierde detrás del máximo', () => {
  // Recomendación del auditor (18/09/2026). Dos activos en valor 5 —uno por disponibilidad,
  // otro por confidencialidad— exigen controles distintos, y la grilla los mostraba iguales.
  const porConfidencialidad = activo({
    codigo: 'LCO-DAT-0009',
    valor: 5,
    valores: { D: 2, I: 3, C: 5 },
  });

  it('muestra una columna por dimensión, además del valor', () => {
    pintarGrilla([porConfidencialidad]);
    // Los encabezados llevan el nombre completo; la columna sólo tiene ancho para la letra.
    expect(screen.getByRole('columnheader', { name: /disponibilidad/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /integridad/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /confidencialidad/i })).toBeInTheDocument();
  });

  it('cada dimensión muestra su propio valor', () => {
    pintarGrilla([porConfidencialidad]);
    const fila = renglonDe('LCO-DAT-0009');
    expect(within(fila).getByLabelText(/^Disponibilidad/)).toHaveTextContent('2');
    expect(within(fila).getByLabelText(/^Integridad/)).toHaveTextContent('3');
    expect(within(fila).getByLabelText(/^Confidencialidad/)).toHaveTextContent('5');
  });

  // La que de verdad importa: el máximo y las tres dimensiones tienen que contar la misma
  // historia. Si el agregado dijera 5 y ninguna dimensión llegara a 5, una de las dos miente.
  it('el valor agregado coincide con la mayor de las tres dimensiones', () => {
    pintarGrilla([porConfidencialidad]);
    const fila = renglonDe('LCO-DAT-0009');
    expect(within(fila).getByLabelText(/^Valor del activo/)).toHaveTextContent('5');
    expect(within(fila).getByLabelText(/^Confidencialidad/)).toHaveTextContent('5');
  });
});

describe('Registrar un plan se puede desde cualquier activo de la grilla', () => {
  it('ofrece «+ plan» también en el activo que no requiere plan', () => {
    pintarGrilla();
    expect(
      within(renglonDe('TEC-GEN-0004')).getByRole('button', { name: /planes de tratamiento/i }),
    ).toBeInTheDocument();
  });

  it('lo ofrece igual en un residual Medio', () => {
    pintarGrilla();
    expect(
      within(renglonDe('FIN-DAT-0007')).getByRole('button', { name: /planes de tratamiento/i }),
    ).toBeInTheDocument();
  });

  it('el botón abre el popup del activo de su propio renglón', () => {
    pintarGrilla();
    fireEvent.click(
      within(renglonDe('FIN-DAT-0007')).getByRole('button', { name: /planes de tratamiento/i }),
    );
    expect(screen.getByRole('dialog', { name: 'Planes de FIN-DAT-0007' })).toBeInTheDocument();
  });
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
        accionesParaDeuda={[]}
        sinPlan={[]}
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
        accionesParaDeuda={[]}
        sinPlan={[]}
      />,
    );

    const enlace = screen.getByRole('link', { name: 'TEC-EQU-0003' });
    expect(enlace).toHaveAttribute('href', expect.stringContaining('activo=TEC-EQU-0003'));
    expect(enlace).toHaveAttribute('href', expect.stringContaining('tab=amenazas'));
  });

  it('la tarjeta SIN PLAN cuenta las BRECHAS sin AccionPlan que las cubra (REQ-SIG-24 §7)', () => {
    // TEC-EQU-0003 vale 5 y su principal está en 50 %: la exigencia por valor es 90 %, así
    // que hay una brecha de 40 puntos y ningún AccionPlan que la cubra.
    render(
      <PantallaAnalisisRiesgos
        activos={ACTIVOS}
        bandas={BANDAS}
        umbral={4}
        procesos={['Gestión Tecnológica', 'Gestión Financiera']}
        propietarios={['Chief Operating Officer']}
        personas={[]}
        accionesParaDeuda={[]}
        sinPlan={[]}
      />,
    );
    const tarjetaSinPlan = screen.getByRole('button', { name: /SIN PLAN/ });
    expect(within(tarjetaSinPlan).getByText('1')).toBeInTheDocument();
  });

  it('un AccionPlan activo cuyo origen cubre el riesgo saca al activo de la tarjeta SIN PLAN', () => {
    render(
      <PantallaAnalisisRiesgos
        activos={ACTIVOS}
        bandas={BANDAS}
        umbral={4}
        procesos={['Gestión Tecnológica', 'Gestión Financiera']}
        propietarios={['Chief Operating Officer']}
        personas={[]}
        accionesParaDeuda={[
          {
            activa: true,
            // Este caso prueba la cobertura POR ORIGEN; sin control, la otra vía no aplica.
            controlCodigo: null,
            origen: 'origen:v1|R-0001|TEC-EQU-0003|A.24 · Residual crítico cubierto',
          },
        ]}
        sinPlan={[]}
      />,
    );
    const tarjetaSinPlan = screen.getByRole('button', { name: /SIN PLAN/ });
    expect(within(tarjetaSinPlan).getByText('0')).toBeInTheDocument();
  });

  it('la franja nombrada (tarea 4.17) y el punto ámbar de fila se muestran cuando hay deuda', () => {
    render(
      <PantallaAnalisisRiesgos
        activos={ACTIVOS}
        bandas={BANDAS}
        umbral={4}
        procesos={['Gestión Tecnológica', 'Gestión Financiera']}
        propietarios={['Chief Operating Officer']}
        personas={[]}
        accionesParaDeuda={[]}
        sinPlan={[
          {
            activoCodigo: 'TEC-EQU-0003',
            activoNombre: 'Activo de prueba',
            amenazaCodigo: 'A.24',
            amenazaNombre: 'Denegación de servicio',
            diasPendiente: 6,
            escalado: false,
          },
        ]}
      />,
    );
    expect(screen.getByText(/1 activo con riesgo residual Crítico/)).toBeInTheDocument();
    expect(screen.getByLabelText('sin plan')).toBeInTheDocument();
  });
});

describe('REQ-SIG-20 §14.12 (segunda mitad) · elegir «criticidad» reordena por RTO', () => {
  const activosCriticidad: ActivoAnalizable[] = [
    activo({
      codigo: 'TEC-GEN-0001',
      criticidad: 'C3',
      valor: 5,
      riesgos: [
        { amenazaCodigo: 'A.24', amenazaNombre: 'Denegación de servicio', potencial: '25', residual: '25', obsoleto: false, degradacion: { D: 1, I: 0, C: 0 }, principal: { codigo: 'A.8.14', nivel: 50 } },
      ],
    }),
    activo({
      codigo: 'TEC-GEN-0002',
      criticidad: 'C1',
      valor: 5,
      riesgos: [
        { amenazaCodigo: 'A.24', amenazaNombre: 'Denegación de servicio', potencial: '15', residual: '15', obsoleto: false, degradacion: { D: 1, I: 0, C: 0 }, principal: { codigo: 'A.8.14', nivel: 50 } },
      ],
    }),
    activo({
      codigo: 'TEC-GEN-0003',
      criticidad: null,
      valor: 4,
      riesgos: [
        { amenazaCodigo: 'A.24', amenazaNombre: 'Denegación de servicio', potencial: '8', residual: '8', obsoleto: false, degradacion: { D: 1, I: 0, C: 0 }, principal: { codigo: 'A.8.14', nivel: 50 } },
      ],
    }),
    activo({
      codigo: 'TEC-GEN-0004',
      criticidad: 'C5',
      valor: 4,
      riesgos: [
        { amenazaCodigo: 'A.24', amenazaNombre: 'Denegación de servicio', potencial: '3', residual: '3', obsoleto: false, degradacion: { D: 1, I: 0, C: 0 }, principal: { codigo: 'A.8.14', nivel: 50 } },
      ],
    }),
  ];

  // C1 (10 min) es el más exigente; C5 no tiene SLA (rtoMinutos null) igual que un activo sin
  // criticidad declarada — los dos van al final, estables por código.
  const CRITICIDADES_RTO = [
    { codigo: 'C1', rtoMinutos: 10 },
    { codigo: 'C2', rtoMinutos: 240 },
    { codigo: 'C3', rtoMinutos: 1440 },
    { codigo: 'C4', rtoMinutos: 4320 },
    { codigo: 'C5', rtoMinutos: null },
  ];

  function codigosEnDom(): (string | null)[] {
    return screen.getAllByRole('link', { name: /^TEC-GEN-000\d$/ }).map((a) => a.textContent);
  }

  it('reordena por RTO ascendente, deja sin-criticidad/sin-SLA al final, y no cambia el conteo', () => {
    render(
      <PantallaAnalisisRiesgos
        activos={activosCriticidad}
        bandas={BANDAS}
        umbral={4}
        procesos={['Gestión Tecnológica']}
        propietarios={['Chief Operating Officer']}
        personas={[]}
        accionesParaDeuda={[]}
        sinPlan={[]}
        criticidadesRto={CRITICIDADES_RTO}
      />,
    );

    // Orden por defecto: peor residual descendente — sigue siendo el que ya existía.
    expect(codigosEnDom()).toEqual(['TEC-GEN-0001', 'TEC-GEN-0002', 'TEC-GEN-0003', 'TEC-GEN-0004']);
    expect(screen.getByText('4 activos · orden por peor residual')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: /Orden/i }), { target: { value: 'criticidad' } });

    // Orden por criticidad: RTO ascendente (C1 = 10 primero), TEC-GEN-0003 (sin criticidad) y
    // TEC-GEN-0004 (C5, sin SLA) comparten `rtoMinutos: null` y van al final, en orden estable
    // por código — reusa `ordenarPorCriticidad` sin un segundo comparador.
    expect(codigosEnDom()).toEqual(['TEC-GEN-0002', 'TEC-GEN-0001', 'TEC-GEN-0003', 'TEC-GEN-0004']);
    expect(screen.getByText('4 activos · orden por criticidad (RTO)')).toBeInTheDocument();

    // Reordenar NO cambia qué filas se muestran, solo el orden: la tarjeta EN ANÁLISIS sigue
    // contando 4, igual que antes de cambiar el orden.
    const tarjetaEnAnalisis = screen.getByRole('button', { name: /EN ANÁLISIS/ });
    expect(within(tarjetaEnAnalisis).getByText('4')).toBeInTheDocument();
  });
});

describe('REQ-SIG-20 §5 · un componente que no escribe (tarea 3.13)', () => {
  it('la pantalla no importa ningún módulo de acciones del servidor', () => {
    const ruta = path.join(process.cwd(), 'app/components/sgsi/valoracion-riesgos/PantallaAnalisisRiesgos.tsx');
    const fuente = fs.readFileSync(ruta, 'utf8');
    expect(fuente).not.toMatch(/from ['"]@\/app\/sgsi\/acciones/);
  });
});

describe('registrar planes desde la grilla', () => {
  // El plan nace donde se ve la brecha. Antes había que entrar al activo, abrir la pestaña
  // Amenazas y repetir el recorrido por cada amenaza: el trabajo se ve en esta lista y se
  // hacía en otra pantalla.
  function pintar() {
    render(
      <PantallaAnalisisRiesgos
        activos={ACTIVOS}
        bandas={BANDAS}
        umbral={4}
        procesos={['Gestión Tecnológica', 'Gestión Financiera']}
        propietarios={['Chief Operating Officer']}
        personas={[]}
        accionesParaDeuda={[]}
        sinPlan={[]}
      />,
    );
  }

  it('la fila de un activo que requiere plan ofrece registrarlo', () => {
    pintar();
    expect(
      screen.getByRole('button', { name: /Registrar planes de tratamiento para TEC-EQU-0003/ }),
    ).toBeInTheDocument();
  });

  // ESTA PRUEBA AFIRMABA LO CONTRARIO, y se invirtió el 18/09/2026 por decisión del líder
  // del SIG. Decía: «un activo cuyo principal ya alcanza lo exigido NO lo ofrece», porque
  // ofrecerlo «sería invitar a registrar trabajo que nadie pidió».
  //
  // El argumento no se sostuvo en el uso: «no requiere» significa que sus controles alcanzan
  // lo exigido HOY, no que nadie pueda decidir mejorarlos, y esconder el botón obligaba a
  // salir a la pantalla de Planes para tomar una decisión preventiva perfectamente legítima.
  // Se deja escrito el motivo y no sólo el cambio: una prueba que cambia de signo sin
  // explicación parece un descuido seis meses después.
  it('un activo cuyo principal ya alcanza lo exigido TAMBIÉN lo ofrece', () => {
    pintar();
    expect(
      screen.getByRole('button', { name: /Registrar planes de tratamiento para TEC-GEN-0004/ }),
    ).toBeInTheDocument();
  });

  it('abre el popup del activo de esa fila, y no el de otro', () => {
    pintar();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Registrar planes de tratamiento para TEC-EQU-0003/ }),
    );
    expect(screen.getByRole('dialog', { name: 'Planes de TEC-EQU-0003' })).toBeInTheDocument();
  });

  it('cerrar el popup lo saca de la pantalla', () => {
    pintar();
    fireEvent.click(
      screen.getByRole('button', { name: /Registrar planes de tratamiento para TEC-EQU-0003/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
