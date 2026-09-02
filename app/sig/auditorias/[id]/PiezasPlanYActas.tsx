'use client';

// app/sig/auditorias/[id]/PiezasPlanYActas.tsx
//
// Las dos piezas que conectan las acciones que nadie llamaba.
//
// `agregarCeldaPlan` estaba escrita en el servidor sin llamador, así que la matriz del
// plan era de sólo lectura y el plan no se podía armar ni ampliar. Y `registrarActa`
// estaba IMPORTADA en la ficha y nunca se invocaba: el aviso decía «no se emite el informe
// final sin acta de cierre» y no había forma de registrar esa acta, así que el informe
// final era inalcanzable.
//
// Viven en su propio archivo porque la ficha ya pasaba de 450 líneas.

import { useState } from 'react';
import { agregarCeldaPlan, registrarActa } from '@/app/sig/acciones/auditorias';

/// C4 permite agregar una celda DURANTE la ejecución —el auditor descubre que un numeral
/// aplica a un proceso que no estaba planificado—, y esas celdas se marcan aparte porque
/// la diferencia entre lo planificado y lo hallado en camino es parte del informe.
///
/// La pantalla NO repite la regla de independencia (C2): la muestra cuando el servidor la
/// aplica. Duplicarla acá sería tener dos definiciones de independencia que pueden
/// separarse con el tiempo.
export function NuevaCelda({
  auditoriaId,
  requisitos,
  procesos,
  personas,
  onCerrar,
  setMensaje,
  setError,
}: {
  auditoriaId: number;
  requisitos: { id: number; numeral: string; titulo: string; norma: string }[];
  procesos: string[];
  personas: { id: number; nombre: string }[];
  onCerrar: () => void;
  setMensaje: (m: string) => void;
  setError: (e: string) => void;
}) {
  const [proceso, setProceso] = useState(procesos[0] ?? '');
  const [requisitoId, setRequisitoId] = useState('');
  const [auditorId, setAuditorId] = useState('');
  const [hora, setHora] = useState('');
  const [planificada, setPlanificada] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-13 font-bold text-primary">Agregar una celda al plan</h3>
        <button onClick={onCerrar} className="text-12 text-muted">
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Proceso</span>
          <select
            value={proceso}
            onChange={(e) => setProceso(e.target.value)}
            className="entrada-campo"
          >
            {procesos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Numeral auditable</span>
          <select
            value={requisitoId}
            onChange={(e) => setRequisitoId(e.target.value)}
            className="entrada-campo"
          >
            <option value="">Elegir numeral…</option>
            {requisitos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.norma} {r.numeral} · {r.titulo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Auditor</span>
          <select
            value={auditorId}
            onChange={(e) => setAuditorId(e.target.value)}
            className="entrada-campo"
          >
            <option value="">Elegir auditor…</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Hora · opcional</span>
            <input
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              placeholder="09:30"
              className="entrada-campo font-mono"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Origen</span>
            <button
              onClick={() => setPlanificada(!planificada)}
              aria-pressed={planificada}
              className="rounded-campo px-2 py-1.5 text-11_5"
              style={{
                background: planificada ? 'var(--hf-brand-100)' : 'var(--hf-warn-100)',
                color: planificada ? 'var(--hf-brand-nav)' : 'var(--hf-warn-text)',
                border: `1px solid ${planificada ? 'var(--hf-brand-border)' : 'var(--hf-warn-border)'}`,
              }}
            >
              {planificada ? 'Planificada' : 'En ejecución'}
            </button>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            setOcupado(true);
            const r = await agregarCeldaPlan(auditoriaId, {
              procesoRef: proceso,
              requisitoNormaId: Number(requisitoId),
              hora: hora.trim() || undefined,
              auditorId: Number(auditorId),
              planificada,
            });
            setOcupado(false);
            if (r.ok) {
              setMensaje(r.mensaje);
              setTimeout(() => window.location.reload(), 900);
              return;
            }
            setError(r.mensaje);
          }}
          disabled={requisitoId === '' || auditorId === '' || ocupado}
          className="rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {ocupado ? 'Agregando…' : 'Agregar'}
        </button>
        <span className="text-11 text-muted [text-wrap:pretty]">
          El servidor rechaza al auditor que audita el proceso del que es responsable (C2).
        </span>
      </div>
    </div>
  );
}

export function NuevaActa({
  auditoriaId,
  tipo,
  onCerrar,
  setMensaje,
  setError,
}: {
  auditoriaId: number;
  tipo: 'APERTURA' | 'CIERRE';
  onCerrar: () => void;
  setMensaje: (m: string) => void;
  setError: (e: string) => void;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [asistentes, setAsistentes] = useState('');
  const [contenido, setContenido] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const esCierre = tipo === 'CIERRE';

  return (
    <div className="mt-1 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-13 font-bold text-primary">
          Acta de {esCierre ? 'cierre' : 'apertura'}
        </h3>
        <button onClick={onCerrar} className="text-12 text-muted">
          Cancelar
        </button>
      </div>
      <p className="max-w-[84ch] text-11 leading-relaxed text-muted [text-wrap:pretty]">
        {esCierre
          ? 'Es la que habilita a emitir el informe final. Sin asistentes no prueba que la reunión de cierre ocurrió.'
          : 'Abre la auditoría: quiénes estuvieron y qué se acordó sobre el alcance y el itinerario.'}
      </p>

      <div className="grid grid-cols-[140px_1fr] gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="entrada-campo font-mono"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Asistentes</span>
          <input
            value={asistentes}
            onChange={(e) => setAsistentes(e.target.value)}
            placeholder="Nombres, separados por coma"
            className="entrada-campo"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="etiqueta-campo">Contenido</span>
        <textarea
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          rows={3}
          placeholder={
            esCierre
              ? 'Qué se presentó, qué observaciones hizo el auditado y qué quedó acordado.'
              : 'Alcance confirmado, itinerario y criterios presentados.'
          }
          className="entrada-campo leading-relaxed"
        />
      </label>

      <button
        onClick={async () => {
          setOcupado(true);
          const r = await registrarActa(auditoriaId, {
            tipo,
            fecha: new Date(`${fecha}T00:00:00.000Z`),
            asistentes,
            contenido,
          });
          setOcupado(false);
          if (r.ok) {
            setMensaje(r.mensaje);
            setTimeout(() => window.location.reload(), 900);
            return;
          }
          setError(r.mensaje);
        }}
        disabled={asistentes.trim() === '' || contenido.trim() === '' || ocupado}
        className="w-fit rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-accent-500)' }}
      >
        {ocupado ? 'Registrando…' : 'Registrar el acta'}
      </button>
    </div>
  );
}
