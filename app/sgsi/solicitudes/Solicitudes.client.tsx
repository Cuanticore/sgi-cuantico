'use client';

// app/sgsi/solicitudes/Solicitudes.client.tsx
//
// Lista filtrable por tipo a la izquierda, ficha con los tres pasos a la derecha.
//
// **Los tres pasos se dibujan siempre**, hechos o no. Un paso pendiente que se oculta hace
// parecer que la solicitud tiene dos pasos, y lo que falta es exactamente lo que hay que
// ver: quién falta que autorice, quién falta que ejecute.
//
// **La autoridad viene del rol, no del nombre.** La aplicación no almacena roles —los lee
// de los grupos del directorio— así que acá se dice, no se dibuja un cargo que la base no
// tiene.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearSolicitud, decidirSolicitud, ejecutarSolicitud } from '@/app/sig/acciones/solicitudes';
import { ETIQUETA_ESTADO_SOLICITUD, ETIQUETA_TIPO_SOLICITUD, type EstadoSolicitud } from '@/lib/sig/accesos';

const TIPOS = ['CAMBIO_TI', 'ACCESO', 'DEVOLUCION', 'UTILITARIO'] as const;
type Tipo = (typeof TIPOS)[number];

const COLOR_TIPO: Record<Tipo, { fondo: string; texto: string }> = {
  CAMBIO_TI: { fondo: 'var(--hf-brand-100)', texto: 'var(--hf-brand-nav)' },
  ACCESO: { fondo: '#e8f4ef', texto: '#0b5c44' },
  DEVOLUCION: { fondo: '#fff3e6', texto: '#8a4407' },
  UTILITARIO: { fondo: '#fdeeeb', texto: '#a52016' },
};

const COLOR_ESTADO: Record<EstadoSolicitud, { fondo: string; texto: string }> = {
  POR_AUTORIZAR: { fondo: '#fff3e6', texto: '#8a4407' },
  AUTORIZADA: { fondo: 'var(--hf-brand-100)', texto: 'var(--hf-brand-nav)' },
  EJECUTADA: { fondo: '#e6efe9', texto: '#0b5c44' },
  RECHAZADA: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)' },
};

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

export interface Paso {
  persona: string | null;
  momento: string | null;
  nota: string | null;
}

export interface FilaSolicitud {
  codigo: string;
  tipo: Tipo;
  titulo: string;
  solicitante: string;
  creadaEn: string;
  esEmergencia: boolean;
  estado: EstadoSolicitud;
}

export interface FichaSolicitud {
  codigo: string;
  tipo: Tipo;
  titulo: string;
  detalle: string;
  justificacion: string;
  esEmergencia: boolean;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  estado: EstadoSolicitud;
  pide: Paso;
  autoriza: Paso;
  ejecuta: Paso;
  accesosCreados: number;
  /// El motivo por el que esta persona NO puede autorizar, o `null` si puede. Viene
  /// resuelto del servidor: la pantalla lo muestra, no lo decide.
  vetoAutorizar: string | null;
}

export default function SolicitudesClient({
  lista,
  tipoFiltro,
  elegidoCodigo,
  ficha,
  personas,
  perfiles,
}: {
  lista: FilaSolicitud[];
  tipoFiltro: string;
  elegidoCodigo: string | null;
  ficha: FichaSolicitud | null;
  personas: { id: number; nombre: string }[];
  perfiles: { id: number; etiqueta: string }[];
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [creando, setCreando] = useState(false);

  const visibles = tipoFiltro === 'todas' ? lista : lista.filter((x) => x.tipo === tipoFiltro);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[92ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Solicitudes con aprobación</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Alguien pide, alguien autoriza, alguien ejecuta, y de las tres cosas queda
            constancia con fecha. Es el control más citado en los procedimientos y el que hoy
            vive en correos.
          </p>
        </div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="ml-auto flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {creando ? 'Cerrar' : 'Nueva solicitud'}
        </button>
      </div>

      {aviso && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      {creando && <FormularioSolicitud setAviso={setAviso} />}

      <nav className="mt-4 flex flex-wrap items-center gap-2">
        {(['todas', ...TIPOS] as const).map((t) => {
          const activo = tipoFiltro === t;
          const conteo = t === 'todas' ? lista.length : lista.filter((x) => x.tipo === t).length;
          return (
            <button
              key={t}
              onClick={() => router.push(t === 'todas' ? '/sgsi/solicitudes' : `/sgsi/solicitudes?tipo=${t}`)}
              aria-pressed={activo}
              className="inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-12"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                border: `1px solid ${activo ? 'var(--hf-brand-200, #d3dceb)' : 'var(--hf-border-field)'}`,
                color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                fontWeight: activo ? 600 : 500,
              }}
            >
              {t === 'todas' ? 'Todas' : ETIQUETA_TIPO_SOLICITUD[t].etiqueta}
              <span className="font-mono text-10 opacity-75">{conteo}</span>
            </button>
          );
        })}
        <span className="ml-auto text-11_5 text-muted [text-wrap:pretty]">
          Cuatro tipos, un solo flujo. Agregar un quinto es configurar, no programar.
        </span>
      </nav>

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        <div className="flex w-full flex-none flex-col gap-1 rounded-tarjeta border border-border-field bg-surface p-2 xl:w-[414px]">
          {visibles.map((x) => {
            const activa = x.codigo === elegidoCodigo;
            const t = COLOR_TIPO[x.tipo];
            const e = COLOR_ESTADO[x.estado];
            return (
              <button
                key={x.codigo}
                onClick={() => router.push(`/sgsi/solicitudes?s=${x.codigo}`)}
                aria-pressed={activa}
                className="flex flex-col gap-1.5 rounded-campo px-3 py-2.5 text-left"
                style={{
                  background: activa ? 'var(--hf-brand-100)' : 'transparent',
                  border: `1px solid ${activa ? 'var(--hf-brand-200, #d3dceb)' : 'transparent'}`,
                }}
              >
                <span className="flex w-full items-center gap-2">
                  <Etiqueta texto={ETIQUETA_TIPO_SOLICITUD[x.tipo].etiqueta} fondo={t.fondo} color={t.texto} />
                  <span className="font-mono text-9_5 text-muted">{x.codigo}</span>
                  {x.esEmergencia && <Etiqueta texto="emergencia" fondo="#fdeeeb" color="#a52016" />}
                  <span className="ml-auto">
                    <Etiqueta texto={ETIQUETA_ESTADO_SOLICITUD[x.estado]} fondo={e.fondo} color={e.texto} />
                  </span>
                </span>
                <span className="w-full text-12_5 font-medium leading-snug text-primary">{x.titulo}</span>
                <span className="flex w-full items-center gap-2">
                  <span
                    className="flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full text-8_5 font-bold"
                    style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
                  >
                    {iniciales(x.solicitante)}
                  </span>
                  <span className="text-10_5 text-muted">{x.solicitante}</span>
                  <span className="ml-auto font-mono text-9_5 text-faint">{x.creadaEn}</span>
                </span>
              </button>
            );
          })}
          {visibles.length === 0 && (
            <p className="px-3 py-8 text-center text-12 text-muted [text-wrap:pretty]">
              {lista.length === 0
                ? 'Ninguna solicitud todavía. Hoy este control vive en correos; acá empieza a dejar fecha.'
                : 'Ninguna de este tipo.'}
            </p>
          )}
        </div>

        {ficha !== null && (
          <Ficha ficha={ficha} personas={personas} perfiles={perfiles} setAviso={setAviso} />
        )}
      </div>
    </main>
  );
}

function Ficha({
  ficha,
  personas,
  perfiles,
  setAviso,
}: {
  ficha: FichaSolicitud;
  personas: { id: number; nombre: string }[];
  perfiles: { id: number; etiqueta: string }[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const t = COLOR_TIPO[ficha.tipo];
  const meta = ETIQUETA_TIPO_SOLICITUD[ficha.tipo];

  return (
    <section className="min-w-0 flex-1 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
      <div className="flex flex-col gap-2 border-b border-hairline px-5 py-4">
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-11 font-semibold text-accent">{ficha.codigo}</span>
          <Etiqueta texto={meta.etiqueta} fondo={t.fondo} color={t.texto} />
          {/* El control del Anexo A que este tipo sostiene. Es lo que permite filtrar los
              registros por requisito, que es como pregunta un auditor. */}
          <Etiqueta texto={meta.control} fondo="var(--hf-bg-subtle)" color="var(--hf-text-muted)" />
        </span>
        <span className="text-16 font-semibold leading-snug text-primary">{ficha.titulo}</span>
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-col gap-2">
          <Rotulo texto="Quién pide · quién autoriza · quién ejecuta" />
          <PasoFila etiqueta="Pide" paso={ficha.pide} hecho />
          <PasoFila
            etiqueta={ficha.estado === 'RECHAZADA' ? 'Rechaza' : 'Autoriza'}
            paso={ficha.autoriza}
            hecho={ficha.autoriza.momento !== null && ficha.estado !== 'RECHAZADA'}
            rechazo={ficha.estado === 'RECHAZADA'}
            // La autoridad viene del rol y la aplicación no almacena roles: se dice en vez
            // de dibujar un cargo que la base no tiene.
            pendienteTexto="Pendiente · lo autoriza quien tenga el permiso del SGSI"
          />
          <PasoFila
            etiqueta="Ejecuta"
            paso={ficha.ejecuta}
            hecho={ficha.ejecuta.momento !== null}
            pendienteTexto={ficha.estado === 'RECHAZADA' ? 'No aplica' : 'Pendiente'}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <span className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Qué se pide</span>
            <span className="min-h-[62px] rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5 leading-relaxed text-primary [text-wrap:pretty]">
              {ficha.detalle}
            </span>
          </span>
          <span className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">Justificación</span>
            <span className="min-h-[62px] rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5 leading-relaxed text-primary [text-wrap:pretty]">
              {ficha.justificacion}
            </span>
          </span>
        </div>

        {ficha.vigenciaHasta !== null && (
          <p
            className="rounded-tarjeta px-3.5 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
            style={{ background: '#fff3e6', border: '1px solid #f2b473', color: '#8a4407' }}
          >
            <strong className="font-semibold">Autorización temporal.</strong> Vigente del{' '}
            {ficha.vigenciaDesde} al {ficha.vigenciaHasta}. Al vencer, el permiso se retira solo
            y queda el registro de lo que se hizo.
          </p>
        )}

        {ficha.esEmergencia && (
          <p
            className="rounded-tarjeta px-3.5 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
            style={{ background: '#fdeeeb', border: '1px solid #f2cdc6', color: '#a52016' }}
          >
            <strong className="font-semibold">Cambio de emergencia.</strong> Se autoriza y
            ejecuta de inmediato para contener un incidente, y se documenta después. Es la única
            excepción a la separación de funciones, y{' '}
            <strong className="font-semibold">se registra, no se esconde</strong>.
          </p>
        )}

        {ficha.estado === 'POR_AUTORIZAR' && (
          <FormularioDecision codigo={ficha.codigo} veto={ficha.vetoAutorizar} setAviso={setAviso} />
        )}

        {ficha.estado === 'AUTORIZADA' && (
          <FormularioEjecucion
            codigo={ficha.codigo}
            esAcceso={ficha.tipo === 'ACCESO'}
            personas={personas}
            perfiles={perfiles}
            setAviso={setAviso}
          />
        )}

        {ficha.accesosCreados > 0 && (
          <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
            Esta solicitud sostiene {ficha.accesosCreados} acceso(s) en{' '}
            <a href="/sgsi/accesos" className="font-medium text-accent hover:underline">
              Accesos y perfiles
            </a>
            . Por eso no aparecen como «sin sustento» en la revisión.
          </p>
        )}
      </div>
    </section>
  );
}

function PasoFila({
  etiqueta,
  paso,
  hecho,
  rechazo,
  pendienteTexto,
}: {
  etiqueta: string;
  paso: Paso;
  hecho: boolean;
  rechazo?: boolean;
  pendienteTexto?: string;
}) {
  const cerrado = paso.momento !== null;
  return (
    <div
      className="flex items-start gap-3.5 rounded-tarjeta px-3.5 py-3"
      style={
        rechazo === true
          ? { background: '#fdeeeb', border: '1px solid #f2cdc6' }
          : hecho
            ? { background: 'var(--hf-bg-surface)', border: '1px solid var(--hf-accent-500)' }
            : { background: 'var(--hf-bg-subtle)', border: '1px solid var(--hf-border-field)' }
      }
    >
      <span
        className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-11 font-bold"
        style={
          rechazo === true
            ? { background: '#f2cdc6', color: '#a52016' }
            : hecho
              ? { background: 'var(--hf-accent-500)', color: '#ffffff' }
              : { background: 'var(--hf-bg-surface)', color: 'var(--hf-text-faint)' }
        }
      >
        {rechazo === true ? '✕' : hecho ? '✓' : '·'}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="etiqueta-campo">{etiqueta}</span>
        <span className="text-13 font-medium text-primary">
          {paso.persona ?? pendienteTexto ?? 'Pendiente'}
        </span>
        {paso.nota !== null && paso.nota !== '' && (
          <span className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">{paso.nota}</span>
        )}
      </span>
      <span className="flex-none font-mono text-10_5" style={{ color: cerrado ? 'var(--hf-text-secondary-soft)' : 'var(--hf-text-faint)' }}>
        {paso.momento ?? '—'}
      </span>
    </div>
  );
}

function FormularioDecision({
  codigo,
  veto,
  setAviso,
}: {
  codigo: string;
  veto: string | null;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);

  // O11 en pantalla: se dice POR QUÉ no puede, no se esconde el bloque. Un botón que
  // desaparece manda a alguien a adivinar si le falta permiso o si ya lo hizo.
  if (veto !== null) {
    return (
      <p
        className="rounded-tarjeta px-3.5 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
        style={{ background: 'var(--hf-bg-subtle)', border: '1px solid var(--hf-border-field)', color: 'var(--hf-text-muted)' }}
      >
        No te corresponde autorizar esta solicitud: {veto}.
      </p>
    );
  }

  async function decidir(autoriza: boolean) {
    setEnviando(true);
    const r = await decidirSolicitud(codigo, { autoriza, nota });
    setEnviando(false);
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <div
      className="flex flex-col gap-2.5 rounded-tarjeta px-4 py-3.5"
      style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-200, #d3dceb)' }}
    >
      <span className="text-12 leading-relaxed [text-wrap:pretty]" style={{ color: 'var(--hf-brand-nav)' }}>
        Te corresponde autorizar esta solicitud. La autoridad viene del{' '}
        <strong className="font-semibold">rol</strong> que ocupás, no de tu nombre: si cambiás de
        cargo, cambia con él.
      </span>
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        rows={2}
        className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
        placeholder="Sobre qué autorizás, o por qué no. Es obligatorio en los dos casos."
      />
      <div className="flex flex-wrap gap-2">
        <button
          disabled={enviando || nota.trim().length < 10}
          onClick={() => decidir(true)}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {enviando ? 'Guardando…' : 'Autorizar'}
        </button>
        <button
          disabled={enviando || nota.trim().length < 10}
          onClick={() => decidir(false)}
          className="rounded-campo bg-surface px-4 py-2 text-12_5 font-medium disabled:opacity-50"
          style={{ color: '#a52016', border: '1px solid #e6d3d1' }}
        >
          Rechazar
        </button>
        <span className="self-center text-10_5 text-muted">
          Una autorización sin nota no se distingue de un clic.
        </span>
      </div>
    </div>
  );
}

function FormularioEjecucion({
  codigo,
  esAcceso,
  personas,
  perfiles,
  setAviso,
}: {
  codigo: string;
  esAcceso: boolean;
  personas: { id: number; nombre: string }[];
  perfiles: { id: number; etiqueta: string }[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [nota, setNota] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [perfilId, setPerfilId] = useState('');
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-subtle px-4 py-3.5">
      <Rotulo texto="Ejecutar" />
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        rows={2}
        className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
        placeholder="Qué se hizo al ejecutarla."
      />

      {esAcceso && (
        <>
          {/* En una solicitud de acceso, ejecutar ES crear la relación con vigencia. Se
              hace acá y no en otra pantalla porque el sustento nace en la ejecución: un
              acceso creado aparte quedaría sin solicitud que lo respalde. */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">A quién · crea el acceso</span>
              <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="entrada-campo">
                <option value="">Elegir persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Qué perfil</span>
              <select value={perfilId} onChange={(e) => setPerfilId(e.target.value)} className="entrada-campo">
                <option value="">Elegir perfil</option>
                {perfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {perfiles.length === 0 && (
            <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
              No hay perfiles de acceso cargados. Sin perfiles, la ejecución queda registrada
              pero no crea la relación — y el acceso aparecería después como «sin sustento».
            </span>
          )}
          <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
            Si la solicitud tenía vigencia, el acceso la hereda y se retira solo al vencer.
          </span>
        </>
      )}

      <button
        disabled={enviando || nota.trim().length < 5}
        onClick={async () => {
          setEnviando(true);
          const r = await ejecutarSolicitud(codigo, {
            nota,
            accesoPersonaId: personaId === '' ? undefined : Number(personaId),
            perfilId: perfilId === '' ? undefined : Number(perfilId),
          });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1200);
        }}
        className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Guardando…' : 'Marcar como ejecutada'}
      </button>
    </div>
  );
}

function FormularioSolicitud({ setAviso }: { setAviso: (a: { ok: boolean; texto: string }) => void }) {
  const [tipo, setTipo] = useState<Tipo>('ACCESO');
  const [titulo, setTitulo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [justificacion, setJustificacion] = useState('');
  const [temporal, setTemporal] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [emergencia, setEmergencia] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const listo =
    titulo.trim() !== '' &&
    detalle.trim().length >= 10 &&
    justificacion.trim().length >= 10 &&
    (!temporal || (desde !== '' && hasta !== ''));

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
      <Rotulo texto="Nueva solicitud" />

      <div className="flex flex-wrap gap-1.5">
        {TIPOS.map((t) => {
          const activo = tipo === t;
          const c = COLOR_TIPO[t];
          return (
            <button
              key={t}
              onClick={() => setTipo(t)}
              aria-pressed={activo}
              className="rounded-chip px-3 py-1.5 text-12"
              style={{
                background: activo ? c.fondo : 'var(--hf-bg-surface)',
                border: `1px solid ${activo ? c.texto : 'var(--hf-border-field)'}`,
                color: activo ? c.texto : 'var(--hf-text-secondary-soft)',
                fontWeight: activo ? 600 : 500,
              }}
            >
              {ETIQUETA_TIPO_SOLICITUD[t].etiqueta}
              <span className="ml-1.5 font-mono text-9_5 opacity-70">{ETIQUETA_TIPO_SOLICITUD[t].control}</span>
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Título</span>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="entrada-campo" />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Qué se pide · obligatorio</span>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            rows={3}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Justificación · obligatoria</span>
          <textarea
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            rows={3}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
            placeholder="Quien autoriza decide sobre el porqué, no sobre el qué."
          />
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-12_5 text-secondary">
        <input type="checkbox" checked={temporal} onChange={(e) => setTemporal(e.target.checked)} />
        Es un permiso temporal · se retira solo al vencer
      </label>

      {temporal && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="entrada-campo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="entrada-campo" />
          </label>
        </div>
      )}

      <label
        className="flex cursor-pointer items-start gap-2 rounded-campo px-3 py-2.5 text-12_5"
        style={emergencia ? { background: '#fdeeeb', border: '1px solid #f2cdc6' } : { border: '1px solid var(--hf-border-field)' }}
      >
        <input
          type="checkbox"
          checked={emergencia}
          onChange={(e) => setEmergencia(e.target.checked)}
          className="mt-0.5"
        />
        <span style={emergencia ? { color: '#a52016' } : undefined}>
          <strong className="font-semibold">Cambio de emergencia.</strong> Levanta la separación
          de funciones para contener un incidente. Queda marcado y contable: se registra, no se
          esconde.
        </span>
      </label>

      <button
        disabled={!listo || enviando}
        onClick={async () => {
          setEnviando(true);
          const r = await crearSolicitud({
            tipo,
            titulo,
            detalle,
            justificacion,
            vigenciaDesde: temporal && desde !== '' ? new Date(`${desde}T00:00:00.000Z`) : undefined,
            vigenciaHasta: temporal && hasta !== '' ? new Date(`${hasta}T00:00:00.000Z`) : undefined,
            esEmergencia: emergencia,
          });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1400);
        }}
        className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Creando…' : 'Crear la solicitud'}
      </button>
    </section>
  );
}

function Rotulo({ texto }: { texto: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
        {texto}
      </span>
      <span className="h-px flex-1 bg-hairline" />
    </span>
  );
}

function Etiqueta({ texto, fondo, color }: { texto: string; fondo: string; color: string }) {
  return (
    <span
      className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-8_5 font-semibold uppercase tracking-[0.06em]"
      style={{ background: fondo, color }}
    >
      {texto}
    </span>
  );
}
