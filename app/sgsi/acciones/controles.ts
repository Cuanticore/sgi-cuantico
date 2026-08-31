'use server';

// app/sgsi/acciones/controles.ts
//
// Persisting a control's maturity is not a local edit: efficacy derives from it, the
// residual frequency derives from efficacy, and every risk that control mitigates moves
// with it. So the save and the recalculation are one transaction — a maturity that is
// stored while the risks still hold the old figure is the "cifras contradictorias"
// failure, arriving by a different door.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { correoDeMencion, enviarCorreo } from '@/lib/sgsi/notificaciones';
import { leerDirectorio } from '@/lib/sgsi/directorio';
import { clasificar } from '@/lib/sgsi/clasificar';
import { generarRiesgos } from '@/lib/sgsi/riesgos';
import {
  advertenciaParcialNivelAlto,
  etiquetaSoa,
  validarNuevoSoa,
  type EstadoSoa as EstadoSoaDominio,
} from '@/lib/sgsi/madurez';
import { autorConPermiso, ejecutar, type Resultado } from './sesion';

export interface CambioMadurez {
  codigoControl: string;
  nivel: number;
}

export type TipoEvidencia = 'ENLACE' | 'ARCHIVO' | 'NOTA';

export interface AdvertenciaSoa {
  /// Text to show the user as an advertencia. Never blocks the save by itself: the
  /// justified decision goes ahead, and the que conste quedó en la bitácora.
  texto: string;
}

export interface ResultadoSoa extends Resultado {
  /// Planned exclusions of risks still open: shown before the save, and the action
  /// refuses to EXCLUDE a control that mitigates a residual Alto/Crítico without the
  /// author confirming them in a second call.
  advertencias: string[];
  /// When true the caller must confirm before proceeding (rule 3/4 of the SOA change).
  confirmacionRequerida: boolean;
  /// The affected items the confirmation must acknowledge: open actions or risks.
  afectados: { codigo: string; nombre: string }[];
}

/// Intenta leer el título de una página para proponerlo en el enlace (título editable
/// después). Timeout corto y sin HTML: lo que entra es texto de un <title> sano.
async function sugerirTitulo(url: string): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const tiempo = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; sgi-cuantico/1)' },
    });
    clearTimeout(tiempo);
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 300_000);
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (!m) return null;
    return m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
  } catch {
    return null;
  }
}

/// Batch entry: each line, or each `;`-separated fragment, becomes one evidence entry.
/// The prototype also splits on `|`, so that separator is honoured too.
export async function agregarEvidencias(
  codigoControl: string,
  tipo: TipoEvidencia,
  texto: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('evidencia:escribir');

    const entradas = texto
      .split(/[\n;|]+/)
      .map((t) => t.trim())
      // Sin HTML nunca: lo que se guarda es texto y el render del cliente decide el
      // formato (negrita `**`, cursiva `*`, lista `-`, cita `>`), nunca lo pegado.
      .map((t) => t.replace(/<[^>]*>/g, '').slice(0, 2000))
      .filter(Boolean);

    if (entradas.length === 0) {
      return { ok: false, mensaje: 'Escribí al menos una evidencia.' };
    }

    // Un enlace sin título intenta leer el de la página: es una propuesta, no un texto
    // sagrado — el título queda editable en la entrada.
    const entradasConTitulo = await Promise.all(
      entradas.map(async (t) => {
        if (tipo !== 'ENLACE' || !t.startsWith('{')) return t;
        try {
          const d = JSON.parse(t);
          if (typeof d.url !== 'string' || (typeof d.titulo === 'string' && d.titulo !== '')) return t;
          const titulo = (await sugerirTitulo(d.url)) ?? d.url;
          return JSON.stringify({ url: d.url, titulo });
        } catch {
          return t;
        }
      }),
    );

    const control = await prisma.control.findUnique({
      where: { codigo: codigoControl },
      include: { evidencias: true },
    });
    if (!control) return { ok: false, mensaje: `No existe el control ${codigoControl}.` };

    // Menciones `@correo` a usuarios del directorio: quedan en la bitácora como event
    // de notificación (es el canal que un conector de correo futuro puede leer) y la
    // nota se resalta en la pantalla del mencionado.
    const mencionada = [
      ...new Set(
        (entradasConTitulo.join(' ').match(/@[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []).map((m) =>
          m.toLowerCase(),
        ),
      ),
    ];
    // También `@nombre` (sin dominio): se resuelve contra el directorio — @diego o
    // @diego.munoz son el correo de Diego, no un comentario suelto.
    const directorio = await leerDirectorio();
    for (const token of new Set((entradasConTitulo.join(' ').match(/@[\w.+-]{2,40}/gi) ?? []).map((t) => t.slice(1)))) {
      const persona = directorio.find((p) => {
        const local = p.correo.split('@')[0].toLowerCase();
        const nombre = p.nombre.toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]/gu, '');
        const tokenLimpio = token.toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]/gu, '');
        return local === token.toLowerCase() || nombre === tokenLimpio;
      });
      if (persona && !mencionada.includes(persona.correo.toLowerCase())) {
        mencionada.push(persona.correo.toLowerCase());
      }
    }

    await prisma.$transaction(async (tx) => {
      let orden = control.evidencias.length;
      for (const t of entradasConTitulo) {
        await tx.evidencia.create({
          data: { controlId: control.id, tipo, texto: t, esBase: false, orden: orden++, creadaPor: autor },
        });
      }
      await registrar(
        tx,
        autor,
        entradasConTitulo.map((t) => ({
          tabla: 'evidencia',
          registroId: control.codigo,
          campo: `evidencia (${tipo.toLowerCase()})`,
          anterior: null,
          nuevo: t,
        })),
      );
      await registrar(
        tx,
        autor,
        mencionada.map((m) => ({
          tabla: 'mencion',
          registroId: control.codigo,
          campo: 'notificación de mención',
          anterior: null,
          nuevo: m,
          motivo: 'mencionado en una nota de evidencia',
        })),
      );
    });

    revalidatePath('/sgsi/controles');
    revalidatePath('/sgsi');

    // Notificación por correo de cada mención. Fuera de la transacción: la nota ya
    // quedó guardada (el dato es primerísimo) y un fallo de SMTP no debe revertirla —
    // se registra qué envió y qué no, para que un auditor lo vea.
    const notificaciones: string[] = [];
    const cuerpo = entradasConTitulo.join('\n');
    for (const m of mencionada) {
      const contenido = correoDeMencion(autor, codigoControl, control.nombre, cuerpo);
      const r = await enviarCorreo(m, contenido.asunto, contenido.texto, contenido.html);
      await registrar(
        { bitacora: prisma.bitacora },
        autor,
        [
          {
            tabla: 'mencion',
            registroId: codigoControl,
            campo: r.enviado ? 'notificación enviada' : 'notificación fallida',
            anterior: null,
            nuevo: m,
            motivo: r.detalle,
          },
        ],
      );
      notificaciones.push(r.enviado ? m : `${m} (${r.detalle})`);
    }

    return {
      ok: true,
      mensaje: `Se agregaron ${entradas.length} ${entradas.length === 1 ? 'evidencia' : 'evidencias'} a ${codigoControl}.${
        mencionada.length > 0
          ? ` Menciones: ${notificaciones.join(', ')}.`
          : ''
      }`,
      cambios: entradas.length,
    };
  });
}

/// The base evidence — the text that justified the rating, or the non-applicability
/// justification for a control that does not apply — cannot be removed. It is the record
/// the Committee approved, not an attachment.
export async function quitarEvidencia(id: number, motivo: string): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('evidencia:escribir');

    if (!motivo.trim()) {
      return { ok: false, mensaje: 'Quitar una evidencia necesita un motivo: queda en la bitácora.' };
    }

    const evidencia = await prisma.evidencia.findUnique({
      where: { id },
      include: { control: true },
    });
    if (!evidencia) return { ok: false, mensaje: 'Esa evidencia ya no existe.' };
    if (evidencia.esBase) {
      return {
        ok: false,
        mensaje:
          'La evidencia base de la evaluación no se puede quitar: es la que sustenta el nivel ante un auditor.',
      };
    }

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: 'evidencia',
          registroId: evidencia.control?.codigo ?? String(evidencia.registroId ?? evidencia.controlId ?? ''),
          campo: 'evidencia retirada',
          anterior: evidencia.texto,
          nuevo: null,
          motivo,
        },
      ]);
      // La baja es lógica para TODAS las evidencias (con deshacer): la fila sobrevive
      // con `activo=false` — una nota retirada sigue explicando qué se dijo, y un anexo
      // sostiene la auditoría de certificación. El deshacer la revive.
      await tx.evidencia.update({ where: { id }, data: { activo: false } });
    });

    revalidatePath('/sgsi/controles');
    return { ok: true, mensaje: 'Se retiró la evidencia.', cambios: 1 };
  });
}

/// Verificación de enlaces rotos del control: cada ENLACE activo se consulta (HEAD,
/// timeout corto) y se devuelve el veredicto por id. No persiste nada — es un control
/// puntual; una verificación programada puede colgarse de la misma función.
export async function verificarEnlacesActivos(
  codigoControl: string,
): Promise<Resultado & { resultados?: { id: number; ok: boolean; detalle: string }[] }> {
  return ejecutar(async () => {
    await autorConPermiso('sgsi:ver');
    const control = await prisma.control.findUnique({
      where: { codigo: codigoControl },
      include: {
        evidencias: { where: { tipo: 'ENLACE', activo: true }, select: { id: true, texto: true } },
      },
    });
    if (!control) return { ok: false, mensaje: `No existe el control ${codigoControl}.` };

    const resultados: { id: number; ok: boolean; detalle: string }[] = [];
    for (const e of control.evidencias) {
      let url = e.texto;
      try {
        const d = JSON.parse(e.texto);
        if (typeof d.url === 'string') url = d.url;
      } catch {
        // Texto suelto: se conserva como URL.
      }
      try {
        const ctl = new AbortController();
        const tiempo = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url, {
          method: 'HEAD',
          signal: ctl.signal,
          redirect: 'follow',
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; sgi-cuantico/1)' },
        });
        clearTimeout(tiempo);
        resultados.push({ id: e.id, ok: r.ok, detalle: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status}` });
      } catch {
        resultados.push({ id: e.id, ok: false, detalle: 'sin respuesta (timeout o error de red)' });
      }
    }
    const rotos = resultados.filter((r) => !r.ok).length;
    return {
      ok: true,
      mensaje: `Verifiqué ${resultados.length} ${resultados.length === 1 ? 'enlace' : 'enlaces'} — ${rotos} ${rotos === 1 ? 'roto' : 'rotos'}.`,
      cambios: 0,
      resultados,
    };
  });
}

/// Deshacer la baja lógica: la evidencia vuelve a estar activa (misma fila, misma
/// bitácora — el retiro queda como evento histórico y la restauración como el siguiente).
export async function restaurarEvidencia(id: number): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('evidencia:escribir');

    const evidencia = await prisma.evidencia.findUnique({
      where: { id },
      include: { control: true },
    });
    if (!evidencia) return { ok: false, mensaje: 'Esa evidencia ya no existe.' };
    if (evidencia.activo) {
      return { ok: false, mensaje: 'La evidencia ya está activa: nada que restaurar.' };
    }

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: 'evidencia',
          registroId: evidencia.control?.codigo ?? String(evidencia.registroId ?? evidencia.controlId ?? ''),
          campo: 'evidencia restaurada',
          anterior: 'retirada',
          nuevo: 'vigente',
          motivo: 'Se deshizo la baja',
        },
      ]);
      await tx.evidencia.update({ where: { id }, data: { activo: true } });
    });

    revalidatePath('/sgsi/controles');
    return { ok: true, mensaje: 'Se restauró la evidencia.', cambios: 1 };
  });
}

/// Sets the TARGET maturity of one control.
///
/// The target is the Committee's commitment, not an assessment: it is what «brecha» and
/// «cumple objetivo» are measured against on the Controles screen, and the workbook carries
/// it as column I of «4. Controles y Madurez». It is deliberately a separate action from
/// `guardarMadurez` — raising a target is a decision, lowering it to meet the current level
/// is how a gap disappears without anything improving, and the two must be distinguishable
/// in the bitácora.
///
/// It does NOT recalculate risks: residual risk derives from the CURRENT level, never from
/// the target. Recalculating here would suggest a commitment changes exposure.
export async function guardarMadurezObjetivo(
  codigoControl: string,
  nivel: number | null,
  motivo?: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('parametrizacion:escribir');

    const control = await prisma.control.findUnique({
      where: { codigo: codigoControl },
      include: { objetivo: true },
    });
    if (!control) throw new Error(`No existe el control ${codigoControl}`);
    if (control.soa === 'NO') {
      return {
        ok: false,
        mensaje: `El control ${codigoControl} no aplica, así que no lleva objetivo de madurez.`,
      };
    }

    let objetivoId: number | null = null;
    if (nivel !== null) {
      const fila = await prisma.escalaMadurez.findUnique({ where: { nivel } });
      if (!fila) throw new Error(`Nivel de madurez inválido: ${nivel}`);
      objetivoId = fila.id;
    }

    const anterior = control.objetivo ? `L${control.objetivo.nivel}` : null;
    const nuevo = nivel === null ? null : `L${nivel}`;
    if (anterior === nuevo) return { ok: true, mensaje: 'El objetivo no cambió.', cambios: 0 };

    await prisma.$transaction(async (tx) => {
      await registrar(tx, autor, [
        {
          tabla: 'control',
          registroId: control.codigo,
          campo: 'madurez objetivo',
          anterior,
          nuevo,
          motivo: motivo ?? null,
        },
      ]);
      await tx.control.update({ where: { id: control.id }, data: { objetivoId } });
    });

    revalidatePath('/sgsi/controles');
    revalidatePath('/sgsi/planes');
    revalidatePath('/sgsi');

    return {
      ok: true,
      mensaje:
        nuevo === null
          ? `Se quitó el objetivo de ${control.codigo}. Sin objetivo no hay brecha que medir.`
          : `Objetivo de ${control.codigo}: ${nuevo}. La brecha y «cumple objetivo» se recalculan contra este nivel; el riesgo residual no cambia, porque deriva de la madurez actual.`,
      cambios: 1,
    };
  });
}

/// Saves one or many maturity levels and recalculates the risks they affect.
export async function guardarMadurez(
  cambios: CambioMadurez[],
  motivo?: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    if (cambios.length === 0) return { ok: true, mensaje: 'No había cambios.', cambios: 0 };

    const niveles = await prisma.escalaMadurez.findMany();
    const porNivel = new Map(niveles.map((n) => [n.nivel, n.id]));

    const escritos = await prisma.$transaction(async (tx) => {
      let total = 0;

      for (const c of cambios) {
        const control = await tx.control.findUnique({
          where: { codigo: c.codigoControl },
          include: { actual: true },
        });
        if (!control) throw new Error(`No existe el control ${c.codigoControl}`);

        // A control that does not apply has no level at all: its maturity is null by
        // constraint, and letting a zero in is what pollutes every average.
        if (control.soa === 'NO') {
          throw new Error(
            `El control ${c.codigoControl} no aplica, así que no lleva nivel de madurez.`,
          );
        }

        const actualId = porNivel.get(c.nivel);
        if (actualId === undefined) throw new Error(`Nivel de madurez inválido: ${c.nivel}`);

        total += await registrar(tx, autor, [
          {
            tabla: 'control',
            registroId: control.codigo,
            campo: 'madurez actual',
            anterior: control.actual ? `L${control.actual.nivel}` : null,
            nuevo: `L${c.nivel}`,
            motivo: motivo ?? null,
          },
        ]);

        await tx.control.update({ where: { id: control.id }, data: { actualId } });
      }

      return total;
    });

    // Efficacy changed, so the residual side of every affected risk is stale. The
    // generator is the single writer of those columns.
    const diagnostico = await generarRiesgos(prisma);

    revalidatePath('/sgsi');
    revalidatePath('/sgsi/controles');
    revalidatePath('/sgsi/matrices');
    revalidatePath('/sgsi/planes');
    revalidatePath('/sgsi/inventario');
    revalidatePath('/');

    const nota =
      diagnostico.residualSinCalcular > 0
        ? ` El residual sigue sin calcular en ${diagnostico.residualSinCalcular} riesgos: falta asignar la relevancia de los pares control-amenaza.`
        : '';

    return {
      ok: true,
      mensaje: escritos === 0
        ? 'No había cambios que guardar.'
        : `Se guardaron ${escritos} cambios de madurez y se recalcularon ${diagnostico.riesgosGenerados} riesgos.${nota}`,
      cambios: escritos,
    };
  });
}

/// Changes the SOA state of one control (ISO 27001 6.1.3 d) and everything that moves
/// with it:
///
///   1. 'no' and 'parcial' demand a written justification — the auditor asks why an
///      exclusion or a partial scope is what it is, and the interface will refuse to
///      store a change without one.
///   2. 'parcial' on a control rated L4/L5 is warned about: partial scope coverage
///      rarely sustains those levels in an audit. A warning, not a veto.
///   3. Moving a control to 'no' while it has open treatment actions requires an
///      explicit confirmation that names the actions and what happens to them.
///   4. Moving a control to 'no' while it mitigates threats with residual Alto/Crítico
///      shows the impact and requires the author to confirm it.
///   5. Only SIG-Seguridad may edit. Readers of SIG-Propietarios / SIG-Auditoría rely
///      on the interface disabling the selector; this action enforces the same boundary.
///
/// The transition to 'no' also clears the maturity level: a control that does not apply
/// has null levels by the model's own constraint (see `guardarMadurez` above), and the
/// seed invariant asserts the same. The levels return when the control is applicable
/// again.
export async function cambiarEstadoSoa(
  codigoControl: string,
  estado: EstadoSoaDominio,
  justificacion: string,
  motivo?: string,
  confirmar = false,
): Promise<ResultadoSoa> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    const errores = validarNuevoSoa(estado, justificacion);
    if (errores.length > 0) {
      return {
        ok: false,
        mensaje: errores[0],
        advertencias: [],
        confirmacionRequerida: false,
        afectados: [],
      };
    }

    const control = await prisma.control.findUnique({
      where: { codigo: codigoControl },
      include: { actual: true, objetivo: true },
    });
    if (!control) throw new Error(`No existe el control ${codigoControl}`);

    const soaPrevio = (control.soa === 'PARCIAL' ? 'parcial' : control.soa === 'NO' ? 'no' : 'si') as EstadoSoaDominio;
    if (soaPrevio === estado) {
      return {
        ok: true,
        mensaje: 'El estado de la declaración de aplicabilidad no cambió.',
        advertencias: [],
        confirmacionRequerida: false,
        afectados: [],
      };
    }

    const afectados: { codigo: string; nombre: string }[] = [];
    const advertencias: string[] = [];

    // Rule 2: parcial over L4/L5 deserves a warning, per the audit reasoning.
    if (estado === 'parcial') {
      const nivelActual = control.actual?.nivel ?? null;
      if (advertenciaParcialNivelAlto(nivelActual)) {
        advertencias.push(
          `El control está calificado en L${nivelActual}: una cobertura parcial del alcance rara vez sostiene ese nivel en auditoría. ` +
            'Revisá si la madurez debería reflejar la parte no cubierta.',
        );
      }
    }

    // Rule 3: open treatment actions on an exclusion, requiring confirmation.
    if (estado === 'no') {
      const accionesAbiertas = await prisma.accionPlan.findMany({
        where: { controlId: control.id, activa: true, estado: { notIn: ['CERRADA', 'CANCELADA'] } },
        select: { codigo: true, accion: true },
        orderBy: { codigo: 'asc' },
      });
      if (accionesAbiertas.length > 0 && !confirmar) {
        afectados.push(...accionesAbiertas.map((a) => ({ codigo: a.codigo, nombre: a.accion })));
        return {
          ok: false,
          mensaje:
            `El control tiene ${accionesAbiertas.length} ${accionesAbiertas.length === 1 ? 'acción abierta' : 'acciones abiertas'} en el plan de tratamiento. ` +
            'Confirmá qué ocurre con ellas antes de excluirlo.',
          advertencias,
          confirmacionRequerida: true,
          afectados,
        };
      }

      // Rule 4: threats the control mitigates whose residual risk is Alto/Crítico.
      const umbrales = await prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } });
      const pares = await prisma.controlAmenaza.findMany({
        where: { controlId: control.id },
        select: {
          amenaza: {
            select: {
              codigo: true,
              nombre: true,
              riesgos: {
                where: { obsoleto: false, excluidoManual: false },
                select: { riesgoResidual: true },
              },
            },
          },
        },
      });

      const amenazas = pares
        .map((p) => ({
          codigo: p.amenaza.codigo,
          nombre: p.amenaza.nombre,
          conResidualAlto: p.amenaza.riesgos.some(
            (r) =>
              r.riesgoResidual !== null &&
              ['Crítico', 'Alto'].includes(clasificar(r.riesgoResidual.toString(), umbrales) ?? ''),
          ),
        }))
        .filter((a) => a.conResidualAlto);
      if (amenazas.length > 0 && !confirmar) {
        afectados.push(...amenazas.filter((a) => !afectados.some((x) => x.codigo === a.codigo)).map((a) => ({ codigo: a.codigo, nombre: a.nombre })));
        advertencias.push(
          `Este control mitiga amenazas con riesgo residual Alto o Crítico: ${amenazas.map((a) => `${a.codigo} ${a.nombre}`).join(' · ')}. ` +
            'Excluirlo degrada la eficacia contra esas amenazas y eleva su riesgo residual.',
        );
        return {
          ok: false,
          mensaje: 'La exclusión cambia el riesgo residual de amenazas de alto impacto. Confirmá la advertencia para continuar.',
          advertencias,
          confirmacionRequerida: true,
          afectados,
        };
      }
    }

    // Validation passed (or was confirmed). Record and mutate in one transaction.
    const nuevoSoa = estado === 'parcial' ? 'PARCIAL' : estado === 'no' ? 'NO' : 'SI';
    const justificacionNueva = estado === 'si' ? null : justificacion.trim();

    await prisma.$transaction(async (tx) => {
      const entradas: Parameters<typeof registrar>[2] = [
        {
          tabla: 'control',
          registroId: control.codigo,
          campo: 'aplicación SOA',
          anterior: etiquetaSoa(soaPrevio),
          nuevo: etiquetaSoa(estado),
          motivo: motivo ?? null,
        },
        {
          tabla: 'control',
          registroId: control.codigo,
          campo: 'justificación SOA',
          anterior: control.justificacionSoa ?? null,
          nuevo: justificacionNueva,
          motivo: motivo ?? null,
        },
      ];
      if (estado === 'no' && (control.actualId !== null || control.objetivoId !== null)) {
        if (control.actualId !== null) {
          entradas.push({
            tabla: 'control',
            registroId: control.codigo,
            campo: 'madurez actual',
            anterior: control.actual ? `L${control.actual.nivel}` : null,
            nuevo: null,
            motivo: 'Exclusión: el control no aplica y queda sin nivel por la regla del modelo.',
          });
        }
        if (control.objetivoId !== null) {
          entradas.push({
            tabla: 'control',
            registroId: control.codigo,
            campo: 'madurez objetivo',
            anterior: control.objetivo ? `L${control.objetivo.nivel}` : null,
            nuevo: null,
            motivo: 'Exclusión: el control no aplica y sin madurez no hay objetivo que medir.',
          });
        }
      }
      await registrar(tx, autor, entradas);

      await tx.control.update({
        where: { id: control.id },
        data: {
          soa: nuevoSoa,
          justificacionSoa: justificacionNueva,
          soaActualizadoPor: autor,
          soaActualizadoEn: new Date(),
          // Exclusion clears the levels; the invariant of the model holds again.
          actualId: estado === 'no' ? null : control.actualId,
          objetivoId: estado === 'no' ? null : control.objetivoId,
        },
      });
    });

    // Something that mitigates (or stops mitigating) threats may move residual risks.
    // The change itself is committed and audited; a failure to REGENERATE must not undo
    // that, nor may the screen read it as a failed save. The author sees the change
    // succeeded and is told the residual side needs a re-run, rather than a false error
    // on an applied change.
    let riesgosPendientes = false;
    try {
      await generarRiesgos(prisma);
    } catch (error) {
      console.error('[sgsi] cambio SOA aplicado; falló la regeneración de riesgos', error);
      riesgosPendientes = true;
    }

    revalidatePath('/sgsi');
    revalidatePath('/sgsi/controles');
    revalidatePath('/sgsi/planes');
    revalidatePath('/sgsi/matrices');
    revalidatePath('/sgsi/inventario');
    revalidatePath('/');

    const nota =
      advertencias.length > 0 ? ` Advertencia: ${advertencias[0]}` : '';
    const notaRiesgos = riesgosPendientes
      ? ' La regeneración de riesgos no se completó: los residuales quedan como están hasta que cualquier cambio de madurez vuelva a generarlos.'
      : '';
    const mensajeBase =
      estado === 'no'
        ? `El control ${codigoControl} queda excluido de la declaración de aplicabilidad. Sin madurez, no entra en ningún indicador, pero sigue visible en la grilla.`
        : estado === 'parcial'
          ? `El control ${codigoControl} queda parcialmente aplicable: cuenta como aplicable en todos los indicadores.`
          : `El control ${codigoControl} vuelve a ser aplicable en su totalidad.`;
    const justo = estado === 'si' ? '' : ` Justificación registrada${motivo ? ' y motivo en bitácora' : ''}.`;

    return {
      ok: true,
      mensaje: mensajeBase + justo + nota + notaRiesgos,
      advertencias,
      confirmacionRequerida: false,
      afectados: [],
    };
  });
}
