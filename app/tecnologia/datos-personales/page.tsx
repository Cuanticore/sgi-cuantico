// app/tecnologia/datos-personales/page.tsx
//
// Ley 1581 de 2012. **Es el bloque con más exposición legal del paquete**, y hasta ahora no
// existía en ninguna parte del sistema.
//
// **Por qué vive en el SISTEMA y no en el activo**: el activo del inventario ya tiene la
// bandera `datosPersonales`; lo que no tiene es la finalidad, la base de legitimación, el
// país de destino ni la retención — que es exactamente lo que un requerimiento de la
// Superintendencia pide. Y hay una razón más fuerte: **un mismo dato se trata distinto
// según qué sistema lo use.** La cédula en el portal del cliente y la cédula en nómina
// tienen finalidad, base y retención diferentes.

import { prisma } from '@/lib/db';
import DatosPersonalesClient from './DatosPersonales.client';

export const dynamic = 'force-dynamic';

/// Lo que hace que un registro esté completo. Son los campos que un requerimiento pide, no
/// una lista de deseos: sin finalidad y sin base de legitimación el registro no responde
/// nada, y sin retención no se puede saber cuándo hay que borrar.
function faltantesDelRegistro(t: {
  finalidad: string;
  baseLegitimacion: string;
  retencion: string | null;
  ubicacionAlmacenamiento: string | null;
  transferenciaInternacional: boolean;
  paisDestino: string | null;
  garantiaAplicada: string | null;
}): string[] {
  const f: string[] = [];
  if (t.finalidad.trim() === '') f.push('finalidad');
  if (t.baseLegitimacion.trim() === '') f.push('base de legitimación');
  if (t.retencion === null || t.retencion.trim() === '') f.push('retención');
  if (t.ubicacionAlmacenamiento === null || t.ubicacionAlmacenamiento.trim() === '') {
    f.push('ubicación de almacenamiento');
  }
  // Una transferencia internacional sin país ni garantía es el caso que la Ley 1581 mira
  // con más atención: declarar que los datos salen del país y no decir a dónde ni con qué
  // garantía es peor que no declararlo.
  if (t.transferenciaInternacional) {
    if (t.paisDestino === null || t.paisDestino.trim() === '') f.push('país de destino');
    if (t.garantiaAplicada === null || t.garantiaAplicada.trim() === '') f.push('garantía aplicada');
  }
  return f;
}

export default async function DatosPersonalesPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const { r } = await searchParams;

  const [tratamientos, sistemasSinRegistro, personas, sistemas] = await Promise.all([
    prisma.tratamientoDatosPersonales.findMany({
      include: {
        sistema: { select: { id: true, codigo: true, nombre: true, rolTratamiento: true } },
        responsable: { select: { nombre: true } },
      },
      orderBy: [{ sistemaId: 'asc' }, { categoria: 'asc' }],
    }),
    // El criterio 8: un sistema que declara tratar datos personales y no tiene registro
    // aparece incompleto. Se consulta aparte porque no tiene fila que mostrar — y sin este
    // conteo, el sistema que MÁS falta sería justo el invisible.
    prisma.sistema.findMany({
      where: { activo: true, trataDatosPersonales: true, tratamientos: { none: {} } },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { codigo: 'asc' },
    }),
    prisma.persona.findMany({ where: { activa: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.sistema.findMany({ where: { activo: true }, select: { id: true, codigo: true, nombre: true }, orderBy: { codigo: 'asc' } }),
  ]);

  const filas = tratamientos.map((t) => ({
    id: t.id,
    sistemaId: t.sistema.id,
    sistemaCodigo: t.sistema.codigo,
    sistemaNombre: t.sistema.nombre,
    categoria: t.categoria,
    sensibles: t.sensibles,
    finalidad: t.finalidad,
    baseLegitimacion: t.baseLegitimacion,
    titulares: t.titulares,
    volumen: t.volumen,
    rolTratamiento: t.sistema.rolTratamiento,
    ubicacionAlmacenamiento: t.ubicacionAlmacenamiento,
    transferenciaInternacional: t.transferenciaInternacional,
    paisDestino: t.paisDestino,
    garantiaAplicada: t.garantiaAplicada,
    retencion: t.retencion,
    responsable: t.responsable?.nombre ?? null,
    faltantes: faltantesDelRegistro(t),
  }));

  const elegido = filas.find((x) => String(x.id) === r) ?? filas[0] ?? null;

  return (
    <DatosPersonalesClient
      filas={filas}
      elegidoId={elegido?.id ?? null}
      sinRegistro={sistemasSinRegistro.map((s) => ({ codigo: s.codigo, nombre: s.nombre }))}
      sistemas={sistemas.map((s) => ({ id: s.id, etiqueta: `${s.codigo} · ${s.nombre}` }))}
      personas={personas}
    />
  );
}
