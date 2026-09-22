'use server';

// app/sgsi/acciones/acta-residual.ts
//
// Emitir el acta de aprobación del riesgo residual, cargar el acta firmada y registrar quién
// firmó.
//
// ── LA FIRMA OCURRE FUERA DEL SISTEMA, Y ESO CAMBIA QUÉ PUEDE AFIRMAR LA APLICACIÓN ──────
//
// Cuando alguien marca una firma acá, el sistema NO está diciendo «esta persona actuó en la
// aplicación». Está diciendo «alguien registró que esta persona firmó en papel». Los dos
// hechos se guardan por separado —`firmanteId` y `registradoPorId`— porque a los seis meses esa
// diferencia es lo único que distingue una firma de una afirmación sobre una firma.
//
// Es también la razón por la que esto no usa `ActaAceptacion`, el mecanismo de firma
// electrónica que ya existe: aquél prohíbe la delegación en términos explícitos —«un acta
// firmada por otro no es una firma, es una falsificación con permisos»— y tiene razón. Esto es
// otra cosa y se llama distinto.
//
// **Cada export de este archivo es un endpoint alcanzable.** Nada de `export const`: es lo que
// tumbó el despliegue del 16/09/2026, y `lib/__tests__/use-server.test.ts` lo vigila.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import {
  puedeEmitirActa,
  resumenDeFirmantes,
} from '@/lib/sgsi/firmantes-acta-residual';
import { actaResidualHtml } from '@/lib/sgsi/acta-residual-documento';
import { parsearOrigen } from '@/lib/sgsi/origen-plan';
import {
  ANEXOS_ACEPTADOS,
  esExtension,
  formatoTamano,
  mimePorContenido,
  sha256De,
} from '@/lib/sgsi/anexo-archivo';
import { htmlAPdf } from '@/lib/pdf';
import { leerRiesgoResidual } from '@/app/sgsi/riesgo-residual/acta.query';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from './sesion';

export interface ResultadoActa extends Resultado {
  codigo?: string;
}

/// La persona del censo detrás del correo de la sesión.
///
/// No se resuelve a un correo suelto: el acta dice quién la generó, y un correo que el censo no
/// conoce no es una persona del sistema. Falla en vez de escribir una atribución que nadie
/// puede seguir.
async function personaDeLaSesion(correo: string): Promise<{ id: number; nombre: string }> {
  const p = await prisma.persona.findUnique({
    where: { correo: correo.toLowerCase() },
    select: { id: true, nombre: true },
  });
  if (p === null) {
    throw new Error(
      `No hay una persona registrada con el correo ${correo}, así que no se puede atribuir esta operación.`,
    );
  }
  return p;
}

/// Emite el acta del periodo: congela el alcance, genera el PDF y abre la hoja de firmas.
///
/// **Emitir es congelar, y por eso no hay borrador.** Un acta a medio hacer que se puede editar
/// no congela nada, y lo que este documento tiene que congelar son las cifras que alguien firma.
export async function emitirActaResidual(
  periodo: string,
  motivo?: string,
): Promise<ResultadoActa> {
  return ejecutar<ResultadoActa>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const persona = await personaDeLaSesion(autor);

    const vista = await leerRiesgoResidual(periodo);

    // Las dos razones para no emitir —sin activos que aprobar, o sin nadie que pueda firmar—
    // viven en `lib/sgsi/firmantes-acta-residual.ts`, del que también depende la pantalla
    // para apagar el botón. La segunda no existía: se podía emitir un acta que, por
    // `estado-acta-residual.ts`, no puede llegar nunca a APROBADA, quemando un consecutivo
    // y dejando un PDF sellado que sólo se limpia anulándolo.
    const emision = puedeEmitirActa(
      vista.filas.length,
      resumenDeFirmantes(vista.firmantes).resolubles,
    );
    if (!emision.puede) return { ok: false, mensaje: emision.motivo };

    const consecutivo = (await prisma.actaRiesgoResidual.count({ where: { periodo } })) + 1;
    const codigo = `ARR-${periodo}-${String(consecutivo).padStart(3, '0')}`;
    const generadaEn = new Date().toISOString().slice(0, 10);

    const html = actaResidualHtml({
      codigo,
      periodo,
      generadaEn,
      generadaPor: persona.nombre,
      alcanceHash: vista.huellaActual,
      sinCalcular: vista.sinCalcular,
      filas: vista.filas,
      firmantes: vista.firmantes,
    });
    const pdf = await htmlAPdf(html);
    const huellaPdf = sha256De(pdf);

    // El plan que cubre cada activo, resuelto con el parser del origen y no buscando el código
    // dentro del texto: `origen` es un campo estructurado con prefijo, y un `includes` haría
    // que un plan cuya narrativa mencione otro activo se atribuyera al equivocado.
    const planes = await prisma.accionPlan.findMany({
      where: { activa: true },
      select: { codigo: true, origen: true, tipo: true },
      orderBy: { codigo: 'asc' },
    });
    const planPorActivo = new Map<string, { codigo: string; tipo: string }>();
    for (const p of planes) {
      const o = parsearOrigen(p.origen);
      if (o === null) continue;
      if (!planPorActivo.has(o.activoCodigo)) {
        planPorActivo.set(o.activoCodigo, { codigo: p.codigo, tipo: p.tipo });
      }
    }

    await prisma.$transaction(async (tx) => {
      const acta = await tx.actaRiesgoResidual.create({
        data: {
          codigo,
          periodo,
          estado: 'EMITIDA',
          alcanceHash: vista.huellaActual,
          sinCalcular: vista.sinCalcular,
          generadaPorId: persona.id,
          documentoSha256: huellaPdf,
          // `Bytes` de Prisma es `Uint8Array`, y el `Buffer` de Node se declara sobre
          // `ArrayBufferLike`, que lo incluye pero no equivale. La conversión es explícita para
          // que el compilador no tenga que suponer nada.
          documento: new Uint8Array(pdf),
        },
      });

      await tx.activoActaResidual.createMany({
        data: vista.filas.map((f) => {
          const plan = planPorActivo.get(f.codigo);
          return {
            actaId: acta.id,
            activoId: f.activoId,
            codigo: f.codigo,
            nombre: f.nombre,
            proceso: f.proceso,
            banda: f.banda,
            cifraResidual: f.cifra,
            planCodigo: plan?.codigo ?? null,
            planTipo: plan?.tipo ?? null,
          };
        }),
      });

      await tx.firmanteActaResidual.createMany({
        data: vista.firmantes.map((f) => ({
          actaId: acta.id,
          areaId: f.areaId,
          proceso: f.proceso,
          cargoId: f.cargoId,
          cargoNombre: f.cargoNombre,
          resoluble: f.resoluble,
          activos: f.activos,
        })),
      });

      await registrarAlta(tx, autor, 'acta_riesgo_residual', codigo);
      await registrar(tx, autor, [
        {
          tabla: 'acta_riesgo_residual',
          registroId: codigo,
          campo: 'acta emitida',
          anterior: null,
          nuevo:
            `${vista.filas.length} activos · ${vista.firmantes.length} procesos · ` +
            `${vista.sinCalcular} sin calcular · alcance ${vista.huellaActual.slice(0, 12)}… · ` +
            `pdf sha256 ${huellaPdf.slice(0, 12)}…`,
          motivo: motivo?.trim() || null,
        },
      ]);
    });

    revalidatePath('/sgsi/riesgo-residual');
    return {
      ok: true,
      mensaje: `Se emitió ${codigo}: ${vista.filas.length} activos y ${vista.firmantes.length} procesos por firmar.`,
      codigo,
      cambios: 1,
    };
  });
}

export interface FirmaRegistrada {
  areaId: number;
  /// Quién firmó el papel, elegida entre las personas del cargo líder del proceso.
  firmanteId: number;
  /// `AAAA-MM-DD`, la fecha que dice el papel.
  fechaFirma: string;
}

export interface DatosSoporteActa {
  actaId: number;
  nombreOriginal: string;
  /// Los bytes del archivo tal como los manda el cliente.
  bytes: number[];
  motivo?: string;
  /// Los procesos cuya firma cubre este soporte.
  firmas: FirmaRegistrada[];
}

/// Carga el acta firmada y marca, en la misma operación, quiénes firmaron en ella.
///
/// **Las dos cosas van juntas y no en dos acciones separadas, a propósito.** Marcar una firma
/// sin el papel que la sostiene produce exactamente el registro que nadie puede auditar: una
/// afirmación sin evidencia, indistinguible de un error de digitación.
export async function cargarSoporteActaResidual(datos: DatosSoporteActa): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const persona = await personaDeLaSesion(autor);
    exigirId(datos.actaId, 'el acta');

    if (datos.firmas.length === 0) {
      return { ok: false, mensaje: 'Indica al menos un proceso cuya firma cubre este soporte.' };
    }

    const acta = await prisma.actaRiesgoResidual.findUnique({
      where: { id: datos.actaId },
      select: { id: true, codigo: true, estado: true },
    });
    if (!acta) return { ok: false, mensaje: 'El acta no existe.' };
    if (acta.estado === 'ANULADA') {
      return { ok: false, mensaje: `${acta.codigo} está anulada: emite una nueva.` };
    }

    const nombre = datos.nombreOriginal.trim();
    if (!/^[^/\\]{1,180}$/.test(nombre)) {
      return { ok: false, mensaje: 'Nombre de archivo inválido.' };
    }

    const buffer = Buffer.from(datos.bytes);
    const coincide = /\.([a-z0-9]+)$/i.exec(nombre);
    const extension = coincide ? coincide[1].toLowerCase() : '';
    if (!esExtension(extension)) {
      return {
        ok: false,
        mensaje: `Tipo no permitido «${extension || 'sin extensión'}». Lista blanca: ${Object.keys(ANEXOS_ACEPTADOS).join(', ')}.`,
      };
    }

    // El MIME se verifica por CONTENIDO y no por extensión: una extensión es una afirmación, el
    // primer byte es un hecho. Misma regla que `app/api/sgsi/anexo/route.ts`, y se importa de
    // allá en vez de reescribirse.
    const mime = mimePorContenido(buffer);
    const esperado = ANEXOS_ACEPTADOS[extension];
    const aceptable = mime === esperado || (extension === 'jpg' && mime === 'image/jpeg');
    if (!aceptable) {
      return {
        ok: false,
        mensaje: `El contenido no corresponde al tipo declarado (${mime ?? 'desconocido'}).`,
      };
    }

    const huella = sha256De(buffer);

    // Los renglones que se van a marcar tienen que existir, ser de esta acta y ser resolubles.
    // Marcar la firma de un proceso «sin firmante resoluble» afirmaría que firmó alguien que el
    // catálogo dice que no existe.
    const renglones = await prisma.firmanteActaResidual.findMany({
      where: { actaId: acta.id, areaId: { in: datos.firmas.map((f) => f.areaId) } },
      select: { areaId: true, proceso: true, resoluble: true, aprobo: true },
    });
    const errores: string[] = [];
    for (const f of datos.firmas) {
      const r = renglones.find((x) => x.areaId === f.areaId);
      if (!r) {
        errores.push(`El área ${f.areaId} no está en la hoja de firmas de ${acta.codigo}.`);
        continue;
      }
      if (!r.resoluble) {
        errores.push(
          `«${r.proceso}» no tiene firmante resoluble: asigna un cargo líder con persona activa antes de registrar su firma.`,
        );
      }
      if (r.aprobo) errores.push(`«${r.proceso}» ya tiene su firma registrada.`);
    }
    if (errores.length > 0) return { ok: false, mensaje: errores.join(' ') };

    await prisma.$transaction(async (tx) => {
      const soporte = await tx.soporteActaResidual.create({
        data: {
          actaId: acta.id,
          nombreOriginal: nombre,
          mime: mime ?? 'application/octet-stream',
          tamano: buffer.length,
          sha256: huella,
          bytes: new Uint8Array(buffer),
          cargadoPorId: persona.id,
          motivo: datos.motivo?.trim() || null,
        },
      });

      for (const f of datos.firmas) {
        await tx.firmanteActaResidual.update({
          where: { actaId_areaId: { actaId: acta.id, areaId: f.areaId } },
          data: {
            aprobo: true,
            firmanteId: f.firmanteId,
            fechaFirma: new Date(`${f.fechaFirma}T00:00:00.000Z`),
            soporteId: soporte.id,
            registradoPorId: persona.id,
            motivo: datos.motivo?.trim() || null,
          },
        });
      }

      await registrar(tx, autor, [
        {
          tabla: 'acta_riesgo_residual',
          registroId: acta.codigo,
          campo: 'soporte cargado',
          anterior: null,
          nuevo: `${nombre} · ${formatoTamano(buffer.length)} · sha256 ${huella.slice(0, 12)}…`,
          motivo: datos.motivo?.trim() || null,
        },
        ...datos.firmas.map((f) => {
          const r = renglones.find((x) => x.areaId === f.areaId);
          return {
            tabla: 'acta_riesgo_residual',
            registroId: acta.codigo,
            campo: `firma registrada · ${r?.proceso ?? `área ${f.areaId}`}`,
            anterior: null,
            nuevo: `firmó la persona ${f.firmanteId} el ${f.fechaFirma}`,
            // Quién lo asentó, y que lo asentó por otro. La diferencia entre «yo firmé» y
            // «alguien registró que firmé» tiene que seguir siendo legible seis meses después.
            motivo: `registrada por ${autor} sobre el soporte ${nombre}${datos.motivo?.trim() ? ` · ${datos.motivo.trim()}` : ''}`,
          };
        }),
      ]);
    });

    revalidatePath('/sgsi/riesgo-residual');
    return {
      ok: true,
      mensaje: `Se cargó el soporte y se registraron ${datos.firmas.length} firmas.`,
      cambios: datos.firmas.length,
    };
  });
}

/// Anula un acta, con motivo obligatorio.
///
/// **Una firma registrada no se retira.** Si se registró por error, se anula el acta entera y se
/// emite otra: corregir una firma en su sitio es reescribir evidencia, y una evidencia que se
/// puede corregir en su sitio no sostiene nada.
export async function anularActaResidual(actaId: number, motivo: string): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    exigirId(actaId, 'el acta');
    if (motivo.trim().length < 10) {
      return { ok: false, mensaje: 'Anular un acta exige un motivo escrito: di qué pasó.' };
    }

    const acta = await prisma.actaRiesgoResidual.findUnique({
      where: { id: actaId },
      select: { codigo: true, estado: true },
    });
    if (!acta) return { ok: false, mensaje: 'El acta no existe.' };
    if (acta.estado === 'ANULADA') {
      return { ok: false, mensaje: `${acta.codigo} ya está anulada.` };
    }

    await prisma.$transaction(async (tx) => {
      await tx.actaRiesgoResidual.update({
        where: { id: actaId },
        data: { estado: 'ANULADA', motivoAnulacion: motivo.trim() },
      });
      await registrar(tx, autor, [
        {
          tabla: 'acta_riesgo_residual',
          registroId: acta.codigo,
          campo: 'estado',
          anterior: acta.estado,
          nuevo: 'ANULADA',
          motivo: motivo.trim(),
        },
      ]);
    });

    revalidatePath('/sgsi/riesgo-residual');
    return { ok: true, mensaje: `${acta.codigo} quedó anulada.`, cambios: 1 };
  });
}
