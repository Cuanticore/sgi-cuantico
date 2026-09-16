import 'server-only';

// app/sgsi/informe-valoracion/informe.query.ts
//
// La lectura detrás del informe de valoración de activos y aceptación del riesgo residual.
//
// **Lee y nada más.** Generar un informe no cambia nada: no marca activos como informados, no
// deja rastro en la bitácora y no congela cifras. Un informe que escribe es un informe que no
// se puede volver a sacar igual, y el mismo periodo tiene que poder imprimirse dos veces con
// el mismo resultado.
//
// **Ninguna cifra se calcula acá.** El valor del activo es `max` de sus dimensiones
// (`lib/sgsi/formulas.ts`), las bandas salen de `lib/sgsi/clasificar.ts`, la matriz de
// `lib/sgsi/matriz-clasica.ts` y la agregación de `lib/sgsi/informe-valoracion.ts` — todas las
// mismas que usan el inventario, la ficha y las pantallas de Matrices y Valoración. Este
// archivo junta materia prima y la entrega. Es la única forma de que el documento que el
// comité firma no pueda contradecir a la pantalla de la que salió.
//
// **El filtro se aplica ACÁ y no en la agregación.** Pedir tres procesos tiene que leer tres
// procesos: filtrar después de traer los 299 activos y sus ~2200 riesgos funcionaría igual y
// haría trabajo que nadie mira.

import { prisma } from '@/lib/db';
import { parsearOrigen } from '@/lib/sgsi/origen-plan';
import {
  armarInforme,
  peorBanda,
  type AceptacionDelInforme,
  type ActivoDelInforme,
  type ProcesoDelInforme,
  type RiesgoDelInforme,
} from '@/lib/sgsi/informe-valoracion';
import {
  columnasDeEscala,
  filasDeUmbrales,
  type ColumnaFrecuencia,
  type FilaImpacto,
} from '@/lib/sgsi/matriz-clasica';
import type { Umbral } from '@/lib/sgsi/clasificar';

/// Qué recorte se pidió desde el popup.
///
/// Los dos vacíos significan TODO, y es el default a propósito: el informe completo es el que
/// se lleva al comité, y el recorte es la excepción que alguien elige.
export interface FiltroInforme {
  /// Nombres de `Area`. Vacío es «todos los procesos».
  procesos?: readonly string[];
  /// Nombres de `CargoResponsable`. Vacío es «todos los responsables».
  responsables?: readonly string[];
}

export interface DatosInforme {
  capitulos: ProcesoDelInforme[];
  /// Para el encabezado del documento y para el popup.
  generadoEn: Date;
  /// Qué recorte se aplicó, ya resuelto a texto legible. Va impreso en la portada: un informe
  /// parcial que no dice que es parcial es un informe que se lee como si fuera completo.
  alcance: string;
  /// Los ejes, para que la página dibuje las matrices con los mismos encabezados.
  filasImpacto: FilaImpacto[];
  columnasFrecuencia: ColumnaFrecuencia[];
  /// El umbral vigente, que la portada cita: sin él, «entra al análisis» es una afirmación
  /// sin criterio.
  umbralValoracion: number;
  /// Totales de todo el informe, ya sumados, para el resumen ejecutivo de la portada.
  totalActivos: number;
  totalEnAnalisis: number;
  totalAceptaciones: number;
  /// Todos los procesos y responsables que existen, para poblar el popup. No dependen del
  /// filtro: la lista de opciones no puede encogerse porque se filtró.
  procesosDisponibles: string[];
  responsablesDisponibles: string[];
}

export async function leerInforme(filtro: FiltroInforme = {}): Promise<DatosInforme> {
  const procesos = filtro.procesos ?? [];
  const responsables = filtro.responsables ?? [];

  // El responsable del activo es el PROPIETARIO, y el custodio suple cuando no hay: el
  // consolidado dejó «Propietario» vacío en todos los activos, así que filtrar sólo por
  // propietario devolvería nada. Es la misma suplencia que hace la pantalla de Matrices.
  const dondeActivo = {
    activo: true,
    ...(procesos.length > 0 ? { area: { nombre: { in: [...procesos] } } } : {}),
    ...(responsables.length > 0
      ? {
          OR: [
            { propietario: { nombre: { in: [...responsables] } } },
            { propietario: null, custodio: { nombre: { in: [...responsables] } } },
          ],
        }
      : {}),
  };

  const [
    activos,
    riesgos,
    umbralesImpacto,
    umbralesRiesgo,
    frecuencias,
    escalaValor,
    parametro,
    planes,
    areas,
    cargos,
  ] = await Promise.all([
    prisma.activo.findMany({
      where: dondeActivo,
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        area: { select: { nombre: true } },
        tipo: { select: { codigo: true, nombre: true } },
        propietario: { select: { nombre: true } },
        custodio: { select: { nombre: true } },
        valores: { select: { valor: { select: { valor: true } } } },
      },
    }),
    // Los riesgos VIGENTES de esos activos. Un riesgo obsoleto salió del alcance y ponerlo en
    // la matriz dibujaría una exposición que la organización ya no tiene.
    prisma.riesgo.findMany({
      where: { obsoleto: false, activo: dondeActivo },
      select: {
        activoId: true,
        impacto: true,
        riesgoPotencial: true,
        frecuenciaResidual: true,
        riesgoResidual: true,
        // El override por riesgo; si no hay, manda la frecuencia de la amenaza. Es
        // exactamente lo que hace `lib/sgsi/riesgos.ts` al calcular.
        frecuencia: { select: { vecesAno: true } },
        amenaza: { select: { frecuencia: { select: { vecesAno: true } } } },
        activo: { select: { area: { select: { nombre: true } } } },
      },
    }),
    prisma.umbralImpacto.findMany({ orderBy: { orden: 'asc' } }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaFrecuencia.findMany({ orderBy: { vecesAno: 'asc' } }),
    prisma.escalaValor.findMany({ orderBy: { orden: 'asc' } }),
    prisma.parametro.findUnique({ where: { clave: 'umbral_valoracion' } }),
    // Las aceptaciones formales. Se atan al activo por el prefijo verificable de `origen`,
    // que es lo único que las liga: `AccionPlan` no tiene columna de activo porque un plan
    // mejora un CONTROL y roza varios activos a la vez.
    prisma.accionPlan.findMany({
      where: { tipo: 'ACEPTAR', activa: true },
      orderBy: { codigo: 'asc' },
      select: {
        codigo: true,
        origen: true,
        justificacionAceptacion: true,
        fechaRevisionAceptacion: true,
      },
    }),
    // Las listas del popup: TODAS, sin el filtro aplicado.
    prisma.area.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' }, select: { nombre: true } }),
    // Los responsables son CARGOS, no personas. El esquema los separa a propósito (nota E9):
    // el cargo dice quién responde por el activo y sobrevive a la rotación; la persona dice
    // quién lo tiene en la mano. Un informe que se archiva y se relee en dos años tiene que
    // decir el cargo, o envejece mal el día que alguien cambia de puesto.
    prisma.cargoResponsable.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: { nombre: true },
    }),
  ]);

  const umbral = Number(parametro?.valor ?? 4);

  const filasImpacto = filasDeUmbrales(umbralesImpacto);
  const columnasFrecuencia = columnasDeEscala(frecuencias);
  const bandasRiesgo: Umbral[] = umbralesRiesgo.map((u) => ({
    nombre: u.nombre,
    desde: Number(u.desde),
    hasta: Number(u.hasta),
  }));

  // La etiqueta de un valor sale de la escala. Sin fila en la escala el valor se imprime tal
  // cual: es preferible un «4» suelto a inventar una etiqueta que el catálogo no tiene.
  const etiquetaDeValor = new Map(escalaValor.map((e) => [e.valor, e.etiqueta]));

  // --- Riesgos, agrupados por activo para resolver las bandas de cada uno ----------------
  const porActivo = new Map<number, { potencial: number | null; residual: number | null }[]>();
  const riesgosDelInforme: RiesgoDelInforme[] = [];

  for (const r of riesgos) {
    porActivo.set(r.activoId, [
      ...(porActivo.get(r.activoId) ?? []),
      {
        potencial: r.riesgoPotencial === null ? null : Number(r.riesgoPotencial),
        residual: r.riesgoResidual === null ? null : Number(r.riesgoResidual),
      },
    ]);

    // Sin impacto no se puede ubicar en la matriz. `ubicarRiesgo` lo cuenta como «sin
    // impacto» y lo informa, así que se deja pasar en vez de descartarlo acá en silencio.
    if (r.impacto === null) continue;
    riesgosDelInforme.push({
      proceso: r.activo.area.nombre,
      impacto: Number(r.impacto),
      aro: Number(r.frecuencia?.vecesAno ?? r.amenaza.frecuencia.vecesAno),
      aroResidual: r.frecuenciaResidual === null ? null : Number(r.frecuenciaResidual),
    });
  }

  // --- Activos ---------------------------------------------------------------------------
  const filasActivos: ActivoDelInforme[] = activos.map((a) => {
    // `max` de las dimensiones. Sin ninguna fila en `ActivoValor` el activo vale 0 y NO entra
    // al análisis: no valorado y valorado en 0 dan lo mismo para el umbral, aunque sean cosas
    // distintas — y el conteo por nivel es donde la diferencia se ve.
    const valor = a.valores.reduce((m, v) => Math.max(m, v.valor.valor), 0);
    const susRiesgos = porActivo.get(a.id) ?? [];

    return {
      codigo: a.codigo ?? '(sin código)',
      nombre: a.nombre,
      proceso: a.area.nombre,
      responsable: a.propietario?.nombre ?? a.custodio?.nombre ?? null,
      tipo: `${a.tipo.codigo} ${a.tipo.nombre}`,
      valor,
      nivelValor: etiquetaDeValor.get(valor) ?? String(valor),
      entraAlAnalisis: valor >= umbral,
      bandaInherente: peorBanda(susRiesgos.map((x) => x.potencial), bandasRiesgo),
      bandaResidual: peorBanda(susRiesgos.map((x) => x.residual), bandasRiesgo),
    };
  });

  // --- Aceptaciones ----------------------------------------------------------------------
  //
  // Se resuelven contra los activos QUE ENTRARON al filtro: una aceptación de un activo que
  // el recorte dejó afuera no pertenece a este informe.
  const porCodigo = new Map(filasActivos.map((f) => [f.codigo, f]));
  const aceptaciones: AceptacionDelInforme[] = [];
  for (const p of planes) {
    const partes = parsearOrigen(p.origen);
    if (partes === null) continue;
    const activo = porCodigo.get(partes.activoCodigo);
    if (activo === undefined) continue;
    aceptaciones.push({
      activoCodigo: activo.codigo,
      activoNombre: activo.nombre,
      proceso: activo.proceso,
      planCodigo: p.codigo,
      // La justificación del bloque de aceptación; si está vacía, la narrativa del origen es
      // lo que hay, y es mejor que una celda en blanco en un documento que se firma.
      justificacion: p.justificacionAceptacion ?? partes.justificacion ?? null,
      fechaRevision:
        p.fechaRevisionAceptacion === null
          ? null
          : p.fechaRevisionAceptacion.toISOString().slice(0, 10),
    });
  }

  const capitulos = armarInforme({
    activos: filasActivos,
    aceptaciones,
    nivelesDeValor: escalaValor.map((e) => e.etiqueta),
    bandas: bandasRiesgo.map((b) => b.nombre),
    riesgos: riesgosDelInforme,
    filasImpacto,
    columnasFrecuencia,
    umbralesRiesgo: bandasRiesgo,
  });

  return {
    capitulos,
    generadoEn: new Date(),
    alcance: describirAlcance(procesos, responsables),
    filasImpacto,
    columnasFrecuencia,
    umbralValoracion: umbral,
    totalActivos: filasActivos.length,
    totalEnAnalisis: filasActivos.filter((f) => f.entraAlAnalisis).length,
    totalAceptaciones: aceptaciones.length,
    procesosDisponibles: areas.map((a) => a.nombre),
    responsablesDisponibles: cargos.map((c) => c.nombre),
  };
}

/// El alcance en una frase, para la portada.
///
/// Que diga «Todos los procesos» cuando no se filtró no es redundante: es la diferencia entre
/// un lector que sabe que tiene el inventario completo y uno que se lo supone.
function describirAlcance(
  procesos: readonly string[],
  responsables: readonly string[],
): string {
  const partes: string[] = [];
  partes.push(
    procesos.length === 0
      ? 'Todos los procesos'
      : `${procesos.length} ${procesos.length === 1 ? 'proceso' : 'procesos'}: ${procesos.join(', ')}`,
  );
  if (responsables.length > 0) {
    partes.push(
      `${responsables.length} ${responsables.length === 1 ? 'responsable' : 'responsables'}: ${responsables.join(', ')}`,
    );
  }
  return partes.join(' · ');
}
