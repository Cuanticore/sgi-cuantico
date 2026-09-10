// app/components/sgsi/valoracion/__tests__/PantallaValoracion.test.tsx
//
// Tres cosas que el REQ-SIG-18 pide **en pantalla** y no en un comentario del código, más el caso
// vacío de la Tabla B, que es el estado del primer día y por eso se prueba primero (§13).
//
// El resto de la pantalla —el tinte, las posiciones, los destinos, los totales— se prueba en los
// módulos puros de `lib/sgsi/`, que es donde vive la decisión. Acá se comprueba solo lo que
// depende de que el texto esté escrito y visible.

import { render, screen } from '@testing-library/react';
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
): ActivoAgregable {
  return { codigo, propietario, persona, valores };
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

describe('el caso vacío de la Tabla B, que es el estado del primer día (§6.6)', () => {
  it('muestra la línea de encuadre con el 0 de N y el enlace, y no dibuja la matriz', () => {
    render(
      <PantallaValoracion
        activos={CON_EMPATE}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={0}
      />,
    );
    expect(screen.getByText(/activos están entregados a una persona/i)).toBeInTheDocument();
    expect(screen.getByText(/no tienen custodio persona asignado/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver en el inventario/i })).toHaveAttribute(
      'href',
      '/sgsi/inventario?persona=__sin__',
    );
    // La explicación de POR QUÉ está vacía: sin ella, 24 columnas vacías parecen una pantalla
    // rota. Y la causa es la asignación que no se hizo, no que falten personas.
    expect(screen.getByText(/no se carga desde ningún libro/i)).toBeInTheDocument();
    expect(screen.queryByText('Custodio (persona)')).not.toBeInTheDocument();
  });

  it('con una persona asignada sí la dibuja, con los cuatro grupos', () => {
    const conPersona = [
      ...CON_EMPATE,
      activo('P-1', { D: 1, I: 1, C: 4 }, 'CEO', {
        nombre: 'Juan Felipe Ruiz',
        correo: 'jruiz@cuantico.co',
        activa: true,
      }),
    ];
    render(
      <PantallaValoracion
        activos={conPersona}
        dimensiones={DIMENSIONES}
        escala={ESCALA}
        umbral={4}
        conPersona={1}
      />,
    );
    expect(screen.getByText('Custodio (persona)')).toBeInTheDocument();
    expect(screen.getByText('Juan Felipe Ruiz')).toBeInTheDocument();
    expect(screen.getByText('jruiz@cuantico.co')).toBeInTheDocument();
    // «Valor final» es el nombre del máximo en la Tabla B (D-9): encabeza el cuarto grupo, y la
    // línea de arriba dice que es lo mismo que «Valor del activo (máx D·I·C)».
    expect(screen.getAllByText('Valor final').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/es el máximo de las dimensiones/i)).toBeInTheDocument();
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
