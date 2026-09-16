// lib/sgsi/__tests__/plan-importacion.test.ts
//
// La lectura de FOR-SIG-13. Lo que se prueba es lo que la importación DECIDE: qué entra, qué
// se rechaza y con qué motivo — y sobre todo, que nada desaparezca en el camino.

import {
  avance,
  COLUMNA,
  ENCABEZADOS,
  fecha,
  leerFilas,
  normalizar,
  origenImportado,
  texto,
  type CatalogosImportacion,
} from '../plan-importacion';

const CATALOGOS: CatalogosImportacion = {
  controlesPorCodigo: new Map([
    ['A.5.15', 11],
    ['A.8.14', 22],
  ]),
  controlesPorNombre: new Map([['control de acceso', 11]]),
  cargosPorNombre: new Map([
    ['jefe de tecnologia', 1],
    ['gerente general', 2],
  ]),
  madurezPorNivel: new Map([
    [0, 90],
    [50, 95],
    [100, 99],
  ]),
};

/// Arma una fila completa y válida, para que cada prueba cambie sólo lo que le interesa.
function fila(over: Record<number, unknown> = {}): unknown[] {
  const f: unknown[] = new Array(ENCABEZADOS.length).fill(null);
  f[COLUMNA.tipoPlan] = 'Plan de Tratamiento de Riesgos';
  f[COLUMNA.actividad] = 'Implementar doble factor';
  f[COLUMNA.propietarioRiesgo] = 'Gerente General';
  f[COLUMNA.responsableEjecucion] = 'Jefe de Tecnología';
  f[COLUMNA.tipoAccion] = 'Mitigar';
  f[COLUMNA.control] = 'A.5.15';
  f[COLUMNA.fechaTerminacion] = '2027-06-30';
  for (const [k, v] of Object.entries(over)) f[Number(k)] = v;
  return f;
}

describe('los ayudantes de celda', () => {
  it('una celda vacía es null y no cadena vacía', () => {
    // En el modelo «sin observación» es null; guardar '' haría que la pantalla mostrara un
    // campo vacío donde debería no mostrar nada.
    expect(texto('   ')).toBeNull();
    expect(texto(null)).toBeNull();
    expect(texto('  hola  ')).toBe('hola');
  });

  it('lee el texto enriquecido que ExcelJS devuelve como objeto', () => {
    expect(texto({ richText: [{ text: 'Doble ' }, { text: 'factor' }] })).toBe('Doble factor');
  });

  it('normalizar ignora los acentos: no se rechaza una fila por una tilde', () => {
    expect(normalizar('Jefe de Tecnología')).toBe(normalizar('JEFE DE TECNOLOGIA'));
  });

  it('acepta la fecha como se escribe a mano en Colombia', () => {
    expect(fecha('30/06/2027')).toBe('2027-06-30');
    expect(fecha('1/2/2027')).toBe('2027-02-01');
    expect(fecha('2027-06-30')).toBe('2027-06-30');
  });

  it('una fecha de ExcelJS no se corre un día', () => {
    // ExcelJS entrega UTC. Con `getDate()` local, en Bogotá una medianoche UTC devuelve el día
    // ANTERIOR, y un plan que vence el 30 se guardaría venciendo el 29.
    expect(fecha(new Date(Date.UTC(2027, 5, 30)))).toBe('2027-06-30');
  });

  it('distingue «celda vacía» de «fecha ilegible»', () => {
    // Vacía es legítima; ilegible es un error que hay que reportar. Confundirlas haría que
    // «pendiente» escrito en una celda de fecha se guardara como «sin fecha», en silencio.
    expect(fecha(null)).toBeNull();
    expect(fecha('pendiente')).toBeUndefined();
  });

  it('el avance entiende el 0,5 que Excel guarda por «50 %»', () => {
    expect(avance(0.5)).toBe(50);
    expect(avance('50%')).toBe(50);
    expect(avance(50)).toBe(50);
    expect(avance(null)).toBe(0);
  });

  it('el 1 exacto es 100 % y no 1 %', () => {
    // Es ambiguo y se resuelve por frecuencia: nadie registra un plan al 1 %, y muchos al 100.
    expect(avance(1)).toBe(100);
  });

  it('un avance fuera de rango se reporta en vez de recortarse', () => {
    expect(avance(150)).toBeUndefined();
    expect(avance(-5)).toBeUndefined();
  });
});

describe('lo que entra', () => {
  it('una fila completa produce un plan', () => {
    const r = leerFilas([fila()], CATALOGOS);
    expect(r.rechazadas).toEqual([]);
    expect(r.validas).toHaveLength(1);
    expect(r.validas[0]).toMatchObject({
      clase: 'TRATAMIENTO',
      tipo: 'MITIGAR',
      controlId: 11,
      responsableId: 1,
      apruebaId: 2,
      fechaObjetivo: '2027-06-30',
      estado: 'NO_INICIADA',
      avance: 0,
    });
  });

  it('las DOS clases del formato entran', () => {
    // El formato es una sola matriz y se importa entera.
    const r = leerFilas(
      [fila(), fila({ [COLUMNA.tipoPlan]: 'Plan de Mejora' })],
      CATALOGOS,
    );
    expect(r.rechazadas).toEqual([]);
    expect(r.validas.map((v) => v.clase)).toEqual(['TRATAMIENTO', 'MEJORA']);
  });

  it('sin «Tipo de Plan» se asume tratamiento en vez de rechazar la fila', () => {
    // Perder trabajo real por una lista desplegable que nadie tocó sería el peor canje.
    const r = leerFilas([fila({ [COLUMNA.tipoPlan]: null })], CATALOGOS);
    expect(r.validas[0].clase).toBe('TRATAMIENTO');
  });

  it('el control se puede dar por código o por nombre', () => {
    const r = leerFilas([fila({ [COLUMNA.control]: 'Control de acceso' })], CATALOGOS);
    expect(r.validas[0].controlId).toBe(11);
  });

  it('un plan cerrado con avance 0 se corrige en vez de rechazarse', () => {
    // La intención es inequívoca, y rechazar el cierre por una celda que nadie actualizó
    // sería perder el cierre.
    const r = leerFilas([fila({ [COLUMNA.estado]: 'Cerrada', [COLUMNA.avance]: 0 })], CATALOGOS);
    expect(r.validas[0].avance).toBe(100);
  });

  it('separa Actividad de Descripción, no las concatena', () => {
    // El formato las separa y un auditor las lee distinto. Juntarlas haría que reexportar el
    // formato no pudiera volver a partirlas.
    const r = leerFilas(
      [fila({ [COLUMNA.descripcion]: 'Sobre la VPN y el correo.' })],
      CATALOGOS,
    );
    expect(r.validas[0].accion).toBe('Implementar doble factor');
    expect(r.validas[0].descripcion).toBe('Sobre la VPN y el correo.');
  });
});

describe('lo que se rechaza, y por qué', () => {
  it('ninguna fila desaparece: válidas + rechazadas + vacías cuadra con el archivo', () => {
    // La regla que gobierna el módulo. «Se crearon 2 de 4» sin decir qué pasó con las otras
    // obliga a comparar a mano contra el Excel, que es el trabajo que la importación evita.
    const entrada = [
      fila(),
      fila({ [COLUMNA.actividad]: null }),
      new Array(ENCABEZADOS.length).fill(null),
      fila({ [COLUMNA.control]: 'A.99.99' }),
    ];
    const r = leerFilas(entrada, CATALOGOS);
    expect(r.validas.length + r.rechazadas.length + r.vacias).toBe(entrada.length);
  });

  it('un control que no existe NO se aproxima al más parecido', () => {
    // Un plan colgado del control equivocado se descubre en una auditoría; uno que no se creó,
    // en la pantalla de resultados tres segundos después.
    const r = leerFilas([fila({ [COLUMNA.control]: 'A.5.16' })], CATALOGOS);
    expect(r.validas).toEqual([]);
    expect(r.rechazadas[0].motivos[0]).toContain('No existe el control «A.5.16»');
  });

  it('el rechazo señala la fila Y repite la actividad', () => {
    // «Fila 34» obliga a contar filas en un Excel con encabezados combinados.
    const r = leerFilas([fila({ [COLUMNA.control]: 'A.9.9' })], CATALOGOS, 6);
    expect(r.rechazadas[0]).toMatchObject({ fila: 6, actividad: 'Implementar doble factor' });
  });

  it('mitigar sin control se rechaza: es la unidad de gestión del plan', () => {
    const r = leerFilas([fila({ [COLUMNA.control]: null })], CATALOGOS);
    expect(r.rechazadas[0].motivos.join(' ')).toContain('necesita el control');
  });

  it('aceptar sin justificación NI fecha de revisión reporta las DOS cosas', () => {
    // Las mismas reglas de ISO/IEC 27001 6.1.3 que exige el servidor, comprobadas acá para que
    // el rechazo diga qué falta EN QUÉ FILA en vez de reventar a mitad del archivo.
    const r = leerFilas(
      [fila({ [COLUMNA.tipoAccion]: 'Aceptar', [COLUMNA.control]: null })],
      CATALOGOS,
    );
    const m = r.rechazadas[0].motivos.join(' ');
    expect(m).toContain('justificación de la aceptación');
    expect(m).toContain('fecha de revisión');
  });

  it('transferir exige instrumento y riesgo remanente', () => {
    const r = leerFilas(
      [fila({ [COLUMNA.tipoAccion]: 'Transferir', [COLUMNA.control]: null })],
      CATALOGOS,
    );
    const m = r.rechazadas[0].motivos.join(' ');
    expect(m).toContain('instrumento');
    expect(m).toContain('riesgo remanente');
  });

  it('una aceptación completa entra', () => {
    const r = leerFilas(
      [
        fila({
          [COLUMNA.tipoAccion]: 'Aceptar',
          [COLUMNA.control]: null,
          [COLUMNA.justificacionAceptacion]: 'El costo del control supera el impacto.',
          [COLUMNA.fechaRevisionAceptacion]: '2027-12-31',
        }),
      ],
      CATALOGOS,
    );
    expect(r.rechazadas).toEqual([]);
    expect(r.validas[0]).toMatchObject({
      tipo: 'ACEPTAR',
      justificacionAceptacion: 'El costo del control supera el impacto.',
      fechaRevisionAceptacion: '2027-12-31',
    });
  });

  it('una fila a medio llenar se rechaza con motivo, no se salta como vacía', () => {
    // Una fila con tipo de plan y nada más es un olvido, no una fila en blanco. Saltarla la
    // haría desaparecer sin que nadie se entere.
    const vacia = new Array(ENCABEZADOS.length).fill(null);
    vacia[COLUMNA.tipoPlan] = 'Plan de Mejora';
    const r = leerFilas([vacia], CATALOGOS);
    expect(r.vacias).toBe(0);
    expect(r.rechazadas).toHaveLength(1);
  });

  it('un cargo inexistente se nombra, para poder darlo de alta', () => {
    const r = leerFilas([fila({ [COLUMNA.responsableEjecucion]: 'Director de Datos' })], CATALOGOS);
    expect(r.rechazadas[0].motivos.join(' ')).toContain('No existe el cargo «Director de Datos»');
  });

  it('una fecha ilegible se reporta y no se guarda como «sin fecha»', () => {
    const r = leerFilas([fila({ [COLUMNA.fechaTerminacion]: 'cuando se pueda' })], CATALOGOS);
    expect(r.rechazadas[0].motivos.join(' ')).toContain('«Fecha terminación» ilegible');
  });
});

describe('origenImportado', () => {
  it('dice de dónde vino: el formato, la clase y el proceso', () => {
    const r = leerFilas([fila({ [COLUMNA.proceso]: 'Gestión Tecnológica' })], CATALOGOS);
    expect(origenImportado(r.validas[0])).toBe(
      'FOR-SIG-13 · Plan de Tratamiento de Riesgos — Gestión Tecnológica.',
    );
  });

  it('NO fabrica el prefijo verificable de un riesgo', () => {
    // Un plan de la matriz no cuelga de un par (activo, amenaza) concreto. Inventarlo haría
    // que `origenCubreRiesgo` lo diera por cubriendo un riesgo que nadie decidió que cubriera
    // — y el activo aparecería «con plan» sin tenerlo.
    const r = leerFilas([fila()], CATALOGOS);
    expect(origenImportado(r.validas[0])).not.toContain('origen:v1|');
  });
});
