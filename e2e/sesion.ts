// e2e/sesion.ts
//
// La sesión del recorrido, acuñada en vez de iniciada.
//
// `/tecnologia/:path*` está detrás de `withAuth`, y la única puerta es Azure AD. Automatizar
// un inicio de sesión corporativo real desde un navegador sin cabeza no es viable ni deseable:
// arrastraría MFA, un segundo factor humano y las credenciales de una persona a un archivo.
//
// En cambio se firma un token de sesión con el mismo `NEXTAUTH_SECRET` de la aplicación y se
// pone como cookie. Es la forma estándar de probar detrás de una puerta de autenticación, y no
// debilita nada: sin el secreto —que sólo está en el `.env` de quien corre esto— la cookie no
// vale nada.
//
// **Los grupos son parte del contrato que se está probando.** `Líderes SIG` es lo que la
// puerta del layout exige (`tecnologia:ver`), y `SGI_ROL_DEV` fue retirado a propósito. Si
// mañana alguien cambia el nombre del grupo, este recorrido falla — y tiene que fallar.

import { encode } from 'next-auth/jwt';
import type { BrowserContext } from '@playwright/test';

export const GRUPO_QUE_ABRE_TECNOLOGIA = 'Líderes SIG';

export async function iniciarSesion(contexto: BrowserContext, baseURL: string): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET no está definida: sin ella no se puede firmar la sesión.');

  const token = await encode({
    secret,
    maxAge: 30 * 60,
    token: {
      name: 'Recorrido de verificación',
      // Una identidad propia y no la de una persona: el recorrido no debe quedar atado a
      // quién lo corrió, y esta pantalla no consulta la base por correo.
      email: 'recorrido@verificacion.local',
      sub: 'e2e-recorrido',
      grupos: [GRUPO_QUE_ABRE_TECNOLOGIA],
    },
  });

  await contexto.addCookies([
    {
      // Sin `__Secure-`: el recorrido va por http contra el servidor de desarrollo.
      name: 'next-auth.session-token',
      value: token,
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Recorridos que ESCRIBEN
//
// Todo lo de arriba sólo navega, y por eso puede correr contra la base que le den —hoy, el
// túnel a producción en lectura. Lo de abajo siembra filas y las borra: el espejo de Sentinel
// y la promoción no se pueden comprobar mirando.
//
// La regla del arnés —«ningún spec de este directorio puede escribir»— no se relaja: se hace
// cumplir por código. `exigirBaseDeDesarrollo()` corta la corrida si `DATABASE_URL` no apunta
// al Postgres local del `docker-compose.dev.yml`. Una promesa escrita en un comentario la
// rompe quien no lo leyó; una excepción no.
// ─────────────────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/// Puerto del Postgres de desarrollo (`docker-compose.dev.yml`). El 5432 y el 5436 ya estaban
/// tomados por otros proyectos de esta máquina; por eso es el 5437.
const PUERTO_DESARROLLO = '5437';

/// Corta si la base no es la de desarrollo. Se llama antes de cualquier escritura.
function exigirBaseDeDesarrollo(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL no está definida. Los recorridos que escriben necesitan la base local.');
  }
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    throw new Error('DATABASE_URL no es una URL válida.');
  }
  const esLocal = ['localhost', '127.0.0.1', '::1'].includes(destino.hostname);
  if (!esLocal || destino.port !== PUERTO_DESARROLLO) {
    throw new Error(
      `Este recorrido ESCRIBE y DATABASE_URL apunta a ${destino.hostname}:${destino.port || '(por omisión)'}. ` +
        `Sólo se permite el Postgres de desarrollo en localhost:${PUERTO_DESARROLLO} ` +
        '(docker-compose.dev.yml). Nunca contra producción, ni a través de un túnel.',
    );
  }
  return url;
}

let clienteCache: PrismaClient | null = null;

function cliente(): PrismaClient {
  if (clienteCache) return clienteCache;
  clienteCache = new PrismaClient({
    adapter: new PrismaPg({ connectionString: exigirBaseDeDesarrollo() }),
  });
  return clienteCache;
}

export async function cerrarCliente(): Promise<void> {
  if (clienteCache) {
    await clienteCache.$disconnect();
    clienteCache = null;
  }
}

/// Object id del grupo «Líderes SIG» en el Directorio.
///
/// El recorrido de arriba usa el NOMBRE del grupo y éste el OBJECT ID. Los dos resuelven al
/// mismo rol porque `ALIAS` en `lib/sgsi/permisos.ts` reconoce ambos. Acá se usa el object id
/// a propósito: es **el que Azure emite de verdad** en el claim `groups`, así que el camino
/// que se ejercita es el de producción.

export const GRUPO_LIDERES_SIG = '2e0f4290-e91c-4f45-a663-77ece2d2a50e';

export interface Identidad {
  correo: string;
  nombre: string;
  /// Vacío = Colaborador. Con `GRUPO_LIDERES_SIG` = rol de seguridad.
  grupos?: readonly string[];
}

/// Firma una sesión para una identidad concreta y la instala.
///
/// Se separa de `iniciarSesion` porque estas pruebas SÍ necesitan que la identidad exista en
/// `Persona`: las acciones del servidor resuelven al autor buscando por correo, y un token
/// válido de alguien que no está en la tabla no puede escribir. Es una regla del dominio que
/// hay que respetar, no esquivar.
export async function iniciarSesionComo(
  contexto: BrowserContext,
  identidad: Identidad,
  baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3004',
): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET no está definida: sin ella no se puede firmar la sesión.');

  const token = await encode({
    secret,
    maxAge: 30 * 60,
    token: {
      name: identidad.nombre,
      email: identidad.correo,
      sub: `e2e-${identidad.correo}`,
      grupos: [...(identidad.grupos ?? [])],
    },
  });

  await contexto.addCookies([
    {
      name: 'next-auth.session-token',
      value: token,
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

/// Deja la persona en la base, sin duplicar si la prueba corre dos veces.
export async function sembrarPersona(identidad: Identidad): Promise<{ id: number }

/// Atajo para el caso común: persona sembrada y sesión iniciada con rol de seguridad.
export async function entrarComoLiderSig(
  contexto: BrowserContext,
  correo = 'e2e.lider@cuantico.com',
): Promise<{ id: number }

/// El otro lado de la moneda: alguien autenticado SIN permisos de decisión.
export async function entrarComoColaborador(
  contexto: BrowserContext,
  correo = 'e2e.colaborador@cuantico.com',
): Promise<{ id: number }

/// Deja un incidente en la tabla espejo sin pasar por Azure.
///
/// La sincronización real se prueba aparte: lo que estas pruebas ejercitan es la VISTA y
/// la promoción, que empiezan cuando la fila ya está. Sembrar directo evita que una
/// credencial ausente o un workspace lento conviertan una prueba de interfaz en una
/// prueba de red.
export async function sembrarIncidenteSentinel(datos: {
  numeroIncidente: string;
  titulo: string;
  severidadSentinel?: string;
  estadoSentinel?: string;
}

/// Intenta crear un SEGUNDO evento desde el mismo incidente. Debe fallar.
///
/// Ataca por debajo de la interfaz a propósito: que el botón desaparezca es ergonomía, y un
/// segundo intento no tiene por qué llegar por un clic — puede venir de dos pestañas abiertas,
/// de una llamada repetida a la acción o de un reintento del servidor. Lo que comprueba es la
/// barrera que sí aguanta eso: el índice único `(origen_sistema, origen_id_externo)`.
export async function intentarSegundaPromocion(numeroIncidente: string): Promise<void> {
  const db = cliente();
  const persona = await db.persona.findFirstOrThrow({ select: { id: true } });
  await db.eventoSeguridad.create({
    data: {
      codigo: `EVT-DUP-${numeroIncidente}`,
      descripcion: 'Segundo intento de promoción del mismo incidente. No debe entrar.',
      fechaOcurrencia: new Date(),
      enCurso: false,
      reportadoPorId: persona.id,
      origenSistema: 'SENTINEL',
      origenIdExterno: numeroIncidente,
      origenUrl: 'https://portal.azure.com/#pruebas',
    },
  });
}

/// Intenta crear un SEGUNDO evento desde el mismo incidente. Debe fallar.
///
/// Ataca por debajo de la interfaz a propósito: que el botón desaparezca es ergonomía, y
/// un segundo intento no tiene por qué llegar por un clic — puede venir de dos pestañas
/// abiertas, de una llamada repetida a la acción o de un reintento del servidor. Lo que
/// esta función comprueba es la barrera que sí aguanta eso: el índice único
/// `(origen_sistema, origen_id_externo)` sobre `evento_seguridad`.
///
/// Se resuelve rechazando; el llamador afirma con `rejects.toThrow()`.
export async function intentarSegundaPromocion(numeroIncidente: string): Promise<void> {
  const db = cliente();
  const persona = await db.persona.findFirstOrThrow({ select: { id: true } });
  await db.eventoSeguridad.create({
    data: {
      codigo: `EVT-DUP-${numeroIncidente}`,
      descripcion: 'Segundo intento de promoción del mismo incidente. No debe entrar.',
      fechaOcurrencia: new Date(),
      enCurso: false,
      reportadoPorId: persona.id,
      origenSistema: 'SENTINEL',
      origenIdExterno: numeroIncidente,
      origenUrl: 'https://portal.azure.com/#pruebas',
    },
  });
}

/// Borra el rastro de un incidente sembrado y el evento que se haya promovido desde él,
/// para que la suite pueda repetirse sin intervención manual.
export async function limpiarIncidenteSentinel(numeroIncidente: string): Promise<void> {
  const db = cliente();
  await db.eventoSeguridad.deleteMany({
    where: { origenSistema: 'SENTINEL', origenIdExterno: numeroIncidente },
  });
  await db.incidenteSentinel.deleteMany({ where: { numeroIncidente } });
}

export async function cerrarCliente(): Promise<void> {
  if (clienteCache) {
    await clienteCache.$disconnect();
    clienteCache = null;
  }
}
