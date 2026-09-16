'use client';

// app/sig/colaboradores/AltaColaborador.tsx
//
// El alta manual de un colaborador.
//
// LA PANTALLA DICE LO QUE EL ALTA SIGNIFICA, y no es un detalle de redacción. Dar de alta a
// alguien acá lo marca como `origen: MANUAL`, que el módulo cuenta como ANOMALÍA: una persona
// activa sin cuenta del Directorio no puede entrar a la aplicación ni recibir asignaciones
// por los caminos normales. Eso no es un efecto secundario a descubrir después en la columna
// de anomalías — es la consecuencia de lo que se está por hacer, y va escrita arriba del
// botón que lo hace.
//
// EL CORREO EXTERNO ES UNA RESPUESTA, NO UN ERROR. Un contratista que empieza el lunes y cuya
// cuenta se crea el jueves tiene un correo, y es el suyo. Se acepta, se avisa qué implica, y
// la sincronización lo resuelve cuando la cuenta exista.

import { useState } from 'react';
import type { ColaboradorNuevo } from '@/app/sig/acciones/colaborador-alta';

/// El dominio corporativo, para distinguir de un vistazo una cuenta del Directorio de una
/// externa. Es sólo para el AVISO: quien decide es la sincronización, no esta constante.
const DOMINIO = '@cuantico.com';

export default function AltaColaborador({
  tiposDeContrato,
  areas,
  cargos,
  onCerrar,
  onCrear,
}: {
  tiposDeContrato: { id: number; nombre: string }[];
  areas: { id: number; nombre: string }[];
  cargos: { id: number; nombre: string }[];
  onCerrar: () => void;
  onCrear: (datos: ColaboradorNuevo) => Promise<boolean>;
}) {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [tipoContratoId, setTipoContratoId] = useState('');
  const [tipoColaborador, setTipoColaborador] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [areaId, setAreaId] = useState('');
  const [cargoId, setCargoId] = useState('');
  const [guardando, setGuardando] = useState(false);

  const limpio = correo.trim().toLowerCase();
  const esExterno = limpio !== '' && !limpio.endsWith(DOMINIO);
  const listo = nombre.trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio);

  const enviar = async (): Promise<void> => {
    if (!listo || guardando) return;
    setGuardando(true);
    const ok = await onCrear({
      nombre,
      correo,
      tipoContratoId: tipoContratoId === '' ? null : Number(tipoContratoId),
      tipoColaborador:
        tipoColaborador === '' ? null : (tipoColaborador as 'BASE' | 'RECURRENTE' | 'TEMPORAL'),
      fechaIngreso: fechaIngreso === '' ? null : fechaIngreso,
      areaId: areaId === '' ? null : Number(areaId),
      cargoId: cargoId === '' ? null : Number(cargoId),
    });
    setGuardando(false);
    if (!ok) return;
  };

  return (
    <div className="mt-4 rounded-tarjeta border border-border-field bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-15 font-semibold text-primary">Nuevo colaborador</h2>
        <button
          type="button"
          onClick={onCerrar}
          className="text-12_5 text-muted hover:text-primary"
        >
          Cancelar
        </button>
      </div>

      <p className="mt-1.5 max-w-[92ch] text-12 leading-relaxed text-muted [text-wrap:pretty]">
        El Directorio manda sobre quién existe. Un alta hecha acá queda marcada como{' '}
        <strong className="font-semibold text-secondary">manual</strong> —y la lista la cuenta
        como anomalía— hasta que la sincronización encuentre a esta persona por su correo. Es
        para registrar a quien ya empezó y todavía no tiene cuenta, no para reemplazar al
        Directorio.
      </p>

      <div className="mt-4 grid gap-x-4 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Campo etiqueta="NOMBRE COMPLETO">
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ana María Restrepo"
            className={ENTRADA}
          />
        </Campo>

        <Campo etiqueta="CORREO">
          <input
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder={`ana.restrepo${DOMINIO}`}
            className={ENTRADA}
          />
        </Campo>

        <Campo etiqueta="TIPO DE CONTRATO">
          <select
            value={tipoContratoId}
            onChange={(e) => setTipoContratoId(e.target.value)}
            className={ENTRADA}
          >
            <option value="">— sin declarar —</option>
            {tiposDeContrato.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="TIPO DE COLABORADOR">
          <select
            value={tipoColaborador}
            onChange={(e) => setTipoColaborador(e.target.value)}
            className={ENTRADA}
          >
            <option value="">— sin declarar —</option>
            <option value="BASE">Base</option>
            <option value="RECURRENTE">Recurrente</option>
            <option value="TEMPORAL">Temporal</option>
          </select>
        </Campo>

        <Campo etiqueta="FECHA DE INGRESO">
          <input
            type="date"
            value={fechaIngreso}
            onChange={(e) => setFechaIngreso(e.target.value)}
            className={ENTRADA}
          />
        </Campo>

        <Campo etiqueta="ÁREA">
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={ENTRADA}>
            <option value="">— sin asignar —</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="CARGO">
          <select value={cargoId} onChange={(e) => setCargoId(e.target.value)} className={ENTRADA}>
            <option value="">— sin asignar —</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {esExterno && (
        <p className="mt-3 max-w-[92ch] rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-11_5 leading-relaxed text-warn-text [text-wrap:pretty]">
          <strong>{limpio}</strong> no es una cuenta de {DOMINIO}. Se guarda igual —sirve para
          notificar— pero con un correo externo la persona <strong>no puede entrar a la
          aplicación</strong>: el ingreso es con la cuenta corporativa. Cuando se la creen, la
          sincronización la va a reconocer por este mismo correo si coincide.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!listo || guardando}
          onClick={enviar}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {guardando ? 'Creando…' : 'Crear colaborador'}
        </button>
        <span className="text-11 text-label [text-wrap:pretty]">
          Nace sin activos y sin obligaciones: para que le llegue algo hay que asignárselo.
        </span>
      </div>
    </div>
  );
}

const ENTRADA =
  'w-full rounded-campo border border-border-field bg-surface px-2.5 py-[7px] text-12_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300';

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="etiqueta-campo text-9">{etiqueta}</span>
      {children}
    </label>
  );
}
