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
import {
  estadoDeRevocacion,
  progresoDelCiclo,
  PASO_REVOCACION,
  type Paso,
} from '@/lib/sig/ciclos';
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

  const [persona, pasos, ultimaCapacitacion, exigidos] = await Promise.all([
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
          include: {
            contenido: { select: { codigo: true, titulo: true } },
            // REQ-SIG-13 · el estado de publicación en SharePoint, para poder decir el
            // enlace o el motivo por el que no está.
            pdf: {
              select: {
                publicacion: {
                  select: { estado: true, webUrl: true, detalleFallo: true, causaFallo: true },
                },
              },
            },
          },
          orderBy: { aceptadoEn: 'desc' },
        },
        actasBorrado: {
          include: { metodo: { select: { nombre: true } }, activos: { include: { activo: { select: { codigo: true, nombre: true } } } } },
          orderBy: { fecha: 'desc' },
        },
        // E9 · el custodio PERSONA (`Activo.personaId`), que no es lo mismo que el custodio
        // CARGO ni que el propietario: esos dos son `CargoResponsable`. Sólo los vigentes,
        // igual que en `/tecnologia/equipos`: un activo dado de baja no está a cargo de
        // nadie, y contarlo inflaría lo que hay que devolver al salir.
        activosACargo: {
          where: { activo: true },
          select: { id: true, codigo: true, nombre: true },
          orderBy: { codigo: 'asc' },
        },
        pasosCompletados: {
          select: {
            pasoId: true,
            completadoEn: true,
            nota: true,
            // Quién lo dio por cumplido. Es el primer dato que una auditoría pide, y sin él
            // la constancia no dice más que «alguien tocó una casilla».
            completadoPor: { select: { nombre: true } },
          },
        },
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
    // La última capacitación con registro, consultada APARTE.
    //
    // Las `asignaciones` de arriba están capadas en 8 para el bloque de últimos registros;
    // derivar la formación de ahí daría «sin capacitación» en cuanto la persona tuviera
    // ocho cosas más recientes, que es el caso normal. Un dato de competencia que se apaga
    // solo cuando hay actividad es peor que no mostrarlo.
    prisma.registroRealizado.findFirst({
      where: {
        asignacion: {
          personaId,
          OR: [
            { contenido: { tipo: 'CAPACITACION' } },
            { obligacion: { contenido: { tipo: 'CAPACITACION' } } },
          ],
        },
      },
      orderBy: { fechaHora: 'desc' },
      include: {
        asignacion: {
          include: {
            contenido: { select: { titulo: true, notaMinima: true } },
            obligacion: { include: { contenido: { select: { titulo: true, notaMinima: true } } } },
          },
        },
      },
    }),
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
  const cumplimientoDePaso = new Map(
    persona.pasosCompletados.map((x) => [
      x.pasoId,
      {
        fecha: x.completadoEn.toISOString().slice(0, 10),
        por: x.completadoPor?.nombre ?? null,
        nota: x.nota,
      },
    ]),
  );
  const esNomina = persona.tipoContrato?.esNomina ?? false;
  const pasosTipados: Paso[] = pasos.map((x) => ({
    id: x.id,
    ciclo: x.ciclo,
    grupo: x.grupo,
    aplicaA: x.aplicaA,
    codigo: x.codigo,
    texto: x.texto,
    descripcion: x.descripcion,
    plazo: x.plazo,
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
      formacion={(() => {
        const cap = ultimaCapacitacion;
        const contenidoCap = cap?.asignacion.contenido ?? cap?.asignacion.obligacion?.contenido;
        const minima = contenidoCap?.notaMinima ? Number(contenidoCap.notaMinima) : null;
        return [
          {
            etiqueta: 'Última capacitación',
            valor: cap ? cap.fechaHora.toISOString().slice(0, 10) : 'Sin registro',
            nota: contenidoCap?.titulo ?? 'Ninguna capacitación cerrada todavía',
            tono: cap ? ('ok' as const) : ('neutro' as const),
          },
          {
            etiqueta: 'Calificación',
            valor: cap?.calificacion !== null && cap?.calificacion !== undefined
              ? String(cap.calificacion)
              : '—',
            nota:
              cap?.aprobado === null || cap?.aprobado === undefined
                ? 'Sin evaluación registrada'
                : `${cap.aprobado ? 'Aprobado' : 'No aprobado'}${minima === null ? '' : ` · mínimo ${minima}`}`,
            tono:
              cap?.aprobado === true
                ? ('ok' as const)
                : cap?.aprobado === false
                  ? ('aviso' as const)
                  : ('neutro' as const),
          },
          {
            // El lienzo la dibuja como «No aplica». No es un hueco: es la frontera del
            // alcance dicha en voz alta, para que nadie la busque acá. El desempeño es
            // dato de nómina y no entra al SIG.
            etiqueta: 'Evaluación de desempeño',
            valor: 'No aplica',
            nota: 'Dato de nómina, fuera del alcance del SIG',
            tono: 'neutro' as const,
          },
          {
            // NO se deriva, y decirlo es la respuesta correcta. El único contenido que hoy
            // hace de inducción se identifica por su código en el seed, y escribir ese
            // código acá sería meter configuración de negocio en el código —lo mismo que
            // el proyecto prohíbe para los plazos—. Hace falta marcarla en el modelo.
            etiqueta: 'Inducción',
            valor: 'Sin identificar',
            nota: 'Ningún contenido está marcado como inducción en el modelo',
            tono: 'aviso' as const,
          },
        ];
      })()}
      activos={persona.activosACargo.map((a) => ({
        codigo: a.codigo ?? '—',
        nombre: a.nombre,
        // El lienzo pone «custodio» en cada fila, y hoy es el único rol que una PERSONA
        // puede tener sobre un activo: propietario y custodio de cargo son cargos, no
        // personas. Se escribe igual porque es justo la distinción que se confunde acá.
        rol: 'custodio',
      }))}
      actas={persona.actasAceptacion.map((a) => ({
        codigo: a.codigo,
        contenido: `${a.contenido.codigo} · ${a.contenido.titulo}`,
        version: a.contenidoVersion,
        aceptadoEn: a.aceptadoEn.toISOString().slice(0, 16).replace('T', ' '),
        // La huella recortada: es lo que permite citar el acta sin pegar 64 caracteres.
        huella: a.actaHash.slice(0, 12),
        // D-4/P12 · esta pantalla es de los responsables, que son quienes tienen acceso a la
        // carpeta. Acá el enlace a SharePoint sí sirve.
        sharepoint:
          a.pdf?.publicacion?.estado === 'PUBLICADO' ? (a.pdf.publicacion.webUrl ?? null) : null,
        // Nunca se afirma que algo está publicado sin el enlace que lo respalda. Si no está,
        // se dice por qué — la misma disciplina de `explicarFallo`.
        publicacion:
          a.pdf?.publicacion == null
            ? 'sin encolar'
            : a.pdf.publicacion.estado === 'PUBLICADO'
              ? 'publicado'
              : (a.pdf.publicacion.detalleFallo ?? 'pendiente de publicar'),
      }))}
      vinculacion={progresoDelCiclo(pasosTipados, completados, 'VINCULACION', esNomina)}
      desvinculacion={progresoDelCiclo(pasosTipados, completados, 'DESVINCULACION', esNomina)}
      // El aviso se calcula ACA y no en el cliente: depende de `hoy`, y un `new Date()` en el
      // navegador cambia el marcado entre el servidor y la hidratacion.
      avisoRevocacion={estadoDeRevocacion(
        persona.retiradoEn,
        pasosTipados.some((x) => x.codigo === PASO_REVOCACION && completados.has(x.id)),
        hoy,
      )}
      personaId={persona.id}
      pasos={pasosTipados.map((p) => ({
        ...p,
        hecho: completados.has(p.id),
        cumplimiento: cumplimientoDePaso.get(p.id) ?? null,
      }))}
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
