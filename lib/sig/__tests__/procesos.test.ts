// lib/sig/__tests__/procesos.test.ts
//
// Lo que se prueba aca es que el modulo NO adivine. `proceso-entidad.md` §6.1 anticipa el
// dano exacto: «un duplicado deja un proceso apuntando a un cargo que nadie ocupa», y eso
// no se descubre hasta que una obligacion no le llega a su dueno.
//
// El catalogo de cargos que se usa en las pruebas es el REAL de la base, no uno inventado:
// si algun dia se unifica, estas pruebas cambian de resultado y obligan a mirarlo.

import {
  PROCESOS_DEL_MAPA,
  areaHomonima,
  cargosQueSonAreas,
  resolverCargo,
} from '../procesos';

/// Los trece cargos cargados hoy.
const CARGOS = [
  { id: 1, nombre: 'Architecture Manager' },
  { id: 2, nombre: 'CEO' },
  { id: 3, nombre: 'Cada titular' },
  { id: 4, nombre: 'Chief Commercial Officer' },
  { id: 5, nombre: 'Chief Legal Officer' },
  { id: 6, nombre: 'Chief Operating Officer' },
  { id: 7, nombre: 'Finance and Administrative Manager' },
  { id: 8, nombre: 'Gestión Tecnológica' },
  { id: 9, nombre: 'Líder del SIG' },
  { id: 10, nombre: 'Operations & Services Manager' },
  { id: 11, nombre: 'Por asignar' },
  { id: 12, nombre: 'Talento Humano' },
  { id: 13, nombre: 'Comité del SIG' },
];

/// Las diez areas cargadas.
const AREAS = [
  { id: 1, nombre: 'Gestión Estratégica' },
  { id: 2, nombre: 'Gestión Comercial' },
  { id: 3, nombre: 'Gestión de Proyectos' },
  { id: 4, nombre: 'Soporte y Servicio al Cliente' },
  { id: 5, nombre: 'Talento Humano' },
  { id: 6, nombre: 'Gestión Legal y Compras' },
  { id: 7, nombre: 'Gestión Tecnológica' },
  { id: 8, nombre: 'Sistema Integrado de Gestión' },
  { id: 9, nombre: 'Gestión Financiera' },
  { id: 10, nombre: 'Transversal' },
];

describe('PROCESOS_DEL_MAPA', () => {
  it('son los nueve del mapa', () => {
    expect(PROCESOS_DEL_MAPA).toHaveLength(9);
    expect(PROCESOS_DEL_MAPA.map((p) => p.codigo)).toEqual([
      'EST', 'COM', 'PRO', 'SAC', 'TAL', 'LCO', 'TEC', 'SIG', 'FIN',
    ]);
  });

  // §3.1: «Invente un proceso que no existe. Escribi "Tecnologia y Soporte" como si fuera
  // uno solo. En el mapa son DOS procesos distintos y de bandas distintas.»
  it('SAC es misional y TEC es de apoyo: no son el mismo proceso', () => {
    const sac = PROCESOS_DEL_MAPA.find((p) => p.codigo === 'SAC');
    const tec = PROCESOS_DEL_MAPA.find((p) => p.codigo === 'TEC');
    expect(sac?.tipo).toBe('MISIONAL');
    expect(tec?.tipo).toBe('APOYO');
    expect(PROCESOS_DEL_MAPA.some((p) => p.nombre.includes('Tecnología y Soporte'))).toBe(false);
  });

  // §3.2: «Un cargo, varios procesos.» Es lo que con `Area` sola no se podia escribir.
  it('un cargo puede ser dueno de varios procesos', () => {
    const deOperaciones = PROCESOS_DEL_MAPA.filter((p) => p.cargoDelMapa === 'Gerencia de Operaciones');
    expect(deOperaciones.map((p) => p.codigo)).toEqual(['PRO', 'SAC', 'TEC']);
    // Y cruza las bandas: dos misionales y uno de apoyo. La banda es del proceso, no de
    // quien lo lidera.
    expect(new Set(deOperaciones.map((p) => p.tipo)).size).toBe(2);
  });

  // §3.1: «Gestion de Proyectos no es de Laura Agudelo.»
  it('PRO es de la Gerencia de Operaciones, no de Laura Agudelo', () => {
    const pro = PROCESOS_DEL_MAPA.find((p) => p.codigo === 'PRO');
    expect(pro?.ocupaHoy).toBe('Yuliet Rojas');
  });

  it('ningun codigo se repite', () => {
    const codigos = PROCESOS_DEL_MAPA.map((p) => p.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});

describe('resolverCargo · no adivina', () => {
  it('resuelve el que coincide literalmente', () => {
    const r = resolverCargo('Chief Legal Officer', CARGOS);
    expect(r.estado).toBe('RESUELTO');
    expect(r.cargoId).toBe(5);
  });

  it('resuelve «Líder del SIG», que tambien coincide', () => {
    expect(resolverCargo('Líder del SIG', CARGOS).cargoId).toBe(9);
  });

  // EL CASO QUE IMPORTA, y es peor de lo que el documento anticipa. §6.1 lo describe como
  // un problema de DUPLICADOS —«Gerencia de Operaciones» / «Gerente de Operaciones» /
  // «Operations & Services Manager»— pero en la base cargada no hay duplicados en espanol:
  // **el mapa esta en espanol y el catalogo en ingles**. «operaciones» no aparece en
  // ninguno de los trece nombres; «operations» y «operating» si, y no son la misma palabra.
  //
  // Asi que la unificacion no es un trabajo de deduplicacion: es una decision de
  // correspondencia que una persona tiene que tomar. Ningun emparejamiento por texto la
  // resuelve, y esta prueba existe para que nadie intente escribirlo.
  it('«Gerencia de Operaciones» no tiene candidato: el catalogo esta en ingles', () => {
    const r = resolverCargo('Gerencia de Operaciones', CARGOS);
    expect(r.estado).toBe('SIN_CANDIDATO');
    expect(r.cargoId).toBeNull();
  });

  // «Gerencia General» no tiene ninguna palabra discriminante contra el catalogo: CEO no
  // comparte texto con ella. Sin candidato es la respuesta honesta.
  it('«Gerencia General» no tiene candidato: CEO no se deduce del texto', () => {
    const r = resolverCargo('Gerencia General', CARGOS);
    expect(r.cargoId).toBeNull();
    expect(r.estado).toBe('SIN_CANDIDATO');
  });

  // «Comercial» y «Commercial» difieren en una letra y no se emparejan — ni deben. Aceptar
  // una distancia de edicion abriria la puerta a emparejar «Operating» con «Operations», y
  // esos dos SI son cargos distintos.
  it('«Gerencia Comercial» no empareja con «Chief Commercial Officer»', () => {
    const r = resolverCargo('Gerencia Comercial', CARGOS);
    expect(r.cargoId).toBeNull();
  });

  // La cifra que sostiene el argumento de §6.1: con el catalogo real, SOLO DOS de los seis
  // cargos del mapa se resuelven, y los dos porque el mapa usa el nombre exacto del
  // catalogo. Los otros cuatro necesitan que alguien declare la correspondencia.
  it('con el catalogo real solo DOS de los seis cargos del mapa se resuelven', () => {
    const delMapa = [...new Set(PROCESOS_DEL_MAPA.map((p) => p.cargoDelMapa))];
    const resueltos = delMapa.filter((c) => resolverCargo(c, CARGOS).cargoId !== null);
    expect(delMapa).toHaveLength(6);
    expect(resueltos.sort()).toEqual(['Chief Legal Officer', 'Líder del SIG']);
  });
});

describe('cargosQueSonAreas', () => {
  // `Gestion Tecnologica` y `Talento Humano` estan cargados como cargos y son nombres de
  // area. Un proceso cuyo dueno es «Gestion Tecnologica» no dice quien responde: dice
  // donde ocurre.
  it('detecta los cargos que son nombres de area', () => {
    const r = cargosQueSonAreas(CARGOS, AREAS);
    expect(r.map((c) => c.nombre).sort()).toEqual(['Gestión Tecnológica', 'Talento Humano']);
  });

  it('sin areas no marca nada', () => {
    expect(cargosQueSonAreas(CARGOS, [])).toEqual([]);
  });
});

describe('areaHomonima', () => {
  it('encuentra la que se llama igual', () => {
    expect(areaHomonima({ nombre: 'Gestión Tecnológica' }, AREAS)?.id).toBe(7);
  });

  // «Gestion Legal y de Compras» en el mapa contra «Gestion Legal y Compras» en la base.
  it('ignora la particula «de», que es la unica diferencia real', () => {
    expect(areaHomonima({ nombre: 'Gestión Legal y de Compras' }, AREAS)?.id).toBe(6);
  });

  // El hallazgo que el documento no previo: los NUEVE procesos tienen area homonima. Hoy
  // area y proceso son las mismas nueve cosas, y `Proceso.areaId` apuntaria a su gemela.
  it('los nueve procesos tienen area homonima — area y proceso son hoy lo mismo', () => {
    const conArea = PROCESOS_DEL_MAPA.filter((p) => areaHomonima(p, AREAS) !== null);
    expect(conArea).toHaveLength(9);
  });

  // Y el caso que justifica D1 NO se puede escribir: no existe un area «Operaciones».
  it('«Operaciones» y «Finanzas» de D11 no existen como area', () => {
    expect(areaHomonima({ nombre: 'Operaciones' }, AREAS)).toBeNull();
    expect(areaHomonima({ nombre: 'Finanzas' }, AREAS)).toBeNull();
  });

  it('no rellena con la primera parecida', () => {
    expect(areaHomonima({ nombre: 'Gestión' }, AREAS)).toBeNull();
  });
});
