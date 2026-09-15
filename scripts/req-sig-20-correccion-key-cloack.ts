// scripts/req-sig-20-correccion-key-cloack.ts
//
// REQ-SIG-20 §14 criterio 2 · la corrección de TEC-APP-0016 «Key Cloack» en la base de
// desarrollo, y la regeneración de riesgos que sigue.
//
// ── La decisión que este script aplica ──────────────────────────────────────────────────
//
// El dueño del inventario decidió (2026-09-15): para TEC-APP-0016 manda el TIPO que trae el
// libro V19, `[SW]` Aplicaciones (software). El subtipo que trae el mismo libro, `[dir]`
// Servicio de directorio, pertenece a `[S]` y no encaja bajo `[SW]`, así que se reemplaza por
// la elección documentada en `lib/sgsi/consolidado-lectura.ts` — `SUBTIPO_ELEGIDO_PARA` —:
// `[std]` Estándar (off the shelf).
//
// El importador (`consolidado-lectura.ts`) ya quedó al día para las cargas futuras del libro.
// Este script es la otra mitad: la fila que YA está en la base de desarrollo desde antes de
// ese cambio, y que una reimportación no toca porque el código del activo ya existe.
//
// **`TEC-AUX-0001` no aparece acá.** Su caso no se tocó — sigue con la regla original, sin
// cambios — y por eso este script ni lo lee ni lo escribe.
//
// ── Cómo se corre ────────────────────────────────────────────────────────────────────────
//
//   npx tsx scripts/req-sig-20-correccion-key-cloack.ts            ← ENSAYO, no escribe
//   npx tsx scripts/req-sig-20-correccion-key-cloack.ts --aplicar  ← escribe y regenera
//
// El ensayo es el modo por defecto a propósito: esto cambia la clasificación MAGERIT de un
// activo, y de esa clasificación depende qué amenazas —y por lo tanto qué riesgos— existen
// para él.
//
// ── La bitácora ──────────────────────────────────────────────────────────────────────────
//
// Invariante 7: va en la misma transacción que el hecho. Dos filas, una por campo (`tipoId` y
// `subtipoId`), con el mismo `motivo` — el mismo patrón de `app/sgsi/acciones/activos.ts` en
// `guardarDatosGenerales`, que este script no puede invocar directamente: es un server action
// que exige una sesión de next-auth y `revalidatePath`, ninguno de los dos disponibles fuera
// de una petición HTTP real.

import { prisma } from '../lib/db';
import { registrar } from '../lib/sgsi/bitacora';
import { generarRiesgos } from '../lib/sgsi/riesgos';

const CODIGO = 'TEC-APP-0016';
const USUARIO = 'REQ-SIG-20 §14 criterio 2 · corrección de clasificación';
const MOTIVO =
  'REQ-SIG-20 §14 criterio 2 · decisión del dueño del inventario (2026-09-15): manda el ' +
  'TIPO del libro, [SW] — Keycloak es software —, y como [dir] no encaja bajo [SW], el ' +
  'subtipo pasa a [std] (elección documentada, no dato del libro). Ver ' +
  'lib/sgsi/consolidado-lectura.ts, SUBTIPO_ELEGIDO_PARA.';

const TIPO_ESPERADO_ANTES = '[S]';
const SUBTIPO_ESPERADO_ANTES = '[dir]';
const TIPO_OBJETIVO = '[SW]';
const SUBTIPO_OBJETIVO = '[std]';

const APLICAR = process.argv.includes('--aplicar');

function seccion(titulo: string): void {
  console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0, 76 - titulo.length))}`);
}

async function main(): Promise<void> {
  console.log(`REQ-SIG-20 §14 criterio 2 · corrección de ${CODIGO} · ${APLICAR ? 'APLICAR' : 'ENSAYO'}`);

  seccion('Paso 1 · estado actual');
  const activo = await prisma.activo.findFirst({
    where: { codigo: CODIGO },
    include: { tipo: true, subtipo: true },
  });
  if (!activo) throw new Error(`No existe el activo ${CODIGO} en esta base.`);

  console.log(`   ${CODIGO} «${activo.nombre}»: tipo ${activo.tipo.codigo} · subtipo ${activo.subtipo.codigo}`);

  if (activo.tipo.codigo === TIPO_OBJETIVO && activo.subtipo.codigo === SUBTIPO_OBJETIVO) {
    console.log('\n   ya está en el estado objetivo · nada que corregir en el activo');
  } else if (activo.tipo.codigo !== TIPO_ESPERADO_ANTES || activo.subtipo.codigo !== SUBTIPO_ESPERADO_ANTES) {
    throw new Error(
      `El estado actual (${activo.tipo.codigo}/${activo.subtipo.codigo}) no es el esperado ` +
        `antes de esta corrección (${TIPO_ESPERADO_ANTES}/${SUBTIPO_ESPERADO_ANTES}), ni el ` +
        `objetivo (${TIPO_OBJETIVO}/${SUBTIPO_OBJETIVO}). No se aplica nada a ciegas: revisá ` +
        'a mano antes de correr este script.',
    );
  } else {
    seccion('Paso 2 · tipo y subtipo objetivo');
    const tipoNuevo = await prisma.tipoMagerit.findUnique({ where: { codigo: TIPO_OBJETIVO } });
    if (!tipoNuevo) throw new Error(`El catálogo no tiene el tipo ${TIPO_OBJETIVO}.`);
    const subtipoNuevo = await prisma.subtipoMagerit.findFirst({
      where: { codigo: SUBTIPO_OBJETIVO, tipoId: tipoNuevo.id },
    });
    if (!subtipoNuevo) {
      throw new Error(`El catálogo no tiene el subtipo ${SUBTIPO_OBJETIVO} bajo ${TIPO_OBJETIVO}.`);
    }
    console.log(`   objetivo: tipo ${tipoNuevo.codigo} (id ${tipoNuevo.id}) · subtipo ${subtipoNuevo.codigo} (id ${subtipoNuevo.id})`);

    if (!APLICAR) {
      console.log('\n   ENSAYO · no se escribió nada. Volvé a correr con --aplicar.');
      return;
    }

    seccion('Paso 3 · escritura');
    const filasBitacora = await prisma.$transaction(async (tx) => {
      const total = await registrar(tx, USUARIO, [
        {
          tabla: 'activo',
          registroId: activo.codigo ?? String(activo.id),
          campo: 'tipoId',
          anterior: activo.tipoId,
          nuevo: tipoNuevo.id,
          motivo: MOTIVO,
        },
        {
          tabla: 'activo',
          registroId: activo.codigo ?? String(activo.id),
          campo: 'subtipoId',
          anterior: activo.subtipoId,
          nuevo: subtipoNuevo.id,
          motivo: MOTIVO,
        },
      ]);
      await tx.activo.update({
        where: { id: activo.id },
        data: { tipoId: tipoNuevo.id, subtipoId: subtipoNuevo.id },
      });
      return total;
    });
    console.log(`   ${filasBitacora} fila(s) de bitácora escritas`);
  }

  seccion('Paso 4 · regenerar riesgos');
  if (!APLICAR) {
    console.log('   ENSAYO · generarRiesgos() no se corre en ensayo.');
    return;
  }
  const diagnostico = await generarRiesgos(prisma);
  console.log(`   activos en inventario:  ${diagnostico.activosEnInventario}`);
  console.log(`   activos en análisis:    ${diagnostico.activosEnAnalisis}`);
  console.log(`   riesgos generados:      ${diagnostico.riesgosGenerados}`);
  console.log(`   riesgos obsoletos:      ${diagnostico.riesgosObsoletos}`);
  console.log(`   residual sin calcular:  ${diagnostico.residualSinCalcular}`);

  seccion('Paso 5 · verificación');
  const [totalVigentes, vigentesDelActivo, sinCalculo] = await Promise.all([
    prisma.riesgo.count({ where: { obsoleto: false } }),
    prisma.riesgo.count({ where: { obsoleto: false, activo: { codigo: CODIGO } } }),
    prisma.riesgo.count({ where: { obsoleto: false, calculos: { none: {} } } }),
  ]);
  console.log(`   riesgos vigentes (total):            ${totalVigentes}  (esperado 725)`);
  console.log(`   riesgos vigentes de ${CODIGO}:  ${vigentesDelActivo}  (esperado 23)`);
  console.log(`   riesgos vigentes sin fila de cálculo: ${sinCalculo}  (esperado 0)`);
}

main()
  .catch((e) => {
    console.error(`\nFALLÓ: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
