'use client';

// app/sig/obligaciones/NuevaObligacion.tsx
//
// El formulario de la lista maestra del numeral 8.
//
// Pedía IDS DE BASE DE DATOS escritos a mano: «Persona (id)», «Cargo (id)», «Área (id)»,
// «Id del contenido (Contenidos)». O sea que para crear una obligación había que abrir otra
// pantalla, buscar la clave primaria y transcribirla — y un dígito equivocado creaba la
// obligación sobre el contenido de otro, sin que nada avisara, porque el id existía.
//
// Y le faltaba la pieza del lienzo que más importa: «Antes de guardar · esto es lo que va a
// generar». Una obligación mensual con alcance TODOS sobre 34 personas produce 408
// asignaciones al año, y sin esa cuenta eso se descubre DESPUÉS de crearla. Las
// asignaciones ya generadas no se borran: cada una puede tener un registro de realizado
// detrás, y ése es el que sostiene una auditoría.
//
// La cuenta la hace `lib/sig/prevision.ts`, puro y con 14 pruebas, usando el mismo módulo
// de periodos que la generación real. Si acá saliera otra cifra, la previsión estaría
// mintiendo sobre lo que va a pasar.

import { useMemo, useState } from 'react';
import { crearObligacion } from '@/app/sig/acciones/tareas';
import {
  preverGeneracion,
  type ActivoDelInventario,
  type PersonaDelCenso,
  type AlcanceObligacion,
} from '@/lib/sig/prevision';
import { esAlcancePorActivo } from '@/lib/sig/generacion';
import { decidirAlcancePorGrupo, type GrupoOfrecido } from '@/lib/sig/alcance-grupo';

/// Los alcances que esta pantalla puede OFRECER, derivados del enum con las exclusiones
/// escritas. Era una union a mano con los mismos seis valores, y por eso `NIVEL_ACTIVO`
/// nunca se noto que faltaba.
///
/// `NIVEL_ACTIVO` esta excluido a proposito: la resolucion de ese alcance no esta decidida
/// —ver el rechazo en `resolverAlcance`—, y ofrecerlo crearia obligaciones que no generan
/// nada.
///
/// **`TODOS` esta excluido por otro motivo, y el valor del enum NO se borra.** REQ-SIG-15 P11:
/// «Todas las personas» y el grupo derivado «Todos» del selector de grupos producen
/// exactamente el mismo conjunto, y dos entradas al mismo conjunto es como alguien crea la
/// misma obligacion dos veces sin darse cuenta. Asi que la pantalla deja de OFRECERLO, pero
/// `TODOS` sigue siendo lo que se PERSISTE al elegir el grupo derivado —ver
/// `lib/sig/alcance-grupo.ts`—, sigue siendo lo que resuelven el generador y la prevision, y
/// las obligaciones que ya lo usan no se migran. Borrarlo del enum romperia las tres cosas.
type Alcance = Exclude<AlcanceObligacion, 'NIVEL_ACTIVO' | 'TODOS'>;
type Periodicidad = 'UNICA' | 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

/// Las columnas de alcance tal como van a quedar guardadas. Existe porque en el alcance por
/// grupo **lo elegido y lo persistido no son lo mismo**: elegir «Todos» guarda `TODOS` sin
/// destino. La prevision y el guardado leen de acá, y por eso no pueden decir cosas distintas.
interface ColumnasDeAlcance {
  alcance: AlcanceObligacion;
  alcancePersonaId?: number;
  alcanceCargoId?: number;
  alcanceAreaId?: number;
  alcanceActivoId?: number;
  alcanceTipoActivoId?: number;
  alcanceGrupoInteresId?: number;
}

export interface CatalogosObligacion {
  contenidos: { id: number; codigo: string; titulo: string; tipo: string; procedimientoOrigen: string | null }[];
  personas: { id: number; nombre: string }[];
  cargos: { id: number; nombre: string }[];
  areas: { id: number; nombre: string }[];
  /// Los activos vigentes y los tipos MAGERIT: lo que hace posible el alcance por activo
  /// (D3). Sin ellos, POL-TEC-01 solo se podia cargar nombrando el activo en el titulo, en
  /// texto libre.
  activos: { id: number; codigo: string; nombre: string; tipo: string; sinPropietario: boolean }[];
  tiposDeActivo: { id: number; nombre: string; cuantos: number }[];
  /// REQ-SIG-15 P11 · los grupos de interés ACTIVOS, «Todos» incluido. Es lo que hace posible
  /// dirigir una obligación a un conjunto que no coincide con un área ni con un cargo: sin
  /// esto, «codificación segura» había que asignarla nombrando a las personas una por una, y
  /// quien entrara después no la recibía.
  gruposDeInteres: GrupoOfrecido[];
  /// El inventario con tipo y propietario: lo que la prevision necesita para contar los
  /// activos alcanzados y cuantos van a caer en el responsable de seguimiento.
  inventario: ActivoDelInventario[];
  /// El censo con su área y cargo: lo que la previsión necesita para resolver el alcance.
  censo: PersonaDelCenso[];
}

const PERIODICIDADES: { valor: Periodicidad; etiqueta: string }[] = [
  { valor: 'UNICA', etiqueta: 'Una sola vez' },
  { valor: 'DIARIA', etiqueta: 'Diaria' },
  { valor: 'SEMANAL', etiqueta: 'Semanal' },
  { valor: 'MENSUAL', etiqueta: 'Mensual' },
  { valor: 'TRIMESTRAL', etiqueta: 'Trimestral' },
  { valor: 'SEMESTRAL', etiqueta: 'Semestral' },
  { valor: 'ANUAL', etiqueta: 'Anual' },
];

const ALCANCES: { valor: Alcance; etiqueta: string; ayuda: string }[] = [
  // P11 · ocupa el lugar que tenía «Todas las personas». No es un reemplazo de nombre: acá
  // abajo se elige un grupo de la lista, y el grupo derivado «Todos» es el que cubre a toda la
  // organización. Una sola puerta al mismo conjunto.
  { valor: 'GRUPO_INTERES', etiqueta: 'Un grupo de interés', ayuda: 'Quienes pertenezcan a él' },
  { valor: 'AREA', etiqueta: 'Un área', ayuda: 'Quienes pertenezcan a ella' },
  { valor: 'CARGO', etiqueta: 'Un cargo', ayuda: 'Quienes lo ocupen, en cualquier área' },
  { valor: 'PERSONA', etiqueta: 'Una persona', ayuda: 'Sólo a ella' },
  // D3. La ayuda dice a QUIEN le llega, que es la pregunta que nadie hace hasta que la
  // tarea aparece en la bandeja de alguien inesperado: al propietario del activo, que es
  // un cargo, no una persona.
  { valor: 'TIPO_ACTIVO', etiqueta: 'Un tipo de activo', ayuda: 'Una tarea por activo, a su propietario' },
  { valor: 'ACTIVO', etiqueta: 'Un activo', ayuda: 'Solo ese, a su propietario' },
];

/// Qué se ofrece debajo del alcance, y cómo se llama la opción vacía.
///
/// Era una cadena de seis ternarios para la lista y otra de cinco para el rótulo: dos lugares
/// que hay que tocar al agregar un alcance, y nada obliga a tocar los dos. Acá es **un
/// `switch` exhaustivo sobre `Alcance`**, así que el día que se ofrezca un alcance nuevo el
/// compilador exige su lista y su rótulo juntos, en vez de caer al `else` de las personas.
function destinosDe(
  alcance: Alcance,
  catalogos: CatalogosObligacion,
): { rotulo: string; opciones: { id: number; nombre: string }[] } {
  switch (alcance) {
    case 'GRUPO_INTERES':
      return {
        rotulo: 'Elegir el grupo de interés…',
        opciones: catalogos.gruposDeInteres.map((g) => ({
          id: g.id,
          // El derivado se anuncia en la propia opción: es la que alcanza a TODA la
          // organización, y elegirla sin saberlo es la diferencia entre doce asignaciones al
          // año y cuatrocientas ocho. Es la misma razón por la que el tipo de activo muestra
          // su conteo — la cifra que decide va en la opción, no en la previsión de después.
          nombre: g.derivado ? `${g.nombre} — toda persona activa` : g.nombre,
        })),
      };
    case 'AREA':
      return { rotulo: 'Elegir el área…', opciones: catalogos.areas };
    case 'CARGO':
      return { rotulo: 'Elegir el cargo…', opciones: catalogos.cargos };
    case 'ACTIVO':
      return {
        rotulo: 'Elegir el activo…',
        opciones: catalogos.activos.map((a) => ({
          id: a.id,
          // El código va primero: es como se nombra un activo en el inventario y en una
          // auditoría, y hay activos con nombres parecidos.
          nombre: `${a.codigo} · ${a.nombre}${a.sinPropietario ? ' — sin propietario' : ''}`,
        })),
      };
    case 'TIPO_ACTIVO':
      return {
        rotulo: 'Elegir el tipo de activo…',
        opciones: catalogos.tiposDeActivo.map((t) => ({
          id: t.id,
          // El conteo va en la opción porque es la cifra que decide: elegir un tipo con 180
          // activos vigentes crea 180 asignaciones por periodo, y eso hay que saberlo ANTES
          // de elegirlo, no después en la previsión.
          nombre: `${t.nombre} — ${t.cuantos} activo(s) vigente(s)`,
        })),
      };
    case 'PERSONA':
      return { rotulo: 'Elegir la persona…', opciones: catalogos.personas };
  }
}

export default function NuevaObligacion({ catalogos }: { catalogos: CatalogosObligacion }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [contenidoId, setContenidoId] = useState('');
  // El arranque es el alcance por grupo, SIN grupo elegido. Era `TODOS`, que dejó de
  // ofrecerse: un formulario que arranca en un estado que el selector no muestra no tiene
  // ninguna opción marcada y no se entiende. Y el default tiene una consecuencia: `TODOS`
  // no pedía destino, así que el formulario nacía completo y se podía guardar de una —
  // «toda la organización» era lo que pasaba si nadie elegía nada. Ahora hay que elegir el
  // grupo, y si ese grupo es «Todos» es porque alguien lo decidió.
  const [alcance, setAlcance] = useState<Alcance>('GRUPO_INTERES');
  const [destinoId, setDestinoId] = useState('');
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>('MENSUAL');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [plazoDias, setPlazoDias] = useState('15');
  const [diasAviso, setDiasAviso] = useState('7');
  const [responsableId, setResponsableId] = useState('');
  const [notificar, setNotificar] = useState(true);

  const contenido = catalogos.contenidos.find((c) => c.id === Number(contenidoId)) ?? null;

  /// **Lo que se va a guardar, decidido UNA vez.** La previsión y el guardado leen de acá, y
  /// por eso no pueden contradecirse — que es la propiedad que sostiene el cuadro «esto es lo
  /// que va a generar»: si la previsión contara sobre un alcance y el `create` escribiera
  /// otro, el número de la pantalla sería una promesa que la generación no cumple.
  ///
  /// P11 es el primer alcance donde lo elegido y lo persistido **no son lo mismo**: elegir el
  /// grupo derivado «Todos» guarda `alcance: 'TODOS'` sin destino. La traducción la decide
  /// `lib/sig/alcance-grupo.ts`, que está probado; acá sólo se aplica.
  const persistido: ColumnasDeAlcance = useMemo(() => {
    const id = Number(destinoId) || undefined;
    if (alcance === 'GRUPO_INTERES') {
      const { destino } = decidirAlcancePorGrupo(Number(destinoId), catalogos.gruposDeInteres);
      // Sin grupo elegido todavía se previene con el alcance por grupo y sin destino: así la
      // previsión dice «falta elegir a quién alcanza» en vez de contar a toda la organización,
      // que es lo que haría si acá se cayera a `TODOS` por defecto.
      return destino ?? { alcance: 'GRUPO_INTERES' };
    }
    return {
      alcance,
      alcancePersonaId: alcance === 'PERSONA' ? id : undefined,
      alcanceCargoId: alcance === 'CARGO' ? id : undefined,
      alcanceAreaId: alcance === 'AREA' ? id : undefined,
      alcanceActivoId: alcance === 'ACTIVO' ? id : undefined,
      alcanceTipoActivoId: alcance === 'TIPO_ACTIVO' ? id : undefined,
    };
  }, [alcance, destinoId, catalogos.gruposDeInteres]);

  // La previsión se recalcula con cada tecla, como el panel de riesgos: el punto es ver el
  // efecto de la decisión mientras se toma, no después de guardarla.
  // Los dos alcances por activo cambian la unidad de la prevision y el texto de la ayuda.
  // Cuarta copia del mismo predicado, ahora importada. A esta le faltaba `NIVEL_ACTIVO`
  // igual que a la de `prevision.ts`.
  const porActivo = esAlcancePorActivo(persistido.alcance);

  const prevision = useMemo(
    () =>
      preverGeneracion(
        {
          ...persistido,
          periodicidad,
          fechaInicio: new Date(`${fechaInicio}T00:00:00.000Z`),
          plazoDias: Number(plazoDias),
        },
        catalogos.censo,
        new Date(),
        catalogos.inventario,
      ),
    [persistido, periodicidad, fechaInicio, plazoDias, catalogos.censo, catalogos.inventario],
  );

  const listo =
    contenidoId !== '' &&
    responsableId !== '' &&
    prevision.problemas.length === 0 &&
    fechaInicio !== '';

  const destinos = destinosDe(alcance, catalogos);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await crearObligacion({
      contenidoId: Number(contenidoId),
      // Las mismas columnas que la previsión acaba de contar, sin volver a derivarlas: era la
      // segunda copia de los cinco ternarios, y el día que las dos se separaran la pantalla
      // habría prometido un número y guardado otro alcance.
      ...persistido,
      periodicidad,
      fechaInicio: new Date(`${fechaInicio}T00:00:00.000Z`),
      plazoDias: Number(plazoDias),
      diasAviso: Number(diasAviso),
      responsableSeguimientoId: Number(responsableId),
      notificar,
    });
    setGuardando(false);
    if (r.ok) {
      window.location.reload();
      return;
    }
    setError(r.mensaje);
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-campo px-4 py-2.5 text-12_5 font-semibold text-white"
        style={{ background: 'var(--hf-brand-nav)', border: '1px solid var(--hf-brand-700)' }}
      >
        Nueva obligación
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
      <div className="my-auto flex w-full max-w-3xl flex-col gap-4 rounded-tarjeta border border-border-field bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-15 font-bold text-primary">Nueva obligación</h2>
          <button onClick={() => setAbierto(false)} className="text-12_5 text-muted">
            Cancelar
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Contenido</span>
          <select
            value={contenidoId}
            onChange={(e) => setContenidoId(e.target.value)}
            className="entrada-campo"
          >
            <option value="">Elegir el contenido…</option>
            {catalogos.contenidos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.titulo}
              </option>
            ))}
          </select>
          {contenido && (
            <span className="text-11 text-muted">
              {contenido.tipo.charAt(0) + contenido.tipo.slice(1).toLowerCase()}
              {contenido.procedimientoOrigen ? ` · ${contenido.procedimientoOrigen}` : ''}
            </span>
          )}
          {catalogos.contenidos.length === 0 && (
            <span className="text-11 text-muted [text-wrap:pretty]">
              No hay contenidos activos. Una obligación asigna un contenido, así que hay que
              crear uno primero en Contenidos.
            </span>
          )}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">¿A quién alcanza?</span>
          <div className="grid grid-cols-4 gap-2">
            {ALCANCES.map((a) => {
              const activo = alcance === a.valor;
              return (
                <button
                  key={a.valor}
                  onClick={() => {
                    setAlcance(a.valor);
                    setDestinoId('');
                  }}
                  aria-pressed={activo}
                  className="flex flex-col gap-0.5 rounded-campo px-3 py-2 text-left"
                  style={{
                    background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                  }}
                >
                  <span
                    className="text-12"
                    style={{
                      color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-primary)',
                      fontWeight: activo ? 600 : 500,
                    }}
                  >
                    {a.etiqueta}
                  </span>
                  <span className="text-10_5 text-muted">{a.ayuda}</span>
                </button>
              );
            })}
          </div>
          {/* El selector de destino ya no se esconde para ningún alcance. La condición era
              `alcance !== 'TODOS'`, porque «Todas las personas» era la única opción sin
              destino; ahora TODOS no se ofrece —P11— y los seis alcances que quedan exigen
              elegir algo. Elegir «toda la organización» es elegir el grupo «Todos» de esta
              misma lista. */}
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            className="entrada-campo mt-1"
          >
            <option value="">{destinos.rotulo}</option>
            {destinos.opciones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
          <span className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
            El alcance se resuelve <strong className="font-semibold">al generar cada periodo</strong>,
            no ahora: quien entre al área —o al grupo de interés— el mes que viene recibe la
            tarea de ese mes.
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">¿Cada cuánto?</span>
            <select
              value={periodicidad}
              onChange={(e) => setPeriodicidad(e.target.value as Periodicidad)}
              className="entrada-campo"
            >
              {PERIODICIDADES.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Primer periodo desde</span>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="entrada-campo font-mono"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Plazo · días</span>
            <input
              value={plazoDias}
              onChange={(e) => setPlazoDias(e.target.value)}
              inputMode="numeric"
              className="entrada-campo font-mono"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Avisar con · días</span>
            <input
              value={diasAviso}
              onChange={(e) => setDiasAviso(e.target.value)}
              inputMode="numeric"
              className="entrada-campo font-mono"
            />
          </label>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Responsable de seguimiento</span>
            <select
              value={responsableId}
              onChange={(e) => setResponsableId(e.target.value)}
              className="entrada-campo"
            >
              <option value="">Elegir persona…</option>
              {catalogos.personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Notificaciones</span>
            <button
              onClick={() => setNotificar(!notificar)}
              aria-pressed={notificar}
              className="rounded-campo px-3.5 py-2 text-12"
              style={{
                background: notificar ? 'var(--hf-accent-100)' : 'var(--hf-bg-app)',
                color: notificar ? 'var(--hf-accent-700)' : 'var(--hf-text-muted)',
                border: `1px solid ${notificar ? 'var(--hf-accent-500)' : 'var(--hf-border-field)'}`,
              }}
            >
              {notificar ? 'Avisa por correo' : 'Sin avisos'}
            </button>
          </label>
        </div>

        {/* «Antes de guardar · esto es lo que va a generar». La pieza que faltaba. */}
        <div
          className="flex flex-col gap-2.5 rounded-tarjeta px-4 py-3.5"
          style={{ background: 'var(--hf-bg-subtle)', border: '1px solid var(--hf-border-field)' }}
        >
          <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
            Antes de guardar · esto es lo que va a generar
          </span>

          {prevision.problemas.length > 0 ? (
            <span className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
              {prevision.problemas.join('. ')}.
            </span>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3">
                {/* En el alcance por activo la unidad es el ACTIVO, no la persona: mostrar
                    «0 personas» sobre 180 activos sería una previsión que no dice nada. */}
                {porActivo ? (
                  <Dato n={prevision.activos} etiqueta="Activos vigentes" />
                ) : (
                  <Dato n={prevision.personas} etiqueta="Personas" />
                )}
                <Dato n={prevision.periodosAlAnio} etiqueta="Periodos al año" />
                <Dato
                  n={prevision.asignacionesAlAnio}
                  etiqueta="Asignaciones al año"
                  alerta={prevision.asignacionesAlAnio > 500}
                />
                <span className="flex flex-col gap-1">
                  <span className="etiqueta-campo">Primeros vencimientos</span>
                  <span className="flex flex-col">
                    {prevision.primerosVencimientos.map((f) => (
                      <span key={f} className="font-mono text-10_5 text-secondary-soft">
                        {f}
                      </span>
                    ))}
                    {prevision.primerosVencimientos.length === 0 && (
                      <span className="font-mono text-10_5 text-label">—</span>
                    )}
                  </span>
                </span>
              </div>

              {prevision.avisos.map((a) => (
                <span
                  key={a}
                  className="rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
                  style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
                >
                  {a}.
                </span>
              ))}
            </>
          )}
        </div>

        {error && (
          <p
            className="rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
            style={{ background: 'var(--hf-danger-bg)', color: 'var(--hf-danger-text)' }}
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setAbierto(false)}
            className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-secondary"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={!listo || guardando}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            {guardando ? 'Creando…' : 'Crear obligación'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dato({ n, etiqueta, alerta }: { n: number; etiqueta: string; alerta?: boolean }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      <span
        className="font-mono text-17 font-semibold tabular-nums"
        style={{ color: alerta ? 'var(--hf-warn-text)' : 'var(--hf-text-primary)' }}
      >
        {n}
      </span>
    </span>
  );
}
