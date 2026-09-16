import 'server-only';

// app/sgsi/riesgo-residual/acta.query.ts
//
// La lectura detrás de la pantalla de aprobación del riesgo residual.
//
// **Arma, no decide.** El alcance, la huella, los firmantes y el estado salen de los módulos
// puros de `lib/sgsi/`, que se prueban con literales. Acá sólo se consulta y se traduce: si
// alguna regla empieza a vivir en este archivo, deja de estar probada.

import { prisma } from '@/lib/db';
import {
  huellaDeAlcance,
  resolverFirmantes,
  seleccionarAlcance,
  type ActivoParaAlcance,
  type FilaAlcance,
  type FirmanteProceso,
  type ProcesoParaFirma,
} from '@/lib/sgsi/alcance-residual';
import { estadoVigente, type EstadoActa } from '@/lib/sgsi/estado-acta-residual';

export interface RenglonFirmaVista {
  areaId: number;
  proceso: string;
  cargoNombre: string | null;
  resoluble: boolean;
  activos: number;
  aprobo: boolean;
  /// Quién firmó el papel. Nulo mientras no haya firmado.
  firmante: string | null;
  fechaFirma: string | null;
  soporteId: number | null;
  /// Quién asentó la firma acá, que casi nunca es quien firmó.
  registradoPor: string | null;
}

export interface ActaVista {
  id: number;
  codigo: string;
  estado: EstadoActa;
  generadaEn: string;
  generadaPor: string;
  sinCalcular: number;
  renglones: RenglonFirmaVista[];
  soportes: { id: number; nombre: string; tamano: number; sha256: string; cargadoEn: string }[];
}

export interface VistaRiesgoResidual {
  periodo: string;
  /// Lo que hay HOY, recalculado. Con un acta emitida puede diferir de lo que ella congeló, y
  /// esa diferencia es justamente lo que la marca como desactualizada.
  filas: FilaAlcance[];
  firmantes: FirmanteProceso[];
  sinCalcular: number;
  fueraDeBanda: number;
  huellaActual: string;
  acta: ActaVista | null;
}

export async function leerRiesgoResidual(periodo: string): Promise<VistaRiesgoResidual> {
  const [activos, umbrales, areas, actaFila, parametro] = await Promise.all([
    prisma.activo.findMany({
      where: { activo: true },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        areaId: true,
        area: { select: { nombre: true } },
        // Los riesgos VIGENTES. Uno obsoleto salió del alcance, y ponerlo acá haría firmar una
        // exposición que la organización ya no tiene.
        riesgos: { where: { obsoleto: false }, select: { riesgoResidual: true } },
      },
    }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.area.findMany({
      where: { activa: true },
      orderBy: { orden: 'asc' },
      select: {
        id: true,
        nombre: true,
        liderCargoId: true,
        liderCargo: { select: { id: true, nombre: true } },
      },
    }),
    prisma.actaRiesgoResidual.findFirst({
      where: { periodo },
      orderBy: { generadaEn: 'desc' },
      // `documento` NO se selecciona: es el blob del PDF y sólo lo toca la ruta de descarga.
      select: {
        id: true,
        codigo: true,
        estado: true,
        alcanceHash: true,
        sinCalcular: true,
        generadaEn: true,
        generadaPor: { select: { nombre: true } },
        firmantes: {
          orderBy: { activos: 'desc' },
          select: {
            areaId: true,
            proceso: true,
            cargoNombre: true,
            resoluble: true,
            activos: true,
            aprobo: true,
            fechaFirma: true,
            soporteId: true,
            firmante: { select: { nombre: true } },
            registradoPor: { select: { nombre: true } },
          },
        },
        soportes: {
          orderBy: { cargadoEn: 'asc' },
          select: { id: true, nombreOriginal: true, tamano: true, sha256: true, cargadoEn: true },
        },
      },
    }),
    prisma.parametro.findUnique({ where: { clave: 'vigencia_acta_residual_meses' } }),
  ]);

  const bandas = umbrales.map((u) => ({
    nombre: u.nombre,
    desde: Number(u.desde),
    hasta: Number(u.hasta),
  }));

  const paraAlcance: ActivoParaAlcance[] = activos.map((a) => ({
    id: a.id,
    // Un activo sin código está a medio crear; se identifica por id para no romper la lista,
    // y su ausencia se ve en el acta en vez de desaparecer en silencio.
    codigo: a.codigo ?? `sin-codigo-${a.id}`,
    nombre: a.nombre,
    areaId: a.areaId,
    proceso: a.area.nombre,
    residuales: a.riesgos.map((r) => r.riesgoResidual?.toString() ?? null),
  }));

  const alcance = seleccionarAlcance(paraAlcance, bandas);
  const huellaActual = huellaDeAlcance(alcance.filas);

  // Las personas del cargo líder de cada área, en una sola consulta. Preguntar por cada área
  // sería una consulta por proceso, y son diez.
  const cargosLideres = areas.map((a) => a.liderCargoId).filter((x): x is number => x !== null);
  const personas =
    cargosLideres.length === 0
      ? []
      : await prisma.persona.findMany({
          where: { activa: true, cargoId: { in: cargosLideres } },
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true, cargoId: true },
        });
  const porCargo = new Map<number, { id: number; nombre: string }[]>();
  for (const p of personas) {
    if (p.cargoId === null) continue;
    porCargo.set(p.cargoId, [...(porCargo.get(p.cargoId) ?? []), { id: p.id, nombre: p.nombre }]);
  }

  const procesos: ProcesoParaFirma[] = areas.map((a) => ({
    areaId: a.id,
    proceso: a.nombre,
    cargoId: a.liderCargoId,
    cargoNombre: a.liderCargo?.nombre ?? null,
    candidatos: a.liderCargoId === null ? [] : (porCargo.get(a.liderCargoId) ?? []),
  }));

  const firmantes = resolverFirmantes(procesos, alcance.filas);
  const vigenciaMeses = Number(parametro?.valor ?? 12);

  return {
    periodo,
    filas: alcance.filas,
    firmantes,
    sinCalcular: alcance.sinCalcular,
    fueraDeBanda: alcance.fueraDeBanda,
    huellaActual,
    acta:
      actaFila === null
        ? null
        : {
            id: actaFila.id,
            codigo: actaFila.codigo,
            estado: estadoVigente(
              {
                estado: actaFila.estado,
                alcanceHash: actaFila.alcanceHash,
                generadaEn: actaFila.generadaEn,
                // Sólo los RESOLUBLES cuentan como firmas exigibles. Un proceso sin cargo
                // líder no puede firmar nunca, y exigir su firma dejaría el acta eternamente
                // sin aprobar por una deuda del catálogo de cargos. Esa deuda se muestra en su
                // propia tarjeta, que es donde alguien puede hacer algo con ella.
                procesos: actaFila.firmantes.filter((f) => f.resoluble).length,
                procesosFirmados: actaFila.firmantes.filter((f) => f.aprobo).length,
              },
              huellaActual,
              new Date(),
              vigenciaMeses,
            ),
            generadaEn: actaFila.generadaEn.toISOString().slice(0, 10),
            generadaPor: actaFila.generadaPor.nombre,
            sinCalcular: actaFila.sinCalcular,
            renglones: actaFila.firmantes.map((f) => ({
              areaId: f.areaId,
              proceso: f.proceso,
              cargoNombre: f.cargoNombre,
              resoluble: f.resoluble,
              activos: f.activos,
              aprobo: f.aprobo,
              firmante: f.firmante?.nombre ?? null,
              fechaFirma: f.fechaFirma?.toISOString().slice(0, 10) ?? null,
              soporteId: f.soporteId,
              registradoPor: f.registradoPor?.nombre ?? null,
            })),
            soportes: actaFila.soportes.map((s) => ({
              id: s.id,
              nombre: s.nombreOriginal,
              tamano: s.tamano,
              sha256: s.sha256,
              cargadoEn: s.cargadoEn.toISOString().slice(0, 10),
            })),
          },
  };
}
