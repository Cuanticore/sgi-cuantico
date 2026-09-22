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
  altoSinPlan: false,
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
  altoSinPlan: true,
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
// null no se pinta» del tinte de renglón —que se pinta por el riesgo alto que queda sin
// cubrir, no por banda—. `altoSinPlan` en false a propósito y no heredado: si el renglón
// entero se tiñera, la celda de banda quedaría con relleno y esta prueba ya no podría
// distinguir «no se pintó por ser null» de «se pintó por el acento».
const RIESGO_SIN_CALCULAR_CON_PLAN: FilaRiesgoAlto = {
  ...RIESGO_SIN_PLAN,
  codigo: 'COM-APP-0003',
  planes: ['PT-0003'],
  altoSinPlan: false,
};

// EL CASO QUE SEPARA LAS DOS REGLAS. Tiene un plan —cubre una de sus brechas— y le queda
// ADEMÁS otro riesgo en banda alta que ningún plan cubre.
//
// La regla que se descarta es `planes.length === 0`: con ella este renglón sale BLANCO,
// porque «tiene planes», mientras la grilla de análisis lo pinta rojo con `altoSinPlan`. Dos
// piezas contestando la misma pregunta desde orígenes distintos — y este archivo se archiva y
// se lleva a comité, así que la discrepancia sobrevive a la sesión en que se vea.
//
// Sin este caso la prueba pasaría con cualquiera de las dos reglas: en todas las demás filas
// «sin ningún plan» y «le queda un alto suelto» coinciden.
const RIESGO_CON_PLAN_Y_ALTO_SUELTO: FilaRiesgoAlto = {
  ...RIESGO_CON_PLAN,
  codigo: 'COM-APP-0004',
  planes: ['PT-0001'],
  altoSinPlan: true,
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

  it('el acento sale de altoSinPlan y no de que la lista de planes esté vacía', async () => {
    const wb = await construirLibroPlanes(
      [RIESGO_CON_PLAN, RIESGO_CON_PLAN_Y_ALTO_SUELTO, RIESGO_SIN_PLAN],
      [],
      CTX,
    );
    const hoja = wb.getWorksheet('Riesgos altos')!;
    expect(fondoDe(hoja.getCell(4, 1))).not.toBe('FFFDECEB'); // con plan y nada suelto
    // Con planes Y un alto sin cubrir: la regla vieja lo dejaba blanco y la grilla lo pintaba
    // rojo. Es el renglón que hacía que el archivo y la pantalla dijeran cosas distintas.
    expect(fondoDe(hoja.getCell(5, 1))).toBe('FFFDECEB');
    expect(fondoDe(hoja.getCell(6, 1))).toBe('FFFDECEB'); // sin ningún plan
  });

  it('el acento no toca la columna «Planes» ni «Estado del plan»: siguen diciendo qué hay', async () => {
    // El color contesta «¿queda algo sin cubrir?» y las dos columnas «¿qué plan hay?». Son
    // preguntas distintas y un renglón rojo que dijera «sin plan» teniendo PT-0001 registrado
    // borraría el trabajo que sí se hizo.
    const wb = await construirLibroPlanes([RIESGO_CON_PLAN_Y_ALTO_SUELTO], [], CTX);
    const hoja = wb.getWorksheet('Riesgos altos')!;
    expect(hoja.getCell(4, 13).value).toBe('PT-0001');
    expect(hoja.getCell(4, 14).value).toBe('Con plan');
  });

  // La nota sólo dice lo verificable hoy: NO afirma que la banda Crítico sea inalcanzable
  // con la escala actual, porque eso es falso —`eficacia-agregada.test.ts:100-105` calcula
  // un residual de 25.60 y 28.80, ambos en Crítico—. Lo que hoy no hay son PARES con
  // relevancia asignada para que esa cuenta dispare con datos reales, y eso es deuda
  // pendiente, no una ley de la escala.
  it('la fila 2 dice el alcance con las dos cifras, sin afirmar que Crítico sea imposible', async () => {
    const wb = await construirLibroPlanes([RIESGO_CON_PLAN], [], CTX);
    const hoja = wb.getWorksheet('Riesgos altos')!;
    expect(hoja.getCell('A2').value).toBe(
      '1 activos con riesgo residual en banda Alto, de 393 vigentes. Ninguno tiene riesgos en ' +
        'banda Crítico. Este filtro NO depende del filtro de la pantalla.',
    );
  });

  // Sin este test la palabra para «no declarada» quedaba fijada sólo leyendo el código —
  // exactamente lo que la Regla 1 no acepta. `RIESGO_SIN_PLAN` ya trae `criticidad: null`.
  it('un criticidad null sale como «sin clasificar»', async () => {
    const wb = await construirLibroPlanes([RIESGO_SIN_PLAN], [], CTX);
    const hoja = wb.getWorksheet('Riesgos altos')!;
    expect(hoja.getCell(4, 9).value).toBe('sin clasificar');
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

  // Igual doctrina que las tres columnas de madurez del plan sin control: una `madurezAlcanzada`
  // en cero afirmaría que la verificación midió cero, y lo que pasa es que todavía no hay
  // verificación que reportar. La aserción negativa es la que de verdad prueba algo — sin ella,
  // un `0` habría pasado la positiva igual de bien si sólo se comprobara con `==`.
  it('una madurezAlcanzada null deja la celda vacía, no en cero', async () => {
    const wb = await construirLibroPlanes([], [PLAN_SIN_CONTROL], CTX);
    const hoja = wb.getWorksheet('Planes de tratamiento')!;
    const celda = hoja.getCell(4, 14);
    expect(celda.value == null).toBe(true);
    expect(celda.value).not.toBe(0);
    expect(celda.value).not.toBe('—');
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

  // COLUMNAS_PLANES (encabezados) y el `addRow` de valores son dos listas paralelas
  // mantenidas a mano: insertar un campo en una y olvidarlo en la otra desplaza todo lo que
  // sigue sin que nada falle — nueve columnas de las 24 no tenían ni una prueba posicional
  // que lo hubiera atrapado. Un fixture completo, recorriendo las 24 posiciones de una vez,
  // es más barato de mantener que nueve pruebas sueltas y cubre exactamente el defecto que
  // una lista paralela puede tener: el desplazamiento silencioso.
  it('saca las 24 columnas en su encabezado y su valor, posición por posición', async () => {
    const wb = await construirLibroPlanes([], [PLAN_CON_CONTROL], CTX);
    const hoja = wb.getWorksheet('Planes de tratamiento')!;

    // [encabezado, valor esperado en la fila 4 —PLAN_CON_CONTROL—], en el orden de columna.
    // Los `null` de PLAN_CON_CONTROL (observacion, fechaCierre, instrumento... no, instrumento
    // SÍ tiene valor; los que son null: observacion, fechaCierre, riesgoRemanente,
    // justificacionAceptacion, fechaRevisionAceptacion) quedan como «—», que es la misma regla
    // que ya prueba «los null de texto salen como —».
    const ESPERADO: [string, string | number][] = [
      ['Código', 'PT-0001'],
      ['Acción', 'Implementar MFA en el acceso remoto'],
      ['Tipo', 'Preventivo'],
      ['Control', 'A.9.4.2 · Procedimientos seguros de inicio de sesión'],
      ['Madurez actual', 1],
      ['Madurez objetivo', 3],
      ['Salto', 2],
      ['Qué mitiga', 'Acceso no autorizado por credenciales robadas'],
      ['Responsable', 'Líder de Tecnología'],
      ['Fecha objetivo', '2026-12-31'],
      ['Estado', 'En curso'],
      ['Avance', 40],
      ['Verificación', 'Revisión de logs de acceso mensual'],
      ['Madurez alcanzada', 2],
      ['Aprueba', 'Comité SIG'],
      ['Origen y justificación', 'Hallazgo de auditoría interna 2026-03'],
      ['Recursos', 'Licencias de MFA'],
      ['Observaciones', '—'],
      ['Fecha de aprobación', '2026-04-01'],
      ['Fecha de cierre', '—'],
      ['Instrumento', 'Acta de comité 2026-04-01'],
      ['Riesgo remanente', '—'],
      ['Justificación de la aceptación', '—'],
      ['Fecha de revisión', '—'],
    ];

    expect(ESPERADO).toHaveLength(24);
    ESPERADO.forEach(([encabezado, valor], i) => {
      const columna = i + 1;
      expect(hoja.getCell(3, columna).value).toBe(encabezado);
      expect(hoja.getCell(4, columna).value).toBe(valor);
    });
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
