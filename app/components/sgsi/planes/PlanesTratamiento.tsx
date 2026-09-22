'use client';

// app/components/sgsi/planes/PlanesTratamiento.tsx
//
// Handoff v2.1 screen 8. The double-layer maturity bar is the piece that carries the
// most meaning per pixel: the pale layer marks the target and the solid one the current
// state, so the gap between them IS the pending work, readable without arithmetic.

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { eficaciaDeNivel } from '@/lib/sgsi/madurez';
import {
  cambiarEstadoAccion,
  darDeBajaAccion,
  restaurarAccion,
} from '@/app/sgsi/acciones/plan';
import type { EstadoAccion } from '@prisma/client';
import type { AlcancePlan } from '@/lib/sgsi/alcance-plan';
import PopupAccion from './PopupAccion';
import PopupAccionNueva from './PopupAccionNueva';
import FranjaSinPlan, { type FilaFranjaSinPlan } from './FranjaSinPlan';
import GanttPlanes from './GanttPlanes';
import ImportarPlanes from './ImportarPlanes';

export interface AccionVista {
  codigo: string;
  accion: string;
  tipo: string;
  origen: string;
  responsable: string;
  aprueba: string;
  fechaObjetivo: string | null;
  fechaAprobacion: string | null;
  /// Necesaria para el tablero: un plan cerrado tarde ya no es una deuda abierta, y sin esta
  /// fecha se quedaría en rojo compitiendo por atención con lo que sí está pendiente.
  fechaCierre: string | null;
  estado: string;
  avance: number;
  verificacion: string;
  observacion: string | null;
  recursos: string | null;
  madurezAlcanzada: number | null;
  justificacionAceptacion: string | null;
  control: {
    codigo: string;
    nombre: string;
    capacidad: string;
    lineaBase: number | null;
    actual: number | null;
    objetivo: number | null;
  } | null;
  /// Qué mitiga el plan: el control, sus amenazas de la valoración y a cuántos riesgos y
  /// activos llega. `null` = sin calcular, que NO es «no mitiga nada».
  alcance: AlcancePlan | null;
  controlId: number | null;
  responsableId: number;
  apruebaId: number;
  madurezAlcanzadaId: number | null;
  instrumento: string | null;
  riesgoRemanente: string | null;
  fechaRevisionAceptacion: string | null;
}

export interface OpcionControl {
  id: number;
  codigo: string;
  nombre: string;
}

export interface Opcion {
  id: number;
  nombre: string;
}

export interface OpcionMadurez {
  id: number;
  nivel: number;
  nombre: string;
}

const ESTADOS: Record<string, string> = {
  NO_INICIADA: 'No iniciada',
  EN_EJECUCION: 'En ejecución',
  EN_VERIFICACION: 'En verificación',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

const TIPOS: Record<string, string> = {
  MITIGAR: 'Mitigar',
  TRANSFERIR: 'Transferir',
  EVITAR: 'Evitar',
  ACEPTAR: 'Aceptar',
};

const VERIFICACIONES: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  VERIFICADA_EFICAZ: 'Verificada — eficaz',
  VERIFICADA_NO_EFICAZ: 'Verificada — no eficaz',
  NO_APLICA: 'No aplica',
};

/// CMM traffic light: L0-L1 red, L2-L3 orange, L4-L5 green. L3 is orange.
function semaforo(nivel: number | null) {
  if (nivel === null) {
    return { fg: 'var(--hf-cmm-nulo-fg)', bg: 'var(--hf-cmm-nulo-bg)', bd: 'var(--hf-cmm-nulo-bd)' };
  }
  if (nivel <= 1) {
    return { fg: 'var(--hf-cmm-rojo-fg)', bg: 'var(--hf-cmm-rojo-bg)', bd: 'var(--hf-cmm-rojo-bd)' };
  }
  if (nivel <= 3) {
    return {
      fg: 'var(--hf-cmm-naranja-fg)',
      bg: 'var(--hf-cmm-naranja-bg)',
      bd: 'var(--hf-cmm-naranja-bd)',
    };
  }
  return { fg: 'var(--hf-cmm-verde-fg)', bg: 'var(--hf-cmm-verde-bg)', bd: 'var(--hf-cmm-verde-bd)' };
}

function nivelTexto(v: number | null): string {
  return v === null ? '—' : `L${v}`;
}

export type Filtro = 'todas' | 'NO_INICIADA' | 'EN_EJECUCION' | 'CERRADA' | 'MITIGAR' | 'ACEPTAR';

/// Las seis opciones del desplegable, con la palabra EXACTA que se lee en pantalla. La
/// etiqueta viaja al archivo exportado —su hoja 2 dice qué filtro se aplicó—, así que tiene
/// que salir de acá y no de una segunda lista: un archivo que dijera «En ejecución» donde la
/// pantalla dice «En curso» obligaría a adivinar si son el mismo filtro.
export const OPCIONES_FILTRO: readonly { valor: Filtro; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'NO_INICIADA', etiqueta: 'No iniciada' },
  { valor: 'EN_EJECUCION', etiqueta: 'En curso' },
  { valor: 'CERRADA', etiqueta: 'Cerrada' },
  { valor: 'MITIGAR', etiqueta: 'Solo mitigar' },
  { valor: 'ACEPTAR', etiqueta: 'Solo aceptar' },
];

/// Qué acciones deja pasar el desplegable. Está extraído del `filter` que la grilla tenía
/// escrito en línea —y que la grilla sigue llamando— por dos razones: se puede probar de a
/// una opción en milisegundos, y el enlace de «Exportar» lo llama para armar la lista de
/// códigos que manda a la ruta, así que la grilla y el archivo no pueden discrepar sobre qué
/// entró.
///
/// Los dos últimos valores miran el TIPO y no el estado. Es la trampa de este desplegable:
/// `ACEPTAR` se parece a un estado y no lo es, y preguntarle por el estado daría cero filas
/// siempre, en silencio.
export function pasaFiltroPlanes(accion: { tipo: string; estado: string }, filtro: Filtro): boolean {
  if (filtro === 'todas') return true;
  if (filtro === 'MITIGAR' || filtro === 'ACEPTAR') return accion.tipo === filtro;
  return accion.estado === filtro;
}

export default function PlanesTratamiento({
  acciones,
  alcanceCalculable,
  controles,
  cargos,
  madurez,
  sinPlan,
}: {
  acciones: AccionVista[];
  alcanceCalculable: boolean;
  controles: OpcionControl[];
  cargos: Opcion[];
  madurez: OpcionMadurez[];
  /// REQ-SIG-20 §7.3 (tarea 4.17) · residuales Crítico sin plan de tratamiento. Ausente en
  /// pantallas que todavía no lo calculan.
  sinPlan?: FilaFranjaSinPlan[];
}) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  // La tabla sigue siendo la vista por omisión: es el registro, y es lo que un auditor pide.
  // El tablero responde otra pregunta —«¿cuáles no van a llegar?»— y se entra a él a
  // propósito, no por sorpresa.
  const [vista, setVista] = useState<'tabla' | 'tablero'>('tabla');
  const [importando, setImportando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [estados, setEstados] = useState<Record<string, string>>({});
  const [eliminadas, setEliminadas] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  // The edit popup, addressed by action code so a refresh re-reads the row.
  const [editando, setEditando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  // The state select persists on change: it is one field, and holding it locally would
  // mean a KPI on this very screen disagreeing with the database until someone
  // remembered to save.
  const cambiarEstado = (codigo: string, estado: string): void => {
    setEstados((s) => ({ ...s, [codigo]: estado }));
    iniciar(async () => {
      const r = await cambiarEstadoAccion(codigo, estado as EstadoAccion);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setEstados((s) => {
          const { [codigo]: _quitado, ...resto } = s;
          return resto;
        });
        router.refresh();
      }
    });
  };

  const darDeBaja = (codigo: string, motivo: string): void => {
    iniciar(async () => {
      const r = await darDeBajaAccion(codigo, motivo);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setEliminadas((e) => [...e, codigo]);
        setAbierta(null);
        router.refresh();
      }
    });
  };

  const deshacerBaja = (codigo: string): void => {
    iniciar(async () => {
      const r = await restaurarAccion(codigo);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setEliminadas((e) => e.filter((c) => c !== codigo));
        router.refresh();
      }
    });
  };

  const vigentes = useMemo(
    () =>
      acciones
        .filter((a) => !eliminadas.includes(a.codigo))
        .map((a) => ({ ...a, estado: estados[a.codigo] ?? a.estado })),
    [acciones, eliminadas, estados],
  );

  const visibles = vigentes.filter((a) => pasaFiltroPlanes(a, filtro));

  // ── A DÓNDE LLEVA «EXPORTAR» ──────────────────────────────────────────────────────────
  //
  // SIN FILTRO NO SE MANDAN CÓDIGOS, y es deliberado: la ruta baja entonces todas las
  // acciones activas que encuentre, incluidas las que esta pestaña —abierta desde ayer— no
  // alcanzó a ver. Con filtro sí viajan, porque «lo que la pantalla está mostrando» no se
  // puede derivar en el servidor sin volver a escribir allá el `pasaFiltroPlanes` de arriba
  // —este archivo lleva `'use client'`, y desde una ruta sus exportaciones son referencias de
  // cliente, no funciones llamables—, y dos copias del mismo predicado es cómo la grilla y el
  // archivo terminan diciendo cosas distintas. Es el mismo reparto que `exportar-analisis`:
  // los CÓDIGOS viajan, los datos se vuelven a leer.
  //
  // Y con filtro, `codigos` viaja SIEMPRE, aunque quede vacío. Omitirlo se leería como «sin
  // filtro» y bajaría el plan entero: es exactamente el defecto que `9cd892c` arregló en el
  // export del inventario, donde exportar con cero filas visibles bajaba los 378 activos.
  const enlaceExportar = ((): string => {
    if (filtro === 'todas') return '/api/sgsi/exportar-planes';
    const etiqueta = OPCIONES_FILTRO.find((o) => o.valor === filtro)?.etiqueta ?? filtro;
    const p = new URLSearchParams({
      filtro: etiqueta,
      codigos: visibles.map((a) => a.codigo).join(','),
    });
    return `/api/sgsi/exportar-planes?${p.toString()}`;
  })();

  // Pending maturity jump: the sum of what every action still has to climb.
  const saltoPendiente = vigentes.reduce((suma, a) => {
    if (!a.control) return suma;
    return suma + Math.max(0, (a.control.objetivo ?? 0) - (a.control.actual ?? 0));
  }, 0);

  // Se suman los riesgos y no los activos: cada amenaza tiene UN principal, así que ningún
  // riesgo se cuenta dos veces. Los activos sí se solapan entre planes y sumarlos mentiría.
  const riesgosAlcanzados = alcanceCalculable
    ? vigentes.reduce((s, a) => s + (a.alcance?.riesgos ?? 0), 0)
    : null;

  // SOBRE CUÁNTAS ACCIONES SE CALCULARON LAS DOS CIFRAS DE ARRIBA.
  //
  // Las dos sólo miran las acciones que tienen control, y eso es correcto: una póliza de
  // ciberriesgo no mueve la madurez de nada y no contiene ninguna amenaza, así que aporta 0 a
  // las dos. Lo que no es correcto es que la cifra se lea como si cubriera el plan entero.
  //
  // Es la misma forma de defecto que el acta de riesgo residual tuvo el 21/09: un denominador
  // que sólo contaba los casos resolubles mostraba «0 / 0», y «0 / 0» se lee como «no queda
  // nada por hacer». La cifra no miente; miente lo que uno cree que abarca.
  //
  // Sólo cuando los dos números difieren: decir «sobre 19 de 19» es ruido, y el ruido termina
  // en que nadie lee el pie el día que sí dice algo.
  const conControl = vigentes.filter((a) => a.control !== null).length;
  const denominador =
    conControl === vigentes.length ? '' : ` · sobre ${conControl} de ${vigentes.length} acciones`;

  const kpis = [
    { titulo: 'Acciones en el plan', valor: vigentes.length },
    { titulo: 'De mitigación', valor: vigentes.filter((a) => a.tipo === 'MITIGAR').length },
    { titulo: 'Cerradas', valor: vigentes.filter((a) => a.estado === 'CERRADA').length },
    { titulo: 'Sin iniciar', valor: vigentes.filter((a) => a.estado === 'NO_INICIADA').length },
    {
      titulo: 'Salto pendiente',
      valor: saltoPendiente,
      pie: `Σ máx(0, objetivo − actual)${denominador}`,
    },
    {
      titulo: 'Riesgos alcanzados',
      valor: riesgosAlcanzados ?? 'sin calcular',
      // Sin el cruce no hay cifra, y precisar el alcance de una cifra que no se calculó sería
      // tapar lo único que hay que leer ahí: que falta el cruce.
      pie: alcanceCalculable
        ? `sobre el inventario real${denominador}`
        : 'falta el cruce control-amenaza',
    },
  ];

  const ultimaEliminada = eliminadas[eliminadas.length - 1];

  return (
    <main className="px-8 pt-6 pb-14">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-pagina">Planes de tratamiento</h1>
          <p className="mt-1 font-mono text-10_5 tracking-[0.06em] text-faint">
            PLA-SIG-02 · ISO/IEC 27001:2022 cláusulas 6.1.3 y 8.3
          </p>
          <p className="parrafo mt-2 text-muted">
            Una fila por acción, no por riesgo: la unidad de gestión es la mejora de un
            control, porque al subir su madurez bajan de golpe todos los riesgos que ese
            control mitiga.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* La acción PRINCIPAL de la pantalla, y por eso lleva el acento y va primera:
              registrar una acción es lo que se viene a hacer acá; importar un FOR-SIG-13 es
              lo excepcional, una vez por libro.

              «Acción nueva» y no «Nuevo plan» ni «Nuevo riesgo»: es el vocabulario de esta
              pantalla, cuyo subtítulo dice «una fila por acción, no por riesgo». */}
          <button
            type="button"
            onClick={() => setCreando(true)}
            title="Registrar una acción del plan que no nace de un activo ni de un control con brecha: una póliza, una decisión del comité."
            className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            Acción nueva
          </button>

          <button
            type="button"
            onClick={() => setImportando(true)}
            title="Cargar el formato FOR-SIG-13 «Plan de Tratamiento y Mejora». Primero muestra qué pasaría; nada se escribe hasta confirmar."
            className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 font-semibold text-primary transition-colors hover:bg-surface-hover"
          >
            Importar FOR-SIG-13
          </button>

          {/* «Exportar» con el estilo secundario de «Importar», no con el acento verde: el
              acento ya lo tiene «Acción nueva», y dos acentos en una cabecera no jerarquizan
              nada — el ojo tiene que elegir entre dos cosas que se presentan como la principal.

              UN `<a download>` Y NO UN `fetch`. El navegador gestiona la descarga: no hay
              estado de «bajando…» que mantener, ni un blob que armar y revocar, ni un error
              que haya que pintar a mano. Y el destino se ve en la barra de estado antes de
              hacer clic, que es lo más honesto que puede hacer un botón que baja un archivo
              con el inventario en riesgo adentro. */}
          <a
            href={enlaceExportar}
            download
            title="Baja un Excel de dos hojas: los riesgos altos que justifican el plan y las acciones del plan de tratamiento, con el filtro que tengas puesto."
            className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 font-semibold text-primary transition-colors hover:bg-surface-hover"
          >
            Exportar
          </a>

          {/* El conmutador de vista. Dos pestañas y no un icono: «Tablero» dice lo que hay
              del otro lado, y un icono de barras habría que adivinarlo. */}
          <div className="flex overflow-hidden rounded-campo border border-border-field">
            {(['tabla', 'tablero'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                aria-pressed={vista === v}
                className={`px-3 py-1.5 text-12 font-semibold transition-colors ${
                  vista === v
                    ? 'bg-accent-700 text-white'
                    : 'bg-surface text-secondary hover:bg-surface-hover'
                }`}
              >
                {v === 'tabla' ? 'Tabla' : 'Tablero'}
              </button>
            ))}
          </div>

        {/* Las opciones salen de `OPCIONES_FILTRO` y no escritas acá: la etiqueta que se lee
            en este desplegable es la misma que la ruta escribe en la hoja 2 del archivo, y
            dos listas que se separan dejarían al archivo nombrando un filtro que la pantalla
            no ofrece.

            `aria-label` porque no tiene rótulo visible: la fila de cada acción trae su propio
            desplegable de estado, y sin esto los siete se anuncian igual. */}
        <select
          value={filtro}
          aria-label="Filtrar las acciones"
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          {OPCIONES_FILTRO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
        </div>
      </header>

      {sinPlan && <FranjaSinPlan filas={sinPlan} />}

      {aviso && (
        <div
          className="mb-4 rounded-campo border px-4 py-2.5 text-12"
          style={
            aviso.ok
              ? {
                  borderColor: 'var(--hf-accent-border)',
                  background: 'var(--hf-accent-100)',
                  color: 'var(--hf-accent-700)',
                }
              : {
                  borderColor: 'var(--hf-danger-border)',
                  background: 'var(--hf-danger-bg)',
                  color: 'var(--hf-danger-text)',
                }
          }
        >
          {aviso.texto}
        </div>
      )}

      {ultimaEliminada && (
        <div className="mb-4 flex items-center justify-between rounded-campo border border-danger-border bg-danger-bg px-4 py-2.5">
          <span className="text-12 text-danger-text">
            Se dio de baja la acción <span className="font-mono">{ultimaEliminada}</span>. La
            baja es lógica y quedó en la bitácora con su motivo.
          </span>
          <button
            onClick={() => deshacerBaja(ultimaEliminada)}
            disabled={pendiente}
            className="rounded-campo border border-danger-border px-3 py-1 font-mono text-10_5 uppercase tracking-[0.1em] text-danger-text transition-colors hover:bg-surface disabled:opacity-50"
          >
            {pendiente ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        </div>
      )}

      {/* Los seis KPI son de la TABLA: cuentan el registro. El tablero trae sus propias
          cuatro tarjetas, que cuentan otra cosa —plazos, no volumen— y apilar las diez
          convertiría la cabecera en un muro de cifras sin jerarquía. */}
      {vista === 'tabla' && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => (
            <div key={k.titulo} className="rounded-tarjeta border border-border-default bg-surface px-4 py-3">
              <p className="etiqueta-campo">{k.titulo}</p>
              <p className="cifra mt-1.5 text-22 text-primary">{k.valor}</p>
              {k.pie && <p className="mt-1 text-10 leading-tight text-faint">{k.pie}</p>}
            </div>
          ))}
        </div>
      )}

      {vista === 'tablero' && (
        <GanttPlanes
          // El MISMO filtro que la tabla. Dos vistas de la misma pantalla que responden a
          // filtros distintos es la forma más rápida de que alguien lea una cifra creyendo
          // que corresponde a lo que tenía seleccionado.
          planes={visibles.map((a) => ({
            codigo: a.codigo,
            accion: a.accion,
            tipo: a.tipo,
            responsable: a.responsable,
            fechaAprobacion: a.fechaAprobacion,
            fechaObjetivo: a.fechaObjetivo,
            fechaCierre: a.fechaCierre,
            estado: a.estado,
            avance: a.avance,
            control: a.control?.codigo ?? null,
          }))}
        />
      )}

      {vista === 'tabla' && (
      <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
        <div style={{ minWidth: 1420 }}>
          <table className="w-full border-collapse text-12">
            <thead>
              <tr className="bg-subtle text-left">
                <Th ancho={30}>
                  <span className="sr-only">Vista previa</span>
                </Th>
                <Th ancho={78}>Código</Th>
                <Th>Acción</Th>
                <Th ancho={92}>Tipo</Th>
                <Th ancho={100}>Control</Th>
                <Th ancho={220}>Madurez actual → objetivo</Th>
                <Th ancho={62}>Salto</Th>
                <Th ancho={150}>Qué mitiga</Th>
                <Th ancho={150}>Responsable</Th>
                <Th ancho={140}>Fecha objetivo</Th>
                <Th ancho={150}>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const estaAbierta = abierta === a.codigo;
                const salto = a.control
                  ? Math.max(0, (a.control.objetivo ?? 0) - (a.control.actual ?? 0))
                  : 0;
                return (
                  <tr
                    key={a.codigo}
                    // Ancla por código: la ficha del activo enlaza el plan que cubre un
                    // riesgo como /sgsi/planes#PT-001, y sin esto ese enlace dejaba a la
                    // persona en la cabecera de una lista de noventa y tres filas.
                    id={a.codigo}
                    onClick={() => setEditando(a.codigo)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setEditando(a.codigo);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Editar la acción ${a.codigo} ${a.accion}`}
                    style={{
                      background: estaAbierta ? 'var(--hf-accent-50)' : 'var(--hf-row-blanco)',
                    }}
                    className="cursor-pointer border-t border-hairline align-middle"
                  >
                    <Td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAbierta(estaAbierta ? null : a.codigo);
                        }}
                        title="Vista previa"
                        aria-label={`Vista previa de la acción ${a.codigo}`}
                        aria-expanded={estaAbierta}
                        className="h-5 w-5 rounded-campo text-11 leading-none text-muted transition-transform hover:bg-accent-50 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                      >
                        <span
                          style={{
                            transform: estaAbierta ? 'rotate(90deg)' : undefined,
                            display: 'inline-block',
                          }}
                        >
                          ▸
                        </span>
                      </button>
                    </Td>
                    <Td>
                      <span className="font-mono text-11 text-secondary">{a.codigo}</span>
                    </Td>
                    <Td>
                      <span className="text-12_5 text-primary">{a.accion}</span>
                    </Td>
                    <Td>
                      <span className="rounded-badge bg-subtle px-2 py-0.5 font-mono text-10 text-muted">
                        {TIPOS[a.tipo] ?? a.tipo}
                      </span>
                    </Td>
                    <Td>
                      {a.control ? (
                        <Link
                          href="/sgsi/controles"
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-11 text-accent-700 underline decoration-accent-border underline-offset-2"
                        >
                          {a.control.codigo}
                        </Link>
                      ) : (
                        <span className="text-11 text-faint">—</span>
                      )}
                    </Td>
                    <Td>
                      <BarraDoble control={a.control} />
                    </Td>
                    <Td>
                      <span className="font-mono text-11 tabular-nums text-secondary">
                        {salto > 0 ? `+${salto}` : '0'}
                      </span>
                    </Td>
                    <Td>
                      <CeldaAlcance alcance={a.alcance} />
                    </Td>
                    <Td>
                      <span className="text-11_5 text-muted">{a.responsable}</span>
                    </Td>
                    <Td>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-11 text-muted">
                          {a.fechaObjetivo ?? '—'}
                        </span>
                        {/* The bar was length and colour only, which reads as nothing to
                            anyone who cannot see it. The figure carries the meaning and
                            the bar is decoration, so it is hidden from the reader. */}
                        <span className="font-mono text-10 tabular-nums text-faint">
                          {a.avance}%
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="mt-1 block h-1.5 w-full overflow-hidden rounded-swatch bg-hairline"
                      >
                        <span
                          className="block h-full rounded-swatch bg-accent-500"
                          style={{ width: `${a.avance}%` }}
                        />
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditando(a.codigo);
                          }}
                          aria-label={`Editar la acción ${a.codigo}`}
                          title="Editar la acción"
                          className="h-6 w-6 flex-none rounded-campo border border-border-field text-11 leading-none text-muted transition-colors hover:bg-accent-50 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                        >
                          ✎
                        </button>
                      <select
                        value={a.estado}
                        disabled={pendiente}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => cambiarEstado(a.codigo, e.target.value)}
                        className="w-full rounded-campo border border-border-field bg-surface px-2 py-1 text-11 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-60"
                      >
                        {Object.entries(ESTADOS).map(([clave, etiqueta]) => (
                          <option key={clave} value={clave}>
                            {etiqueta}
                          </option>
                        ))}
                      </select>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {importando && <ImportarPlanes onCerrar={() => setImportando(false)} />}

      {creando && (
        <PopupAccionNueva
          controles={controles}
          cargos={cargos}
          madurez={madurez}
          onCerrar={() => setCreando(false)}
        />
      )}

      {editando && (
        <PopupAccion
          accion={vigentes.find((a) => a.codigo === editando)!}
          controles={controles}
          cargos={cargos}
          madurez={madurez}
          onCerrar={() => setEditando(null)}
        />
      )}

      {abierta && (
        <Detalle
          accion={visibles.find((a) => a.codigo === abierta)!}
          pendiente={pendiente}
          onEliminar={darDeBaja}
        />
      )}

      <p className="mt-5 text-11 text-faint">
        Mostrando {visibles.length} de {vigentes.length} acciones. Al cerrar una acción se
        registra la madurez alcanzada y el residual de los riesgos afectados se recalcula
        solo.
      </p>
    </main>
  );
}

/// Two layers: the pale one marks the target, the solid one the current state. The gap
/// between them is the pending work, readable without doing arithmetic.
function BarraDoble({ control }: { control: AccionVista['control'] }) {
  if (!control) return <span className="text-11 text-faint">—</span>;

  const actual = control.actual ?? 0;
  const objetivo = control.objetivo ?? 0;
  const sActual = semaforo(control.actual);
  const sObjetivo = semaforo(control.objetivo);

  return (
    <span className="flex items-center gap-2">
      <span
        className="rounded-badge border px-1.5 py-0.5 font-mono text-9_5"
        style={{ color: sActual.fg, background: sActual.bg, borderColor: sActual.bd }}
      >
        {nivelTexto(control.actual)}
      </span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-swatch bg-hairline">
        <span
          className="absolute inset-y-0 left-0 rounded-swatch"
          style={{ width: `${(objetivo / 5) * 100}%`, background: sObjetivo.bg }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-swatch"
          style={{ width: `${(actual / 5) * 100}%`, background: sActual.fg }}
        />
      </span>
      <span
        className="rounded-badge border px-1.5 py-0.5 font-mono text-9_5"
        style={{ color: sObjetivo.fg, background: sObjetivo.bg, borderColor: sObjetivo.bd }}
      >
        {nivelTexto(control.objetivo)}
      </span>
    </span>
  );
}

/// QUÉ MITIGA EL PLAN. Va arriba del detalle, antes que el origen y el seguimiento, porque
/// es la pregunta que trae al comité: a quién protege esto.
///
/// Las amenazas son las de la VALORACIÓN de las que el control es PRINCIPAL — no el catálogo
/// entero, ni las que acompaña como complementario. Un complementario no contiene la amenaza,
/// y listarlo haría creer que el plan la cubre. Lo decide `lib/sgsi/alcance-plan.ts`.
function BloqueAlcance({ alcance }: { alcance: AlcancePlan | null }) {
  const marco =
    'mb-5 rounded-tarjeta border border-border-default bg-surface px-4 pt-3.5 pb-4';

  if (alcance === null) {
    return (
      <section className={marco}>
        <p className="etiqueta-campo">Qué mitiga este plan</p>
        <p className="mt-1.5 text-11_5 text-faint">
          Sin calcular: todavía no hay ninguna relevancia asignada en el cruce
          control-amenaza, así que no se sabe qué contiene este control — que no es lo mismo
          que no contener nada.
        </p>
      </section>
    );
  }

  if (alcance.estado === 'sin-control') {
    return (
      <section className={marco}>
        <p className="etiqueta-campo">Qué mitiga este plan</p>
        <p className="mt-1.5 text-11_5 text-secondary">
          Este plan no mejora ningún control, así que no contiene amenazas ni tiene madurez
          que mover. Es el caso de transferir o aceptar: el riesgo remanente se traslada o se
          asume, no se reduce.
        </p>
      </section>
    );
  }

  return (
    <section className={marco}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="etiqueta-campo">Qué mitiga este plan</p>
        <p className="text-11_5 text-secondary">
          <span className="font-mono font-semibold">{alcance.control?.codigo}</span>{' '}
          {alcance.control?.nombre}
        </p>
      </div>

      {alcance.estado === 'sin-amenazas' ? (
        <p className="mt-2.5 rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-11_5 leading-relaxed text-warn-text">
          Este control <strong>no es el principal de ninguna amenaza</strong> de la valoración.
          El plan eleva su madurez, pero hoy no cierra ninguna brecha del registro de riesgos:
          ninguna amenaza depende de él para contenerse.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
            <Cifra n={alcance.amenazas.length} pie="amenazas contenidas" />
            <Cifra n={alcance.riesgos} pie="riesgos de la valoración" />
            <Cifra n={alcance.activos} pie="activos alcanzados" />
            {alcance.brecha !== null && <Cifra n={alcance.brecha} pie="puntos de brecha" />}
          </div>

          <ul className="mt-3 flex flex-col border-t border-hairline-faint">
            {alcance.amenazas.map((a) => (
              <li
                key={a.codigo}
                className="flex items-baseline gap-2.5 border-b border-hairline-faint py-1.5"
              >
                <span className="w-[46px] flex-none font-mono text-11 font-semibold text-secondary-soft">
                  {a.codigo}
                </span>
                <span className="min-w-0 flex-1 truncate text-11_5 text-secondary">{a.nombre}</span>
                <span className="flex-none font-mono text-11 tabular-nums text-muted">
                  {a.riesgos} {a.riesgos === 1 ? 'riesgo' : 'riesgos'} · {a.activos}{' '}
                  {a.activos === 1 ? 'activo' : 'activos'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/// La versión de una línea, para la columna. El detalle lo da `BloqueAlcance`.
///
/// «Sin calcular» y «no contiene ninguna amenaza» se dicen distinto y con color distinto:
/// el primero es una deuda del modelo, el segundo un hecho sobre el plan. Un guion para los
/// dos dejaría al lector sin saber cuál de las dos cosas está mirando.
function CeldaAlcance({ alcance }: { alcance: AlcancePlan | null }) {
  if (alcance === null) return <span className="text-10_5 text-faint">sin calcular</span>;
  if (alcance.estado === 'sin-control') {
    return <span className="text-10_5 text-faint">sin control</span>;
  }
  if (alcance.estado === 'sin-amenazas') {
    return (
      <span
        className="text-10_5 font-semibold text-warn-text"
        title="Este control no es el principal de ninguna amenaza de la valoración: el plan no cierra ninguna brecha del registro."
      >
        ninguna amenaza
      </span>
    );
  }
  return (
    <span
      className="text-11 text-secondary"
      title={alcance.amenazas.map((a) => `${a.codigo} ${a.nombre}`).join(' · ')}
    >
      <span className="font-mono tabular-nums font-semibold">{alcance.amenazas.length}</span>{' '}
      {alcance.amenazas.length === 1 ? 'amenaza' : 'amenazas'}
      <br />
      <span className="text-10_5 text-muted">
        <span className="font-mono tabular-nums">{alcance.riesgos}</span> riesgos ·{' '}
        <span className="font-mono tabular-nums">{alcance.activos}</span> activos
      </span>
    </span>
  );
}

function Cifra({ n, pie }: { n: number; pie: string }) {
  return (
    <span className="flex flex-col">
      <span className="cifra text-17 tabular-nums text-primary">{n}</span>
      <span className="text-10_5 text-faint">{pie}</span>
    </span>
  );
}

function Detalle({
  accion,
  pendiente,
  onEliminar,
}: {
  accion: AccionVista;
  pendiente: boolean;
  onEliminar: (codigo: string, motivo: string) => void;
}) {
  // The reason is asked for BEFORE the delete, not after it fails: the action requires
  // it, so a button that could be refused is a button that should not be pressable.
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const versiones = [
    { titulo: 'Versión inicial', nivel: accion.control?.lineaBase ?? null },
    { titulo: 'Madurez actual', nivel: accion.control?.actual ?? null, actual: true },
    { titulo: 'Versión objetivo', nivel: accion.control?.objetivo ?? null },
  ];

  return (
    <section className="mt-4 rounded-tarjeta border border-border-default bg-subtle p-5">
      <BloqueAlcance alcance={accion.alcance} />

      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div>
          <p className="etiqueta-campo">Origen y justificación</p>
          <p className="parrafo mt-1.5 text-11_5">{accion.origen}</p>
        </div>

        <div>
          <p className="etiqueta-campo">Control asociado</p>
          {accion.control ? (
            <>
              <p className="mt-1.5 text-11_5 text-secondary">
                <span className="font-mono">{accion.control.codigo}</span>{' '}
                {accion.control.nombre}
              </p>
              <p className="mt-1 text-11 text-faint">{accion.control.capacidad}</p>
            </>
          ) : (
            <p className="mt-1.5 text-11_5 text-faint">sin control asociado</p>
          )}
          {accion.recursos && (
            <>
              <p className="etiqueta-campo mt-3">Recursos</p>
              <p className="mt-1 text-11_5 text-muted">{accion.recursos}</p>
            </>
          )}
        </div>

        <div>
          <p className="etiqueta-campo">Aprobación y verificación</p>
          <p className="mt-1.5 text-11_5 text-secondary">
            Aprueba {accion.aprueba}
            {accion.fechaAprobacion && (
              <span className="font-mono text-11 text-faint"> · {accion.fechaAprobacion}</span>
            )}
          </p>
          <p className="mt-1 text-11_5 text-muted">
            {VERIFICACIONES[accion.verificacion] ?? accion.verificacion}
            {accion.madurezAlcanzada !== null && ` · alcanzó ${nivelTexto(accion.madurezAlcanzada)}`}
          </p>
          {accion.observacion && (
            <p className="parrafo mt-2 text-11 text-muted">{accion.observacion}</p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {versiones.map((v) => {
          const s = semaforo(v.nivel);
          return (
            <div
              key={v.titulo}
              className="rounded-tarjeta p-3"
              style={{
                background: s.bg,
                border: v.actual ? `2px solid ${s.fg}` : `1px solid ${s.bd}`,
              }}
            >
              <p className="etiqueta-campo" style={{ color: s.fg }}>
                {v.titulo}
              </p>
              <p className="cifra mt-1 text-20" style={{ color: s.fg }}>
                {nivelTexto(v.nivel)}
              </p>
              <p className="mt-0.5 font-mono text-10" style={{ color: s.fg }}>
                eficacia {Math.round(eficaciaDeNivel(v.nivel) * 100)}%
              </p>
            </div>
          );
        })}
      </div>

      {confirmando ? (
        <div className="mt-5 rounded-campo border border-danger-border bg-danger-bg p-4">
          <p className="etiqueta-campo" style={{ color: 'var(--hf-danger-text)' }}>
            Motivo de la baja · obligatorio
          </p>
          <p className="mt-1 text-11 text-danger-text">
            La acción no se borra: sale de la grilla y de los KPI, y el motivo queda en la
            bitácora con tu nombre y la fecha.
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Por qué sale del plan"
            className="mt-2 w-full rounded-campo border border-danger-border bg-surface px-3 py-2 text-12 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          />
          <div className="mt-2.5 flex justify-end gap-2">
            <button
              onClick={() => {
                setConfirmando(false);
                setMotivo('');
              }}
              className="rounded-campo border border-border-field px-3 py-1.5 text-12 text-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              onClick={() => onEliminar(accion.codigo, motivo)}
              disabled={pendiente || motivo.trim() === ''}
              title={motivo.trim() === '' ? 'Escribí el motivo para poder dar de baja' : undefined}
              className="rounded-campo px-3 py-1.5 font-mono text-10_5 uppercase tracking-[0.1em] text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--hf-danger-text)' }}
            >
              {pendiente ? 'Dando de baja…' : 'Confirmar la baja'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => setConfirmando(true)}
            className="rounded-campo border border-danger-border px-3 py-1.5 font-mono text-10_5 uppercase tracking-[0.1em] text-danger-text hover:bg-danger-bg"
          >
            Dar de baja la acción
          </button>
        </div>
      )}
    </section>
  );
}

function Th({ children, ancho }: { children: React.ReactNode; ancho?: number }) {
  return (
    <th
      style={ancho ? { width: ancho } : undefined}
      className="etiqueta-campo px-3 py-2.5 font-normal"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}
