'use client';

// app/firmar/[token]/PanelPublico.tsx
//
// **REQ-SIG-19 · Task 7 · la pantalla pública de firma.**
//
// Espeja `app/mi-sig/PanelFirma.tsx` —leer, aceptar y firmar, en ese orden y sin poder saltarse
// ninguno— con tres diferencias, y las tres son la razón de que este archivo exista en vez de
// reusar aquél:
//
// **P11 · el mínimo, y nada más.** El nombre de la persona y el documento. Ni área, ni cargo, ni
// otras tareas, ni otros documentos, ni un enlace a la aplicación. Quien abre esta página no
// inició sesión: lo único que probó es que tiene el enlace, y con eso no se paga ver una ficha.
// El nombre sí va, porque sin él nadie sabe si la solicitud es para él.
//
// **P12 · ni un enlace externo.** `PanelFirma` ofrece «ver el archivo original», que apunta a
// donde viva el documento —SharePoint, casi siempre—. Acá no: el token va **en la ruta**, así que
// cualquier salto a un tercero se lo lleva puesto en la cabecera `Referer`. El documento se lee
// en esta misma pantalla o no se lee.
//
// **El texto de abajo dice la verdad.** `PanelFirma` dice «tu identidad la aporta la sesión con
// tu cuenta corporativa». Acá no hubo sesión: la identidad se sostiene en la posesión del enlace
// y en el documento de identidad, que **se verifica** contra el registrado (D-7). Copiar el texto
// de la otra pantalla habría sido afirmar una autenticación que no ocurrió.
//
// El servidor revalida todo. Esta pantalla ayuda; no decide.

import { useState } from 'react';
import type { DocumentoPublico } from '@/lib/sig/vista-enlace-publico';

export interface DatosDeFirmaPublica {
  /// F1 · lo pone la pantalla al abrir el documento. Es una declaración de la interfaz, igual
  /// que en la vía con sesión: abrir un documento no deja rastro comprobable.
  abrioElDocumento: boolean;
  acepto: boolean;
  nombreFirmante: string;
  /// **D-7 · acá sí se verifica.** Con sesión corporativa este tecleo sólo se registra, porque la
  /// identidad ya la aportó Azure. Sin sesión es lo único que separa «quien tiene el enlace» de
  /// «quien es la persona».
  documentoFirmante: string;
}

export interface ResultadoDeFirmaPublica {
  ok: boolean;
  mensaje: string;
  codigoActa: string | null;
}

/// **El punto de enganche de la Task 8.**
///
/// `firmarConEnlace(token, datos)` todavía no existe: es la Task 8, y vive en
/// `app/sig/acciones/enlace-firma.ts`. Cuando exista, `page.tsx` se lo pasa a este componente
/// como `firmar` y no hay que tocar nada más de esta pantalla. Mientras tanto la prop es
/// opcional y el botón queda deshabilitado **diciendo por qué**, que es preferible a un botón que
/// no hace nada.
export type AccionDeFirmaPublica = (
  token: string,
  datos: DatosDeFirmaPublica,
) => Promise<ResultadoDeFirmaPublica>;

export default function PanelPublico({
  token,
  nombre,
  documento,
  firmar,
}: {
  token: string;
  nombre: string;
  documento: DocumentoPublico;
  firmar?: AccionDeFirmaPublica;
}) {
  const [abierto, setAbierto] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [nombreFirmante, setNombreFirmante] = useState('');
  const [documentoFirmante, setDocumentoFirmante] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  // El mismo orden que el servidor valida. Deshabilitar sin decir por qué es lo que hace que
  // alguien apriete tres veces y se vaya.
  const faltan = [
    !abierto && 'abra el documento',
    abierto && !acepto && 'marque la casilla de aceptación',
    acepto && nombreFirmante.trim().length < 5 && 'escriba su nombre completo',
    acepto && documentoFirmante.trim().length < 5 && 'escriba su documento de identidad',
  ].filter((x): x is string => typeof x === 'string');

  const listo = faltan.length === 0 && firmar !== undefined && !enviando;

  return (
    <div className="flex w-full max-w-[680px] flex-col gap-3.5 rounded-modal bg-surface p-6 shadow-xl">
      <span className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-15 font-semibold text-primary">Leer, aceptar y firmar</h1>
        <span
          className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold text-accent"
          style={{ background: 'var(--hf-brand-100)' }}
        >
          {documento.codigo} · v{documento.version}
        </span>
      </span>

      {/* P11 · el nombre, y ningún otro dato de la ficha. Sin él nadie sabe si es para él. */}
      <p className="text-12 text-secondary">
        Solicitud de firma para <strong className="font-semibold text-primary">{nombre}</strong>.
      </p>

      {/* ── 1 · Leer ── */}
      <Paso n={1} titulo="Leer" hecho={abierto}>
        <p className="text-12_5 font-medium text-primary">{documento.titulo}</p>
        {/* El documento se lee ACÁ. No hay enlace al archivo original: el token va en la ruta y
            cualquier salto a un tercero se lo lleva en la cabecera `Referer` (P12). */}
        <div
          className="mt-1.5 max-h-[260px] overflow-y-auto rounded-campo border border-border-field bg-subtle px-3 py-2.5 text-11_5 leading-relaxed text-secondary [text-wrap:pretty]"
          onScroll={() => setAbierto(true)}
        >
          {documento.descripcion}
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="rounded-campo px-3 py-1.5 text-11_5 font-medium"
            style={{
              background: abierto ? 'var(--hf-bg-subtle)' : 'var(--hf-brand-nav)',
              color: abierto ? 'var(--hf-text-muted)' : '#ffffff',
            }}
          >
            {abierto ? 'Documento abierto' : 'Abrir el documento'}
          </button>
        </div>
      </Paso>

      {/* ── 2 · Aceptar ── */}
      <Paso n={2} titulo="Aceptar" hecho={acepto} deshabilitado={!abierto}>
        {/* F2 · la declaración COMPLETA, no un enlace. Quien acepta lee lo que está aceptando en
            la misma pantalla. */}
        <p className="rounded-campo border border-border-field px-3 py-2.5 text-12 leading-relaxed text-primary [text-wrap:pretty]">
          {documento.declaracion}
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
          Este enlace se envió únicamente a su dirección de correo personal. El número de
          documento de identidad que escriba se compara con el registrado en su ficha: es la
          segunda comprobación, y sin ella el enlace sería la única credencial.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Nombre completo</span>
            <input
              value={nombreFirmante}
              disabled={!acepto}
              onChange={(ev) => setNombreFirmante(ev.target.value)}
              className="entrada-campo"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Documento de identidad</span>
            <input
              value={documentoFirmante}
              disabled={!acepto}
              onChange={(ev) => setDocumentoFirmante(ev.target.value)}
              className="entrada-campo"
            />
          </label>
        </div>
      </Paso>

      <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
        Es una <strong className="font-semibold">firma electrónica simple</strong>. No interviene
        un certificado digital ni una entidad de certificación. Su confiabilidad se sustenta en la
        posesión de este enlace único, enviado sólo a su correo personal; en el número de
        documento de identidad, que se verifica contra el registrado; y en la constancia que queda
        con el acta —fecha, hora y huella— que no se puede modificar después.
      </p>

      {faltan.length > 0 && (
        <p className="text-11_5 text-muted">Falta: {faltan.join(' · ')}.</p>
      )}
      {firmar === undefined && (
        // Task 8. Mientras `firmarConEnlace` no exista, la pantalla lo dice en vez de ofrecer un
        // botón que no hace nada.
        <p className="text-11_5 text-muted">
          La firma por enlace todavía no está habilitada. Escriba a quien le envió la solicitud.
        </p>
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

      <div className="flex justify-end pt-1">
        <button
          type="button"
          disabled={!listo}
          onClick={async () => {
            if (firmar === undefined) return;
            setEnviando(true);
            setAviso(null);
            const r = await firmar(token, {
              abrioElDocumento: abierto,
              acepto,
              nombreFirmante,
              documentoFirmante,
            });
            setEnviando(false);
            setAviso({ ok: r.ok, texto: r.mensaje });
            // D-5 · la firma se consume una sola vez; la página, no. Al recargar, el enlace ya
            // usado muestra la constancia con el código del acta.
            if (r.ok) setTimeout(() => window.location.reload(), 1600);
          }}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {enviando ? 'Generando el acta…' : 'Firmar y aceptar'}
        </button>
      </div>
    </div>
  );
}

/// Un paso con su número. El deshabilitado se ve deshabilitado: los tres se muestran desde el
/// principio para que se sepa cuántos son, en vez de aparecer de a uno.
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
