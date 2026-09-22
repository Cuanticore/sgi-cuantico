// lib/sgsi/__tests__/analisis-libro.test.ts
//
// El libro de «Análisis de riesgos» construido en memoria y leído de vuelta con exceljs.
// Sin ruta, sin sesión, sin base — lo que se prueba es cómo se ve el ARCHIVO, igual que
// `planes-libro.test.ts` prueba el suyo.
//
// POR QUÉ EXISTE ESTE ARCHIVO. Las columnas «Peor inherente» y «Peor residual» salían en
// texto plano: `argb()` no sabía resolver el `var(--hf-risk-*)` que devuelve `colorDeNivel`,
// devolvía `''`, y `pintarBanda` se salía antes del relleno y antes de la fuente. El defecto
// sobrevivió porque ninguna prueba leía el archivo generado —sólo la clase en pantalla—, y
// eso es justamente lo que estas aserciones hacen.

import ExcelJS from 'exceljs';
import {
  construirLibroAnalisis,
  type ContextoLibroAnalisis,
  type FilaAnalisisExport,
} from '../analisis-libro';
import type { NivelRiesgo } from '../riesgo-activo';

const CRITICO: NivelRiesgo = { nivel: 5, banda: 'Crítico', figura: '25' };
const ALTO: NivelRiesgo = { nivel: 4, banda: 'Alto', figura: '16' };
const MEDIO: NivelRiesgo = { nivel: 3, banda: 'Medio', figura: '9' };
const BAJO: NivelRiesgo = { nivel: 2, banda: 'Bajo', figura: '4' };

const FILA: FilaAnalisisExport = {
  codigo: 'COM-APP-0001',
  nombre: 'CRM comercial',
  valor: 4,
  valores: { D: 4, I: 3, C: 4 },
  criticidad: 'Alta',
  proceso: 'Gestión Comercial',
  propietario: 'CEO',
  cantidadAmenazas: 7,
  peorInherente: CRITICO,
  peorResidual: ALTO,
  estadoPlan: 'con-plan',
};

// Residual sin calcular y banda MEDIA en el inherente: el residual null es el caso que no
// puede pintarse de nada, y un inherente medio mantiene el renglón fuera del tinte
// «alarmante» — si el renglón entero se tiñera, no se podría distinguir «no se pintó por ser
// null» de «se pintó por el acento de fila».
const FILA_SIN_RESIDUAL: FilaAnalisisExport = {
  ...FILA,
  codigo: 'COM-APP-0002',
  peorInherente: MEDIO,
  peorResidual: null,
  estadoPlan: 'pendiente',
};

const CTX: ContextoLibroAnalisis = { enAnalisis: 30, totalVigentes: 378, umbral: 3 };

function fondoDe(celda: ExcelJS.Cell): string | undefined {
  const fill = celda.fill as { fgColor?: { argb?: string } } | undefined;
  return fill?.fgColor?.argb;
}

function tintaDe(celda: ExcelJS.Cell): string | undefined {
  return (celda.font as { color?: { argb?: string } } | undefined)?.color?.argb;
}

/// Fila 1 título, fila 2 nota, fila 3 encabezados: los activos arrancan en la 4.
const PRIMERA_FILA = 4;
const COL_INHERENTE = 12;
const COL_RESIDUAL = 13;

describe('construirLibroAnalisis · las celdas de banda se pintan', () => {
  it('«Peor inherente» lleva el hex de su banda, no queda sin relleno', async () => {
    const wb = await construirLibroAnalisis([FILA], CTX);
    const hoja = wb.getWorksheet('Análisis de riesgos')!;
    const celda = hoja.getCell(PRIMERA_FILA, COL_INHERENTE);
    // --hf-risk-critico-bg es #a52016 y su -fg #ffffff, en app/globals.css.
    expect(fondoDe(celda)).toBe('FFA52016');
    expect(tintaDe(celda)).toBe('FFFFFFFF');
  });

  it('«Peor residual» lleva el hex de su banda', async () => {
    const wb = await construirLibroAnalisis([FILA], CTX);
    const hoja = wb.getWorksheet('Análisis de riesgos')!;
    const celda = hoja.getCell(PRIMERA_FILA, COL_RESIDUAL);
    // --hf-risk-alto-bg es #c25a1e y su -fg #ffffff.
    expect(fondoDe(celda)).toBe('FFC25A1E');
    expect(tintaDe(celda)).toBe('FFFFFFFF');
  });

  it('las bandas con tinta oscura no la pierden: Medio y Bajo', async () => {
    const wb = await construirLibroAnalisis(
      [
        { ...FILA, codigo: 'A', peorInherente: MEDIO, peorResidual: MEDIO, estadoPlan: 'con-plan' },
        { ...FILA, codigo: 'B', peorInherente: BAJO, peorResidual: BAJO, estadoPlan: 'no-requiere' },
      ],
      CTX,
    );
    const hoja = wb.getWorksheet('Análisis de riesgos')!;
    // --hf-risk-medio-bg #e0b93c / -fg #3a2c05; --hf-risk-bajo-bg #dfe8e2 / -fg #3d5648.
    expect(fondoDe(hoja.getCell(PRIMERA_FILA, COL_RESIDUAL))).toBe('FFE0B93C');
    expect(tintaDe(hoja.getCell(PRIMERA_FILA, COL_RESIDUAL))).toBe('FF3A2C05');
    expect(fondoDe(hoja.getCell(PRIMERA_FILA + 1, COL_RESIDUAL))).toBe('FFDFE8E2');
    expect(tintaDe(hoja.getCell(PRIMERA_FILA + 1, COL_RESIDUAL))).toBe('FF3D5648');
  });

  it('un nivel null no se pinta y dice «sin calcular»', async () => {
    const wb = await construirLibroAnalisis([FILA_SIN_RESIDUAL], CTX);
    const hoja = wb.getWorksheet('Análisis de riesgos')!;
    const celda = hoja.getCell(PRIMERA_FILA, COL_RESIDUAL);
    expect(celda.value).toBe('sin calcular');
    expect(fondoDe(celda)).toBeUndefined();
  });

  it('la columna «Valor» sigue con el hex de su nivel', async () => {
    const wb = await construirLibroAnalisis([FILA], CTX);
    const hoja = wb.getWorksheet('Análisis de riesgos')!;
    // `colorDeNivelValor(4)` es el cuarto paso de la rampa azul: #1b3a8a.
    expect(fondoDe(hoja.getCell(PRIMERA_FILA, 4))).toBe('FF1B3A8A');
  });
});
