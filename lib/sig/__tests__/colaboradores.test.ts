// lib/sig/__tests__/colaboradores.test.ts
//
// REQ-SIG-09. Lo que se prueba aca son los criterios de aceptacion que se pueden probar sin
// base, y sobre todo la distincion que este modulo tiene que sostener: **«no se puede
// saber» no es «no» **.
//
// Dos de las cuatro anomalias dependen de modulos de fases posteriores. Devolverlas en cero
// haria que el tablero afirmara que nadie tiene accesos sin sustento, que es exactamente la
// mentira que estas anomalias vienen a impedir.

import {
  anomalias,
  composicionPorContrato,
  estaActiva,
  estabaActivaEn,
  puertaDeAccesos,
  type ColaboradorBase,
} from '../colaboradores';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const p = (
  id: number,
  over: Partial<ColaboradorBase & { fechaIngreso: Date | null; tipoContrato: string | null }> = {},
) => ({
  id,
  activa: true,
  retiradoEn: null,
  origen: 'DIRECTORIO' as const,
  fechaIngreso: null,
  tipoContrato: null,
  ...over,
});

describe('estaActiva', () => {
  it('activa cuando el Directorio la tiene y no se retiro', () => {
    expect(estaActiva(p(1))).toBe(true);
  });

  // Basta UNA de las dos fuentes para dar de baja: quien desaparecio del Directorio no
  // puede entrar aunque nadie haya escrito su retiro.
  it('sin cuenta en el Directorio no esta activa', () => {
    expect(estaActiva(p(1, { activa: false }))).toBe(false);
  });

  // Y al reves: quien se retiro no vuelve a estar activo porque su cuenta siga viva unos
  // dias mas.
  it('retirada no esta activa aunque su cuenta siga viva', () => {
    expect(estaActiva(p(1, { retiradoEn: d('2026-03-01') }))).toBe(false);
  });
});

describe('estabaActivaEn · criterio 2', () => {
  // «Consultar la lista al 31/12/2025 muestra a quien estaba activo ese dia.» Es la razon
  // por la que `retiradoEn` es una FECHA y no un booleano: `activa` no tiene historia.
  it('quien se retiro despues, ese dia estaba activa', () => {
    expect(estabaActivaEn(p(1, { retiradoEn: d('2026-03-01') }), d('2025-12-31'))).toBe(true);
  });

  it('quien se retiro antes, ese dia ya no', () => {
    expect(estabaActivaEn(p(1, { retiradoEn: d('2025-06-01') }), d('2025-12-31'))).toBe(false);
  });

  // Se retira al TERMINAR el dia: el dia del retiro todavia trabajo, y una consulta de ese
  // dia tiene que verla.
  it('el dia del retiro todavia estaba activa', () => {
    expect(estabaActivaEn(p(1, { retiradoEn: d('2025-12-31') }), d('2025-12-31'))).toBe(true);
  });

  it('quien entro despues, ese dia no estaba', () => {
    expect(estabaActivaEn(p(1, { fechaIngreso: d('2026-02-01') }), d('2025-12-31'))).toBe(false);
  });

  // Sin fecha de ingreso NO se inventa un alta: se asume que ya estaba. Lo contrario haria
  // desaparecer de la consulta historica a todas las personas cargadas del Directorio, que
  // no traen fecha de ingreso.
  it('sin fecha de ingreso se asume que ya estaba', () => {
    expect(estabaActivaEn(p(1), d('2020-01-01'))).toBe(true);
  });

  // `activa` NO participa: es el estado de hoy. Alguien de baja hoy pudo estar activa en
  // 2025, y mirar `activa` la borraria de la historia.
  it('el estado de HOY no cambia lo que era en el pasado', () => {
    expect(estabaActivaEn(p(1, { activa: false }), d('2025-12-31'))).toBe(true);
  });
});

describe('anomalias', () => {
  const sinModulos = {
    conActaDeBorrado: new Set<number>(),
    conAccesosVigentes: null,
    conLosCuatroCompromisos: null,
  };

  // C1: `origen = MANUAL` es una anomalia de la vinculacion, no una categoria valida.
  it('detecta a las activas sin cuenta del Directorio', () => {
    const r = anomalias({
      ...sinModulos,
      personas: [p(1, { origen: 'MANUAL' }), p(2), p(3, { origen: 'MANUAL', retiradoEn: d('2026-01-01') })],
    });
    const a = r.find((x) => x.clave === 'ACTIVA_SIN_CUENTA');
    // La 3 es MANUAL pero esta retirada: ya no puede recibir nada, asi que no es el
    // problema que esta anomalia senala.
    expect(a?.personas).toEqual([1]);
    expect(a?.calculable).toBe(true);
  });

  it('detecta a quien salio sin acta de borrado', () => {
    const r = anomalias({
      ...sinModulos,
      conActaDeBorrado: new Set([2]),
      personas: [p(1, { retiradoEn: d('2026-01-01') }), p(2, { retiradoEn: d('2026-01-01') }), p(3)],
    });
    const a = r.find((x) => x.clave === 'SALIO_SIN_ACTA');
    // La 2 tiene acta; la 3 no se retiro.
    expect(a?.personas).toEqual([1]);
  });

  // Quien desaparecio del Directorio sin que nadie registrara su retiro es OTRA anomalia.
  // Acusarlo de no tener acta senalaria a Tecnologia por un dato que Talento Humano no puso.
  it('sin fecha de retiro NO se le exige acta', () => {
    const r = anomalias({ ...sinModulos, personas: [p(1, { activa: false })] });
    expect(r.find((x) => x.clave === 'SALIO_SIN_ACTA')?.personas).toEqual([]);
  });

  // EL PUNTO DEL MODULO. Las dos que dependen de fases posteriores se devuelven marcadas,
  // no en cero silencioso: un tablero que muestra dos de cuatro y no dice que faltan dos
  // asegura que el sistema esta mejor de lo que se sabe.
  it('las dos que dependen de otros modulos se marcan NO calculables', () => {
    const r = anomalias({ ...sinModulos, personas: [p(1)] });
    expect(r.find((x) => x.clave === 'INACTIVA_CON_ACCESOS')?.calculable).toBe(false);
    expect(r.find((x) => x.clave === 'ACCESOS_SIN_FIRMAR')?.calculable).toBe(false);
    // Y las cuatro se declaran igual: omitirlas seria peor que marcarlas.
    expect(r).toHaveLength(4);
  });

  it('cuando los datos existen, las cuatro se calculan', () => {
    const r = anomalias({
      personas: [p(1), p(2, { retiradoEn: d('2026-01-01') })],
      conActaDeBorrado: new Set([2]),
      conAccesosVigentes: new Set([1, 2]),
      conLosCuatroCompromisos: new Set<number>(),
    });
    expect(r.every((x) => x.calculable)).toBe(true);
    expect(r.find((x) => x.clave === 'INACTIVA_CON_ACCESOS')?.personas).toEqual([2]);
    expect(r.find((x) => x.clave === 'ACCESOS_SIN_FIRMAR')?.personas).toEqual([1]);
  });

  it('cada anomalia dice su consecuencia, no solo su nombre', () => {
    for (const a of anomalias({ ...sinModulos, personas: [] })) {
      expect(a.consecuencia.length).toBeGreaterThan(15);
    }
  });
});

describe('puertaDeAccesos · C3 y criterio 4', () => {
  it('cerrada mientras falte cualquiera de los cuatro', () => {
    expect(puertaDeAccesos(3)).toEqual({ abierta: false, faltan: 1 });
    expect(puertaDeAccesos(0)).toEqual({ abierta: false, faltan: 4 });
  });

  it('abierta con los cuatro', () => {
    expect(puertaDeAccesos(4)).toEqual({ abierta: true, faltan: 0 });
  });

  // «No se puede saber» NO es «cerrada». Una puerta dibujada cerrada porque falta el modulo
  // se lee como que la persona no firmo, y es una acusacion sin dato detras.
  it('sin el modulo devuelve null, no una puerta cerrada', () => {
    expect(puertaDeAccesos(null)).toBeNull();
  });
});

describe('composicionPorContrato', () => {
  // La cifra que sostiene la decision del modulo: si de 38 activos solo 6 son de nomina,
  // tratar al contratista como caso aparte deja fuera a la mayoria.
  it('cuenta solo activos y ordena de mayor a menor', () => {
    const r = composicionPorContrato([
      p(1, { tipoContrato: 'Prestación de servicios' }),
      p(2, { tipoContrato: 'Prestación de servicios' }),
      p(3, { tipoContrato: 'Nómina' }),
      p(4, { tipoContrato: 'Nómina', retiradoEn: d('2026-01-01') }),
    ]);
    expect(r).toEqual([
      { etiqueta: 'Prestación de servicios', n: 2 },
      { etiqueta: 'Nómina', n: 1 },
    ]);
  });

  // Esconder a los que no tienen tipo haria que la composicion no sumara el total de
  // activos, y nadie sabria por que faltan tres.
  it('los que no tienen tipo se cuentan y se nombran', () => {
    const r = composicionPorContrato([p(1), p(2, { tipoContrato: 'Nómina' })]);
    expect(r.map((x) => x.etiqueta)).toContain('Sin tipo de contrato');
    expect(r.reduce((t, x) => t + x.n, 0)).toBe(2);
  });
});
