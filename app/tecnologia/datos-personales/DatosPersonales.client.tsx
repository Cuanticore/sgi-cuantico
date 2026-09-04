'use client';

// app/tecnologia/datos-personales/DatosPersonales.client.tsx
//
// **La transferencia internacional va en su propio bloque, siempre.** No se esconde cuando
// no la hay: decir «sin transferencia internacional» en voz alta es una afirmación, y un
// bloque ausente es una pregunta sin responder.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registrarTratamiento } from '@/app/sig/acciones/desarrollo';

export interface RegistroPii {
  id: number;
  sistemaId: number;
  sistemaCodigo: string;
  sistemaNombre: string;
  categoria: string;
  sensibles: boolean;
  finalidad: string;
  baseLegitimacion: string;
  titulares: string | null;
  volumen: string | null;
  rolTratamiento: string | null;
  ubicacionAlmacenamiento: string | null;
  transferenciaInternacional: boolean;
  paisDestino: string | null;
  garantiaAplicada: string | null;
  retencion: string | null;
  responsable: string | null;
  faltantes: string[];
}

export default function DatosPersonalesClient({
  filas,
  elegidoId,
  sinRegistro,
  sistemas,
  personas,
}: {
  filas: RegistroPii[];
  elegidoId: number | null;
  sinRegistro: { codigo: string; nombre: string }[];
  sistemas: { id: number; etiqueta: string }[];
  personas: { id: number; nombre: string }[];
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [creando, setCreando] = useState(false);

  const cifras = useMemo(() => {
    const sensibles = filas.filter((f) => f.sensibles).length;
    const transfer = filas.filter((f) => f.transferenciaInternacional).length;
    // Los incompletos son los registros a los que les falta algo MÁS los sistemas que
    // declaran tratar datos personales y no tienen registro. Contar sólo los primeros
    // dejaría fuera al que peor está: el que no tiene nada.
    const incompletos = filas.filter((f) => f.faltantes.length > 0).length + sinRegistro.length;
    return { sensibles, transfer, incompletos };
  }, [filas, sinRegistro]);

  const elegido = filas.find((f) => f.id === elegidoId) ?? null;

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex max-w-[100ch] flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2.5">
            <h1 className="titulo-pagina">Datos personales</h1>
            <span
              className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 font-semibold uppercase tracking-[0.07em]"
              style={{ background: '#efeafb', color: '#5b3fa0' }}
            >
              Ley 1581 de 2012
            </span>
          </span>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Qué datos trata cada sistema, con qué finalidad y bajo qué base.{' '}
            <strong className="font-semibold text-secondary">
              Es el bloque con más exposición legal del paquete
            </strong>
            , y hasta ahora no existía en ninguna parte del sistema.
          </p>
        </div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="ml-auto flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {creando ? 'Cerrar' : 'Nuevo registro'}
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

      {creando && <Formulario sistemas={sistemas} personas={personas} setAviso={setAviso} />}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            valor: filas.length,
            etiqueta: 'tratamientos registrados',
            color: 'var(--hf-brand-nav)',
            fondo: 'var(--hf-bg-surface)',
            borde: 'var(--hf-brand-200, #d3dceb)',
          },
          {
            valor: cifras.sensibles,
            etiqueta: 'con datos sensibles',
            color: cifras.sensibles > 0 ? '#a52016' : '#0b5c44',
            fondo: cifras.sensibles > 0 ? '#fffbfa' : '#f7fbf9',
            borde: cifras.sensibles > 0 ? '#f2cdc6' : '#c9e3d8',
          },
          {
            valor: cifras.transfer,
            etiqueta: 'con transferencia internacional',
            color: '#8a4407',
            fondo: '#fffaf3',
            borde: '#f2b473',
          },
          {
            valor: cifras.incompletos,
            // El lienzo dice «bloquean la puerta P1». La aplicación NO bloquea (D17): es una
            // CONDICIÓN de P1 que acá se señala, y quien decide si la puerta pasa es
            // PRO-TEC-04. Decir «bloquea» sería prometer algo que el software no hace.
            etiqueta:
              cifras.incompletos === 1
                ? 'incompleto · condición de la puerta P1'
                : 'incompletos · condición de la puerta P1',
            color: cifras.incompletos > 0 ? '#a52016' : '#0b5c44',
            fondo: cifras.incompletos > 0 ? '#fffbfa' : '#f7fbf9',
            borde: cifras.incompletos > 0 ? '#f2cdc6' : '#c9e3d8',
          },
        ].map((c) => (
          <span
            key={c.etiqueta}
            className="flex flex-col gap-1 rounded-tarjeta px-4 py-3.5"
            style={{ background: c.fondo, border: `1px solid ${c.borde}` }}
          >
            <span className="font-mono text-22 font-semibold leading-none tabular-nums" style={{ color: c.color }}>
              {c.valor}
            </span>
            <span className="text-11 leading-snug" style={{ color: c.color }}>
              {c.etiqueta}
            </span>
          </span>
        ))}
      </div>

      {sinRegistro.length > 0 && (
        <p
          className="mt-3 rounded-tarjeta px-4 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: '#fdeeeb', border: '1px solid #f2cdc6', color: '#a52016' }}
        >
          {/* Estos sistemas NO tienen fila abajo, así que sin este renglón serían invisibles
              justo en la pantalla que existe para encontrarlos. */}
          <strong className="font-semibold">
            {sinRegistro.length} sistema(s) declaran tratar datos personales y no tienen ningún
            registro:
          </strong>{' '}
          {sinRegistro.map((s) => s.codigo).join(', ')}. No aparecen en la lista de abajo porque no
          hay nada que mostrar — que es exactamente el problema.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3.5 xl:flex-row">
        <div className="flex w-full flex-none flex-col gap-2 xl:w-[330px]">
          {filas.map((f) => {
            const activa = f.id === elegidoId;
            const completo = f.faltantes.length === 0;
            return (
              <button
                key={f.id}
                onClick={() => router.push(`/tecnologia/datos-personales?r=${f.id}`)}
                aria-pressed={activa}
                className="flex flex-col gap-1.5 rounded-tarjeta px-3 py-2.5 text-left"
                style={{
                  background: activa ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                  border: `1px solid ${activa ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                }}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="font-mono text-9 font-semibold text-accent">{f.sistemaCodigo}</span>
                  {f.sensibles && (
                    <span
                      className="ml-auto rounded-[3px] px-1.5 py-0.5 font-mono text-7_5 font-semibold uppercase"
                      style={{ background: '#fdeeeb', color: '#a52016' }}
                    >
                      sensibles
                    </span>
                  )}
                </span>
                <span className="w-full text-12 leading-snug text-primary">{f.categoria}</span>
                <span className="flex w-full items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 flex-none rounded-full"
                    style={{ background: completo ? '#0b5c44' : '#a52016' }}
                  />
                  <span
                    className="font-mono text-8_5"
                    style={{ color: completo ? '#0b5c44' : '#a52016' }}
                  >
                    {completo ? 'completo' : `falta ${f.faltantes.join(', ')}`}
                  </span>
                </span>
              </button>
            );
          })}
          {filas.length === 0 && (
            <p className="rounded-tarjeta border border-border-field bg-surface px-3 py-8 text-center text-12 text-muted [text-wrap:pretty]">
              Ningún tratamiento registrado todavía.
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {elegido !== null && <Ficha f={elegido} />}

          <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
            <Rotulo texto="Por qué esto vive en la hoja de vida y no aparte" />
            <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
              El activo del inventario ya tiene la bandera{' '}
              <span className="font-mono text-10_5">datosPersonales</span>. Lo que no tiene es{' '}
              <strong className="font-semibold">
                la finalidad, la base de legitimación, el país de destino ni la retención
              </strong>
              , que es lo que un requerimiento de la Superintendencia pide.
            </span>
            <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
              Ponerlo en el sistema y no en el activo tiene una razón:{' '}
              <strong className="font-semibold">
                un mismo dato se trata distinto según qué sistema lo use.
              </strong>{' '}
              La cédula en el portal del cliente y la cédula en nómina tienen finalidad, base y
              retención diferentes.
            </span>
            <span
              className="rounded-campo px-3 py-2.5 text-10_5 leading-relaxed [text-wrap:pretty]"
              style={{ background: '#fffaf3', border: '1px solid #f2b473', color: '#8a4407' }}
            >
              Un sistema marcado como que trata datos personales y sin registro de tratamiento
              aparece <strong className="font-semibold">incompleto</strong>, y ésa es una condición
              de la puerta P1. La aplicación lo señala; quien decide si la puerta pasa es
              PRO-TEC-04.
            </span>
          </section>
        </div>
      </div>
    </main>
  );
}

function Ficha({ f }: { f: RegistroPii }) {
  const campos = [
    { etiqueta: 'Sistema', valor: `${f.sistemaCodigo} · ${f.sistemaNombre}` },
    { etiqueta: 'Categoría de datos', valor: f.categoria },
    { etiqueta: 'Finalidad', valor: f.finalidad },
    { etiqueta: 'Base de legitimación', valor: f.baseLegitimacion },
    { etiqueta: 'Titulares', valor: f.titulares ?? '—' },
    { etiqueta: 'Volumen aproximado', valor: f.volumen ?? '—' },
    {
      etiqueta: 'Rol en el tratamiento',
      valor: f.rolTratamiento === null ? 'sin definir' : f.rolTratamiento.toLowerCase(),
      alerta: f.rolTratamiento === null,
    },
    {
      etiqueta: 'Ubicación de almacenamiento',
      valor: f.ubicacionAlmacenamiento ?? 'sin registrar',
      alerta: f.ubicacionAlmacenamiento === null,
    },
    { etiqueta: 'Retención', valor: f.retencion ?? 'sin registrar', alerta: f.retencion === null },
    { etiqueta: 'Responsable', valor: f.responsable ?? 'sin registrar' },
  ];

  return (
    <>
      <section
        className="flex flex-col gap-2.5 rounded-tarjeta bg-surface px-4 py-3.5"
        style={{ border: '1px solid var(--hf-brand-200, #d3dceb)' }}
      >
        <Rotulo texto="Tratamiento" />
        <div className="grid gap-3 sm:grid-cols-2">
          {campos.map((c) => (
            <span key={c.etiqueta} className="flex flex-col gap-0.5">
              <span className="etiqueta-campo">{c.etiqueta}</span>
              <span
                className="text-12 leading-snug"
                style={
                  c.alerta === true
                    ? { color: '#a52016', fontWeight: 600 }
                    : { color: 'var(--hf-text-primary)' }
                }
              >
                {c.valor}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* Siempre visible, con o sin transferencia. Un bloque ausente es una pregunta sin
          responder; «sin transferencia internacional» es una afirmación. */}
      <section
        className="flex flex-col gap-2.5 rounded-tarjeta px-4 py-3.5"
        style={
          f.transferenciaInternacional
            ? { background: '#fffaf3', border: '1px solid #f2b473' }
            : { background: 'var(--hf-bg-surface)', border: '1px solid var(--hf-border-field)' }
        }
      >
        <span className="flex items-center gap-2.5">
          <span
            className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em]"
            style={{ color: f.transferenciaInternacional ? '#8a4407' : 'var(--hf-text-muted)' }}
          >
            Transferencia internacional
          </span>
          <span className="h-px flex-1 bg-hairline" />
          <span
            className="flex-none font-mono text-9_5 font-semibold"
            style={{ color: f.transferenciaInternacional ? '#8a4407' : '#0b5c44' }}
          >
            {f.transferenciaInternacional ? 'sí' : 'no'}
          </span>
        </span>
        {f.transferenciaInternacional ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <span className="flex flex-col gap-0.5">
                <span className="etiqueta-campo">País de destino</span>
                <span className="text-12" style={{ color: f.paisDestino === null ? '#a52016' : '#8a4407' }}>
                  {f.paisDestino ?? 'SIN DECLARAR'}
                </span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="etiqueta-campo">Garantía aplicada</span>
                <span className="text-12" style={{ color: f.garantiaAplicada === null ? '#a52016' : '#8a4407' }}>
                  {f.garantiaAplicada ?? 'SIN DECLARAR'}
                </span>
              </span>
            </div>
            <span className="text-10_5 leading-relaxed [text-wrap:pretty]" style={{ color: '#8a4407' }}>
              Los datos salen del país. La Ley 1581 exige que el destino y la garantía estén
              declarados: decir que hay transferencia y callar a dónde es peor que no declararla.
            </span>
          </>
        ) : (
          <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
            Los datos no salen del país. Se dice en voz alta a propósito: un bloque ausente es una
            pregunta sin responder.
          </span>
        )}
      </section>
    </>
  );
}

function Formulario({
  sistemas,
  personas,
  setAviso,
}: {
  sistemas: { id: number; etiqueta: string }[];
  personas: { id: number; nombre: string }[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [sistemaId, setSistemaId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [sensibles, setSensibles] = useState(false);
  const [finalidad, setFinalidad] = useState('');
  const [base, setBase] = useState('');
  const [titulares, setTitulares] = useState('');
  const [volumen, setVolumen] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [transfer, setTransfer] = useState(false);
  const [pais, setPais] = useState('');
  const [garantia, setGarantia] = useState('');
  const [retencion, setRetencion] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (sistemas.length === 0) {
    return (
      <p
        className="mt-4 rounded-tarjeta px-4 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
        style={{ background: 'var(--hf-bg-subtle)', border: '1px solid var(--hf-border-field)', color: 'var(--hf-text-muted)' }}
      >
        No hay sistemas con hoja de vida abierta. Un tratamiento es siempre de un sistema, así que
        primero hay que abrirla en{' '}
        <Link href="/tecnologia/sistemas" className="font-medium text-accent underline">
          Hoja de vida del sistema
        </Link>
        .
      </p>
    );
  }

  const listo =
    sistemaId !== '' &&
    categoria.trim() !== '' &&
    finalidad.trim().length >= 10 &&
    base.trim() !== '' &&
    (!transfer || (pais.trim() !== '' && garantia.trim() !== ''));

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
      <Rotulo texto="Nuevo registro de tratamiento" />
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Sistema</span>
          <select value={sistemaId} onChange={(e) => setSistemaId(e.target.value)} className="entrada-campo">
            <option value="">Elegir</option>
            {sistemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Categoría de datos</span>
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="entrada-campo"
            placeholder="Identificación y datos de contacto"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Finalidad · obligatoria</span>
        <textarea
          value={finalidad}
          onChange={(e) => setFinalidad(e.target.value)}
          rows={2}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
          placeholder="Es lo primero que pide un requerimiento."
        />
      </label>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Base de legitimación</span>
          <input value={base} onChange={(e) => setBase(e.target.value)} className="entrada-campo" placeholder="Ejecución contractual" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Titulares</span>
          <input value={titulares} onChange={(e) => setTitulares(e.target.value)} className="entrada-campo" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Volumen</span>
          <input value={volumen} onChange={(e) => setVolumen(e.target.value)} className="entrada-campo" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Retención</span>
          <input value={retencion} onChange={(e) => setRetencion(e.target.value)} className="entrada-campo" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Ubicación de almacenamiento</span>
          <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} className="entrada-campo" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Responsable</span>
          <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="entrada-campo">
            <option value="">Elegir</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-12_5 text-secondary">
        <input type="checkbox" checked={sensibles} onChange={(e) => setSensibles(e.target.checked)} />
        Incluye datos sensibles
      </label>

      <label
        className="flex cursor-pointer items-start gap-2 rounded-campo px-3 py-2.5 text-12_5"
        style={transfer ? { background: '#fffaf3', border: '1px solid #f2b473' } : { border: '1px solid var(--hf-border-field)' }}
      >
        <input
          type="checkbox"
          checked={transfer}
          onChange={(e) => setTransfer(e.target.checked)}
          className="mt-0.5"
        />
        <span style={transfer ? { color: '#8a4407' } : undefined}>
          <strong className="font-semibold">Hay transferencia internacional.</strong> Si la marcás,
          el país de destino y la garantía pasan a ser obligatorios: declararla y callar a dónde es
          peor que no declararla.
        </span>
      </label>

      {transfer && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">País de destino · obligatorio</span>
            <input value={pais} onChange={(e) => setPais(e.target.value)} className="entrada-campo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Garantía aplicada · obligatoria</span>
            <input value={garantia} onChange={(e) => setGarantia(e.target.value)} className="entrada-campo" />
          </label>
        </div>
      )}

      <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
        Registrar un tratamiento marca el sistema como que trata datos personales: dejar la bandera
        en «no» con un registro colgando lo sacaría de la lista de los que hay que revisar.
      </span>

      <button
        disabled={!listo || enviando}
        onClick={async () => {
          setEnviando(true);
          const r = await registrarTratamiento({
            sistemaId: Number(sistemaId),
            categoria,
            sensibles,
            finalidad,
            baseLegitimacion: base,
            titulares: titulares || undefined,
            volumen: volumen || undefined,
            ubicacionAlmacenamiento: ubicacion || undefined,
            transferenciaInternacional: transfer,
            paisDestino: pais || undefined,
            garantiaAplicada: garantia || undefined,
            retencion: retencion || undefined,
            responsableId: responsableId === '' ? undefined : Number(responsableId),
          });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1300);
        }}
        className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Guardando…' : 'Registrar el tratamiento'}
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
