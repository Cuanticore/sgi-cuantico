'use server';

// app/sgsi/acciones/importar-planes.ts
//
// La importación de FOR-SIG-13 «Plan de Tratamiento y Mejora».
//
// ── ENSAYO POR OMISIÓN ──────────────────────────────────────────────────────────────────
//
// `aplicar` llega en `false` y hay que pedirlo. Una importación crea decenas de filas de un
// golpe y las de más hay que borrarlas a mano una por una; el ensayo cuesta un clic y lo
// evita. Es el mismo criterio del cargador de cursos, y viene de haber estado a punto de
// borrar 298 activos con una carga que se veía bien.
//
// El ensayo NO es una comprobación aparte: corre exactamente el mismo camino, con los mismos
// catálogos y las mismas reglas, y se detiene justo antes de escribir. Una comprobación que
// no es el camino real es una que puede aprobar lo que el camino real rechaza.
//
// ── NINGUNA FILA DESAPARECE ─────────────────────────────────────────────────────────────
//
// Cada fila del archivo sale como plan creado, como duplicado que ya existía, o como rechazo
// con su número de fila y su motivo. La suma cuadra contra el archivo, y eso se le muestra al
// usuario. Una importación que dice «se crearon 40» sin decir qué pasó con las otras 17 obliga
// a comparar a mano contra el Excel, que es el trabajo que la importación venía a evitar.
//
// ── TODO O NADA ─────────────────────────────────────────────────────────────────────────
//
// Las altas van en UNA transacción. A la mitad de 57 filas, un fallo dejaría el archivo medio
// importado y sin forma de saber por dónde iba: reimportar duplicaría lo escrito y no
// reimportar perdería el resto.

import { revalidatePath } from 'next/cache';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import {
  ENCABEZADOS,
  leerFilas,
  normalizar,
  origenImportado,
  type CatalogosImportacion,
  type FilaRechazada,
  type PlanImportado,
} from '@/lib/sgsi/plan-importacion';
import { autorConPermiso, ejecutar, type Resultado } from './sesion';

export interface ResumenImportacion {
  /// Los que se crearían (ensayo) o se crearon.
  creados: { fila: number; codigo: string; accion: string; clase: string; tipo: string }[];
  /// Filas que traían un código que ya existe. No se tocan: importar no es editar, y una
  /// importación que sobrescribe planes existentes puede borrar el avance que alguien
  /// registró a mano esta mañana.
  yaExistian: { fila: number; codigo: string }[];
  rechazadas: FilaRechazada[];
  vacias: number;
  /// Cuántas filas tenía el archivo, para que la suma se pueda verificar a ojo.
  filasLeidas: number;
  aplicado: boolean;
}

export type ResultadoImportacion = Resultado & { resumen?: ResumenImportacion };

/// Encuentra la fila de encabezados buscando «Actividad».
///
/// Se busca en vez de fijarse en la 5 porque el archivo puede venir de la v01 —donde los datos
/// empiezan en la 7— o de la v02, o de alguien que insertó una fila arriba sin pensarlo. Una
/// constante haría que ese archivo importara los encabezados como si fueran un plan.
function encontrarEncabezados(hoja: ExcelJS.Worksheet): number | null {
  for (let f = 1; f <= Math.min(hoja.rowCount, 20); f++) {
    const fila = hoja.getRow(f);
    for (let c = 1; c <= Math.min(hoja.columnCount, 30); c++) {
      const v = fila.getCell(c).value;
      if (typeof v === 'string' && normalizar(v) === 'actividad') return f;
    }
  }
  return null;
}

export async function importarPlanes(
  archivo: ArrayBuffer,
  aplicar = false,
  motivo?: string,
): Promise<ResultadoImportacion> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(archivo);
    // La primera hoja con datos, no una por nombre: el archivo vuelve renombrado más veces de
    // las que uno esperaría —«Copia de», «v3 final»— y rechazarlo por el nombre de la pestaña
    // sería rechazarlo por nada.
    const hoja = libro.worksheets[0];
    if (!hoja) return { ok: false, mensaje: 'El archivo no tiene ninguna hoja.' };

    const filaEnc = encontrarEncabezados(hoja);
    if (filaEnc === null) {
      return {
        ok: false,
        mensaje:
          'No encontré la fila de encabezados: ninguna de las primeras 20 filas tiene una columna «Actividad». ¿Es el formato FOR-SIG-13?',
      };
    }

    const filas: unknown[][] = [];
    for (let f = filaEnc + 1; f <= hoja.rowCount; f++) {
      const fila = hoja.getRow(f);
      filas.push(ENCABEZADOS.map((_, i) => fila.getCell(i + 1).value));
    }

    // ── Catálogos ────────────────────────────────────────────────────────────────────────
    const [controles, cargos, madurez] = await Promise.all([
      // Sólo los aplicables: un control marcado «no aplica» no tiene madurez por restricción,
      // así que un plan que lo mejorara no podría cerrar nunca.
      prisma.control.findMany({
        where: { soa: { not: 'NO' } },
        select: { id: true, codigo: true, nombre: true },
      }),
      prisma.cargoResponsable.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
      prisma.escalaMadurez.findMany({ select: { id: true, nivel: true } }),
    ]);

    const porNombre = new Map<string, number>();
    for (const c of controles) {
      porNombre.set(normalizar(c.nombre), c.id);
      // El desplegable de la plantilla ofrece «A.5.15 — Control de acceso». Se acepta esa
      // forma además del nombre y del código sueltos, o el formato que genera esta misma
      // aplicación sería ilegible para su propio importador — la clase de incoherencia que
      // nadie perdona, y la que aparece en cuanto el usuario usa el desplegable en vez de
      // escribir el código a mano.
      porNombre.set(normalizar(`${c.codigo} — ${c.nombre}`), c.id);
      porNombre.set(normalizar(`${c.codigo} - ${c.nombre}`), c.id);
    }

    const catalogos: CatalogosImportacion = {
      controlesPorCodigo: new Map(controles.map((c) => [c.codigo.toUpperCase(), c.id])),
      controlesPorNombre: porNombre,
      cargosPorNombre: new Map(cargos.map((c) => [normalizar(c.nombre), c.id])),
      madurezPorNivel: new Map(madurez.map((m) => [m.nivel, m.id])),
    };

    const lectura = leerFilas(filas, catalogos, filaEnc + 1);

    // ── Los que ya existen ───────────────────────────────────────────────────────────────
    const codigosDeLaHoja = lectura.validas
      .map((v) => v.codigoExistente)
      .filter((c): c is string => c !== null);
    const existentes =
      codigosDeLaHoja.length === 0
        ? []
        : await prisma.accionPlan.findMany({
            where: { codigo: { in: codigosDeLaHoja } },
            select: { codigo: true },
          });
    const yaEstan = new Set(existentes.map((e) => e.codigo));

    const aCrear: PlanImportado[] = [];
    const yaExistian: { fila: number; codigo: string }[] = [];
    for (const v of lectura.validas) {
      if (v.codigoExistente !== null && yaEstan.has(v.codigoExistente)) {
        yaExistian.push({ fila: v.fila, codigo: v.codigoExistente });
      } else {
        aCrear.push(v);
      }
    }

    const resumenBase = {
      yaExistian,
      rechazadas: lectura.rechazadas,
      vacias: lectura.vacias,
      filasLeidas: filas.length,
    };

    // ── Ensayo ───────────────────────────────────────────────────────────────────────────
    //
    // Los códigos que se muestran son los que se emitirían. Se calculan igual que al escribir,
    // así que el ensayo enseña el código real y no un «(nuevo)» que después no coincide.
    const ultimoActual = (await prisma.accionPlan.findMany({ select: { codigo: true } })).reduce(
      (mayor, a) => {
        const n = /^PT-(\d+)$/.exec(a.codigo);
        return n ? Math.max(mayor, Number(n[1])) : mayor;
      },
      0,
    );
    const codigoDe = (i: number) => `PT-${String(ultimoActual + 1 + i).padStart(3, '0')}`;

    if (!aplicar) {
      return {
        ok: true,
        mensaje:
          `Ensayo: se crearían ${aCrear.length} planes. ` +
          `${yaExistian.length} ya existen y no se tocarían, ${lectura.rechazadas.length} se rechazan, ` +
          `${lectura.vacias} filas en blanco. Nada se escribió.`,
        resumen: {
          ...resumenBase,
          creados: aCrear.map((p, i) => ({
            fila: p.fila,
            codigo: codigoDe(i),
            accion: p.accion,
            clase: p.clase,
            tipo: p.tipo,
          })),
          aplicado: false,
        },
      };
    }

    if (aCrear.length === 0) {
      return {
        ok: true,
        mensaje: `No hay nada que crear. ${lectura.rechazadas.length} filas rechazadas, ${yaExistian.length} ya existían.`,
        resumen: { ...resumenBase, creados: [], aplicado: true },
      };
    }

    // ── Escritura ────────────────────────────────────────────────────────────────────────
    const creados = await prisma.$transaction(async (tx) => {
      // El último código se relee DENTRO de la transacción. El de arriba es para el ensayo;
      // entre que se hizo el ensayo y se pulsó «aplicar» pudo crearse un plan desde la ficha,
      // y reusar aquel número chocaría contra la única de `codigo`.
      const codigos = await tx.accionPlan.findMany({ select: { codigo: true } });
      let ultimo = codigos.reduce((mayor, a) => {
        const n = /^PT-(\d+)$/.exec(a.codigo);
        return n ? Math.max(mayor, Number(n[1])) : mayor;
      }, 0);

      const salida: ResumenImportacion['creados'] = [];

      for (const p of aCrear) {
        ultimo += 1;
        const codigo = `PT-${String(ultimo).padStart(3, '0')}`;
        const origen = origenImportado(p);

        await tx.accionPlan.create({
          data: {
            codigo,
            accion: p.accion,
            descripcion: p.descripcion,
            clase: p.clase,
            tipo: p.tipo,
            controlId: p.controlId,
            origen,
            responsableId: p.responsableId,
            apruebaId: p.apruebaId,
            fechaAprobacion: aFecha(p.fechaAprobacion),
            fechaObjetivo: aFecha(p.fechaObjetivo),
            recursos: p.recursos,
            estado: p.estado,
            avance: p.avance,
            seguimiento: p.seguimiento,
            fechaSeguimiento: aFecha(p.fechaSeguimiento),
            verificacion: p.verificacion,
            observacion: p.observacion,
            madurezAlcanzadaId: p.madurezAlcanzadaId,
            instrumento: p.instrumento,
            riesgoRemanente: p.riesgoRemanente,
            justificacionAceptacion: p.justificacionAceptacion,
            fechaRevisionAceptacion: aFecha(p.fechaRevisionAceptacion),
          },
        });

        await registrarAlta(tx, autor, 'accion_plan', codigo);
        // De dónde salió cada plan queda en la bitácora, con la fila del archivo. Sin eso, un
        // plan importado es indistinguible de uno escrito a mano, y el día que alguien
        // pregunte «¿de dónde salió este?» no hay manera de contestarle.
        await registrar(tx, autor, [
          {
            tabla: 'accion_plan',
            registroId: codigo,
            campo: 'origen',
            anterior: null,
            nuevo: origen,
            motivo:
              motivo?.trim() ||
              `Importado de FOR-SIG-13, fila ${p.fila} del archivo.`,
          },
        ]);

        salida.push({ fila: p.fila, codigo, accion: p.accion, clase: p.clase, tipo: p.tipo });
      }

      return salida;
    });

    revalidatePath('/sgsi/planes');
    revalidatePath('/sgsi/informe-valoracion');

    return {
      ok: true,
      mensaje:
        `Se crearon ${creados.length} planes. ` +
        `${yaExistian.length} ya existían y no se tocaron, ${lectura.rechazadas.length} se rechazaron, ` +
        `${lectura.vacias} filas en blanco.`,
      cambios: creados.length,
      resumen: { ...resumenBase, creados, aplicado: true },
    };
  });
}

/// `AAAA-MM-DD` a `Date` en UTC. Se fija el mediodía UTC y no la medianoche: una columna
/// `@db.Date` guarda sólo la parte de fecha, y con medianoche cualquier conversión a una zona
/// al oeste de Greenwich cae en el día anterior.
function aFecha(valor: string | null): Date | null {
  return valor === null ? null : new Date(`${valor}T12:00:00.000Z`);
}
