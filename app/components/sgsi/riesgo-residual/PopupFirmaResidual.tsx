'use client';

// app/components/sgsi/riesgo-residual/PopupFirmaResidual.tsx
//
// Registrar firmas que ocurrieron EN PAPEL.
//
// ── EL SOPORTE Y LAS FIRMAS SE PIDEN JUNTOS, Y NO ES UNA COMODIDAD ───────────────────────
//
// Marcar una firma sin el papel que la sostiene produce exactamente el registro que nadie
// puede auditar: una afirmación sin evidencia, indistinguible de un error de digitación. Por
// eso este popup no tiene un modo «sólo marcar», y por eso la acción del servidor tampoco lo
// acepta — acá se pide, allá se exige.
//
// ── LO QUE ESTA PANTALLA NUNCA DICE ──────────────────────────────────────────────────────
//
// Nunca dice «firma» en primera persona. Quien usa este popup no está firmando: está
// asentando que otra persona firmó, en un papel, en una fecha. El copy lo mantiene en tercera
// persona («quién firmó por…», «registrar las firmas») porque la aplicación no puede afirmar
// que alguien actuó dentro de ella cuando actuó fuera.
//
// La validación real vive en el servidor: esta pantalla ayuda, no decide.

import { useState, useTransition } from 'react';
import type { RenglonFirmaVista } from '@/app/sgsi/riesgo-residual/acta.query';
import { cargarSoporteActaResidual } from '@/app/sgsi/acciones/acta-residual';

/// Quién firmó cada proceso marcado. La clave es el `areaId`.
type Eleccion = Record<number, { firmanteId: number | null; fechaFirma: string }>;

const HOY = (): string => new Date().toISOString().slice(0, 10);

export default function PopupFirmaResidual({
  actaId,
  renglones,
  alCerrar,
}: {
  actaId: number;
  renglones: readonly RenglonFirmaVista[];
  alCerrar: () => void;
}) {
  // Sólo los que pueden firmar y no lo han hecho. Ofrecer un proceso sin firmante resoluble
  // sería pedir que se marque como firmante a alguien que el catálogo dice que no existe.
  const pendientes = renglones.filter((r) => r.resoluble && !r.aprobo);

  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [eleccion, setEleccion] = useState<Eleccion>({});
  const [archivo, setArchivo] = useState<File | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function alternar(r: RenglonFirmaVista) {
    setError(null);
    setMarcados((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(r.areaId)) {
        siguiente.delete(r.areaId);
      } else {
        siguiente.add(r.areaId);
        setEleccion((e) => ({
          ...e,
          [r.areaId]: e[r.areaId] ?? {
            // Con un solo candidato no hay nada que elegir, y obligar a abrir un desplegable
            // de una opción es una decisión que el sistema le inventa a alguien.
            firmanteId: r.candidatos.length === 1 ? r.candidatos[0].id : null,
            fechaFirma: HOY(),
          },
        }));
      }
      return siguiente;
    });
  }

  function registrar() {
    setError(null);
    if (marcados.size === 0) {
      setError('Marca al menos un proceso: el soporte cubre las firmas que diga que cubre.');
      return;
    }
    if (archivo === null) {
      setError('Adjunta el acta firmada: no se registra una firma sin el papel que la sostiene.');
      return;
    }
    const sinFirmante = [...marcados].filter((id) => eleccion[id]?.firmanteId == null);
    if (sinFirmante.length > 0) {
      const nombres = sinFirmante
        .map((id) => pendientes.find((r) => r.areaId === id)?.proceso ?? `área ${id}`)
        .join(', ');
      setError(`Falta decir quién firmó por: ${nombres}.`);
      return;
    }

    empezar(async () => {
      const bytes = Array.from(new Uint8Array(await archivo.arrayBuffer()));
      const r = await cargarSoporteActaResidual({
        actaId,
        nombreOriginal: archivo.name,
        bytes,
        motivo: motivo.trim() || undefined,
        firmas: [...marcados].map((areaId) => ({
          areaId,
          firmanteId: eleccion[areaId].firmanteId as number,
          fechaFirma: eleccion[areaId].fechaFirma,
        })),
      });
      if (r.ok) {
        alCerrar();
        return;
      }
      setError(r.mensaje);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-[620px] flex-col gap-3.5 overflow-y-auto rounded-modal bg-surface p-6 shadow-xl">
        <div>
          <h2 className="text-15 font-semibold text-primary">Registrar las firmas del acta</h2>
          <p className="mt-0.5 text-11_5 text-secondary">
            El acta se firma en papel. Acá se guarda el escaneo y se deja constancia de quién
            firmó cada proceso, y de que lo registraste tú.
          </p>
        </div>

        {pendientes.length === 0 ? (
          <p className="rounded-campo border border-border-field bg-subtle px-3 py-2.5 text-11_5 text-secondary">
            No queda ningún proceso por registrar en esta acta.
          </p>
        ) : (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-11_5 font-medium text-primary">
                Procesos que firmaron en este soporte
              </legend>
              {pendientes.map((r) => (
                <div
                  key={r.areaId}
                  className="rounded-campo border border-border-field px-3 py-2"
                >
                  <label className="flex items-center gap-2 text-11_5 text-primary">
                    <input
                      type="checkbox"
                      checked={marcados.has(r.areaId)}
                      onChange={() => alternar(r)}
                    />
                    <span>
                      {r.proceso}
                      <span className="text-faint"> · {r.activos} activos</span>
                    </span>
                  </label>

                  {marcados.has(r.areaId) && (
                    <div className="mt-2 flex flex-wrap items-end gap-3 pl-6">
                      <label className="flex flex-col gap-1 text-10_5 text-faint">
                        Quién firmó por {r.proceso}
                        <select
                          value={eleccion[r.areaId]?.firmanteId ?? ''}
                          onChange={(e) =>
                            setEleccion((prev) => ({
                              ...prev,
                              [r.areaId]: {
                                ...prev[r.areaId],
                                firmanteId: e.target.value === '' ? null : Number(e.target.value),
                              },
                            }))
                          }
                          className="rounded-campo border border-border-field bg-surface px-2 py-1 text-11_5 text-primary"
                        >
                          <option value="">Elige quién firmó</option>
                          {r.candidatos.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-10_5 text-faint">
                        Fecha de la firma
                        <input
                          type="date"
                          value={eleccion[r.areaId]?.fechaFirma ?? HOY()}
                          onChange={(e) =>
                            setEleccion((prev) => ({
                              ...prev,
                              [r.areaId]: { ...prev[r.areaId], fechaFirma: e.target.value },
                            }))
                          }
                          className="rounded-campo border border-border-field bg-surface px-2 py-1 text-11_5 text-primary"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1 text-11_5 font-medium text-primary">
              Acta firmada (PDF o imagen)
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => {
                  setError(null);
                  setArchivo(e.target.files?.[0] ?? null);
                }}
                className="text-11_5 font-normal text-secondary"
              />
            </label>

            <label className="flex flex-col gap-1 text-11_5 font-medium text-primary">
              Nota <span className="font-normal text-faint">(opcional)</span>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Sesión del comité, número de acta, lo que ayude a ubicar el papel"
                className="rounded-campo border border-border-field bg-surface px-2 py-1.5 text-11_5 font-normal text-primary"
              />
            </label>
          </>
        )}

        {error !== null && (
          <p className="rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-11_5 text-warn-text">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-campo px-3 py-1.5 text-11_5 font-medium text-secondary"
          >
            Cancelar
          </button>
          {pendientes.length > 0 && (
            <button
              type="button"
              onClick={registrar}
              disabled={pendiente}
              className="rounded-campo bg-brand-nav px-3 py-1.5 text-11_5 font-medium text-white disabled:opacity-60"
            >
              {marcados.size <= 1
                ? 'Registrar la firma'
                : `Registrar ${marcados.size} firmas`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
