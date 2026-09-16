'use client';

// app/sig/personas/AsociarPc.tsx
//
// El equipo de cómputo de la persona: elegir uno de los que están libres, o crearlo.
//
// LOS DOS CAMINOS NO SON EQUIVALENTES Y LA PANTALLA LO DICE. Asociar uno existente es
// registrar un hecho: ese equipo ya estaba en el inventario y ahora se sabe quién lo tiene.
// Crear uno es AGREGAR un activo al inventario, con su código emitido y su valoración
// inicial, y eso es una afirmación sobre lo que la organización tiene. Por eso la lista de
// libres va primero: si el equipo ya está inventariado, crear un segundo lo duplica.

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  asociarPc,
  crearPcParaPersona,
  pcsDisponibles,
  type PcDisponible,
  type PropiedadDelEquipo,
} from '@/app/sig/acciones/pc-colaborador';

export default function AsociarPc({
  personaId,
  nombrePersona,
  yaTieneEquipo,
  onHecho,
}: {
  personaId: number;
  nombrePersona: string;
  yaTieneEquipo: boolean;
  onHecho: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pcs, setPcs] = useState<PcDisponible[] | null>(null);
  const [elegido, setElegido] = useState('');
  const [propiedad, setPropiedad] = useState<PropiedadDelEquipo>('CUANTICO');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const pedido = useRef(false);

  // La lista de libres se pide al ABRIR el bloque, no al abrir el popup: casi nadie le
  // asocia un equipo a una persona cada vez que mira su ficha.
  useEffect(() => {
    if (!abierto || pcs !== null || pedido.current) return;
    let vigente = true;
    pedido.current = true;
    void pcsDisponibles()
      .then((r) => {
        if (!vigente) return;
        if (!r.ok) setAviso({ ok: false, texto: r.mensaje });
        setPcs(r.pcs);
      })
      .finally(() => {
        pedido.current = false;
      });
    return () => {
      vigente = false;
    };
  }, [abierto, pcs]);

  const asociar = (): void => {
    if (elegido === '') return;
    iniciar(async () => {
      const r = await asociarPc(personaId, Number(elegido));
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setElegido('');
        setPcs(null);
        setAbierto(false);
        onHecho();
      }
    });
  };

  const crear = (): void =>
    iniciar(async () => {
      const r = await crearPcParaPersona(personaId, propiedad);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setPcs(null);
        setAbierto(false);
        onHecho();
      }
    });

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-fit rounded-campo border border-dashed border-accent-border bg-accent-50 px-2.5 py-1.5 text-11_5 font-semibold text-accent-700 transition-colors hover:bg-accent-100"
      >
        {yaTieneEquipo ? '+ Asociar otro equipo' : '+ Asociar un equipo de cómputo'}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-campo border border-border-default bg-subtle px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="etiqueta-campo text-9">EQUIPO DE CÓMPUTO</span>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-11 text-muted hover:text-primary"
        >
          Cerrar
        </button>
      </div>

      {/* ── 1 · el que ya existe ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-11 text-muted [text-wrap:pretty]">
          Si el equipo ya está en el inventario, asociarlo es sólo registrar quién lo tiene.
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={elegido}
            disabled={pendiente || pcs === null || pcs.length === 0}
            onChange={(e) => setElegido(e.target.value)}
            aria-label="Equipo disponible"
            className="min-w-[220px] flex-1 rounded-campo border border-border-field bg-surface px-2 py-[7px] text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
          >
            <option value="">
              {pcs === null
                ? 'buscando equipos libres…'
                : pcs.length === 0
                  ? '— no hay equipos sin asignar —'
                  : '— elegí un equipo —'}
            </option>
            {(pcs ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} · {p.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pendiente || elegido === ''}
            onClick={asociar}
            className="flex-none rounded-campo border border-accent-500 bg-accent-100 px-3 py-[7px] text-11_5 font-semibold text-accent-700 disabled:opacity-40"
          >
            Asociar
          </button>
        </div>
      </div>

      {/* ── 2 · el que no existe todavía ── */}
      <div className="flex flex-col gap-1.5 border-t border-hairline-strong pt-2.5">
        <span className="text-11 text-muted [text-wrap:pretty]">
          Si no está inventariado, se crea acá: <strong>PC de {nombrePersona}</strong>, en el
          proceso de la persona y a su cargo, valorado 3/3/3 y con el código que emite el
          contador.
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={propiedad}
            disabled={pendiente}
            onChange={(e) => setPropiedad(e.target.value as PropiedadDelEquipo)}
            aria-label="De quién es el equipo"
            className="min-w-[200px] flex-1 rounded-campo border border-border-field bg-surface px-2 py-[7px] text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          >
            <option value="CUANTICO">Equipo de Cuántico</option>
            <option value="BYOD">Equipo propio del colaborador (BYOD)</option>
          </select>
          <button
            type="button"
            disabled={pendiente}
            onClick={crear}
            className="flex-none rounded-campo border border-accent-500 bg-accent-100 px-3 py-[7px] text-11_5 font-semibold text-accent-700 disabled:opacity-40"
          >
            {pendiente ? 'Creando…' : 'Crear el equipo'}
          </button>
        </div>
        {propiedad === 'BYOD' && (
          <p className="text-10_5 leading-relaxed text-label [text-wrap:pretty]">
            Un equipo BYOD no lo administra la organización. Queda anotado en la descripción
            del activo — hoy no hay un campo propio para distinguirlos, así que si más adelante
            hay que exigirles algo distinto (cifrado de disco, por ejemplo), eso pide una
            columna y no leer el texto.
          </p>
        )}
      </div>

      {aviso && (
        <p
          className="text-11 leading-relaxed [text-wrap:pretty]"
          style={{ color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
