// app/components/sgsi/valoracion/__tests__/PantallaValoracion.test.tsx
//
// Tres cosas que el REQ-SIG-18 pide **en pantalla** y no en un comentario del código, más el caso
// vacío de la Tabla B, que es el estado del primer día y por eso se prueba primero (§13).
//
// El resto de la pantalla —el tinte, las posiciones, los destinos, los totales— se prueba en los
// módulos puros de `lib/sgsi/`, que es donde vive la decisión. Acá se comprueba solo lo que
// depende de que el texto esté escrito y visible.

import { fireEvent, render, screen } from '@testing-library/react';
import PantallaValoracion from '../PantallaValoracion';
import type { ActivoAgregable, DimensionActiva, NivelEscala } from '@/lib/sgsi/valoracion-agregada';

const DIMENSIONES: DimensionActiva[] = [
  { codigo: 'D', nombre: 'Disponibilidad' },
  { codigo: 'I', nombre: 'Integridad' },
  { codigo: 'C', nombre: 'Confidencialidad' },
];

const ESCALA: NivelEscala[] = [
  { valor: 5, etiqueta: '5 — Muy Alto' },
  { valor: 4, etiqueta: '4 — Alto' },
  { valor: 3, etiqueta: '3 — Medio' },
  { valor: 2, etiqueta: '2 — Bajo' },
  { valor: 1, etiqueta: '1 — Muy Bajo' },
  { valor: 0, etiqueta: '0 — Irrelevante' },
];

function activo(
  codigo: string,
  valores: Record<string, number | null>,
  propietario: string | null = 'CEO',
  persona: ActivoAgregable['persona'] = null,
  tipo = '[D] Datos / Información',
  subtipo = '[int] Datos de gestión interna',
): ActivoAgregable {
  return { codigo, propietario, persona, valores, tipo, subtipo };
}

const CON_EMPATE: ActivoAgregable[] = [
  activo('A-1', { D: 4, I: 4, C: 1 }),
  activo('A-2', { D: 1, I: 1, C: 5 }),
  activo('A-3', { D: 2, I: 2, C: 2 }, null),
];

describe('la advertencia del empate va en pantalla (§4.3)', () => {
  it('se muestra cuando hay empates en el máximo', () => {
    render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(
      screen.getByText(/cuenta en cada dimensión empatada, así que las cifras suman más/i),
    ).toBeInTheDocument();
    // Y la línea de las tres cuentas, que es lo que la advertencia explica.
    expect(screen.getByText(/De los 2 que alcanzan el umbral, lo determina/i)).toBeInTheDocument();
  });

  it('no se muestra cuando ningún máximo está empatado', () => {
    render(
      <PantallaValoracion
        activos={[activo('B-1', { D: 5, I: 1, C: 1 }), activo('B-2', { D: 1, I: 4, C: 1 })]}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.queryByText(/cuenta en cada dimensión empatada/i)).not.toBeInTheDocument();
  });
});

describe('la matriz es la vista de tabla accesible, no un tooltip (§4.5)', () => {
  it('está abierta por defecto y trae las cuatro filas', () => {
    render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.getByText('Valor del activo (máx D·I·C)')).toBeInTheDocument();
    for (const d of DIMENSIONES) {
      // Una vez como rótulo de la pila y otra como fila de la matriz.
      expect(screen.getAllByText(d.nombre).length).toBeGreaterThanOrEqual(2);
    }
    expect(
      screen.getByText(/no es la suma ni el promedio/i),
    ).toBeInTheDocument();
  });
});

describe('la Tabla A siempre muestra la fila «Sin propietario» (§6.1)', () => {
  it('la dibuja, en cursiva y sin omitirla', () => {
    render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    // Dos veces: la fila de la tabla y la nota que dice que nunca se omite.
    expect(screen.getAllByText('Sin propietario').length).toBe(2);
    expect(screen.getByText('Propietario (cargo)')).toBeInTheDocument();
  });
});

describe('la Tabla B agrupa por tipo y subtipo (§6.6, reemplaza al custodio persona)', () => {
  // La tabla anterior agrupaba por custodio PERSONA y no se dibujaba nunca: esa pareja esta
  // en cero, asi que la pantalla dedicaba una seccion entera a explicar por que no habia
  // tabla. El tipo y el subtipo son obligatorios en el modelo, asi que esta SIEMPRE tiene
  // algo que decir.

  it('siempre se dibuja, aunque ningun activo tenga custodio persona', () => {
    render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.getByText('Subtipo (y su tipo)')).toBeInTheDocument();
    // Y ya no queda rastro de la seccion que explicaba por que no habia tabla.
    expect(screen.queryByText(/no se carga desde ningún libro/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Custodio (persona)')).not.toBeInTheDocument();
  });

  it('el subtipo encabeza la fila y el tipo va debajo, no concatenados', () => {
    // El tipo se repite en todos los subtipos que cuelgan de el; ponerlo en la etiqueta
    // principal empujaria fuera de vista al subtipo, que es lo que distingue una fila de otra.
    render(
      <PantallaValoracion
        activos={[
          activo('A-1', { D: 4, I: 4, C: 1 }, 'CEO', null, '[D] Datos', '[int] Gestión interna'),
          activo('A-2', { D: 1, I: 1, C: 5 }, 'CEO', null, '[D] Datos', '[per] Datos personales'),
          activo('A-3', { D: 2, I: 2, C: 2 }, 'CEO', null, '[HW] Equipos', '[pc] Informática personal'),
        ]}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.getByText('[int] Gestión interna')).toBeInTheDocument();
    expect(screen.getByText('[per] Datos personales')).toBeInTheDocument();
    expect(screen.getByText('[pc] Informática personal')).toBeInTheDocument();
    // Dos subtipos comparten tipo: el tipo aparece una vez por FILA, no fundido con el nombre.
    expect(screen.getAllByText('[D] Datos').length).toBe(2);
  });

  it('todos los activos caen en alguna fila: no hay «sin clasificar»', () => {
    render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.getByText(/no hay «sin clasificar» que explicar/i)).toBeInTheDocument();
  });
});


describe('el inventario vacío no dibuja cuatro barras de ancho cero (§9)', () => {
  it('deja una línea y un enlace', () => {
    render(
      <PantallaValoracion
        activos={[]}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.getByText(/No hay activos vigentes en el inventario/i)).toBeInTheDocument();
    expect(screen.queryByText('Propietario (cargo)')).not.toBeInTheDocument();
  });
});

describe('el umbral sale del parámetro y se ve en pantalla (§10.5)', () => {
  it('cambiarlo mueve la cifra protagonista y el encabezado de la columna', () => {
    const { unmount } = render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.getByText(/alcanzan el umbral de 4/i)).toBeInTheDocument();
    unmount();

    render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={3}
        conPersona={0}
      />,
    );
    expect(screen.getByText(/alcanzan el umbral de 3/i)).toBeInTheDocument();
    expect(screen.getAllByText(/≥ 3/).length).toBeGreaterThan(0);
  });
});

describe('una cuarta dimensión activa da una quinta pila y una quinta fila (§9)', () => {
  it('aparece sin tocar código', () => {
    render(
      <PantallaValoracion
        activos={[activo('A-1', { D: 1, I: 1, C: 1, A: 5 })]}
        dimensiones={[...DIMENSIONES, { codigo: 'A', nombre: 'Autenticidad' }]}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.getAllByText('Autenticidad').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/alcanzan el umbral de 4/i)).toBeInTheDocument();
  });
});

describe('la grafica de cada tabla', () => {
  // PLEGADA POR OMISION, y no es indecision: la tabla es el dato exacto y quien entra viene
  // casi siempre a buscar un numero. Abrirla por omision empujaria la tabla media pantalla
  // hacia abajo para responder una pregunta que nadie hizo todavia.
  it('nace plegada: la tabla no se corre para abajo', () => {
    render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.getByRole('button', { name: /Ver la gráfica por propietario/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText(/escala absoluta/i)).not.toBeInTheDocument();
  });

  it('se abre y trae sus filtros', () => {
    render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ver la gráfica por propietario/i }));
    // El filtro por criterio y el del umbral son los dos que la hacen util.
    expect(screen.getAllByText('CRITERIO').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(/Sólo los que alcanzan 4/i)).toBeInTheDocument();
    // Y dice que la escala es absoluta: el largo significa cuantos activos, no un porcentaje.
    expect(screen.getAllByText(/escala absoluta/i).length).toBeGreaterThanOrEqual(1);
  });
});
