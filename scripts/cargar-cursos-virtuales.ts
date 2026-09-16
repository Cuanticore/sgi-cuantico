// scripts/cargar-cursos-virtuales.ts
//
// Sube los paquetes SCORM de los dos cursos virtuales y crea la obligación de la inducción.
//
//   npx tsx scripts/cargar-cursos-virtuales.ts <Induccion.zip> <CodigoSeguro.zip> [--aplicar]
//
// ── POR QUÉ ESTO ES UN SCRIPT Y NO UNA MIGRACIÓN SQL ────────────────────────────────────
//
// Se pidió «una migración para subir los zip». Un `.sql` podría hacerlo —`archivo_scorm`
// guarda los bytes en la base y se pueden escribir como literal hexadecimal— y sería la
// forma equivocada, por dos razones que no son de estilo:
//
//   1. **SE SALTARÍA LA VALIDACIÓN ENTERA.** `guardarPaquete` analiza el manifiesto, exige
//      una edición soportada, comprueba que el SCO de entrada exista dentro del zip,
//      clasifica el paquete como AUTOCONTENIDO o DESPACHO y extrae los dominios externos con
//      los que después se arma su CSP. Un INSERT no hace nada de eso: metería un paquete que
//      nadie comprobó, y la primera noticia sería una persona frente a un curso que no abre.
//
//   2. **Una migración corre una vez y no se puede mirar antes.** Este script tiene `--aplicar`:
//      sin esa bandera dice exactamente qué haría y no escribe nada.
//
// Lo que sí quedó como migración es el CONTENIDO —`20260915220000_cursos_virtuales`—, porque
// eso es una fila de texto sin nada que validar. Los bytes van por acá.
//
// ── LA OBLIGACIÓN: LO QUE DECIDE Y POR QUÉ SE DECLARA ACÁ ───────────────────────────────
//
// Una obligación decide a quién se le cobra y **desde cuándo**, y ese «desde cuándo» es el
// piso de los periodos: una fecha de inicio mal puesta le cobra a toda la organización un
// curso del trimestre pasado y llena la bandeja de vencidos el primer día. Por eso los
// valores están arriba, con nombre, y no escondidos en el cuerpo.

import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { guardarPaquete } from '../lib/sig/scorm-paquete';

const prisma = new PrismaClient();

/// Los parámetros de la obligación de la inducción. **Cambiarlos acá es la forma de
/// cambiarla**: son las cuatro decisiones que definen a quién le llega y cuándo vence.
const OBLIGACION = {
  /// Todo el personal. `TODOS` es el grupo derivado: pertenece toda persona activa, así que
  /// no hay que mantener una lista y nadie queda afuera por un alta que olvidó marcarla.
  grupoCodigo: 'TODOS',
  /// ANUAL y no «una sola vez»: la inducción se repite como reinducción, que es lo que
  /// PRO-TAL-01 pide. Si se quiere sólo al vincularse, esto es lo que hay que cambiar.
  periodicidad: 'ANUAL' as const,
  /// Desde HOY, no desde enero. Anclarla al inicio del año le cobraría a todo el mundo un
  /// periodo que ya pasó, con su fecha límite vencida, el mismo día que se active.
  fechaInicio: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
  /// Un mes para hacer un curso de inducción.
  plazoDias: 30,
  diasAviso: 7,
  /// A.6.3 · Concienciación, educación y formación en seguridad de la información.
  controlAnexoA: 'A.6.3',
};

const MAX_ZIP_MB = 50;

interface Objetivo {
  /// Lo que el título del contenido tiene que contener para reconocerlo. No el título
  /// exacto: el de código seguro se creó desde la aplicación y no sé cómo quedó escrito.
  patron: RegExp;
  etiqueta: string;
  zip: string;
}

async function main(): Promise<void> {
  const [zipInduccion, zipCodigo] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const aplicar = process.argv.includes('--aplicar');

  if (!zipInduccion || !zipCodigo) {
    console.error(
      'Uso: npx tsx scripts/cargar-cursos-virtuales.ts <Induccion.zip> <CodigoSeguro.zip> [--aplicar]',
    );
    process.exit(2);
  }

  if (!aplicar) {
    console.log('ENSAYO · no se escribe nada. Agregá --aplicar para ejecutar.\n');
  }

  const objetivos: Objetivo[] = [
    { patron: /inducci/i, etiqueta: 'Inducción', zip: zipInduccion },
    { patron: /c(o|ó)digo seguro|codificaci(o|ó)n segura|desarrollo seguro/i, etiqueta: 'Código seguro', zip: zipCodigo },
  ];

  // ── 1 · los paquetes ──────────────────────────────────────────────────────────────────
  for (const o of objetivos) {
    const candidatos = await prisma.contenidoSig.findMany({
      where: { tipo: 'CURSO_VIRTUAL', activo: true },
      select: { id: true, codigo: true, titulo: true },
    });
    const contenido = candidatos.find((c) => o.patron.test(c.titulo));

    if (!contenido) {
      console.log(
        `✗ ${o.etiqueta}: no encontré un curso virtual cuyo título coincida. ` +
          `Hay ${candidatos.length}: ${candidatos.map((c) => `${c.codigo} «${c.titulo}»`).join(', ') || '(ninguno)'}. ` +
          'Corré antes la migración 20260915220000_cursos_virtuales.',
      );
      continue;
    }

    const zip = readFileSync(o.zip);
    if (!aplicar) {
      console.log(`· ${o.etiqueta}: subiría ${o.zip} (${zip.length} bytes) a ${contenido.codigo} «${contenido.titulo}».`);
      continue;
    }

    // El MISMO camino que usa la pantalla: analiza y sólo entonces escribe. Un paquete que
    // no pasa no deja filas a medio escribir.
    const r = await guardarPaquete(contenido.id, zip, null, MAX_ZIP_MB);
    if (!r.ok) {
      console.log(`✗ ${o.etiqueta}: el paquete NO pasó — ${r.motivo}`);
      continue;
    }
    console.log(`✓ ${o.etiqueta}: paquete v${r.guardado.version} cargado en ${contenido.codigo}.`);
  }

  // ── 2 · la obligación de la inducción ─────────────────────────────────────────────────
  const induccion = (
    await prisma.contenidoSig.findMany({
      where: { tipo: 'CURSO_VIRTUAL', activo: true },
      select: { id: true, codigo: true, titulo: true },
    })
  ).find((c) => /inducci/i.test(c.titulo));

  if (!induccion) {
    console.log('✗ Obligación: no encontré el curso de inducción.');
    return;
  }

  const grupo = await prisma.grupoInteres.findUnique({
    where: { codigo: OBLIGACION.grupoCodigo },
    select: { id: true, nombre: true },
  });
  if (!grupo) {
    console.log(`✗ Obligación: no existe el grupo «${OBLIGACION.grupoCodigo}».`);
    return;
  }

  // El responsable del seguimiento es OBLIGATORIO y no se inventa: sin él la obligación no
  // tiene a quién reclamarle. Se toma el líder del SIG por su cargo, y si no está, se dice.
  const responsable = await prisma.persona.findFirst({
    where: { activa: true, cargo: { nombre: { contains: 'SIG' } } },
    select: { id: true, nombre: true },
  });
  if (!responsable) {
    console.log(
      '✗ Obligación: no encontré una persona activa cuyo cargo mencione «SIG» para el ' +
        'seguimiento. Asignalo a mano desde Obligaciones, o ajustá este script.',
    );
    return;
  }

  const yaExiste = await prisma.obligacion.findFirst({
    where: { contenidoId: induccion.id, alcanceGrupoInteresId: grupo.id, activa: true },
    select: { id: true },
  });
  if (yaExiste) {
    console.log(`· Obligación: ya existe una para ${induccion.codigo} sobre «${grupo.nombre}». No se crea otra.`);
    return;
  }

  const resumen =
    `${induccion.codigo} «${induccion.titulo}» → grupo «${grupo.nombre}», ${OBLIGACION.periodicidad}, ` +
    `desde ${OBLIGACION.fechaInicio.toISOString().slice(0, 10)}, plazo ${OBLIGACION.plazoDias} días, ` +
    `aviso ${OBLIGACION.diasAviso} días antes, seguimiento: ${responsable.nombre}`;

  if (!aplicar) {
    console.log(`· Obligación: crearía ${resumen}.`);
    return;
  }

  await prisma.obligacion.create({
    data: {
      contenidoId: induccion.id,
      alcance: 'GRUPO_INTERES',
      alcanceGrupoInteresId: grupo.id,
      periodicidad: OBLIGACION.periodicidad,
      fechaInicio: OBLIGACION.fechaInicio,
      plazoDias: OBLIGACION.plazoDias,
      diasAviso: OBLIGACION.diasAviso,
      notificar: true,
      responsableSeguimientoId: responsable.id,
      controlAnexoA: OBLIGACION.controlAnexoA,
      anclaje: 'ANCLADA',
      activa: true,
    },
  });
  console.log(`✓ Obligación creada: ${resumen}.`);
  console.log(
    '\nLas asignaciones NO se crean acá: las genera el proceso que ya existe para eso, con ' +
      'el piso de periodos que corresponde a cada persona.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
