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
  type FilaRiesgoExport,
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
    const wb = await construirLibroAnalisis([FILA], [], CTX);
    const hoja = wb.getWorksheet('Por activo')!;
    const celda = hoja.getCell(PRIMERA_FILA, COL_INHERENTE);
    // --hf-risk-critico-bg es #a52016 y su -fg #ffffff, en app/globals.css.
    expect(fondoDe(celda)).toBe('FFA52016');
    expect(tintaDe(celda)).toBe('FFFFFFFF');
  });

  it('«Peor residual» lleva el hex de su banda', async () => {
    const wb = await construirLibroAnalisis([FILA], [], CTX);
    const hoja = wb.getWorksheet('Por activo')!;
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
      [],
      CTX,
    );
    const hoja = wb.getWorksheet('Por activo')!;
    // --hf-risk-medio-bg #e0b93c / -fg #3a2c05; --hf-risk-bajo-bg #dfe8e2 / -fg #3d5648.
    expect(fondoDe(hoja.getCell(PRIMERA_FILA, COL_RESIDUAL))).toBe('FFE0B93C');
    expect(tintaDe(hoja.getCell(PRIMERA_FILA, COL_RESIDUAL))).toBe('FF3A2C05');
    expect(fondoDe(hoja.getCell(PRIMERA_FILA + 1, COL_RESIDUAL))).toBe('FFDFE8E2');
    expect(tintaDe(hoja.getCell(PRIMERA_FILA + 1, COL_RESIDUAL))).toBe('FF3D5648');
  });

  it('un nivel null no se pinta y dice «sin calcular»', async () => {
    const wb = await construirLibroAnalisis([FILA_SIN_RESIDUAL], [], CTX);
    const hoja = wb.getWorksheet('Por activo')!;
    const celda = hoja.getCell(PRIMERA_FILA, COL_RESIDUAL);
    expect(celda.value).toBe('sin calcular');
    expect(fondoDe(celda)).toBeUndefined();
  });

  it('la columna «Valor» sigue con el hex de su nivel', async () => {
    const wb = await construirLibroAnalisis([FILA], [], CTX);
    const hoja = wb.getWorksheet('Por activo')!;
    // `colorDeNivelValor(4)` es el cuarto paso de la rampa azul: #1b3a8a.
    expect(fondoDe(hoja.getCell(PRIMERA_FILA, 4))).toBe('FF1B3A8A');
  });
});


// ── LA MATRIZ DE RIESGOS · una fila por par (activo, amenaza) ───────────────────────────
//
// POR QUÉ SE AGREGA ESTA HOJA. El libro sacaba una fila por ACTIVO, con el conteo de amenazas
// y el peor residual. Eso contesta «¿cuál activo está peor?», que no es la pregunta de una
// matriz de riesgos: ésa es «¿cuáles riesgos hay que tratar, y sobre qué activo?». Medido el
// 26/09/2026 sobre la base: 584 riesgos vigentes con residual, de los cuales **29 en banda
// Alto o Crítico, repartidos en 11 activos** — seis con cuatro amenazas cada uno y cinco con
// una. Esas 29 son las filas de esta hoja.
//
// EL Id NO SE INVENTA. Cada par (activo, amenaza) ya es un registro con código propio y
// estable —`R-0512`, `R-0400`—, el mismo que usan el motor, los planes y las actas. Generar un
// consecutivo sólo para el Excel le daría al archivo una identidad que ningún otro sitio del
// sistema reconoce: «el riesgo 17 de la matriz» no se podría encontrar en la aplicación. Es la
// misma fábrica de divergencia que costó cara con los nombres de nivel.

const RIESGO_ALTO: FilaRiesgoExport = {
  id: 'R-0512',
  amenazaCodigo: 'A.5',
  amenaza: 'Suplantación de la identidad del usuario',
  activoCodigo: 'COM-APP-0001',
  activoNombre: 'CRM comercial',
  valor: 4,
  valores: { D: 4, I: 3, C: 4 },
  criticidad: 'Alta',
  proceso: 'Gestión Comercial',
  propietario: 'CEO',
  residual: ALTO,
};

const RIESGO_CRITICO: FilaRiesgoExport = {
  ...RIESGO_ALTO,
  id: 'R-0400',
  amenazaCodigo: 'E.1',
  amenaza: 'Errores de los usuarios',
  residual: CRITICO,
};

async function libroConRiesgos(riesgos: readonly FilaRiesgoExport[]) {
  const wb = await construirLibroAnalisis([FILA], riesgos, CTX);
  return wb;
}

describe('la hoja de la matriz de riesgos', () => {
  it('el libro trae DOS hojas: la matriz y la de por activo', async () => {
    const wb = await libroConRiesgos([RIESGO_ALTO]);
    expect(wb.worksheets).toHaveLength(2);
  });

  it('la matriz va primero, porque es lo que se vino a buscar', async () => {
    const wb = await libroConRiesgos([RIESGO_ALTO]);
    expect(wb.worksheets[0].name).toBe('Matriz de riesgos');
    expect(wb.worksheets[1].name).toBe('Por activo');
  });

  it('una fila por riesgo, con el Id y la amenaza', async () => {
    const wb = await libroConRiesgos([RIESGO_ALTO, RIESGO_CRITICO]);
    const hoja = wb.worksheets[0];
    const ids = [hoja.getCell(4, 1).value, hoja.getCell(5, 1).value];
    expect(ids).toEqual(['R-0512', 'R-0400']);
    expect(hoja.getCell(4, 2).value).toBe('Suplantación de la identidad del usuario');
  });

  it('repite los datos del activo en cada fila, para que el filtro de Excel sirva', async () => {
    // Con celdas combinadas el autofiltro y el ordenamiento de Excel dejan de funcionar, y
    // este formato lleva filtro en todos los encabezados.
    const wb = await libroConRiesgos([RIESGO_ALTO, RIESGO_CRITICO]);
    const hoja = wb.worksheets[0];
    expect(hoja.getCell(4, 3).value).toBe('COM-APP-0001');
    expect(hoja.getCell(5, 3).value).toBe('COM-APP-0001');
  });

  it('el residual se pinta con el color de su banda, no en texto plano', async () => {
    const wb = await libroConRiesgos([RIESGO_ALTO]);
    const hoja = wb.worksheets[0];
    const relleno = hoja.getCell(4, 12).fill as ExcelJS.FillPattern | undefined;
    expect(relleno?.fgColor?.argb).toMatch(/^FF[0-9A-F]{6}$/);
  });
});

describe('la hoja por activo concentra las amenazas altas del activo', () => {
  it('lista las amenazas Alto y Crítico del activo en una celda', async () => {
    const wb = await construirLibroAnalisis([FILA], [RIESGO_ALTO, RIESGO_CRITICO], CTX);
    const hoja = wb.worksheets[1];
    const celda = String(hoja.getCell(4, 14).value ?? '');
    expect(celda).toContain('Suplantación de la identidad del usuario');
    expect(celda).toContain('Errores de los usuarios');
  });

  it('un activo sin amenazas altas deja la celda vacía, que es información', async () => {
    const wb = await construirLibroAnalisis([FILA], [], CTX);
    expect(String(wb.worksheets[1].getCell(4, 14).value ?? '')).toBe('');
  });
});


// ── LA CRITICIDAD, COMPLETA ────────────────────────────────────────────────────────────
//
// El archivo sacaba `C4` a secas mientras la PANTALLA muestra «Estándar». Dos vistas del
// mismo dato diciendo cosas distintas: quien exporta pierde la palabra que entiende y se
// queda con el código que hay que ir a buscar. El nombre ya viajaba en `criticidadesRto`
// para el tooltip de la grilla; acá sólo se lo pone en la celda.
//
// El CÓDIGO NO SE QUITA. Es el contrato con el negocio —los umbrales de exigencia se
// escriben en C1..C5— y un archivo que dijera sólo «Estándar» obligaría a traducir de vuelta.

describe('la celda de criticidad dice el código y el nombre', () => {
  const CON_NOMBRE = { ...FILA, criticidad: 'C4', criticidadNombre: 'Estándar' };
  const RIESGO_CON_NOMBRE = { ...RIESGO_ALTO, criticidad: 'C4', criticidadNombre: 'Estándar' };

  it('en la matriz', async () => {
    const wb = await construirLibroAnalisis([CON_NOMBRE], [RIESGO_CON_NOMBRE], CTX);
    expect(wb.worksheets[0].getCell(4, 9).value).toBe('C4 · Estándar');
  });

  it('y en la hoja por activo', async () => {
    const wb = await construirLibroAnalisis([CON_NOMBRE], [RIESGO_CON_NOMBRE], CTX);
    expect(wb.worksheets[1].getCell(4, 8).value).toBe('C4 · Estándar');
  });

  it('sin nombre registrado sale sólo el código, no un separador colgando', async () => {
    const wb = await construirLibroAnalisis(
      [{ ...FILA, criticidad: 'C4', criticidadNombre: null }],
      [{ ...RIESGO_ALTO, criticidad: 'C4', criticidadNombre: null }],
      CTX,
    );
    expect(wb.worksheets[0].getCell(4, 9).value).toBe('C4');
    expect(wb.worksheets[1].getCell(4, 8).value).toBe('C4');
  });

  it('un activo sin clasificar lo dice con palabras', async () => {
    const wb = await construirLibroAnalisis(
      [{ ...FILA, criticidad: null, criticidadNombre: null }],
      [],
      CTX,
    );
    expect(wb.worksheets[1].getCell(4, 8).value).toBe('sin clasificar');
  });
});
