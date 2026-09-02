'use client';

// app/estrategico/parametros/TablasEditables.client.tsx
//
// Las tablas del método que se pueden editar, con «Guardar», «+ Agregar nivel» y el motivo
// obligatorio que el lienzo pide.
//
// Las seis tablas eran de sólo lectura y no había ninguna acción para escribirlas: el único
// camino era la base de datos. D4 es lo que hace esto posible sin migraciones —los registros
// guardan la referencia al nivel, no el número— y también lo que lo hace delicado: una tabla
// mal guardada no rompe ninguna pantalla, deja riesgos en la banda equivocada.
//
// La validación corre en el servidor con un módulo puro y 23 pruebas. Acá no se repite: se
// muestra lo que el servidor responde. Duplicarla daría dos definiciones de «banda válida»
// que pueden separarse con el tiempo.

import { useState } from 'react';
import {
  guardarEficacias,
  guardarEtiquetasDeEscala,
  guardarNiveles,
  type TablaEscala,
} from '@/app/sig/acciones/parametros';

export interface FilaNivelVista {
  id?: number;
  minimo: number;
  maximo: number;
  etiqueta: string;
  color: string;
  accionRiesgo: string;
  accionOportunidad: string;
}

/// El estado de un guardado: lo que el servidor respondió.
interface Aviso {
  ok: boolean;
  texto: string;
  avisos: string[];
}

function Barra({
  motivo,
  onMotivo,
  onGuardar,
  ocupado,
  aviso,
  extra,
}: {
  motivo: string;
  onMotivo: (m: string) => void;
  onGuardar: () => void;
  ocupado: boolean;
  aviso: Aviso | null;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end gap-3">
        {extra}
        <label className="ml-auto flex min-w-[300px] flex-1 flex-col gap-1.5">
          <span className="etiqueta-campo">Motivo del cambio · obligatorio</span>
          <input
            value={motivo}
            onChange={(e) => onMotivo(e.target.value)}
            placeholder="El comité bajó el umbral de inaceptable en la sesión de febrero."
            className="entrada-campo"
          />
        </label>
        <button
          onClick={onGuardar}
          disabled={ocupado}
          className="flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-brand-nav)', border: '1px solid var(--hf-brand-700)' }}
        >
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <span className="font-mono text-9_5 text-label">
        Todo cambio exige motivo y queda en bitácora
      </span>

      {aviso && (
        <p
          className="rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}
      {aviso?.avisos.map((a) => (
        <p
          key={a}
          className="rounded-campo px-3 py-2 text-11_5 [text-wrap:pretty]"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
        >
          {a}
        </p>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Niveles y tratamiento
// ──────────────────────────────────────────────────────────────────────────────

export function NivelesEditables({ iniciales }: { iniciales: FilaNivelVista[] }) {
  const [filas, setFilas] = useState<FilaNivelVista[]>(iniciales);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const cambiar = (i: number, campo: keyof FilaNivelVista, valor: string) =>
    setFilas(
      filas.map((f, j) =>
        j === i
          ? { ...f, [campo]: campo === 'minimo' || campo === 'maximo' ? Number(valor) : valor }
          : f,
      ),
    );

  return (
    <>
      <div className="overflow-x-auto rounded-tarjeta border border-border-field bg-surface px-4 pb-2 pt-4">
        <table className="w-full min-w-[720px] text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="w-[74px] px-2 py-2 font-semibold">Desde</th>
              <th className="w-[74px] px-2 py-2 font-semibold">Hasta</th>
              <th className="w-[150px] px-2 py-2 font-semibold">Etiqueta</th>
              <th className="px-2 py-2 font-semibold">Acción · riesgo</th>
              <th className="px-2 py-2 font-semibold">Acción · oportunidad</th>
              <th className="w-[92px] px-2 py-2 font-semibold">Color</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id ?? `nueva-${i}`} className="border-t border-border-default">
                <td className="px-2 py-2">
                  <input
                    value={f.minimo}
                    onChange={(e) => cambiar(i, 'minimo', e.target.value)}
                    inputMode="numeric"
                    aria-label={`Desde, banda ${i + 1}`}
                    className="entrada-campo text-center font-mono"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={f.maximo}
                    onChange={(e) => cambiar(i, 'maximo', e.target.value)}
                    inputMode="numeric"
                    aria-label={`Hasta, banda ${i + 1}`}
                    className="entrada-campo text-center font-mono"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={f.etiqueta}
                    onChange={(e) => cambiar(i, 'etiqueta', e.target.value)}
                    aria-label={`Etiqueta, banda ${i + 1}`}
                    className="entrada-campo"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={f.accionRiesgo}
                    onChange={(e) => cambiar(i, 'accionRiesgo', e.target.value)}
                    aria-label={`Acción de riesgo, banda ${i + 1}`}
                    className="entrada-campo"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={f.accionOportunidad}
                    onChange={(e) => cambiar(i, 'accionOportunidad', e.target.value)}
                    aria-label={`Acción de oportunidad, banda ${i + 1}`}
                    className="entrada-campo"
                  />
                </td>
                <td className="px-2 py-2">
                  <span className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={f.color}
                      onChange={(e) => cambiar(i, 'color', e.target.value)}
                      aria-label={`Color, banda ${i + 1}`}
                      className="h-7 w-9 flex-none rounded-campo border border-border-field"
                    />
                    <span className="font-mono text-9_5 text-muted">{f.color}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  {filas.length > 1 && (
                    <button
                      onClick={() => setFilas(filas.filter((_, j) => j !== i))}
                      aria-label={`Quitar la banda ${i + 1}`}
                      className="font-mono text-11"
                      style={{ color: 'var(--hf-danger-text)' }}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Barra
        motivo={motivo}
        onMotivo={setMotivo}
        ocupado={ocupado}
        aviso={aviso}
        extra={
          <button
            onClick={() => {
              const tope = filas.reduce((m, f) => Math.max(m, f.maximo), 0);
              setFilas([
                ...filas,
                {
                  minimo: tope + 1,
                  maximo: tope + 1,
                  etiqueta: '',
                  color: '#6b7570',
                  accionRiesgo: '',
                  accionOportunidad: '',
                },
              ]);
            }}
            className="rounded-campo px-3.5 py-2 text-12 font-medium"
            style={{
              color: 'var(--hf-brand-nav)',
              border: '1px dashed var(--hf-brand-border)',
            }}
          >
            + Agregar nivel
          </button>
        }
        onGuardar={async () => {
          setOcupado(true);
          setAviso(null);
          const r = await guardarNiveles(filas, motivo);
          setOcupado(false);
          setAviso({ ok: r.ok, texto: r.mensaje, avisos: r.avisos });
          if (r.ok) setTimeout(() => window.location.reload(), 1800);
        }}
      />

      <p className="mt-2 max-w-[92ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
        Las bandas se validan en el servidor antes de escribir: tienen que arrancar en 1, ser
        contiguas y no solaparse. Con un hueco entre 12 y 15, un riesgo con valor 13 caería en
        la banda de abajo <b>y nada avisaría</b> — por eso se rechaza en vez de guardarse.
      </p>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Etiquetas de una escala
// ──────────────────────────────────────────────────────────────────────────────

export function EscalaEditable({
  tabla,
  iniciales,
  columnaExtra,
}: {
  tabla: TablaEscala;
  iniciales: { id: number; valor: number; etiqueta: string }[];
  /// Lo que la escala tenga además de valor y etiqueta, ya formateado y de sólo lectura.
  columnaExtra?: { cabecera: string; valores: Record<number, string> };
}) {
  const [filas, setFilas] = useState(iniciales);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-tarjeta border border-border-field bg-surface px-4 pb-2 pt-4">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="w-[74px] px-2 py-2 font-semibold">Valor</th>
              <th className="px-2 py-2 font-semibold">Etiqueta</th>
              {columnaExtra && <th className="w-[180px] px-2 py-2 font-semibold">{columnaExtra.cabecera}</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id} className="border-t border-border-default">
                {/* El VALOR no se edita: es el eje del mapa de calor y la variable de la
                    multiplicación. Cambiarlo reordena la malla y recalcula todo — eso no es
                    un renombre, es rehacer el método, y va con la restauración del
                    MAN-CAL-01, no con un campo que alguien puede pisar sin darse cuenta. */}
                <td className="px-2 py-2">
                  <span
                    className="entrada-campo block text-center font-mono"
                    title="El valor es el eje del mapa de calor: se cambia restaurando el método, no acá."
                    style={{ background: 'var(--hf-bg-app)', color: 'var(--hf-text-muted)' }}
                  >
                    {f.valor}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <input
                    value={f.etiqueta}
                    onChange={(e) =>
                      setFilas(filas.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)))
                    }
                    aria-label={`Etiqueta del valor ${f.valor}`}
                    className="entrada-campo"
                  />
                </td>
                {columnaExtra && (
                  <td className="px-2 py-2 text-11_5 text-secondary-soft">
                    {columnaExtra.valores[f.id] ?? '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Barra
        motivo={motivo}
        onMotivo={setMotivo}
        ocupado={ocupado}
        aviso={aviso}
        onGuardar={async () => {
          setOcupado(true);
          setAviso(null);
          const r = await guardarEtiquetasDeEscala(tabla, filas, motivo);
          setOcupado(false);
          setAviso({ ok: r.ok, texto: r.mensaje, avisos: r.avisos });
          if (r.ok) setTimeout(() => window.location.reload(), 1800);
        }}
      />

      <p className="mt-2 max-w-[92ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
        Acá se edita la <b>etiqueta</b>, no el valor. El valor es el eje del mapa de calor y
        la variable de la multiplicación: cambiarlo reordena la malla y recalcula los{' '}
        {filas.length === 0 ? '' : ''}registros. Eso va con «Restaurar valores del
        MAN-CAL-01», que corre en una transacción con su bitácora.
      </p>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Mediciones de eficacia
// ──────────────────────────────────────────────────────────────────────────────

export function EficaciasEditables({
  iniciales,
}: {
  iniciales: { id: number; nombre: string; valor: number }[];
}) {
  const [filas, setFilas] = useState(iniciales);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-tarjeta border border-border-field bg-surface px-4 pb-2 pt-4">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-2 py-2 font-semibold">Medición</th>
              <th className="w-[110px] px-2 py-2 font-semibold">Factor</th>
              <th className="px-2 py-2 font-semibold">Qué implica</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id} className="border-t border-border-default">
                <td className="px-2 py-2">
                  <input
                    value={f.nombre}
                    onChange={(e) =>
                      setFilas(filas.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))
                    }
                    aria-label={`Nombre de la medición ${i + 1}`}
                    className="entrada-campo"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={f.valor}
                    onChange={(e) =>
                      setFilas(
                        filas.map((x, j) =>
                          j === i ? { ...x, valor: Number(e.target.value.replace(',', '.')) } : x,
                        ),
                      )
                    }
                    inputMode="decimal"
                    aria-label={`Factor de la medición ${i + 1}`}
                    className="entrada-campo text-center font-mono"
                  />
                </td>
                <td className="px-2 py-2 text-11_5 text-secondary-soft">
                  {Number.isFinite(f.valor) && f.valor >= 0 && f.valor <= 1
                    ? `Reduce el ${Math.round(f.valor * 100)} %`
                    : 'El factor va entre 0 y 1'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Barra
        motivo={motivo}
        onMotivo={setMotivo}
        ocupado={ocupado}
        aviso={aviso}
        onGuardar={async () => {
          setOcupado(true);
          setAviso(null);
          const r = await guardarEficacias(filas, motivo);
          setOcupado(false);
          setAviso({ ok: r.ok, texto: r.mensaje, avisos: r.avisos });
          if (r.ok) setTimeout(() => window.location.reload(), 1800);
        }}
      />

      <p className="mt-2 max-w-[92ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
        El factor va entre 0 y 1: <b>0,6 significa que el control reduce el 60 %</b>. Escribir
        60 en vez de 0,6 se rechaza — es el error de tipeo más probable acá, y pasaría
        desapercibido porque el residual seguiría saliendo un número.
      </p>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Historial de la tabla
// ──────────────────────────────────────────────────────────────────────────────

export interface EntradaHistorial {
  tabla: string;
  campo: string | null;
  anterior: string | null;
  nuevo: string | null;
  motivo: string | null;
  usuario: string;
  fecha: string;
}

/// «Historial de esta tabla» del lienzo. Sale de la bitácora, que ya guarda cada cambio con
/// su autor, su valor anterior y su motivo: no hacía falta una tabla nueva.
export function Historial({
  entradas,
  tabla,
}: {
  entradas: EntradaHistorial[];
  /// El nombre de la tabla en la bitácora, para filtrar. `null` muestra todas.
  tabla: string | null;
}) {
  const propias = tabla === null ? entradas : entradas.filter((e) => e.tabla === tabla);

  return (
    <div className="mt-5 flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface px-4.5 py-4">
      <span className="flex items-center gap-2.5">
        <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
          Historial de esta tabla
        </span>
        <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
        {propias.length > 0 && (
          <span className="font-mono text-9_5 text-label">{propias.length}</span>
        )}
      </span>

      {propias.length === 0 ? (
        <span className="text-11_5 text-label">
          Sin cambios desde la carga inicial del MAN-CAL-01 v2.0.
        </span>
      ) : (
        propias.slice(0, 12).map((h, i) => (
          <span key={i} className="flex items-start gap-3 text-11_5 leading-relaxed">
            <span className="w-[78px] flex-none font-mono text-muted">{h.fecha}</span>
            <span className="flex-1 text-secondary">
              <b className="font-semibold">{h.campo ?? 'registro'}</b>
              {h.anterior !== null && h.nuevo !== null ? (
                <>
                  : {h.anterior} → {h.nuevo}
                </>
              ) : (
                ''
              )}
              {h.motivo && <span className="text-muted"> · {h.motivo}</span>}
            </span>
            <span className="flex-none text-muted">{h.usuario}</span>
          </span>
        ))
      )}
    </div>
  );
}
