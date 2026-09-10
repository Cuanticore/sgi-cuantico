// lib/sgsi/inventario-filtros.ts
//
// El contrato de navegación del inventario (REQ-SIG-18 §7 y §8): de la URL a los filtros, de
// los filtros a la URL, y el predicado que decide si un activo pasa.
//
// **Por qué existe.** `InventarioActivos.tsx` arrancaba el estado en `FILTROS_VACIOS` y no
// leía `useSearchParams` en ninguna parte: un enlace a `/sgsi/inventario?propietario=X` llegaba
// a la pantalla y la pantalla lo ignoraba. Y el criterio 6 del §10 dice que el número de una
// celda de la pantalla de Valoración **es** el número de filas que el inventario muestra, así
// que la traducción URL → filtros es una decisión, no cableado, y se prueba.
//
// **`propietario` y `responsable` son dos preguntas distintas y ahora tienen dos nombres.**
// `responsable` da por bueno un activo si el propietario **O** el custodio coinciden, y así se
// queda (D-4): es útil y alguien lo usa, y cambiarle la semántica arreglaría el cuadre y
// rompería en silencio a quien lo esté usando hoy. `propietario` filtra solo por
// `Activo.propietarioId`. Sin los dos nombres, un clic en una celda que cuenta 41 propietarios
// abriría 63 filas y nada fallaría: el número simplemente sería mentira (§7.4).
//
// **`color` no se toca.** Es banda de riesgo, no valor del activo, por parecido que suene
// (§12). No entra en este predicado: se aplica aparte, después de las cuentas de los chips.

import {
  CRITERIO_MAX,
  SIN_ASIGNAR,
  valorDeCriterio,
  type DimensionActiva,
} from './valoracion-agregada';

export { CRITERIO_MAX, SIN_ASIGNAR };

export const TODOS_TIPOS = 'Todos los tipos';
export const TODOS_SUBTIPOS = 'Todos los subtipos';
export const TODOS_RESPONSABLES = 'Todos los responsables';
export const TODOS_PROPIETARIOS = 'Todos los propietarios';
export const TODAS_PERSONAS = 'Todas las personas';
export const TODOS_VALORES = 'Todos';

export type ColorFiltro = 'Todos' | 'rojo' | 'verde' | 'blanco';

export interface Filtros {
  tipo: string;
  subtipo: string;
  /// Propietario **O** custodio. El de siempre, sin cambios.
  responsable: string;
  /// Banda de riesgo del renglón. No es el valor del activo.
  color: ColorFiltro;
  /// Contra qué se comparan `valor` y `valorMinimo`: `MAX` o el código de una dimensión
  /// activa. Ausente en la URL = `MAX`.
  dimension: string;
  /// Valor **exacto** en la dimensión pedida. `null` = cualquiera.
  valor: number | null;
  /// Valor **mayor o igual**. Es lo que la columna «≥ 4» necesita y no es lo mismo que
  /// `valor`.
  valorMinimo: number | null;
  /// Nombre del `CargoResponsable`, o `SIN_ASIGNAR`. Solo `propietarioId`.
  propietario: string;
  /// **Correo** de la `Persona`, o `SIN_ASIGNAR`. Solo `personaId` — el custodio persona, no
  /// el cargo. Viaja por correo y no por nombre porque `Persona.correo` es único y el nombre
  /// no lo es (§9).
  persona: string;
  /// Acota a los activos con `personaId` no nulo. Es lo que hace cuadrar los encabezados de
  /// columna de la Tabla B: sin él, el encabezado llevaría a todo el inventario y el número no
  /// coincidiría — el mismo defecto del §7.4 en otra puerta.
  conPersona: boolean;
}

export const FILTROS_VACIOS: Filtros = {
  tipo: TODOS_TIPOS,
  subtipo: TODOS_SUBTIPOS,
  responsable: TODOS_RESPONSABLES,
  color: 'Todos',
  dimension: CRITERIO_MAX,
  valor: null,
  valorMinimo: null,
  propietario: TODOS_PROPIETARIOS,
  persona: TODAS_PERSONAS,
  conPersona: false,
};

/// Lo que la URL puede nombrar. Un valor que no está acá se ignora y se avisa: dejar la
/// pantalla vacía sin explicación es peor que mostrarla entera con un aviso (§7.1).
export interface CatalogosFiltro {
  tipos: readonly string[];
  subtipos: readonly string[];
  responsables: readonly string[];
  propietarios: readonly string[];
  /// Correos.
  personas: readonly string[];
  /// Códigos de dimensión activos.
  dimensiones: readonly string[];
  /// Los valores que la escala admite.
  niveles: readonly number[];
}

/// Lo mínimo que `URLSearchParams` y `ReadonlyURLSearchParams` cumplen. El módulo no importa
/// nada de Next para poder probarse sin un router.
export interface ParametrosLeibles {
  get(clave: string): string | null;
}

export interface LecturaDeUrl {
  filtros: Filtros;
  /// Lo que se ignoró y por qué. La pantalla los muestra; no se descartan en silencio.
  avisos: string[];
}

function nivelValido(
  crudo: string | null,
  niveles: readonly number[],
  nombre: string,
  avisos: string[],
): number | null {
  if (crudo === null || crudo === '') return null;
  const n = Number(crudo);
  if (!Number.isInteger(n) || !niveles.includes(n)) {
    avisos.push(`El parámetro «${nombre}» traía «${crudo}», que no es un nivel de la escala: se ignoró.`);
    return null;
  }
  return n;
}

function delCatalogo(
  crudo: string | null,
  catalogo: readonly string[],
  todos: string,
  nombre: string,
  avisos: string[],
  admiteSinAsignar = false,
): string {
  if (crudo === null || crudo === '') return todos;
  if (admiteSinAsignar && crudo === SIN_ASIGNAR) return SIN_ASIGNAR;
  if (!catalogo.includes(crudo)) {
    avisos.push(`El parámetro «${nombre}» traía «${crudo}», que no está en el inventario: se ignoró.`);
    return todos;
  }
  return crudo;
}

/// Los filtros que la URL pide, con lo que no se pudo honrar.
export function filtrosDesdeUrl(
  params: ParametrosLeibles,
  catalogos: CatalogosFiltro,
): LecturaDeUrl {
  const avisos: string[] = [];

  const dimensionCruda = params.get('dimension');
  let dimension = CRITERIO_MAX;
  if (dimensionCruda !== null && dimensionCruda !== '' && dimensionCruda !== CRITERIO_MAX) {
    if (catalogos.dimensiones.includes(dimensionCruda)) dimension = dimensionCruda;
    else {
      avisos.push(
        `La dimensión «${dimensionCruda}» no existe o no está activa: se filtró por el valor del activo.`,
      );
    }
  }

  const valor = nivelValido(params.get('valor'), catalogos.niveles, 'valor', avisos);
  let valorMinimo = nivelValido(params.get('valorMinimo'), catalogos.niveles, 'valorMinimo', avisos);
  // `valor` y `valorMinimo` juntos es una combinación inválida y gana `valor`, con aviso (§8).
  if (valor !== null && valorMinimo !== null) {
    avisos.push(
      `«valor» y «valorMinimo» no se pueden pedir a la vez: se filtró por el valor exacto ${valor}.`,
    );
    valorMinimo = null;
  }

  const colorCrudo = params.get('color');
  let color: ColorFiltro = 'Todos';
  if (colorCrudo !== null && colorCrudo !== '') {
    if (colorCrudo === 'rojo' || colorCrudo === 'verde' || colorCrudo === 'blanco') {
      color = colorCrudo;
    } else {
      avisos.push(`El parámetro «color» traía «${colorCrudo}», que no es una banda: se ignoró.`);
    }
  }

  const conPersonaCrudo = params.get('conPersona');
  if (conPersonaCrudo !== null && conPersonaCrudo !== '' && conPersonaCrudo !== '1') {
    avisos.push(`El parámetro «conPersona» solo admite «1»: se ignoró «${conPersonaCrudo}».`);
  }

  // El subtipo cuelga del tipo en la pantalla, pero acá los dos se leen sueltos: si la URL
  // pide un subtipo que no pertenece al tipo pedido, el predicado los aplica a los dos y no
  // queda ningún activo. Inventar una jerarquía acá exigiría el catálogo cruzado tipo→subtipo,
  // que la pantalla no tiene, y el resultado vacío con los dos filtros a la vista se explica
  // solo.
  return {
    filtros: {
      tipo: delCatalogo(params.get('tipo'), catalogos.tipos, TODOS_TIPOS, 'tipo', avisos),
      subtipo: delCatalogo(
        params.get('subtipo'),
        catalogos.subtipos,
        TODOS_SUBTIPOS,
        'subtipo',
        avisos,
      ),
      responsable: delCatalogo(
        params.get('responsable'),
        catalogos.responsables,
        TODOS_RESPONSABLES,
        'responsable',
        avisos,
      ),
      color,
      dimension,
      valor,
      valorMinimo,
      propietario: delCatalogo(
        params.get('propietario'),
        catalogos.propietarios,
        TODOS_PROPIETARIOS,
        'propietario',
        avisos,
        true,
      ),
      persona: delCatalogo(
        params.get('persona'),
        catalogos.personas,
        TODAS_PERSONAS,
        'persona',
        avisos,
        true,
      ),
      conPersona: conPersonaCrudo === '1',
    },
    avisos,
  };
}

/// Los parámetros que representan estos filtros. Solo los que no están en su valor por
/// defecto: una URL con nueve parámetros diciendo «todos» no es enlazable, es ruido.
export function parametrosDeFiltros(filtros: Filtros): Record<string, string> {
  const p: Record<string, string> = {};
  if (filtros.tipo !== TODOS_TIPOS) p.tipo = filtros.tipo;
  if (filtros.subtipo !== TODOS_SUBTIPOS) p.subtipo = filtros.subtipo;
  if (filtros.responsable !== TODOS_RESPONSABLES) p.responsable = filtros.responsable;
  if (filtros.color !== 'Todos') p.color = filtros.color;
  if (filtros.dimension !== CRITERIO_MAX) p.dimension = filtros.dimension;
  if (filtros.valor !== null) p.valor = String(filtros.valor);
  else if (filtros.valorMinimo !== null) p.valorMinimo = String(filtros.valorMinimo);
  if (filtros.propietario !== TODOS_PROPIETARIOS) p.propietario = filtros.propietario;
  if (filtros.persona !== TODAS_PERSONAS) p.persona = filtros.persona;
  if (filtros.conPersona) p.conPersona = '1';
  return p;
}

/// La cadena de consulta, con `?`, o vacía. El nombre del cargo viaja codificado y no por id
/// porque `ActivoVista` ya trae el nombre y no el id, y meter ids en la URL obligaría a un
/// viaje extra para resolverlos (§8).
export function consultaDeFiltros(filtros: Filtros): string {
  const p = new URLSearchParams(parametrosDeFiltros(filtros));
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

/// Un destino del inventario armado desde la pantalla de Valoración, con los parámetros que se
/// nombran y nada más.
export function urlDeInventario(parametros: Record<string, string | number | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) {
    if (v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s === '' ? '/sgsi/inventario' : `/sgsi/inventario?${s}`;
}

/// Un activo del inventario, reducido a lo que el predicado necesita.
export interface ActivoFiltrable {
  codigo: string;
  codigoHeredado: string | null;
  nombre: string;
  tipo: string;
  subtipo: string;
  proveedor: string | null;
  propietario: string | null;
  custodio: string | null;
  /// Correo del custodio persona. Nulo cuando el activo no está entregado a nadie.
  personaCorreo: string | null;
  /// Código de dimensión → valor. Ausente o nulo es sin valorar, que no es un 0.
  valores: Readonly<Record<string, number | null>>;
}

/// Todo lo que decide si un activo entra, salvo el color del renglón — que depende de las
/// bandas de riesgo y se aplica después, para que los chips puedan contar sobre este conjunto.
export function cumpleFiltros(
  activo: ActivoFiltrable,
  filtros: Filtros,
  busqueda: string,
  dimensiones: readonly DimensionActiva[],
): boolean {
  if (filtros.tipo !== TODOS_TIPOS && activo.tipo !== filtros.tipo) return false;
  if (filtros.subtipo !== TODOS_SUBTIPOS && activo.subtipo !== filtros.subtipo) return false;

  // El de siempre: propietario O custodio. Sin cambios (D-4).
  if (
    filtros.responsable !== TODOS_RESPONSABLES &&
    activo.propietario !== filtros.responsable &&
    activo.custodio !== filtros.responsable
  ) {
    return false;
  }

  if (filtros.propietario !== TODOS_PROPIETARIOS) {
    if (filtros.propietario === SIN_ASIGNAR) {
      if (activo.propietario !== null) return false;
    } else if (activo.propietario !== filtros.propietario) return false;
  }

  if (filtros.persona !== TODAS_PERSONAS) {
    if (filtros.persona === SIN_ASIGNAR) {
      if (activo.personaCorreo !== null) return false;
    } else if (activo.personaCorreo !== filtros.persona) return false;
  }

  if (filtros.conPersona && activo.personaCorreo === null) return false;

  if (filtros.valor !== null || filtros.valorMinimo !== null) {
    const v = valorDeCriterio(activo.valores, filtros.dimension, dimensiones);
    // Un activo sin valorar en la dimensión pedida no alcanza ningún nivel. Contarlo como 0
    // lo haría aparecer bajo `valorMinimo=0`, que es la lectura que §9 prohíbe.
    if (v === null) return false;
    if (filtros.valor !== null && v !== filtros.valor) return false;
    if (filtros.valorMinimo !== null && v < filtros.valorMinimo) return false;
  }

  const q = busqueda.trim().toLowerCase();
  if (q === '') return true;
  return [activo.codigo, activo.codigoHeredado, activo.nombre, activo.proveedor, activo.subtipo]
    .filter((v): v is string => !!v)
    .some((v) => v.toLowerCase().includes(q));
}

/// Si algún filtro está puesto. La pantalla lo usa para decidir si muestra la columna de la
/// persona y para marcar el botón de limpiar.
export function hayFiltros(filtros: Filtros, busqueda: string): boolean {
  return Object.keys(parametrosDeFiltros(filtros)).length > 0 || busqueda.trim() !== '';
}
