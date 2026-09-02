'use client';

// app/estrategico/OriginarRiesgo.client.tsx
//
// «+ Originar un riesgo desde aquí»: el botón que el comentario de cabecera de DOFA
// prometía y que no existía. `crearRiesgoOrganizacional` estaba importada ahí sin
// invocarse nunca.
//
// D2: la fuente del riesgo es TIPADA y guarda la referencia a la fila que lo originó, no
// un texto que la describa. Un riesgo con `fuente: 'DOFA'` y `entradaContextoId` apuntando
// a la amenaza concreta se puede recorrer en las dos direcciones: desde el riesgo hasta el
// análisis que lo detectó, y desde la entrada del DOFA hasta lo que produjo. Copiar el
// texto de la amenaza en la descripción rompería el segundo camino, y es el que un auditor
// usa cuando pregunta de dónde salió este riesgo.
//
// Sirve igual para PESTEL: la única diferencia es la `fuente`.

import { useState } from 'react';
import { crearRiesgoOrganizacional } from '@/app/sig/acciones/estrategico';

export interface CatalogosRiesgo {
  factores: { id: number; nombre: string }[];
  probabilidades: { id: number; valor: number; etiqueta: string }[];
  impactos: { id: number; valor: number; etiqueta: string }[];
  personas: { id: number; nombre: string }[];
  procesos: string[];
}

export default function OriginarRiesgo({
  fuente,
  entradaId,
  entradaTexto,
  favorable,
  catalogos,
  setError,
}: {
  fuente: 'DOFA' | 'PESTEL';
  entradaId: number;
  entradaTexto: string;
  /// Una entrada favorable origina una OPORTUNIDAD; una adversa, un RIESGO. Se propone,
  /// no se impone: una fortaleza mal gestionada también puede volverse un riesgo.
  favorable: boolean;
  catalogos: CatalogosRiesgo;
  setError: (e: string | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [clase, setClase] = useState<'RIESGO' | 'OPORTUNIDAD'>(
    favorable ? 'OPORTUNIDAD' : 'RIESGO',
  );
  const [proceso, setProceso] = useState(catalogos.procesos[0] ?? '');
  const [descripcion, setDescripcion] = useState('');
  const [causa, setCausa] = useState('');
  const [efecto, setEfecto] = useState('');
  const [factorId, setFactorId] = useState(catalogos.factores[0]?.id.toString() ?? '');
  const [probabilidadId, setProbabilidadId] = useState('');
  const [impactoId, setImpactoId] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const completo =
    descripcion.trim() !== '' &&
    causa.trim() !== '' &&
    efecto.trim() !== '' &&
    factorId !== '' &&
    probabilidadId !== '' &&
    impactoId !== '';

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        title="Originar un riesgo u oportunidad desde esta entrada"
        aria-label="Originar un riesgo desde esta entrada"
        className="flex-none whitespace-nowrap rounded-campo px-2 py-1 text-9_5"
        style={{ color: 'var(--hf-brand-nav)', border: '1px dashed var(--hf-brand-border)' }}
      >
        + Originar un riesgo desde aquí
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-tarjeta border border-border-field bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-15 font-bold text-primary">Originar desde el {fuente}</h2>
          <button onClick={() => setAbierto(false)} className="flex-none text-12_5 text-muted">
            Cancelar
          </button>
        </div>

        <p
          className="rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
        >
          <strong className="font-semibold">Entrada de origen:</strong> {entradaTexto}
          <br />
          Queda guardada como referencia tipada, no copiada: desde el riesgo se llega al
          análisis que lo detectó, y desde esta entrada a lo que produjo.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Clase</span>
            <span className="flex gap-1.5">
              {(['RIESGO', 'OPORTUNIDAD'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setClase(c)}
                  aria-pressed={clase === c}
                  className="rounded-chip px-3.5 py-1.5 text-12"
                  style={{
                    background: clase === c ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    color: clase === c ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    border: `1px solid ${clase === c ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                    fontWeight: clase === c ? 600 : 500,
                  }}
                >
                  {c === 'RIESGO' ? 'Riesgo' : 'Oportunidad'}
                </button>
              ))}
            </span>
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <span className="etiqueta-campo">Proceso</span>
            <select
              value={proceso}
              onChange={(e) => setProceso(e.target.value)}
              className="entrada-campo"
            >
              {catalogos.procesos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Descripción</span>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            placeholder="Qué puede pasar"
            className="entrada-campo leading-relaxed"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Causa</span>
            <textarea
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
              rows={2}
              placeholder="Por qué puede pasar"
              className="entrada-campo leading-relaxed"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Efecto</span>
            <textarea
              value={efecto}
              onChange={(e) => setEfecto(e.target.value)}
              rows={2}
              placeholder="Qué consecuencia tiene"
              className="entrada-campo leading-relaxed"
            />
          </label>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Factor</span>
            <select
              value={factorId}
              onChange={(e) => setFactorId(e.target.value)}
              className="entrada-campo"
            >
              {catalogos.factores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Probabilidad</span>
            <select
              value={probabilidadId}
              onChange={(e) => setProbabilidadId(e.target.value)}
              className="entrada-campo"
            >
              <option value="">Elegir…</option>
              {catalogos.probabilidades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.valor} · {p.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Impacto</span>
            <select
              value={impactoId}
              onChange={(e) => setImpactoId(e.target.value)}
              className="entrada-campo"
            >
              <option value="">Elegir…</option>
              {catalogos.impactos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.valor} · {i.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Responsable · opcional</span>
            <select
              value={responsableId}
              onChange={(e) => setResponsableId(e.target.value)}
              className="entrada-campo"
            >
              <option value="">Sin asignar</option>
              {catalogos.personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setOcupado(true);
              setError(null);
              const r = await crearRiesgoOrganizacional({
                clase,
                proceso,
                fuente,
                entradaContextoId: entradaId,
                descripcion,
                causa,
                efecto,
                factorId: Number(factorId),
                probabilidadId: Number(probabilidadId),
                impactoId: Number(impactoId),
                responsableId: responsableId === '' ? undefined : Number(responsableId),
              });
              setOcupado(false);
              if (r.ok) {
                window.location.reload();
                return;
              }
              setError(r.mensaje);
              setAbierto(false);
            }}
            disabled={!completo || ocupado}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            {ocupado ? 'Creando…' : `Originar el ${clase === 'RIESGO' ? 'riesgo' : 'la oportunidad'}`}
          </button>
          <span className="text-11_5 text-muted [text-wrap:pretty]">
            El código sigue el consecutivo del Excel y es inmutable (D1). Los controles se
            agregan después, en Riesgos.
          </span>
        </div>
      </div>
    </div>
  );
}
