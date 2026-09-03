// lib/sig/procesos.ts
//
// Los nueve procesos del mapa de MAN-SIG-02 (docs/handoff_sig/proceso-entidad.md §3).
//
// La tabla `Proceso` nace VACÍA y este módulo dice por qué: poblarla exige dos datos que la
// fuente NO da, y ninguno se inventa acá.
//
// ── Hueco 1 · el área de cada proceso ──
//
// El documento lo declara abierto en su §6.2: «El mapa da la banda y el cargo, no el área;
// hay que fijarla antes de migrar.» Al mirar la base aparece algo que el documento no
// previó: las diez áreas cargadas se llaman IGUAL que los nueve procesos, una por una. Es
// decir, hoy área y proceso son las mismas nueve cosas con otro nombre, y `Proceso.areaId`
// apuntaría a su homónima sin agregar información.
//
// Peor: el caso que justifica D1 —Yuliet Rojas, área **Operaciones**, lidera tres
// procesos— no se puede escribir, porque **no existe un área llamada Operaciones**. D11
// asigna Albeiro a **Finanzas** y Yuliet a **Operaciones**, y ninguna de las dos está en la
// base. Las áreas cargadas son EST, COM, PRY, SAC, TAL, LEG, TEC, SIG, FIN y TRA.
//
// O se crean las áreas reales de la organización (Operaciones, Finanzas…) y los nueve
// procesos cuelgan de ellas, o las áreas actuales SON los procesos y `Proceso` no hace
// falta. Es una decisión de quien especifica, no del código.
//
// ── Hueco 2 · el catálogo de cargos ──
//
// El documento lo advierte en §6.1 y el prompt lo repite: «un duplicado deja un proceso
// apuntando a un cargo que nadie ocupa». Al mirar la base, el problema resultó ser OTRO y
// más profundo: **el mapa de procesos está en español y el catálogo de cargos en inglés.**
//
//   mapa (MAN-SIG-02)          catálogo cargado
//   ─────────────────────      ────────────────────────────────────
//   Gerencia General           CEO
//   Gerencia Comercial         Chief Commercial Officer
//   Gerencia de Operaciones    Chief Operating Officer · Operations & Services Manager
//   Líder Administrativo       Finance and Administrative Manager
//   Chief Legal Officer        Chief Legal Officer            ← coincide
//   Líder del SIG              Líder del SIG                  ← coincide
//
// Sólo esos DOS de los seis coinciden, y coinciden porque el mapa usó el nombre inglés en
// un caso y el español en el otro. Ningún emparejamiento por texto resuelve los otros
// cuatro: «operaciones» no aparece en ninguno de los trece nombres del catálogo, y
// «Operating» y «Operations» son dos cargos distintos, no una variante ortográfica.
//
// Así que no es un trabajo de deduplicación: es una decisión de correspondencia que una
// persona tiene que declarar. `resolverCargo` está escrito para NEGARSE a adivinarla, y
// hay una prueba que existe para que nadie intente escribir el emparejamiento.
//
// Aparte: `Gestión Tecnológica` y `Talento Humano` están cargados COMO CARGOS y son
// nombres de área. Un proceso cuyo dueño es «Gestión Tecnológica» no dice quién responde,
// dice dónde ocurre. Son residuo de carga y hay que sacarlos antes de que
// `CargoResponsable` sea una llave.
//
// Los nombres de cargo de acá quedan como el TEXTO del mapa, sin resolver a un id: la
// pantalla los muestra como faltantes, que es lo que el prompt pide expresamente («no
// inventes datos que falten; déjalo visible como faltante»).

export type TipoProceso = 'ESTRATEGICO' | 'MISIONAL' | 'APOYO';

export interface ProcesoDelMapa {
  codigo: string;
  nombre: string;
  tipo: TipoProceso;
  /// El cargo TAL COMO lo nombra el mapa de MAN-SIG-02. No es un id y no debe convertirse
  /// en uno hasta que el catálogo esté unificado.
  cargoDelMapa: string;
  /// Quién lo ocupa hoy, según §3. Informativo: el dueño del proceso es el cargo.
  ocupaHoy: string;
}

/// Los nueve, del mapa. Es la fuente; si una pantalla muestra otros, la pantalla está mal.
export const PROCESOS_DEL_MAPA: ProcesoDelMapa[] = [
  { codigo: 'EST', nombre: 'Gestión Estratégica', tipo: 'ESTRATEGICO', cargoDelMapa: 'Gerencia General', ocupaHoy: 'Daniel Medina' },
  { codigo: 'COM', nombre: 'Gestión Comercial', tipo: 'MISIONAL', cargoDelMapa: 'Gerencia Comercial', ocupaHoy: 'Lina Medina' },
  { codigo: 'PRO', nombre: 'Gestión de Proyectos', tipo: 'MISIONAL', cargoDelMapa: 'Gerencia de Operaciones', ocupaHoy: 'Yuliet Rojas' },
  { codigo: 'SAC', nombre: 'Soporte y Servicio al Cliente', tipo: 'MISIONAL', cargoDelMapa: 'Gerencia de Operaciones', ocupaHoy: 'Yuliet Rojas' },
  { codigo: 'TAL', nombre: 'Talento Humano', tipo: 'APOYO', cargoDelMapa: 'Líder Administrativo', ocupaHoy: 'Albeiro Medina' },
  { codigo: 'LCO', nombre: 'Gestión Legal y de Compras', tipo: 'APOYO', cargoDelMapa: 'Chief Legal Officer', ocupaHoy: 'Marcela Molina' },
  { codigo: 'TEC', nombre: 'Gestión Tecnológica', tipo: 'APOYO', cargoDelMapa: 'Gerencia de Operaciones', ocupaHoy: 'Yuliet Rojas' },
  { codigo: 'SIG', nombre: 'Sistema Integrado de Gestión', tipo: 'APOYO', cargoDelMapa: 'Líder del SIG', ocupaHoy: 'Katherine Quiroga' },
  { codigo: 'FIN', nombre: 'Gestión Financiera', tipo: 'APOYO', cargoDelMapa: 'Líder Administrativo', ocupaHoy: 'Albeiro Medina' },
];

export interface ResolucionCargo {
  cargoDelMapa: string;
  /// El id, sólo cuando hay UNA coincidencia inequívoca.
  cargoId: number | null;
  /// Los candidatos cuando hay más de uno, o ninguno. Es lo que la pantalla muestra.
  candidatos: { id: number; nombre: string }[];
  estado: 'RESUELTO' | 'AMBIGUO' | 'SIN_CANDIDATO';
}

/// Resuelve un nombre de cargo del mapa contra el catálogo real, y NO adivina.
///
/// Coincidencia exacta primero. Si no hay, se buscan candidatos por palabra significativa,
/// y con más de uno el resultado es `AMBIGUO` — no el primero de la lista. Elegir el
/// primero es exactamente el error que §6.1 anticipa: un proceso apuntando a un cargo que
/// nadie ocupa, y nadie se enteraría hasta que una obligación no le llegara a su dueño.
export function resolverCargo(
  cargoDelMapa: string,
  catalogo: readonly { id: number; nombre: string }[],
): ResolucionCargo {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const exacto = catalogo.filter((c) => norm(c.nombre) === norm(cargoDelMapa));
  if (exacto.length === 1) {
    return { cargoDelMapa, cargoId: exacto[0].id, candidatos: exacto, estado: 'RESUELTO' };
  }

  // Las palabras que discriminan. «Gerencia», «de» y «Líder» aparecen en media docena de
  // nombres, así que buscar por ellas devolvería el catálogo entero.
  const VACIAS = new Set(['gerencia', 'gerente', 'lider', 'de', 'del', 'la', 'y', 'chief', 'officer', 'manager']);
  const claves = norm(cargoDelMapa)
    .split(/\s+/)
    .filter((p) => p.length > 2 && !VACIAS.has(p));

  const candidatos =
    claves.length === 0
      ? []
      : catalogo.filter((c) => claves.some((k) => norm(c.nombre).includes(k)));

  if (candidatos.length === 1) {
    return { cargoDelMapa, cargoId: candidatos[0].id, candidatos, estado: 'RESUELTO' };
  }
  return {
    cargoDelMapa,
    cargoId: null,
    candidatos,
    estado: candidatos.length === 0 ? 'SIN_CANDIDATO' : 'AMBIGUO',
  };
}

/// Los cargos del catálogo que son en realidad nombres de área. Son residuo de carga y hay
/// que sacarlos antes de que `CargoResponsable` sea una llave: un proceso cuyo dueño es
/// «Gestión Tecnológica» no dice quién responde, dice dónde ocurre.
export function cargosQueSonAreas(
  catalogo: readonly { id: number; nombre: string }[],
  areas: readonly { nombre: string }[],
): { id: number; nombre: string }[] {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const nombresDeArea = new Set(areas.map((a) => norm(a.nombre)));
  return catalogo.filter((c) => nombresDeArea.has(norm(c.nombre)));
}

/// El área homónima de un proceso, si existe. Devuelve `null` cuando no la hay — y eso NO
/// se rellena con la primera parecida: el área del proceso es una decisión declarada, no
/// una coincidencia de nombre.
export function areaHomonima(
  proceso: { nombre: string },
  areas: readonly { id: number; nombre: string }[],
): { id: number; nombre: string } | null {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // «Gestión Legal y de Compras» en el mapa contra «Gestión Legal y Compras» en la base:
  // la partícula sobra y el resto es idéntico, así que se compara sin ella.
  const sinParticulas = (s: string) => norm(s).replace(/\bde\b/g, '').replace(/\s+/g, ' ').trim();
  return (
    areas.find((a) => sinParticulas(a.nombre) === sinParticulas(proceso.nombre)) ?? null
  );
}

export const ETIQUETA_TIPO: Record<TipoProceso, string> = {
  ESTRATEGICO: 'Estratégico',
  MISIONAL: 'Misional',
  APOYO: 'Apoyo',
};
