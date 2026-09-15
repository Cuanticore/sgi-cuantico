// app/components/sgsi/activos/__tests__/PestanaEcuacion.test.tsx
//
// REQ-SIG-20 D3 (tarea 2.3) · la pestaña Ecuación es de solo lectura y copiable como texto
// plano (spec risk-equation-traceability, "Read-only Ecuación tab, seven steps" + "Read-
// only and copyable as text"). Esta prueba no vuelve a calcular nada: arma un
// `EcuacionResuelta` con `resolverEcuacion` (la única aritmética, lib/sgsi/ecuacion.ts) y
// verifica que el componente lo MUESTRE y lo COPIE, no que lo recalcule.

import { fireEvent, render, screen } from '@testing-library/react';
import PestanaEcuacion from '../PestanaEcuacion';
import { resolverEcuacion } from '@/lib/sgsi/ecuacion';
import type { Catalogos } from '../ficha.query';

const CATALOGOS: Pick<Catalogos, 'bandasRiesgo'> = {
  bandasRiesgo: [
    { nombre: 'Crítico', desde: '25', hasta: '100000', orden: 1 },
    { nombre: 'Alto', desde: '5', hasta: '24.999', orden: 2 },
    { nombre: 'Medio', desde: '0.5', hasta: '4.999', orden: 3 },
    { nombre: 'Bajo', desde: '0', hasta: '0.499', orden: 4 },
  ],
};

function renderPestana() {
  const ecuacion = resolverEcuacion({
    valores: { D: 5, I: 5, C: 4 },
    degradaciones: { D: '1.00', I: '0', C: '0' },
    aro: 1,
    controles: [
      { codigo: 'A.8.20', nivel: 3, peso: 1, esPrincipal: false, relevancia: null },
      { codigo: 'A.8.6', nivel: 3, peso: 1, esPrincipal: false, relevancia: null },
    ],
  });

  render(
    <PestanaEcuacion
      codigoAmenaza="A.24"
      nombreAmenaza="Denegación de servicio"
      ecuacion={ecuacion}
      catalogos={CATALOGOS as Catalogos}
    />,
  );

  return ecuacion;
}

describe('PestanaEcuacion — solo lectura, siete pasos (D3, tarea 2.3)', () => {
  it('muestra los siete pasos con el residual coincidiendo con el que ya resolvió ecuacion.ts', () => {
    const ecuacion = renderPestana();

    expect(screen.getByText(/Ecuación — A\.24/)).toBeInTheDocument();
    expect(screen.getAllByText(/PASO/).length).toBe(7);
    // El residual mostrado es el mismo Decimal que produjo resolverEcuacion — no una
    // segunda cuenta hecha por el componente.
    expect(
      screen.getByText(new RegExp(ecuacion.residual!.toFixed(2).replace('.', '[.,]'))),
    ).toBeInTheDocument();
  });

  it('sin controles con relevancia asignada, el paso 5 avisa "sin relevancia asignada" y no ofrece desglose', () => {
    renderPestana();

    expect(screen.getByText(/sin relevancia asignada/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /desglose principal/i }),
    ).not.toBeInTheDocument();
  });

  it('copiar como texto deja las siete pasos en el portapapeles', async () => {
    const escribir = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: escribir } });

    renderPestana();
    fireEvent.click(screen.getByRole('button', { name: /copiar como texto/i }));

    expect(await screen.findByText('✓ Copiado')).toBeInTheDocument();
    expect(escribir).toHaveBeenCalledTimes(1);
    const copiado = escribir.mock.calls[0][0] as string;
    expect(copiado).toContain('1) valor = max(v_D, v_I, v_C)');
    expect(copiado).toContain('7) residual = impacto × ARO_res');
    expect(copiado.split('\n').length).toBeGreaterThanOrEqual(7);
  });
});

describe('PestanaEcuacion — el paso 5 expande cuando hay relevancia asignada', () => {
  it('con un control principal declarado, ofrece el desglose y lo muestra al abrirlo', () => {
    const ecuacion = resolverEcuacion({
      valores: { D: 5, I: 5, C: 4 },
      degradaciones: { D: '1.00', I: '0', C: '0' },
      aro: 1,
      controles: [
        { codigo: 'A.8.20', nivel: 2, peso: 3, esPrincipal: true, relevancia: 'Principal' },
        { codigo: 'A.8.6', nivel: 4, peso: 1, esPrincipal: false, relevancia: 'De apoyo' },
      ],
    });

    render(
      <PestanaEcuacion
        codigoAmenaza="A.24"
        nombreAmenaza="Denegación de servicio"
        ecuacion={ecuacion}
        catalogos={CATALOGOS as Catalogos}
      />,
    );

    const boton = screen.getByRole('button', { name: /ver desglose principal/i });
    fireEvent.click(boton);

    expect(screen.getByText(/A\.8\.20 · Principal · principal/)).toBeInTheDocument();
    expect(screen.getByText(/Techo del principal/)).toBeInTheDocument();
  });
});
