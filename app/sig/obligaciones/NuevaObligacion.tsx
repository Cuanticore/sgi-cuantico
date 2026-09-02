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
import { preverGeneracion, type PersonaDelCenso } from '@/lib/sig/prevision';

type Alcance = 'PERSONA' | 'CARGO' | 'AREA' | 'TODOS';
type Periodicidad = 'UNICA' | 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

export interface CatalogosObligacion {
  contenidos: { id: number; codigo: string; titulo: string; tipo: string; procedimientoOrigen: string | null }[];
  personas: { id: number; nombre: string }[];
  cargos: { id: number; nombre: string }[];
  areas: { id: number; nombre: string }[];
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
  { valor: 'TODOS', etiqueta: 'Todas las personas', ayuda: 'Toda la organización' },
  { valor: 'AREA', etiqueta: 'Un área', ayuda: 'Quienes pertenezcan a ella' },
  { valor: 'CARGO', etiqueta: 'Un cargo', ayuda: 'Quienes lo ocupen, en cualquier área' },
  { valor: 'PERSONA', etiqueta: 'Una persona', ayuda: 'Sólo a ella' },
];

export default function NuevaObligacion({ catalogos }: { catalogos: CatalogosObligacion }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [contenidoId, setContenidoId] = useState('');
  const [alcance, setAlcance] = useState<Alcance>('TODOS');
  const [destinoId, setDestinoId] = useState('');
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>('MENSUAL');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [plazoDias, setPlazoDias] = useState('15');
  const [diasAviso, setDiasAviso] = useState('7');
  const [responsableId, setResponsableId] = useState('');
  const [notificar, setNotificar] = useState(true);

  const contenido = catalogos.contenidos.find((c) => c.id === Number(contenidoId)) ?? null;

  // La previsión se recalcula con cada tecla, como el panel de riesgos: el punto es ver el
  // efecto de la decisión mientras se toma, no después de guardarla.
  const prevision = useMemo(
    () =>
      preverGeneracion(
        {
          alcance,
          alcancePersonaId: alcance === 'PERSONA' ? Number(destinoId) || undefined : undefined,
          alcanceCargoId: alcance === 'CARGO' ? Number(destinoId) || undefined : undefined,
          alcanceAreaId: alcance === 'AREA' ? Number(destinoId) || undefined : undefined,
          periodicidad,
          fechaInicio: new Date(`${fechaInicio}T00:00:00.000Z`),
          plazoDias: Number(plazoDias),
        },
        catalogos.censo,
        new Date(),
      ),
    [alcance, destinoId, periodicidad, fechaInicio, plazoDias, catalogos.censo],
  );

  const listo =
    contenidoId !== '' &&
    responsableId !== '' &&
    prevision.problemas.length === 0 &&
    fechaInicio !== '';

  const destinos =
    alcance === 'AREA' ? catalogos.areas : alcance === 'CARGO' ? catalogos.cargos : catalogos.personas;

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await crearObligacion({
      contenidoId: Number(contenidoId),
      alcance,
      alcancePersonaId: alcance === 'PERSONA' ? Number(destinoId) : undefined,
      alcanceCargoId: alcance === 'CARGO' ? Number(destinoId) : undefined,
      alcanceAreaId: alcance === 'AREA' ? Number(destinoId) : undefined,
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
          {alcance !== 'TODOS' && (
            <select
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              className="entrada-campo mt-1"
            >
              <option value="">
                {alcance === 'AREA' ? 'Elegir el área…' : alcance === 'CARGO' ? 'Elegir el cargo…' : 'Elegir la persona…'}
              </option>
              {destinos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          )}
          <span className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
            El alcance se resuelve <strong className="font-semibold">al generar cada periodo</strong>,
            no ahora: quien entre al área el mes que viene recibe la tarea de ese mes.
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
                <Dato n={prevision.personas} etiqueta="Personas" />
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
