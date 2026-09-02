'use server';

// app/sig/acciones/estrategico.ts
//
// D1 código inmutable; D2 fuente tipada; D6 materializar genera hallazgo; D7 un
// NO_CUMPLE origina hallazgo; D8 derogar no borra; D10 línea base anual. Todo con
// bitácora en la misma transacción.

import { prisma } from '@/lib/db';
import { autorConPermiso, ejecutar, exigirId, idOpcional, type Resultado } from '@/app/sgsi/acciones/sesion';
import { registrar, registrarAlta, registrarBaja } from '@/lib/sgsi/bitacora';
import { codigoHallazgo } from '@/lib/sig/hallazgos';

// ── DOFA y PESTEL (D2: la fuente guarda la referencia, no un texto) ──

export async function crearAnalisisContexto(
  datos: { tipo: 'DOFA' | 'PESTEL'; anio: number; actaReferencia: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };

    await prisma.$transaction(async (tx) => {
      await tx.analisisContexto.updateMany({
        where: { tipo: datos.tipo, vigente: true },
        data: { vigente: false },
      });
      const creado = await tx.analisisContexto.create({
        data: {
          tipo: datos.tipo,
          anio: datos.anio,
          aprobadoPorId: persona.id,
          fechaAprobacion: new Date(),
          actaReferencia: datos.actaReferencia,
        },
      });
      await registrarAlta(tx, autor, 'analisis_contexto', String(creado.id));
    });
    return { ok: true, mensaje: 'Análisis de contexto creado y marcado vigente.' };
  });
}

export async function agregarEntradaContexto(
  analisisId: number,
  datos: { casilla: string; texto: string; efecto: 'FAVORABLE' | 'ADVERSO' },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    exigirId(analisisId, 'el análisis de contexto');
    await prisma.$transaction(async (tx) => {
      const ultima = await tx.entradaContexto.findFirst({
        where: { analisisId },
        orderBy: { orden: 'desc' },
      });
      const entrada = await tx.entradaContexto.create({
        data: {
          analisisId,
          casilla: datos.casilla,
          texto: datos.texto,
          efecto: datos.efecto,
          orden: (ultima?.orden ?? 0) + 1,
        },
      });
      await registrarAlta(tx, autor, 'entrada_contexto', String(entrada.id));
    });
    return { ok: true, mensaje: 'Entrada agregada.' };
  });
}

// ── Partes interesadas ──

export async function crearParteInteresada(
  datos: { tipo: 'INTERNA' | 'EXTERNA'; descripcion: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const parte = await tx.parteInteresada.create({ data: datos });
      await registrarAlta(tx, autor, 'parte_interesada', String(parte.id));
    });
    return { ok: true, mensaje: 'Parte interesada creada.' };
  });
}

export async function agregarNecesidad(
  parteId: number,
  datos: {
    texto: string;
    clase: 'NECESIDAD' | 'EXPECTATIVA';
    poder: 'ALTO' | 'MEDIO' | 'BAJO';
    interes: 'ALTO' | 'MEDIO' | 'BAJO';
    generaRequisitosSgsi?: boolean;
    requisitoCambioClimatico?: boolean;
    requiereCambioAlcanceSig?: boolean;
    responsableId?: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    exigirId(parteId, 'la parte interesada');
    idOpcional(datos.responsableId, 'el responsable');
    await prisma.$transaction(async (tx) => {
      const creada = await tx.necesidadExpectativa.create({ data: { parteId, ...datos } });
      await registrarAlta(tx, autor, 'necesidad_expectativa', String(creada.id));
    });
    return { ok: true, mensaje: 'Necesidad registrada.' };
  });
}

export async function guardarSeguimientoParte(
  necesidadId: number,
  datos: { anio: number; planAccion: string; seguimiento: string; evidencia: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const seg = await tx.seguimientoParteAnual.upsert({
        where: { necesidadId_anio: { necesidadId, anio: datos.anio } },
        update: {
          planAccion: datos.planAccion,
          seguimiento: datos.seguimiento,
          evidencia: datos.evidencia,
        },
        create: {
          necesidadId,
          anio: datos.anio,
          planAccion: datos.planAccion,
          seguimiento: datos.seguimiento,
          evidencia: datos.evidencia,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'seguimiento_parte_anual',
          registroId: String(seg.id),
          campo: 'seguimiento',
          anterior: null,
          nuevo: datos.seguimiento,
          motivo: `seguimiento anual ${datos.anio}`,
        },
      ]);
    });
    return { ok: true, mensaje: 'Seguimiento guardado.' };
  });
}

// ── Requisitos legales ──

export async function crearRequisitoLegal(
  datos: {
    normatividad: string;
    articulo?: string;
    expedidaPor: string;
    tipo: string;
    objeto: string;
    aplicacion: string;
    sistemaGestion: string;
    procesoEncargado?: string;
    responsableId?: number;
    periodicidadRevision: string;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const ultimo = await tx.requisitoLegal.findFirst({ orderBy: { consecutivo: 'desc' } });
      const creado = await tx.requisitoLegal.create({
        data: { consecutivo: (ultimo?.consecutivo ?? 0) + 1, ...datos },
      });
      await registrarAlta(tx, autor, 'requisito_legal', String(creado.id));
    });
    return { ok: true, mensaje: 'Requisito legal creado.' };
  });
}

/// D8: derogar no borra; queda vigente=false con la norma que deroga.
export async function derogarRequisito(
  requisitoId: number,
  normaQueDeroga: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    exigirId(requisitoId, 'el requisito legal');
    if (!normaQueDeroga.trim()) {
      return { ok: false, mensaje: 'Indicá qué norma lo deroga: una derogación sin fuente no se puede auditar.' };
    }
    await prisma.$transaction(async (tx) => {
      await tx.requisitoLegal.update({
        where: { id: requisitoId },
        data: { vigente: false, derogadoEn: new Date(), normaQueDeroga },
      });
      await registrarBaja(tx, autor, 'requisito_legal', String(requisitoId), `derogado por ${normaQueDeroga}`);
    });
    return { ok: true, mensaje: 'Requisito derogado. Las evaluaciones históricas se conservan.' };
  });
}

export interface DatosEvaluacion {
  requisitoId: number;
  resultado: 'CUMPLE' | 'PARCIAL' | 'NO_CUMPLE';
  evidencia?: string;
  origenHallazgo?: boolean;
}

/// D7: un NO_CUMPLE puede originar un hallazgo con un clic (en Mejora).
export async function evaluarCumplimiento(datos: DatosEvaluacion): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    exigirId(datos.requisitoId, 'el requisito legal');
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };
    const requisito = await prisma.requisitoLegal.findUnique({ where: { id: datos.requisitoId } });
    if (!requisito) return { ok: false, mensaje: 'El requisito no existe.' };

    await prisma.$transaction(async (tx) => {
      const evaluacion = await tx.evaluacionCumplimiento.create({
        data: {
          requisitoId: datos.requisitoId,
          resultado: datos.resultado,
          evidencia: datos.evidencia,
          evaluadoPorId: persona.id,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'evaluacion_cumplimiento',
          registroId: String(evaluacion.id),
          campo: 'resultado',
          anterior: null,
          nuevo: datos.resultado,
        },
      ]);
      if (datos.resultado === 'NO_CUMPLE' && datos.origenHallazgo) {
        const anio = new Date().getUTCFullYear();
        const contador = await tx.contadorHallazgo.upsert({
          where: { anio },
          update: { ultimoValor: { increment: 1 } },
          create: { anio, ultimoValor: 1 },
        });
        const hallazgo = await tx.hallazgo.create({
          data: {
            codigo: codigoHallazgo(anio, contador.ultimoValor),
            tipo: 'NC_MENOR',
            origen: 'INDICADOR',
            origenReferencia: `Requisito legal ${requisito.consecutivo}`,
            descripcion: `Incumplimiento del requisito ${requisito.normatividad}`,
            requisitoIncumplido: `${requisito.normatividad} · ${requisito.articulo ?? ''}`,
            evidenciaObjetiva: datos.evidencia ?? '',
            areaId: 1,
            detectadoPorId: persona.id,
            fechaDeteccion: new Date(),
          },
        });
        await tx.evaluacionCumplimiento.update({
          where: { id: evaluacion.id },
          data: { hallazgoId: hallazgo.id },
        });
        await registrarAlta(tx, autor, 'hallazgo', String(hallazgo.id));
      }
    });
    return { ok: true, mensaje: 'Evaluación registrada.' };
  });
}

// ── Riesgos, controles, materialización y línea base ──

export interface DatosRiesgo {
  clase: 'RIESGO' | 'OPORTUNIDAD';
  proceso: string;
  fuente: 'PROCESO' | 'PARTE_INTERESADA' | 'DOFA' | 'PESTEL';
  necesidadExpectativaId?: number;
  entradaContextoId?: number;
  descripcion: string;
  causa: string;
  efecto: string;
  factorId: number;
  probabilidadId: number;
  impactoId: number;
  responsableId?: number;
}

/// D1: los nuevos siguen el consecutivo del Excel (R1…R66); el código es inmutable.
/// D2: la fuente guarda la referencia a la fila, no un texto. D3: la clase decide
/// qué escala de impacto aplica.
export async function crearRiesgoOrganizacional(datos: DatosRiesgo): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    await prisma.$transaction(async (tx) => {
      const ultimo = await tx.riesgoOrganizacional.findFirst({ orderBy: { codigo: 'desc' } });
      const siguiente = ultimo ? Number(ultimo.codigo.slice(1)) + 1 : 1;
      const creado = await tx.riesgoOrganizacional.create({
        data: { codigo: `R${siguiente}`, ...datos },
      });
      await registrarAlta(tx, autor, 'riesgo_organizacional', String(creado.id));
    });
    return { ok: true, mensaje: 'Riesgo u oportunidad creado.' };
  });
}

export async function agregarControlRiesgo(
  riesgoId: number,
  datos: { descripcion: string; tipoId: number; eficaciaId: number },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    exigirId(riesgoId, 'el riesgo');
    exigirId(datos.tipoId, 'el tipo de control');
    exigirId(datos.eficaciaId, 'la eficacia del control');
    await prisma.$transaction(async (tx) => {
      const control = await tx.controlRiesgoOrg.create({ data: { riesgoId, ...datos } });
      await registrarAlta(tx, autor, 'control_riesgo_org', String(control.id));
    });
    return { ok: true, mensaje: 'Control agregado. El residual se recalcula al leer.' };
  });
}

export interface DatosMaterializacion {
  riesgoId: number;
  fecha: Date;
  descripcionEvento: string;
  impactoGenerado: string;
  causaRaiz: string;
}

/// D6: materializar exige el FOR-CAL-08 completo y genera un hallazgo en Mejora con
/// origen tipado al riesgo.
export async function materializarRiesgo(datos: DatosMaterializacion): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:escribir');
    exigirId(datos.riesgoId, 'el riesgo');
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };
    const riesgo = await prisma.riesgoOrganizacional.findUnique({
      where: { id: datos.riesgoId },
    });
    if (!riesgo) return { ok: false, mensaje: 'El riesgo no existe.' };

    await prisma.$transaction(async (tx) => {
      const materializacion = await tx.materializacionRiesgo.create({
        data: { ...datos, reportanteId: persona.id },
      });
      const anio = new Date().getUTCFullYear();
      const contador = await tx.contadorHallazgo.upsert({
        where: { anio },
        update: { ultimoValor: { increment: 1 } },
        create: { anio, ultimoValor: 1 },
      });
      const hallazgo = await tx.hallazgo.create({
        data: {
          codigo: codigoHallazgo(anio, contador.ultimoValor),
          tipo: 'NC_MAYOR',
          origen: 'SGSI',
          origenReferencia: riesgo.codigo,
          descripcion: `Riesgo materializado: ${riesgo.descripcion}`,
          requisitoIncumplido: 'ISO 31000:2018 · control operacional',
          evidenciaObjetiva: datos.descripcionEvento,
          areaId: 1,
          detectadoPorId: persona.id,
          fechaDeteccion: new Date(),
        },
      });
      await tx.materializacionRiesgo.update({
        where: { id: materializacion.id },
        data: { hallazgoId: hallazgo.id },
      });
      await registrarAlta(tx, autor, 'materializacion_riesgo', String(materializacion.id));
      await registrarAlta(tx, autor, 'hallazgo', String(hallazgo.id));
    });
    return { ok: true, mensaje: 'Materialización registrada: abrió un hallazgo en Mejora.' };
  });
}

/// D10: línea base anual — se congela la matriz para comparar entre años, con el
/// patrón de LineaBase del SGSI.
export async function congelarLineaBase(nombre: string, acta: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('estrategico:parametrizar');
    const riesgos = await prisma.riesgoOrganizacional.findMany({
      include: { controles: { include: { tipo: true, eficacia: true } } },
    });
    const snapshot = riesgos.map((r) => ({
      codigo: r.codigo,
      clase: r.clase,
      proceso: r.proceso,
      probabilidad: r.probabilidadId,
      impacto: r.impactoId,
      controles: r.controles.map((c) => ({ tipo: c.tipo.nombre, eficacia: c.eficacia.nombre })),
    }));
    await prisma.lineaBase.create({
      data: { nombre, fecha: new Date(), creadaPor: `${autor} · ${acta}`, snapshot },
    });
    return { ok: true, mensaje: 'Línea base congelada.' };
  });
}