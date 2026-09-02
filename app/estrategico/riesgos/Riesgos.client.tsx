'use client';

// app/estrategico/riesgos/Riesgos.client.tsx
//
// La tabla de la matriz con chips por clase y el panel de cálculo en vivo: cambiar
// P, I o el control recalcula los pasos mostrados (inherente = P×I, P_res, I_res,
// residual) y el nivel. La advertencia de oportunidades (D9) es parte del diseño.

import { useMemo, useState } from 'react';
import { residualDe, nivelDe, EFICACIA } from '@/lib/sig/estrategico';
import { agregarControlRiesgo } from '@/app/sig/acciones/estrategico';

export interface FilaRiesgo {
  id: number;
  codigo: string;
  clase: string;
  descripcion: string;
  proceso: string;
  factor: string;
  p: number;
  i: number;
  inherente: number;
  residual: number;
  nivel: number;
  nivelEtiqueta: string;
  nivelColor: string;
  control: string | null;
  controlDescripcion: string | null;
  controlTipoId: number | null;
  controlEficaciaId: number | null;
  controles: number;
}

export default function RiesgosClient({
  filas,
  tipos,
  eficacias,
  niveles,
}: {
  filas: FilaRiesgo[];
  tipos: { id: number; nombre: string; reduce: string }[];
  eficacias: { id: number; nombre: string; valor: number }[];
  niveles: { minimo: number; etiqueta: string; color: string; accionRiesgo: string; accionOportunidad: string }[];
}) {
  const [clase, setClase] = useState<'todos' | 'RIESGO' | 'OPORTUNIDAD'>('todos');
  const [abierto, setAbierto] = useState<FilaRiesgo | null>(null);
  const [p, setP] = useState(3);
  const [i, setI] = useState(3);
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? 0);
  const [eficaciaId, setEficaciaId] = useState(eficacias[0]?.id ?? 0);
  const [descripcionControl, setDescripcionControl] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const visibles = useMemo(
    () => (clase === 'todos' ? filas : filas.filter((f) => f.clase === clase)),
    [filas, clase],
  );

  const minimos = niveles.map((n) => n.minimo);
  const tipo = tipos.find((t) => t.id === tipoId);
  const eficacia = eficacias.find((e) => e.id === eficaciaId);
  const medicion = eficacia?.nombre === 'Débil' ? 'DEBIL' : eficacia?.nombre === 'Moderado' ? 'MODERADO' : 'FUERTE';
  const calculo = residualDe(p, i, tipoToken(tipo?.nombre ?? ''), medicion);
  const nivel = nivelDe(calculo.residual, minimos);
  const nivelInfo = niveles[nivel];
  const esOportunidad = abierto?.clase === 'OPORTUNIDAD';
  const colorDeNivel = (n: number) => niveles[n]?.color ?? '#4a544f';

  // El cálculo paso a paso, con la FÓRMULA de cada línea. Cuando el control no reduce esa
  // variable, la línea dice «sin cambio» en vez de repetir el número: es la diferencia
  // entre ver el resultado y entender por qué salió así.
  const pasos = useMemo(() => {
    const e = EFICACIA[medicion];
    const reduce = tipo?.reduce ?? 'PROBABILIDAD';
    const tocaP = reduce === 'PROBABILIDAD' || reduce === 'AMBOS';
    const tocaI = reduce === 'IMPACTO' || reduce === 'AMBOS';
    return [
      {
        formula: `inherente = P × I = ${p} × ${i}`,
        valor: String(calculo.inherente),
        color: colorDeNivel(nivelDe(calculo.inherente, minimos)),
      },
      {
        formula: `P_res = ${tocaP ? `${p} × (1 − ${e})` : 'P (sin cambio)'}`,
        valor: redondear(calculo.pRes),
        color: 'var(--hf-text-secondary-soft)',
      },
      {
        formula: `I_res = ${tocaI ? `${i} × (1 − ${e})` : 'I (sin cambio)'}`,
        valor: redondear(calculo.iRes),
        color: 'var(--hf-text-secondary-soft)',
      },
      {
        formula: 'residual = P_res × I_res',
        valor: redondear(calculo.residual),
        color: nivelInfo?.color ?? '#4a544f',
      },
    ];
    // `colorDeNivel` y `redondear` son puras y estables; el cálculo depende de estas cuatro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, i, medicion, tipo?.reduce, calculo, minimos, nivelInfo?.color]);

  const nivelStyle = (n: number) => {
    const info = niveles[n];
    return {
      background: info?.color === '#a52016' ? '#fdeeeb' : info?.color === '#c25a1e' ? '#faf1d3' : '#e6efe9',
      color: info?.color ?? '#4a544f',
    };
  };

  return (
    <main className="flex flex-1 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="titulo-pagina">Riesgos y oportunidades</h1>
            <p className="font-mono text-10_5 text-label">
              MAT-CAL-02 · metodología MAN-CAL-01 · ISO 31000:2018
            </p>
            <p className="text-12_5 text-muted">
              {filas.length} registros · inherente y residual calculados al leer.{' '}
              <a href="/estrategico/parametros" className="font-medium" style={{ color: 'var(--hf-brand-nav)' }}>
                Parámetros del modelo →
              </a>
            </p>
          </div>
          <nav className="flex items-center gap-2">
            {(['todos', 'RIESGO', 'OPORTUNIDAD'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setClase(c)}
                aria-pressed={clase === c}
                className="rounded-chip px-3.5 py-1.5 text-12"
                style={{
                  background: clase === c ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                  color: clase === c ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  border: '1px solid var(--hf-border-field)',
                  fontWeight: clase === c ? 600 : 500,
                }}
              >
                {c === 'todos' ? 'Todos' : c === 'RIESGO' ? 'Riesgos' : 'Oportunidades'} ·{' '}
                {c === 'todos' ? filas.length : filas.filter((f) => f.clase === c).length}
              </button>
            ))}
          </nav>
        </div>

        {esOportunidad && (
          <p
            className="mt-4 rounded-campo px-4 py-3 text-11_5"
            style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
          >
            En una oportunidad el cálculo <strong>reduce</strong> igual que en un riesgo:
            cuanto mejor gestionada, más bajo su residual. Se reproduce el Excel tal cual
            (paridad verificable), y la decisión de invertir la aritmética es del comité
            de riesgos (D9).
          </p>
        )}

        <div className="mt-4 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
          <table className="w-full text-left text-12_5">
            <thead>
              <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
                <th className="px-4 py-3 font-semibold">Núm</th>
                <th className="px-4 py-3 font-semibold">Riesgo u oportunidad</th>
                <th className="px-4 py-3 font-semibold">Factor</th>
                <th className="px-4 py-3 text-center font-semibold">P</th>
                <th className="px-4 py-3 text-center font-semibold">I</th>
                <th className="px-4 py-3 text-right font-semibold">Inh.</th>
                <th className="px-4 py-3 font-semibold">Control</th>
                <th className="px-4 py-3 text-right font-semibold">Res.</th>
                <th className="px-4 py-3 font-semibold">Nivel res.</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr
                  key={f.id}
                  className="cursor-pointer border-t border-border-default hover:bg-app"
                  onClick={() => {
                    setAbierto(f);
                    setP(f.p);
                    setI(f.i);
                    // Los ids, no el prefijo del texto de presentación.
                    setTipoId(f.controlTipoId ?? tipos[0]?.id ?? 0);
                    setEficaciaId(f.controlEficaciaId ?? eficacias[0]?.id ?? 0);
                    setDescripcionControl(f.controlDescripcion ?? '');
                    setAviso(null);
                  }}
                >
                  <td className="px-4 py-3 font-mono text-11 font-medium" style={{ color: 'var(--hf-brand-nav)' }}>
                    {f.codigo}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-primary">{f.descripcion}</span>
                    <span className="ml-2 font-mono text-10_5 text-muted">
                      {f.proceso} · {f.clase.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{f.factor}</td>
                  <td className="px-4 py-3 text-center font-mono text-11">{f.p}</td>
                  <td className="px-4 py-3 text-center font-mono text-11">{f.i}</td>
                  <td className="px-4 py-3 text-right font-mono text-11">{f.inherente}</td>
                  <td className="px-4 py-3 text-11_5 text-muted">{f.control ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-11 font-semibold" style={{ color: f.nivelColor }}>
                    {f.residual}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                      style={nivelStyle(f.nivel)}
                    >
                      {f.nivelEtiqueta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {abierto && (
        <aside
          className="sticky top-[calc(var(--hf-header-alto)+16px)] ml-6 flex h-fit w-[340px] shrink-0 flex-col gap-4 rounded-tarjeta border border-border-field bg-surface p-5"
          style={{ top: 'calc(var(--hf-header-alto) + 16px)' }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-12 font-semibold text-primary">{abierto.codigo}</span>
            <button onClick={() => setAbierto(null)} aria-label="Cerrar panel" className="text-14 text-muted">
              ✕
            </button>
          </div>
          <p className="text-12_5 font-medium text-primary">{abierto.descripcion}</p>

          <Escala
            etiqueta="Probabilidad"
            valor={p}
            onElegir={setP}
            nota={p === abierto.p ? 'La que declara el registro' : `El registro declara ${abierto.p}`}
            movido={p !== abierto.p}
          />
          <Escala
            etiqueta="Impacto"
            valor={i}
            onElegir={setI}
            nota={i === abierto.i ? 'El que declara el registro' : `El registro declara ${abierto.i}`}
            movido={i !== abierto.i}
          />

          <div className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Tipo de control · qué reduce</span>
            <div className="flex flex-col gap-1">
              {tipos.map((t) => {
                const activo = tipoId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTipoId(t.id)}
                    aria-pressed={activo}
                    className="flex items-center justify-between gap-2 rounded-campo px-3 py-1.5 text-12"
                    style={{
                      background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                      color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                      border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                      fontWeight: activo ? 600 : 500,
                    }}
                  >
                    <span>{t.nombre}</span>
                    <span className="font-mono text-9 opacity-80">{t.reduce.toLowerCase()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Medición del control</span>
            <div className="flex flex-wrap gap-1">
              {eficacias.map((e) => {
                const activo = eficaciaId === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => setEficaciaId(e.id)}
                    aria-pressed={activo}
                    className="inline-flex items-center gap-1.5 rounded-campo px-3 py-1.5 text-12"
                    style={{
                      background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                      color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                      border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                      fontWeight: activo ? 600 : 500,
                    }}
                  >
                    {e.nombre}
                    <span className="font-mono text-9 opacity-75">{Math.round(e.valor * 100)} %</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* El cálculo, paso a paso. Cada línea dice la FÓRMULA además del número: el
              panel existe para que alguien entienda de dónde sale el residual, y un
              número sin su fórmula sólo se cree o no se cree. */}
          <div
            className="flex flex-col gap-2 rounded-tarjeta px-3.5 py-3.5"
            style={{ background: 'var(--hf-bg-subtle)', border: '1px solid var(--hf-border-field)' }}
          >
            <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
              El cálculo
            </span>
            {pasos.map((paso) => (
              <span key={paso.formula} className="flex items-baseline gap-2.5">
                <span className="flex-1 font-mono text-10_5 text-muted">{paso.formula}</span>
                <span
                  className="flex-none font-mono text-13 font-semibold tabular-nums"
                  style={{ color: paso.color }}
                >
                  {paso.valor}
                </span>
              </span>
            ))}
          </div>

          <div className="flex gap-2.5">
            <span
              className="flex flex-1 flex-col gap-1.5 rounded-tarjeta bg-surface px-3.5 py-3"
              style={{
                border: '1px solid var(--hf-border-field)',
                borderTop: `2px solid ${colorDeNivel(nivelDe(calculo.inherente, minimos))}`,
              }}
            >
              <span className="etiqueta-campo">Inherente</span>
              <span
                className="font-mono text-22 font-semibold leading-none"
                style={{ color: colorDeNivel(nivelDe(calculo.inherente, minimos)) }}
              >
                {calculo.inherente}
              </span>
              <span className="text-10_5 text-muted">
                {niveles[nivelDe(calculo.inherente, minimos)]?.etiqueta ?? '—'}
              </span>
            </span>
            <span
              className="flex flex-1 flex-col gap-1.5 rounded-tarjeta bg-surface px-3.5 py-3"
              style={{
                border: '1px solid var(--hf-border-field)',
                borderTop: `2px solid ${nivelInfo?.color ?? '#4a544f'}`,
              }}
            >
              <span className="etiqueta-campo">Residual</span>
              <span
                className="font-mono text-22 font-semibold leading-none"
                style={{ color: nivelInfo?.color }}
              >
                {redondear(calculo.residual)}
              </span>
              <span className="text-10_5 text-muted">{nivelInfo?.etiqueta ?? '—'}</span>
            </span>
          </div>

          <div
            className="flex flex-col gap-1.5 rounded-tarjeta px-3.5 py-3"
            style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-border)' }}
          >
            <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
              Tratamiento sugerido
            </span>
            <span className="text-13 font-semibold" style={{ color: 'var(--hf-brand-nav)' }}>
              {(esOportunidad ? nivelInfo?.accionOportunidad : nivelInfo?.accionRiesgo) ?? '—'}
            </span>
            <span className="text-11 leading-relaxed text-secondary-soft [text-wrap:pretty]">
              Se deriva del nivel residual según los criterios parametrizados; puede
              sobrescribirse con aprobación del comité.
            </span>
          </div>

          {esOportunidad && (
            <p
              className="rounded-tarjeta px-3.5 py-3 text-11 leading-relaxed [text-wrap:pretty]"
              style={{
                background: 'var(--hf-warn-100)',
                border: '1px solid var(--hf-warn-border)',
                color: 'var(--hf-warn-text)',
              }}
            >
              En una oportunidad el cálculo <strong className="font-semibold">reduce</strong>{' '}
              igual que en un riesgo: mientras mejor gestionada, más bajo sale el residual. Se
              reproduce el Excel tal cual, y la decisión de invertirlo es del comité de riesgos.
            </p>
          )}

          {/* Guardar el control. Mover P e I no se guarda, y la pantalla lo dice: son las
              escalas que el registro declara, y cambiarlas es una decisión del comité que
              todavía no tiene acción de servidor. Lo que SÍ se puede registrar es el
              control, que es lo que mueve el residual. */}
          <div className="flex flex-col gap-2 border-t border-hairline pt-3.5">
            <span className="etiqueta-campo">Registrar este control</span>
            <input
              value={descripcionControl}
              onChange={(e) => setDescripcionControl(e.target.value)}
              placeholder="Qué se hace, concretamente"
              className="entrada-campo"
            />
            <button
              onClick={async () => {
                setGuardando(true);
                setAviso(null);
                const r = await agregarControlRiesgo(abierto.id, {
                  descripcion: descripcionControl,
                  tipoId,
                  eficaciaId,
                });
                setGuardando(false);
                setAviso({ ok: r.ok, texto: r.mensaje });
                if (r.ok) setTimeout(() => window.location.reload(), 1200);
              }}
              disabled={descripcionControl.trim() === '' || guardando}
              className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--hf-accent-500)' }}
            >
              {guardando ? 'Guardando…' : 'Agregar el control'}
            </button>
            {aviso && (
              <p
                className="text-11_5 [text-wrap:pretty]"
                style={{
                  color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
                }}
              >
                {aviso.texto}
              </p>
            )}
            <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
              {abierto.controles > 1
                ? `${abierto.controles} controles registrados; el residual usa el más eficaz.`
                : 'Mover probabilidad e impacto no se guarda: son las escalas que el registro declara.'}
            </p>
          </div>
        </aside>
      )}
    </main>
  );
}

/// Los cinco botones de una escala, como el lienzo. Un `range` esconde el valor actual
/// hasta que alguien lo arrastra; cinco botones lo muestran siempre.
function Escala({
  etiqueta,
  valor,
  onElegir,
  nota,
  movido,
}: {
  etiqueta: string;
  valor: number;
  onElegir: (v: number) => void;
  nota: string;
  movido: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="etiqueta-campo">{etiqueta}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const activo = valor === n;
          return (
            <button
              key={n}
              onClick={() => onElegir(n)}
              aria-pressed={activo}
              aria-label={`${etiqueta} ${n}`}
              className="flex-1 rounded-campo py-1.5 font-mono text-12"
              style={{
                background: activo ? 'var(--hf-brand-nav)' : 'var(--hf-bg-surface)',
                color: activo ? '#ffffff' : 'var(--hf-text-secondary-soft)',
                border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                fontWeight: activo ? 600 : 400,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <span
        className="text-11"
        style={{ color: movido ? 'var(--hf-warn-text)' : 'var(--hf-text-muted)' }}
      >
        {nota}
      </span>
    </div>
  );
}

/// Dos decimales sólo cuando hacen falta: «6» y «4,8», no «6.00» y «4.80».
function redondear(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '').replace('.', ',');
}

function tipoToken(nombre: string): string {
  switch (nombre) {
    case 'Preventivo':
      return 'PREVENTIVO';
    case 'Correctivo':
      return 'CORRECTIVO';
    case 'Preventivo y correctivo':
      return 'PREVENTIVO_Y_CORRECTIVO';
    case 'Reforzador':
      return 'REFORZADOR';
    case 'Reactivo':
      return 'REACTIVO';
    default:
      return 'PROACTIVO';
  }
}