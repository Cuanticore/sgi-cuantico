'use client';

// app/tokens/Tokens.client.tsx
//
// 2.9 · crear, listar con prefijo y último uso, revocar con motivo. **El secreto se muestra
// una sola vez** — en el aviso que sigue a la emisión — y esta pantalla no tiene ninguna forma
// de volver a pedirlo: no hay botón "ver secreto" porque no hay de dónde traerlo.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { emitirToken, revocarToken } from './acciones';
import { TODOS_LOS_PERMISOS, type Permiso } from '@/lib/sgsi/permisos';

/// Un token no administra otros tokens (D10, en espíritu: quien emite o revoca una
/// credencial es una decisión de gestión, no algo que una identidad de máquina deba poder
/// hacer sobre sus pares). Se excluye de lo elegible al armar el alcance, aunque como PERMISO
/// de persona siga existiendo para abrir esta misma pantalla.
const ALCANCE_ELEGIBLE = TODOS_LOS_PERMISOS.filter((p) => p !== 'tokenServicio:administrar');

export interface TokenFila {
  id: number;
  nombre: string;
  prefijo: string;
  alcance: Permiso[];
  expiraEn: string;
  creadoEn: string;
  creadoPor: string;
  ultimoUsoEn: string | null;
  revocadoEn: string | null;
  motivoRevocacion: string | null;
  diasDormido: number | null;
  dormido: boolean;
  vencido: boolean;
}

function fecha(iso: string): string {
  return iso.slice(0, 10);
}

export default function TokensClient({ filas }: { filas: TokenFila[] }) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [alcance, setAlcance] = useState<Permiso[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [secretoEmitido, setSecretoEmitido] = useState<{ nombre: string; secreto: string; prefijo: string } | null>(
    null,
  );
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [revocando, setRevocando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');

  const alternarPermiso = (p: Permiso) => {
    setAlcance((actual) => (actual.includes(p) ? actual.filter((x) => x !== p) : [...actual, p]));
  };

  async function enviarEmision() {
    if (nombre.trim() === '') {
      setAviso({ ok: false, texto: 'Falta el nombre del token.' });
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      const r = await emitirToken({ nombre, alcance });
      if (r.ok && r.secreto) {
        setSecretoEmitido({ nombre, secreto: r.secreto, prefijo: r.prefijo ?? '' });
        setNombre('');
        setAlcance([]);
        setCreando(false);
        router.refresh();
      } else {
        setAviso({ ok: false, texto: r.mensaje });
      }
    } finally {
      setGuardando(false);
    }
  }

  async function enviarRevocacion(id: number) {
    if (motivo.trim() === '') {
      setAviso({ ok: false, texto: 'El motivo de revocación es obligatorio.' });
      return;
    }
    setGuardando(true);
    try {
      const r = await revocarToken(id, motivo);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setRevocando(null);
        setMotivo('');
        router.refresh();
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex max-w-[104ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Tokens de servicio</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Identidades de máquina para <code>/api/v1</code>. Un agente diligencia con el
            alcance que se le dio; no puede cerrar una puerta de control, aprobar una
            excepción, ni administrar otros tokens — eso es de una persona.
          </p>
        </div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="ml-auto flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {creando ? 'Cerrar' : 'Nuevo token'}
        </button>
      </div>

      {aviso && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12 leading-relaxed [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      {secretoEmitido && (
        <div
          className="mt-4 flex flex-col gap-2 rounded-tarjeta border px-5 py-4"
          style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
        >
          <p className="text-13 font-semibold" style={{ color: 'var(--hf-warn-text)' }}>
            Copia el secreto de «{secretoEmitido.nombre}» ahora. No se va a volver a mostrar.
          </p>
          <code
            className="select-all rounded-campo border px-3 py-2 text-12 break-all"
            style={{ background: 'var(--hf-bg-subtle)', borderColor: 'var(--hf-border-field)' }}
          >
            {secretoEmitido.secreto}
          </code>
          <button
            onClick={() => setSecretoEmitido(null)}
            className="self-start rounded-campo px-3 py-1.5 text-12 font-semibold"
            style={{ background: 'var(--hf-warn-border)', color: 'var(--hf-warn-text)' }}
          >
            Ya lo copié
          </button>
        </div>
      )}

      {creando && (
        <div className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-default bg-surface px-5 py-4">
          <label className="flex flex-col gap-1 text-12_5">
            <span className="font-semibold">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="robot-mintrace"
              className="rounded-campo border border-border-default px-3 py-1.5 text-12_5"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-12_5 font-semibold">Alcance</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ALCANCE_ELEGIBLE.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-12">
                  <input type="checkbox" checked={alcance.includes(p)} onChange={() => alternarPermiso(p)} />
                  <span className="font-mono">{p}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={enviarEmision}
            disabled={guardando}
            className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            {guardando ? 'Emitiendo…' : 'Emitir token'}
          </button>
        </div>
      )}

      <table className="mt-6 w-full border-collapse text-12_5">
        <thead>
          <tr className="border-b border-border-default text-left text-muted">
            <th className="py-2 pr-3">Nombre</th>
            <th className="py-2 pr-3">Prefijo</th>
            <th className="py-2 pr-3">Alcance</th>
            <th className="py-2 pr-3">Expira</th>
            <th className="py-2 pr-3">Último uso</th>
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2 pr-3" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-b border-border-default align-top">
              <td className="py-2 pr-3 font-semibold">{f.nombre}</td>
              <td className="py-2 pr-3 font-mono">{f.prefijo}</td>
              <td className="py-2 pr-3 font-mono text-12">{f.alcance.join(', ') || '(vacío)'}</td>
              <td className="py-2 pr-3">{fecha(f.expiraEn)}</td>
              <td className="py-2 pr-3">{f.ultimoUsoEn ? fecha(f.ultimoUsoEn) : 'nunca'}</td>
              <td className="py-2 pr-3">
                {f.revocadoEn ? (
                  <span title={f.motivoRevocacion ?? ''}>revocado {fecha(f.revocadoEn)}</span>
                ) : f.vencido ? (
                  'vencido'
                ) : f.dormido ? (
                  `dormido (${f.diasDormido} d)`
                ) : (
                  'vigente'
                )}
              </td>
              <td className="py-2 pr-3">
                {!f.revocadoEn &&
                  (revocando === f.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="motivo"
                        className="rounded-campo border border-border-default px-2 py-1 text-12"
                      />
                      <button
                        onClick={() => enviarRevocacion(f.id)}
                        disabled={guardando}
                        className="rounded-campo px-2 py-1 text-12 font-semibold text-white"
                        style={{ background: 'var(--hf-danger-text)' }}
                      >
                        Confirmar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setRevocando(f.id);
                        setMotivo('');
                      }}
                      className="text-12 font-semibold"
                      style={{ color: 'var(--hf-danger-text)' }}
                    >
                      Revocar
                    </button>
                  ))}
              </td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-muted">
                Todavía no hay tokens emitidos.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
