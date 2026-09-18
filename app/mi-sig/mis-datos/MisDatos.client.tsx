'use client';

// app/mi-sig/mis-datos/MisDatos.client.tsx
//
// Tres bloques: lo que la persona mantiene, su familia y sus documentos firmados.
//
// LO QUE MANDA EL DIRECTORIO SE MUESTRA Y NO SE EDITA, y la pantalla dice por qué. Un campo
// deshabilitado sin explicación se lee como un defecto de la aplicación, y alguien va a
// intentar escribirlo tres veces antes de concluir que no se puede.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CampoFecha } from './CampoFecha';
import {
  guardarMisDatos,
  guardarMisHijos,
  type HijoDeclarado,
  type MisDatos as Datos,
} from '@/app/mi-sig/acciones/mis-datos';

export interface ActaFirmada {
  codigo: string;
  documento: string;
  version: number;
  firmadaEn: string;
}

export interface PendienteDeFirma {
  asignacionId: number;
  documento: string;
  fechaLimite: string;
}

export default function MisDatosClient({
  nombre,
  correo,
  area,
  cargo,
  datos,
  hijos,
  firmadas,
  porFirmar,
}: {
  nombre: string;
  correo: string;
  area: string | null;
  cargo: string | null;
  datos: Datos;
  hijos: HijoDeclarado[];
  firmadas: ActaFirmada[];
  porFirmar: PendienteDeFirma[];
}) {
  const [form, setForm] = useState<Datos>(datos);
  const [familia, setFamilia] = useState<HijoDeclarado[]>(hijos);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const set = <K extends keyof Datos>(k: K, v: Datos[K]): void =>
    setForm((f) => ({ ...f, [k]: v }));

  const guardarDatos = (): void =>
    iniciar(async () => {
      const r = await guardarMisDatos(form);
      setAviso({ ok: r.ok, texto: r.mensaje });
    });

  const guardarFamilia = (): void =>
    iniciar(async () => {
      const r = await guardarMisHijos(familia);
      setAviso({ ok: r.ok, texto: r.mensaje });
    });

  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-6 px-8 pb-16 pt-8">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pagina">Mis datos</h1>
        <p className="text-12_5 text-muted">
          {nombre} · {area ?? 'sin área'} · {cargo ?? 'sin cargo'}
        </p>
      </header>

      {aviso && (
        <p
          className="text-12_5 [text-wrap:pretty]"
          style={{ color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
        >
          {aviso.texto}
        </p>
      )}

      {/* ── 1 · lo que mantiene la persona ── */}
      <section className="flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface px-5 py-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-15 font-semibold text-primary">Datos de contacto y afiliación</h2>
          <p className="max-w-[74ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
            Tu nombre, tu correo corporativo, tu área y tu cargo los manda la organización — se
            muestran acá pero se cambian en el Directorio o con quien administra personas. Lo
            de abajo lo conocés vos mejor que el sistema.
          </p>
        </div>

        <div className="grid gap-x-4 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <Campo etiqueta="CORREO CORPORATIVO">
            <input value={correo} disabled className={`${ENTRADA} opacity-60`} />
          </Campo>
          <Campo etiqueta="TELÉFONO">
            <input
              value={form.telefono}
              onChange={(e) => set('telefono', e.target.value)}
              placeholder="300 000 0000"
              className={ENTRADA}
            />
          </Campo>
          <Campo etiqueta="CORREO PERSONAL">
            <input
              value={form.correoPersonal}
              onChange={(e) => set('correoPersonal', e.target.value)}
              placeholder="para cuando no tengas la cuenta corporativa"
              className={ENTRADA}
            />
          </Campo>
          <Campo etiqueta="FECHA DE NACIMIENTO">
            <CampoFecha
              value={form.fechaNacimiento}
              onChange={(v) => set('fechaNacimiento', v)}
              className={ENTRADA}
              ariaLabel="Fecha de nacimiento"
            />
          </Campo>
          <Campo etiqueta="CIUDAD">
            <input
              value={form.ciudad}
              onChange={(e) => set('ciudad', e.target.value)}
              className={ENTRADA}
            />
          </Campo>
          <Campo etiqueta="DIRECCIÓN">
            <input
              value={form.direccion}
              onChange={(e) => set('direccion', e.target.value)}
              className={ENTRADA}
            />
          </Campo>
          <Campo etiqueta="EPS">
            <input value={form.eps} onChange={(e) => set('eps', e.target.value)} className={ENTRADA} />
          </Campo>
          <Campo etiqueta="ARL">
            <input value={form.arl} onChange={(e) => set('arl', e.target.value)} className={ENTRADA} />
          </Campo>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pendiente}
            onClick={guardarDatos}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            {pendiente ? 'Guardando…' : 'Guardar mis datos'}
          </button>
          <span className="text-10_5 text-label [text-wrap:pretty]">
            La EPS y la fecha de nacimiento son datos sensibles: se usan para afiliación y
            emergencias, no salen en ninguna exportación del censo y sólo los ve quien
            administra personas.
          </span>
        </div>
      </section>

      {/* ── 2 · la familia ── */}
      <section className="flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface px-5 py-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-15 font-semibold text-primary">Mis hijos</h2>
          <p className="max-w-[74ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
            Se piden sólo tres cosas —nombre, fecha de nacimiento y género— porque es lo único
            que hace falta para un beneficio o un saludo de cumpleaños. Son datos de terceros
            que no firmaron nada, así que no se recoge más.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {familia.map((h, i) => (
            <div key={h.id ?? `nuevo-${i}`} className="flex flex-wrap items-end gap-2">
              <Campo etiqueta="NOMBRE">
                <input
                  value={h.nombre}
                  onChange={(e) =>
                    setFamilia((f) => f.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))
                  }
                  className={`${ENTRADA} min-w-[200px]`}
                />
              </Campo>
              <Campo etiqueta="NACIMIENTO">
                <CampoFecha
                  value={h.fechaNacimiento}
                  onChange={(v) =>
                    setFamilia((f) =>
                      f.map((x, j) => (j === i ? { ...x, fechaNacimiento: v } : x)),
                    )
                  }
                  className={ENTRADA}
                  ariaLabel="Fecha de nacimiento del hijo"
                />
              </Campo>
              <Campo etiqueta="GÉNERO">
                <select
                  value={h.genero}
                  onChange={(e) =>
                    setFamilia((f) =>
                      f.map((x, j) =>
                        j === i ? { ...x, genero: e.target.value as HijoDeclarado['genero'] } : x,
                      ),
                    )
                  }
                  className={ENTRADA}
                >
                  <option value="FEMENINO">Femenino</option>
                  <option value="MASCULINO">Masculino</option>
                  <option value="NO_DECLARA">Prefiere no decirlo</option>
                </select>
              </Campo>
              <button
                type="button"
                onClick={() => setFamilia((f) => f.filter((_, j) => j !== i))}
                className="rounded-campo border border-danger-border px-2.5 py-[7px] text-11_5 text-danger-text"
              >
                Quitar
              </button>
            </div>
          ))}
          {familia.length === 0 && (
            <p className="text-11_5 text-label">Todavía no declaraste ninguno.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              setFamilia((f) => [
                ...f,
                { id: null, nombre: '', fechaNacimiento: '', genero: 'NO_DECLARA' },
              ])
            }
            className="rounded-campo border border-dashed border-accent-border bg-accent-50 px-3 py-1.5 text-11_5 font-semibold text-accent-700"
          >
            + Agregar
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={guardarFamilia}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            {pendiente ? 'Guardando…' : 'Guardar mi familia'}
          </button>
        </div>
      </section>

      {/* ── 3 · los documentos ── */}
      <section className="flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface px-5 py-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-15 font-semibold text-primary">Mis documentos firmados</h2>
          <p className="max-w-[74ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
            Cada acta guarda la versión exacta del documento que aceptaste. Por eso una
            política que cambie después no altera lo que firmaste: lo tuyo sigue siendo lo que
            decía ese día.
          </p>
        </div>

        {porFirmar.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-campo border border-warn-border bg-warn-100 px-3.5 py-3">
            <span className="text-12_5 font-semibold text-warn-text">
              Te falta firmar {porFirmar.length}
            </span>
            <ul className="flex flex-col gap-1">
              {porFirmar.map((p) => (
                <li key={p.asignacionId} className="text-11_5 text-warn-text">
                  {p.documento} · vence {p.fechaLimite}
                </li>
              ))}
            </ul>
            <Link href="/mi-sig" className="w-fit text-11_5 font-semibold underline">
              Ir a firmarlos →
            </Link>
          </div>
        )}

        {firmadas.length === 0 ? (
          <p className="text-11_5 text-label [text-wrap:pretty]">
            Todavía no firmaste ningún documento.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {firmadas.map((a) => (
              <li
                key={a.codigo}
                className="flex flex-wrap items-baseline gap-2 rounded-campo border border-border-default bg-subtle px-3 py-2"
              >
                <span className="font-mono text-10_5 text-accent-700">{a.codigo}</span>
                <span className="min-w-0 flex-1 text-12 text-primary">{a.documento}</span>
                <span className="font-mono text-10 text-label">
                  v{a.version} · {a.firmadaEn}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
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
