import 'server-only';

// app/components/sgsi/valoracion/valoracion.query.ts
//
// La lectura detrás de la pantalla de Valoración de activos (REQ-SIG-18).
//
// **Lee y nada más.** La pantalla no valora, no reasigna y no registra la visita: no escribe
// una fila en `Bitacora` por entrar, y el criterio 15 del §10 lo comprueba contando `activo`,
// `activo_valor` y `parametro` antes y después. Si algún día hay que escribir algo desde acá,
// va por una server action con su bitácora, no por este archivo.
//
// **Ninguna tabla ni columna nueva.** El valor del activo es `max` de sus dimensiones y sigue
// siendo derivado (`lib/sgsi/formulas.ts`); el umbral se lee de `Parametro.umbral_valoracion`;
// las dimensiones salen de `Dimension` filtrando por `activa`. Lo que viaja es materia prima
// —una fila por (activo, dimensión)— y la agregación entera vive en
// `lib/sgsi/valoracion-agregada.ts`, que es puro y está probado.
//
// **`Activo.personaId` está en 0 de 299 hoy, y eso es correcto.** No se carga desde ningún
// libro: se escribe de a un activo por vez desde el popup de REQ-SIG-16, y el consolidado no
// trae a quién pertenece cada equipo. La Tabla B arranca vacía y su línea de encuadre es la que
// lo explica (§6.6). La causa NO es que falten personas —hay 90 en `persona`—: es que ese popup
// todavía no se usó.

import { prisma } from '@/lib/db';
import type {
  ActivoAgregable,
  DimensionActiva,
  NivelEscala,
} from '@/lib/sgsi/valoracion-agregada';

export interface DatosValoracion {
  /// Los activos VIGENTES. Los de baja quedan fuera de todo: la pantalla resume el inventario
  /// vigente (§9).
  activos: ActivoAgregable[];
  /// Las dimensiones activas, en el orden del catálogo. Hoy son tres; `Dimension` admite cinco
  /// y el día que entre `A` aparece una quinta pila sin tocar código.
  dimensiones: DimensionActiva[];
  /// La escala tal como llega de `escala_valor`, ordenada por `orden` —o sea el 5 primero—.
  /// Darla vuelta es decisión de la figura, no de la consulta.
  escala: NivelEscala[];
  /// `Parametro.umbral_valoracion`. Cambiarlo a 3 mueve las cuatro marcas y todos los totales
  /// sin recompilar, que es el criterio 5 del §10.
  umbral: number;
  /// Los que están entregados a una persona. Es el número de la izquierda de la línea de
  /// encuadre de la Tabla B, y sale de la misma pasada que los activos.
  conPersona: number;
}

export async function leerValoracion(): Promise<DatosValoracion> {
  const [activos, dimensiones, escala, parametro] = await Promise.all([
    prisma.activo.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      select: {
        codigo: true,
        propietario: { select: { nombre: true } },
        // El custodio PERSONA, que no es el custodio cargo. El esquema los separa a propósito
        // (nota E9): el cargo dice quién responde por el activo y sobrevive a la rotación, la
        // persona dice quién lo tiene en la mano. La pantalla no los mezcla.
        persona: { select: { nombre: true, correo: true, activa: true } },
        valores: {
          select: { dimension: { select: { codigo: true } }, valor: { select: { valor: true } } },
        },
      },
    }),
    prisma.dimension.findMany({
      where: { activa: true },
      orderBy: { orden: 'asc' },
      select: { codigo: true, nombre: true },
    }),
    prisma.escalaValor.findMany({ orderBy: { orden: 'asc' }, select: { valor: true, etiqueta: true } }),
    prisma.parametro.findUnique({ where: { clave: 'umbral_valoracion' } }),
  ]);

  const codigosActivos = dimensiones.map((d) => d.codigo);

  const vista: ActivoAgregable[] = activos.map((a) => {
    const porDimension = new Map(a.valores.map((v) => [v.dimension.codigo, v.valor.valor]));
    return {
      codigo: a.codigo ?? '(sin código)',
      propietario: a.propietario?.nombre ?? null,
      persona: a.persona ?? null,
      // Sin fila en `ActivoValor` es `null`, no 0: no valorado y valorado en 0 son cosas
      // distintas, y confundirlas infla el nivel más bajo con activos que nadie miró (§9).
      // Solo viajan las dimensiones activas: una desactivada con valor guardado no es un
      // criterio de la pantalla.
      valores: Object.fromEntries(codigosActivos.map((c) => [c, porDimension.get(c) ?? null])),
    };
  });

  return {
    activos: vista,
    dimensiones,
    escala,
    // El mismo default que `lib/sgsi/riesgos.ts` y que el inventario: un activo entra al
    // análisis a partir de 4.
    umbral: Number(parametro?.valor ?? 4),
    conPersona: vista.filter((a) => a.persona !== null).length,
  };
}
