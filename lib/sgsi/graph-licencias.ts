import 'server-only';

// lib/sgsi/graph-licencias.ts
//
// **Las dos consultas de licencias de REQ-SIG-15 §3.2**, y nada más: qué se pregunta, a qué
// URL y con qué permiso. Qué se muestra con la respuesta lo decide `licencias.ts`, que es puro.
//
// **No hace falta pedirle nada a Azure.** El consentimiento vigente —el mismo que ya lee
// `/users` para el censo— alcanza para las dos, y se comprobó contra el tenant el 2026-09-08
// (D-2). Por eso este módulo no introduce ninguna variable de entorno ni ninguna bandera: la
// pestaña no espera a que alguien conceda nada.
//
// **P5 · `licenseDetails` y NUNCA `assignedLicenses`.** Ver la nota extensa en `licencias.ts`.
//
// **P8 · las dos llamadas son independientes y se tratan como tales.** `leerLicencias` las
// dispara en paralelo y devuelve **los dos resultados sin mezclarlos**. No existe en este
// módulo ninguna forma de escribir «si una falló, no hay nada»: el tipo de retorno tiene dos
// `ResultadoGraph` y quien llama tiene que resolver cada uno por separado.

import { consultarGraph } from '@/lib/sgsi/graph-consulta';
import type { ResultadoGraph } from '@/lib/sgsi/graph-fallo';
import type { LicenciaDeGraph, SkuDeGraph } from '@/lib/sgsi/licencias';

/// Los permisos de aplicación que exige cada llamada, nombrados acá porque son lo que el
/// mensaje de un 403 cita textualmente y lo que alguien iría a mirar en Azure.
///
/// Los dos están cubiertos por la lectura de directorio que la registración ya tiene
/// concedida (§7 del requerimiento). Se nombran igual —y con las dos alternativas que
/// Microsoft documenta para cada recurso— porque el día que alguien recorte permisos y esta
/// pestaña se caiga, el 403 tiene que decir qué falta sin que haya que redescubrirlo.
const PERMISO_LICENCIAS_DE_USUARIO = 'User.Read.All o Directory.Read.All';
const PERMISO_SKUS_DEL_TENANT = 'Organization.Read.All o Directory.Read.All';

/// **Lo que esta persona tiene.** Una entrada por licencia, con `skuPartNumber` y el detalle
/// de `servicePlans`: qué servicios de esa licencia están habilitados y cuáles no.
export async function licenciasDePersona(oid: string): Promise<ResultadoGraph<LicenciaDeGraph[]>> {
  const r = await consultarGraph<{ value?: LicenciaDeGraph[] }>(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oid)}/licenseDetails`,
    `las licencias de la persona (/users/${oid}/licenseDetails)`,
    PERMISO_LICENCIAS_DE_USUARIO,
  );
  if (!r.ok) return r;
  // Una respuesta con `value` vacío es un resultado legítimo: **esta persona no tiene
  // licencias**. Se devuelve como lista vacía y no como fallo, que es justo la distinción que
  // P8 exige — al revés de `oidsDelGrupoSig`, donde un grupo sin miembros sí es imposible.
  return { ok: true, datos: r.datos.value ?? [] };
}

/// **Lo que el tenant tiene.** `skuPartNumber`, `prepaidUnits.enabled` y `consumedUnits`, que
/// es de donde sale «12 de 25 en uso · 13 libres».
export async function skusDelTenant(): Promise<ResultadoGraph<SkuDeGraph[]>> {
  const r = await consultarGraph<{ value?: SkuDeGraph[] }>(
    'https://graph.microsoft.com/v1.0/subscribedSkus',
    'el inventario de licencias del tenant (/subscribedSkus)',
    PERMISO_SKUS_DEL_TENANT,
  );
  if (!r.ok) return r;
  return { ok: true, datos: r.datos.value ?? [] };
}

/// Las dos, en paralelo y **sin colapsarlas**.
///
/// `Promise.all` y no un `await` detrás del otro: son dos llamadas que no dependen una de la
/// otra, y encadenarlas duplicaría la espera del popup por nada. Y `all` es seguro acá
/// precisamente porque ninguna de las dos rechaza: las dos devuelven `ResultadoGraph`, así que
/// un 403 en una no aborta la otra.
export async function leerLicencias(oid: string): Promise<{
  persona: ResultadoGraph<LicenciaDeGraph[]>;
  tenant: ResultadoGraph<SkuDeGraph[]>;
}> {
  const [persona, tenant] = await Promise.all([licenciasDePersona(oid), skusDelTenant()]);
  return { persona, tenant };
}
