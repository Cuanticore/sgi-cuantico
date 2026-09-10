// app/sgsi/inventario/page.tsx
//
// Handoff v2.1 screen 2, "Inventario de activos".
//
// The server reads and nothing else. There is no value column, no level column and no
// band column in the query, because none of them exists in the database: the asset's
// value is max(v_D, v_I, v_C) and the risk bands are read against `umbral_riesgo`, both
// derived in the browser so that editing D, I or C in the grid moves every figure at
// once. What travels is the raw material — the three dimension values, the risk figures
// and the parametrized scales.

import { prisma } from '@/lib/db';
import { cadenaDeNivel, type Nivel } from '@/lib/sig/niveles';
import type { DimensionActiva } from '@/lib/sgsi/valoracion-agregada';
import InventarioActivos, {
  type ActivoVista,
  type BandaRiesgo,
  type NivelValor,
} from '@/app/components/sgsi/inventario/InventarioActivos';

export const dynamic = 'force-dynamic';

export default async function InventarioPage() {
  const [activos, escala, umbrales, parametro, niveles, dimensiones] = await Promise.all([
    prisma.activo.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      include: {
        area: { select: { nombre: true } },
        tipo: { select: { codigo: true, nombre: true } },
        subtipo: { select: { codigo: true, nombre: true } },
        propietario: { select: { nombre: true } },
        custodio: { select: { nombre: true } },
        // REQ-SIG-18 §7.5 · el custodio PERSONA, que no es el custodio cargo. La Tabla B de la
        // pantalla de Valoración enlaza por correo —`Persona.correo` es único y el nombre no
        // (§9)— y sin esto el clic no tenía a dónde llegar.
        persona: { select: { nombre: true, correo: true } },
        proveedor: { select: { nombre: true } },
        valores: {
          select: { dimension: { select: { codigo: true } }, valor: { select: { valor: true } } },
        },
        // Obsolete risks are out of scope by definition; counting them would inflate the
        // last column and could raise a band from a threat that no longer applies.
        riesgos: {
          where: { obsoleto: false },
          select: { riesgoPotencial: true, riesgoResidual: true },
        },
      },
    }),
    prisma.escalaValor.findMany({ orderBy: { orden: 'asc' } }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.parametro.findUnique({ where: { clave: 'umbral_valoracion' } }),
    // La jerarquia del inventario (REQ-SIG-06). Se trae ENTERA y los tres grados se derivan
    // aca: el activo guarda solo `nivelId` apuntando al nivel 3, y guardar los otros dos
    // seria guardar lo derivable.
    prisma.nivelActivo.findMany({
      select: { id: true, grado: true, nombre: true, padreId: true, clase: true, activo: true },
    }),
    // Las dimensiones ACTIVAS, no tres constantes. `Dimension` admite cinco códigos —D, I, C,
    // A, T— y hoy hay tres sembradas: el filtro por dimensión del §7.3 lee de acá qué códigos
    // puede aceptar la URL, así que el día que entre `A` no hay que tocar este archivo.
    prisma.dimension.findMany({
      where: { activa: true },
      orderBy: { orden: 'asc' },
      select: { codigo: true, nombre: true },
    }),
  ]);

  // Same default as lib/sgsi/riesgos.ts: an asset enters the analysis at 4.
  const umbralValoracion = Number(parametro?.valor ?? 4);

  const jerarquia: Nivel[] = niveles;

  const vista: ActivoVista[] = activos.map((a) => {
    // `[nivel 1, nivel 2, nivel 3]`, o lo que haya. Una cadena mas corta significa que la
    // rama esta incompleta, y se muestra como esta en vez de rellenarse.
    const cadena = a.nivelId === null ? [] : cadenaDeNivel(a.nivelId, jerarquia);
    // OJO · las dos lecturas de «no hay fila», y por qué convivén.
    //
    // La grilla lee la dimensión que falta como un 0: el libro deja la celda en blanco cuando
    // la dimensión no aplica al activo, el select tiene que mostrar algo y 0 es lo que
    // «Irrelevante» significa. REQ-SIG-18 §9 lee lo contrario para AGREGAR —sin fila es «Sin
    // valorar», que no es un 0, porque confundirlas infla el nivel más bajo con activos que
    // nadie miró—. Las dos son correctas en su lugar, así que `D/I/C` conserva el 0 para el
    // select y `valores` conserva el null para el filtro por dimensión y para la pantalla de
    // Valoración. Unificarlas en una sola habría cambiado en silencio lo que la grilla muestra.
    const porDimension = new Map(a.valores.map((v) => [v.dimension.codigo, v.valor.valor]));

    return {
      codigo: a.codigo ?? '(sin código)',
      codigoHeredado: a.codigoHeredado,
      nombre: a.nombre,
      nivel1: cadena[0]?.nombre ?? null,
      nivel2: cadena[1]?.nombre ?? null,
      nivel3: cadena[2]?.nombre ?? null,
      proceso: a.area.nombre,
      // The catalogue code travels with the name — "[SW] Aplicaciones (software)" — so
      // grouping by type reads the same as the MAGERIT taxonomy the auditors use.
      tipo: `${a.tipo.codigo} ${a.tipo.nombre}`,
      subtipo: `${a.subtipo.codigo} ${a.subtipo.nombre}`,
      propietario: a.propietario?.nombre ?? null,
      custodio: a.custodio?.nombre ?? null,
      persona: a.persona?.nombre ?? null,
      // El correo y no el nombre: es el identificador estable de la persona en todo el SIG y
      // dos personas pueden llamarse igual.
      personaCorreo: a.persona?.correo ?? null,
      proveedor: a.proveedor?.nombre ?? null,
      D: porDimension.get('D') ?? 0,
      I: porDimension.get('I') ?? 0,
      C: porDimension.get('C') ?? 0,
      // El mapa completo por dimensión activa, para el filtro del §7.3. Va aparte de D/I/C
      // porque esas tres son EDITABLES en la grilla y el cliente les superpone lo que la
      // persona esté cambiando; el mapa trae además cualquier dimensión que se active después.
      valores: Object.fromEntries(
        dimensiones.map((d) => [d.codigo, porDimension.get(d.codigo) ?? null]),
      ),
      // Decimals as strings. A float here would reintroduce the rounding artefact that
      // lib/sgsi/formulas.ts documents, and it would do so right before a classification.
      riesgos: a.riesgos.map((r) => ({
        potencial: r.riesgoPotencial?.toString() ?? null,
        // NULL for every risk today: no control-threat relevance is assigned yet, so the
        // residual has not been calculated. It is rendered as "sin calcular", never 0.
        residual: r.riesgoResidual?.toString() ?? null,
      })),
    };
  });

  const nivelesValor: NivelValor[] = escala.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta }));

  const bandas: BandaRiesgo[] = umbrales.map((u) => ({
    nombre: u.nombre,
    desde: u.desde.toString(),
    hasta: u.hasta.toString(),
    orden: u.orden,
  }));

  const dimensionesActivas: DimensionActiva[] = dimensiones;

  return (
    <InventarioActivos
      activos={vista}
      escala={nivelesValor}
      bandas={bandas}
      umbralValoracion={umbralValoracion}
      dimensiones={dimensionesActivas}
    />
  );
}
