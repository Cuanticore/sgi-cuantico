'use client';

// app/estrategico/legal/NuevoRequisito.client.tsx
//
// El lienzo pone «Agregar requisito» en la cabecera de la pantalla, y la nota del diseño
// dice por qué importa: «cada requisito lleva responsable y periodicidad de revisión, y esa
// periodicidad genera la asignación de evaluación en Mi SIG».
//
// La acción `crearRequisitoLegal` existía desde el plan D y ninguna pantalla la invocaba. Y
// la matriz real está vacía —no hay migración posible, lo dice la propia pantalla— así que
// sin este formulario el levantamiento no se podía ni empezar: sólo se veían las once filas
// de semilla del marco normativo.
//
// El consecutivo lo pone el servidor. Acá no se pide, y no se muestra hasta que existe: un
// número que el formulario adivina es un número que después no coincide.

import { useState } from 'react';
import { crearRequisitoLegal } from '@/app/sig/acciones/estrategico';

/// Las cuatro que el método reconoce. Salen de MAN-CAL-01, no de una lista libre: la
/// periodicidad decide cada cuánto nace la asignación de evaluación.
const PERIODICIDADES = ['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'] as const;
const SISTEMAS = ['SGC', 'SGSI', 'AMBOS'] as const;
const TIPOS = ['Ley', 'Decreto', 'Resolución', 'Norma técnica', 'Contractual', 'Otro'] as const;

export default function NuevoRequisito({
  personas,
  areas,
}: {
  personas: { id: number; nombre: string }[];
  areas: { id: number; nombre: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    normatividad: '',
    articulo: '',
    expedidaPor: '',
    tipo: 'Ley' as string,
    objeto: '',
    aplicacion: '',
    sistemaGestion: 'AMBOS' as string,
    procesoEncargado: '',
    responsableId: '',
    periodicidadRevision: 'ANUAL' as string,
  });

  const campo = (k: keyof typeof d) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setD({ ...d, [k]: e.target.value }),
    className: 'rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5',
  });

  async function guardar() {
    // Se valida acá para no gastar un viaje, y el servidor lo valida otra vez: la interfaz
    // ayuda, no decide.
    for (const [k, etiqueta] of [
      ['normatividad', 'la normatividad'],
      ['expedidaPor', 'quién la expidió'],
      ['objeto', 'el objeto'],
      ['aplicacion', 'cómo aplica'],
    ] as const) {
      if (!d[k].trim()) {
        setError(`Falta ${etiqueta}.`);
        return;
      }
    }
    setGuardando(true);
    setError(null);
    const r = await crearRequisitoLegal({
      normatividad: d.normatividad.trim(),
      articulo: d.articulo.trim() || undefined,
      expedidaPor: d.expedidaPor.trim(),
      tipo: d.tipo,
      objeto: d.objeto.trim(),
      aplicacion: d.aplicacion.trim(),
      sistemaGestion: d.sistemaGestion,
      procesoEncargado: d.procesoEncargado || undefined,
      responsableId: d.responsableId ? Number(d.responsableId) : undefined,
      periodicidadRevision: d.periodicidadRevision,
    });
    if (r.ok) {
      window.location.reload();
      return;
    }
    setGuardando(false);
    setError(r.mensaje);
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white"
        style={{ background: 'var(--hf-accent-500)' }}
      >
        Agregar requisito
      </button>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-15 font-bold text-primary">Nuevo requisito legal</h2>
        <button onClick={() => setAbierto(false)} className="text-12_5 text-muted">
          Cerrar
        </button>
      </div>
      <p className="max-w-[70ch] text-11_5 text-muted [text-wrap:pretty]">
        La periodicidad de revisión genera la asignación de evaluación en Mi SIG del
        responsable. El consecutivo lo asigna el sistema.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Normatividad</span>
          <input {...campo('normatividad')} placeholder="Ley 1581 de 2012" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Artículo</span>
          <input {...campo('articulo')} placeholder="Art. 17 — opcional" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Expedida por</span>
          <input {...campo('expedidaPor')} placeholder="Congreso de la República" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Tipo</span>
          <select {...campo('tipo')}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="etiqueta-campo">Objeto</span>
          <input {...campo('objeto')} placeholder="Protección de datos personales" />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="etiqueta-campo">Cómo aplica a Cuántico</span>
          <input {...campo('aplicacion')} placeholder="Tratamiento de datos de clientes y empleados" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Sistema de gestión</span>
          <select {...campo('sistemaGestion')}>
            {SISTEMAS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Periodicidad de revisión</span>
          <select {...campo('periodicidadRevision')}>
            {PERIODICIDADES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Proceso encargado</span>
          <select {...campo('procesoEncargado')}>
            <option value="">Sin asignar</option>
            {areas.map((a) => (
              <option key={a.id} value={a.nombre}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Responsable</span>
          <select {...campo('responsableId')}>
            <option value="">Sin asignar</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {guardando ? 'Guardando…' : 'Guardar requisito'}
        </button>
        <button
          onClick={() => setAbierto(false)}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5 text-muted"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
