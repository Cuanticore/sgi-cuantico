'use server';

// app/sgsi/acciones/activos.ts
//
// A valuation is never just a field: the asset's value is max(v_D, v_I, v_C), and the
// threshold decides whether the asset enters the analysis at all. Raising a dimension can
// therefore bring a whole set of risks into existence, and lowering one can take it out
// of scope. Both are handled by regenerating, never by deleting.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta, registrarBaja, type Cambio } from '@/lib/sgsi/bitacora';
import { generarRiesgos } from '@/lib/sgsi/riesgos';
import {
  codigoDebeReemitirse,
  formatearCodigoActivo,
  reemplazarActivoEnOrigen,
} from '@/lib/sgsi/codigo-activo';
import {
  cargarActivo,
  cargarAmenazas,
  cargarCatalogos,
  type DatosOverlayActivo,
} from '@/app/components/sgsi/activos/ficha.query';
import { autorConPermiso, ejecutar, exigirId, idOpcional, type Resultado } from './sesion';

export interface CambioValoracion {
  codigoActivo: string;
  dimension: 'D' | 'I' | 'C';
  valor: number;
}

export async function guardarValoracion(
  cambios: CambioValoracion[],
  motivo?: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('activo:valorar');
    if (cambios.length === 0) return { ok: true, mensaje: 'No había cambios.', cambios: 0 };

    const [escala, dimensiones] = await Promise.all([
      prisma.escalaValor.findMany(),
      prisma.dimension.findMany(),
    ]);
    const porValor = new Map(escala.map((v) => [v.valor, v]));
    const porCodigo = new Map(dimensiones.map((d) => [d.codigo, d.id]));

    const escritos = await prisma.$transaction(async (tx) => {
      let total = 0;

      for (const c of cambios) {
        const activo = await tx.activo.findFirst({
          where: { codigo: c.codigoActivo },
          include: { valores: { include: { dimension: true, valor: true } } },
        });
        if (!activo) throw new Error(`No existe el activo ${c.codigoActivo}`);

        const dimensionId = porCodigo.get(c.dimension);
        if (dimensionId === undefined) throw new Error(`Dimensión inválida: ${c.dimension}`);

        const nuevo = porValor.get(c.valor);
        if (!nuevo) throw new Error(`Valor fuera de la escala: ${c.valor}`);

        const previo = activo.valores.find((v) => v.dimension.codigo === c.dimension);

        total += await registrar(tx, autor, [
          {
            tabla: 'activo_valor',
            registroId: `${activo.codigo}/${c.dimension}`,
            campo: `valor en ${c.dimension}`,
            anterior: previo?.valor.etiqueta ?? null,
            nuevo: nuevo.etiqueta,
            motivo: motivo ?? null,
          },
        ]);

        await tx.activoValor.upsert({
          where: { activoId_dimensionId: { activoId: activo.id, dimensionId } },
          update: { valorId: nuevo.id },
          create: { activoId: activo.id, dimensionId, valorId: nuevo.id },
        });
      }

      return total;
    });

    // The value moved, so the asset may have crossed the threshold in either direction.
    // Risks that leave the scope are marked obsolete, never deleted, and one that comes
    // back keeps the valuation it had.
    const diagnostico = await generarRiesgos(prisma);

    revalidarSgsi();

    const fuera = diagnostico.riesgosObsoletos
      ? ` ${diagnostico.riesgosObsoletos} riesgos salieron del alcance y quedaron marcados obsoletos, no borrados.`
      : '';

    return {
      ok: true,
      mensaje: `Se guardaron ${escritos} cambios de valoración y se recalcularon ${diagnostico.riesgosGenerados} riesgos.${fuera}`,
      cambios: escritos,
    };
  });
}

export interface DatosGenerales {
  nombre?: string;
  descripcion?: string | null;
  /// The MAGERIT classification. Changing the type changes WHICH THREATS apply, so the
  /// asset's whole risk set is regenerated — and the code stays as it is: it is immutable
  /// and never reused, so an asset that moves from one type to another keeps a code whose
  /// abbreviation no longer matches. REQ-SIG-01 is explicit about that, and the change
  /// goes to the bitácora instead.
  areaId?: number;
  tipoId?: number;
  subtipoId?: number;
  propietarioId?: number | null;
  custodioId?: number | null;
  ubicacionId?: number | null;
  entornoId?: number | null;
  proveedorId?: number | null;
  superiorId?: number | null;
  /// REQ-SIG-20 §11 (P9) · declarada por el negocio, nunca derivada del residual.
  criticidadId?: number | null;
  /// V21 · cuántas unidades representa el activo. Viajaba desde la base a la ficha y no se
  /// dibujaba en ninguna pantalla: el dato existía y nadie podía verlo ni corregirlo.
  cantidad?: number;
  /// E2 · el NIVEL 3 de la jerarquía, el más específico. Los grados 1 y 2 no se guardan:
  /// se derivan subiendo por `padreId`. Que acá solo entre un grado 3 es lo que impide que
  /// un activo quede colgado de media rama.
  nivelId?: number | null;
  datosCliente?: 'SI' | 'NO' | 'POR_DEFINIR';
  datosPersonales?: 'SI' | 'NO' | 'POR_DEFINIR';
  expuestoInternet?: 'SI' | 'NO' | 'POR_DEFINIR';
}

/// Saves the sheet's general data. The code is never among the editable fields: it is
/// immutable and non-reusable, and changing the asset's area or type does NOT change it —
/// that change goes to the log instead.
export async function guardarDatosGenerales(
  codigoActivo: string,
  datos: DatosGenerales,
  motivo?: string,
): Promise<Resultado & { codigoNuevo?: string }> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('activo:valorar');
    idOpcional(datos.areaId, 'el proceso o área');
    idOpcional(datos.tipoId, 'el tipo');
    idOpcional(datos.subtipoId, 'el subtipo');
    idOpcional(datos.propietarioId, 'el propietario');
    idOpcional(datos.custodioId, 'el custodio');
    idOpcional(datos.ubicacionId, 'la ubicación');
    idOpcional(datos.entornoId, 'el entorno');
    idOpcional(datos.proveedorId, 'el proveedor');
    idOpcional(datos.superiorId, 'el activo superior');
    idOpcional(datos.criticidadId, 'la criticidad de negocio');
    idOpcional(datos.nivelId, 'el nivel 3 de la jerarquía');

    const escritos = await prisma.$transaction(async (tx) => {
      const activo = await tx.activo.findFirst({ where: { codigo: codigoActivo } });
      if (!activo) throw new Error(`No existe el activo ${codigoActivo}`);

      // A subtype belongs to exactly one type, so the pair has to be checked together:
      // saving them separately is how an asset ends up classified as something the
      // taxonomy does not contain.
      const tipoFinal = datos.tipoId ?? activo.tipoId;
      const subtipoFinal = datos.subtipoId ?? activo.subtipoId;
      if (datos.tipoId !== undefined || datos.subtipoId !== undefined) {
        const subtipo = await tx.subtipoMagerit.findUnique({ where: { id: subtipoFinal } });
        if (!subtipo || subtipo.tipoId !== tipoFinal) {
          throw new Error('El subtipo elegido no pertenece al tipo MAGERIT seleccionado.');
        }
      }

      // E2 · el activo apunta al nivel 3 y a ningún otro grado. La llave foránea no puede
      // decirlo —no sabe de grados— así que lo dice el servidor: aceptar acá un grado 1 o 2
      // dejaría al activo en media rama y a la jerarquía diciendo dos cosas distintas.
      if (datos.nivelId !== undefined && datos.nivelId !== null) {
        const nivel = await tx.nivelActivo.findUnique({ where: { id: datos.nivelId } });
        if (!nivel || !nivel.activo) throw new Error('El nivel elegido no existe o está inactivo.');
        if (nivel.grado !== 3) {
          throw new Error(
            `El activo se ubica en un nivel 3, el más específico. «${nivel.nombre}» es de grado ${nivel.grado}.`,
          );
        }
      }

      // REEMISIÓN DEL CÓDIGO. Mover un activo de proceso cambia lo que su código DICE, y
      // un `TEC-…` dentro de Gestión Estratégica es una etiqueta que miente. Se reemite
      // contra el contador del par (área, tipo) DESTINO — el mismo mecanismo del alta, así
      // que el número nunca se reusa y el que el activo dejó atrás queda retirado.
      //
      // Lo que esto obliga a arreglar en la misma transacción está abajo: el código viejo
      // tiene que seguir llevando a este activo, o la reemisión es una pérdida de historia
      // disfrazada de corrección.
      let codigoNuevo: string | null = null;
      const areaFinal = datos.areaId ?? activo.areaId;
      if (datos.areaId !== undefined || datos.tipoId !== undefined) {
        const [areaAntes, areaDespues, tipoAntes, tipoDespues] = await Promise.all([
          tx.area.findUnique({ where: { id: activo.areaId } }),
          tx.area.findUnique({ where: { id: areaFinal } }),
          tx.tipoMagerit.findUnique({ where: { id: activo.tipoId } }),
          tx.tipoMagerit.findUnique({ where: { id: tipoFinal } }),
        ]);
        if (!areaDespues || !tipoDespues) throw new Error('El proceso o el tipo elegido no existe.');
        if (!areaDespues.prefijo?.trim()) {
          throw new Error(
            `El proceso ${areaDespues.nombre} no tiene prefijo de codificación asignado, así que no se puede emitir un código. Asignáselo antes de mover el activo.`,
          );
        }

        const antes = {
          prefijoArea: areaAntes?.prefijo ?? '',
          abreviaturaTipo: tipoAntes?.abreviatura ?? '',
        };
        const despues = {
          prefijoArea: areaDespues.prefijo,
          abreviaturaTipo: tipoDespues.abreviatura,
        };

        if (activo.codigo !== null && codigoDebeReemitirse(antes, despues)) {
          const contador = await tx.contadorCodigo.upsert({
            where: { areaId_tipoId: { areaId: areaDespues.id, tipoId: tipoDespues.id } },
            update: { ultimoValor: { increment: 1 } },
            create: { areaId: areaDespues.id, tipoId: tipoDespues.id, ultimoValor: 1 },
          });
          if (contador.ultimoValor > 9999) {
            throw new Error(
              `Se agotó el espacio de numeración para ${despues.prefijoArea}-${despues.abreviaturaTipo}.`,
            );
          }
          codigoNuevo = formatearCodigoActivo(despues, contador.ultimoValor);
        }
      }

      const campos: (keyof DatosGenerales)[] = [
        'nombre',
        'descripcion',
        'areaId',
        'tipoId',
        'subtipoId',
        'propietarioId',
        'custodioId',
        'ubicacionId',
        'entornoId',
        'proveedorId',
        'superiorId',
        'criticidadId',
        'nivelId',
        'cantidad',
        'datosCliente',
        'datosPersonales',
        'expuestoInternet',
      ];

      // Todo este guardado se registra bajo la identidad CON LA QUE EL ACTIVO QUEDA. Junto
      // al renglón `codigo` —que guarda el anterior y el nuevo— eso es lo que deja la
      // historia caminable: desde el código actual se llega al anterior, y desde el
      // anterior (buscando `campo = 'codigo'`, `valorAnterior = <viejo>`) se llega al que
      // lo reemplazó. La bitácora es append-only: acá no se reescribe ni un renglón previo,
      // se agrega el eslabón que los une.
      const registroId = codigoNuevo ?? activo.codigo ?? String(activo.id);
      const cambios: Cambio[] = campos
        .filter((campo) => datos[campo] !== undefined)
        .map((campo) => ({
          tabla: 'activo',
          registroId,
          campo,
          anterior: activo[campo as keyof typeof activo],
          nuevo: datos[campo],
          motivo: motivo ?? null,
        }));

      if (codigoNuevo !== null) {
        cambios.push({
          tabla: 'activo',
          registroId,
          campo: 'codigo',
          anterior: activo.codigo,
          nuevo: codigoNuevo,
          motivo:
            motivo ??
            'El activo cambió de proceso o de tipo, así que su código se reemitió con el siguiente consecutivo del par destino. El código anterior queda retirado y no se reasigna.',
        });
      }

      const total = await registrar(tx, autor, cambios);

      await tx.activo.update({
        where: { id: activo.id },
        data: codigoNuevo === null ? datos : { ...datos, codigo: codigoNuevo },
      });

      // Lo único que ata un plan a su riesgo es texto: el prefijo verificable de
      // `AccionPlan.origen`. Sin reapuntarlo, reemitir el código dejaría a TODOS los planes
      // del activo sin cubrir nada —`origenCubreRiesgo` compara por código— y el activo
      // aparecería «sin plan» en el mismo instante, con el reloj de la deuda en cero.
      if (codigoNuevo !== null && activo.codigo !== null) {
        const activas = await tx.accionPlan.findMany({
          where: { activa: true },
          select: { id: true, origen: true },
        });
        for (const a of activas) {
          const reapuntado = reemplazarActivoEnOrigen(a.origen, activo.codigo, codigoNuevo);
          if (reapuntado !== null) {
            await tx.accionPlan.update({ where: { id: a.id }, data: { origen: reapuntado } });
          }
        }
      }
      return {
        total,
        cambioClasificacion: datos.tipoId !== undefined && datos.tipoId !== activo.tipoId,
        codigoNuevo,
        codigoAnterior: activo.codigo,
      };
    });

    // Only the type decides which threats apply, so only a type change needs the risk
    // set rebuilt. Regenerating on every name edit would be 2256 rows of pointless work.
    let nota = '';
    if (escritos.cambioClasificacion) {
      const d = await generarRiesgos(prisma);
      nota =
        ` El tipo cambió, así que se regeneró el conjunto de riesgos: ${d.riesgosGenerados} vigentes` +
        (d.riesgosObsoletos ? ` y ${d.riesgosObsoletos} fuera del alcance, marcados obsoletos.` : '.') +
        ' El código del activo no cambia: es inmutable, y el cambio queda en la bitácora.';
    }

    // La ficha tiene que saber que el activo ya no vive en la URL donde está parada.
    const reemision =
      escritos.codigoNuevo === null
        ? ''
        : ` El proceso o el tipo cambió, así que el código se reemitió: ${escritos.codigoAnterior} → ${escritos.codigoNuevo}.` +
          ' El anterior queda retirado, no se reasigna, y sigue llevando a este activo.';

    revalidarSgsi();
    return {
      ok: true,
      mensaje:
        escritos.total === 0
          ? 'No había cambios que guardar.'
          : `Se guardaron ${escritos.total} campos.${reemision}${nota}`,
      cambios: escritos.total,
      codigoNuevo: escritos.codigoNuevo ?? undefined,
    };
  });
}

/// Vuelve a correr el cálculo de riesgos SOBRE ESTE ACTIVO, sin esperar a que alguien lo
/// edite.
///
/// POR QUÉ HACE FALTA UN BOTÓN. Las filas de `Riesgo` están persistidas y solo se
/// regeneran cuando una escritura las dispara: guardar una valoración, cambiar el tipo,
/// tocar un control. Pero el cálculo depende además de cosas que se cambian en OTRA
/// pantalla y no disparan nada — el umbral, las escalas, las relevancias de los controles.
/// Después de mover una de esas, lo guardado y la parametrización dicen cosas distintas y
/// nadie se entera. Esto es lo que cierra esa brecha.
///
/// ALCANCE: UN ACTIVO. La parametrización que se lee es la global —umbral, eficacias,
/// escalas—; lo que se acota es sobre cuántos activos se aplica. El barrido de obsoletos va
/// acotado con ella (`riesgosParaObsoletar`): sin eso, recalcular un activo marcaría
/// obsoletos los riesgos de los otros 297 por el solo hecho de no haberlos mirado.
///
/// No escribe bitácora: no cambia ninguna decisión de nadie. Recalcula lo derivable a
/// partir de datos que ya estaban, que es justamente lo que este sistema recalcula al leer
/// en todo lo demás.
export async function recalcularRiesgosDelActivo(codigoActivo: string): Promise<Resultado> {
  return ejecutar(async () => {
    await autorConPermiso('activo:valorar');

    const activo = await prisma.activo.findFirst({ where: { codigo: codigoActivo } });
    if (!activo) return { ok: false, mensaje: `No existe el activo ${codigoActivo}.` };
    if (!activo.activo) {
      return {
        ok: false,
        mensaje: `${codigoActivo} está dado de baja: sus riesgos no se recalculan.`,
      };
    }

    const d = await generarRiesgos(prisma, { activoId: activo.id });
    revalidarSgsi();

    const fuera = d.riesgosObsoletos
      ? ` ${d.riesgosObsoletos} salieron del alcance y quedaron marcados obsoletos, no borrados.`
      : '';
    const sinCalcular = d.residualSinCalcular
      ? ` ${d.residualSinCalcular} quedaron con el residual sin calcular: su eficacia es desconocida, que no es cero.`
      : '';

    return {
      ok: true,
      mensaje:
        d.riesgosGenerados === 0
          ? `${codigoActivo} no alcanza el umbral de valoración, así que no genera riesgos.${fuera}`
          : `Se recalcularon ${d.riesgosGenerados} riesgos de ${codigoActivo}.${fuera}${sinCalcular}`,
    };
  });
}

/// Ata o desata una cuenta del dominio a un activo `[P] Personal`.
///
/// **No es el custodio.** `Activo.personaId` dice quién TIENE el activo en la mano; esto
/// dice de quién está HECHO el activo. Un «Personal de soporte» con cantidad 4 es un activo
/// cuya sustancia son cuatro cuentas concretas, y hasta ahora no había dónde escribir
/// cuáles.
///
/// NO SE EXIGE QUE EL TIPO SEA `[P]`, y es deliberado: el tipo MAGERIT se edita en la misma
/// pantalla, y un activo puede estar reclasificándose mientras alguien ata su primera
/// cuenta. Bloquearlo acá convertiría un orden de tecleo en un error. La ficha muestra la
/// sección sólo para `[P]`, que es donde la guía corresponde.
///
/// NO SE EXIGE QUE LA CANTIDAD ALCANCE. Atar cinco cuentas a un activo de cantidad 4 es una
/// contradicción que hay que VER, no una que haya que impedir: la ficha la señala y deja
/// que la persona decida cuál de los dos números está mal. «Avisa, no bloquea» (D17).
export async function vincularCuentaAlActivo(
  codigoActivo: string,
  personaId: number,
  vincular: boolean,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('activo:valorar');
    exigirId(personaId, 'la persona');

    const [activo, persona] = await Promise.all([
      prisma.activo.findFirst({ where: { codigo: codigoActivo } }),
      prisma.persona.findUnique({ where: { id: personaId } }),
    ]);
    if (!activo) return { ok: false, mensaje: `No existe el activo ${codigoActivo}.` };
    if (!persona) return { ok: false, mensaje: 'La persona elegida no existe.' };

    await prisma.$transaction(async (tx) => {
      if (vincular) {
        await tx.activoPersona.upsert({
          where: { activoId_personaId: { activoId: activo.id, personaId } },
          update: {},
          create: { activoId: activo.id, personaId },
        });
      } else {
        await tx.activoPersona.deleteMany({ where: { activoId: activo.id, personaId } });
      }

      await registrar(tx, autor, [
        {
          tabla: 'activo_persona',
          registroId: activo.codigo ?? String(activo.id),
          campo: 'cuenta del dominio',
          anterior: vincular ? null : persona.correo,
          nuevo: vincular ? persona.correo : null,
        },
      ]);
    });

    revalidarSgsi();
    return {
      ok: true,
      mensaje: vincular
        ? `${persona.correo} quedó atada a ${codigoActivo}.`
        : `${persona.correo} ya no forma parte de ${codigoActivo}.`,
    };
  });
}

export interface ActivoNuevo {
  nombre: string;
  descripcion?: string | null;
  areaId: number;
  tipoId: number;
  subtipoId: number;
  custodioId: number;
  propietarioId?: number | null;
  ubicacionId?: number | null;
  entornoId?: number | null;
  proveedorId?: number | null;
  superiorId?: number | null;
  /// E2 · el nivel 3 de la jerarquía. Viaja en el alta para que un activo creado desde la
  /// ficha no nazca «sin ubicar» habiendo elegido su rama en la pantalla.
  nivelId?: number | null;
  /// V21 · cuántas unidades representa el activo. 1 cuando no se declara.
  cantidad?: number;
  datosCliente?: 'SI' | 'NO' | 'POR_DEFINIR';
  datosPersonales?: 'SI' | 'NO' | 'POR_DEFINIR';
  expuestoInternet?: 'SI' | 'NO' | 'POR_DEFINIR';
  /// Value per dimension, on the 0–5 scale. An asset created without a valuation has no
  /// value, so it cannot reach the threshold and generates no risks — which is a valid
  /// state, not an error.
  valores?: { D: number; I: number; C: number };
}

/// Creates an asset and hands it its code.
///
/// The code comes from a counter per (area, type), incremented atomically and never from
/// MAX()+1: codes are immutable and non-reusable while deletes are logical, so a maximum
/// over live rows would hand out a number a retired asset still holds.
export async function crearActivo(
  datos: ActivoNuevo,
): Promise<Resultado & { codigo?: string }> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    if (!datos.nombre.trim()) {
      return { ok: false, mensaje: 'El activo necesita un nombre.' };
    }

    // Antes de consultar: un identificador ausente hace lanzar al `findUnique` y las
    // comprobaciones de existencia de más abajo no se alcanzan nunca.
    exigirId(datos.areaId, 'el proceso o área');
    exigirId(datos.tipoId, 'el tipo MAGERIT');
    exigirId(datos.subtipoId, 'el subtipo');
    idOpcional(datos.custodioId, 'el custodio');
    idOpcional(datos.propietarioId, 'el propietario');
    idOpcional(datos.ubicacionId, 'la ubicación');
    idOpcional(datos.entornoId, 'el entorno');
    idOpcional(datos.proveedorId, 'el proveedor');
    idOpcional(datos.superiorId, 'el activo superior');
    idOpcional(datos.nivelId, 'el nivel 3 de la jerarquía');

    // E2 · la misma regla que en la edición: el activo se ubica en un nivel 3 y en ningún
    // otro grado. La llave foránea no sabe de grados, así que lo dice el servidor.
    if (datos.nivelId !== undefined && datos.nivelId !== null) {
      const nivel = await prisma.nivelActivo.findUnique({ where: { id: datos.nivelId } });
      if (!nivel || !nivel.activo) {
        return { ok: false, mensaje: 'El nivel elegido no existe o está inactivo.' };
      }
      if (nivel.grado !== 3) {
        return {
          ok: false,
          mensaje: `El activo se ubica en un nivel 3, el más específico. «${nivel.nombre}» es de grado ${nivel.grado}.`,
        };
      }
    }

    const [area, tipo, subtipo] = await Promise.all([
      prisma.area.findUnique({ where: { id: datos.areaId } }),
      prisma.tipoMagerit.findUnique({ where: { id: datos.tipoId } }),
      prisma.subtipoMagerit.findUnique({ where: { id: datos.subtipoId } }),
    ]);

    if (!area) return { ok: false, mensaje: 'El proceso o área no existe.' };
    if (!tipo) return { ok: false, mensaje: 'El tipo MAGERIT no existe.' };
    if (!subtipo || subtipo.tipoId !== tipo.id) {
      return { ok: false, mensaje: 'El subtipo no pertenece al tipo MAGERIT elegido.' };
    }
    // Two of the ten areas have no prefix ratified yet, and the code cannot be built
    // without one. Better to refuse than to mint a code that has to be corrected later,
    // because it never can be.
    if (!area.prefijo?.trim()) {
      return {
        ok: false,
        mensaje: `El área ${area.nombre} todavía no tiene prefijo de codificación asignado, así que no se puede emitir un código de activo.`,
      };
    }

    const escala = datos.valores
      ? await prisma.escalaValor.findMany({
          where: { valor: { in: [datos.valores.D, datos.valores.I, datos.valores.C] } },
        })
      : [];
    const dimensiones = await prisma.dimension.findMany();

    const creado = await prisma.$transaction(async (tx) => {
      const contador = await tx.contadorCodigo.upsert({
        where: { areaId_tipoId: { areaId: area.id, tipoId: tipo.id } },
        update: { ultimoValor: { increment: 1 } },
        create: { areaId: area.id, tipoId: tipo.id, ultimoValor: 1 },
      });
      if (contador.ultimoValor > 9999) {
        throw new Error(
          `Se agotó el espacio de numeración para ${area.prefijo}-${tipo.abreviatura}.`,
        );
      }

      const codigo = `${area.prefijo}-${tipo.abreviatura}-${String(contador.ultimoValor).padStart(4, '0')}`;

      const activo = await tx.activo.create({
        data: {
          codigo,
          nombre: datos.nombre.trim(),
          descripcion: datos.descripcion ?? null,
          areaId: area.id,
          tipoId: tipo.id,
          subtipoId: subtipo.id,
          custodioId: datos.custodioId,
          propietarioId: datos.propietarioId ?? null,
          ubicacionId: datos.ubicacionId ?? null,
          entornoId: datos.entornoId ?? null,
          proveedorId: datos.proveedorId ?? null,
          superiorId: datos.superiorId ?? null,
          nivelId: datos.nivelId ?? null,
          cantidad: datos.cantidad !== undefined && datos.cantidad >= 1 ? Math.floor(datos.cantidad) : 1,
          datosCliente: datos.datosCliente ?? 'POR_DEFINIR',
          datosPersonales: datos.datosPersonales ?? 'POR_DEFINIR',
          expuestoInternet: datos.expuestoInternet ?? 'POR_DEFINIR',
        },
      });

      if (datos.valores) {
        for (const codigoDim of ['D', 'I', 'C'] as const) {
          const dimension = dimensiones.find((d) => d.codigo === codigoDim);
          const valor = escala.find((v) => v.valor === datos.valores![codigoDim]);
          if (!dimension || !valor) throw new Error('La valoración inicial es inválida.');
          await tx.activoValor.create({
            data: { activoId: activo.id, dimensionId: dimension.id, valorId: valor.id },
          });
        }
      }

      await registrarAlta(tx, autor, 'activo', codigo);
      return codigo;
    });

    // A valuation that reaches the threshold brings the asset's risks into existence.
    const d = await generarRiesgos(prisma);
    revalidarSgsi();

    const conRiesgos = datos.valores
      ? ` Se generaron sus riesgos: ${d.riesgosGenerados} vigentes en total.`
      : ' Sin valoración todavía no alcanza el umbral, así que no tiene riesgos.';

    return {
      ok: true,
      mensaje: `Se creó el activo ${creado}. El código es inmutable y no se reutiliza.${conRiesgos}`,
      cambios: 1,
      codigo: creado,
    };
  });
}

/// A logical delete: the asset leaves the inventory, the matrices and the KPIs, and the
/// reason is mandatory. Nothing is removed from the database, and the code it held is
/// never reused.
export async function darDeBajaActivo(
  codigoActivo: string,
  motivo: string,
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    if (!motivo.trim()) {
      return { ok: false, mensaje: 'La baja necesita un motivo: queda en la bitácora.' };
    }

    await prisma.$transaction(async (tx) => {
      const activo = await tx.activo.findFirst({ where: { codigo: codigoActivo } });
      if (!activo) throw new Error(`No existe el activo ${codigoActivo}`);

      await registrarBaja(tx, autor, 'activo', activo.codigo ?? String(activo.id), motivo);
      await tx.activo.update({
        where: { id: activo.id },
        data: { activo: false, bajaEn: new Date() },
      });
    });

    await generarRiesgos(prisma);
    revalidarSgsi();

    return { ok: true, mensaje: `El activo ${codigoActivo} quedó dado de baja.`, cambios: 1 };
  });
}

export async function reactivarActivo(codigoActivo: string): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    await prisma.$transaction(async (tx) => {
      const activo = await tx.activo.findFirst({ where: { codigo: codigoActivo } });
      if (!activo) throw new Error(`No existe el activo ${codigoActivo}`);

      await registrar(tx, autor, [
        {
          tabla: 'activo',
          registroId: activo.codigo ?? String(activo.id),
          campo: 'baja lógica',
          anterior: 'dado de baja',
          nuevo: 'vigente',
          motivo: 'Se deshizo la baja',
        },
      ]);
      await tx.activo.update({
        where: { id: activo.id },
        data: { activo: true, bajaEn: null },
      });
    });

    // Reactivation brings the asset's risks back with the valuation they had.
    await generarRiesgos(prisma);
    revalidarSgsi();

    return { ok: true, mensaje: `El activo ${codigoActivo} volvió al inventario.`, cambios: 1 };
  });
}

/// El fetch detrás del contrato de overlay `?activo=<código>` (REQ-SIG-20 §6, D1, tarea
/// 3.6). Vive acá y no en `ficha.query.ts` porque quien lo llama — `OverlayActivo`, un
/// Client Component — solo puede invocar una función de servidor si el ARCHIVO entero
/// declara `'use server'`; `ficha.query.ts` es `server-only`, de lectura directa desde
/// Server Components como `page.tsx`, y envolver una sola función suya en `'use server'`
/// en línea arrastra igual toda la cadena de Prisma al bundle del navegador (`net`/`tls`
/// no se resuelven ahí — falla `next build`, no un detalle cosmético). Este wrapper reusa
/// las mismas tres consultas que la página completa, así que las dos ven exactamente los
/// mismos datos.
///
/// `null` significa que el código no resuelve a un activo vivo: quien llama muestra un
/// aviso y NUNCA abre un overlay vacío (tarea 3.1). `cargarActivo` corre primero y solo
/// por eso — si no hay activo, no tiene sentido pagar las otras dos consultas.
export async function abrirOverlayActivo(codigo: string): Promise<DatosOverlayActivo | null> {
  const activo = await cargarActivo(codigo);
  if (activo === null) return null;
  const [catalogos, amenazas] = await Promise.all([cargarCatalogos(), cargarAmenazas()]);
  return { activo, catalogos, amenazas };
}

function revalidarSgsi(): void {
  for (const ruta of [
    '/',
    '/sgsi',
    '/sgsi/inventario',
    '/sgsi/matrices',
    '/sgsi/controles',
    '/sgsi/planes',
  ]) {
    revalidatePath(ruta);
  }
}
