'use server';

// app/sig/acciones/plazos.ts
//
// **B7 · ningún plazo vive en el código.** Cambiar un plazo no debe requerir un despliegue,
// y por eso esta pantalla existe: hasta ahora los plazos por tipo de hallazgo sólo se podían
// cambiar tocando la base a mano.
//
// **Cambiar un plazo no es gratis, y por eso todo cambio va a la bitácora con el valor
// anterior.** Los plazos vigentes al abrir un hallazgo se congelan en él: bajar el de «NC
// mayor» de treinta a diez días no vuelve vencidos de golpe a los que ya estaban abiertos.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import type { TipoHallazgo } from '@prisma/client';

/// Un plazo tiene que ser un entero positivo. Cero significaría «vence el mismo día que se
/// clasifica», que no es un plazo: es una trampa.
function validarDias(n: number, campo: string): string | null {
  if (!Number.isInteger(n)) return `${campo} tiene que ser un número entero de días`;
  if (n < 1) return `${campo} tiene que ser al menos 1 día: cero no es un plazo, es una trampa`;
  if (n > 3650) return `${campo} supera los diez años; probablemente sea un error de tipeo`;
  return null;
}

export async function guardarPlazoDeHallazgo(
  tipo: TipoHallazgo,
  datos: { diasAnalisis: number; diasEjecucion: number; diasVerificacion: number; motivo: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');
    if (datos.motivo.trim().length < 10) {
      return { ok: false, mensaje: 'Decí por qué cambia el plazo: la bitácora la lee un auditor.' };
    }
    const errores = [
      validarDias(datos.diasAnalisis, 'El plazo de análisis'),
      validarDias(datos.diasEjecucion, 'El plazo de ejecución'),
      validarDias(datos.diasVerificacion, 'El plazo de verificación'),
    ].filter((x): x is string => x !== null);
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    const previo = await prisma.plazoPorTipoHallazgo.findUnique({ where: { tipo } });

    await prisma.$transaction(async (tx) => {
      await tx.plazoPorTipoHallazgo.upsert({
        where: { tipo },
        update: {
          diasAnalisis: datos.diasAnalisis,
          diasEjecucion: datos.diasEjecucion,
          diasVerificacion: datos.diasVerificacion,
        },
        create: {
          tipo,
          diasAnalisis: datos.diasAnalisis,
          diasEjecucion: datos.diasEjecucion,
          diasVerificacion: datos.diasVerificacion,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'plazo_por_tipo_hallazgo',
          registroId: tipo,
          campo: 'plazos',
          // El valor anterior completo, no sólo el que cambió: reconstruir la regla vigente
          // en una fecha pasada es lo que hace verificable un hallazgo cerrado con ella.
          anterior:
            previo === null
              ? null
              : `${previo.diasAnalisis}/${previo.diasEjecucion}/${previo.diasVerificacion}`,
          nuevo: `${datos.diasAnalisis}/${datos.diasEjecucion}/${datos.diasVerificacion}`,
          motivo: datos.motivo.trim(),
        },
      ]);
    });

    revalidatePath('/sig/plazos');
    revalidatePath('/sig/mejora');
    return {
      ok: true,
      mensaje: 'Plazo guardado. Los hallazgos ya abiertos conservan el plazo con el que nacieron.',
    };
  });
}

/// Los plazos de remediación de vulnerabilidades. **Corren desde la NOTIFICACIÓN al
/// proveedor**, no desde que la encontró el análisis: son dos relojes distintos y el
/// sistema tiene que saber cuál usa cada cosa, o los conteos no cuadran con el contrato.
export async function guardarPlazoDeVulnerabilidad(
  clave: string,
  valor: string,
  motivo: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');
    if (motivo.trim().length < 10) {
      return { ok: false, mensaje: 'Decí por qué cambia el plazo: es exigible por contrato.' };
    }
    // Sólo las claves de este módulo. Una acción que acepte cualquier clave se convierte en
    // un editor universal de parámetros con el permiso de esta pantalla.
    const permitidas = new Set([
      'desarrollo_plazo_critica_horas',
      'desarrollo_plazo_alta_dias',
      'desarrollo_plazo_media_dias',
      'desarrollo_plazo_baja_dias',
      'desarrollo_severidad_bloquea',
      'desarrollo_excepcion_dias_aviso',
    ]);
    if (!permitidas.has(clave)) return { ok: false, mensaje: 'Ese parámetro no se edita acá.' };

    const previo = await prisma.parametro.findUnique({ where: { clave } });
    if (previo === null) return { ok: false, mensaje: 'El parámetro no existe.' };

    if (clave === 'desarrollo_severidad_bloquea') {
      if (!['CRITICOS', 'ALTOS', 'MEDIOS', 'BAJOS'].includes(valor)) {
        return { ok: false, mensaje: 'La severidad tiene que ser CRITICOS, ALTOS, MEDIOS o BAJOS.' };
      }
    } else {
      const n = Number(valor);
      // Cero SÍ se admite en los plazos de vulnerabilidad: en «baja» significa «siguiente
      // entrega planificada», que es lo que FOR-LCO-05 dice y no un número de días.
      if (!Number.isInteger(n) || n < 0) {
        return { ok: false, mensaje: 'El plazo tiene que ser un entero de cero o más.' };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.parametro.update({ where: { clave }, data: { valor } });
      await registrar(tx, autor, [
        {
          tabla: 'parametro',
          registroId: clave,
          campo: 'valor',
          anterior: previo.valor,
          nuevo: valor,
          motivo: motivo.trim(),
        },
      ]);
    });

    revalidatePath('/sig/plazos');
    revalidatePath('/tecnologia/sistemas');
    return { ok: true, mensaje: 'Plazo guardado.' };
  });
}
