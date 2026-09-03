'use client';

// app/mi-sig/PanelFirma.tsx
//
// Leer, aceptar y firmar. Los tres pasos, en ese orden y sin poder saltarse ninguno.
//
// **F1 · sin lectura no hay firma.** El botón de aceptar está deshabilitado hasta que la
// persona abre el documento. No se pide que lea completo —eso no se puede comprobar, y
// fingirlo enseña a mentirle al sistema— pero sí que el documento haya estado delante.
//
// **La declaración se muestra COMPLETA, no como enlace.** Quien acepta lee lo que está
// aceptando en la misma pantalla. Un enlace a los términos es la forma estándar de
// conseguir que nadie los lea.
//
// El servidor revalida las tres condiciones. Esta pantalla ayuda; no decide (invariante 3).

import { useState } from 'react';
import { firmarYAceptar } from '@/app/sig/acciones/firma';

export interface DatosParaFirmar {
  asignacionId: number;
  codigo: string;
  titulo: string;
  /// El texto de la versión vigente: lo que la persona tiene delante.
  descripcion: string;
  version: number;
  declaracion: string;
  documentoUrl: string | null;
}

export default function PanelFirma({
  datos,
  onCerrar,
}: {
  datos: DatosParaFirmar;
  onCerrar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  // El mismo orden que el servidor valida. Deshabilitar sin decir por qué es lo que hace que
  // alguien apriete tres veces y se vaya.
  const faltan = [
    !abierto && 'abrí el documento',
    abierto && !acepto && 'marcá la casilla de aceptación',
    acepto && nombre.trim().length < 5 && 'escribí tu nombre completo',
    acepto && documento.trim().length < 5 && 'escribí tu documento de identidad',
  ].filter((x): x is string => typeof x === 'string');

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-[680px] flex-col gap-3.5 overflow-y-auto rounded-modal bg-surface p-6 shadow-xl">
        <span className="flex items-center gap-2.5">
          <h2 className="text-15 font-semibold text-primary">Leer, aceptar y firmar</h2>
          <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold text-accent" style={{ background: 'var(--hf-brand-100)' }}>
            {datos.codigo} · v{datos.version}
          </span>
        </span>

        {/* ── 1 · Leer ── */}
        <Paso n={1} titulo="Leer" hecho={abierto}>
          <p className="text-12_5 font-medium text-primary">{datos.titulo}</p>
          <div
            className="mt-1.5 max-h-[220px] overflow-y-auto rounded-campo border border-border-field bg-subtle px-3 py-2.5 text-11_5 leading-relaxed text-secondary [text-wrap:pretty]"
            onScroll={() => setAbierto(true)}
          >
            {datos.descripcion}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAbierto(true)}
              className="rounded-campo px-3 py-1.5 text-11_5 font-medium"
              style={{
                background: abierto ? 'var(--hf-bg-subtle)' : 'var(--hf-brand-nav)',
                color: abierto ? 'var(--hf-text-muted)' : '#ffffff',
              }}
            >
              {abierto ? 'Documento abierto' : 'Abrir el documento'}
            </button>
            {datos.documentoUrl !== null && (
              <a
                href={datos.documentoUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setAbierto(true)}
                className="text-11_5 underline underline-offset-2 text-accent"
              >
                Ver el archivo original
              </a>
            )}
          </div>
        </Paso>

        {/* ── 2 · Aceptar ── */}
        <Paso n={2} titulo="Aceptar" hecho={acepto} deshabilitado={!abierto}>
          {/* La declaración COMPLETA, no un enlace. */}
          <p className="rounded-campo border border-border-field px-3 py-2.5 text-12 leading-relaxed text-primary [text-wrap:pretty]">
            {datos.declaracion}
          </p>
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-12_5">
            <input
              type="checkbox"
              checked={acepto}
              disabled={!abierto}
              onChange={(ev) => setAcepto(ev.target.checked)}
              className="mt-0.5"
            />
            <span className={abierto ? 'text-primary' : 'text-faint'}>
              Acepto la declaración anterior.
            </span>
          </label>
        </Paso>

        {/* ── 3 · Firmar ── */}
        <Paso n={3} titulo="Firmar" hecho={false} deshabilitado={!acepto}>
          <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
            Tu identidad la aporta la sesión con tu cuenta corporativa, no lo que escribas
            acá. El tecleo es el acto deliberado que distingue firmar de hacer clic.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Nombre completo</span>
              <input
                value={nombre}
                disabled={!acepto}
                onChange={(ev) => setNombre(ev.target.value)}
                className="entrada-campo"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Documento de identidad</span>
              <input
                value={documento}
                disabled={!acepto}
                onChange={(ev) => setDocumento(ev.target.value)}
                className="entrada-campo"
              />
            </label>
          </div>
        </Paso>

        <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
          Es una <strong className="font-semibold">firma electrónica simple</strong>. No
          interviene un certificado digital ni una entidad de certificación: su confiabilidad
          viene del control de acceso a tu cuenta, de la constancia que queda (fecha, IP,
          navegador) y de que el acta no se puede modificar después.
        </p>

        {faltan.length > 0 && (
          <p className="text-11_5 text-muted">Falta: {faltan.join(' · ')}.</p>
        )}
        {aviso && (
          <p
            className="rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
            style={{
              background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
              color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
            }}
          >
            {aviso.texto}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCerrar}
            className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted"
          >
            Cancelar
          </button>
          <button
            disabled={faltan.length > 0 || enviando}
            onClick={async () => {
              setEnviando(true);
              setAviso(null);
              const r = await firmarYAceptar(datos.asignacionId, {
                abrioElDocumento: abierto,
                acepto,
                nombreFirmante: nombre,
                documentoFirmante: documento,
              });
              setEnviando(false);
              setAviso({ ok: r.ok, texto: r.mensaje });
              if (r.ok) setTimeout(() => window.location.reload(), 1400);
            }}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            {enviando ? 'Generando el acta…' : 'Firmar y aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/// Un paso con su número. El deshabilitado se ve deshabilitado: los tres se muestran desde
/// el principio para que se sepa cuántos son, en vez de aparecer de a uno.
function Paso({
  n,
  titulo,
  hecho,
  deshabilitado,
  children,
}: {
  n: number;
  titulo: string;
  hecho: boolean;
  deshabilitado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-tarjeta border px-4 py-3"
      style={{
        borderColor: hecho ? 'var(--hf-accent-500)' : 'var(--hf-border-field)',
        opacity: deshabilitado ? 0.55 : 1,
      }}
    >
      <span className="flex items-center gap-2">
        <span
          className="flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full font-mono text-9_5 font-bold"
          style={
            hecho
              ? { background: 'var(--hf-accent-500)', color: '#ffffff' }
              : { background: 'var(--hf-bg-subtle)', color: 'var(--hf-text-muted)' }
          }
        >
          {hecho ? '✓' : n}
        </span>
        <span className="text-12_5 font-semibold text-primary">{titulo}</span>
      </span>
      <div className="mt-2">{children}</div>
    </section>
  );
}
