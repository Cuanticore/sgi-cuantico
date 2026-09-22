// lib/sgsi/__tests__/planes-libro.test.ts
//
// El libro de «Planes de tratamiento» construido en memoria, leído de vuelta con exceljs.
// Sin ruta, sin sesión, sin base — lo que se prueba es cómo se ve el ARCHIVO, igual que
// `consolidado-libro.test.ts` prueba el suyo.

import ExcelJS from 'exceljs';
import {
  construirLibroPlanes,
  type ContextoLibroPlanes,
  type FilaPlan,
  type FilaRiesgoAlto,
} from '../planes-libro';
import type { NivelRiesgo } from '../riesgo-activo';

const CRITICO: NivelRiesgo = { nivel: 5, banda: 'Crítico', figura: '25' };
const ALTO: NivelRiesgo = { nivel: 4, banda: 'Alto', figura: '16' };

const RIESGO_CON_PLAN: FilaRiesgoAlto = {
  codigo: 'COM-APP-0001',
  nombre: 'CRM comercial',
  proceso: 'Gestión Comercial',
  propietario: 'CEO',
  valor: 4,
  valores: { D: 4, I: 3, C: 4 },
  criticidad: 'Alta',
  peorInherente: CRITICO,
  peorResidual: ALTO,
  amenazasAltas: 2,
  planes: ['PT-0001', 'PT-0002'],
};

// Sin planes y con el residual sin calcular: el caso que no puede pintarse de nada.
const RIESGO_SIN_PLAN: FilaRiesgoAlto = {
  codigo: 'COM-APP-0002',
  nombre: 'ERP financiero',
  proceso: 'Gestión Financiera',
  propietario: null,
  valor: 5,
  valores: { D: 5, I: 4, C: 3 },
  criticidad: null,
  peorInherente: CRITICO,
  peorResidual: null,
  amenazasAltas: 3,
  planes: [],
};

const PLAN_CON_CONTROL: FilaPlan = {
  codigo: 'PT-0001',
  accion: 'Implementar MFA en el acceso remoto',
  tipo: 'Preventivo',
  controlCodigo: 'A.9.4.2',
  controlNombre: 'Procedimientos seguros de inicio de sesión',
  madurezActual: 1,
  madurezObjetivo: 3,
  salto: 2,
  queMitiga: 'Acceso no autorizado por credenciales robadas',
  responsable: 'Líder de Tecnología',
  aprueba: 'Comité SIG',
  fechaObjetivo: '2026-12-31',
  estado: 'En curso',
  avance: 40,
  verificacion: 'Revisión de logs de acceso mensual',
  madurezAlcanzada: 2,
  origen: 'Hallazgo de auditoría interna 2026-03',
  recursos: 'Licencias de MFA',
  observacion: null,
  fechaAprobacion: '2026-04-01',
  fechaCierre: null,
  instrumento: 'Acta de comité 2026-04-01',
  riesgoRemanente: null,
  justificacionAceptacion: null,
  fechaRevisionAceptacion: null,
};

// Una acción de aceptación, sin control: el caso que no puede sacar ceros donde no aplica.
const PLAN_SIN_CONTROL: FilaPlan = {
  codigo: 'PT-0002',
  accion: 'Aceptar el riesgo residual del proveedor único',
  tipo: 'Aceptación',
  controlCodigo: null,
  controlNombre: null,
  madurezActual: null,
  madurezObjetivo: null,
  salto: null,
  queMitiga: 'Dependencia de un proveedor único',
  responsable: 'Dirección General',
  aprueba: 'Comité SIG',
  fechaObjetivo: null,
  estado: 'Aprobado',
  avance: 100,
  verificacion: 'N/A',
  madurezAlcanzada: null,
  origen: 'Decisión de negocio',
  recursos: null,
  observacion: 'Riesgo aceptado formalmente',
  fechaAprobacion: '2026-05-10',
  fechaCierre: '2026-05-10',
  instrumento: null,
  riesgoRemanente: 'Bajo',
  justificacionAceptacion: 'Costo de mitigación superior al impacto',
  fechaRevisionAceptacion: '2027-05-10',
};

// Mismo residual sin calcular que RIESGO_SIN_PLAN, pero CON plan: aísla la regla «un nivel
// null no se pinta» del tinte de renglón —que se pinta por falta de plan, no por banda—.
const RIESGO_SIN_CALCULAR_CON_PLAN: FilaRiesgoAlto = {
  ...RIESGO_SIN_PLAN,
  codigo: 'COM-APP-0003',
  planes: ['PT-0003'],
};

const CTX: ContextoLibroPlanes = { totalVigentes: 393, totalAcciones: 40, filtro: null };

function fondoDe(celda: ExcelJS.Cell): string | undefined {
  const fill = celda.fill as { fgColor?: { argb?: string } } | undefined;
  return fill?.fgColor?.argb;
}

describe('construirLibroPlanes · hojas', () => {
  it('tiene dos hojas, con esos nombres y en ese orden', async () => {
    const wb = await construirLibroPlanes([RIESGO_CON_PLAN], [PLAN_CON_CONTROL], CTX);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Riesgos altos', 'Planes de tratamiento']);
  });

  it('con cero filas el libro se genera igual, con sus dos hojas y sus notas', async () => {
    const wb = await construirLibroPlanes([], [], CTX);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Riesgos altos', 'Planes de tratamiento']);
    const hoja1 = wb.getWorksheet('Riesgos altos')!;
    const hoja2 = wb.getWorksheet('Planes de tratamiento')!;
    expect(String(hoja1.getCell('A2').value)).toContain('0 activos');
    expect(String(hoja2.getCell('A2').value)).toContain('0 acciones');
  });
});

describe('construirLibroPlanes · hoja «Riesgos altos»', () => {
  it('trae una fila por activo, con el código en la primera celda', async () => {
    const wb = await construirLibroPlanes([RIESGO_CON_PLAN, RIESGO_SIN_PLAN], [], CTX);
    const hoja = wb.getWorksheet('Riesgos altos')!;
    // Fila 1 título, fila 2 nota, fila 3 encabezados: los activos arrancan en la 4.
    expect(hoja.getCell(4, 1).value).toBe('COM-APP-0001');
    expect(hoja.getCell(5, 1).value).toBe('COM-APP-0002');
  });

  it('la celda de banda lleva el mismo color que colorDeNivel da para esa banda', async () => {
    const wb = await construirLibroPlanes([RIESGO_CON_PLAN], [], CTX);
    const hoja = wb.getWorksheet('Riesgos altos')!;
    // Columna 11 · Peor residual. --hf-risk-alto-bg es #c25a1e en app/globals.css.
    const celda = hoja.getCell(4, 11);
    expect(fondoDe(celda)).toBe('FFC25A1E');
  });

  it('un peorResidual null no se pinta y dice «sin calcular»', async () => {
    const wb = await construirLibroPlanes([RIESGO_SIN_CALCULAR_CON_PLAN], [], CTX);
    const hoja = wb.getWorksheet('Riesgos altos')!;
    const celda = hoja.getCell(4, 11);
    expect(celda.value).toBe('sin calcular');
    expect(fondoDe(celda)).toBeUndefined();
  });

  it('el renglón sin planes lleva el relleno FFFDECEB; el que tiene planes, no', async () => {
    const wb = await construirLibroPlanes([RIESGO_CON_PLAN, RIESGO_SIN_PLAN], [], CTX);
    const hoja = wb.getWorksheet('Riesgos altos')!;
    expect(fondoDe(hoja.getCell(5, 1))).toBe('FFFDECEB'); // sin plan
    expect(fondoDe(hoja.getCell(4, 1))).not.toBe('FFFDECEB'); // con plan
  });

  it('la fila 2 dice el alcance con las dos cifras', async () => {
    const wb = await construirLibroPlanes([RIESGO_CON_PLAN], [], CTX);
    const hoja = wb.getWorksheet('Riesgos altos')!;
    expect(hoja.getCell('A2').value).toBe(
      '1 activos con riesgo residual en banda Alto, de 393 vigentes. La banda Crítico no ' +
        'tiene filas: su umbral (25) está por encima del residual máximo que el modelo puede ' +
        'producir. Este filtro NO depende del filtro de la pantalla.',
    );
  });
});

describe('construirLibroPlanes · hoja «Planes de tratamiento»', () => {
  it('saca las columnas en el orden de la pantalla', async () => {
    const wb = await construirLibroPlanes([], [PLAN_CON_CONTROL], CTX);
    const hoja = wb.getWorksheet('Planes de tratamiento')!;
    expect(hoja.getCell(3, 1).value).toBe('Código');
    expect(hoja.getCell(3, 2).value).toBe('Acción');
    expect(hoja.getCell(3, 11).value).toBe('Estado');
  });

  it('una acción sin control saca «sin control» y celdas vacías, no ceros, en las tres de madurez', async () => {
    const wb = await construirLibroPlanes([], [PLAN_SIN_CONTROL], CTX);
    const hoja = wb.getWorksheet('Planes de tratamiento')!;
    expect(hoja.getCell(4, 4).value).toBe('sin control');
    expect(hoja.getCell(4, 5).value == null).toBe(true); // Madurez actual
    expect(hoja.getCell(4, 6).value == null).toBe(true); // Madurez objetivo
    expect(hoja.getCell(4, 7).value == null).toBe(true); // Salto
    // Ninguna es cero: sería decir que el salto es cero, y no aplica.
    expect(hoja.getCell(4, 5).value).not.toBe(0);
    expect(hoja.getCell(4, 6).value).not.toBe(0);
    expect(hoja.getCell(4, 7).value).not.toBe(0);
  });

  it('una acción con control saca sus tres cifras de madurez', async () => {
    const wb = await construirLibroPlanes([], [PLAN_CON_CONTROL], CTX);
    const hoja = wb.getWorksheet('Planes de tratamiento')!;
    expect(hoja.getCell(4, 4).value).toBe('A.9.4.2 · Procedimientos seguros de inicio de sesión');
    expect(hoja.getCell(4, 5).value).toBe(1);
    expect(hoja.getCell(4, 6).value).toBe(3);
    expect(hoja.getCell(4, 7).value).toBe(2);
  });

  it('los null de texto salen como «—»', async () => {
    const wb = await construirLibroPlanes([], [PLAN_SIN_CONTROL], CTX);
    const hoja = wb.getWorksheet('Planes de tratamiento')!;
    expect(hoja.getCell(4, 10).value).toBe('—'); // Fecha objetivo
    expect(hoja.getCell(4, 21).value).toBe('—'); // Instrumento
  });

  it('la nota dice cuántas acciones exporta de cuántas activas', async () => {
    const wb = await construirLibroPlanes([], [PLAN_CON_CONTROL, PLAN_SIN_CONTROL], CTX);
    const hoja = wb.getWorksheet('Planes de tratamiento')!;
    expect(hoja.getCell('A2').value).toBe('2 acciones de 40 activas. Sin filtro.');
  });

  it('la nota dice el filtro cuando lo hay, y «Sin filtro» cuando no', async () => {
    const conFiltro: ContextoLibroPlanes = {
      totalVigentes: 393,
      totalAcciones: 40,
      filtro: 'Estado = En curso',
    };
    const wbCon = await construirLibroPlanes([], [PLAN_CON_CONTROL], conFiltro);
    expect(wbCon.getWorksheet('Planes de tratamiento')!.getCell('A2').value).toBe(
      '1 acciones de 40 activas. Filtro aplicado: Estado = En curso.',
    );

    const wbSin = await construirLibroPlanes([], [PLAN_CON_CONTROL], CTX);
    expect(wbSin.getWorksheet('Planes de tratamiento')!.getCell('A2').value).toBe(
      '1 acciones de 40 activas. Sin filtro.',
    );
  });
});
