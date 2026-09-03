// app/sig/colaboradores/[id]/page.tsx
//
// La ficha del colaborador, y las dos pantallas de ciclo dentro de ella.
//
// El lienzo la organiza en secciones: identidad y vinculación, accesos vigentes, activos a
// cargo, compromisos firmados, formación y últimos registros. Las tres pantallas de la spec
// —Ficha, Vinculación y Desvinculación— viven acá y no en tres rutas: son la misma persona
// vista desde tres momentos, y separarlas obligaría a repetir la identidad tres veces y a
// que alguien recordara cuál abrir.
//
// La desvinculación se muestra **siempre**, no sólo al retirar: C5 dice que el mismo
// trámite aplica al cambio de cargo que deja accesos sin sustento, y esconderla hasta el
// retiro haría invisible el caso más común.

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { accesosALaFecha, accesosSinSustento, type AccesoConVigencia } from '@/lib/sig/accesos';
import { estaActiva } from '@/lib/sig/colaboradores';
import { progresoDelCiclo, type Paso } from '@/lib/sig/ciclos';
import { puertaDeAccesos } from '@/lib/sig/colaboradores';
import FichaClient from './Ficha.client';

export const dynamic = 'force-dynamic';

export default async function FichaColaboradorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personaId = Number(id);
  if (!Number.isInteger(personaId) || personaId <= 0) notFound();

  const [persona, pasos, exigidos] = await Promise.all([
    prisma.persona.findUnique({
      where: { id: personaId },
      include: {
        area: { select: { nombre: true } },
        cargo: { select: { nombre: true } },
        tipoContrato: { select: { nombre: true, esNomina: true } },
        accesos: {
          include: { perfil: { select: { nombre: true, sistema: true } }, solicitud: { select: { codigo: true } } },
          orderBy: { desde: 'desc' },
        },
        actasAceptacion: {
          include: { contenido: { select: { codigo: true, titulo: true } } },
          orderBy: { aceptadoEn: 'desc' },
        },
        actasBorrado: {
          include: { metodo: { select: { nombre: true } }, activos: { include: { activo: { select: { codigo: true, nombre: true } } } } },
          orderBy: { fecha: 'desc' },
        },
        pasosCompletados: { select: { pasoId: true, completadoEn: true } },
        asignaciones: {
          take: 8,
          orderBy: { fechaLimite: 'desc' },
          include: {
            contenido: { select: { codigo: true, titulo: true, tipo: true } },
            obligacion: { include: { contenido: { select: { codigo: true, titulo: true, tipo: true } } } },
            registros: { select: { id: true, fechaHora: true } },
          },
        },
      },
    }),
    prisma.pasoCiclo.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    // Los contenidos que exigen firma son los compromisos que C3 cuenta.
    prisma.contenidoSig.findMany({
      where: { exigeFirma: true, activo: true },
      select: { codigo: true, titulo: true },
      orderBy: { codigo: 'asc' },
    }),
  ]);
  if (!persona) notFound();

  const hoy = new Date();
  const activa = estaActiva({
    id: persona.id,
    activa: persona.activa,
    retiradoEn: persona.retiradoEn,
    origen: persona.origen,
  });

  const accesosBase: AccesoConVigencia[] = persona.accesos.map((a) => ({
    id: a.id,
    personaId: a.personaId,
    perfilId: a.perfilId,
    desde: a.desde,
    hasta: a.hasta,
    solicitudId: a.solicitudId,
  }));
  const vigentesIds = new Set(accesosALaFecha(accesosBase, hoy).map((a) => a.id));
  const sinSustentoIds = new Set(accesosSinSustento(accesosBase, hoy).map((a) => a.id));

  const completados = new Set(persona.pasosCompletados.map((x) => x.pasoId));
  const esNomina = persona.tipoContrato?.esNomina ?? false;
  const pasosTipados: Paso[] = pasos.map((x) => ({
    id: x.id,
    ciclo: x.ciclo,
    grupo: x.grupo,
    aplicaA: x.aplicaA,
    codigo: x.codigo,
    texto: x.texto,
    fuente: x.fuente,
    orden: x.orden,
  }));

  const firmados = new Set(persona.actasAceptacion.map((a) => a.contenido.codigo));
  const suscritos = exigidos.filter((c) => firmados.has(c.codigo)).length;

  return (
    <FichaClient
      persona={{
        id: persona.id,
        nombre: persona.nombre,
        correo: persona.correo,
        documentoIdentidad: persona.documentoIdentidad,
        area: persona.area?.nombre ?? null,
        cargo: persona.cargo?.nombre ?? null,
        tipoContrato: persona.tipoContrato?.nombre ?? null,
        esNomina,
        tipoColaborador: persona.tipoColaborador,
        origen: persona.origen,
        activa,
        fechaIngreso: persona.fechaIngreso?.toISOString().slice(0, 10) ?? null,
        fechaTerminacion: persona.fechaTerminacion?.toISOString().slice(0, 10) ?? null,
        retiradoEn: persona.retiradoEn?.toISOString().slice(0, 10) ?? null,
        telefono: persona.telefono,
        correoPersonal: persona.correoPersonal,
        ciudad: persona.ciudad,
        verificacionAntecedentesEn:
          persona.verificacionAntecedentesEn?.toISOString().slice(0, 10) ?? null,
      }}
      accesos={persona.accesos.map((a) => ({
        id: a.id,
        perfil: a.perfil.nombre,
        sistema: a.perfil.sistema,
        desde: a.desde.toISOString().slice(0, 10),
        hasta: a.hasta?.toISOString().slice(0, 10) ?? null,
        vigente: vigentesIds.has(a.id),
        // O13 · un acceso vigente sin solicitud que lo respalde es un hallazgo.
        sinSustento: sinSustentoIds.has(a.id),
        solicitud: a.solicitud?.codigo ?? null,
      }))}
      compromisos={{
        // C3 · la puerta. `null` sólo si no hubiera con qué contar; acá siempre hay.
        puerta: puertaDeAccesos(suscritos, exigidos.length),
        exigidos: exigidos.map((c) => ({
          codigo: c.codigo,
          titulo: c.titulo,
          firmado: firmados.has(c.codigo),
        })),
      }}
      actas={persona.actasAceptacion.map((a) => ({
        codigo: a.codigo,
        contenido: `${a.contenido.codigo} · ${a.contenido.titulo}`,
        version: a.contenidoVersion,
        aceptadoEn: a.aceptadoEn.toISOString().slice(0, 16).replace('T', ' '),
        // La huella recortada: es lo que permite citar el acta sin pegar 64 caracteres.
        huella: a.actaHash.slice(0, 12),
      }))}
      vinculacion={progresoDelCiclo(pasosTipados, completados, 'VINCULACION', esNomina)}
      desvinculacion={progresoDelCiclo(pasosTipados, completados, 'DESVINCULACION', esNomina)}
      pasos={pasosTipados.map((p) => ({ ...p, hecho: completados.has(p.id) }))}
      actasBorrado={persona.actasBorrado.map((x) => ({
        fecha: x.fecha.toISOString().slice(0, 10),
        metodo: x.metodo.nombre,
        activos: x.activos.map((a) => a.activo.codigo ?? a.activo.nombre),
      }))}
      registros={persona.asignaciones.map((a) => {
        const c = a.contenido ?? a.obligacion?.contenido;
        return {
          id: a.id,
          codigo: c?.codigo ?? '—',
          titulo: c?.titulo ?? a.titulo ?? 'Puntual',
          tipo: c?.tipo ?? 'TAREA',
          periodo: a.periodo,
          fechaLimite: a.fechaLimite.toISOString().slice(0, 10),
          cerrada: a.registros.length > 0,
        };
      })}
    />
  );
}
