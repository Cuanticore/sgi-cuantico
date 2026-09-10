// app/sig/estado/page.tsx
//
// **La pregunta va primero que cualquier porcentaje: ¿el sistema está midiendo?**
//
// Si `generar-asignaciones` no corrió, los indicadores de abajo no son bajos porque la
// gente incumpla: son bajos porque los periodos no se abrieron. Mostrar el porcentaje sin
// esa advertencia arriba convierte un fallo de infraestructura en una acusación al equipo.
//
// Los cuatro indicadores CRUZAN módulos a propósito. Antes eran cuatro vistas de una sola
// cosa —asignaciones abiertas, vencidas, cumplimiento histórico y total— y una pantalla
// llamada «Estado del sistema» que sólo mira el motor de tareas deja fuera los hallazgos,
// los riesgos y el programa de auditoría, que es donde el sistema se cae de verdad. Las
// asignaciones no se pierden: el cumplimiento del mes es el primero de los cuatro, las
// vencidas viven en la barra por área de abajo, y el detalle está en `/sig/tablero-tareas`.

import { prisma } from '@/lib/db';
import {
  estadoDeTrabajo,
  saludDelSistema,
  TRABAJOS,
  type EstadoTrabajo,
} from '@/lib/sig/trabajos-catalogo';
import { esVencida } from '@/lib/sig/cierre';
import { cumplimientoDePeriodo, type AsignacionIndicador } from '@/lib/sig/cumplimiento';
import { vencidoContra } from '@/lib/sig/hallazgos';
import { listarFaltantes } from '@/lib/sig/auditorias';
import { anomaliasDelSistema, totalDeAnomalias } from '@/lib/sig/anomalias';
import { clasificar } from '@/lib/sgsi/clasificar';
import EstadoClient, { type Indicador } from './Estado.client';

export const dynamic = 'force-dynamic';

export default async function EstadoPage() {
  const ahora = new Date();
  const anio = ahora.getUTCFullYear();
  // El mes en curso, por día UTC como todo lo demás del sistema.
  const inicioDelMes = new Date(Date.UTC(anio, ahora.getUTCMonth(), 1));
  const finDelMes = new Date(Date.UTC(anio, ahora.getUTCMonth() + 1, 1));

  const [
    ejecuciones,
    asignaciones,
    procesos,
    hallazgosAbiertos,
    riesgos,
    umbrales,
    programa,
    activos,
    personas,
    actasBorrado,
    accesos,
    excepciones,
    organizaciones,
    intentosScorm,
  ] = await Promise.all([
    // La última corrida de cada trabajo. Se traen las recientes y se agrupa acá: un
    // `groupBy` con el máximo por trabajo no devuelve el resultado de esa corrida, y sin el
    // resultado no se distingue «corrió» de «corrió y reventó».
    prisma.ejecucionTrabajo.findMany({
      orderBy: { inicio: 'desc' },
      take: 200,
      select: { trabajo: true, inicio: true, resultado: true, creados: true, error: true, invocadoPor: true },
    }),
    prisma.asignacion.findMany({
      select: {
        estado: true,
        fechaLimite: true,
        fechaCierre: true,
        persona: { select: { areaId: true } },
      },
    }),
    prisma.area.findMany({ where: { activa: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    // Abierto es «ni cerrado ni anulado»: `estadoCalculado` reparte los demás estados
    // (EN_ANALISIS, EN_EJECUCION, EN_VERIFICACION) pero todos ellos siguen abiertos, así
    // que traer las relaciones sólo para volver a colapsarlas sería trabajo perdido.
    prisma.hallazgo.findMany({
      where: { fechaCierre: null, anuladoEn: null },
      select: { fechaCompromiso: true },
    }),
    prisma.riesgo.findMany({
      where: { obsoleto: false },
      select: { riesgoResidual: true, tratamientoId: true },
    }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' }, select: { nombre: true, desde: true, hasta: true } }),
    prisma.programaAuditoria.findUnique({
      where: { anio },
      select: {
        programadas: {
          select: { procesoRef: true, auditorias: { select: { emitidoEn: true } } },
        },
      },
    }),
    prisma.activo.findMany({ select: { activo: true, propietarioId: true } }),
    prisma.persona.findMany({
      select: { id: true, activa: true, retiradoEn: true, origen: true },
    }),
    prisma.actaBorradoSeguro.findMany({ select: { personaId: true } }),
    prisma.accesoPersona.findMany({ select: { hasta: true, solicitudId: true } }),
    prisma.excepcionSeguridad.findMany({ select: { fechaCierre: true, cerradaEn: true } }),
    prisma.proveedor.findMany({
      select: {
        tipo: true,
        activo: true,
        // Sólo los activos EN USO. Un proveedor cuyos activos están todos dados de baja ya
        // no tiene nada a cargo, y contarlo lo dejaría en la lista para siempre.
        _count: { select: { activos: { where: { activo: true } } } },
        evaluaciones: { select: { anio: true, fecha: true, resultado: true } },
      },
    }),
    prisma.intentoScorm.findMany({ select: { estado: true } }),
  ]);

  const ultimaPorTrabajo = new Map<string, (typeof ejecuciones)[number]>();
  for (const e of ejecuciones) if (!ultimaPorTrabajo.has(e.trabajo)) ultimaPorTrabajo.set(e.trabajo, e);

  const estados = TRABAJOS.map((t) => {
    const u = ultimaPorTrabajo.get(t.nombre) ?? null;
    return {
      trabajo: t.nombre,
      descripcion: t.descripcion,
      cuando: t.cuando,
      disponible: t.disponible,
      inicio: u?.inicio.toISOString().slice(0, 16).replace('T', ' ') ?? null,
      creados: u?.creados ?? null,
      invocadoPor: u?.invocadoPor ?? null,
      error: u?.error ?? null,
      estado: estadoDeTrabajo(
        t.cuando,
        u === null ? null : { trabajo: t.nombre, inicio: u.inicio, resultado: u.resultado },
        ahora,
      ) as EstadoTrabajo,
    };
  });

  const salud = saludDelSistema(estados.map((e) => ({ trabajo: e.trabajo, estado: e.estado })));

  // ── Indicador 1 · Cumplimiento del mes ──────────────────────────────────────────────
  //
  // Del MES, no del histórico. El histórico sube y baja tan despacio que un mes malo no se
  // nota, que es justamente lo que un tablero de estado tiene que hacer notar. Se acota por
  // fecha límite y se mide con `cumplimientoDePeriodo`, que es la misma regla de la barra
  // de Obligaciones y del correo mensual: «nunca pueden contradecir a la bandeja».
  const delMes: AsignacionIndicador[] = asignaciones
    .filter((a) => a.fechaLimite >= inicioDelMes && a.fechaLimite < finDelMes)
    .map((a) => ({
      id: 0,
      estado: a.estado as AsignacionIndicador['estado'],
      fechaLimite: a.fechaLimite,
      fechaCierre: a.fechaCierre,
      // `cumplimientoDePeriodo` no los usa; van en cero porque el tipo los pide, igual que
      // en `lib/sig/resumen.ts`.
      personaId: 0,
      cerradaPor: null,
    }));
  const cumplimientoMes = cumplimientoDePeriodo(delMes);

  // ── Indicador 2 · Hallazgos abiertos ────────────────────────────────────────────────
  const hallazgosVencidos = hallazgosAbiertos.filter((h) =>
    vencidoContra(h.fechaCompromiso, ahora),
  ).length;
  // B3: hasta que se clasifica, el hallazgo no consume plazos. Sin fecha compromiso no se
  // puede decir si está vencido, y decir «0 vencidos» cuando ninguno tiene plazo sería el
  // cero que en realidad es «no medido».
  const hallazgosSinPlazo = hallazgosAbiertos.filter((h) => h.fechaCompromiso === null).length;

  // ── Indicador 3 · Riesgos en zona alta ──────────────────────────────────────────────
  //
  // «Zona alta» son las dos peores bandas de `UmbralRiesgo` —Crítico y Alto—, identificadas
  // por su POSICIÓN en la lista ordenada. Es la misma convención que `tratamientoSugerido`
  // en `lib/sgsi/clasificar.ts`, donde el índice 0 y el 1 son las que exigen mitigar.
  const bandas = umbrales.map((u) => ({
    nombre: u.nombre,
    desde: u.desde.toString(),
    hasta: u.hasta.toString(),
  }));
  const riesgosCalculados = riesgos.filter((r) => r.riesgoResidual !== null);
  const enZonaAlta = riesgosCalculados.filter((r) => {
    const banda = clasificar(r.riesgoResidual!.toString(), bandas);
    if (banda === null) return false;
    return bandas.findIndex((b) => b.nombre === banda) <= 1;
  });
  const altosSinTratamiento = enZonaAlta.filter((r) => r.tratamientoId === null).length;

  // ── Indicador 4 · Programa de auditoría ─────────────────────────────────────────────
  //
  // El mismo criterio que la matriz de `/sig/auditorias/programa`: una auditoría programada
  // está cumplida cuando alguna de sus auditorías emitió informe. Sin informe emitido la
  // auditoría ocurrió pero no cerró, y el programa anual se mide por lo que entregó.
  const programadas = programa?.programadas ?? [];
  const emitidas = programadas.filter((p) => p.auditorias.some((a) => a.emitidoEn !== null));
  const pendientesDelPrograma = programadas
    .filter((p) => !p.auditorias.some((a) => a.emitidoEn !== null))
    .map((p) => p.procesoRef);

  const indicadores: Indicador[] = [
    {
      etiqueta: 'Cumplimiento del mes',
      valor: cumplimientoMes.porciento === null ? '—' : `${cumplimientoMes.porciento} %`,
      nota:
        cumplimientoMes.porciento === null
          ? 'no hay asignaciones con fecha límite este mes'
          : `${cumplimientoMes.realizadasATiempo} de ${cumplimientoMes.asignadas} asignaciones a tiempo`,
      tono:
        cumplimientoMes.porciento === null
          ? 'NEUTRO'
          : cumplimientoMes.porciento >= 80
            ? 'BIEN'
            : cumplimientoMes.porciento >= 50
              ? 'ATENCION'
              : 'MAL',
      // El único de los cuatro que depende del motor de asignaciones.
      dependeDelMotor: true,
    },
    {
      etiqueta: 'Hallazgos abiertos',
      valor: String(hallazgosAbiertos.length),
      nota:
        hallazgosAbiertos.length === 0
          ? 'ninguno abierto'
          : [
              hallazgosVencidos === 0 ? 'ninguno con plazo vencido' : `${hallazgosVencidos} con plazo vencido`,
              hallazgosSinPlazo > 0 ? `${hallazgosSinPlazo} sin fecha compromiso` : null,
            ]
              .filter((t) => t !== null)
              .join(' · '),
      tono: hallazgosVencidos > 0 ? 'MAL' : hallazgosAbiertos.length > 0 ? 'ATENCION' : 'BIEN',
      dependeDelMotor: false,
    },
    {
      etiqueta: 'Riesgos en zona alta',
      // Sin bandas parametrizadas o sin residual calculado NO hay cero: hay «no se midió».
      // Hoy el residual está en NULL en todos los riesgos porque no se ha asignado la
      // relevancia control-amenaza, y pintar «0 en zona alta» afirmaría que no hay riesgos
      // altos cuando lo cierto es que ninguno se ha calculado.
      valor:
        bandas.length === 0 || riesgosCalculados.length === 0
          ? '—'
          : String(enZonaAlta.length),
      nota:
        bandas.length === 0
          ? 'no hay bandas de riesgo parametrizadas'
          : riesgosCalculados.length === 0
            ? `ningún riesgo tiene residual calculado (${riesgos.length} vigentes)`
            : [
                altosSinTratamiento === 0
                  ? 'todos con tratamiento definido'
                  : `${altosSinTratamiento} sin tratamiento definido`,
                riesgos.length > riesgosCalculados.length
                  ? `${riesgos.length - riesgosCalculados.length} sin calcular`
                  : null,
              ]
                .filter((t) => t !== null)
                .join(' · '),
      tono:
        bandas.length === 0 || riesgosCalculados.length === 0
          ? 'NEUTRO'
          : enZonaAlta.length === 0
            ? 'BIEN'
            : 'MAL',
      dependeDelMotor: false,
    },
    {
      etiqueta: 'Programa de auditoría',
      valor: programadas.length === 0 ? '—' : `${emitidas.length}/${programadas.length}`,
      nota:
        programa === null
          ? `no hay programa de auditoría de ${anio}`
          : programadas.length === 0
            ? `el programa de ${anio} no tiene auditorías programadas`
            : pendientesDelPrograma.length === 0
              ? 'todo el programa emitió informe'
              : `falta ${listarFaltantes(pendientesDelPrograma, 3)}`,
      tono:
        programadas.length === 0
          ? 'NEUTRO'
          : pendientesDelPrograma.length === 0
            ? 'BIEN'
            : 'ATENCION',
      dependeDelMotor: false,
    },
  ];

  // ── Lo que nadie está mirando ───────────────────────────────────────────────────────
  //
  // Las siete consultas de arriba se pasan crudas: la regla de cada cruce vive en
  // `lib/sig/anomalias.ts` y se prueba sin base de datos.
  const anomalias = anomaliasDelSistema(
    {
      activos,
      personas,
      conActaDeBorrado: new Set(actasBorrado.map((a) => a.personaId)),
      accesos,
      excepciones,
      organizaciones: organizaciones.map((o) => ({
        esProveedor: o.tipo === 'PROVEEDOR',
        activa: o.activo,
        activosACargo: o._count.activos,
        evaluaciones: o.evaluaciones,
      })),
      intentosScorm,
    },
    ahora,
  );
  const totalAnomalias = totalDeAnomalias(anomalias);

  // Cumplimiento por área. El lienzo dice «por proceso»: `Proceso` existe como entidad pero
  // los activos y las personas siguen clasificados por `Area` (D16), así que se agrupa por
  // lo que el dato realmente tiene y la pantalla lo dice. Verificado contra el esquema:
  // `Persona` no tiene `procesoId` y un área agrupa VARIOS procesos, así que de un área no
  // se puede deducir un proceso; además `Proceso` nace vacía a propósito. Sigue sin haber
  // vínculo utilizable.
  const porArea = procesos
    .map((p) => {
      const suyas = asignaciones.filter((a) => a.persona.areaId === p.id);
      const suyasCerradas = suyas.filter((a) => a.estado === 'REALIZADA').length;
      return {
        id: p.id,
        nombre: p.nombre,
        total: suyas.length,
        porcentaje: suyas.length === 0 ? null : Math.round((suyasCerradas / suyas.length) * 100),
        // Las vencidas que siguen abiertas, como en el lienzo: «no desaparecen del conteo
        // por estar vencidas, porque siguen siendo exigibles». Es también dónde queda la
        // cifra de vencidas que los cuatro indicadores dejaron de mostrar.
        vencidas: suyas.filter((a) => esVencida(a.estado, a.fechaLimite, ahora)).length,
      };
    })
    .filter((p) => p.total > 0);

  return (
    <EstadoClient
      ahora={ahora.toISOString().slice(0, 16).replace('T', ' ')}
      midiendo={salud.midiendo}
      culpables={salud.culpables}
      trabajos={estados}
      indicadores={indicadores}
      anomalias={anomalias}
      totalAnomalias={totalAnomalias}
      porArea={porArea}
      sinAreas={procesos.length === 0}
    />
  );
}
