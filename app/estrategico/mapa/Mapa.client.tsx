'use client';

// app/estrategico/mapa/Mapa.client.tsx
//
// La malla 5×5 con el toggle inherente/residual, el conteo y el nivel escrito en cada
// casilla (regla 09), y el panel de la casilla seleccionada con su lista.
//
// El toggle no hacía nada: la página calculaba el residual con `residualDe()` y lo tiraba
// con un `void calculo`, y las dos mallas usaban la misma clave. Es decir, la pantalla
// afirmaba que aplicar controles no mueve un solo riesgo de casilla — que es lo contrario
// de lo que esta vista existe para mostrar.
//
// El panel de la derecha vive siempre, como en el lienzo. Un panel que aparece al hacer
// clic hace saltar la malla y obliga a adivinar que se puede hacer clic.

import { useMemo, useState } from 'react';

interface Celdas {
  [clave: string]: { n: number; ids: number[] };
}

export interface RiesgoDetalle {
  id: number;
  codigo: string;
  clase: string;
  descripcion: string;
  proceso: string;
  factor: string;
  p: number;
  i: number;
  pRes: number;
  iRes: number;
  control: string | null;
  controles: number;
}

const COLOR_CASILLA: Record<string, { bg: string; fg: string }> = {
  Aceptable: { bg: '#eef7f1', fg: '#0b5c44' },
  Moderado: { bg: '#faf1d3', fg: '#6b5410' },
  Inaceptable: { bg: '#f7dcd9', fg: '#8a1f16' },
};

const FILAS = [5, 4, 3, 2, 1];
const COLUMNAS = [1, 2, 3, 4, 5];

/// Un decimal, y sin el `.0` cuando es entero: «1,2» y «3», no «1.20» y «3.00».
function cifra(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

export default function MapaClient({
  inherente,
  residual,
  niveles,
  total,
  detalle,
}: {
  inherente: Celdas;
  residual: Celdas;
  niveles: { minimo: number; etiqueta: string; color: string }[];
  total: number;
  detalle: RiesgoDetalle[];
}) {
  const [vista, setVista] = useState<'inherente' | 'residual'>('inherente');
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const celdas = vista === 'inherente' ? inherente : residual;

  const nivelDeValor = (v: number) => {
    let idx = niveles.length - 1;
    for (let k = 0; k < niveles.length; k++) {
      if (v < niveles[k].minimo) {
        idx = k - 1;
        break;
      }
    }
    return niveles[idx] ?? niveles[niveles.length - 1];
  };

  const seleccionados = useMemo(() => {
    if (!seleccion) return [];
    const ids = new Set(celdas[seleccion]?.ids ?? []);
    return detalle.filter((d) => ids.has(d.id));
  }, [seleccion, celdas, detalle]);

  const [sp, si] = seleccion ? seleccion.split('-').map(Number) : [0, 0];
  const valor = sp * si;
  const nivel = seleccion ? nivelDeValor(valor) : null;

  // Cuántos riesgos cambian de casilla al aplicar los controles. Es la cifra que dice si
  // el tratamiento sirvió de algo, y sin ella el toggle es una curiosidad.
  const movidos = useMemo(
    () => detalle.filter((d) => Math.round(d.pRes) !== d.p || Math.round(d.iRes) !== d.i).length,
    [detalle],
  );

  return (
    <main className="flex flex-1 gap-4 px-8 pt-7 pb-14">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="titulo-pagina">Mapa de calor</h1>
            <p className="max-w-[80ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
              Cada casilla lleva su conteo y{' '}
              <strong className="font-semibold">el nivel escrito</strong>: el color nunca es el
              único portador de la información.
            </p>
          </div>
          <span className="ml-auto flex flex-none items-center gap-0.5 rounded-campo border border-border-field bg-surface p-[3px]">
            {(['inherente', 'residual'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                aria-pressed={vista === v}
                className="rounded-[4px] px-3 py-1 text-12 font-medium capitalize"
                style={{
                  background: vista === v ? 'var(--hf-brand-100)' : 'transparent',
                  color: vista === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)',
                }}
              >
                {v}
              </button>
            ))}
          </span>
        </div>

        <div className="mt-5 flex flex-1 flex-col rounded-tarjeta border border-border-field bg-surface px-5 py-4">
          <span className="mb-3.5 flex items-center gap-2.5">
            <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
              {vista === 'inherente'
                ? 'Nivel inherente · sin controles'
                : 'Nivel residual · con los controles aplicados'}
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
            <span className="font-mono text-9_5 text-label">{total} registros</span>
          </span>

          <div className="flex flex-1 gap-2.5">
            <span className="flex items-center">
              <span
                className="rotate-180 font-mono text-9_5 uppercase tracking-[0.1em]"
                style={{ writingMode: 'vertical-rl', color: 'var(--hf-text-label)' }}
              >
                Probabilidad
              </span>
            </span>

            <div className="flex flex-1 flex-col gap-1.5">
              {FILAS.map((p) => (
                <div key={p} className="flex flex-1 gap-1.5">
                  <span className="flex w-[74px] flex-none items-center justify-end pr-1 font-mono text-9_5 text-muted">
                    {p}
                  </span>
                  {COLUMNAS.map((i) => {
                    const clave = `${p}-${i}`;
                    const n = celdas[clave]?.n ?? 0;
                    const nv = nivelDeValor(p * i);
                    const estilos = COLOR_CASILLA[nv.etiqueta] ?? COLOR_CASILLA.Aceptable;
                    const elegida = seleccion === clave;
                    return (
                      <button
                        key={clave}
                        onClick={() => setSeleccion(clave)}
                        aria-pressed={elegida}
                        aria-label={`Probabilidad ${p}, impacto ${i}: ${n} registro(s), nivel ${nv.etiqueta}`}
                        className="flex min-h-[62px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[8px]"
                        style={{
                          background: estilos.bg,
                          border: elegida
                            ? '2px solid var(--hf-brand-nav)'
                            : '1px solid transparent',
                        }}
                      >
                        <span
                          className="font-mono text-17 font-semibold leading-none"
                          style={{ color: estilos.fg }}
                        >
                          {n > 0 ? n : '·'}
                        </span>
                        <span
                          className="font-mono text-8_5 uppercase tracking-[0.05em]"
                          style={{ color: estilos.fg, opacity: 0.85 }}
                        >
                          {nv.etiqueta}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="mt-0.5 flex gap-1.5">
                <span className="w-[74px] flex-none" />
                {COLUMNAS.map((i) => (
                  <span key={i} className="flex-1 text-center font-mono text-9_5 text-muted">
                    {i}
                  </span>
                ))}
              </div>
              <div className="mt-1 flex justify-center">
                <span
                  className="font-mono text-9_5 uppercase tracking-[0.1em]"
                  style={{ color: 'var(--hf-text-label)' }}
                >
                  Impacto
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3 max-w-[104ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          {movidos === 0
            ? 'Con los controles registrados, ningún riesgo cambia de casilla: o no tienen control, o el que tienen no reduce la variable que los ubica.'
            : `Al aplicar los controles, ${movidos} de ${total} registro(s) cambian de casilla.`}{' '}
          Cuando un riesgo tiene más de un control se aplica el más eficaz: MAN-CAL-01 no
          define cómo se componen dos, y multiplicar sus eficacias sería inventar aritmética
          normativa.
        </p>
      </div>

      <aside className="flex w-[336px] flex-none flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <div className="flex flex-col gap-1 border-b border-hairline px-4.5 py-4">
          <span className="etiqueta-campo">Casilla seleccionada</span>
          {seleccion === null ? (
            <>
              <span className="text-14_5 font-semibold text-primary">Ninguna</span>
              <span className="text-11_5 text-muted">Elegí una casilla en la matriz.</span>
            </>
          ) : (
            <>
              <span className="text-14_5 font-semibold text-primary">
                Probabilidad {sp} · impacto {si}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 uppercase"
                  style={{
                    background: COLOR_CASILLA[nivel?.etiqueta ?? '']?.bg,
                    color: COLOR_CASILLA[nivel?.etiqueta ?? '']?.fg,
                  }}
                >
                  {nivel?.etiqueta}
                </span>
                <span className="font-mono text-11_5 text-muted">
                  {sp} × {si} = {valor} · {seleccionados.length} registro(s)
                </span>
              </span>
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3.5 py-3">
          {seleccionados.map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-2.5 rounded-tarjeta border border-border-field bg-subtle px-3.5 py-2.5"
            >
              <span
                className="flex-none pt-px font-mono text-10_5 font-semibold"
                style={{ color: 'var(--hf-brand-nav)' }}
              >
                {r.codigo}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-12 leading-snug text-primary">{r.descripcion}</span>
                <span className="font-mono text-9 text-muted">
                  {r.proceso} · {r.factor}
                </span>
                {vista === 'residual' && r.control && (
                  <span className="font-mono text-9" style={{ color: 'var(--hf-accent-700)' }}>
                    {cifra(r.p)}×{cifra(r.i)} → {cifra(r.pRes)}×{cifra(r.iRes)}
                    {r.controles > 1 ? ` · ${r.controles} controles, se aplica el más eficaz` : ''}
                  </span>
                )}
                {vista === 'residual' && !r.control && (
                  <span className="font-mono text-9 text-label">Sin control registrado</span>
                )}
              </span>
            </div>
          ))}
          {seleccion !== null && seleccionados.length === 0 && (
            <span className="px-2.5 py-7 text-center text-12 leading-relaxed text-label">
              Ningún registro en esta casilla.
              <br />
              Elegí otra en la matriz.
            </span>
          )}
        </div>
      </aside>
    </main>
  );
}
