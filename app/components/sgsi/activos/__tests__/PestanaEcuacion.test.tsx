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
      { codigo: 'A.8.20', nivel: 90, peso: 1, esPrincipal: false, relevancia: null },
      { codigo: 'A.8.6', nivel: 90, peso: 1, esPrincipal: false, relevancia: null },
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

  it('sin controles con relevancia asignada, el paso 5 dice que calculó con la media simple v2', () => {
    renderPestana();

    // REQ-SIG-21 §7 · la pantalla dice CON QUÉ REGLA se calculó. Es el estado de las 57
    // amenazas de hoy, y sin este aviso la brecha de conformidad es invisible.
    expect(screen.getByText(/sin relevancia asignada/i)).toBeInTheDocument();
    expect(screen.getByText(/media simple \(MET-SIG-01 v2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/media ponderada acotada \(v3 §7\.4\)/i)).toBeInTheDocument();
    // Sin principal no hay reparto por clase que mostrar.
    expect(screen.queryByText(/PRINCIPAL/)).not.toBeInTheDocument();
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

describe('PestanaEcuacion — el desglose por clase cuando hay relevancia asignada (REQ-SIG-21 §7)', () => {
  function renderConRelevancia() {
    const ecuacion = resolverEcuacion({
      valores: { D: 5, I: 5, C: 4 },
      degradaciones: { D: '1.00', I: '0', C: '0' },
      aro: 1,
      controles: [
        { codigo: 'A.8.20', nivel: 0, peso: 3, esPrincipal: true, relevancia: 'Principal' },
        { codigo: 'A.8.6', nivel: 90, peso: 1, esPrincipal: false, relevancia: 'De apoyo' },
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

  it('muestra el reparto por clase con su media y su aporte, y el criterio de cada una', () => {
    renderConRelevancia();

    expect(screen.getByText(/Media ponderada acotada por el control principal/i)).toBeInTheDocument();
    expect(screen.getByText('PRINCIPAL')).toBeInTheDocument();
    // «DE APOYO», que es como el CATÁLOGO nombra a la clase `complementario` y como la ofrece
    // el selector con el que se clasifica. Esta línea exigía «COMPLEMENTARIO» y por eso el
    // rótulo cruzado nunca se puso rojo: el control del fixture es De apoyo (peso 1, el 10 %),
    // y en el catálogo «Complementario» es el otro grupo, el del 20 %.
    expect(screen.getByText('DE APOYO')).toBeInTheDocument();
    expect(screen.queryByText('COMPLEMENTARIO')).not.toBeInTheDocument();
    // Sin secundarios, el presupuesto se renormaliza y la pantalla lo dice en las dos
    // clases presentes: 70/10 pasa a 87.5/12.5.
    expect(screen.getAllByText(/renormalizado/i)).toHaveLength(2);
    expect(screen.getByText(/87,5% \(nominal 70%, renormalizado\)/)).toBeInTheDocument();
    // El criterio de cada clase va en pantalla, para poder discutir una clasificación sin
    // abrir el .docx.
    expect(screen.getByText(/Sin este control la amenaza no se contiene/i)).toBeInTheDocument();
  });

  it('cuando el techo actúa, lo dice y nombra al principal como la única palanca', () => {
    renderConRelevancia();

    // Principal en 0 % —el control no existe— y un complementario en 90 %: la bruta
    // renormalizada llega a 87.5 % × 0 + 12.5 % × 0.9 = 11.25 %, y el techo la corta a
    // 10 % (0 + δ). Es el caso que justifica el techo: sin él, el presupuesto de las otras
    // clases dejaría la amenaza en 11 % de eficacia con su control clave inexistente.
    //
    // La fixture pasó de un principal en 50 % a uno en 0 % PORQUE δ subió a un escalón
    // (REQ-SIG-24): con el principal en 50 % el techo queda en 60 % y la bruta en 55 %, así
    // que ya no recorta nada y la prueba habría dejado de ejercer lo que dice ejercer.
    expect(screen.getByText(/El techo actúa/i)).toBeInTheDocument();
    expect(screen.getByText(/Subir el control\s+principal es lo único que mueve este riesgo/i)).toBeInTheDocument();
  });

  it('el detalle control por control sigue disponible', () => {
    renderConRelevancia();

    fireEvent.click(screen.getByRole('button', { name: /ver el detalle control por control/i }));
    expect(screen.getByText(/A\.8\.20 · Principal · principal/)).toBeInTheDocument();
  });

  it('el texto copiable dice con qué regla salió el número', async () => {
    const escribir = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: escribir } });

    renderConRelevancia();
    fireEvent.click(screen.getByRole('button', { name: /copiar como texto/i }));
    expect(await screen.findByText('✓ Copiado')).toBeInTheDocument();

    const copiado = escribir.mock.calls[0][0] as string;
    expect(copiado).toContain('principal ·');
    expect(copiado).toContain('techo del principal');
    expect(copiado).toContain('ACTÚA');
  });
});
