'use client';

// app/components/sgsi/parametros/PopupCatalogo.tsx
//
// The `+` beside Proveedor, Propietario, Custodio, Ubicación and Entorno on the asset
// sheet: administer the catalogue WITHOUT LEAVING THE FORM.
//
// It used to be a link to /sgsi/parámetros, on the reasoning that two editors for one list
// would give that list two owners. The reasoning was fine and the remedy was not: leaving
// the sheet abandons whatever the person was typing, so the value they needed never got
// added and the field stayed empty. There is still ONE editor — CatalogoEditable, the same
// component screen 9 renders — it just also shows up here.
//
// Items load from the server when the popup opens, not from the sheet's option lists: those
// lists have no usage count, and a row reading "ningún registro lo referencia" is precisely
// the sentence that invites retiring a value 57 assets depend on.

import { useEffect, useState } from 'react';
import Popup from '@/app/components/sgsi/Popup';
import CatalogoEditable, { type ItemVista } from './CatalogoEditable';
import { listarCatalogo } from '@/app/sgsi/acciones/catalogos';
import { CATALOGOS, type Catalogo } from '@/lib/sgsi/catalogos';

interface Props {
  catalogo: Catalogo;
  onCerrar: () => void;
}

export default function PopupCatalogo({ catalogo, onCerrar }: Props) {
  const regla = CATALOGOS[catalogo];
  const [items, setItems] = useState<ItemVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarCatalogo(catalogo).then((r) => {
      if (!vivo) return;
      if (r.ok) setItems(r.items);
      else setError(r.mensaje);
    });
    return () => {
      vivo = false;
    };
  }, [catalogo]);

  return (
    <Popup
      titulo={`Administrar ${regla.etiqueta}`}
      subtitulo="Los cambios se guardan al instante y quedan en la bitácora. Al cerrar, el desplegable de la ficha ya trae lo que agregaste."
      ancho={620}
      onCerrar={onCerrar}
      pie={
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          Listo
        </button>
      }
    >
      {error !== null ? (
        <p
          className="rounded-campo border px-3.5 py-3 text-12_5 [text-wrap:pretty]"
          style={{
            background: 'var(--hf-danger-bg)',
            borderColor: 'var(--hf-danger-border)',
            color: 'var(--hf-danger-text)',
          }}
        >
          {error}
        </p>
      ) : items === null ? (
        <p className="py-6 text-center text-12_5 text-faint">Cargando el catálogo…</p>
      ) : (
        <CatalogoEditable
          catalogo={catalogo}
          items={items}
          sustantivoUso={regla.sustantivoUso}
          permiteAlta={regla.permiteAlta}
          permiteBaja={regla.permiteBaja}
          pidePrefijo={regla.pidePrefijo}
          pideNombreCorto={regla.usaNombreCorto}
          // Here the person is picking a value, not auditing the catalogue: a retired row
          // with a «reactivar» button in the middle of filling a form is noise. Screen 9
          // still shows them, because that is where hiding them would breed duplicates.
          ocultarRetirados
          // The sheet behind is a server component tree; refreshing it is what puts a
          // newly added value into the select the person was about to use.
          onCambio={() => {
            void listarCatalogo(catalogo).then((r) => {
              if (r.ok) setItems(r.items);
            });
          }}
        />
      )}
    </Popup>
  );
}
