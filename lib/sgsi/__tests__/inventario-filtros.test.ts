// lib/sgsi/__tests__/inventario-filtros.test.ts
//
// El §7 y el §8 de REQ-SIG-18. El caso que más importa es el del §7.4: la celda cuenta por
// propietario y el enlace tiene que filtrar por propietario, o el número miente.

import {
  CRITERIO_MAX,
  FILTROS_VACIOS,
  SIN_ASIGNAR,
  TODAS_PERSONAS,
  TODOS_PROPIETARIOS,
  TODOS_RESPONSABLES,
  TODOS_SUBTIPOS,
  TODOS_TIPOS,
  consultaDeFiltros,
  cumpleFiltros,
  filtrosDesdeUrl,
  hayFiltros,
  parametrosDeFiltros,
  urlDeInventario,
  type ActivoFiltrable,
  type CatalogosFiltro,
  type Filtros,
} from '../inventario-filtros';
import type { DimensionActiva } from '../valoracion-agregada';

const DIMENSIONES: DimensionActiva[] = [
  { codigo: 'D', nombre: 'Disponibilidad' },
  { codigo: 'I', nombre: 'Integridad' },
  { codigo: 'C', nombre: 'Confidencialidad' },
];

const CATALOGOS: CatalogosFiltro = {
  tipos: ['[SW] Aplicaciones'],
  subtipos: ['SW.1 Estándar'],
  responsables: ['CEO', 'Líder del SIG', 'Operations & Services Manager'],
  propietarios: ['CEO', 'Líder del SIG'],
  personas: ['jruiz@cuantico.co', 'amedina@cuantico.co'],
  dimensiones: ['D', 'I', 'C'],
  niveles: [0, 1, 2, 3, 4, 5],
};

function leer(consulta: string) {
  return filtrosDesdeUrl(new URLSearchParams(consulta), CATALOGOS);
}

function activo(p: Partial<ActivoFiltrable> = {}): ActivoFiltrable {
  return {
    codigo: 'TEC-APP-0001',
    codigoHeredado: null,
    nombre: 'Portal',
    tipo: '[SW] Aplicaciones',
    subtipo: 'SW.1 Estándar',
    proveedor: null,
    propietario: 'CEO',
    custodio: 'Líder del SIG',
    personaCorreo: null,
    valores: { D: 3, I: 3, C: 3 },
    ...p,
  };
}

const pasa = (a: ActivoFiltrable, f: Filtros, q = '') => cumpleFiltros(a, f, q, DIMENSIONES);

describe('§7.1 · la URL se hidrata', () => {
  it('sin parámetros son los filtros vacíos y ningún aviso', () => {
    expect(leer('')).toEqual({ filtros: FILTROS_VACIOS, avisos: [] });
  });

  it('lee los nueve parámetros del contrato del §8', () => {
    const { filtros, avisos } = leer(
      'tipo=%5BSW%5D+Aplicaciones&subtipo=SW.1+Estándar&responsable=CEO&color=rojo' +
        '&dimension=C&valor=4&propietario=Líder+del+SIG&persona=jruiz%40cuantico.co&conPersona=1',
    );
    expect(avisos).toEqual([]);
    expect(filtros).toEqual({
      tipo: '[SW] Aplicaciones',
      subtipo: 'SW.1 Estándar',
      responsable: 'CEO',
      color: 'rojo',
      dimension: 'C',
      valor: 4,
      valorMinimo: null,
      propietario: 'Líder del SIG',
      persona: 'jruiz@cuantico.co',
      conPersona: true,
    });
  });

  it('un valor que no está en el inventario se ignora y se avisa', () => {
    const { filtros, avisos } = leer('propietario=Chief+Legal+Officer');
    expect(filtros.propietario).toBe(TODOS_PROPIETARIOS);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('Chief Legal Officer');
  });

  it('una dimensión inexistente o inactiva cae a MAX, con aviso', () => {
    const { filtros, avisos } = leer('dimension=A&valor=4');
    expect(filtros.dimension).toBe(CRITERIO_MAX);
    expect(filtros.valor).toBe(4);
    expect(avisos[0]).toContain('«A»');
  });

  it('dimension=MAX explícito no es un aviso', () => {
    expect(leer('dimension=MAX').avisos).toEqual([]);
  });

  it('un nivel que la escala no admite se ignora y se avisa', () => {
    const { filtros, avisos } = leer('valor=9');
    expect(filtros.valor).toBeNull();
    expect(avisos[0]).toContain('valor');
  });

  it('valor y valorMinimo juntos: gana valor, con aviso', () => {
    const { filtros, avisos } = leer('valor=4&valorMinimo=3');
    expect(filtros.valor).toBe(4);
    expect(filtros.valorMinimo).toBeNull();
    expect(avisos.some((a) => a.includes('valorMinimo'))).toBe(true);
  });

  it('conPersona solo admite 1', () => {
    expect(leer('conPersona=1').filtros.conPersona).toBe(true);
    const otro = leer('conPersona=0');
    expect(otro.filtros.conPersona).toBe(false);
    expect(otro.avisos).toHaveLength(1);
  });

  it('__sin__ es válido en propietario y en persona, y solo ahí', () => {
    expect(leer(`propietario=${SIN_ASIGNAR}`).filtros.propietario).toBe(SIN_ASIGNAR);
    expect(leer(`persona=${SIN_ASIGNAR}`).filtros.persona).toBe(SIN_ASIGNAR);
    expect(leer(`responsable=${SIN_ASIGNAR}`).filtros.responsable).toBe(TODOS_RESPONSABLES);
  });

  it('los parámetros se acumulan: es la intersección', () => {
    const { filtros } = leer('propietario=CEO&dimension=C&valor=4');
    expect(pasa(activo({ propietario: 'CEO', valores: { D: 1, I: 1, C: 4 } }), filtros)).toBe(true);
    expect(pasa(activo({ propietario: 'Líder del SIG', valores: { D: 1, I: 1, C: 4 } }), filtros)).toBe(false);
    expect(pasa(activo({ propietario: 'CEO', valores: { D: 4, I: 1, C: 1 } }), filtros)).toBe(false);
  });
});

describe('§7.1 · los filtros se reflejan de vuelta en la URL', () => {
  it('solo viajan los que no están en su valor por defecto', () => {
    expect(parametrosDeFiltros(FILTROS_VACIOS)).toEqual({});
    expect(consultaDeFiltros(FILTROS_VACIOS)).toBe('');
  });

  it('lo que se lee de la URL se vuelve a escribir igual', () => {
    const original =
      'color=rojo&conPersona=1&dimension=C&persona=jruiz%40cuantico.co&propietario=CEO&valor=4';
    const { filtros } = filtrosDesdeUrl(new URLSearchParams(original), CATALOGOS);
    const vuelta = new URLSearchParams(parametrosDeFiltros(filtros));
    vuelta.sort();
    expect(vuelta.toString()).toBe(original);
  });

  it('valorMinimo viaja cuando no hay valor exacto', () => {
    expect(parametrosDeFiltros({ ...FILTROS_VACIOS, valorMinimo: 4 })).toEqual({ valorMinimo: '4' });
  });

  it('el nombre del cargo viaja codificado', () => {
    expect(consultaDeFiltros({ ...FILTROS_VACIOS, propietario: 'Operations & Services Manager' }))
      .toBe('?propietario=Operations+%26+Services+Manager');
  });

  it('hayFiltros mira los filtros y la búsqueda', () => {
    expect(hayFiltros(FILTROS_VACIOS, '')).toBe(false);
    expect(hayFiltros(FILTROS_VACIOS, ' portal ')).toBe(true);
    expect(hayFiltros({ ...FILTROS_VACIOS, valor: 4 }, '')).toBe(true);
  });
});

describe('urlDeInventario · los destinos del §4.6, §6.4 y §6.8', () => {
  it('un segmento de la fila del máximo no lleva dimension', () => {
    expect(urlDeInventario({ valor: 4 })).toBe('/sgsi/inventario?valor=4');
  });

  it('un segmento de una fila de dimensión la lleva', () => {
    expect(urlDeInventario({ dimension: 'C', valor: 4 })).toBe('/sgsi/inventario?dimension=C&valor=4');
  });

  it('la cuenta ≥ umbral usa valorMinimo', () => {
    expect(urlDeInventario({ dimension: 'C', valorMinimo: 4 })).toBe(
      '/sgsi/inventario?dimension=C&valorMinimo=4',
    );
  });

  it('la fila Sin propietario viaja con __sin__', () => {
    expect(urlDeInventario({ propietario: SIN_ASIGNAR, dimension: 'C' })).toBe(
      `/sgsi/inventario?propietario=${SIN_ASIGNAR}&dimension=C`,
    );
  });

  it('el correo viaja codificado', () => {
    expect(urlDeInventario({ persona: 'jruiz@cuantico.co' })).toBe(
      '/sgsi/inventario?persona=jruiz%40cuantico.co',
    );
  });

  it('el encabezado de nivel de un grupo de la Tabla B acota con conPersona', () => {
    expect(urlDeInventario({ dimension: 'C', valor: 4, conPersona: 1 })).toBe(
      '/sgsi/inventario?dimension=C&valor=4&conPersona=1',
    );
  });

  it('sin parámetros es el inventario entero', () => {
    expect(urlDeInventario({ propietario: null })).toBe('/sgsi/inventario');
  });
});

describe('§7.4 · propietario y responsable son dos preguntas distintas', () => {
  // El activo cuyo propietario es el CEO y cuyo custodio es el Líder del SIG. Es exactamente
  // el caso que hacía que un clic en un 41 abriera 63 filas.
  const a = activo({ propietario: 'CEO', custodio: 'Líder del SIG' });

  it('responsable acepta por propietario O por custodio, y así se queda (D-4)', () => {
    expect(pasa(a, { ...FILTROS_VACIOS, responsable: 'CEO' })).toBe(true);
    expect(pasa(a, { ...FILTROS_VACIOS, responsable: 'Líder del SIG' })).toBe(true);
  });

  it('propietario acepta SOLO por propietario', () => {
    expect(pasa(a, { ...FILTROS_VACIOS, propietario: 'CEO' })).toBe(true);
    expect(pasa(a, { ...FILTROS_VACIOS, propietario: 'Líder del SIG' })).toBe(false);
  });

  it('propietario=__sin__ son los que no tienen propietario', () => {
    expect(pasa(activo({ propietario: null }), { ...FILTROS_VACIOS, propietario: SIN_ASIGNAR })).toBe(true);
    expect(pasa(a, { ...FILTROS_VACIOS, propietario: SIN_ASIGNAR })).toBe(false);
  });
});

describe('§7.2 y §7.3 · valor, valorMinimo y dimension', () => {
  const a = activo({ valores: { D: 2, I: 3, C: 4 } });

  it('sin dimension, valor compara contra el máximo', () => {
    expect(pasa(a, { ...FILTROS_VACIOS, valor: 4 })).toBe(true);
    expect(pasa(a, { ...FILTROS_VACIOS, valor: 3 })).toBe(false);
  });

  it('con dimension, compara contra esa dimensión', () => {
    expect(pasa(a, { ...FILTROS_VACIOS, dimension: 'I', valor: 3 })).toBe(true);
    expect(pasa(a, { ...FILTROS_VACIOS, dimension: 'I', valor: 4 })).toBe(false);
  });

  it('valorMinimo es mayor o igual, y no lo mismo que valor', () => {
    expect(pasa(a, { ...FILTROS_VACIOS, valorMinimo: 4 })).toBe(true);
    expect(pasa(a, { ...FILTROS_VACIOS, dimension: 'D', valorMinimo: 4 })).toBe(false);
    expect(pasa(a, { ...FILTROS_VACIOS, dimension: 'D', valorMinimo: 2 })).toBe(true);
  });

  it('un activo sin valorar en la dimensión pedida no entra en ningún nivel, ni en el 0', () => {
    const sinValorar = activo({ valores: { D: 3 } });
    expect(pasa(sinValorar, { ...FILTROS_VACIOS, dimension: 'C', valor: 0 })).toBe(false);
    expect(pasa(sinValorar, { ...FILTROS_VACIOS, dimension: 'C', valorMinimo: 0 })).toBe(false);
    expect(pasa(sinValorar, { ...FILTROS_VACIOS, dimension: 'D', valor: 3 })).toBe(true);
  });

  it('un activo sin ninguna valoración no tiene máximo y queda fuera del filtro de valor', () => {
    const nada = activo({ valores: {} });
    expect(pasa(nada, { ...FILTROS_VACIOS, valorMinimo: 0 })).toBe(false);
    expect(pasa(nada, FILTROS_VACIOS)).toBe(true);
  });
});

describe('§7.5 · persona y conPersona', () => {
  const conCustodio = activo({ personaCorreo: 'jruiz@cuantico.co' });
  const sinCustodio = activo({ personaCorreo: null });

  it('persona filtra por correo, no por nombre', () => {
    expect(pasa(conCustodio, { ...FILTROS_VACIOS, persona: 'jruiz@cuantico.co' })).toBe(true);
    expect(pasa(conCustodio, { ...FILTROS_VACIOS, persona: 'amedina@cuantico.co' })).toBe(false);
  });

  it('persona=__sin__ son los que no están entregados a nadie', () => {
    expect(pasa(sinCustodio, { ...FILTROS_VACIOS, persona: SIN_ASIGNAR })).toBe(true);
    expect(pasa(conCustodio, { ...FILTROS_VACIOS, persona: SIN_ASIGNAR })).toBe(false);
  });

  it('conPersona acota a los que tienen custodio persona', () => {
    expect(pasa(conCustodio, { ...FILTROS_VACIOS, conPersona: true })).toBe(true);
    expect(pasa(sinCustodio, { ...FILTROS_VACIOS, conPersona: true })).toBe(false);
  });

  it('sin conPersona, los no entregados siguen apareciendo', () => {
    expect(pasa(sinCustodio, FILTROS_VACIOS)).toBe(true);
  });
});

describe('los filtros que ya existían siguen igual', () => {
  it('tipo y subtipo', () => {
    const a = activo();
    expect(pasa(a, { ...FILTROS_VACIOS, tipo: '[HW] Equipos' })).toBe(false);
    expect(pasa(a, { ...FILTROS_VACIOS, tipo: TODOS_TIPOS, subtipo: 'SW.2' })).toBe(false);
    expect(pasa(a, { ...FILTROS_VACIOS, subtipo: TODOS_SUBTIPOS })).toBe(true);
  });

  it('la búsqueda mira código, código heredado, nombre, proveedor y subtipo', () => {
    const a = activo({ codigoHeredado: 'AI-01', proveedor: 'Azure', nombre: 'Portal de clientes' });
    for (const q of ['tec-app', 'ai-01', 'portal', 'azure', 'sw.1']) {
      expect(pasa(a, FILTROS_VACIOS, q)).toBe(true);
    }
    expect(pasa(a, FILTROS_VACIOS, 'inexistente')).toBe(false);
  });

  it('el color no entra en este predicado: es banda de riesgo, no valor', () => {
    expect(pasa(activo(), { ...FILTROS_VACIOS, color: 'rojo' })).toBe(true);
  });

  it('persona y propietario en «todos» no filtran nada', () => {
    expect(
      pasa(activo({ propietario: null, personaCorreo: null }), {
        ...FILTROS_VACIOS,
        propietario: TODOS_PROPIETARIOS,
        persona: TODAS_PERSONAS,
      }),
    ).toBe(true);
  });
});
