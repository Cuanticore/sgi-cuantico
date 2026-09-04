// lib/sig/__tests__/niveles.test.ts
//
// E1 · el nivel 2 pertenece a un nivel 1 y el 3 a un 2. En el Excel son tres columnas y
// cualquier combinación se puede escribir; acá no.

import {
  armarArbol,
  cadenaDeNivel,
  claseDeNivel,
  faltantesDePlantilla,
  impedimentosParaDesactivar,
  resumenDeFaltantes,
  nodosVisibles,
  rutaDeNivel,
  tieneHijos,
  validarPadre,
  type Nivel,
} from '../niveles';

const n = (id: number, grado: number, nombre: string, padreId: number | null, clase: Nivel['clase'] = null): Nivel => ({
  id,
  grado,
  nombre,
  padreId,
  clase,
  activo: true,
});

// PRODUCTOS(1) › MINTRACE(2) › Ambientes(3)
const NIVELES: Nivel[] = [
  n(1, 1, 'PRODUCTOS', null, 'PRODUCTOS'),
  n(2, 2, 'MINTRACE', 1),
  n(3, 3, 'Ambientes', 2),
  n(10, 1, 'EMPRESA', null, 'EMPRESA'),
];

describe('cadenaDeNivel y derivados — los grados 1 y 2 no se almacenan', () => {
  it('sube hasta la raíz', () => {
    expect(cadenaDeNivel(3, NIVELES).map((x) => x.nombre)).toEqual(['PRODUCTOS', 'MINTRACE', 'Ambientes']);
  });

  it('la ruta es legible', () => {
    expect(rutaDeNivel(3, NIVELES)).toBe('PRODUCTOS · MINTRACE · Ambientes');
  });

  it('la clase se hereda de la raíz', () => {
    // Si se almacenara en el hijo, éste podría contradecir al padre y nadie sabría cuál miente.
    expect(claseDeNivel(3, NIVELES)).toBe('PRODUCTOS');
  });

  it('un nivel huérfano devuelve lo que hay, no lo que debería haber', () => {
    // Rellenar la cadena con marcadores escondería el dato roto que hay que mostrar.
    const huerfano = [...NIVELES, n(9, 3, 'Suelto', 77)];
    expect(cadenaDeNivel(9, huerfano).map((x) => x.nombre)).toEqual(['Suelto']);
    expect(claseDeNivel(9, huerfano)).toBeNull();
  });

  it('no se cuelga si la jerarquía trae un ciclo', () => {
    // No debería existir, pero colgar la pantalla sería peor que dibujarlo mal.
    const ciclo = [n(20, 2, 'A', 21), n(21, 3, 'B', 20)];
    expect(cadenaDeNivel(20, ciclo)).toHaveLength(2);
  });
});

describe('validarPadre — el error que el Excel no puede evitar', () => {
  it('rechaza un nivel 2 colgando de otro nivel 2', () => {
    const r = validarPadre(2, 2, NIVELES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('grado 2');
  });

  it('acepta un nivel 3 bajo un nivel 2', () => {
    expect(validarPadre(3, 2, NIVELES).ok).toBe(true);
  });

  it('un grado 1 no cuelga de nadie', () => {
    expect(validarPadre(1, null, NIVELES).ok).toBe(true);
    expect(validarPadre(1, 10, NIVELES).ok).toBe(false);
  });

  it('un grado 2 sin padre se rechaza', () => {
    const r = validarPadre(2, null, NIVELES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('grado 1');
  });

  it('no admite un cuarto grado', () => {
    expect(validarPadre(4, 3, NIVELES).ok).toBe(false);
  });

  it('rechaza colgar de un padre inactivo', () => {
    const conInactivo = [...NIVELES.filter((x) => x.id !== 2), { ...n(2, 2, 'MINTRACE', 1), activo: false }];
    expect(validarPadre(3, 2, conInactivo).ok).toBe(false);
  });
});

describe('impedimentosParaDesactivar — un nivel con hijos no se apaga y ya', () => {
  it('nombra los hijos que lo impiden', () => {
    const r = impedimentosParaDesactivar(2, NIVELES, new Map());
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('Ambientes');
  });

  it('cuenta los activos que quedarían apuntando a una rama que no se dibuja', () => {
    const r = impedimentosParaDesactivar(3, NIVELES, new Map([[3, 12]]));
    expect(r[0]).toContain('12 activo');
  });

  it('un nivel hoja y vacío se puede desactivar', () => {
    expect(impedimentosParaDesactivar(3, NIVELES, new Map())).toEqual([]);
  });
});

describe('faltantesDePlantilla — señala, no bloquea', () => {
  const plantilla = [
    { nombreNivel3: 'Ambientes', activoEsperado: 'Desarrollo', obligatorio: true },
    { nombreNivel3: 'Ambientes', activoEsperado: 'Staging', obligatorio: true },
    { nombreNivel3: 'Ambientes', activoEsperado: 'Produccion', obligatorio: true },
    { nombreNivel3: 'Documentacion', activoEsperado: 'Publica', obligatorio: false },
  ];

  it('da por cubierto lo que contiene el nombre esperado', () => {
    // Exigir el nombre exacto produciría faltantes falsos en cada producto, y una lista con
    // ruido es una lista que nadie mira.
    const presentes = new Map([['Ambientes', ['Ambiente de desarrollo MINTRACE', 'Producción MINTRACE']]]);
    const r = faltantesDePlantilla(plantilla, presentes);
    expect(r.map((f) => f.activoEsperado)).toEqual(['Staging', 'Publica']);
  });

  it('ignora tildes y mayúsculas', () => {
    const presentes = new Map([['Ambientes', ['PRODUCCIÓN']]]);
    const r = faltantesDePlantilla(
      [{ nombreNivel3: 'Ambientes', activoEsperado: 'Produccion', obligatorio: true }],
      presentes,
    );
    expect(r).toEqual([]);
  });

  it('un nivel 3 que no existe deja todos sus esperados como faltantes', () => {
    const r = faltantesDePlantilla(plantilla, new Map());
    expect(r).toHaveLength(4);
  });
});

describe('resumenDeFaltantes — el texto de la ficha', () => {
  it('nombra los obligatorios y separa los opcionales', () => {
    // Un producto interno sin documentación pública no está tan incompleto como uno sin
    // ambiente de producción, y mezclarlos los haría ver igual.
    const t = resumenDeFaltantes([
      { nombreNivel3: 'Ambientes', activoEsperado: 'Staging', obligatorio: true },
      { nombreNivel3: 'Documentacion', activoEsperado: 'Publica', obligatorio: false },
    ]);
    expect(t).toContain('Le falta staging');
    expect(t).toContain('que es opcional');
  });

  it('pluraliza cuando hay varios', () => {
    const t = resumenDeFaltantes([
      { nombreNivel3: 'A', activoEsperado: 'Staging', obligatorio: true },
      { nombreNivel3: 'A', activoEsperado: 'Produccion', obligatorio: true },
    ]);
    expect(t).toContain('Le faltan staging y produccion');
  });

  it('sin faltantes lo dice en positivo', () => {
    expect(resumenDeFaltantes([])).toContain('completa');
  });
});

describe('armarArbol — de la empresa al contenedor', () => {
  const NIV: Nivel[] = [
    n(1, 1, 'PRODUCTOS', null, 'PRODUCTOS'),
    n(2, 2, 'MINTRACE', 1),
    n(3, 3, 'Ambientes', 2),
    n(4, 3, 'Vacio', 2),
    n(10, 1, 'EMPRESA', null, 'EMPRESA'),
  ];
  const act = (id: number, nivelId: number | null, extra: Partial<{ propietarioId: number | null; criticidad: number | null }> = {}) => ({
    id,
    codigo: `TEC-APP-000${id}`,
    nombre: `Activo ${id}`,
    nivelId,
    tipo: 'Aplicación',
    propietarioId: 7 as number | null,
    criticidad: 4 as number | null,
    ...extra,
  });

  it('anida nivel 1 › 2 › 3 › activo › despliegue', () => {
    const a = armarArbol({
      niveles: NIV,
      activos: [act(1, 3)],
      despliegues: [{ id: 9, activoId: 1, nombre: 'crm-prod', ambiente: 'produccion', estado: 'running' }],
    });
    const clases = a.map((x) => x.clase);
    expect(clases).toContain('NIVEL_1');
    expect(clases).toContain('DESPLIEGUE');
    // El despliegue cuelga del ACTIVO, no del nivel: es una hoja de presentación.
    const d = a.find((x) => x.clase === 'DESPLIEGUE');
    expect(d?.padreId).toBe('a1');
    expect(d?.profundidad).toBe(4);
  });

  it('los ids llevan prefijo: un nivel y un activo pueden compartir número', () => {
    // Sin prefijo chocarían en la lista plana y la expansión abriría la rama equivocada.
    const a = armarArbol({ niveles: NIV, activos: [act(1, 3)], despliegues: [] });
    expect(a.some((x) => x.id === 'n1')).toBe(true);
    expect(a.some((x) => x.id === 'a1')).toBe(true);
  });

  it('un activo puede colgar de cualquiera de los tres grados', () => {
    const a = armarArbol({ niveles: NIV, activos: [act(1, 1), act(2, 2), act(3, 3)], despliegues: [] });
    expect(a.find((x) => x.id === 'a1')?.padreId).toBe('n1');
    expect(a.find((x) => x.id === 'a2')?.padreId).toBe('n2');
    expect(a.find((x) => x.id === 'a3')?.padreId).toBe('n3');
  });

  it('el activo sin nivel NO entra al árbol', () => {
    // Se cuenta aparte en la pantalla; colgarlo de una rama cualquiera sería inventarle
    // una clasificación que nadie le dio.
    const a = armarArbol({ niveles: NIV, activos: [act(1, null)], despliegues: [] });
    expect(a.some((x) => x.clase === 'ACTIVO')).toBe(false);
  });

  it('un nivel 3 vacío se marca como tal', () => {
    const a = armarArbol({ niveles: NIV, activos: [], despliegues: [] });
    expect(a.find((x) => x.nombre === 'Vacio')?.marca).toBe('vacío');
  });

  it('la marca del activo es UNA, la más grave', () => {
    // Dos etiquetas en la misma fila compiten por la atención y ninguna gana.
    const sinDueno = armarArbol({
      niveles: NIV,
      activos: [act(1, 3, { propietarioId: null, criticidad: null })],
      despliegues: [],
    });
    expect(sinDueno.find((x) => x.id === 'a1')?.marca).toBe('sin propietario');
  });

  it('marca el despliegue legacy', () => {
    const a = armarArbol({
      niveles: NIV,
      activos: [act(1, 3)],
      despliegues: [{ id: 9, activoId: 1, nombre: 'viejo', ambiente: 'legacy', estado: 'legacy / abandonado' }],
    });
    expect(a.find((x) => x.clase === 'DESPLIEGUE')?.marca).toContain('legacy');
  });

  it('un nivel inactivo no se dibuja, ni sus hijos', () => {
    const conInactivo = [...NIV.filter((x) => x.id !== 2), { ...n(2, 2, 'MINTRACE', 1), activo: false }];
    const a = armarArbol({ niveles: conInactivo, activos: [act(1, 3)], despliegues: [] });
    expect(a.some((x) => x.nombre === 'MINTRACE')).toBe(false);
    expect(a.some((x) => x.nombre === 'Ambientes')).toBe(false);
  });
});

describe('nodosVisibles — un nodo se ve si TODOS sus ancestros están abiertos', () => {
  const arbol = armarArbol({
    niveles: [n(1, 1, 'PRODUCTOS', null, 'PRODUCTOS'), n(2, 2, 'MINTRACE', 1), n(3, 3, 'Ambientes', 2)],
    activos: [
      {
        id: 1,
        codigo: 'X',
        nombre: 'App',
        nivelId: 3,
        tipo: 'Aplicación',
        propietarioId: 7,
        criticidad: 4,
      },
    ],
    despliegues: [],
  });

  it('con todo cerrado sólo se ven las raíces', () => {
    expect(nodosVisibles(arbol, new Set()).map((x) => x.nombre)).toEqual(['PRODUCTOS']);
  });

  it('abrir el abuelo no basta para ver al nieto', () => {
    // Es el caso que un cálculo por «mi padre está abierto» resolvería mal.
    const r = nodosVisibles(arbol, new Set(['n1', 'n3']));
    expect(r.map((x) => x.nombre)).toEqual(['PRODUCTOS', 'MINTRACE']);
  });

  it('con la cadena entera abierta se ve todo', () => {
    const r = nodosVisibles(arbol, new Set(['n1', 'n2', 'n3', 'a1']));
    expect(r).toHaveLength(4);
  });
});

describe('tieneHijos — la flecha no se dibuja en una hoja', () => {
  const arbol = armarArbol({
    niveles: [n(1, 1, 'PRODUCTOS', null, 'PRODUCTOS'), n(2, 2, 'MINTRACE', 1)],
    activos: [],
    despliegues: [],
  });

  it('la raíz con hijo sí, la hoja no', () => {
    // Dibujar la flecha en una hoja invita a un clic que no hace nada.
    expect(tieneHijos(arbol, 'n1')).toBe(true);
    expect(tieneHijos(arbol, 'n2')).toBe(false);
  });
});
