// lib/sig/__tests__/ciclos.test.ts
//
// Los ciclos de vinculacion y desvinculacion. Las dos pruebas que sostienen el modulo son
// las que fijan una regla que un `if` de buena fe puede romper sin que nadie lo note:
//
//   1. Cambiar el tipo de vinculacion NO cambia ninguno de los siete pasos de seguridad.
//   2. Ningun paso de la desvinculacion depende de otro.
//
// La segunda es contraintuitiva y por eso hay que escribirla: lo natural al dibujar un
// tramite es encadenar los pasos, y PRO-TAL-03 dice explicitamente que la revocacion de
// accesos NO espera a la liquidacion ni al paz y salvo.

import {
  dependeDeOtroPaso,
  motivoDelTramite,
  OBLIGACIONES_SUBSISTENTES,
  pasosAplicables,
  progresoDelCiclo,
  type Paso,
} from '../ciclos';

const p = (
  id: number,
  ciclo: Paso['ciclo'],
  grupo: Paso['grupo'],
  aplicaA: Paso['aplicaA'],
  orden: number,
): Paso => ({ id, ciclo, grupo, aplicaA, codigo: `P${id}`, texto: `Paso ${id}`, fuente: null, orden });

/// Siete de seguridad para todos, cuatro administrativos de nomina y tres de contratista.
const PASOS: Paso[] = [
  ...Array.from({ length: 7 }, (_, i) => p(i + 1, 'VINCULACION', 'SEGURIDAD', 'TODOS', i + 1)),
  p(11, 'VINCULACION', 'ADMINISTRATIVO', 'NOMINA', 11),
  p(12, 'VINCULACION', 'ADMINISTRATIVO', 'NOMINA', 12),
  p(13, 'VINCULACION', 'ADMINISTRATIVO', 'NOMINA', 13),
  p(14, 'VINCULACION', 'ADMINISTRATIVO', 'NOMINA', 14),
  p(21, 'VINCULACION', 'ADMINISTRATIVO', 'CONTRATISTA', 11),
  p(22, 'VINCULACION', 'ADMINISTRATIVO', 'CONTRATISTA', 12),
  p(23, 'VINCULACION', 'ADMINISTRATIVO', 'CONTRATISTA', 13),
  ...Array.from({ length: 4 }, (_, i) => p(31 + i, 'DESVINCULACION', 'SEGURIDAD', 'TODOS', i + 1)),
  p(41, 'DESVINCULACION', 'ADMINISTRATIVO', 'NOMINA', 11),
];

describe('pasosAplicables', () => {
  it('solo los del ciclo pedido', () => {
    const r = pasosAplicables(PASOS, 'DESVINCULACION', false);
    expect(r.every((x) => x.ciclo === 'DESVINCULACION')).toBe(true);
  });

  // LA PRUEBA DEL MODULO. Criterio de aceptacion 5: «cambiar el tipo de vinculacion no
  // cambia ninguno de los siete pasos de seguridad». Si el filtro por tipo llegara a tocar
  // uno, el argumento entero —«un solo proceso para nomina y contratistas»— se cae.
  it('los SIETE de seguridad son identicos para nomina y para contratista', () => {
    const deNomina = pasosAplicables(PASOS, 'VINCULACION', true).filter((x) => x.grupo === 'SEGURIDAD');
    const deContratista = pasosAplicables(PASOS, 'VINCULACION', false).filter((x) => x.grupo === 'SEGURIDAD');
    expect(deNomina).toHaveLength(7);
    expect(deContratista.map((x) => x.id)).toEqual(deNomina.map((x) => x.id));
  });

  it('lo administrativo SI cambia con el tipo', () => {
    const nomina = pasosAplicables(PASOS, 'VINCULACION', true).filter((x) => x.grupo === 'ADMINISTRATIVO');
    const contratista = pasosAplicables(PASOS, 'VINCULACION', false).filter((x) => x.grupo === 'ADMINISTRATIVO');
    expect(nomina.map((x) => x.id)).toEqual([11, 12, 13, 14]);
    expect(contratista.map((x) => x.id)).toEqual([21, 22, 23]);
  });

  // La defensa de la regla contra un dato mal cargado. Si alguien cargara manana un paso de
  // SEGURIDAD con `aplicaA = NOMINA`, el filtro lo devuelve IGUAL para los dos tipos: el
  // criterio 5 no admite excepciones, y respetar el dato equivocado seria romperlo en
  // silencio.
  it('un paso de seguridad mal cargado como NOMINA aplica igual a todos', () => {
    const conError = [...PASOS, p(99, 'VINCULACION', 'SEGURIDAD', 'NOMINA', 8)];
    const contratista = pasosAplicables(conError, 'VINCULACION', false);
    expect(contratista.some((x) => x.id === 99)).toBe(true);
  });

  it('van ordenados', () => {
    const r = pasosAplicables(PASOS, 'VINCULACION', true);
    expect(r.map((x) => x.orden)).toEqual([...r.map((x) => x.orden)].sort((a, b) => a - b));
  });
});

describe('progresoDelCiclo', () => {
  // Se reporta SEPARADO por grupo. Un tramite con lo administrativo completo y la seguridad
  // a medias no esta «al 70 %»: esta sin hacer lo que importa, y un solo numero lo promedia
  // y esconde justo eso.
  it('separa el avance de seguridad del administrativo', () => {
    const hechos = new Set([11, 12, 13, 14]); // los cuatro administrativos, cero de seguridad
    const r = progresoDelCiclo(PASOS, hechos, 'VINCULACION', true);
    const seg = r.find((x) => x.grupo === 'SEGURIDAD');
    const adm = r.find((x) => x.grupo === 'ADMINISTRATIVO');
    expect(seg).toEqual(expect.objectContaining({ hechos: 0, total: 7 }));
    expect(adm).toEqual(expect.objectContaining({ hechos: 4, total: 4 }));
  });

  // «Faltan 3» manda a buscarlos. La pantalla los nombra.
  it('nombra los pendientes, no solo los cuenta', () => {
    const r = progresoDelCiclo(PASOS, new Set([1, 2]), 'VINCULACION', true);
    const seg = r.find((x) => x.grupo === 'SEGURIDAD');
    expect(seg?.pendientes).toHaveLength(5);
    expect(seg?.pendientes[0]).toEqual({ codigo: 'P3', texto: 'Paso 3' });
  });

  it('con todo hecho no quedan pendientes', () => {
    const todos = new Set(pasosAplicables(PASOS, 'DESVINCULACION', true).map((x) => x.id));
    const r = progresoDelCiclo(PASOS, todos, 'DESVINCULACION', true);
    expect(r.every((x) => x.pendientes.length === 0)).toBe(true);
  });
});

describe('dependeDeOtroPaso · C4', () => {
  // Devuelve SIEMPRE false, y eso no es un descuido: es la regla. PRO-TAL-03 exige que la
  // revocacion de accesos se haga el mismo dia de la terminacion «sin esperar a la
  // liquidacion ni al paz y salvo», y cualquier prerrequisito la retrasaria.
  //
  // La funcion existe para que el punto quede ESCRITO y con prueba, en vez de ser la
  // ausencia de un `if` que alguien agregue de buena fe al dibujar el tramite.
  it('ningun paso depende de otro, y esa es la regla', () => {
    expect(dependeDeOtroPaso()).toBe(false);
  });
});

describe('motivoDelTramite · C5', () => {
  it('la terminacion lo dispara', () => {
    const r = motivoDelTramite(new Date('2026-08-31'), false);
    expect(r.aplica).toBe(true);
    expect(r.motivo).toContain('terminación');
  });

  // C5 · el mismo tramite aplica al cambio de cargo. Es el origen MAS COMUN de los accesos
  // sin sustento: nadie piensa en revisar accesos cuando alguien asciende, porque no se fue.
  it('el cambio de cargo tambien, y lo dice con esas palabras', () => {
    const r = motivoDelTramite(null, true);
    expect(r.aplica).toBe(true);
    expect(r.motivo).toContain('cambio de cargo');
    expect(r.motivo).toContain('accesos sin sustento');
  });

  it('sin ninguno de los dos no aplica', () => {
    expect(motivoDelTramite(null, false).aplica).toBe(false);
  });
});

describe('OBLIGACIONES_SUBSISTENTES · C7 y criterio 8', () => {
  // «El registro de una persona inactiva no se borra. Las obligaciones subsistentes duran
  // cinco años, e indefinidamente para secretos empresariales y codigo fuente.» Se muestran
  // en la ficha porque son LA RAZON de no borrar.
  it('incluye la indefinida de secretos y codigo fuente', () => {
    const indefinida = OBLIGACIONES_SUBSISTENTES.find((o) => o.vigencia === 'indefinida');
    expect(indefinida?.texto).toContain('código fuente');
  });

  it('cada una dice su vigencia y su fuente', () => {
    for (const o of OBLIGACIONES_SUBSISTENTES) {
      expect(o.vigencia.length).toBeGreaterThan(3);
      expect(o.fuente.length).toBeGreaterThan(3);
    }
  });
});
