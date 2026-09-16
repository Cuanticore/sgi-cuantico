'use client';

// app/components/sgsi/inventario/ResolucionFaltantes.tsx
//
// El paso que convierte un bloqueo en una decisión.
//
// Antes, un cargo que el catálogo no tenía rechazaba la fila y ahí terminaba todo: había
// que abandonar la importación, ir a parámetros, registrar el cargo y volver a empezar. Pero
// que un cargo no esté registrado no dice nada sobre si debe existir — dice que nadie lo
// registró todavía.
//
// UNA DECISIÓN POR NOMBRE, NO POR FILA. Si doce activos nombran el mismo cargo, se decide
// una vez. Una lista fila por fila sería la misma pantalla que bloqueaba, sólo que con
// botones.
//
// POR QUÉ SE VEN JUNTOS. Al ponerlos en una sola lista, dos variantes de tipeo del mismo
// nombre quedan una al lado de la otra y se notan ANTES de existir. Ese es el error que ya
// costó caro acá: el propio esquema documenta cómo «Líder del SIG» y «Lider del SIG»
// terminaron conviviendo en producción.

import { esCreable, type FaltanteCatalogo, type Resolucion } from '@/lib/sgsi/catalogos-curables';
import type { OpcionesCatalogo } from '@/lib/sgsi/plantilla';

interface Props {
  faltantes: FaltanteCatalogo[];
  opciones: OpcionesCatalogo;
  resoluciones: Resolucion[];
  onCambiar: (resoluciones: Resolucion[]) => void;
  /// Verdadero mientras la importación corre: lo decidido ya viajó y cambiarlo acá no
  /// cambiaría lo que el servidor está escribiendo.
  deshabilitado: boolean;
}

/// Cómo se nombra cada catálogo en la pantalla, en singular.
const ETIQUETA: Record<string, string> = {
  cargo: 'Cargo',
  proveedor: 'Proveedor',
  ubicacion: 'Ubicación',
  entorno: 'Entorno',
  area: 'Área',
};

/// La identidad de un faltante dentro de la lista. Insensible a tildes y mayúsculas, igual
/// que la agrupación del servidor: si acá fueran distintos, una decisión no encontraría su
/// faltante.
function clave(catalogo: string, valor: string): string {
  return `${catalogo} ${valor.trim().toLocaleLowerCase('es')}`;
}

export default function ResolucionFaltantes({
  faltantes,
  opciones,
  resoluciones,
  onCambiar,
  deshabilitado,
}: Props) {
  const decidido = (f: FaltanteCatalogo): Resolucion | undefined =>
    resoluciones.find((r) => clave(r.catalogo, r.valor) === clave(f.catalogo, f.valor));

  const reemplazar = (f: FaltanteCatalogo, nueva: Resolucion | null): void => {
    const otras = resoluciones.filter(
      (r) => clave(r.catalogo, r.valor) !== clave(f.catalogo, f.valor),
    );
    onCambiar(nueva ? [...otras, nueva] : otras);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-12_5 text-muted [text-wrap:pretty]">
        El libro nombra {faltantes.length}{' '}
        {faltantes.length === 1 ? 'valor que el catálogo no tiene' : 'valores que el catálogo no tiene'}.
        No son errores del archivo: son nombres sin registrar. Decide uno por uno si se crean
        o si apuntan a algo que ya existe.
      </p>

      {faltantes.map((f) => {
        const actual = decidido(f);
        const disponibles = opciones[f.catalogo] ?? [];
        const puedeCrear = esCreable(f.catalogo);
        const puedeMapear = disponibles.length > 0;
        const id = clave(f.catalogo, f.valor).replace(/\s+/g, '-');

        return (
          <fieldset
            key={id}
            aria-label={`${ETIQUETA[f.catalogo]} «${f.valor}»`}
            className="rounded-campo border border-border-field px-3.5 py-3"
          >
            <legend className="px-1 text-12 text-muted">{ETIQUETA[f.catalogo]}</legend>

            <p className="text-12_5 font-semibold">{f.valor}</p>
            <p className="mt-0.5 text-12 text-muted">
              Lo{' '}
              {f.filas.length === 1 ? 'pide 1 fila' : `piden ${f.filas.length} filas`}:{' '}
              {f.filas.join(', ')}
            </p>

            <div className="mt-2.5 flex flex-col gap-2">
              {puedeCrear ? (
                <label className="flex items-center gap-2 text-12_5">
                  <input
                    type="radio"
                    name={`accion-${id}`}
                    checked={actual?.accion === 'crear'}
                    disabled={deshabilitado}
                    onChange={() =>
                      reemplazar(f, {
                        catalogo: f.catalogo,
                        valor: f.valor,
                        accion: 'crear',
                        // Se propone el nombre del libro: corregirlo es la excepción, no el
                        // caso normal.
                        nombre: f.valor,
                      })
                    }
                  />
                  <span>Crear con este nombre</span>
                </label>
              ) : (
                // `Area.prefijo` es CHAR(3) único y entra en el código de cada activo del
                // área. Inventarlo desde un nombre sería decidir la codificación de la
                // organización por ella, y después es inmutable.
                <p className="text-12 text-muted [text-wrap:pretty]">
                  Un área no se puede crear desde acá: necesita un prefijo de tres letras que
                  entra en el código de sus activos. Créala en parámetros, o mapéala abajo.
                </p>
              )}

              {/* El nombre que va a quedar registrado, editable.
                  El V21 escribe «OpenIA» donde dice OpenAI, y `Proveedor.nombre` es único:
                  registrar el typo lo deja fijo, porque corregirlo después ya no es un alta
                  sino un renombre. La fila sigue diciendo «OpenIA» y lo encuentra igual —
                  quien traduce es el índice de alias. */}
              {actual?.accion === 'crear' && (
                <input
                  type="text"
                  aria-label={`Nombre con el que se va a registrar «${f.valor}»`}
                  value={actual.nombre}
                  disabled={deshabilitado}
                  onChange={(e) =>
                    reemplazar(f, {
                      catalogo: f.catalogo,
                      valor: f.valor,
                      accion: 'crear',
                      nombre: e.target.value,
                    })
                  }
                  className="ml-6 rounded-campo border border-border-field px-2.5 py-1.5 text-12_5"
                />
              )}

              <label className="flex items-center gap-2 text-12_5">
                <input
                  type="radio"
                  name={`accion-${id}`}
                  checked={actual?.accion === 'mapear'}
                  disabled={deshabilitado || !puedeMapear}
                  onChange={() =>
                    reemplazar(f, {
                      catalogo: f.catalogo,
                      valor: f.valor,
                      accion: 'mapear',
                      destino: '',
                    })
                  }
                />
                <span>Usar uno existente</span>
              </label>

              {actual?.accion === 'mapear' && (
                <select
                  aria-label={`A qué ${ETIQUETA[f.catalogo].toLocaleLowerCase('es')} apunta «${f.valor}»`}
                  value={actual.destino}
                  disabled={deshabilitado}
                  onChange={(e) =>
                    reemplazar(f, {
                      catalogo: f.catalogo,
                      valor: f.valor,
                      accion: 'mapear',
                      destino: e.target.value,
                    })
                  }
                  className="ml-6 rounded-campo border border-border-field px-2.5 py-1.5 text-12_5"
                >
                  <option value="">Elegir…</option>
                  {disponibles.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
