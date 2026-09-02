'use client';

// app/estrategico/PanelTrazabilidad.client.tsx
//
// «Riesgos que originó» del lienzo: el panel que muestra qué salió de la entrada elegida.
//
// Es el camino inverso al de originar un riesgo, y el que justifica que D2 guarde la
// referencia tipada en vez de copiar el texto del análisis. Con el texto copiado se puede
// ir del riesgo al DOFA leyendo la descripción; del DOFA al riesgo, no. Y ése es el que un
// auditor pide cuando pregunta qué produjo el análisis del año pasado.

import type { RiesgoOriginado } from './trazabilidad';

export default function PanelTrazabilidad({
  entradaTexto,
  riesgos,
  vacioTexto,
  climatico,
}: {
  /// La entrada elegida, o `null` si no hay ninguna.
  entradaTexto: string | null;
  riesgos: RiesgoOriginado[];
  /// Qué decir cuando la entrada no originó nada. Cambia entre DOFA y PESTEL.
  vacioTexto: string;
  /// La nota de la enmienda ISO 2024. Sólo PESTEL la lleva: es su dimensión ambiental.
  climatico?: boolean;
}) {
  return (
    <aside className="flex w-[336px] flex-none flex-col gap-4 self-start">
      <div className="flex flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <div className="flex flex-col gap-1.5 border-b border-hairline px-4.5 py-4">
          <span className="flex items-center gap-2.5">
            <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
              Riesgos que originó
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
            {entradaTexto !== null && (
              <span className="font-mono text-9_5 text-label">{riesgos.length}</span>
            )}
          </span>
          <span
            className="text-12_5 leading-snug"
            style={{
              color: entradaTexto === null ? 'var(--hf-text-label)' : 'var(--hf-text-primary)',
              fontWeight: entradaTexto === null ? 400 : 500,
            }}
          >
            {entradaTexto ?? 'Elegí una entrada para ver qué salió de ella.'}
          </span>
        </div>

        <div className="flex flex-col gap-2 px-3.5 py-3">
          {riesgos.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-1.5 rounded-tarjeta border border-border-field bg-subtle px-3.5 py-2.5"
            >
              <span className="flex items-center gap-2">
                <span
                  className="font-mono text-10_5 font-semibold"
                  style={{ color: 'var(--hf-brand-nav)' }}
                >
                  {r.codigo}
                </span>
                <span
                  className="rounded-[4px] px-1.5 py-0.5 font-mono text-8_5 uppercase"
                  style={{
                    background: r.clase === 'OPORTUNIDAD' ? '#e8f4ef' : '#fdeeeb',
                    color: r.clase === 'OPORTUNIDAD' ? '#0b5c44' : '#a52016',
                  }}
                >
                  {r.clase === 'OPORTUNIDAD' ? 'Oportunidad' : 'Riesgo'}
                </span>
              </span>
              <span className="text-12 leading-snug text-primary">{r.texto}</span>
              <span className="flex items-center gap-2">
                <span
                  className="rounded-[4px] px-1.5 py-0.5 font-mono text-8_5 uppercase"
                  style={{ background: 'var(--hf-bg-app)', color: r.nivelColor }}
                >
                  {r.nivel}
                </span>
                <span className="font-mono text-9_5 text-muted">residual {r.residual}</span>
              </span>
            </div>
          ))}

          {entradaTexto !== null && riesgos.length === 0 && (
            <span className="px-2 py-6 text-center text-11_5 leading-relaxed text-label [text-wrap:pretty]">
              {vacioTexto}
            </span>
          )}
        </div>
      </div>

      <div
        className="flex flex-col gap-1.5 rounded-tarjeta px-3.5 py-3"
        style={{ background: 'var(--hf-bg-subtle)', border: '1px solid var(--hf-border-field)' }}
      >
        <span className="etiqueta-campo">Trazabilidad</span>
        <span className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
          El riesgo guarda <code className="font-mono">entradaContextoId</code>, no el texto
          «DOFA». Por eso se puede entrar por la debilidad y ver qué salió de ella, que es lo
          que el Excel nunca pudo hacer.
        </span>
      </div>

      {climatico && (
        <div
          className="flex flex-col gap-1.5 rounded-tarjeta px-3.5 py-3"
          style={{ background: 'var(--hf-bg-subtle)', border: '1px solid var(--hf-border-field)' }}
        >
          <span className="etiqueta-campo">Enmienda de cambio climático</span>
          <span className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
            La dimensión ambiental deja de ser opcional desde la enmienda ISO de 2024. La
            matriz de partes interesadas ya lleva su bandera; acá es donde se analiza el
            contexto que la sustenta.
          </span>
        </div>
      )}
    </aside>
  );
}
