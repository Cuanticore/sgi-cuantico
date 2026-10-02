import 'server-only';

// lib/api/token-servicio.ts
//
// **D3 · `TokenServicio` es `EnlaceFirma` con alcance.**
//
// El repo ya resolvió el problema del secreto portador cuando construyó la firma remota
// (`lib/sig/enlace-firma.ts`), y lo resolvió bien. No se diseña de nuevo: se copia lo que ya
// está probado y se le agrega lo que un token de servicio necesita de más.
//
// Lo que se copia tal cual:
//
//   - Generación con `randomBytes(32)` de `node:crypto`. Nunca UUID: un v4 trae 122 bits y un
//     formato que invita a tratarlo como identificador público.
//   - En reposo sólo el hash (SHA-256, `@unique`). El secreto no toca la base.
//   - Validación por BÚSQUEDA del hash, nunca comparación de secretos: elimina el ataque de
//     temporización por construcción, no por cuidado de quien escriba el comparador.
//   - Caducidad obligatoria (D4), igual que `ExcepcionSeguridad.fechaCierre`: un token sin
//     vencimiento es un acceso permanente que nadie va a revisar nunca.
//   - Respuesta idéntica ante los cuatro fallos de autenticación — inexistente, expirado,
//     revocado, bloqueado —, para no convertir la ruta en un oráculo.
//   - La bitácora registra el uso, nunca el token (regla heredada de
//     `lib/sig/firma-por-enlace.ts:51-62`). Este módulo no la escribe: la escribe quien llama,
//     con `lib/sig/autor.ts#etiquetaDeBitacora`.
//
// Lo que se agrega:
//
//   - **Prefijo visible.** El secreto se entrega como `sgi_live_<43 caracteres>`; lo que se
//     persiste en claro es sólo `PREFIJO_LITERAL` más los primeros ocho caracteres de la parte
//     aleatoria — ni uno más. Sirve para nombrarlo en una pantalla o en un registro de
//     servidor sin poder reconstruirlo: con ocho de cuarenta y tres caracteres conocidos
//     quedan 35 por adivinar, que es tan inviable como adivinar el secreto entero.
//   - **Alcance con el vocabulario que ya existe** (`Permiso` de `lib/sgsi/permisos.ts`). No se
//     abre un segundo sistema de autorización.
//   - **`ultimoUsoEn`**, para poder encontrar lo que duerme.
//   - **El secreto se muestra una sola vez**, al emitirlo. `TokenEmitido.secreto` es el único
//     lugar de todo este módulo donde aparece — ni `validar`, ni `listar`, ni ninguna consulta
//     de depuración lo recuperan después, porque no hay de dónde: la base nunca lo tuvo.

import { randomBytes } from 'node:crypto';

import { prisma } from '@/lib/db';
import { huella } from '@/lib/sig/firma';
import type { Permiso } from '@/lib/sgsi/permisos';

// ── Lo puro: generación, hash, prefijo, plazo ──────────────────────────────────────────────

/// 32 bytes de `node:crypto`, igual que `BYTES_DEL_TOKEN` en `lib/sig/enlace-firma.ts`.
export const BYTES_DEL_SECRETO = 32;

/// El secreto se entrega como `sgi_live_<43 caracteres base64url>`. El literal deja legible,
/// en un log o en un encabezado `Authorization`, que lo que se filtró es un token de ESTE
/// sistema y no una credencial de otro.
export const PREFIJO_LITERAL = 'sgi_live_';

/// Cuántos caracteres de la parte ALEATORIA quedan en claro en `prefijo`. Ni uno del literal
/// —ya es público por construcción— ni uno más de la parte que sí importa proteger.
export const LARGO_PREFIJO_ALEATORIO = 8;

export const DIAS_DE_VALIDEZ_POR_DEFECTO = 90;

/// La variable que ajusta el plazo sin desplegar, igual que `FIRMA_ENLACE_DIAS`.
export const VARIABLE_DE_DIAS = 'TOKEN_SERVICIO_DIAS';

/// **El secreto del token.** `sgi_live_` más 32 bytes de `node:crypto` en base64url (43
/// caracteres). No es un UUID por la misma razón que el token del enlace de firma no lo es:
/// un v4 tiene 122 bits y un formato que invita a tratarlo como identificador.
export function generarSecreto(): string {
  return PREFIJO_LITERAL + randomBytes(BYTES_DEL_SECRETO).toString('base64url');
}

/// SHA-256 en hexadecimal, con la misma función que calcula la huella del acta y del enlace de
/// firma: un solo algoritmo de hash en el proyecto, para que no haya dos respuestas a «¿con qué
/// se calculó esto?».
export function hashDeSecreto(secreto: string): string {
  return huella(secreto);
}

/// Lo que se persiste en claro: el literal más ocho caracteres de la parte aleatoria. Ni el
/// secreto completo, ni el hash, permiten reconstruir esto a la inversa — y esto tampoco
/// permite reconstruir el secreto: quedan 35 caracteres de 43 sin revelar.
export function prefijoVisible(secreto: string): string {
  return secreto.slice(0, PREFIJO_LITERAL.length + LARGO_PREFIJO_ALEATORIO);
}

/// **D4 · la caducidad es obligatoria.** Cualquier cosa que no sea un entero positivo cae en
/// el valor por defecto: un `TOKEN_SERVICIO_DIAS` mal escrito no puede producir un token que
/// nace vencido ni uno que no vence nunca.
export function diasDeValidez(entorno: Record<string, string | undefined>): number {
  const crudo = entorno[VARIABLE_DE_DIAS]?.trim();
  if (crudo === undefined || crudo === '') return DIAS_DE_VALIDEZ_POR_DEFECTO;
  const dias = Number(crudo);
  if (!Number.isInteger(dias) || dias <= 0) return DIAS_DE_VALIDEZ_POR_DEFECTO;
  return dias;
}

/// Se calcula una vez, al emitir, y se guarda: la expiración es un dato del token y no una
/// cuenta que se rehace en cada consulta.
export function venceEn(emitidoEn: Date, dias: number): Date {
  return new Date(emitidoEn.getTime() + dias * 24 * 60 * 60 * 1000);
}

// ── Lo que toca Prisma ─────────────────────────────────────────────────────────────────────

export interface DatosDeEmision {
  nombre: string;
  alcance: Permiso[];
  /// Quién emitió, para la bitácora de la pantalla de administración. Es una persona: emitir
  /// un token es una acción de gestión, no algo que un token pueda hacer por otro.
  creadoPor: string;
}

export interface TokenEmitido {
  id: number;
  nombre: string;
  /// **Sólo acá.** Ninguna otra función de este módulo lo devuelve, porque la base nunca lo
  /// tuvo: se hashea antes de la primera escritura.
  secreto: string;
  prefijo: string;
  alcance: Permiso[];
  expiraEn: Date;
}

/// Emite un token nuevo. Rechaza un nombre vacío porque `prefijo` y la etiqueta de bitácora
/// (`api:<nombre>`) salen de él, y un nombre en blanco produciría `api:` sin nada después.
export async function emitir(
  datos: DatosDeEmision,
  entorno: Record<string, string | undefined> = process.env,
): Promise<TokenEmitido> {
  const nombre = datos.nombre.trim();
  if (nombre === '') {
    throw new Error('Falta el nombre del token: es lo que identifica al agente en la bitácora.');
  }

  const secreto = generarSecreto();
  const tokenHash = hashDeSecreto(secreto);
  const prefijo = prefijoVisible(secreto);
  const expiraEn = venceEn(new Date(), diasDeValidez(entorno));

  const creado = await prisma.tokenServicio.create({
    data: {
      nombre,
      tokenHash,
      prefijo,
      alcance: datos.alcance,
      expiraEn,
      creadoPor: datos.creadoPor,
    },
  });

  return { id: creado.id, nombre, secreto, prefijo, alcance: datos.alcance, expiraEn };
}

export type ResultadoValidacion =
  | { ok: true; token: { id: number; nombre: string; alcance: Permiso[] } }
  | { ok: false };

/// **La única forma en que un fallo de autenticación se representa.** Una sola constante y no
/// `{ ok: false, motivo: ... }` en cada rama: así las cuatro causas —inexistente, expirado,
/// revocado, bloqueado— no sólo producen el mismo VALOR, producen literalmente el mismo
/// objeto. No hay ningún campo de más que una corrección de estilo futura pueda hacer
/// divergir entre dos ramas que hoy se ven iguales.
const INVALIDO: ResultadoValidacion = { ok: false };

/// **2.3 · busca por hash, nunca compara secretos.** El secreto en claro no existe en la base,
/// así que no hay nada que comparar y nada que proteger contra tiempos.
///
/// El orden de las comprobaciones no es observable desde afuera —las cuatro producen
/// `INVALIDO`—, así que no hay un P14 que demostrar acá: a diferencia del enlace de firma, no
/// hay un segundo factor cuyo intento haya que registrar antes de evaluar el bloqueo. Un
/// `Authorization` que no hashea a ninguna fila no identifica NINGUNA fila donde anotar un
/// intento; el intento sólo se puede atribuir cuando el hash SÍ encontró una fila, y en ese
/// caso lo que corresponde es decir que no sirve, no contar nada más.
export async function validar(secreto: string): Promise<ResultadoValidacion> {
  const fila = await prisma.tokenServicio.findUnique({
    where: { tokenHash: hashDeSecreto(secreto) },
  });
  if (fila === null) return INVALIDO;
  if (fila.revocadoEn !== null) return INVALIDO;
  if (fila.bloqueadoEn !== null) return INVALIDO;
  if (fila.expiraEn.getTime() <= Date.now()) return INVALIDO;

  await registrarUso(fila.id);

  return {
    ok: true,
    token: { id: fila.id, nombre: fila.nombre, alcance: fila.alcance as Permiso[] },
  };
}

/// Se llama en cada validación exitosa. Separada de `validar` para que `con-token.ts` y
/// cualquier prueba puedan verificar el registro sin repetir la lógica de vigencia.
export async function registrarUso(id: number): Promise<void> {
  await prisma.tokenServicio.update({ where: { id }, data: { ultimoUsoEn: new Date() } });
}

/// Revoca con motivo. Un motivo vacío se rechaza: «un token revocado dice por qué lo fue»
/// (D3), y un motivo en blanco no dice nada.
export async function revocar(id: number, motivo: string): Promise<void> {
  const limpio = motivo.trim();
  if (limpio === '') {
    throw new Error('Falta el motivo de revocación.');
  }
  await prisma.tokenServicio.update({
    where: { id },
    data: { revocadoEn: new Date(), motivoRevocacion: limpio },
  });
}

export interface TokenListado {
  id: number;
  nombre: string;
  /// Nunca el secreto: la fila nunca lo tuvo.
  prefijo: string;
  alcance: Permiso[];
  expiraEn: Date;
  creadoEn: Date;
  creadoPor: string;
  ultimoUsoEn: Date | null;
  revocadoEn: Date | null;
  motivoRevocacion: string | null;
}

/// Para la pantalla de administración. Devuelve todo salvo el hash y, por supuesto, el
/// secreto — que nunca estuvo.
export async function listar(): Promise<TokenListado[]> {
  const filas = await prisma.tokenServicio.findMany({ orderBy: { creadoEn: 'desc' } });
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    prefijo: f.prefijo,
    alcance: f.alcance as Permiso[],
    expiraEn: f.expiraEn,
    creadoEn: f.creadoEn,
    creadoPor: f.creadoPor,
    ultimoUsoEn: f.ultimoUsoEn,
    revocadoEn: f.revocadoEn,
    motivoRevocacion: f.motivoRevocacion,
  }));
}

/// Días desde el último uso (o desde la creación, si nunca se usó). Para marcar en pantalla un
/// token dormido sin adivinar: la ventana de noventa días es la misma que el vencimiento por
/// defecto, porque un token que ya duerme lo que dura su propio plazo no tiene excusa para no
/// revisarse.
export function diasDormido(fila: { ultimoUsoEn: Date | null; creadoEn: Date }, ahora: Date): number {
  const referencia = fila.ultimoUsoEn ?? fila.creadoEn;
  return Math.floor((ahora.getTime() - referencia.getTime()) / (24 * 60 * 60 * 1000));
}

export function estaDormido(fila: { ultimoUsoEn: Date | null; creadoEn: Date }, ahora: Date): boolean {
  return diasDormido(fila, ahora) >= DIAS_DE_VALIDEZ_POR_DEFECTO;
}
