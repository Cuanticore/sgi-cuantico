// app/components/sgsi/matrices/__tests__/MatricesRiesgo.test.tsx
//
// Lo que se prueba acá es la COSTURA de la pantalla con `lib/sgsi/matriz-clasica.ts`: que la
// cifra grande de la tarjeta y el aviso del pie cuenten el inventario que la pantalla recibe,
// y no el subconjunto que alcanzó a tener riesgo valorado.
//
// Es la forma exacta de los tres bugs del 15/09/2026: cada pieza hacía bien su trabajo y lo
// que fallaba era la composición — una lista que se encogía entre un paso y el siguiente. La
// cuenta por activo ya está probada, pura, en `matriz-clasica.test.ts`; lo que ninguna prueba
// de esa suite puede ver es qué universo le entrega la pantalla.

import { fireEvent, render, screen, within } from '@testing-library/react';
import MatricesRiesgo, {
  type ActivoVista,
  type AmenazaVista,
  type BandaVista,
  type ColumnaFrecuencia,
  type FilaImpacto,
  type FilaRiesgo,
} from '../MatricesRiesgo';

const FILAS_IMPACTO: FilaImpacto[] = [
  { nombre: 'Muy alto', desde: 4.5, hasta: 5, medio: 4.75 },
  { nombre: 'Alto', desde: 3, hasta: 4.5, medio: 3.75 },
  { nombre: 'Medio', desde: 1.5, hasta: 3, medio: 2.25 },
  { nombre: 'Bajo', desde: 0.5, hasta: 1.5, medio: 1 },
  { nombre: 'Despreciable', desde: 0, hasta: 0.5, medio: 0.25 },
];

const COLUMNAS: ColumnaFrecuencia[] = [
  { nombre: 'Muy baja', lectura: 'Muy baja — excepcional', vecesAno: 0.01 },
  { nombre: 'Baja', lectura: 'Baja — cada diez años', vecesAno: 0.1 },
  { nombre: 'Media', lectura: 'Media — una vez al año', vecesAno: 1 },
  { nombre: 'Alta', lectura: 'Alta — cada mes', vecesAno: 10 },
  { nombre: 'Muy alta', lectura: 'Muy alta — a diario', vecesAno: 100 },
];

const BANDAS: BandaVista[] = [
  { nombre: 'Crítico', desde: 25, hasta: Number.MAX_SAFE_INTEGER },
  { nombre: 'Alto', desde: 5, hasta: 25 },
  { nombre: 'Medio', desde: 0.5, hasta: 5 },
  { nombre: 'Bajo', desde: 0, hasta: 0.5 },
];

const PROCESOS = ['Gestión humana', 'Tecnología'];
const CATEGORIAS = ['[D] Datos / Información', '[HW] Equipamiento informático'];
const RESPONSABLES = ['Jefe de tecnología'];

/// Cinco activos, uno solo con riesgo valorado. Es la proporción del registro real —30 de
/// 378— en miniatura, y también su forma: los que quedan fuera del análisis no son
/// despreciables, son los que **no alcanzan el umbral de valoración**. Con umbral 4, un
/// activo de valor 3 se queda fuera y su valor cae en la banda ALTO.
const ACTIVOS: ActivoVista[] = [
  { codigo: 'TEC-HW-0001', nombre: 'Servidor de aplicaciones', proceso: 1, responsable: 0, categoria: 1, valor: 5 },
  { codigo: 'TEC-HW-0002', nombre: 'Portátil de dirección', proceso: 1, responsable: 0, categoria: 1, valor: 3 },
  { codigo: 'GH-DAT-0001', nombre: 'Hojas de vida', proceso: 0, responsable: 0, categoria: 0, valor: 3 },
  { codigo: 'GH-DAT-0002', nombre: 'Contratos laborales', proceso: 0, responsable: 0, categoria: 0, valor: 2 },
  { codigo: 'GH-DAT-0003', nombre: 'Historias clínicas ocupacionales', proceso: 0, responsable: 0, categoria: 0, valor: null },
];

const AMENAZAS: AmenazaVista[] = [{ codigo: 'A-01', nombre: 'Caída del servicio' }];

const FILAS: FilaRiesgo[] = [
  {
    codigo: 'R-0001',
    activo: 0,
    amenaza: 0,
    responsable: -1,
    impacto: 4.7,
    aro: 1,
    riesgo: 4.7,
    aroResidual: 0.5,
    riesgoResidual: 2.35,
  },
];

function pintar(extra: Partial<React.ComponentProps<typeof MatricesRiesgo>> = {}) {
  return render(
    <MatricesRiesgo
      filas={FILAS}
      activos={ACTIVOS}
      amenazas={AMENAZAS}
      procesos={PROCESOS}
      responsables={RESPONSABLES}
      categorias={CATEGORIAS}
      filasImpacto={FILAS_IMPACTO}
      columnas={COLUMNAS}
      bandas={BANDAS}
      sinUbicar={0}
      umbralValoracion={4}
      {...extra}
    />,
  );
}

const verActivos = () => fireEvent.click(screen.getByRole('button', { name: 'Activos' }));

const tarjeta = (titulo: string) => screen.getByRole('region', { name: titulo });

describe('MatricesRiesgo · la matriz de activos presenta el inventario entero', () => {
  it('la cifra de la tarjeta es el inventario del filtro, no los activos con riesgo', () => {
    pintar();
    verActivos();
    const inherente = tarjeta('Matriz de riesgo inherente');
    expect(within(inherente).getByTestId('total-matriz')).toHaveTextContent('5');
  });

  // El aviso nombra la CAUSA y su número. «No tienen riesgo valorado» describe el síntoma y
  // manda a adivinar; «no alcanzan el umbral de valoración (4)» dice qué hay que cambiar
  // para que entren.
  it('declara cuántos quedan fuera, por qué, y cuántos de ésos pesan', () => {
    pintar();
    verActivos();
    const aviso = within(tarjeta('Matriz de riesgo inherente')).getByText(
      /4 activos del filtro no alcanzan el umbral de valoración \(4\)/i,
    );
    expect(aviso).toBeInTheDocument();
    // Dos de los cuatro valen 3, que en la escala de impacto es Alto. Ésa es la cifra que
    // el cambio existe para no esconder.
    expect(aviso).toHaveTextContent(/2 son de impacto muy alto o alto/i);
  });

  it('los activos sin riesgo no se cuelan en ninguna casilla ni en ninguna banda', () => {
    pintar();
    verActivos();
    const inherente = tarjeta('Matriz de riesgo inherente');
    // El único activo ubicado: impacto 4,7 × 1 vez al año = 4,7 → Medio.
    expect(within(inherente).getByTestId('banda-Medio')).toHaveTextContent('1');
    expect(within(inherente).getByTestId('banda-Bajo')).toHaveTextContent('0');
    // Y los cuatro restantes se cuentan fuera de las bandas, cada causa en su renglón: tres
    // tienen valor propio y van a la columna aparte, uno no está valorado.
    expect(within(inherente).getByTestId('banda-sin-analizar')).toHaveTextContent('3');
    expect(within(inherente).getByTestId('sin-valorar')).toHaveTextContent('1');
  });

  it('el filtro por proceso recorta el inventario, no sólo los riesgos', () => {
    pintar();
    verActivos();
    fireEvent.change(screen.getByLabelText('Proceso'), {
      target: { value: String(PROCESOS.indexOf('Gestión humana')) },
    });
    const inherente = tarjeta('Matriz de riesgo inherente');
    // Los tres activos de Gestión humana, ninguno con riesgo valorado: dos con valor propio
    // y uno sin valorar.
    expect(within(inherente).getByTestId('total-matriz')).toHaveTextContent('3');
    expect(within(inherente).getByTestId('banda-sin-analizar')).toHaveTextContent('2');
    expect(within(inherente).getByTestId('sin-valorar')).toHaveTextContent('1');
  });

  it('el encabezado cuenta activos cuando la unidad es activos', () => {
    pintar();
    verActivos();
    expect(screen.getByText(/activos en el filtro, de 5/i)).toBeInTheDocument();
  });

  it('en amenazas nada cambia: la tarjeta sigue contando riesgos', () => {
    pintar();
    const inherente = tarjeta('Matriz de riesgo inherente');
    expect(within(inherente).getByTestId('total-matriz')).toHaveTextContent('1');
    expect(within(inherente).queryByTestId('banda-sin-analizar')).toBeNull();
    expect(within(inherente).queryByTestId('sin-valorar')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('MatricesRiesgo · la columna de los que no entran al análisis', () => {
  // CONTARLOS NO ES VERLOS. El pie decía «4 sin valorar» y no había forma de saber cuáles
  // eran graves. En el registro real son 330 activos de valor 3 —banda ALTO— invisibles.
  //
  // No tienen frecuencia, así que no pueden entrar a la rejilla. Sí tienen fila: su propio
  // valor. Van a una columna aparte, en la fila de ese valor.

  it('la columna aparece en activos, con los conteos por banda de valor', () => {
    pintar();
    verActivos();
    const inherente = tarjeta('Matriz de riesgo inherente');
    // FILAS_IMPACTO: 0 Muy alto · 1 Alto · 2 Medio · 3 Bajo · 4 Despreciable.
    // Valor 3 -> Alto: el portátil y las hojas de vida. Valor 2 -> Medio: los contratos.
    expect(within(inherente).getByTestId('sinanalizar-1')).toHaveTextContent(/^2$/);
    expect(within(inherente).getByTestId('sinanalizar-2')).toHaveTextContent(/^1$/);
    expect(within(inherente).getByTestId('sinanalizar-0')).toHaveTextContent(/^—$/);
  });

  it('el encabezado de la columna dice que no es una frecuencia', () => {
    pintar();
    verActivos();
    expect(
      within(tarjeta('Matriz de riesgo inherente')).getByTestId('cabecera-sin-analizar'),
    ).toHaveTextContent(/sin analizar/i);
  });

  it('abrir una casilla de la columna lista los activos que contiene', () => {
    pintar();
    verActivos();
    fireEvent.click(within(tarjeta('Matriz de riesgo inherente')).getByTestId('sinanalizar-1'));
    const detalle = screen.getByRole('region', { name: /sin analizar/i });
    expect(within(detalle).getByText('Portátil de dirección')).toBeInTheDocument();
    expect(within(detalle).getByText('Hojas de vida')).toBeInTheDocument();
    // El de valor 2 está en otra fila y no puede aparecer acá.
    expect(within(detalle).queryByText('Contratos laborales')).toBeNull();
  });

  it('un activo sin valorar no se dibuja en la banda más baja', () => {
    pintar();
    verActivos();
    const inherente = tarjeta('Matriz de riesgo inherente');
    // Las historias clínicas no tienen valor: no hay fila que les corresponda, así que no
    // engrosan «Despreciable». Se cuentan aparte, con su propia razón.
    expect(within(inherente).getByTestId('sinanalizar-4')).toHaveTextContent(/^—$/);
    expect(within(inherente).getByTestId('sin-valorar')).toHaveTextContent('1');
  });

  it('en amenazas no hay columna: una amenaza no tiene valor propio que la ubique', () => {
    pintar();
    const inherente = tarjeta('Matriz de riesgo inherente');
    expect(within(inherente).queryByTestId('cabecera-sin-analizar')).toBeNull();
    expect(within(inherente).queryByTestId('sinanalizar-1')).toBeNull();
  });
});
