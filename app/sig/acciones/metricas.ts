'use server';

// app/sig/acciones/metricas.ts
//
// Registrar la medición de un periodo.
//
// **La alerta no se guarda: se abre una tarea.** No hay tabla de alertas porque una
// medición está en alerta cuando cruza el umbral, y eso se calcula al leer. Lo que sí es un
// hecho nuevo del mundo es que alguien tiene que hacer algo, y eso se persiste como una
// asignación del módulo A — el motor que ya sabe repartir, avisar y cerrar trabajo.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';
import { enAlerta, rachaDeAlerta, textoDeAlerta, type Medicion } from '@/lib/sig/metricas';
import type { Periodicidad } from '@prisma/client';

export interface ResultadoMedicion extends Resultado {
  /// Si esta medición cruzó el umbral. La pantalla lo usa para decirlo en el acuse, no
  /// para guardarlo.
  alerta: boolean;
  /// El periodo de la asignación que se abrió, si se abrió alguna.
  tareaAbierta: string | null;
}

export async function registrarMedicion(
  codigo: string,
  datos: { periodo: string; valor: number },
): Promise<ResultadoMedicion> {
  return ejecutar<ResultadoMedicion>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    const metrica = await prisma.metrica.findUnique({
      where: { codigo },
      include: { mediciones: { orderBy: { periodo: 'asc' } } },
    });
    if (!metrica) return { ok: false, mensaje: 'La métrica no existe.', alerta: false, tareaAbierta: null };

    if (!datos.periodo.trim()) {
      return { ok: false, mensaje: 'Falta el periodo.', alerta: false, tareaAbierta: null };
    }
    if (!Number.isFinite(datos.valor)) {
      return { ok: false, mensaje: 'El valor tiene que ser un número.', alerta: false, tareaAbierta: null };
    }
    // Un periodo no se puede registrar dos veces. La unique de la base diría lo mismo, pero
    // acá el mensaje puede explicar que la serie es histórico y no un borrador.
    if (metrica.mediciones.some((m) => m.periodo === datos.periodo)) {
      return {
        ok: false,
        mensaje: `El periodo ${datos.periodo} ya está registrado. La serie es histórico: no se reescribe.`,
        alerta: false,
        tareaAbierta: null,
      };
    }

    const definicion = { umbral: Number(metrica.umbral), sentido: metrica.sentido };
    const cruza = enAlerta(datos.valor, definicion);

    // La racha se calcula CON la medición nueva incluida: es la que puede convertir dos
    // periodos sueltos en una tendencia.
    const serie: Medicion[] = [
      ...metrica.mediciones.map((m) => ({ periodo: m.periodo, valor: Number(m.valor) })),
      { periodo: datos.periodo, valor: datos.valor },
    ];
    const racha = rachaDeAlerta(serie, definicion);

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });

    let tareaAbierta: string | null = null;
    await prisma.$transaction(async (tx) => {
      let asignacionId: number | null = null;
      if (cruza) {
        const texto = textoDeAlerta(
          { periodo: datos.periodo, valor: datos.valor },
          definicion,
          metrica.unidad,
          racha,
        );
        // Una asignación sin obligación ni contenido: lleva su propio título y descripción.
        // El modelo lo permite justamente para el trabajo que no nace de una obligación
        // recurrente, y una alerta es exactamente eso.
        const tarea = await tx.asignacion.create({
          data: {
            personaId: metrica.responsableId,
            titulo: `Alerta de ${metrica.codigo} · ${datos.periodo}`,
            descripcion: `${metrica.titulo}. ${texto}`,
            periodo: datos.periodo,
            fechaApertura: new Date(),
            // El plazo de la tarea de alerta NO está en el código: se abre sin plazo
            // propio y vence con el periodo siguiente de la métrica. Poner «7 días» acá
            // sería exactamente el número inventado que el invariante prohíbe, así que la
            // fecha límite es la de apertura y quien la reciba la ve vencida hoy — que es
            // lo que una alerta significa.
            fechaLimite: new Date(),
          },
        });
        asignacionId = tarea.id;
        tareaAbierta = tarea.periodo;
        await registrarAlta(tx, autor, 'asignacion', String(tarea.id));
      }

      const creada = await tx.medicionMetrica.create({
        data: {
          metricaId: metrica.id,
          periodo: datos.periodo,
          valor: datos.valor,
          registradoPorId: persona?.id ?? null,
          asignacionId,
        },
      });
      await registrarAlta(tx, autor, 'medicion_metrica', String(creada.id));
      await registrar(tx, autor, [
        {
          tabla: 'medicion_metrica',
          registroId: `${metrica.codigo} · ${datos.periodo}`,
          campo: 'valor',
          anterior: null,
          nuevo: `${datos.valor} ${metrica.unidad}`,
          motivo: cruza
            ? `cruza el umbral de ${Number(metrica.umbral)}; se abrió tarea al responsable`
            : `dentro del umbral de ${Number(metrica.umbral)}`,
        },
      ]);
    });

    revalidatePath(`/sgsi/metricas`);
    return {
      ok: true,
      mensaje: cruza
        ? `Registrado. Cruza el umbral${racha > 1 ? ` por ${racha}º periodo consecutivo` : ''}: se abrió una tarea al responsable.`
        : 'Registrado, dentro del umbral.',
      alerta: cruza,
      tareaAbierta,
    };
  });
}

/// Definir una métrica. **El umbral y su sentido son obligatorios en el alta**, no campos
/// que se llenan después: una métrica sin umbral no puede decir si está cumpliendo, y una
/// sin sentido no sabe de qué lado está lo malo. Nacer incompleta la volvería una fila que
/// nadie puede leer hasta que alguien recuerde volver.
export async function definirMetrica(datos: {
  codigo: string;
  controlAnexoA: string;
  titulo: string;
  unidad: string;
  umbral: number;
  sentido: 'MENOR_ES_MEJOR' | 'MAYOR_ES_MEJOR';
  periodicidad: Periodicidad;
  responsableId: number;
}): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    exigirId(datos.responsableId, 'el responsable');

    const codigo = datos.codigo.trim().toUpperCase();
    if (codigo === '') return { ok: false, mensaje: 'Falta el código.' };
    if (datos.titulo.trim() === '') return { ok: false, mensaje: 'Falta el título.' };
    if (datos.unidad.trim() === '') {
      return { ok: false, mensaje: 'Falta la unidad: un número sin unidad no se puede comparar con nada.' };
    }
    if (datos.controlAnexoA.trim() === '') {
      return { ok: false, mensaje: 'Falta el control del Anexo A que la métrica mide.' };
    }
    if (!Number.isFinite(datos.umbral)) return { ok: false, mensaje: 'El umbral tiene que ser un número.' };

    const repetida = await prisma.metrica.findUnique({ where: { codigo }, select: { id: true } });
    if (repetida) return { ok: false, mensaje: `Ya existe una métrica ${codigo}.` };

    await prisma.$transaction(async (tx) => {
      const creada = await tx.metrica.create({
        data: {
          codigo,
          controlAnexoA: datos.controlAnexoA.trim(),
          titulo: datos.titulo.trim(),
          unidad: datos.unidad.trim(),
          umbral: datos.umbral,
          sentido: datos.sentido,
          periodicidad: datos.periodicidad,
          responsableId: datos.responsableId,
        },
      });
      await registrarAlta(tx, autor, 'metrica', String(creada.id));
    });

    revalidatePath('/sgsi/metricas');
    return { ok: true, mensaje: `Métrica ${codigo} definida.` };
  });
}

/// Cambiar el umbral o su sentido. **No recalcula el pasado**: las mediciones guardan el
/// valor medido, y si el umbral cambia, las alertas del histórico se releen contra el
/// umbral nuevo — porque la alerta se deriva. Es deliberado: un umbral que se endurece debe
/// mostrar que antes tampoco se cumplía.
export async function ajustarUmbral(
  codigo: string,
  datos: { umbral: number; sentido: 'MENOR_ES_MEJOR' | 'MAYOR_ES_MEJOR'; motivo: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const metrica = await prisma.metrica.findUnique({ where: { codigo } });
    if (!metrica) return { ok: false, mensaje: 'La métrica no existe.' };
    exigirId(metrica.id, 'la métrica');
    if (!Number.isFinite(datos.umbral)) return { ok: false, mensaje: 'El umbral tiene que ser un número.' };
    if (datos.motivo.trim().length < 10) {
      return { ok: false, mensaje: 'Decí por qué cambia el umbral: la serie histórica se relee contra el nuevo.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.metrica.update({
        where: { id: metrica.id },
        data: { umbral: datos.umbral, sentido: datos.sentido },
      });
      await registrar(tx, autor, [
        {
          tabla: 'metrica',
          registroId: metrica.codigo,
          campo: 'umbral',
          anterior: `${Number(metrica.umbral)} · ${metrica.sentido}`,
          nuevo: `${datos.umbral} · ${datos.sentido}`,
          motivo: datos.motivo.trim(),
        },
      ]);
    });

    revalidatePath('/sgsi/metricas');
    return { ok: true, mensaje: 'Umbral actualizado. La serie se relee contra el nuevo.' };
  });
}
