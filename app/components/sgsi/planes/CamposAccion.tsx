'use client';

// app/components/sgsi/planes/CamposAccion.tsx
//
// Los campos del formulario de una acción del plan, sin carcasa y sin pie de botones.
//
// Salieron de `PopupAccion.tsx` porque hay DOS formularios sobre la misma acción —editar una
// que ya existe y crear una nueva— y una segunda copia de trece campos es una copia que se
// desincroniza: el día que alguien agregue un campo a la edición, la creación seguirá
// guardando sin él y nadie se enterará hasta que falte en la base.
//
// Este componente NO decide qué se hace con los datos: recibe el estado y el `set`, y los
// devuelve tal cual. Quién guarda, con qué acción de servidor y con qué botones lo deciden
// las dos carcasas.
//
// ── POR QUÉ `seguimiento` ───────────────────────────────────────────────────────────────
//
// Estado, Avance, Verificación de eficacia y Madurez alcanzada son el SEGUIMIENTO de una
// acción, no su definición. Una acción que todavía no existe no puede estar «En ejecución»
// al 40 % ni haber alcanzado una madurez: ofrecerlos al crear sería ofrecer campos cuya única
// respuesta honesta ya está fijada por el servidor (`NO_INICIADA` / `0` / `PENDIENTE`).

import Link from 'next/link';
import type { DatosAccion } from '@/app/sgsi/acciones/plan';
import type { EstadoAccion, TipoAccion, VerificacionEficacia } from '@prisma/client';
import type { Opcion, OpcionControl, OpcionMadurez } from './PlanesTratamiento';

const TIPOS: { valor: TipoAccion; etiqueta: string }[] = [
  { valor: 'MITIGAR', etiqueta: 'Mitigar' },
  { valor: 'TRANSFERIR', etiqueta: 'Transferir' },
  { valor: 'EVITAR', etiqueta: 'Evitar' },
  { valor: 'ACEPTAR', etiqueta: 'Aceptar' },
];

const ESTADOS: { valor: EstadoAccion; etiqueta: string }[] = [
  { valor: 'NO_INICIADA', etiqueta: 'No iniciada' },
  { valor: 'EN_EJECUCION', etiqueta: 'En ejecución' },
  { valor: 'EN_VERIFICACION', etiqueta: 'En verificación' },
  { valor: 'CERRADA', etiqueta: 'Cerrada' },
  { valor: 'CANCELADA', etiqueta: 'Cancelada' },
];

const VERIFICACIONES: { valor: VerificacionEficacia; etiqueta: string }[] = [
  { valor: 'PENDIENTE', etiqueta: 'Pendiente' },
  { valor: 'VERIFICADA_EFICAZ', etiqueta: 'Verificada — eficaz' },
  { valor: 'VERIFICADA_NO_EFICAZ', etiqueta: 'Verificada — no eficaz' },
  { valor: 'NO_APLICA', etiqueta: 'No aplica' },
];

export interface PropsCamposAccion {
  d: DatosAccion;
  set: <K extends keyof DatosAccion>(clave: K, valor: DatosAccion[K]) => void;
  controles: OpcionControl[];
  cargos: Opcion[];
  madurez: OpcionMadurez[];
  /// Estado, Avance, Verificación de eficacia y Madurez alcanzada. Por omisión sí, que es lo
  /// que hacía el popup de edición antes de que esto fuera un parámetro.
  seguimiento?: boolean;
}

export default function CamposAccion({
  d,
  set,
  controles,
  cargos,
  madurez,
  seguimiento = true,
}: PropsCamposAccion) {
  return (
    <div className="flex flex-col gap-4">
      <Campo etiqueta="Acción">
        <textarea
          value={d.accion ?? ''}
          onChange={(e) => set('accion', e.target.value)}
          rows={2}
          className={entrada}
        />
      </Campo>

      {/* Sin Estado quedan dos campos: tres columnas dejarían un hueco a la derecha que se
          lee como un campo que falta. */}
      <div
        className={`grid gap-4 grid-cols-1 ${seguimiento ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}
      >
        <Campo etiqueta="Tipo de tratamiento">
          <select
            value={d.tipo}
            onChange={(e) => set('tipo', e.target.value as TipoAccion)}
            className={entrada}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          etiqueta="Control asociado"
          pie={
            d.controlId ? (
              <Link
                href="/sgsi/controles"
                className="font-mono text-10 text-accent-700 underline decoration-accent-border underline-offset-2"
              >
                administrar el control ↗
              </Link>
            ) : undefined
          }
        >
          <select
            value={d.controlId ?? ''}
            onChange={(e) => set('controlId', e.target.value === '' ? null : Number(e.target.value))}
            className={entrada}
          >
            <option value="">Sin control</option>
            {controles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nombre}
              </option>
            ))}
          </select>
        </Campo>

        {seguimiento && (
          <Campo etiqueta="Estado">
            <select
              value={d.estado}
              onChange={(e) => set('estado', e.target.value as EstadoAccion)}
              className={entrada}
            >
              {ESTADOS.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>

      <Campo
        etiqueta="Origen y justificación"
        pie="Por qué existe esta acción. Es la razón que exige ISO 27001 6.1.3."
      >
        <textarea
          value={d.origen ?? ''}
          onChange={(e) => set('origen', e.target.value)}
          rows={3}
          className={entrada}
        />
      </Campo>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Campo etiqueta="Responsable de la ejecución">
          <select
            value={d.responsableId}
            onChange={(e) => set('responsableId', Number(e.target.value))}
            className={entrada}
          >
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          etiqueta="Propietario del riesgo que aprueba"
          pie="Distinto de quien ejecuta: ISO 27001 6.1.3 pide la aprobación del propietario."
        >
          <select
            value={d.apruebaId}
            onChange={(e) => set('apruebaId', Number(e.target.value))}
            className={entrada}
          >
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {/* Cinco campos cortos en un renglón: es lo que 1040 px de ancho permiten y lo que
          libera los dos renglones que Observaciones necesita.

          El corte de las cinco columnas es 1080 px y no uno de los de Tailwind, porque ahí
          es donde la tarjeta DEJA DE CRECER: mide `min(1040, ventana − 40)` por el relleno
          lateral del overlay, así que a 1080 ya está en su ancho máximo y las cinco columnas
          caben a ~195 px. Esperar a `xl` (1280) dejaba un renglón de 3+2 con un hueco a la
          derecha en todo el rango intermedio, sin ninguna razón de espacio que lo explicara.

          Sin los tres de seguimiento quedan dos campos, y las cinco columnas dejarían tres
          huecos: por eso el corte sólo se pide cuando hay cinco que acomodar. */}
      <div
        className={`grid gap-4 grid-cols-2 ${
          seguimiento ? 'md:grid-cols-3 min-[1080px]:grid-cols-5' : ''
        }`}
      >
        <Campo etiqueta="Fecha objetivo">
          <input
            type="date"
            value={d.fechaObjetivo ?? ''}
            onChange={(e) => set('fechaObjetivo', e.target.value || null)}
            className={entrada}
          />
        </Campo>

        {seguimiento && (
          <Campo etiqueta="Avance">
            <input
              type="number"
              min={0}
              max={100}
              value={d.avance ?? 0}
              onChange={(e) => set('avance', Number(e.target.value))}
              className={entrada}
            />
          </Campo>
        )}

        {seguimiento && (
          <Campo etiqueta="Verificación de eficacia">
            <select
              value={d.verificacion}
              onChange={(e) => set('verificacion', e.target.value as VerificacionEficacia)}
              className={entrada}
            >
              {VERIFICACIONES.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {v.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {seguimiento && (
          <Campo etiqueta="Madurez alcanzada">
            <select
              value={d.madurezAlcanzadaId ?? ''}
              onChange={(e) =>
                set('madurezAlcanzadaId', e.target.value === '' ? null : Number(e.target.value))
              }
              className={entrada}
            >
              <option value="">Sin registrar</option>
              {madurez.map((m) => (
                <option key={m.id} value={m.id}>
                  L{m.nivel} — {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo etiqueta="Recursos o presupuesto">
          <input
            value={d.recursos ?? ''}
            onChange={(e) => set('recursos', e.target.value || null)}
            className={entrada}
          />
        </Campo>
      </div>

      {/* Conditional block: transferring risk needs to say through what, and what is
          left over after the transfer. */}
      {d.tipo === 'TRANSFERIR' && (
        <div className="grid gap-4 rounded-campo border border-border-default bg-subtle p-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Campo etiqueta="Instrumento de transferencia">
            <input
              value={d.instrumento ?? ''}
              onChange={(e) => set('instrumento', e.target.value || null)}
              placeholder="Póliza, contrato, cláusula…"
              className={entrada}
            />
          </Campo>
          <Campo etiqueta="Riesgo remanente">
            <input
              value={d.riesgoRemanente ?? ''}
              onChange={(e) => set('riesgoRemanente', e.target.value || null)}
              placeholder="Qué queda después de transferir"
              className={entrada}
            />
          </Campo>
        </div>
      )}

      {/* Conditional block: an acceptance with no expiry is an acceptance forever. */}
      {d.tipo === 'ACEPTAR' && (
        <div className="rounded-campo border border-border-default bg-subtle p-3">
          <Campo etiqueta="Justificación de la aceptación">
            <textarea
              value={d.justificacionAceptacion ?? ''}
              onChange={(e) => set('justificacionAceptacion', e.target.value || null)}
              rows={2}
              className={entrada}
            />
          </Campo>
          <div className="mt-3">
            <Campo
              etiqueta="Fecha de revisión"
              pie="Una aceptación sin fecha de revisión no caduca nunca, y eso no se admite."
            >
              <input
                type="date"
                value={d.fechaRevisionAceptacion ?? ''}
                onChange={(e) => set('fechaRevisionAceptacion', e.target.value || null)}
                className={entrada}
              />
            </Campo>
          </div>
        </div>
      )}

      {/* Observaciones es donde se escribe el seguimiento de una acción que dura meses.
          Un `<input>` descarta los saltos de línea, así que tres reuniones quedaban en un
          párrafo corrido.

          Diez filas y no las dos o tres de los demás campos: éste recibe varias entradas
          fechadas, y con menos habría que desplazarse dentro del campo para releer lo que
          uno mismo acaba de escribir. */}
      <Campo etiqueta="Observaciones">
        <textarea
          value={d.observacion ?? ''}
          onChange={(e) => set('observacion', e.target.value || null)}
          rows={10}
          className={entrada}
        />
      </Campo>
    </div>
  );
}

const entrada =
  'w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-12_5 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300';

function Campo({
  etiqueta,
  pie,
  children,
}: {
  etiqueta: string;
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      {children}
      {pie && <span className="text-10 leading-snug text-faint [text-wrap:pretty]">{pie}</span>}
    </label>
  );
}
