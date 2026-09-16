// app/components/sgsi/inventario/__tests__/ResolucionFaltantes.test.tsx
//
// Que un cargo no esté registrado no dice nada sobre si debe existir. Esta pantalla es la
// que convierte ese bloqueo en una decisión: crear el nombre del libro, o mapearlo a algo
// que ya está.

import { fireEvent, render, screen, within } from '@testing-library/react';
import ResolucionFaltantes from '../ResolucionFaltantes';
import type { Resolucion } from '@/lib/sgsi/catalogos-curables';

const OPCIONES = {
  cargo: ['CEO', 'CTO'],
  proveedor: ['Amazon Web Services', 'Microsoft'],
  ubicacion: [],
  entorno: [],
  area: ['Tecnología'],
};

const FALTANTES = [
  { catalogo: 'cargo' as const, valor: 'Architecture and Technology Manager', filas: [8, 12, 40] },
  { catalogo: 'proveedor' as const, valor: 'OpenAI', filas: [12] },
];

function montar(resoluciones: Resolucion[] = []) {
  const onCambiar = jest.fn();
  render(
    <ResolucionFaltantes
      faltantes={FALTANTES}
      opciones={OPCIONES}
      resoluciones={resoluciones}
      onCambiar={onCambiar}
      deshabilitado={false}
    />,
  );
  return { onCambiar };
}

describe('ResolucionFaltantes', () => {
  it('nombra cada faltante y dice cuántas filas lo piden', () => {
    montar();

    const cargo = screen.getByRole('group', { name: /Architecture and Technology Manager/ });
    // Tres filas, una decisión: es el punto de agrupar.
    expect(within(cargo).getByText(/3 filas/)).toBeInTheDocument();
    expect(within(cargo).getByText(/8, 12, 40/)).toBeInTheDocument();
  });

  it('usa singular cuando lo pide una sola fila', () => {
    montar();

    const proveedor = screen.getByRole('group', { name: /OpenAI/ });
    expect(within(proveedor).getByText(/1 fila\b/)).toBeInTheDocument();
  });

  it('crear informa el nombre exacto que va a quedar registrado', () => {
    const { onCambiar } = montar();

    const cargo = screen.getByRole('group', { name: /Architecture and Technology Manager/ });
    fireEvent.click(within(cargo).getByRole('radio', { name: /Crear/ }));

    expect(onCambiar).toHaveBeenCalledWith([
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', accion: 'crear', nombre: 'Architecture and Technology Manager' },
    ]);
  });

  it('mapear ofrece sólo los nombres que ese catálogo ya tiene', () => {
    // El componente es controlado: se monta ya en «mapear» porque quien decide el estado es
    // el popup, no el click.
    montar([
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', accion: 'mapear', destino: '' },
    ]);

    const cargo = screen.getByRole('group', { name: /Architecture and Technology Manager/ });
    const select = within(cargo).getByRole('combobox');
    expect(within(select).getByRole('option', { name: 'CTO' })).toBeInTheDocument();
    // Los proveedores no se ofrecen para un cargo.
    expect(within(select).queryByRole('option', { name: 'Microsoft' })).not.toBeInTheDocument();
  });

  it('elegir un destino lo reporta como mapeo', () => {
    const { onCambiar } = montar([
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', accion: 'mapear', destino: '' },
    ]);

    const cargo = screen.getByRole('group', { name: /Architecture and Technology Manager/ });
    fireEvent.change(within(cargo).getByRole('combobox'), { target: { value: 'CTO' } });

    expect(onCambiar).toHaveBeenCalledWith([
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', accion: 'mapear', destino: 'CTO' },
    ]);
  });

  it('un área no ofrece crear, y dice por qué', () => {
    render(
      <ResolucionFaltantes
        faltantes={[{ catalogo: 'area', valor: 'Innovación', filas: [8] }]}
        opciones={OPCIONES}
        resoluciones={[]}
        onCambiar={jest.fn()}
        deshabilitado={false}
      />,
    );

    const area = screen.getByRole('group', { name: /Innovación/ });
    expect(within(area).queryByRole('radio', { name: /Crear/ })).not.toBeInTheDocument();
    expect(within(area).getByText(/prefijo/i)).toBeInTheDocument();
  });

  it('avisa cuando un catálogo no tiene a dónde mapear', () => {
    render(
      <ResolucionFaltantes
        faltantes={[{ catalogo: 'entorno', valor: 'Staging', filas: [8] }]}
        opciones={OPCIONES}
        resoluciones={[]}
        onCambiar={jest.fn()}
        deshabilitado={false}
      />,
    );

    const entorno = screen.getByRole('group', { name: /Staging/ });
    expect(within(entorno).getByRole('radio', { name: /Usar uno existente/ })).toBeDisabled();
  });

  it('no deja tocar nada mientras la importación corre', () => {
    render(
      <ResolucionFaltantes
        faltantes={FALTANTES}
        opciones={OPCIONES}
        resoluciones={[]}
        onCambiar={jest.fn()}
        deshabilitado
      />,
    );

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});

describe('corregir el nombre al crear', () => {
  it('al elegir crear propone el nombre del libro, listo para corregir', () => {
    const { onCambiar } = montar();

    const proveedor = screen.getByRole('group', { name: /OpenAI/ });
    fireEvent.click(within(proveedor).getByRole('radio', { name: /Crear/ }));

    expect(onCambiar).toHaveBeenCalledWith([
      { catalogo: 'proveedor', valor: 'OpenAI', accion: 'crear', nombre: 'OpenAI' },
    ]);
  });

  it('el campo se puede editar, y lo editado es lo que se va a registrar', () => {
    // El V21 escribe «OpenIA» donde dice OpenAI. Sin este campo, el catálogo heredaría el
    // typo para siempre: `Proveedor.nombre` es único y corregirlo después es un renombre.
    const { onCambiar } = montar([
      { catalogo: 'proveedor', valor: 'OpenAI', accion: 'crear', nombre: 'OpenIA' },
    ]);

    const proveedor = screen.getByRole('group', { name: /OpenAI/ });
    const campo = within(proveedor).getByRole('textbox');
    expect(campo).toHaveValue('OpenIA');

    fireEvent.change(campo, { target: { value: 'OpenAI' } });

    expect(onCambiar).toHaveBeenCalledWith([
      { catalogo: 'proveedor', valor: 'OpenAI', accion: 'crear', nombre: 'OpenAI' },
    ]);
  });

  it('sin haber elegido crear no hay campo que editar', () => {
    montar();

    const proveedor = screen.getByRole('group', { name: /OpenAI/ });
    expect(within(proveedor).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('el campo se bloquea mientras la importación corre', () => {
    render(
      <ResolucionFaltantes
        faltantes={FALTANTES}
        opciones={OPCIONES}
        resoluciones={[{ catalogo: 'proveedor', valor: 'OpenAI', accion: 'crear', nombre: 'OpenAI' }]}
        onCambiar={jest.fn()}
        deshabilitado
      />,
    );

    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
