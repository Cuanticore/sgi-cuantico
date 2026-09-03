// lib/sig/__tests__/niveles.test.ts
//
// E1 · el nivel 2 pertenece a un nivel 1 y el 3 a un 2. En el Excel son tres columnas y
// cualquier combinación se puede escribir; acá no.

import {
  cadenaDeNivel,
  claseDeNivel,
  faltantesDePlantilla,
  impedimentosParaDesactivar,
  resumenDeFaltantes,
  rutaDeNivel,
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
