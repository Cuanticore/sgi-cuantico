'use client';

// app/sig/contenidos/Contenidos.client.tsx
//
// Lista a la izquierda (428px), ficha a la derecha — y la ficha ahora SE EDITA.
//
// Antes era un visor. El lienzo pone «Nuevo contenido», «Duplicar», «Guardar», las flechas
// para reordenar y «+ Agregar ítem», y ninguno existía: `crearContenido` y
// `editarContenido` estaban escritas en el servidor sin nadie que las llamara.
//
// Dos decisiones que el lienzo justifica y conviene tener a mano:
//
//   · El aviso de versión no es decoración. Editar un contenido que ya generó
//     obligaciones sube su versión (R10), y los acuses cerrados conservan la que se
//     realizó. Quien edita tiene que saberlo ANTES de guardar, no leerlo en el resultado.
//
//   · Un ítem ya respondido no se puede quitar. La pantalla lo bloquea con el conteo a la
//     vista; el servidor lo rechaza igual, porque una regla que sólo vive en el cliente no
//     es una regla.

import { useEffect, useMemo, useState } from 'react';
import {
  crearContenido,
  duplicarContenido,
  editarContenido,
  type DatosContenido,
} from '@/app/sig/acciones/tareas';

type Tipo = 'LECTURA' | 'VERIFICACION' | 'CAPACITACION' | 'TAREA';

export interface ItemFila {
  id: number;
  orden: number;
  texto: string;
  obligatorio: boolean;
  permiteNoAplica: boolean;
  /// Cuántas veces se respondió. Mayor que cero lo vuelve imborrable.
  respuestas: number;
}

export interface ContenidoFila {
  id: number;
  codigo: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  procedimientoOrigen: string | null;
  version: number;
  documentoCodigo: string | null;
  documentoNombre: string | null;
  documentoVersion: string | null;
  documentoUrl: string | null;
  modalidad: string | null;
  duracionHoras: number | null;
  exigeEvaluacion: boolean;
  notaMinima: number | null;
  items: ItemFila[];
  usos: { id: number; codigo: string; alcance: string; periodicidad: string }[];
}

const TIPO: Record<Tipo, { etiqueta: string; fondo: string; texto: string }> = {
  LECTURA: { etiqueta: 'Lectura', fondo: '#e9f0fb', texto: '#12437f' },
  VERIFICACION: { etiqueta: 'Verificación', fondo: '#fff3e6', texto: '#8a4407' },
  CAPACITACION: { etiqueta: 'Capacitación', fondo: '#e8f4ef', texto: '#0b5c44' },
  TAREA: { etiqueta: 'Tarea', fondo: '#f5f7f6', texto: '#4a544f' },
};

const ORDEN_TIPOS: Tipo[] = ['LECTURA', 'VERIFICACION', 'CAPACITACION', 'TAREA'];

/// Un ítem en edición. `id` ausente = nuevo. `clave` es sólo para React: un ítem nuevo no
/// tiene id, y usar el índice como key hace que al reordenar el foco salte de campo.
interface ItemEnEdicion {
  clave: string;
  id?: number;
  texto: string;
  obligatorio: boolean;
  permiteNoAplica: boolean;
  respuestas: number;
}

let contadorClaves = 0;
const nuevaClave = () => `nuevo-${++contadorClaves}`;

function aEdicion(items: ItemFila[]): ItemEnEdicion[] {
  return items.map((i) => ({
    clave: `guardado-${i.id}`,
    id: i.id,
    texto: i.texto,
    obligatorio: i.obligatorio,
    permiteNoAplica: i.permiteNoAplica,
    respuestas: i.respuestas,
  }));
}

export default function ContenidosClient({ contenidos }: { contenidos: ContenidoFila[] }) {
  const [filtro, setFiltro] = useState<Tipo | 'TODOS'>('TODOS');
  const [seleccionado, setSeleccionado] = useState<number | null>(contenidos[0]?.id ?? null);
  const [creando, setCreando] = useState(false);

  const visibles = useMemo(
    () => contenidos.filter((c) => filtro === 'TODOS' || c.tipo === filtro),
    [contenidos, filtro],
  );
  const seleccion = contenidos.find((c) => c.id === seleccionado) ?? null;

  return (
    <main className="flex flex-1 flex-col px-8 pt-7 pb-14">
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Contenidos</h1>
          <p className="max-w-[76ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Se define una vez y se asigna N veces. Editar un contenido publicado sube su
            versión, y los registros ya cerrados conservan la versión que se realizó.
          </p>
        </div>
        <button
          onClick={() => setCreando(true)}
          className="ml-auto flex-none rounded-campo px-4 py-2.5 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)', border: '1px solid var(--hf-brand-700)' }}
        >
          Nuevo contenido
        </button>
      </div>

      {creando && <NuevoContenido onCerrar={() => setCreando(false)} />}

      <div className="mt-5 flex min-h-0 flex-1 gap-4">
        <div className="flex w-[428px] flex-none flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3.5 py-3">
            {(['TODOS', ...ORDEN_TIPOS] as const).map((t) => {
              const activo = filtro === t;
              return (
                <button
                  key={t}
                  onClick={() => setFiltro(t)}
                  aria-pressed={activo}
                  className="rounded-chip px-3 py-1 text-11_5"
                  style={{
                    background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                    fontWeight: activo ? 600 : 500,
                  }}
                >
                  {t === 'TODOS' ? 'Todos' : TIPO[t].etiqueta}
                </button>
              );
            })}
          </div>

          <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
            {visibles.map((c) => {
              const activo = seleccionado === c.id;
              const tipo = TIPO[c.tipo as Tipo];
              return (
                <button
                  key={c.id}
                  onClick={() => setSeleccionado(c.id)}
                  className="flex flex-col gap-1 rounded-campo px-3 py-2.5 text-left"
                  style={{ background: activo ? 'var(--hf-brand-100)' : 'transparent' }}
                >
                  <span className="flex w-full items-center gap-2">
                    <span
                      className="font-mono text-10_5 font-medium"
                      style={{ color: 'var(--hf-brand-nav)' }}
                    >
                      {c.codigo}
                    </span>
                    <span
                      className="rounded-[4px] px-1.5 py-0.5 font-mono text-8_5 uppercase"
                      style={{ background: tipo.fondo, color: tipo.texto }}
                    >
                      {tipo.etiqueta}
                    </span>
                    <span className="ml-auto font-mono text-9_5 text-label">v{c.version}</span>
                  </span>
                  <span className="text-12_5 font-medium leading-snug text-primary">{c.titulo}</span>
                  {c.procedimientoOrigen && (
                    <span className="font-mono text-9_5 text-muted">{c.procedimientoOrigen}</span>
                  )}
                </button>
              );
            })}
            {visibles.length === 0 && (
              <p className="px-3 py-6 text-center text-12 text-muted">
                Ningún contenido de ese tipo.
              </p>
            )}
          </div>
        </div>

        {seleccion ? (
          <Ficha key={seleccion.id} contenido={seleccion} />
        ) : (
          <p className="flex-1 pt-6 text-12_5 text-muted">
            Todavía no hay contenidos. Creá el primero con «Nuevo contenido».
          </p>
        )}
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// La ficha, editable
// ──────────────────────────────────────────────────────────────────────────────

function Ficha({ contenido }: { contenido: ContenidoFila }) {
  const tipo = contenido.tipo as Tipo;
  const [titulo, setTitulo] = useState(contenido.titulo);
  const [descripcion, setDescripcion] = useState(contenido.descripcion);
  const [origen, setOrigen] = useState(contenido.procedimientoOrigen ?? '');
  const [docNombre, setDocNombre] = useState(contenido.documentoNombre ?? '');
  const [docCodigo, setDocCodigo] = useState(contenido.documentoCodigo ?? '');
  const [docVersion, setDocVersion] = useState(contenido.documentoVersion ?? '');
  const [docUrl, setDocUrl] = useState(contenido.documentoUrl ?? '');
  const [modalidad, setModalidad] = useState(contenido.modalidad ?? '');
  const [duracion, setDuracion] = useState(contenido.duracionHoras?.toString() ?? '');
  const [exigeEvaluacion, setExigeEvaluacion] = useState(contenido.exigeEvaluacion);
  const [notaMinima, setNotaMinima] = useState(contenido.notaMinima?.toString() ?? '');
  const [items, setItems] = useState<ItemEnEdicion[]>(() => aEdicion(contenido.items));
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const subiraVersion = contenido.usos.length > 0;

  function mover(indice: number, salto: -1 | 1) {
    const destino = indice + salto;
    if (destino < 0 || destino >= items.length) return;
    const copia = [...items];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    setItems(copia);
  }

  async function guardar() {
    setOcupado(true);
    setAviso(null);
    const r = await editarContenido(contenido.id, {
      titulo,
      descripcion,
      procedimientoOrigen: origen.trim() || undefined,
      ...(tipo === 'LECTURA' && {
        documentoNombre: docNombre.trim() || undefined,
        documentoCodigo: docCodigo.trim() || undefined,
        documentoVersion: docVersion.trim() || undefined,
        documentoUrl: docUrl.trim() || undefined,
      }),
      ...(tipo === 'CAPACITACION' && {
        modalidad: modalidad.trim() || undefined,
        duracionHoras: duracion.trim() === '' ? undefined : Number(duracion),
        exigeEvaluacion,
        notaMinima: notaMinima.trim() === '' ? undefined : Number(notaMinima),
      }),
      ...(tipo === 'VERIFICACION' && {
        items: items.map((i) => ({
          ...(i.id !== undefined && { id: i.id }),
          texto: i.texto,
          obligatorio: i.obligatorio,
          permiteNoAplica: i.permiteNoAplica,
        })),
      }),
    });
    setOcupado(false);
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setTimeout(() => window.location.reload(), 1200);
  }

  async function duplicar() {
    setOcupado(true);
    setAviso(null);
    const r = await duplicarContenido(contenido.id);
    setOcupado(false);
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
      <div className="flex items-start gap-3.5 border-b border-hairline px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-11_5 font-semibold" style={{ color: 'var(--hf-brand-nav)' }}>
              {contenido.codigo}
            </span>
            <span
              className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 uppercase"
              style={{ background: TIPO[tipo].fondo, color: TIPO[tipo].texto }}
            >
              {TIPO[tipo].etiqueta}
            </span>
            <span
              className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 uppercase"
              style={{ background: 'var(--hf-bg-app)', color: 'var(--hf-text-muted)' }}
            >
              Versión {contenido.version}
            </span>
          </span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            aria-label="Título del contenido"
            className="w-full bg-transparent text-16 font-semibold leading-snug text-primary outline-none"
          />
        </div>
        <div className="flex flex-none gap-2">
          <button
            onClick={duplicar}
            disabled={ocupado}
            className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12 font-medium text-secondary disabled:opacity-50"
          >
            Duplicar
          </button>
          <button
            onClick={guardar}
            disabled={ocupado}
            className="rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-brand-nav)', border: '1px solid var(--hf-brand-700)' }}
          >
            {ocupado ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {/* R10 dicho ANTES de guardar, no después. */}
        {subiraVersion && (
          <p
            className="rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
            style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
          >
            Este contenido ya está asignado por {contenido.usos.length} obligación(es):
            guardar sube la versión a <strong className="font-semibold">{contenido.version + 1}</strong>.
            Los registros ya cerrados conservan la versión que se realizó.
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

        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Procedimiento origen">
            <input
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              placeholder="PRO-TEC-01"
              className="entrada-campo font-mono"
            />
          </Campo>
          <Extra
            tipo={tipo}
            contenido={contenido}
            modalidad={modalidad}
            setModalidad={setModalidad}
            duracion={duracion}
            setDuracion={setDuracion}
            exigeEvaluacion={exigeEvaluacion}
            setExigeEvaluacion={setExigeEvaluacion}
            notaMinima={notaMinima}
            setNotaMinima={setNotaMinima}
          />
        </div>

        <Campo etiqueta="Descripción">
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            className="entrada-campo min-h-[62px] leading-relaxed"
          />
        </Campo>

        {tipo === 'VERIFICACION' && (
          <div className="flex flex-col gap-2.5">
            <Regla etiqueta="Ítems de la lista" cola={`${items.length}`} />
            {items.map((item, i) => (
              <div
                key={item.clave}
                className="flex items-start gap-2.5 rounded-tarjeta border border-border-field bg-subtle px-3 py-2.5"
              >
                <span className="flex flex-none flex-col items-center gap-0.5 pt-0.5">
                  <button
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    aria-label={`Subir el ítem ${i + 1}`}
                    className="text-10 leading-none text-label disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => mover(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label={`Bajar el ítem ${i + 1}`}
                    className="text-10 leading-none text-label disabled:opacity-30"
                  >
                    ▼
                  </button>
                </span>
                <span className="flex-none pt-1.5 font-mono text-10 text-label">{i + 1}</span>
                <textarea
                  value={item.texto}
                  onChange={(e) =>
                    setItems(items.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))
                  }
                  rows={1}
                  aria-label={`Texto del ítem ${i + 1}`}
                  className="min-w-0 flex-1 resize-y bg-transparent text-12_5 leading-relaxed text-primary outline-none"
                />
                <span className="flex flex-none items-center gap-1.5 pt-0.5">
                  <Interruptor
                    activo={item.obligatorio}
                    encendido="Obligatorio"
                    apagado="Opcional"
                    onCambiar={() =>
                      setItems(
                        items.map((x, j) => (j === i ? { ...x, obligatorio: !x.obligatorio } : x)),
                      )
                    }
                  />
                  <Interruptor
                    activo={item.permiteNoAplica}
                    encendido="Admite N/A"
                    apagado="Sin N/A"
                    onCambiar={() =>
                      setItems(
                        items.map((x, j) =>
                          j === i ? { ...x, permiteNoAplica: !x.permiteNoAplica } : x,
                        ),
                      )
                    }
                  />
                  {item.respuestas > 0 ? (
                    <span
                      className="font-mono text-9_5"
                      title={`Respondido ${item.respuestas} vez(ces): no se puede quitar, porque esa respuesta es la evidencia de la verificación.`}
                      style={{ color: 'var(--hf-text-muted)' }}
                    >
                      {item.respuestas} resp.
                    </span>
                  ) : (
                    <button
                      onClick={() => setItems(items.filter((_, j) => j !== i))}
                      aria-label={`Quitar el ítem ${i + 1}`}
                      className="font-mono text-11"
                      style={{ color: 'var(--hf-danger-text)' }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
            ))}
            <button
              onClick={() =>
                setItems([
                  ...items,
                  {
                    clave: nuevaClave(),
                    texto: '',
                    obligatorio: true,
                    permiteNoAplica: true,
                    respuestas: 0,
                  },
                ])
              }
              className="self-start rounded-campo px-3.5 py-2 text-12 font-medium"
              style={{
                color: 'var(--hf-brand-nav)',
                border: '1px dashed var(--hf-brand-border)',
                background: 'var(--hf-bg-surface)',
              }}
            >
              + Agregar ítem
            </button>
          </div>
        )}

        {tipo === 'LECTURA' && (
          <div className="flex flex-col gap-2.5">
            <Regla etiqueta="Documento referenciado" />
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <input
                value={docNombre}
                onChange={(e) => setDocNombre(e.target.value)}
                placeholder="Nombre del documento"
                aria-label="Nombre del documento"
                className="entrada-campo"
              />
              <input
                value={docVersion}
                onChange={(e) => setDocVersion(e.target.value)}
                placeholder="v2"
                aria-label="Versión del documento"
                className="entrada-campo font-mono"
              />
            </div>
            <div className="grid grid-cols-[160px_1fr] gap-3">
              <input
                value={docCodigo}
                onChange={(e) => setDocCodigo(e.target.value)}
                placeholder="POL-SIG-02"
                aria-label="Código del documento"
                className="entrada-campo font-mono"
              />
              <input
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://…"
                aria-label="Enlace al documento"
                className="entrada-campo"
                style={{ color: 'var(--hf-brand-nav)' }}
              />
            </div>
            <p
              className="rounded-tarjeta px-3 py-2.5 text-11_5 leading-relaxed [text-wrap:pretty]"
              style={{
                background: 'var(--hf-warn-100)',
                color: 'var(--hf-warn-text)',
                border: '1px solid var(--hf-warn-border)',
              }}
            >
              La gestión documental está fuera del alcance: aquí sólo se referencia el
              documento. Subir la versión aquí no publica una versión nueva del documento —
              la declara para los acuses futuros.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <Regla etiqueta="Asignado por" />
          {contenido.usos.length === 0 ? (
            <p className="text-11_5 text-muted">
              Ninguna obligación lo asigna todavía, así que nadie lo tiene en su bandeja.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {contenido.usos.map((u) => (
                <span
                  key={u.id}
                  className="flex min-w-[168px] flex-col gap-1 rounded-tarjeta border border-border-field bg-subtle px-3.5 py-2.5"
                >
                  <span
                    className="font-mono text-10_5 font-medium"
                    style={{ color: 'var(--hf-brand-nav)' }}
                  >
                    {u.codigo}
                  </span>
                  <span className="text-12 text-secondary">
                    {u.alcance} · {u.periodicidad}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Nuevo contenido
// ──────────────────────────────────────────────────────────────────────────────

function NuevoContenido({ onCerrar }: { onCerrar: () => void }) {
  const [tipo, setTipo] = useState<Tipo>('LECTURA');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [origen, setOrigen] = useState('');
  const [docNombre, setDocNombre] = useState('');
  const [docCodigo, setDocCodigo] = useState('');
  const [docVersion, setDocVersion] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [duracion, setDuracion] = useState('');
  const [exigeEvaluacion, setExigeEvaluacion] = useState(false);
  const [notaMinima, setNotaMinima] = useState('');
  const [items, setItems] = useState<string[]>(['']);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cerrar con Escape: es un panel modal y quedarse encerrado en un formulario que no se
  // quiso abrir es la clase de detalle que hace que nadie lo vuelva a abrir.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [onCerrar]);

  async function crear() {
    setOcupado(true);
    setError(null);
    const datos: DatosContenido = {
      tipo,
      titulo,
      descripcion,
      procedimientoOrigen: origen.trim() || undefined,
      ...(tipo === 'LECTURA' && {
        documentoNombre: docNombre.trim() || undefined,
        documentoCodigo: docCodigo.trim() || undefined,
        documentoVersion: docVersion.trim() || undefined,
        documentoUrl: docUrl.trim() || undefined,
      }),
      ...(tipo === 'CAPACITACION' && {
        modalidad: modalidad.trim() || undefined,
        duracionHoras: duracion.trim() === '' ? undefined : Number(duracion),
        exigeEvaluacion,
        notaMinima: notaMinima.trim() === '' ? undefined : Number(notaMinima),
      }),
      ...(tipo === 'VERIFICACION' && {
        items: items
          .map((t) => t.trim())
          .filter((t) => t !== '')
          .map((texto) => ({ texto, obligatorio: true, permiteNoAplica: true })),
      }),
    };
    const r = await crearContenido(datos);
    setOcupado(false);
    if (r.ok) {
      window.location.reload();
      return;
    }
    setError(r.mensaje);
  }

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-15 font-bold text-primary">Nuevo contenido</h2>
        <button onClick={onCerrar} className="text-12_5 text-muted">
          Cancelar
        </button>
      </div>

      <p className="max-w-[80ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
        El código se asigna solo, por tipo y consecutivo: <code className="font-mono">LEC-009</code>,{' '}
        <code className="font-mono">LVE-003</code>. No se escribe a mano, para que no haya dos
        contenidos con el mismo.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="etiqueta-campo">Tipo</span>
        <div className="flex flex-wrap gap-1.5">
          {ORDEN_TIPOS.map((t) => {
            const activo = tipo === t;
            return (
              <button
                key={t}
                onClick={() => setTipo(t)}
                aria-pressed={activo}
                className="rounded-chip px-3.5 py-1.5 text-12"
                style={{
                  background: activo ? TIPO[t].fondo : 'var(--hf-bg-surface)',
                  color: activo ? TIPO[t].texto : 'var(--hf-text-secondary-soft)',
                  border: `1px solid ${activo ? TIPO[t].texto : 'var(--hf-border-field)'}`,
                  fontWeight: activo ? 600 : 500,
                }}
              >
                {TIPO[t].etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="Título">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Verificación mensual de respaldos"
            className="entrada-campo"
          />
        </Campo>
        <Campo etiqueta="Procedimiento origen · opcional">
          <input
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            placeholder="PTR-TEC-01 Protocolo de Backups"
            className="entrada-campo font-mono"
          />
        </Campo>
      </div>

      <Campo etiqueta="Descripción">
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder="Qué hay que hacer, y contra qué se verifica."
          className="entrada-campo leading-relaxed"
        />
      </Campo>

      {tipo === 'LECTURA' && (
        <div className="grid grid-cols-[1fr_160px_100px] gap-3">
          <Campo etiqueta="Documento">
            <input
              value={docNombre}
              onChange={(e) => setDocNombre(e.target.value)}
              placeholder="Política de Gobierno de Seguridad"
              className="entrada-campo"
            />
          </Campo>
          <Campo etiqueta="Código">
            <input
              value={docCodigo}
              onChange={(e) => setDocCodigo(e.target.value)}
              placeholder="POL-SIG-02"
              className="entrada-campo font-mono"
            />
          </Campo>
          <Campo etiqueta="Versión">
            <input
              value={docVersion}
              onChange={(e) => setDocVersion(e.target.value)}
              placeholder="2"
              className="entrada-campo font-mono"
            />
          </Campo>
          <div className="col-span-3">
            <Campo etiqueta="Enlace · opcional">
              <input
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://cuantico.sharepoint.com/…"
                className="entrada-campo"
              />
            </Campo>
          </div>
        </div>
      )}

      {tipo === 'CAPACITACION' && (
        <div className="grid grid-cols-4 gap-3">
          <Campo etiqueta="Modalidad">
            <input
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value)}
              placeholder="Virtual"
              className="entrada-campo"
            />
          </Campo>
          <Campo etiqueta="Duración · horas">
            <input
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              inputMode="decimal"
              placeholder="2"
              className="entrada-campo font-mono"
            />
          </Campo>
          <Campo etiqueta="Evaluación">
            <label className="flex items-center gap-2 pt-1.5 text-12 text-secondary">
              <input
                type="checkbox"
                checked={exigeEvaluacion}
                onChange={(e) => setExigeEvaluacion(e.target.checked)}
              />
              La exige
            </label>
          </Campo>
          <Campo etiqueta="Nota mínima">
            <input
              value={notaMinima}
              onChange={(e) => setNotaMinima(e.target.value)}
              inputMode="decimal"
              disabled={!exigeEvaluacion}
              placeholder="80"
              className="entrada-campo font-mono disabled:opacity-50"
            />
          </Campo>
        </div>
      )}

      {tipo === 'VERIFICACION' && (
        <div className="flex flex-col gap-2">
          <span className="etiqueta-campo">Ítems de la lista</span>
          {items.map((texto, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-none font-mono text-10 text-label">{i + 1}</span>
              <input
                value={texto}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="Qué se verifica en este ítem"
                aria-label={`Ítem ${i + 1}`}
                className="entrada-campo flex-1"
              />
              {items.length > 1 && (
                <button
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                  aria-label={`Quitar el ítem ${i + 1}`}
                  className="flex-none font-mono text-11"
                  style={{ color: 'var(--hf-danger-text)' }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setItems([...items, ''])}
            className="self-start rounded-campo px-3.5 py-2 text-12 font-medium"
            style={{
              color: 'var(--hf-brand-nav)',
              border: '1px dashed var(--hf-brand-border)',
              background: 'var(--hf-bg-surface)',
            }}
          >
            + Agregar ítem
          </button>
        </div>
      )}

      {error && (
        <p
          className="rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
          style={{ background: 'var(--hf-danger-bg)', color: 'var(--hf-danger-text)' }}
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={crear}
          disabled={ocupado}
          className="rounded-campo px-4 py-2.5 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {ocupado ? 'Creando…' : 'Crear contenido'}
        </button>
        <span className="text-11_5 text-muted">
          Nace sin asignar: para que le llegue a alguien hay que crear una obligación.
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Piezas
// ──────────────────────────────────────────────────────────────────────────────

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="etiqueta-campo">{etiqueta}</span>
      {children}
    </label>
  );
}

function Regla({ etiqueta, cola }: { etiqueta: string; cola?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="etiqueta-campo">{etiqueta}</span>
      <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
      {cola && <span className="font-mono text-9_5 text-label">{cola}</span>}
    </span>
  );
}

function Interruptor({
  activo,
  encendido,
  apagado,
  onCambiar,
}: {
  activo: boolean;
  encendido: string;
  apagado: string;
  onCambiar: () => void;
}) {
  return (
    <button
      onClick={onCambiar}
      aria-pressed={activo}
      className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 uppercase"
      style={{
        background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-app)',
        color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)',
      }}
    >
      {activo ? encendido : apagado}
    </button>
  );
}

/// El segundo campo de la rejilla cambia según el tipo, como en el lienzo
/// (`extraEtiqueta`/`extraValor`). Sólo se muestra lo que el modelo realmente guarda.
function Extra({
  tipo,
  contenido,
  modalidad,
  setModalidad,
  duracion,
  setDuracion,
  exigeEvaluacion,
  setExigeEvaluacion,
  notaMinima,
  setNotaMinima,
}: {
  tipo: Tipo;
  contenido: ContenidoFila;
  modalidad: string;
  setModalidad: (v: string) => void;
  duracion: string;
  setDuracion: (v: string) => void;
  exigeEvaluacion: boolean;
  setExigeEvaluacion: (v: boolean) => void;
  notaMinima: string;
  setNotaMinima: (v: string) => void;
}) {
  if (tipo === 'CAPACITACION') {
    return (
      <div className="grid grid-cols-[1fr_88px] gap-3">
        <Campo etiqueta="Modalidad y duración">
          <input
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value)}
            placeholder="Virtual"
            className="entrada-campo"
          />
        </Campo>
        <Campo etiqueta="Horas">
          <input
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            inputMode="decimal"
            className="entrada-campo font-mono"
          />
        </Campo>
        <div className="col-span-2">
          <Campo etiqueta="Nota mínima">
            <span className="flex items-center gap-2.5">
              <label className="flex items-center gap-2 text-12 text-secondary">
                <input
                  type="checkbox"
                  checked={exigeEvaluacion}
                  onChange={(e) => setExigeEvaluacion(e.target.checked)}
                />
                Exige evaluación
              </label>
              <input
                value={notaMinima}
                onChange={(e) => setNotaMinima(e.target.value)}
                inputMode="decimal"
                disabled={!exigeEvaluacion}
                aria-label="Nota mínima"
                className="entrada-campo w-20 font-mono disabled:opacity-50"
              />
            </span>
          </Campo>
        </div>
      </div>
    );
  }

  if (tipo === 'VERIFICACION') {
    return (
      <Campo etiqueta="Ítems">
        <span className="entrada-campo">
          {contenido.items.length} ítem(s) ·{' '}
          {contenido.items.filter((i) => i.obligatorio).length} obligatorio(s)
        </span>
      </Campo>
    );
  }

  if (tipo === 'LECTURA') {
    return (
      <Campo etiqueta="Alcance de las asignaciones">
        <span className="entrada-campo">
          {contenido.usos.length === 0
            ? 'Sin asignar'
            : contenido.usos.map((u) => u.alcance).join(' · ')}
        </span>
      </Campo>
    );
  }

  // TAREA. El modelo no guarda nada más para este tipo, y decirlo es mejor que dejar el
  // hueco: el anexo es opcional en el panel de cierre, y eso es un dato real.
  return (
    <Campo etiqueta="Evidencia">
      <span className="entrada-campo">Nota y anexo · opcional</span>
    </Campo>
  );
}
