// app/api/sgsi/exportar-planes/route.ts
//
// «Planes de tratamiento» a Excel: dos hojas —los riesgos altos que justifican el plan y las
// acciones que lo componen— en un archivo, que es el paquete que se lleva a un comité o a una
// auditoría.
//
// Mismo corte que `exportar-analisis`: la sesión y los datos acá, el aspecto del archivo en
// `lib/sgsi/planes-libro.ts`, que no toca Prisma y por eso se puede probar solo.
//
// La ruta NO está bajo `/sgsi`, así que la puerta del layout no la ve: `sgsi:ver` se comprueba
// acá explícitamente. Quien tiene sesión válida y no el permiso recibe 403 y no 404 — el
// archivo lleva el inventario en riesgo, y decir «no existe» sería mentir.
//
// ── DE DÓNDE SALE CADA HOJA, Y POR QUÉ NINGUNA TRAE UN CRITERIO PROPIO ──────────────────
//
// Hoja 1 · los mismos `filasAnalisis` que pinta la grilla de «Análisis de riesgos», filtrados
// por la misma `esResidualAlarmante` que decide su acento rojo. No se deriva acá «qué activo
// está en riesgo alto»: dos piezas contando lo mismo desde orígenes distintos es la forma
// exacta de los tres defectos que `HARNESS.md` documenta.
//
// Hoja 2 · las acciones activas leídas con Prisma, con el MISMO `include` y el MISMO
// `alcanceDelPlan` que usa `app/sgsi/planes/page.tsx` para la columna «Qué mitiga». El filtro
// de la pantalla no se recalcula acá: llegan los códigos que la pantalla tenía visibles, y las
// cifras se vuelven a leer de la base. Los CÓDIGOS viajan, los datos no.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { leerAnalisisRiesgos } from '@/app/components/sgsi/valoracion-riesgos/analisis-riesgos.query';
import {
  FILTROS_ANALISIS_VACIOS,
  filasAnalisis,
  type ActivoAnalizable,
  type RiesgoAnalizable,
} from '@/lib/sgsi/analisis-riesgos';
import { esResidualAlarmante } from '@/lib/sgsi/columnas-analisis';
import { esBandaAlarmante } from '@/lib/sgsi/alto-sin-plan';
import { clasificar } from '@/lib/sgsi/clasificar';
import { construirResolverDeuda } from '@/lib/sgsi/deuda-planes';
import { alcanceDelPlan, type AlcancePlan, type RiesgoDelAlcance } from '@/lib/sgsi/alcance-plan';
import type { FilaPlan, FilaRiesgoAlto } from '@/lib/sgsi/planes-libro';
import type { UmbralRiesgo } from '@/lib/sgsi/riesgo-activo';

/// Las palabras del dominio para los tres enum. Son las mismas que muestran la pantalla
/// (`PlanesTratamiento.tsx`) y la plantilla del FOR-SIG-13 (`plan-plantilla-libro.ts`), y están
/// escritas de nuevo acá por una razón técnica y no por gusto: `PlanesTratamiento.tsx` lleva
/// `'use client'`, y en el grafo del servidor sus exportaciones son referencias de cliente —
/// llamarlas desde una ruta lanza «Attempted to call … from the server». Que una palabra se
/// separe de la de la pantalla no puede producir una cifra equivocada: son rótulos, no
/// criterios. El día que haya un módulo puro que las tenga, este bloque se borra y se importa.
const TIPOS: Record<string, string> = {
  MITIGAR: 'Mitigar',
  TRANSFERIR: 'Transferir',
  EVITAR: 'Evitar',
  ACEPTAR: 'Aceptar',
};

const ESTADOS: Record<string, string> = {
  NO_INICIADA: 'No iniciada',
  EN_EJECUCION: 'En ejecución',
  EN_VERIFICACION: 'En verificación',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

const VERIFICACIONES: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  VERIFICADA_EFICAZ: 'Verificada — eficaz',
  VERIFICADA_NO_EFICAZ: 'Verificada — no eficaz',
  NO_APLICA: 'No aplica',
};

/// «Qué mitiga» en una línea, para la celda del archivo. Dice lo mismo que la columna de la
/// pantalla (`CeldaAlcance`) y sale del MISMO `AlcancePlan`, que es lo que importa: las tres
/// situaciones se nombran distinto porque son hechos distintos —«sin calcular» es una deuda
/// del modelo, «ninguna amenaza» un hecho sobre el plan— y un guion para las dos dejaría al
/// lector sin saber cuál está mirando.
function textoDeAlcance(alcance: AlcancePlan | null): string {
  if (alcance === null) return 'sin calcular';
  if (alcance.estado === 'sin-control') return 'sin control';
  if (alcance.estado === 'sin-amenazas') return 'ninguna amenaza';
  const n = alcance.amenazas.length;
  return `${n} ${n === 1 ? 'amenaza' : 'amenazas'} · ${alcance.riesgos} riesgos · ${alcance.activos} activos`;
}

/// La etiqueta del filtro que llega en la consulta, lista para escribirse en una celda.
///
/// Se le quitan los caracteres de control y se recorta a 60: el texto lo manda el navegador
/// de quien exporta, y aunque sólo termine en SU propio archivo, un archivo del SGSI no puede
/// llevar una celda con un salto de línea crudo o con un párrafo entero donde va el nombre de
/// un filtro. Vacío es `null` —«sin filtro»—, que es lo que la hoja 2 dice cuando no hay.
function etiquetaDelFiltro(crudo: string | null): string | null {
  if (crudo === null) return null;
  const limpio = [...crudo]
    .filter((c) => c >= ' ')
    .join('')
    .trim()
    .slice(0, 60);
  return limpio === '' ? null : limpio;
}

/// Los riesgos VIGENTES del activo cuyo residual cae en banda alarmante. Se cuenta sobre el
/// activo crudo —`FilaAnalisis` sólo trae el PEOR residual— con `clasificar` y
/// `esBandaAlarmante`, que son los mismos que usa la grilla para su acento: una segunda lista
/// de bandas escrita acá es exactamente cómo la hoja y la pantalla terminan contando distinto.
function riesgosAlarmantes(
  a: ActivoAnalizable,
  bandas: readonly UmbralRiesgo[],
): RiesgoAnalizable[] {
  return a.riesgos.filter(
    (r) => !r.obsoleto && r.residual !== null && esBandaAlarmante(clasificar(r.residual, bandas)),
  );
}

/// La pregunta que se le hace al resolutor de deuda, con la forma EXACTA de `altoSinPlanDe`
/// (`analisis-riesgos.ts`). Si acá se armara distinto —un `null` donde allá va `undefined`—,
/// un plan cubriría una pregunta y no la otra, y el mismo activo saldría con plan en el archivo
/// y sin plan en la pantalla.
function preguntaDe(a: ActivoAnalizable, r: RiesgoAnalizable) {
  return {
    activoCodigo: a.codigo,
    amenazaCodigo: r.amenazaCodigo,
    principalCodigo: r.principal === undefined ? undefined : (r.principal?.codigo ?? null),
  };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });

  if (!puede(rolDesdeGrupos(session.user?.grupos), 'sgsi:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  const url = new URL(request.url);

  // ── EL FILTRO DE LA PANTALLA ──────────────────────────────────────────────────────────
  //
  // `codigos` AUSENTE y `codigos` VACÍO significan cosas distintas, y confundirlas es un
  // defecto con historia: ausente es «sin filtro» —bajan todas las acciones activas— y vacío
  // es «el filtro no dejó pasar ninguna». Leerlos igual haría que exportar con la grilla en
  // cero bajara el plan entero, que es lo que `9cd892c` arregló en el export del inventario.
  const recorta = url.searchParams.has('codigos');
  const pedidos = (url.searchParams.get('codigos') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // El filtro EN PALABRAS, tal como lo nombra el desplegable: va a la nota de la hoja 2, que
  // es lo que permite leer el archivo seis meses después sin adivinar qué tenía seleccionado
  // quien lo bajó. Llega como texto y no como código porque la lista de etiquetas vive en la
  // pantalla y no se puede importar desde el servidor (ver el bloque de rótulos de arriba);
  // se recorta por si acaso, porque esto se escribe dentro de una celda.
  const filtroCrudo = url.searchParams.get('filtro');
  const filtro = etiquetaDelFiltro(filtroCrudo);

  // ── HOJA 1 · LOS RIESGOS ALTOS ────────────────────────────────────────────────────────
  const datos = await leerAnalisisRiesgos();
  const resolverDeuda = construirResolverDeuda(datos.accionesParaDeuda);

  // `umbral: 0` y no `datos.umbral`: un residual alto es un residual alto, lo alcance o no el
  // activo el umbral de valoración, y recortar acá sería un segundo criterio que el día que
  // discrepe del de la grilla nadie va a notar.
  //
  // HOY NO ENSANCHA NADA, Y CONVIENE SABERLO. Medido contra la base el 2026-09-22: de 378
  // activos vigentes, 30 tienen algún riesgo calculado (3 de valor 5 y 27 de valor 4) y los
  // 348 por debajo del umbral **no tienen ni un riesgo calculado** — no es que lo tengan bajo.
  // Así que llegan 378 filas, 348 con `peorResidual = null`, y al filtrar por banda alarmante
  // quedan los MISMOS 30 que con `umbral: 4`. El día que alguien baje el umbral de valoración
  // o que se calculen riesgos por debajo de 4, este export los recoge solo y sin tocar nada.
  //
  // Es un conteo vivo y por eso lleva fecha: tres comentarios de este repo se arreglaron esta
  // semana por afirmar cifras que ya no eran ciertas. Si vas a decidir algo con ésta, vuelve a
  // medirla.
  const todas = filasAnalisis({ ...datos, umbral: 0 }, FILTROS_ANALISIS_VACIOS, resolverDeuda);
  const altas = todas.filter((f) => esResidualAlarmante(f.peorResidual));

  // ── HOJA 2 · LAS ACCIONES ─────────────────────────────────────────────────────────────
  //
  // El MISMO `include` de `app/sgsi/planes/page.tsx`: la pantalla y el archivo leen la acción
  // de la misma forma, así que una columna que allá dice algo no puede decir otra cosa acá.
  const [acciones, paresMapeados] = await Promise.all([
    prisma.accionPlan.findMany({
      where: { activa: true },
      orderBy: { codigo: 'asc' },
      include: {
        responsable: true,
        aprueba: true,
        madurezAlcanzada: true,
        control: {
          include: { capacidad: true, lineaBase: true, actual: true, objetivo: true },
        },
      },
    }),
    prisma.controlAmenaza.count(),
  ]);

  // Sin ninguna relevancia asignada el cruce está vacío, así que el alcance de una acción es
  // DESCONOCIDO y no cero. Es la misma compuerta que la pantalla llama `alcanceCalculable`.
  const alcanceCalculable = paresMapeados > 0;

  const riesgosPorControl = new Map<number, RiesgoDelAlcance[]>();
  if (alcanceCalculable) {
    // Sólo las amenazas de las que el control es PRINCIPAL, igual que la pantalla: un
    // complementario no contiene la amenaza, y listarlo haría creer que el plan la cubre.
    const filas = await prisma.controlAmenaza.findMany({
      where: { relevancia: { esPrincipal: true } },
      select: {
        controlId: true,
        amenaza: {
          select: {
            codigo: true,
            nombre: true,
            riesgos: {
              where: { obsoleto: false },
              select: { activo: { select: { codigo: true } } },
            },
          },
        },
      },
    });
    for (const f of filas) {
      const previo = riesgosPorControl.get(f.controlId) ?? [];
      for (const r of f.amenaza.riesgos) {
        previo.push({
          amenazaCodigo: f.amenaza.codigo,
          amenazaNombre: f.amenaza.nombre,
          activoCodigo: r.activo.codigo ?? '(sin código)',
        });
      }
      riesgosPorControl.set(f.controlId, previo);
    }
  }

  // ── QUÉ PLANES CUBREN CADA ACTIVO DE LA HOJA 1 ────────────────────────────────────────
  //
  // `construirResolverDeuda` contesta sí o no sobre el conjunto entero de acciones, y la hoja
  // necesita los CÓDIGOS. En vez de escribir una segunda forma de decidir «este plan cubre este
  // riesgo» —las dos vías, por prefijo de `origen` y por control principal, viven allá y
  // sólo allá—, se construye un resolutor POR ACCIÓN y se le hace la misma pregunta. El
  // agregado es idéntico por construcción: el resolutor completo es un «o» sobre las acciones.
  const cubrePorAccion = acciones.map((a) => ({
    codigo: a.codigo,
    cubre: construirResolverDeuda([
      { activa: true, origen: a.origen, controlCodigo: a.control?.codigo ?? null },
    ]),
  }));

  const crudoPorCodigo = new Map(datos.activos.map((a) => [a.codigo, a]));

  const riesgos: FilaRiesgoAlto[] = altas.map((f) => {
    const crudo = crudoPorCodigo.get(f.codigo);
    const alarmantes = crudo === undefined ? [] : riesgosAlarmantes(crudo, datos.bandas);
    const planes =
      crudo === undefined
        ? []
        : cubrePorAccion
            .filter(({ cubre }) => alarmantes.some((r) => cubre(preguntaDe(crudo, r))))
            .map(({ codigo }) => codigo);

    return {
      codigo: f.codigo,
      nombre: f.nombre,
      proceso: f.proceso,
      propietario: f.propietario,
      valor: f.valor,
      valores: f.valores,
      criticidad: f.criticidad,
      peorInherente: f.peorInherente,
      peorResidual: f.peorResidual,
      amenazasAltas: alarmantes.length,
      planes,
      // Tal cual viene de la fila, sin recalcular: el acento rojo del archivo y el de la
      // grilla salen del MISMO campo. Derivarlo acá de `planes.length === 0` haría que un
      // activo con un plan y otro riesgo alto suelto saliera blanco en el archivo y rojo en
      // la pantalla.
      altoSinPlan: f.altoSinPlan,
    };
  });

  // ── LAS FILAS DE LA HOJA 2 ────────────────────────────────────────────────────────────
  const fecha = (d: Date | null): string | null => d?.toISOString().slice(0, 10) ?? null;

  const filaDePlan = (a: (typeof acciones)[number]): FilaPlan => {
    const actual = a.control?.actual?.nivel ?? null;
    const objetivo = a.control?.objetivo?.nivel ?? null;
    const alcance = alcanceCalculable
      ? alcanceDelPlan(
          a.control
            ? { codigo: a.control.codigo, nombre: a.control.nombre, nivel: actual, objetivo }
            : null,
          a.control ? (riesgosPorControl.get(a.control.id) ?? []) : [],
        )
      : null;

    return {
      codigo: a.codigo,
      accion: a.accion,
      tipo: TIPOS[a.tipo] ?? a.tipo,
      controlCodigo: a.control?.codigo ?? null,
      controlNombre: a.control?.nombre ?? null,
      // Las tres en `null` cuando no hay control: un cero diría que el salto es cero, y lo
      // que pasa es que la fila no aplica. El mismo criterio que la pantalla, que pinta un
      // guion en vez de una barra de madurez.
      madurezActual: a.control ? actual : null,
      madurezObjetivo: a.control ? objetivo : null,
      salto: a.control ? Math.max(0, (objetivo ?? 0) - (actual ?? 0)) : null,
      queMitiga: textoDeAlcance(alcance),
      responsable: a.responsable.nombre,
      aprueba: a.aprueba.nombre,
      fechaObjetivo: fecha(a.fechaObjetivo),
      estado: ESTADOS[a.estado] ?? a.estado,
      avance: a.avance,
      verificacion: VERIFICACIONES[a.verificacion] ?? a.verificacion,
      madurezAlcanzada: a.madurezAlcanzada?.nivel ?? null,
      origen: a.origen,
      recursos: a.recursos,
      observacion: a.observacion,
      fechaAprobacion: fecha(a.fechaAprobacion),
      fechaCierre: fecha(a.fechaCierre),
      instrumento: a.instrumento,
      riesgoRemanente: a.riesgoRemanente,
      justificacionAceptacion: a.justificacionAceptacion,
      fechaRevisionAceptacion: fecha(a.fechaRevisionAceptacion),
    };
  };

  // Con `codigos` se respeta además EL ORDEN en que la pantalla los mandó, y se descarta el
  // código que ya no corresponda a una acción activa: una pestaña abierta desde ayer puede
  // pedir una acción que entre tanto se dio de baja, y bajarla sería resucitarla en el archivo.
  const porCodigo = new Map(acciones.map((a) => [a.codigo, a]));
  const planes: FilaPlan[] = recorta
    ? pedidos
        .map((c) => porCodigo.get(c))
        .filter((a): a is (typeof acciones)[number] => a !== undefined)
        .map(filaDePlan)
    : acciones.map(filaDePlan);

  const { construirLibroPlanes } = await import('@/lib/sgsi/planes-libro');
  const wb = await construirLibroPlanes(riesgos, planes, {
    totalVigentes: datos.activos.length,
    // TODAS las acciones activas, antes del filtro: es el denominador del «N de M» de la
    // hoja 2, y tomarlo de las filas exportadas daría siempre «N de N».
    totalAcciones: acciones.length,
    filtro,
  });
  const buffer = await wb.xlsx.writeBuffer();

  const hoy = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Planes de tratamiento ${hoy}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
