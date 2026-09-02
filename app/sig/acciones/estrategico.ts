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
// ── Restauración de los catálogos del método (MAN-CAL-01) ──

/// Los valores normativos del manual. Viven acá y no importados del seed a propósito: el
/// seed es un script de arranque que abre su propio cliente de Prisma, y una acción de
/// servidor no puede depender de eso. Duplicarlos tiene un costo —dos lugares que hay que
/// mover juntos— y se paga a cambio de que la restauración corra en UNA transacción con su
/// bitácora, que es lo que un auditor pide al ver un botón llamado «restaurar».
const NORMATIVOS = {
  probabilidad: [
    [1, 'Muy baja', 'Casi nunca', '#e6efe9'],
    [2, 'Baja', 'Ocasionalmente', '#eef7f1'],
    [3, 'Media', 'Con cierta frecuencia', '#faf1d3'],
    [4, 'Alta', 'Frecuentemente', '#fbe6d2'],
    [5, 'Muy alta', 'Casi siempre', '#f7dcd9'],
  ] as const,
  impactoRiesgo: [
    [1, 'Insignificante', '1', '70000000'],
    [2, 'Menor', '3', '210000000'],
    [3, 'Moderado', '7', '490000000'],
    [4, 'Mayor', '12', '840000000'],
    [5, 'Catastrófico', '20', '1400000000'],
  ] as const,
  impactoOportunidad: [
    [1, 'Menor'],
    [2, 'Moderada'],
    [3, 'Significativa'],
    [4, 'Importante'],
    [5, 'Excepcional'],
  ] as const,
  tiposControl: [
    ['Preventivo', 'PROBABILIDAD', 'Evita que el riesgo ocurra'],
    ['Correctivo', 'IMPACTO', 'Reduce el daño cuando ocurre'],
    ['Preventivo y correctivo', 'AMBOS', 'Actúa antes y después'],
    ['Reforzador', 'PROBABILIDAD', 'Hace más probable la oportunidad'],
    ['Reactivo', 'IMPACTO', 'Definido en el manual; la matriz no lo usa'],
    ['Proactivo', 'AMBOS', 'Refuerza y amplía la oportunidad'],
  ] as const,
  eficacias: [
    ['Débil', '0.100', 'Reduce el 10 %'],
    ['Moderado', '0.400', 'Reduce el 40 %'],
    ['Fuerte', '0.800', 'Reduce el 80 %'],
  ] as const,
  niveles: [
    [0, 4, 'Aceptable', '#0b5c44', 'Aceptar', 'Esperar'],
    [5, 12, 'Moderado', '#c25a1e', 'Mitigar o reducir', 'Mejorar'],
    [13, 25, 'Inaceptable', '#a52016', 'Evitar', 'Explotar'],
  ] as const,
};

export interface ResultadoRestauracion extends Resultado {
  cambios: number;
}

/// Devuelve los catálogos del método a los valores de MAN-CAL-01.
///
/// El botón que la invoca existía desde el principio y NO restauraba nada: escribía «valores
/// restaurados» y no tocaba la base. Un control que afirma haber restaurado datos es peor que
/// uno que no anda: quien lo pulsó cree que el método volvió a su línea normativa, y sigue
/// calculando con los valores que quiso corregir.
///
/// Exige motivo porque cambiar una escala recalcula los 66 registros al leer, y una
/// restauración sin razón escrita es indistinguible de un accidente.
export async function restaurarCatalogosDelMetodo(motivo: string): Promise<ResultadoRestauracion> {
  return ejecutar<ResultadoRestauracion>(async () => {
    const autor = await autorConPermiso('estrategico:parametrizar');
    if (!motivo.trim()) {
      return { ok: false, mensaje: 'La restauración exige motivo: queda en bitácora.', cambios: 0 };
    }

    let cambios = 0;
    await prisma.$transaction(async (tx) => {
      for (const [valor, etiqueta, descripcion, color] of NORMATIVOS.probabilidad) {
        const previo = await tx.escalaProbabilidad.findUnique({ where: { valor } });
        if (previo?.etiqueta === etiqueta && previo?.descripcion === descripcion) continue;
        await tx.escalaProbabilidad.upsert({
          where: { valor },
          update: { etiqueta, descripcion, color },
          create: { valor, etiqueta, descripcion, color },
        });
        cambios++;
      }
      for (const [valor, etiqueta, pct, cop] of NORMATIVOS.impactoRiesgo) {
        await tx.escalaImpactoRiesgo.upsert({
          where: { valor },
          update: { etiqueta, porcentajePatrimonio: pct, referenciaCop: cop },
          create: { valor, etiqueta, porcentajePatrimonio: pct, referenciaCop: cop },
        });
        cambios++;
      }
      for (const [valor, etiqueta] of NORMATIVOS.impactoOportunidad) {
        await tx.escalaImpactoOportunidad.upsert({
          where: { valor },
          update: { etiqueta },
          create: { valor, etiqueta },
        });
        cambios++;
      }
      for (const nombre of ['Legal', 'Operacional', 'Personal', 'Tecnológico', 'Reputacional', 'Externo']) {
        await tx.factorRiesgo.upsert({ where: { nombre }, update: {}, create: { nombre } });
      }
      for (const [nombre, reduce, descripcion] of NORMATIVOS.tiposControl) {
        await tx.tipoControlRiesgo.upsert({
          where: { nombre },
          update: { reduce, descripcion },
          create: { nombre, reduce, descripcion },
        });
        cambios++;
      }
      for (const [nombre, valor, descripcion] of NORMATIVOS.eficacias) {
        await tx.eficaciaControl.upsert({
          where: { nombre },
          update: { valor, descripcion },
          create: { nombre, valor, descripcion },
        });
        cambios++;
      }
      for (const [minimo, maximo, etiqueta, color, accionRiesgo, accionOportunidad] of NORMATIVOS.niveles) {
        await tx.nivelRiesgo.upsert({
          where: { minimo },
          update: { maximo, etiqueta, color, accionRiesgo, accionOportunidad },
          create: { minimo, maximo, etiqueta, color, accionRiesgo, accionOportunidad },
        });
        cambios++;
      }

      await registrar(tx, autor, [
        {
          tabla: 'parametro',
          registroId: 'catalogos-metodo-estrategico',
          campo: 'restauracion',
          anterior: 'valores en uso',
          nuevo: 'valores normativos de MAN-CAL-01',
          motivo,
        },
      ]);
    });

    return {
      ok: true,
      mensaje: `Catálogos devueltos a MAN-CAL-01 · ${cambios} valores aplicados. El residual de los riesgos se recalcula al leer.`,
      cambios,
    };
  });
}
