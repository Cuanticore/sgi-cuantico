// lib/sgsi/consolidado-ambiente.ts
//
// El «Detalle de ambiente» del Consolidado V19 → `Despliegue` (REQ-SIG-12 §4.2).
//
// Módulo puro: la acción abre el libro y escribe; qué significa cada fila se decide acá,
// donde una prueba lo ejercita sin base de datos y sin archivo.
//
// ─── E5 · un despliegue NO es un activo ────────────────────────────────────────────────
//
// Vale decirlo acá porque la hoja invita a lo contrario: trae 129 filas con nombre, URL,
// contenedor y estado, y se parecen mucho a un inventario. No lo son. Un despliegue es
// DÓNDE VIVE un componente de un activo, y por eso `generarRiesgos` no los mira (§5.8): un
// riesgo cuelga de la valoración de un activo, y estas filas no tienen valoración.
//
// ─── La clave de idempotencia, y lo que el libro le enseñó ─────────────────────────────
//
// Era `repoGithub + ambiente + servidor`. Sobre el libro real las 129 filas colapsaban a
// 107 —se perdían 22 en silencio— porque quince servicios de infraestructura comparten el
// repo «-», el ambiente «produccion» y el servidor «srv-cuantico-toolbox», y porque un
// mismo repositorio se despliega como API, worker y beat en el mismo lugar.
//
// El `componente` es lo único que los separa, y separarlos es exactamente lo que la clave
// tiene que hacer: son despliegues distintos, no la misma fila importada dos veces. Entró a
// la clave en `20260909100000_despliegue_componente_en_clave`.

import { esCodigoDeLibro } from './consolidado';

/// Las columnas de la hoja por su NÚMERO en Excel (1-based), el mismo que la persona ve.
///
/// Faltan a propósito la 2 y la 4 (nombres del padre y del servidor), la 5 y la 6 (su
/// Nivel 1/2) y la 24 y 25 (metadatos de cómo se armó el libro). Las cuatro primeras ya las
/// da la relación con `Activo`; las dos últimas describen el origen del dato, no el
/// despliegue. El §4.2 deja abierto volcarlas a `notas`, y no se hace: pisaría la columna
/// 23, que sí trae dato.
export const COLUMNAS_AMBIENTE = {
  activoPadre: 1,
  servidorPadre: 3,
  nombre: 7,
  componente: 8,
  repoGithub: 9,
  ambiente: 10,
  plataforma: 11,
  servidor: 12,
  ip: 13,
  url: 14,
  imagen: 15,
  tagRama: 16,
  contenedorServicio: 17,
  puerto: 18,
  baseDatos: 19,
  estado: 20,
  evidencia: 21,
  confianza: 22,
  notas: 23,
} as const;

/// La cabecera vive en la fila 1 y los datos arrancan en la 2.
export const FILA_ENCABEZADO_AMBIENTE = 1;

/// E6 · la clave de idempotencia, tal como quedó en el esquema. Exportada para que la
/// prueba compruebe la MISMA lista que usa el agrupador, y no una copia que se desincronice.
export const CLAVE_DESPLIEGUE = ['repoGithub', 'ambiente', 'servidor', 'componente'] as const;

export type Confianza = 'ALTA' | 'MEDIA' | 'BAJA';

export interface DespliegueLeido {
  fila: number;
  /// El código del activo padre, o nulo. La resolución a `activoId` la hace la acción,
  /// cuando ya existen todos los activos.
  activoCodigo: string | null;
  servidorCodigo: string | null;
  nombre: string;
  componente: string | null;
  repoGithub: string | null;
  ambiente: string;
  plataforma: string | null;
  servidor: string | null;
  ip: string | null;
  url: string | null;
  imagen: string | null;
  tagRama: string | null;
  contenedorServicio: string | null;
  puerto: string | null;
  baseDatos: string | null;
  estado: string;
  evidencia: string | null;
  confianza: Confianza;
  notas: string | null;
}

export interface AvisoAmbiente {
  fila: number;
  /// El nombre del despliegue: es lo que la persona reconoce en la hoja, porque estas filas
  /// no tienen código propio.
  nombre: string;
  mensaje: string;
}

export interface LecturaAmbiente {
  despliegues: DespliegueLeido[];
  /// Filas que no caben en el modelo.
  rechazadas: AvisoAmbiente[];
  /// Filas que se cargan, con lo que quedó pendiente.
  avisos: AvisoAmbiente[];
  /// Filas que repiten la clave de otra del mismo archivo.
  colisiones: AvisoAmbiente[];
}

const CONFIANZAS: Record<string, Confianza> = { alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' };

export function leerAmbiente(
  matriz: readonly (readonly string[])[],
  filaEncabezado: number = FILA_ENCABEZADO_AMBIENTE,
): LecturaAmbiente {
  const despliegues: DespliegueLeido[] = [];
  const rechazadas: AvisoAmbiente[] = [];
  const avisos: AvisoAmbiente[] = [];
  const colisiones: AvisoAmbiente[] = [];
  const clavesVistas = new Map<string, number>();

  for (let i = filaEncabezado; i < matriz.length; i++) {
    const celdas = matriz[i] ?? [];
    const numero = i + 1;
    const col = (c: number): string => (celdas[c - 1] ?? '').trim();
    const opt = (c: number): string | null => col(c) || null;

    // Una fila es vacía sólo si TODAS las columnas que nos importan lo están. Mirar sólo la
    // primera descartaría las 58 filas sin activo padre, que son justamente las que hay que
    // ir a mirar.
    const columnas = Object.values(COLUMNAS_AMBIENTE);
    if (columnas.every((c) => col(c) === '')) continue;

    const nombre = col(COLUMNAS_AMBIENTE.nombre);
    const anotar = (lista: AvisoAmbiente[], mensaje: string) =>
      lista.push({ fila: numero, nombre, mensaje });

    // ── Lo que el modelo no admite en blanco ─────────────────────────────────────────
    const ambiente = col(COLUMNAS_AMBIENTE.ambiente);
    const estado = col(COLUMNAS_AMBIENTE.estado);
    const faltan = [
      nombre === '' ? 'nombre' : null,
      ambiente === '' ? 'ambiente' : null,
      estado === '' ? 'estado' : null,
    ].filter((x): x is string => x !== null);
    if (faltan.length > 0) {
      anotar(rechazadas, `Falta ${faltan.join(', ')}: la columna es obligatoria en el modelo.`);
      continue;
    }

    // ── Los códigos de padre: se capturan, los resuelve la acción ────────────────────
    //
    // Escrito-pero-mal-formado no es lo mismo que ausente: alguien intentó asociarlo y le
    // erró, y decir qué había escrito es lo que lo hace arreglable.
    const codigoPadre = (c: number, etiqueta: string): string | null => {
      const v = col(c);
      if (v === '') return null;
      if (!esCodigoDeLibro(v)) {
        anotar(avisos, `El ${etiqueta} «${v}» no tiene la forma AAA-TTT-NNNN. Se carga sin asociar.`);
        return null;
      }
      return v;
    };
    const activoCodigo = codigoPadre(COLUMNAS_AMBIENTE.activoPadre, 'activo padre');
    const servidorCodigo = codigoPadre(COLUMNAS_AMBIENTE.servidorPadre, 'servidor padre');

    // H-41 · 58 filas del libro no traen activo padre. «Se cargan, se cuentan y se ven; no
    // se descartan en silencio»: un componente que nadie asoció es justo el que hay que ir
    // a mirar.
    if (col(COLUMNAS_AMBIENTE.activoPadre) === '') {
      anotar(avisos, 'Sin activo padre: queda PENDIENTE DE ASOCIAR.');
    }

    // ── La confianza ─────────────────────────────────────────────────────────────────
    //
    // Un dato inferido y uno confirmado no valen igual. Ante algo que no se entiende, MEDIA
    // —el defecto del esquema—: subirlo a ALTA sería afirmar que alguien lo verificó.
    const textoConfianza = col(COLUMNAS_AMBIENTE.confianza);
    let confianza: Confianza = 'MEDIA';
    if (textoConfianza !== '') {
      const reconocida = CONFIANZAS[textoConfianza.toLowerCase()];
      if (reconocida) confianza = reconocida;
      else anotar(avisos, `Confianza «${textoConfianza}» no reconocida. Se carga como MEDIA.`);
    }

    const leido: DespliegueLeido = {
      fila: numero,
      activoCodigo,
      servidorCodigo,
      nombre,
      componente: opt(COLUMNAS_AMBIENTE.componente),
      repoGithub: opt(COLUMNAS_AMBIENTE.repoGithub),
      ambiente,
      plataforma: opt(COLUMNAS_AMBIENTE.plataforma),
      servidor: opt(COLUMNAS_AMBIENTE.servidor),
      ip: opt(COLUMNAS_AMBIENTE.ip),
      url: opt(COLUMNAS_AMBIENTE.url),
      imagen: opt(COLUMNAS_AMBIENTE.imagen),
      tagRama: opt(COLUMNAS_AMBIENTE.tagRama),
      contenedorServicio: opt(COLUMNAS_AMBIENTE.contenedorServicio),
      puerto: opt(COLUMNAS_AMBIENTE.puerto),
      baseDatos: opt(COLUMNAS_AMBIENTE.baseDatos),
      estado,
      evidencia: opt(COLUMNAS_AMBIENTE.evidencia),
      confianza,
      notas: opt(COLUMNAS_AMBIENTE.notas),
    };

    // ── La clave, comprobada ACÁ y no en la base ─────────────────────────────────────
    //
    // Dos filas con la misma clave dentro de un archivo no son dos despliegues: la segunda
    // pisaría a la primera en el upsert y el conteo final mentiría. Detectarlo en la lectura
    // convierte lo que sería un error de base de datos en medio de la transacción en una
    // línea del parte que dice qué fila choca con cuál.
    //
    // El `\u0000` como separador y el nulo como cadena vacía imitan a `NULLS NOT DISTINCT`,
    // que es lo que hace el índice: dos nulos SÍ chocan.
    const clave = CLAVE_DESPLIEGUE.map((c) => leido[c] ?? '').join('\u0000');
    const previa = clavesVistas.get(clave);
    if (previa !== undefined) {
      anotar(
        colisiones,
        `Repite repo + ambiente + servidor + componente de la fila ${previa}: no se carga dos veces.`,
      );
      continue;
    }
    clavesVistas.set(clave, numero);

    despliegues.push(leido);
  }

  return { despliegues, rechazadas, avisos, colisiones };
}
