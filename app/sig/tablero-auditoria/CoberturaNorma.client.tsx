'use client';

// app/sig/tablero-auditoria/CoberturaNorma.client.tsx
//
// La cobertura numeral por numeral, agrupada por capítulo.
//
// Antes era un párrafo rojo con la lista de los que faltan. La lista dice QUÉ falta; la
// malla dice CUÁNTO falta y DÓNDE se concentra — un capítulo entero sin tocar se ve de un
// golpe, y en una lista de códigos no. Y esa concentración es la pregunta del auditor
// externo: no «¿auditaron el 8.5.3?» sino «¿por qué no miraron el capítulo 8?».
//
// El capítulo sale del primer segmento del numeral: «8.5.3» pertenece al 8. Se deriva y no
// se guarda, porque ya está en el numeral y un campo aparte podría contradecirlo.

import { useMemo, useState } from 'react';

export interface NormaCobertura {
  id: number;
  codigo: string;
  nombre: string;
  /// Sólo los auditables: los encabezados de capítulo no cuentan para la cobertura.
  requisitos: { id: number; numeral: string; titulo: string; auditado: boolean }[];
}

export default function CoberturaNorma({ normas }: { normas: NormaCobertura[] }) {
  const [normaId, setNormaId] = useState<number | null>(normas[0]?.id ?? null);
  const norma = normas.find((n) => n.id === normaId) ?? normas[0] ?? null;

  const capitulos = useMemo(() => {
    if (!norma) return [];
    const mapa = new Map<string, typeof norma.requisitos>();
    for (const r of norma.requisitos) {
      const capitulo = r.numeral.split('.')[0];
      const lista = mapa.get(capitulo) ?? [];
      lista.push(r);
      mapa.set(capitulo, lista);
    }
    return [...mapa.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [norma]);

  if (!norma) {
    return (
      <div className="rounded-tarjeta border border-border-field bg-surface p-5">
        <h2 className="text-12_5 font-semibold text-primary">Cobertura de la norma</h2>
        <p className="mt-2 text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          No hay normas cargadas. Los numerales se importan desde Excel en Normas y
          requisitos; sin catálogo no hay contra qué medir la cobertura.
        </p>
      </div>
    );
  }

  const auditados = norma.requisitos.filter((r) => r.auditado).length;
  const total = norma.requisitos.length;
  const sinAuditar = norma.requisitos.filter((r) => !r.auditado);
  const pct = total === 0 ? null : Math.round((auditados / total) * 100);

  return (
    <div className="rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-12_5 font-semibold text-primary">Cobertura de la norma</h2>
        {normas.length > 1 ? (
          <select
            value={norma.id}
            onChange={(e) => setNormaId(Number(e.target.value))}
            className="entrada-campo w-auto font-mono text-11"
          >
            {normas.map((n) => (
              <option key={n.id} value={n.id}>
                {n.codigo}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono text-11 text-muted">{norma.codigo}</span>
        )}
        <span className="text-11_5 text-muted">
          {norma.nombre} · {total} numerales auditables
        </span>
        <span className="ml-auto flex items-baseline gap-2">
          <span
            className="font-mono text-17 font-semibold"
            style={{ color: pct === 100 ? '#0b5c44' : pct !== null && pct >= 70 ? '#8a4407' : '#a52016' }}
          >
            {auditados}
          </span>
          <span className="text-11_5 text-muted">de {total} auditados</span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: '#0f7a5a' }} />
          <span className="text-11 text-secondary-soft">Auditado</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-[10px] w-[10px] rounded-[3px]"
            style={{ background: 'var(--hf-bg-app)', border: '1px solid var(--hf-border-field)' }}
          />
          <span className="text-11 text-secondary-soft">Sin auditar</span>
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {capitulos.map(([capitulo, requisitos]) => {
          const nAuditados = requisitos.filter((r) => r.auditado).length;
          // Un capítulo entero sin tocar se marca aparte: es lo que la lista de códigos
          // no deja ver, y la pregunta que un auditor externo hace primero.
          const entero = nAuditados === 0;
          return (
            <div key={capitulo} className="flex items-start gap-3">
              <span className="flex w-[86px] flex-none flex-col gap-0.5 pt-0.5">
                <span
                  className="font-mono text-10_5"
                  style={{ color: entero ? 'var(--hf-danger-text)' : 'var(--hf-text-label)' }}
                >
                  capítulo {capitulo}
                </span>
                <span
                  className="font-mono text-9_5"
                  style={{ color: entero ? 'var(--hf-danger-text)' : 'var(--hf-text-muted)' }}
                >
                  {nAuditados}/{requisitos.length}
                </span>
              </span>
              <span className="flex flex-1 flex-wrap gap-1">
                {requisitos.map((r) => (
                  <span
                    key={r.id}
                    title={`${r.numeral} · ${r.titulo}${r.auditado ? '' : ' · sin auditar'}`}
                    className="rounded-[4px] px-1.5 py-0.5 font-mono text-9_5"
                    style={
                      r.auditado
                        ? { background: '#e6efe9', color: '#0b5c44' }
                        : {
                            background: 'var(--hf-bg-app)',
                            color: 'var(--hf-text-muted)',
                            border: '1px dashed var(--hf-border-field)',
                          }
                    }
                  >
                    {r.numeral}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>

      {sinAuditar.length > 0 && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: '#fdeeeb', color: '#a52016' }}
        >
          {sinAuditar.length === 1
            ? `Un numeral sin auditar: ${sinAuditar[0].numeral}. `
            : `${sinAuditar.length} numerales sin auditar: ${sinAuditar
                .slice(0, 8)
                .map((r) => r.numeral)
                .join(', ')}${sinAuditar.length > 8 ? ` y ${sinAuditar.length - 8} más` : ''}. `}
          Conviene incluirlos en el programa del año próximo antes de que lo pregunte el
          auditor externo.
        </p>
      )}
      {sinAuditar.length === 0 && total > 0 && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-11_5"
          style={{ background: '#e6efe9', color: '#0b5c44' }}
        >
          Los {total} numerales auditables de {norma.codigo} fueron auditados al menos una vez.
        </p>
      )}
    </div>
  );
}
