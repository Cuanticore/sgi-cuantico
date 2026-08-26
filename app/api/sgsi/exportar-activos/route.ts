// app/api/sgsi/exportar-activos/route.ts
//
// The inventory, as the FOR-SIG-12 form. Session, query, download — what the FILE looks
// like lives in `lib/sgsi/inventario-libro.ts`, which has no session and no Prisma so a
// test can build the workbook and read its dropdowns back.
//
// The route is NOT under /sgsi, so the layout's read gate never sees it: `sgsi:ver` is
// checked here explicitly, as plantilla-activos does. The export carries the whole
// catalogue in its Listas sheet, so a 403, not a 404, is the answer for someone with a
// good session and no permission.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { nivelDeRiesgoDelActivo, type UmbralRiesgo } from '@/lib/sgsi/riesgo-activo';

const SI_NO_POR_TERNARIO = { SI: 'Sí', NO: 'No', POR_DEFINIR: 'Por definir' } as const;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });

  if (!puede(rolDesdeGrupos(session.user?.grupos), 'sgsi:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  // The filtered set the screen is showing travels in the query as codes; when absent the
  // export covers everything active, which is the default "one click" behaviour.
  const url = new URL(request.url);
  const codigos = (url.searchParams.get('codigos') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const [activos, escala, umbrales, parametro, catalogos] = await Promise.all([
    prisma.activo.findMany({
      where: { activo: true, ...(codigos.length > 0 ? { codigo: { in: codigos } } : {}) },
      orderBy: { codigo: 'asc' },
      include: {
        area: { select: { nombre: true } },
        tipo: { select: { codigo: true, nombre: true } },
        subtipo: { select: { codigo: true, nombre: true } },
        propietario: { select: { nombre: true } },
        custodio: { select: { nombre: true } },
        proveedor: { select: { nombre: true } },
        ubicacion: { select: { nombre: true } },
        entorno: { select: { nombre: true } },
        superior: { select: { codigo: true } },
        valores: {
          select: { dimension: { select: { codigo: true } }, valor: { select: { valor: true } } },
        },
        riesgos: {
          where: { obsoleto: false },
          select: { riesgoPotencial: true, riesgoResidual: true },
        },
      },
    }),
    prisma.escalaValor.findMany({ orderBy: { orden: 'asc' } }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.parametro.findUnique({ where: { clave: 'umbral_valoracion' } }),
    Promise.all([
      prisma.tipoMagerit.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
      prisma.subtipoMagerit.findMany({ where: { activo: true }, orderBy: [{ tipoId: 'asc' }, { codigo: 'asc' }] }),
      prisma.area.findMany({ where: { activa: true }, orderBy: { orden: 'asc' } }),
      prisma.cargoResponsable.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
      prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      prisma.entorno.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      prisma.ubicacion.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    ]),
  ]);

  const [tipos, subtipos, areas, cargos, proveedores, entornos, ubicaciones] = catalogos;

  const etiquetaDe = (v: number) =>
    escala.find((e) => e.valor === v)?.etiqueta ?? String(v);
  const nivelDe = (v: number) =>
    escala.find((e) => e.valor === v)?.etiqueta.split('—')[1]?.trim() ?? String(v);

  const escalaPlana = escala.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta }));
  const bandas: UmbralRiesgo[] = umbrales.map((u) => ({
    nombre: u.nombre,
    desde: u.desde.toString(),
    hasta: u.hasta.toString(),
    orden: u.orden,
  }));
  const umbralValoracion = Number(parametro?.valor ?? 4);

  const filas = activos.map((a) => {
    const porDimension = new Map(a.valores.map((v) => [v.dimension.codigo, v.valor.valor]));
    const D = porDimension.get('D') ?? 0;
    const I = porDimension.get('I') ?? 0;
    const C = porDimension.get('C') ?? 0;
    const valor = Math.max(D, I, C);
    const conRiesgos = valor >= umbralValoracion;
    const inherente = nivelDeRiesgoDelActivo(
      a.riesgos.map((r) => r.riesgoPotencial?.toString() ?? null),
      bandas,
    );
    const residual = nivelDeRiesgoDelActivo(
      a.riesgos.map((r) => r.riesgoResidual?.toString() ?? null),
      bandas,
    );
    const texto = (n: { nivel: number; banda: string; figura: string } | null) =>
      n ? `${n.banda} (${n.figura})` : null;

    return {
      codigo: a.codigo ?? '',
      codigoHeredado: a.codigoHeredado,
      nombre: a.nombre,
      descripcion: a.descripcion ?? '',
      tipo: `${a.tipo.codigo} ${a.tipo.nombre}`,
      subtipo: `${a.subtipo.codigo} ${a.subtipo.nombre}`,
      proceso: a.area.nombre,
      custodio: a.custodio?.nombre ?? null,
      propietario: a.propietario?.nombre ?? null,
      ubicacion: a.ubicacion?.nombre ?? null,
      entorno: a.entorno?.nombre ?? null,
      datosCliente: SI_NO_POR_TERNARIO[a.datosCliente],
      datosPersonales: SI_NO_POR_TERNARIO[a.datosPersonales],
      expuestoInternet: SI_NO_POR_TERNARIO[a.expuestoInternet],
      proveedor: a.proveedor?.nombre ?? null,
      superior: a.superior?.codigo ?? null,
      valorD: etiquetaDe(D),
      valorI: etiquetaDe(I),
      valorC: etiquetaDe(C),
      valorActivo: valor,
      nivelActivo: nivelDe(valor),
      riesgoInherente: conRiesgos ? texto(inherente) : 'no requiere',
      riesgoResidual: conRiesgos ? texto(residual) ?? 'sin calcular' : 'no requiere',
    };
  });

  const { construirLibroInventario } = await import('@/lib/sgsi/inventario-libro');
  type FilaActivoExport = import('@/lib/sgsi/inventario-libro').FilaActivoExport;
  type CatalogosExportActivos = import('@/lib/sgsi/inventario-libro').CatalogosExportActivos;

  const exportFilas: FilaActivoExport[] = filas;
  const cat: CatalogosExportActivos = {
    tipos: tipos.map((t) => ({ id: t.id, codigo: t.codigo, nombre: t.nombre })),
    subtipos: subtipos.map((s) => ({ tipoId: s.tipoId, codigo: s.codigo, nombre: s.nombre })),
    procesos: areas.map((x) => x.nombre),
    responsables: cargos.map((c) => c.nombre),
    proveedores: proveedores.map((p) => p.nombre),
    entornos: entornos.map((e) => e.nombre),
    ubicaciones: ubicaciones.map((u) => u.nombre),
    escala: escalaPlana,
  };

  const wb = await construirLibroInventario(exportFilas, cat);
  const buffer = await wb.xlsx.writeBuffer();

  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="FOR-SIG-12 Inventario de activos de información ${fecha}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
