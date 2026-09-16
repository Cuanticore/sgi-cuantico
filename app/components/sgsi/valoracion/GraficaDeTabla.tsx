'use client';

// app/components/sgsi/valoracion/GraficaDeTabla.tsx
//
// La gráfica que describe una de las dos tablas: una barra apilada por fila, con la misma
// rampa y las mismas reglas de marca que las cuatro pilas de arriba.
//
// ── SALE DEL MISMO DATO QUE LA TABLA, NO DE UN SEGUNDO CÁLCULO ──────────────────────────
//
// Recibe la `TablaAgrupada` ya armada y lee su `porCriterio`. Si la gráfica volviera a
// repartir por su cuenta, tendría que repetir el criterio de «sin valorar», el del umbral y
// el del orden — tres reglas que tienen que decir lo mismo que la tabla de al lado y que, el
// día que una cambie, no lo dirían. Una tabla y su gráfica que no coinciden es peor que no
// tener la gráfica.
//
// ── POR QUÉ UNA BARRA APILADA Y NO UN ANILLO NI UNA TORTA ───────────────────────────────
//
// Lo que se compara es la MAGNITUD de una escala ordinal —cuántos activos en cada nivel— a
// lo largo de muchos grupos. La barra apilada horizontal es la única forma que permite las
// tres lecturas a la vez: cuánto tiene cada grupo, cómo se reparte adentro, y cuál grupo
// tiene más. Una torta por grupo obligaría a comparar ángulos entre figuras distintas.
//
// ── LA ESCALA ES ABSOLUTA Y COMPARTIDA ──────────────────────────────────────────────────
//
// El largo significa CUÁNTOS ACTIVOS, no un porcentaje. Normalizar cada barra al 100 % haría
// que un cargo con tres activos se viera igual de largo que uno con noventa, que es
// exactamente la comparación que esta pantalla existe para permitir.

import { useMemo, useState } from 'react';
import {
  ALTO_BARRA,
  ANCHO_TRAZADO,
  RADIO_EXTREMO,
  colorDeNivelValor,
  segmentos,
} from '@/lib/sgsi/valoracion-figura';
import type { Criterio, NivelEscala, TablaAgrupada } from '@/lib/sgsi/valoracion-agregada';

/// Cuántas barras se dibujan antes de pedir «ver todas».
///
/// Con cuarenta subtipos, la gráfica entera es un muro que no se lee y que empuja la tabla
/// fuera de la pantalla. Doce entran de un vistazo y son las que importan: van ordenadas por
/// cuántos activos alcanzan el umbral, así que las doce primeras son las que más exponen.
const TOPE_INICIAL = 12;

export default function GraficaDeTabla({
  tabla,
  criterios,
  niveles,
  umbral,
  etiquetaGrupo,
}: {
  tabla: TablaAgrupada;
  criterios: readonly Criterio[];
  /// Ascendentes, como los usa `segmentos`.
  niveles: readonly NivelEscala[];
  umbral: number;
  /// «Propietario», «Subtipo». Para que el eje diga qué es cada barra.
  etiquetaGrupo: string;
}) {
  const [criterio, setCriterio] = useState(criterios[0]?.clave ?? '');
  const [soloConUmbral, setSoloConUmbral] = useState(false);
  const [todas, setTodas] = useState(false);

  const filas = useMemo(() => {
    const base = soloConUmbral ? tabla.filas.filter((f) => f.desdeUmbral > 0) : tabla.filas;
    return todas ? base : base.slice(0, TOPE_INICIAL);
  }, [tabla.filas, soloConUmbral, todas]);

  // La escala la fija la barra más larga de las que SE DIBUJAN. Tomarla del total de la
  // tabla dejaría las doce primeras aplastadas contra el margen cuando se filtra.
  const escala = useMemo(
    () => filas.reduce((m, f) => Math.max(m, f.porCriterio[criterio]?.valorados ?? 0), 0),
    [filas, criterio],
  );

  const ocultas = (soloConUmbral ? tabla.filas.filter((f) => f.desdeUmbral > 0) : tabla.filas)
    .length - filas.length;

  if (tabla.filas.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Los filtros en una sola fila arriba, que es donde se los busca. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          <span className="etiqueta-campo text-9">CRITERIO</span>
          <select
            value={criterio}
            onChange={(e) => setCriterio(e.target.value)}
            className="rounded-campo border border-border-field bg-surface px-2 py-1 text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          >
            {criterios.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-11_5 text-secondary-soft">
          <input
            type="checkbox"
            checked={soloConUmbral}
            onChange={(e) => {
              setSoloConUmbral(e.target.checked);
              setTodas(false);
            }}
          />
          Sólo los que alcanzan {umbral}
        </label>

        <span className="ml-auto font-mono text-9_5 text-label">
          {filas.length} de {tabla.filas.length} {etiquetaGrupo.toLowerCase()}s · escala absoluta
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {filas.map((f) => {
          const reparto = f.porCriterio[criterio];
          if (!reparto) return null;
          const partes = segmentos(reparto, niveles, escala, umbral, ANCHO_TRAZADO);
          return (
            <div key={f.clave} className="flex items-center gap-3">
              <span
                className="flex-none truncate text-11_5 text-secondary"
                style={{ width: 168 }}
                title={f.subtitulo === null ? f.etiqueta : `${f.etiqueta} · ${f.subtitulo}`}
              >
                {f.etiqueta}
                {f.inactiva && <span className="ml-1 text-10 text-warn-text">· inactiva</span>}
              </span>

              <div className="relative flex-none" style={{ width: ANCHO_TRAZADO, height: ALTO_BARRA }}>
                {partes.map((s) => (
                  <span
                    key={s.valor}
                    // Cada segmento lleva su cuenta en el `title`: la barra da la forma y el
                    // número exacto no se lee de un ancho, se lee de un número.
                    title={`${f.etiqueta} · ${s.etiqueta} · ${s.cuenta} ${s.cuenta === 1 ? 'activo' : 'activos'}`}
                    className="absolute top-0"
                    style={{
                      left: s.x,
                      width: s.ancho,
                      height: ALTO_BARRA,
                      background: s.color,
                      borderTopLeftRadius: s.primero ? RADIO_EXTREMO : 0,
                      borderBottomLeftRadius: s.primero ? RADIO_EXTREMO : 0,
                      borderTopRightRadius: s.ultimo ? RADIO_EXTREMO : 0,
                      borderBottomRightRadius: s.ultimo ? RADIO_EXTREMO : 0,
                    }}
                  />
                ))}
              </div>

              <span className="flex-none text-right font-mono text-11 tabular-nums text-primary" style={{ width: 64 }}>
                {f.desdeUmbral} ≥ {umbral}
              </span>
            </div>
          );
        })}
      </div>

      {ocultas > 0 && !todas && (
        <button
          type="button"
          onClick={() => setTodas(true)}
          className="w-fit text-11_5 font-semibold text-accent-700 hover:underline"
        >
          Ver las {ocultas} restantes →
        </button>
      )}
      {todas && (
        <button
          type="button"
          onClick={() => setTodas(false)}
          className="w-fit text-11_5 font-semibold text-accent-700 hover:underline"
        >
          Ver sólo las {TOPE_INICIAL} primeras
        </button>
      )}

      {/* La misma leyenda que las pilas, con el número DENTRO del cuadrito: seis pasos de un
          solo tono no se separan lo suficiente como para cargar solos la identidad. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {[...niveles].reverse().map((n) => (
          <span key={n.valor} className="flex items-center gap-1.5 text-11 text-secondary-soft">
            <span
              aria-hidden
              className="inline-flex items-center justify-center font-mono text-9 font-bold tabular-nums"
              style={{
                width: 16,
                height: 13,
                borderRadius: 2,
                background: colorDeNivelValor(n.valor),
                color: n.valor >= 3 ? '#ffffff' : 'var(--hf-text-primary)',
                flex: 'none',
              }}
            >
              {n.valor}
            </span>
            {n.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}
