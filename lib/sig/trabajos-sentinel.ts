import 'server-only';

// lib/sig/trabajos-sentinel.ts
//
// El trabajo que sincroniza el espejo de Microsoft Sentinel. Vive aparte de `trabajos.ts`
// por el mismo criterio que `trabajos-scorm.ts`/`trabajos-notificaciones.ts`: el núcleo
// despacha, cada trabajo se lee solo.
//
// **D7 · este trabajo NO escribe bitácora.** 19 filas por hora de una copia de otro sistema
// ahogarían la traza; la única decisión del SGSI acá es promover, y esa la registra
// `app/sig/acciones/sentinel.ts`. El rastro de esta corrida es `EjecucionTrabajo`, que
// `correrTrabajo` (en `trabajos.ts`) ya escribe SIEMPRE, con éxito o con fallo.
//
// Sin jest a propósito: este archivo importa `@prisma/client` a través de `lib/db`, y un
// módulo que importa Prisma no carga en jest. Se verifica con `npx tsc --noEmit` y a mano
// contra el workspace real, con la corrida anotada en `EjecucionTrabajo` — mismo criterio
// que `sentinel-consulta.ts` en la fase 2.

import { prisma } from '@/lib/db';
import type { ResultadoTrabajo } from '@/lib/sig/trabajos';
import { consultarLogAnalytics } from '@/lib/sig/sentinel-consulta';
import { explicarFalloSentinel } from '@/lib/sig/sentinel-fallo';
import {
  KQL_INCIDENTES,
  aFilas,
  clasificarSincronizacion,
  normalizarIncidente,
  type IncidenteEspejo,
} from '@/lib/sig/sentinel';

/// Los campos que decide Sentinel, sin `numeroIncidente` (va en el `where`/`create`) ni
/// `id`/`sincronizadoEn` (metadatos del espejo, no del incidente).
function datosDeSentinel(i: IncidenteEspejo) {
  return {
    titulo: i.titulo,
    descripcion: i.descripcion,
    severidadSentinel: i.severidadSentinel,
    estadoSentinel: i.estadoSentinel,
    clasificacion: i.clasificacion,
    comentarioClasificacion: i.comentarioClasificacion,
    creadoEnSentinel: i.creadoEnSentinel,
    primeraActividad: i.primeraActividad,
    ultimaActividad: i.ultimaActividad,
    cerradoEnSentinel: i.cerradoEnSentinel,
    url: i.url,
    proveedor: i.proveedor,
    propietarioCorreo: i.propietarioCorreo,
    etiquetas: i.etiquetas,
    alertas: i.alertas,
  };
}

/// Trae los incidentes de `SecurityIncident`, los upsertea por `IncidentNumber` (D1) y
/// refresca `sincronizadoEn` en TODA fila vista en esta corrida — también en las que no
/// cambiaron (D9): la pregunta que responde esa columna es «cuándo confirmó el espejo que
/// esto sigue así», y es verdad también cuando nada cambió.
///
/// `autor` está en la firma para cumplir el contrato de `IMPLEMENTACIONES` (mismo tipo que
/// cualquier otro trabajo), pero este trabajo no lo usa: D7 dice que no hay bitácora acá.
export async function sincronizarIncidentesSentinel(
  autor: string,
  hoy: Date,
): Promise<ResultadoTrabajo> {
  void autor;

  const respuesta = await consultarLogAnalytics(KQL_INCIDENTES);
  if (!respuesta.ok) {
    throw new Error(explicarFalloSentinel(respuesta.fallo));
  }

  const filas = aFilas(respuesta.datos);
  if (!filas.ok) {
    throw new Error(explicarFalloSentinel(filas.fallo));
  }

  // Cero filas NO es un fallo (D6/design): es una respuesta legítima de Sentinel.
  const entrantes = filas.datos.map(normalizarIncidente);
  if (entrantes.length === 0) {
    return { creados: 0, detalle: '0 incidentes; nada que sincronizar' };
  }

  const existentes: IncidenteEspejo[] = await prisma.incidenteSentinel.findMany();

  const { nuevos, actualizados, sinCambios } = clasificarSincronizacion(existentes, entrantes);

  for (const incidente of [...nuevos, ...actualizados]) {
    const datos = datosDeSentinel(incidente);
    await prisma.incidenteSentinel.upsert({
      where: { numeroIncidente: incidente.numeroIncidente },
      create: { numeroIncidente: incidente.numeroIncidente, ...datos, sincronizadoEn: hoy },
      update: { ...datos, sincronizadoEn: hoy },
    });
  }

  // Un solo `updateMany` sobre TODAS las claves vistas, nuevas, actualizadas y sin cambios:
  // quien escribe `sincronizadoEn` es este update, no los upserts de arriba (D9).
  const todasLasClaves = entrantes.map((i) => i.numeroIncidente);
  await prisma.incidenteSentinel.updateMany({
    where: { numeroIncidente: { in: todasLasClaves } },
    data: { sincronizadoEn: hoy },
  });

  return {
    creados: nuevos.length,
    detalle:
      `${entrantes.length} incidentes; ${nuevos.length} nuevos, ` +
      `${actualizados.length} actualizados, ${sinCambios.length} sin cambios`,
  };
}
