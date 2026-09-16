// app/tecnologia/grafo/__tests__/Grafo.client.test.tsx
//
// El grafo tecnológico: el filtro por Nivel 1 / 2 / 3 y los defectos de legibilidad que el
// filtro por sí solo no arregla.
//
// Las cuatro funciones puras que alimentan esta pantalla tienen su suite en `lib/sig`. Acá se
// prueba lo que ninguna de ellas puede ver: que la pantalla las llame en el orden correcto y
// que lo que dibuja corresponda a lo que dice que está dibujando.

import { fireEvent, render, screen, within } from '@testing-library/react';
import GrafoClient, { type NodoGrafo } from '../Grafo.client';
import type { Arista } from '@/lib/sig/dependencias';
import type { Nivel } from '@/lib/sig/niveles';

const nivel = (id: number, grado: number, nombre: string, padreId: number | null, clase: Nivel['clase'] = null): Nivel => ({
  id,
  grado,
  nombre,
  padreId,
  clase,
  activo: true,
});

// PRODUCTOS ─┬─ MINTRACE ─── Ambientes
//            └─ CONDUCPRO ── Ambientes CP
// EMPRESA ────── Infraestructura ─ Servidores
const NIVELES: Nivel[] = [
  nivel(1, 1, 'PRODUCTOS', null, 'PRODUCTOS'),
  nivel(2, 2, 'MINTRACE', 1),
  nivel(3, 3, 'Ambientes', 2),
  nivel(4, 2, 'CONDUCPRO', 1),
  nivel(5, 3, 'Ambientes CP', 4),
  nivel(10, 1, 'EMPRESA', null, 'EMPRESA'),
  nivel(11, 2, 'Infraestructura', 10),
  nivel(12, 3, 'Servidores', 11),
];

// La columna NO viaja como dato: la calcula `columnasDelGrafo` sobre lo que se está
// dibujando. Mandarla desde el servidor sería el segundo origen del mismo número.
const nodo = (id: number, codigo: string, nombre: string, nivelId: number | null): NodoGrafo => ({
  id,
  codigo,
  nombre,
  criticidad: 4,
  nivelId,
});

const NODOS: NodoGrafo[] = [
  nodo(100, 'APP-01', 'Aplicación MINTRACE', 3),
  nodo(101, 'API-01', 'API MINTRACE', 3),
  nodo(102, 'SUE-01', 'Documentación MINTRACE', 3),
  nodo(200, 'SRV-01', 'Servidor de aplicaciones', 12),
  nodo(300, 'CRM-99', 'CRM comercial', null),
];

const DEPENDENCIAS: Arista[] = [
  { activoId: 100, dependeDeId: 200, tipo: 'SE_ALOJA_EN' },
  { activoId: 300, dependeDeId: 200, tipo: 'USA' },
];

// La API está DENTRO de la aplicación: contención, no dependencia.
const CONTENCION = [{ hijoId: 101, padreId: 100 }];

const DESPLIEGUES = [{ activoId: 101, servidorId: 200 }];

function dibujar() {
  return render(
    <GrafoClient
      nodos={NODOS}
      dependencias={DEPENDENCIAS}
      contencion={CONTENCION}
      despliegues={DESPLIEGUES}
      niveles={NIVELES}
      totalActivos={9}
    />,
  );
}

const lienzo = () => screen.getByRole('img');
const caja = (nombre: string | RegExp) => screen.getByLabelText(nombre);

describe('el grafo entra sin nada seleccionado', () => {
  it('no hay panel de detalle al montar', () => {
    // Hoy arranca con `nodos[0].id` —el de código más bajo, elegido por nadie— y todo lo demás
    // al 55 % de opacidad, sin forma de soltarlo.
    dibujar();
    expect(screen.queryByText('Vecinos directos')).not.toBeInTheDocument();
  });

  it('un clic en una caja abre el detalle', () => {
    dibujar();
    fireEvent.click(caja('APP-01 · Aplicación MINTRACE'));
    expect(screen.getByText('Vecinos directos')).toBeInTheDocument();
  });

  it('un clic en el fondo del lienzo suelta la selección', () => {
    dibujar();
    fireEvent.click(caja('APP-01 · Aplicación MINTRACE'));
    fireEvent.click(lienzo());
    expect(screen.queryByText('Vecinos directos')).not.toBeInTheDocument();
  });
});

describe('el resaltado dice la verdad en cada modo', () => {
  it('en «Jerarquía» los vecinos son los de contención, no los de dependencia', () => {
    // El defecto: `vecinos` se calculaba siempre con `dependencias`, así que en este modo el
    // panel listaba vecinos que no estaban dibujados y decía «Sin dependencias declaradas»
    // junto a un nodo con líneas punteadas a la vista.
    dibujar();
    fireEvent.click(screen.getByRole('button', { name: 'Jerarquía' }));
    fireEvent.click(caja('APP-01 · Aplicación MINTRACE'));
    const panel = screen.getByText('Vecinos directos').closest('section') as HTMLElement;
    expect(within(panel).getByText('API MINTRACE')).toBeInTheDocument();
    expect(within(panel).queryByText('Servidor de aplicaciones')).not.toBeInTheDocument();
  });

  it('en «Dependencias» los vecinos son los de dependencia', () => {
    dibujar();
    fireEvent.click(caja('APP-01 · Aplicación MINTRACE'));
    const panel = screen.getByText('Vecinos directos').closest('section') as HTMLElement;
    expect(within(panel).getByText('Servidor de aplicaciones')).toBeInTheDocument();
    expect(within(panel).queryByText('API MINTRACE')).not.toBeInTheDocument();
  });
});

describe('la convención nombra todos los trazos que dibuja', () => {
  it('«corre en» aparece cuando se encienden los despliegues', () => {
    // Se prendía el interruptor y surgía un tercer tipo de línea sin entrada en la convención.
    dibujar();
    fireEvent.click(screen.getByRole('button', { name: 'Ambas' }));
    fireEvent.click(screen.getByLabelText(/Sumar dónde corre cada activo/));
    expect(screen.getByText('corre en')).toBeInTheDocument();
  });

  it('«corre en» no aparece con el interruptor apagado', () => {
    dibujar();
    expect(screen.queryByText('corre en')).not.toBeInTheDocument();
  });
});

describe('el filtro por Nivel 1 / 2 / 3', () => {
  it('el selector de Nivel 2 se puebla sólo con los hijos del Nivel 1 elegido', () => {
    dibujar();
    fireEvent.change(screen.getByLabelText('Nivel 1'), { target: { value: '1' } });
    const n2 = screen.getByLabelText('Nivel 2') as HTMLSelectElement;
    const nombres = [...n2.options].map((o) => o.textContent);
    expect(nombres).toContain('MINTRACE');
    expect(nombres).toContain('CONDUCPRO');
    expect(nombres).not.toContain('Infraestructura');
  });

  it('cambiar el Nivel 1 limpia el Nivel 2 y el Nivel 3', () => {
    // Sin esto quedarían en un valor imposible: un nivel 2 que no cuelga del nivel 1 elegido.
    dibujar();
    fireEvent.change(screen.getByLabelText('Nivel 1'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Nivel 2'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Nivel 3'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Nivel 1'), { target: { value: '10' } });
    expect((screen.getByLabelText('Nivel 2') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Nivel 3') as HTMLSelectElement).value).toBe('');
  });

  it('filtrar MINTRACE deja los suyos y trae el servidor como frontera', () => {
    dibujar();
    fireEvent.change(screen.getByLabelText('Nivel 1'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Nivel 2'), { target: { value: '2' } });
    expect(caja('APP-01 · Aplicación MINTRACE')).toBeInTheDocument();
    expect(caja(/SRV-01 · Servidor de aplicaciones · fuera de la rama/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/CRM-99/)).not.toBeInTheDocument();
  });

  it('un nodo de frontera no se puede seleccionar', () => {
    // La frontera es contexto, no sujeto. Si se pudiera elegir, la pantalla prometería sobre
    // ella un detalle que el filtro no cargó.
    dibujar();
    fireEvent.change(screen.getByLabelText('Nivel 1'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Nivel 2'), { target: { value: '2' } });
    fireEvent.click(caja(/SRV-01 · Servidor de aplicaciones · fuera de la rama/));
    expect(screen.queryByText('Vecinos directos')).not.toBeInTheDocument();
  });

  it('el encabezado dice la ruta y las tres cifras, y las cifras cierran', () => {
    // Sin esta línea, un grafo filtrado es indistinguible de un grafo incompleto.
    dibujar();
    fireEvent.change(screen.getByLabelText('Nivel 1'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Nivel 2'), { target: { value: '2' } });
    expect(screen.getByText('PRODUCTOS · MINTRACE')).toBeInTheDocument();
    // 3 de MINTRACE + 1 de frontera + 5 fuera = los 9 activos vigentes.
    expect(screen.getByText('3 en la rama · 1 de frontera · 5 fuera')).toBeInTheDocument();
  });

  it('«Sin nivel» trae los activos sin clasificar y sólo ésos', () => {
    dibujar();
    fireEvent.change(screen.getByLabelText('Nivel 1'), { target: { value: 'sin-nivel' } });
    expect(caja('CRM-99 · CRM comercial')).toBeInTheDocument();
    expect(screen.queryByLabelText('APP-01 · Aplicación MINTRACE')).not.toBeInTheDocument();
  });

  it('«Todo» devuelve el grafo al estado inicial', () => {
    dibujar();
    fireEvent.change(screen.getByLabelText('Nivel 1'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Todo' }));
    expect((screen.getByLabelText('Nivel 1') as HTMLSelectElement).value).toBe('');
    expect(caja('CRM-99 · CRM comercial')).toBeInTheDocument();
    expect(screen.queryByText(/de frontera/)).not.toBeInTheDocument();
  });
});

describe('D11 · con filtro, los activos sueltos de la rama se dibujan', () => {
  it('sin filtro, un activo sin relaciones no se dibuja', () => {
    // Es el comportamiento actual y se conserva: doscientas cajas sueltas taparían las pocas
    // cadenas que hay.
    dibujar();
    expect(screen.queryByLabelText(/SUE-01/)).not.toBeInTheDocument();
  });

  it('con filtro, aparece y queda marcado', () => {
    // Esa razón desaparece cuando la rama tiene tres activos, y «qué activos de MINTRACE nadie
    // conectó con nada» es justamente el hallazgo.
    dibujar();
    fireEvent.change(screen.getByLabelText('Nivel 1'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Nivel 2'), { target: { value: '2' } });
    expect(caja(/SUE-01 · Documentación MINTRACE/)).toBeInTheDocument();
    expect(screen.getByText('sin relaciones declaradas')).toBeInTheDocument();
  });
});
