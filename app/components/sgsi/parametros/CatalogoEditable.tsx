'use client';

// app/components/sgsi/parametros/CatalogoEditable.tsx
//
// One editable list for the eight support catalogues of screen 9. Alta, renombrado, baja
// lógica and reactivación, all persisted by app/sgsi/acciones/catalogos.ts.
//
// Four rules the list enforces rather than explains:
//
//   · A protected value has no retire control at all. Offering a button that refuses is
//     worse than not offering it, so protection is a labelled badge and the control is
//     absent.
//   · A retired value stays on screen, dimmed and labelled. Hiding it is how somebody
//     re-creates the duplicate the catalogue exists to prevent.
//   · The baja asks for the reason BEFORE it happens, typed, in the row itself. A
//     confirm() collects a click, and a click is not an answer to "why".
//   · Escape leaves the previous name in place without a round trip. Only Enter and
//     leaving the field commit.
//
// The duplicate check runs here too, so the person sees the collision before the round
// trip — but the server is the authority and re-checks it against the whole table,
// retired rows included.

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  crearItem,
  reactivarItem,
  renombrarItem,
  retirarItem,
} from '@/app/sgsi/acciones/catalogos';
import type { Catalogo } from '@/app/sgsi/acciones/catalogos';

export interface ItemVista {
  id: number;
  nombre: string;
  /// Null where the model has the column and it is empty, undefined where the model has no
  /// such column at all. Both mean "nothing to show", and both have to be accepted: the
  /// page passes props and the popup passes an action's result.
  nombreCorto?: string | null;
  prefijo?: string;
  protegido?: boolean;
  activo: boolean;
  usos: number;
}

interface Props {
  catalogo: Catalogo;
  items: ItemVista[];
  /// What the usage count counts, for the label: "activo", "control", "riesgo".
  sustantivoUso: string;
  /// Off for CapacidadOperativa: rename only.
  permiteAlta?: boolean;
  permiteBaja?: boolean;
  /// Area needs the 3-letter prefix on the add form.
  pidePrefijo?: boolean;
  /// CapacidadOperativa edits a short name too.
  pideNombreCorto?: boolean;
  /// Called after a successful write, on top of the route refresh. The popup on the asset
  /// sheet uses it to re-read its own list: `router.refresh()` re-renders the server tree
  /// behind the dialog, but the items the popup holds came from an action, not from props.
  onCambio?: () => void;
  /// On for the asset sheet's popups, off on screen 9. See the filter below for why the two
  /// places want opposite behaviour.
  ocultarRetirados?: boolean;
}

/// Same comparison the action makes: «Nube» and «nube» are one value, and so are
/// «Producción» and «Produccion».
function mismoNombre(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'es', { sensitivity: 'base' }) === 0;
}

export default function CatalogoEditable({
  catalogo,
  items,
  sustantivoUso,
  permiteAlta = true,
  permiteBaja = true,
  pidePrefijo = false,
  pideNombreCorto = false,
  onCambio,
  ocultarRetirados = false,
}: Props) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const [borrador, setBorrador] = useState('');
  const [borradorPrefijo, setBorradorPrefijo] = useState('');

  const [editando, setEditando] = useState<number | null>(null);
  const [textoNombre, setTextoNombre] = useState('');
  const [textoCorto, setTextoCorto] = useState('');

  const [retirando, setRetirando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');

  // Escape has to be able to close the field without the ensuing blur committing what the
  // person just abandoned.
  const cancelado = useRef(false);

  const nuevoNombre = borrador.trim();

  // Retired rows go after the live ones, in the order the server sent them.
  //
  // On the asset sheet's popups they are hidden: there the person is PICKING a value, not
  // auditing the catalogue, and a retired row with a «reactivar» button is noise in the
  // middle of filling a form. Screen 9 keeps showing them, because that is where the
  // catalogue is administered and hiding them there is how somebody re-creates a duplicate.
  //
  // The one exception survives the filter: if what is being typed matches a retired row,
  // THAT row is shown. Otherwise the server would refuse the alta as a duplicate of
  // something invisible, and the reactivate button that resolves it would be unreachable.
  const retirados = items.filter((i) => !i.activo);
  const visiblesRetirados = ocultarRetirados
    ? retirados.filter((i) => nuevoNombre.length > 0 && mismoNombre(i.nombre, nuevoNombre))
    : retirados;
  const filas = [...items.filter((i) => i.activo), ...visiblesRetirados];

  // Checked against EVERY item, retired ones included: the server does the same, and a
  // check that ignored them would enable a button the server is about to refuse.
  const duplicadoAlta = nuevoNombre.length > 0 && items.some((i) => mismoNombre(i.nombre, nuevoNombre));
  const duplicadoRetirado =
    duplicadoAlta && !items.some((i) => i.activo && mismoNombre(i.nombre, nuevoNombre));
  const prefijoValido = !pidePrefijo || /^[A-Za-z]{3}$/.test(borradorPrefijo.trim());

  function correr(operacion: () => Promise<{ ok: boolean; mensaje: string }>): void {
    iniciar(async () => {
      const r = await operacion();
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        router.refresh();
        onCambio?.();
      }
    });
  }

  function agregar(): void {
    if (nuevoNombre.length === 0 || duplicadoAlta || !prefijoValido) return;
    correr(async () => {
      const r = await crearItem(catalogo, {
        nombre: nuevoNombre,
        prefijo: pidePrefijo ? borradorPrefijo.trim().toUpperCase() : undefined,
      });
      if (r.ok) {
        setBorrador('');
        setBorradorPrefijo('');
      }
      return r;
    });
  }

  function abrirEdicion(item: ItemVista): void {
    cancelado.current = false;
    setEditando(item.id);
    setTextoNombre(item.nombre);
    setTextoCorto(item.nombreCorto ?? '');
    setRetirando(null);
  }

  function cerrarEdicion(): void {
    cancelado.current = true;
    setEditando(null);
  }

  function confirmarEdicion(item: ItemVista): void {
    const nombre = textoNombre.trim();
    const corto = textoCorto.trim();
    cerrarEdicion();

    if (nombre.length === 0) return;
    const sinCambio = nombre === item.nombre && (!pideNombreCorto || corto === (item.nombreCorto ?? ''));
    if (sinCambio) return;

    if (items.some((i) => i.id !== item.id && mismoNombre(i.nombre, nombre))) {
      setAviso({
        ok: false,
        texto: `Ya existe «${nombre}» en el catálogo. Dos filas con el mismo nombre reparten los registros entre ellas y ninguna dice la verdad.`,
      });
      return;
    }

    correr(() =>
      renombrarItem(catalogo, item.id, {
        nombre,
        nombreCorto: pideNombreCorto ? corto : undefined,
      }),
    );
  }

  function confirmarBaja(item: ItemVista): void {
    if (motivo.trim().length === 0) return;
    const razon = motivo.trim();
    setRetirando(null);
    setMotivo('');
    correr(() => retirarItem(catalogo, item.id, razon));
  }

  return (
    <div className="flex flex-col gap-2.5">
      {filas.length === 0 ? (
        <p className="text-11_5 text-faint">catálogo vacío</p>
      ) : (
        <ul className="flex flex-col">
          {filas.map((f) => (
            <li
              key={f.id}
              className={`flex flex-col gap-1.5 border-b border-hairline py-1.5 last:border-b-0 ${
                f.activo ? '' : 'opacity-60'
              }`}
            >
              <div className="flex items-center gap-2">
                {editando === f.id ? (
                  <span
                    className="flex min-w-0 flex-1 items-center gap-1.5"
                    onBlur={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                      if (cancelado.current) {
                        cancelado.current = false;
                        return;
                      }
                      confirmarEdicion(f);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmarEdicion(f);
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        cerrarEdicion();
                      }
                    }}
                  >
                    <input
                      autoFocus
                      value={textoNombre}
                      onChange={(e) => setTextoNombre(e.target.value)}
                      disabled={pendiente}
                      aria-label={`Nuevo nombre de ${f.nombre}`}
                      className="min-w-0 flex-1 rounded-campo border border-accent-500 bg-accent-50 px-2 py-0.5 text-12 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                    />
                    {pideNombreCorto && (
                      <input
                        value={textoCorto}
                        onChange={(e) => setTextoCorto(e.target.value)}
                        disabled={pendiente}
                        placeholder="Eje del radar"
                        aria-label={`Nombre corto de ${f.nombre}`}
                        className="w-28 shrink-0 rounded-campo border border-accent-500 bg-accent-50 px-2 py-0.5 font-mono text-11 text-primary placeholder:text-placeholder focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                      />
                    )}
                  </span>
                ) : (
                  <button
                    onClick={() => abrirEdicion(f)}
                    disabled={pendiente}
                    className="min-w-0 flex-1 truncate text-left text-12 text-primary hover:text-accent-700 disabled:cursor-not-allowed"
                    title="Renombrar — el cambio se propaga a todo lo que lo referencia"
                  >
                    {f.nombre}
                    {f.nombreCorto && (
                      <span className="ml-2 font-mono text-10 text-faint">{f.nombreCorto}</span>
                    )}
                  </button>
                )}

                {f.prefijo && (
                  <span
                    className="shrink-0 rounded-badge bg-subtle px-1.5 py-0.5 font-mono text-10 text-secondary"
                    title="Prefijo de codificación: va dentro del código de cada activo del área y no se puede cambiar"
                  >
                    {f.prefijo}
                  </span>
                )}

                {!f.activo && (
                  <span className="shrink-0 rounded-badge border border-border-default bg-subtle px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] text-faint">
                    retirado
                  </span>
                )}

                <span className="shrink-0 font-mono text-10 tabular-nums text-faint">
                  {f.usos === 1 ? `1 ${sustantivoUso}` : `${f.usos} ${sustantivoUso}s`}
                </span>

                {f.protegido ? (
                  <span
                    className="shrink-0 rounded-badge border border-border-default bg-subtle px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] text-faint"
                    title="Valor protegido del catálogo: no se puede retirar"
                  >
                    protegido
                  </span>
                ) : !permiteBaja ? null : f.activo ? (
                  <button
                    onClick={() => {
                      setEditando(null);
                      setMotivo('');
                      setRetirando(retirando === f.id ? null : f.id);
                    }}
                    disabled={pendiente}
                    className="shrink-0 rounded-badge border border-danger-border px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] text-danger-text hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    retirar
                  </button>
                ) : (
                  <button
                    onClick={() => correr(() => reactivarItem(catalogo, f.id))}
                    disabled={pendiente}
                    className="shrink-0 rounded-badge border border-accent-border px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] text-accent-700 hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    reactivar
                  </button>
                )}
              </div>

              {retirando === f.id && (
                <div className="flex items-center gap-2 pl-1">
                  <input
                    autoFocus
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmarBaja(f);
                      }
                      if (e.key === 'Escape') {
                        setRetirando(null);
                        setMotivo('');
                      }
                    }}
                    placeholder="Motivo de la baja — queda en la bitácora"
                    aria-label={`Motivo de la baja de ${f.nombre}`}
                    disabled={pendiente}
                    className="min-w-0 flex-1 rounded-campo border border-danger-border bg-danger-bg px-2 py-1 text-11_5 text-primary placeholder:text-placeholder focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                  />
                  <button
                    onClick={() => confirmarBaja(f)}
                    disabled={pendiente || motivo.trim().length === 0}
                    className="shrink-0 rounded-campo border border-danger-border px-2.5 py-1 font-mono text-10 uppercase tracking-[0.08em] text-danger-text hover:bg-danger-bg disabled:cursor-not-allowed disabled:border-border-default disabled:text-placeholder"
                  >
                    Retirar
                  </button>
                  <button
                    onClick={() => {
                      setRetirando(null);
                      setMotivo('');
                    }}
                    disabled={pendiente}
                    className="shrink-0 rounded-campo border border-border-field px-2.5 py-1 font-mono text-10 uppercase tracking-[0.08em] text-muted hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {permiteAlta && (
        <div className="flex items-center gap-2">
          {pidePrefijo && (
            <input
              value={borradorPrefijo}
              onChange={(e) => setBorradorPrefijo(e.target.value.toUpperCase().slice(0, 3))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') agregar();
              }}
              placeholder="TEC"
              aria-label="Prefijo de codificación de tres letras"
              disabled={pendiente}
              className="w-16 shrink-0 rounded-campo border border-border-field bg-surface px-2 py-1 font-mono text-11 uppercase text-primary placeholder:text-placeholder focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
            />
          )}
          <input
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') agregar();
            }}
            placeholder="Agregar un valor al catálogo…"
            aria-label="Nombre del valor a agregar"
            disabled={pendiente}
            className="min-w-0 flex-1 rounded-campo border border-border-field bg-surface px-2.5 py-1 text-12 text-primary placeholder:text-placeholder focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
          />
          <button
            onClick={agregar}
            disabled={pendiente || nuevoNombre.length === 0 || duplicadoAlta || !prefijoValido}
            className="shrink-0 rounded-campo border border-accent-500 bg-accent-100 px-3 py-1 font-mono text-10 uppercase tracking-[0.08em] text-accent-700 disabled:cursor-not-allowed disabled:border-border-default disabled:bg-subtle disabled:text-placeholder"
          >
            {pendiente ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      )}

      {duplicadoAlta && (
        <p className="text-10_5 text-danger-text">
          {duplicadoRetirado
            ? 'Ya existe con ese nombre, retirado — lo mostré arriba para que lo reactives. Crear otro dejaría dos filas iguales repartiéndose los registros, y ninguna diría la verdad.'
            : 'Ya existe un valor con ese nombre. El catálogo no admite duplicados: dos filas iguales reparten los registros entre ellas y ninguna dice la verdad.'}
        </p>
      )}

      {pidePrefijo && borradorPrefijo.trim().length > 0 && !prefijoValido && (
        <p className="text-10_5 text-danger-text">
          El prefijo son exactamente tres letras. Queda dentro del código de cada activo del
          área y el código es inmutable, así que no se puede corregir después.
        </p>
      )}

      {aviso && (
        <p
          className={`rounded-campo border px-2.5 py-1.5 text-11_5 ${
            aviso.ok
              ? 'border-accent-border bg-accent-100 text-accent-700'
              : 'border-danger-border bg-danger-bg text-danger-text'
          }`}
          role="status"
        >
          {aviso.texto}
        </p>
      )}

      <p className="text-10_5 leading-relaxed text-faint">
        Renombrar propaga el cambio a todo lo que referencia el valor. Retirar es una baja
        lógica con motivo obligatorio: la fila no se borra, sigue explicando los registros
        históricos y deja de ofrecerse en los desplegables.
        {!permiteBaja && ' Este catálogo solo admite renombrar.'}
      </p>
    </div>
  );
}
