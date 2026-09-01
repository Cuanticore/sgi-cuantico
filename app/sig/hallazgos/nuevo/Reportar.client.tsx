'use client';

// app/sig/hallazgos/nuevo/Reportar.client.tsx
//
// El formulario de reporte (FOR-CAL-02): origen con su referencia, descripción,
// requisito incumplido, evidencia objetiva, área y fecha. Todo se valida en el
// servidor; acá solo se arma la petición.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportarHallazgo } from '@/app/sig/acciones/hallazgos';

const ORIGENES = [
  ['AUDITORIA_INTERNA', 'Auditoría interna'],
  ['AUDITORIA_EXTERNA', 'Auditoría externa'],
  ['QUEJA', 'Queja o salida no conforme'],
  ['INDICADOR', 'Indicador incumplido'],
  ['REVISION_DIRECCION', 'Revisión por la dirección'],
  ['SGSI', 'SGSI (riesgo o control)'],
  ['OTRO', 'Otro'],
] as const;

export default function ReportarHallazgoClient({
  correo,
  areas,
}: {
  correo: string;
  areas: { id: number; nombre: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    origen: 'OTRO' as (typeof ORIGENES)[number][0],
    origenReferencia: '',
    descripcion: '',
    requisitoIncumplido: '',
    evidenciaObjetiva: '',
    areaId: '',
    fechaDeteccion: new Date().toISOString().slice(0, 10),
  });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function reportar() {
    setEnviando(true);
    setError(null);
    setMensaje(null);
    const r = await reportarHallazgo({
      origen: form.origen,
      origenReferencia: form.origenReferencia,
      descripcion: form.descripcion,
      requisitoIncumplido: form.requisitoIncumplido,
      evidenciaObjetiva: form.evidenciaObjetiva,
      areaId: Number(form.areaId),
      fechaDeteccion: new Date(`${form.fechaDeteccion}T00:00:00.000Z`),
    });
    setEnviando(false);
    if (r.ok) {
      setMensaje(r.mensaje);
      setTimeout(() => router.push('/sig/hallazgos'), 900);
    } else {
      setError(r.mensaje);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Origen</span>
          <select
            value={form.origen}
            onChange={(e) => setForm({ ...form, origen: e.target.value as (typeof ORIGENES)[number][0] })}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
          >
            {ORIGENES.map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Referencia del origen</span>
          <input
            value={form.origenReferencia}
            onChange={(e) => setForm({ ...form, origenReferencia: e.target.value })}
            placeholder={form.origen === 'SGSI' ? 'Código del riesgo o control' : form.origen === 'INDICADOR' ? 'Código del indicador y periodo' : 'Número, fecha, entidad…'}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Descripción del hallazgo</span>
        <textarea
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          rows={3}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Requisito incumplido (norma y numeral)</span>
        <input
          value={form.requisitoIncumplido}
          onChange={(e) => setForm({ ...form, requisitoIncumplido: e.target.value })}
          placeholder="ISO 9001:2015 numeral 4.2 · ISO/IEC 27001:2022 A.5.31…"
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Evidencia objetiva</span>
        <textarea
          value={form.evidenciaObjetiva}
          onChange={(e) => setForm({ ...form, evidenciaObjetiva: e.target.value })}
          rows={2}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Área</span>
          <select
            value={form.areaId}
            onChange={(e) => setForm({ ...form, areaId: e.target.value })}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
          >
            <option value="">Seleccionar</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Fecha de detección</span>
          <input
            type="date"
            value={form.fechaDeteccion}
            onChange={(e) => setForm({ ...form, fechaDeteccion: e.target.value })}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
          />
        </label>
      </div>

      <p className="text-11_5 text-muted">Reportado por {correo} · el líder del SIG clasifica después.</p>

      {error && <p className="rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}>{error}</p>}
      {mensaje && <p className="rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }}>{mensaje}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={() => router.push('/sig/hallazgos')}
          className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted"
        >
          Cancelar
        </button>
        <button
          onClick={reportar}
          disabled={enviando || !form.descripcion.trim() || !form.areaId}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {enviando ? 'Reportando…' : 'Reportar hallazgo'}
        </button>
      </div>
    </div>
  );
}