// app/api/sgsi/exportar-analisis/route.ts
//
// «Análisis de riesgos» a Excel, con los mismos colores que la pantalla.
//
// Mismo corte que `exportar-activos`: la sesión y los datos acá, el aspecto del archivo en
// `lib/sgsi/analisis-libro.ts`, que no toca Prisma y por eso se puede probar solo.
//
// La ruta NO está bajo `/sgsi`, así que la puerta del layout no la ve: `sgsi:ver` se
// comprueba acá explícitamente. Quien tiene sesión válida y no el permiso recibe 403 y no
// 404 — el archivo lleva el inventario en riesgo, y decir «no existe» sería mentir.
//
// LOS CÓDIGOS VIAJAN, LOS DATOS NO. La pantalla manda qué filas está viendo y en qué orden;
// las cifras se vuelven a derivar acá con el MISMO `filasAnalisis` que las derivó allá. Si en
// cambio el cliente mandara los valores, un navegador con la pestaña abierta desde ayer
// exportaría las cifras de ayer y el archivo diría que son las de hoy.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { leerAnalisisRiesgos } from '@/app/components/sgsi/valoracion-riesgos/analisis-riesgos.query';
import { FILTROS_ANALISIS_VACIOS, filasAnalisis } from '@/lib/sgsi/analisis-riesgos';
import { construirResolverDeuda } from '@/lib/sgsi/deuda-planes';
import { nivelDeRiesgoDelActivo } from '@/lib/sgsi/riesgo-activo';

/// Las bandas que entran a la matriz. Mismo criterio que `BANDAS_ALARMANTES` de
/// `alto-sin-plan.ts`, y por la misma razón: son las que ISO/IEC 27001 6.1.3 no deja pasar sin
/// una decisión — tratarlas o aceptarlas con dueño y fecha.
const BANDAS_MATRIZ: readonly string[] = ['Crítico', 'Alto'];

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });

  if (!puede(rolDesdeGrupos(session.user?.grupos), 'sgsi:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  const url = new URL(request.url);
  const pedidos = (url.searchParams.get('codigos') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const datos = await leerAnalisisRiesgos();
  const resolverDeuda = construirResolverDeuda(datos.accionesParaDeuda);
  const todas = filasAnalisis(
    { activos: datos.activos, bandas: datos.bandas, umbral: datos.umbral },
    FILTROS_ANALISIS_VACIOS,
    resolverDeuda,
  );

  // Sin `codigos` se exporta todo lo que está en análisis, que es el comportamiento de un
  // clic. Con ellos se respeta además EL ORDEN en que la pantalla los mandó: quien ordenó la
  // grilla por proceso espera abrir el archivo y encontrarlo ordenado por proceso.
  const porCodigo = new Map(todas.map((f) => [f.codigo, f]));
  const filas =
    pedidos.length === 0
      ? todas
      : pedidos.map((c) => porCodigo.get(c)).filter((f): f is (typeof todas)[number] => f !== undefined);

  // ── La matriz: un renglón por par (activo, amenaza) en banda Alto o Crítico ───────────
  //
  // SE DERIVA DE LO MISMO QUE LA HOJA POR ACTIVO, y ésa es la condición que impide que las dos
  // hojas se contradigan. `nivelDeRiesgoDelActivo` es el mismo que arma `peorResidual`; pasarle
  // un solo residual devuelve la banda de ESE riesgo con la misma regla con que la pantalla
  // clasifica el peor. Una segunda cuenta acá sería como las dos se separan.
  //
  // El alcance sigue al de la exportación: si quien exporta recortó la grilla, la matriz sale
  // de esos mismos activos y no del análisis entero.
  const porActivo = new Map(datos.activos.map((a) => [a.codigo, a]));
  // El nombre de la criticidad ya viaja para el tooltip de la grilla; el archivo lo usa para
  // decir «C4 · Estándar» en vez del código pelado que la pantalla no muestra.
  const nombreCriticidad = new Map(datos.criticidadesRto.map((c) => [c.codigo, c.nombre]));
  const riesgosMatriz = filas.flatMap((f) => {
    const activo = porActivo.get(f.codigo);
    if (activo === undefined) return [];
    return activo.riesgos
      .filter((r) => !r.obsoleto && r.residual !== null)
      .map((r) => ({ r, nivel: nivelDeRiesgoDelActivo([r.residual], datos.bandas) }))
      .filter((x) => x.nivel !== null && BANDAS_MATRIZ.includes(x.nivel.banda))
      .map(({ r, nivel }) => ({
        // Sin código de riesgo el par se nombra con sus dos mitades: es la misma identidad que
        // el prefijo de `origen` de un plan usa, así que sigue siendo rastreable.
        id: r.codigo ?? `${f.codigo}·${r.amenazaCodigo}`,
        amenazaCodigo: r.amenazaCodigo,
        amenaza: r.amenazaNombre,
        activoCodigo: f.codigo,
        activoNombre: f.nombre,
        valor: f.valor,
        valores: f.valores,
        criticidad: f.criticidad,
        criticidadNombre: f.criticidad === null ? null : (nombreCriticidad.get(f.criticidad) ?? null),
        proceso: f.proceso,
        propietario: f.propietario,
        residual: nivel,
      }));
  });

  // La hoja por activo lleva la misma criticidad completa: si una dijera «C4» y la otra
  // «C4 · Estándar», el mismo activo se leería distinto según la pestaña.
  const filasConCriticidad = filas.map((f) => ({
    ...f,
    criticidadNombre: f.criticidad === null ? null : (nombreCriticidad.get(f.criticidad) ?? null),
  }));

  const { construirLibroAnalisis } = await import('@/lib/sgsi/analisis-libro');
  const wb = await construirLibroAnalisis(filasConCriticidad, riesgosMatriz, {
    enAnalisis: todas.length,
    totalVigentes: datos.activos.length,
    umbral: datos.umbral,
  });
  const buffer = await wb.xlsx.writeBuffer();

  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Analisis de riesgos ${fecha}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
