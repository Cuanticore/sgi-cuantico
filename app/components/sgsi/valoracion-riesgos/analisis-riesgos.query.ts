import 'server-only';

// app/components/sgsi/valoracion-riesgos/analisis-riesgos.query.ts
//
// La lectura detrás de «Análisis de riesgos» (REQ-SIG-20 §5, P4, D7). Sigue el mismo patrón
// que `app/sgsi/inventario/page.tsx` y `app/components/sgsi/valoracion/valoracion.query.ts`
// (REQ-SIG-18): el servidor lee y nada más — ni una fila en `Bitacora` por visitar la página
// ni por usar sus filtros (tarea 3.13). Toda la agregación —qué activo entra al análisis,
// las cinco tarjetas, los seis filtros— vive en `lib/sgsi/analisis-riesgos.ts`, que es puro y
// está probado.
//
// LO QUE VIAJA es materia prima: los activos vigentes con sus D/I/C, su área («proceso» en el
// lenguaje del dominio — la misma convención que `evaluacion.query.ts` y el inventario ya
// usan), su propietario, su custodio persona y sus riesgos NO obsoletos con las dos cifras
// derivadas ya calculadas (`Riesgo.riesgoPotencial`/`riesgoResidual`, escritas por
// `generarRiesgos`). El valor del activo se recalcula acá con `valorActivo` —la misma
// aritmética que la ficha, el inventario y la Ecuación usan, nunca una copia— porque no existe
// una columna `valor` en la base (invariante 1: lo derivable se calcula, no se almacena).
//
// LA CRITICIDAD (columna «Criticidad», P9) viaja como el código de `CriticidadNegocio`
// (C1..C5) o `null` cuando el activo todavía no fue clasificado — ver el encabezado de
// `lib/sgsi/analisis-riesgos.ts`.

import { prisma } from '@/lib/db';
import { valorActivo } from '@/lib/sgsi/formulas';
import { leerDeudaPlanes } from '@/lib/sgsi/deuda-planes-lectura';
import type { AccionPlanParaDeuda } from '@/lib/sgsi/deuda-planes';
import type { FilaFranjaSinPlan } from '@/app/components/sgsi/planes/FranjaSinPlan';
import type { ActivoAnalizable } from '@/lib/sgsi/analisis-riesgos';
import type { UmbralRiesgo } from '@/lib/sgsi/riesgo-activo';

export interface DatosPaginaAnalisis {
  /// TODOS los activos vigentes — los 299, no solo los 37 —; `lib/sgsi/analisis-riesgos.ts`
  /// aplica la gating del umbral. Ver su comentario de cabecera.
  activos: ActivoAnalizable[];
  bandas: UmbralRiesgo[];
  umbral: number;
  /// Los catálogos para el filtro, recortados a lo que efectivamente entra al análisis: un
  /// proceso que solo tiene activos de valor 3 no aparece en el desplegable de esta pantalla,
  /// aunque sí en el del inventario.
  procesos: string[];
  propietarios: string[];
  personas: { correo: string; nombre: string }[];
  /// REQ-SIG-20 §7 (D4, tarea 4.10-4.11) · los `AccionPlan` activos, crudos — la pantalla
  /// reconstruye `ResolverDeudaPlan` del lado del cliente con `construirResolverDeuda`
  /// (`lib/sgsi/deuda-planes.ts`), porque sus seis filtros reescopan sin ida y vuelta al
  /// servidor y una función no cruza ese límite.
  accionesParaDeuda: AccionPlanParaDeuda[];
  /// La franja nombrada (tarea 4.17), ya resuelta con antigüedad. Sin `Date`: solo lo que
  /// `FranjaSinPlan.tsx` necesita, para que el prop cruce el límite servidor→cliente como
  /// datos planos.
  sinPlan: FilaFranjaSinPlan[];
}

export async function leerAnalisisRiesgos(): Promise<DatosPaginaAnalisis> {
  const [activosVigentes, umbrales, parametro, deuda] = await Promise.all([
    prisma.activo.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      select: {
        codigo: true,
        nombre: true,
        area: { select: { nombre: true } },
        propietario: { select: { nombre: true } },
        persona: { select: { nombre: true, correo: true } },
        // REQ-SIG-20 §11 (P9, Fase 4) · declarada por el negocio, nunca derivada del
        // residual. Viaja el código (C1..C5), no el nombre: es lo que la pantalla y el
        // filtro comparan.
        criticidad: { select: { codigo: true } },
        valores: {
          select: { dimension: { select: { codigo: true } }, valor: { select: { valor: true } } },
        },
        // Los obsoletos están fuera de alcance por definición (mismo criterio que
        // `app/sgsi/inventario/page.tsx`): contarlos infla «Amenazas» y podría subir una banda
        // por una amenaza que ya no aplica.
        riesgos: {
          where: { obsoleto: false },
          select: {
            amenaza: { select: { codigo: true, nombre: true } },
            riesgoPotencial: true,
            riesgoResidual: true,
          },
        },
      },
    }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.parametro.findUnique({ where: { clave: 'umbral_valoracion' } }),
    leerDeudaPlanes(),
  ]);

  // El mismo default que `lib/sgsi/riesgos.ts`, el inventario y la Valoración: un activo
  // entra al análisis a partir de 4.
  const umbral = Number(parametro?.valor ?? 4);

  const bandas: UmbralRiesgo[] = umbrales.map((u) => ({
    nombre: u.nombre,
    desde: u.desde.toString(),
    hasta: u.hasta.toString(),
    orden: u.orden,
  }));

  const activos: ActivoAnalizable[] = activosVigentes.map((a) => {
    const porDimension = new Map(a.valores.map((v) => [v.dimension.codigo, v.valor.valor]));
    const D = porDimension.get('D') ?? 0;
    const I = porDimension.get('I') ?? 0;
    const C = porDimension.get('C') ?? 0;

    return {
      codigo: a.codigo ?? '(sin código)',
      nombre: a.nombre,
      valor: valorActivo({ D, I, C }).toNumber(),
      // REQ-SIG-20 §11 (P9) · declarada por el negocio, nunca derivada del residual.
      criticidad: a.criticidad?.codigo ?? null,
      proceso: a.area.nombre,
      propietario: a.propietario?.nombre ?? null,
      persona: a.persona?.nombre ?? null,
      personaCorreo: a.persona?.correo ?? null,
      riesgos: a.riesgos.map((r) => ({
        amenazaCodigo: r.amenaza.codigo,
        amenazaNombre: r.amenaza.nombre,
        // Decimal → string: nunca un float antes de clasificar (mismo criterio que
        // `InventarioActivos.tsx`).
        potencial: r.riesgoPotencial?.toString() ?? null,
        residual: r.riesgoResidual?.toString() ?? null,
        obsoleto: false,
      })),
    };
  });

  const enAnalisis = activos.filter((a) => a.valor >= umbral);

  const procesos = unicos(enAnalisis.map((a) => a.proceso));
  const propietarios = unicos(
    enAnalisis.map((a) => a.propietario).filter((v): v is string => v !== null),
  );
  const porCorreo = new Map<string, string>();
  for (const a of enAnalisis) {
    if (a.personaCorreo !== null) porCorreo.set(a.personaCorreo, a.persona ?? a.personaCorreo);
  }
  const personas = [...porCorreo.entries()]
    .map(([correo, nombre]) => ({ correo, nombre }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));

  return {
    activos,
    bandas,
    umbral,
    procesos,
    propietarios,
    personas,
    accionesParaDeuda: deuda.acciones,
    sinPlan: deuda.filas.map((f) => ({
      activoCodigo: f.activoCodigo,
      activoNombre: f.activoNombre,
      amenazaCodigo: f.amenazaCodigo,
      amenazaNombre: f.amenazaNombre,
      diasPendiente: f.diasPendiente,
      escalado: f.escalado,
    })),
  };
}

function unicos(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'es'));
}
