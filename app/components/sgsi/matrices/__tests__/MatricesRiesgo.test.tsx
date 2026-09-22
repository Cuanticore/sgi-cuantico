// app/components/sgsi/matrices/__tests__/MatricesRiesgo.test.tsx
//
// LA MATRIZ DE ACTIVOS CUENTA LOS ACTIVOS DEL ANÁLISIS, Y SÓLO ÉSOS.
//
// Se intentó lo contrario y se retiró, así que conviene dejar escrito por qué, o el próximo
// que mire la pantalla va a proponer lo mismo:
//
// De los 378 activos vigentes, 30 superan el umbral de valoración y por eso tienen riesgos
// generados. Se probó a presentar los 378 —los 348 restantes en una columna aparte, ubicados
// por su propio valor— y se retiró: MEZCLA DOS ESCALAS EN UNA SOLA REJILLA. Las filas de la
// rejilla son bandas del IMPACTO DE UN RIESGO (valor × degradación); las de esa columna eran
// bandas del VALOR DEL ACTIVO. Poner 330 activos en el renglón «Alto», al lado de riesgos que
// cayeron en «Alto», invita a leerlos como comparables, y no lo son.
//
// Lo que sí se conserva del intento es la única parte que no mezclaba nada: que la pantalla
// DIGA que 30 son 30 de 378. La cifra sola no está mal calculada, pero se lee como «el
// inventario son 30», que fue el defecto que abrió todo esto.

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

/// El catálogo trae SÓLO los activos que aparecen en algún riesgo, que es lo que arma
/// `app/sgsi/matrices/page.tsx`. Dos activos analizados de un inventario de nueve vigentes:
/// la proporción del registro real —30 de 378— en miniatura.
const ACTIVOS: ActivoVista[] = [
  { codigo: 'TEC-HW-0001', nombre: 'Servidor de aplicaciones', proceso: 1, responsable: 0, categoria: 1 },
  { codigo: 'GH-DAT-0001', nombre: 'Hojas de vida', proceso: 0, responsable: 0, categoria: 0 },
];

const VIGENTES = 9;

const AMENAZAS: AmenazaVista[] = [
  { codigo: 'A-01', nombre: 'Caída del servicio' },
  { codigo: 'A-02', nombre: 'Divulgación no autorizada' },
];

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
  // Un segundo riesgo del MISMO activo: la matriz de activos tiene que seguir contándolo una
  // sola vez, en la casilla de su peor riesgo.
  {
    codigo: 'R-0002',
    activo: 0,
    amenaza: 1,
    responsable: -1,
    impacto: 3.2,
    aro: 1,
    riesgo: 3.2,
    aroResidual: 0.5,
    riesgoResidual: 1.6,
  },
  {
    codigo: 'R-0003',
    activo: 1,
    amenaza: 1,
    responsable: -1,
    impacto: 3.5,
    aro: 1,
    riesgo: 3.5,
    aroResidual: 0.5,
    riesgoResidual: 1.75,
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
      activosVigentes={VIGENTES}
      {...extra}
    />,
  );
}

const verActivos = () => fireEvent.click(screen.getByRole('button', { name: 'Activos' }));

const tarjeta = (titulo: string) => screen.getByRole('region', { name: titulo });

describe('MatricesRiesgo · la matriz de activos cuenta los activos del análisis', () => {
  it('la cifra de la tarjeta son los activos analizados, uno por activo y no por riesgo', () => {
    pintar();
    verActivos();
    // Tres riesgos sobre dos activos: la tarjeta dice 2, no 3.
    expect(within(tarjeta('Matriz de riesgo inherente')).getByTestId('total-matriz')).toHaveTextContent(
      /^2$/,
    );
  });

  // La parte que SÍ se conserva del intento de presentar los 378. La cifra sola se lee como
  // «el inventario son 2»; con el denominador al lado no puede.
  it('dice de cuántos son, para que la cifra no se lea como el inventario entero', () => {
    pintar();
    verActivos();
    expect(screen.getByTestId('alcance-analisis')).toHaveTextContent(
      /2 .*de .*9 activos vigentes/i,
    );
  });

  it('en amenazas no aparece ese texto: ahí la cifra son riesgos y no hay nada que aclarar', () => {
    pintar();
    expect(screen.queryByTestId('alcance-analisis')).toBeNull();
    expect(within(tarjeta('Matriz de riesgo inherente')).getByTestId('total-matriz')).toHaveTextContent(
      /^3$/,
    );
  });

  // LA REGRESIÓN QUE ESTA SUITE EXISTE PARA IMPEDIR. Se probó a dibujar los activos sin
  // análisis en una columna aparte, ubicados por su propio valor, y mezclaba la escala del
  // impacto de un riesgo con la del valor de un activo en la misma rejilla.
  it('no hay ninguna columna fuera del eje de frecuencia', () => {
    pintar();
    verActivos();
    const inherente = tarjeta('Matriz de riesgo inherente');
    expect(within(inherente).queryByTestId('cabecera-sin-analizar')).toBeNull();
    expect(within(inherente).queryByTestId('sinanalizar-1')).toBeNull();
  });

  it('el pie sólo lleva bandas de riesgo, y suman exactamente lo que dibuja la rejilla', () => {
    pintar();
    verActivos();
    const inherente = tarjeta('Matriz de riesgo inherente');
    expect(within(inherente).queryByTestId('banda-sin-analizar')).toBeNull();
    expect(within(inherente).queryByTestId('sin-valorar')).toBeNull();
    // 4,7 y 3,5 con ARO 1 caen los dos en «Medio» (de 0,5 a menos de 25).
    expect(within(inherente).getByTestId('banda-Medio')).toHaveTextContent('2');
    expect(within(inherente).getByTestId('banda-Bajo')).toHaveTextContent('0');
  });

  it('el filtro por proceso recorta los activos y el denominador no se mueve', () => {
    pintar();
    verActivos();
    fireEvent.change(screen.getByLabelText('Proceso'), {
      target: { value: String(PROCESOS.indexOf('Gestión humana')) },
    });
    expect(within(tarjeta('Matriz de riesgo inherente')).getByTestId('total-matriz')).toHaveTextContent(
      /^1$/,
    );
    // El inventario no depende del filtro: sigue siendo de cuántos hay, no de cuántos quedan.
    expect(screen.getByTestId('alcance-analisis')).toHaveTextContent(/9 activos vigentes/i);
  });
});
