// app/components/sgsi/valoracion-riesgos/__tests__/GrillaAnalisis.test.tsx
//
// LA CELDA «PLAN», Y SÓLO ELLA. La grilla no se monta: AG Grid no rinde filas en jsdom —ver la
// cabecera de `PantallaAnalisisRiesgos.test.tsx`— así que lo que se prueba acá es el
// RENDERIZADOR de la celda, invocado a mano con la fila que le llegaría. Es la única pieza de
// este archivo que decide algo: qué ofrece la celda según lo que el activo tiene.
//
// POR QUÉ NACE (22/09/2026). Quien usa la pantalla reportó que `FIN-APP-0001` (Siigo) y
// `PRO-APP-0002` (Cuantico Verify) ofrecían CREAR un plan teniendo ocho cada uno, y que desde
// la grilla no había forma de llegar a esos ocho. La celda leía `estadoPlan` —que contesta
// «¿le falta algo?»— para contestar «¿tiene planes?»: dos preguntas que sólo coinciden en el
// caso intermedio. Un activo cuyo plan ya cerró la brecha perdía el enlace a ese plan, que es
// justo el que un auditor querría seguir.
//
// AG Grid se simula porque este archivo lo importa en su nivel superior (`themeQuartz`, los
// módulos). Nada de eso participa en lo que se prueba, y cargarlo de verdad traería la grilla
// entera a una prueba sobre tres nodos.

import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import type { FilaAnalisis } from '@/lib/sgsi/analisis-riesgos';

jest.mock('ag-grid-community', () => ({
  AllCommunityModule: {},
  themeQuartz: { withParams: () => ({}) },
}));

jest.mock('ag-grid-react', () => ({
  __esModule: true,
  AgGridProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AgGridReact: () => null,
}));

import { construirRenderers } from '../GrillaAnalisis';

const onRegistrarPlan = jest.fn();

function celdaPlan(fila: Partial<FilaAnalisis>) {
  const renderers = construirRenderers({
    sinPlanCodigos: new Set<string>(),
    hrefDeFila: (c) => `/sgsi/valoracion-riesgos?activo=${c}`,
    onRegistrarPlan,
    nombreDeCriticidad: new Map(),
  });
  const plan = renderers.plan;
  if (plan === undefined) throw new Error('la columna «Plan» no tiene renderizador');
  return render(<>{plan({ data: fila as FilaAnalisis })}</>);
}

const FILA_BASE: FilaAnalisis = {
  codigo: 'FIN-APP-0001',
  nombre: 'Siigo',
  valor: 5,
  valores: { D: 5, I: 4, C: 4 },
  criticidad: null,
  proceso: 'Gestión Financiera',
  propietario: null,
  persona: null,
  personaCorreo: null,
  cantidadAmenazas: 8,
  peorInherente: null,
  peorResidual: null,
  peorBrecha: null,
  estadoPlan: 'no-requiere',
  altoSinPlan: false,
  tienePlanes: false,
};

describe('la celda «Plan» ofrece lo que corresponde a lo que el activo TIENE', () => {
  // EL DEFECTO REPORTADO. Ocho planes, ninguna brecha pendiente, y la celda ofrecía crear uno
  // más sin ninguna forma de llegar a los ocho.
  it('con planes y sin brecha pendiente, enlaza a los planes que ya existen', () => {
    celdaPlan({ ...FILA_BASE, estadoPlan: 'no-requiere', tienePlanes: true });
    const enlace = screen.getByRole('link', { name: /ver los planes/i });
    expect(enlace).toHaveAttribute('href', '/sgsi/planes');
    // Y no ofrece crear: no hay nada que falte, y el botón robaba el único acceso a lo que hay.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // LAS DOS COSAS A LA VEZ, porque el activo ESTÁ en las dos situaciones a la vez. Hoy este
  // caso mostraba sólo el botón, que engaña en la otra dirección: esconde los planes que sí
  // existen.
  it('con planes Y brecha pendiente, muestra el enlace y el boton', () => {
    celdaPlan({ ...FILA_BASE, estadoPlan: 'pendiente', tienePlanes: true });
    expect(screen.getByRole('link', { name: /ver los planes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crear/i })).toBeInTheDocument();
  });

  it('sin planes, ofrece crear el primero y no enlaza a ninguna parte', () => {
    celdaPlan({ ...FILA_BASE, estadoPlan: 'pendiente', tienePlanes: false });
    expect(screen.getByRole('button', { name: /crear/i })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // «No se pudo evaluar» no es «no falta»: el aviso sigue estando aunque el activo ya tenga
  // planes, porque lo que no se sabe es si alcanzan.
  it('«sin evaluar» se sigue diciendo, tenga planes o no', () => {
    const { unmount } = celdaPlan({ ...FILA_BASE, estadoPlan: 'sin-determinar', tienePlanes: false });
    expect(screen.getByText('sin evaluar')).toBeInTheDocument();
    unmount();

    celdaPlan({ ...FILA_BASE, estadoPlan: 'sin-determinar', tienePlanes: true });
    expect(screen.getByText('sin evaluar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver los planes/i })).toBeInTheDocument();
  });

  // Los rótulos viven en `accesiblePlan` (`lib/sgsi/columnas-analisis.ts`), que es puro y está
  // probado. Un rótulo escrito a mano dentro del JSX es un rótulo que nadie vuelve a mirar: en
  // seis meses nadie sabría que había cuatro estados y no tres.
  it('ningun rotulo de la celda esta escrito a mano en el JSX', () => {
    const fuente = fs.readFileSync(
      path.join(process.cwd(), 'app/components/sgsi/valoracion-riesgos/GrillaAnalisis.tsx'),
      'utf8',
    );
    expect(fuente).not.toMatch(/['"`]Ver los planes/);
    expect(fuente).not.toMatch(/['"`]Crear (un|otro) plan/);
  });
});
