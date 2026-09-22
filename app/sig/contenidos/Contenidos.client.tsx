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
import { subirPaqueteScorm } from '@/app/sig/acciones/scorm';

type Tipo = 'LECTURA' | 'VERIFICACION' | 'CAPACITACION' | 'TAREA' | 'CURSO_VIRTUAL';

export interface ItemFila {
  id: number;
  orden: number;
  texto: string;
  obligatorio: boolean;
  permiteNoAplica: boolean;
  /// Cuántas veces se respondió. Mayor que cero lo vuelve imborrable.
  respuestas: number;
}

/// Una fila del historial. `titulo` es el texto CONGELADO de esa versión; no hay campo
/// para la nota de «qué cambió», y la ficha lo dice en pantalla en vez de dejar el hueco.
export interface VersionFila {
  version: number;
  titulo: string;
  publicadaEn: string;
  publicadaPor: string | null;
  /// Cuántos cierres quedaron anclados a esta versión.
  registros: number;
}

/// Un paquete SCORM del contenido. `clase` no es decorativa (D-1/D-4): separa «este curso
/// no comparte datos» de «este curso comparte correo y nombre», y separa «la huella
/// congela lo que la persona vio» de «el proveedor puede cambiar el curso mañana». Quien
/// responde una auditoría necesita saber cuál de las dos cosas tiene delante.
export interface PaqueteFila {
  id: number;
  version: number;
  clase: string;
  edicion: string;
  archivos: number;
  dominiosExternos: string[];
  tituloOrganizacion: string;
  zipSha256: string;
  subidoEn: string;
}

/// REQ-SIG-26 · las dos clases de curso virtual. `null` en todo lo que no es un curso.
export type ClaseCurso = 'PAQUETE' | 'ENLACE';

export interface ContenidoFila {
  id: number;
  codigo: string;
  tipo: string;
  claseCurso: ClaseCurso | null;
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
  versiones: VersionFila[];
  paquetes: PaqueteFila[];
  usos: { id: number; codigo: string; alcance: string; periodicidad: string }[];
}

const TIPO: Record<Tipo, { etiqueta: string; fondo: string; texto: string }> = {
  LECTURA: { etiqueta: 'Lectura', fondo: '#e9f0fb', texto: '#12437f' },
  VERIFICACION: { etiqueta: 'Verificación', fondo: '#fff3e6', texto: '#8a4407' },
  CAPACITACION: { etiqueta: 'Capacitación', fondo: '#e8f4ef', texto: '#0b5c44' },
  TAREA: { etiqueta: 'Tarea', fondo: '#f5f7f6', texto: '#4a544f' },
  CURSO_VIRTUAL: { etiqueta: 'Curso Virtual', fondo: '#efeafc', texto: '#4a2f9b' },
};

// Curso Virtual va DESPUES de Capacitacion y no al final: las dos son formacion, y el
// orden del renglon agrupa primero lo que se lee, despues lo que se verifica, despues lo
// que se aprende, y por ultimo lo que se hace.
const ORDEN_TIPOS: Tipo[] = ['LECTURA', 'VERIFICACION', 'CAPACITACION', 'CURSO_VIRTUAL', 'TAREA'];

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

/// REQ-SIG-26 · las dos clases de curso, con el texto que explica la CONSECUENCIA y no sólo
/// el nombre. La diferencia decide si el registro de una persona es evidencia de que hizo el
/// curso o la declaración de que lo hizo, y eso hay que leerlo antes de elegir, no después.
const CLASES_CURSO: { clase: ClaseCurso; etiqueta: string; consecuencia: string }[] = [
  {
    clase: 'PAQUETE',
    etiqueta: 'Paquete SCORM',
    consecuencia:
      'Se recorre dentro de la aplicación. El curso reporta el avance y el resultado, y la ' +
      'asignación se cierra sola.',
  },
  {
    clase: 'ENLACE',
    etiqueta: 'Enlace externo',
    consecuencia:
      'Se abre en la plataforma del proveedor. Desde acá no se ve el avance, así que al ' +
      'terminarlo la persona lo declara.',
  },
];

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
  const [claseCurso, setClaseCurso] = useState<ClaseCurso>(contenido.claseCurso ?? 'PAQUETE');
  const [items, setItems] = useState<ItemEnEdicion[]>(() => aEdicion(contenido.items));
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  // REQ-SIG-26 · D-2 · corregir el enlace de un curso NO sube la versión: es dónde está el
  // curso, no qué dice. El aviso de R10 no tiene que prometer lo contrario.
  const subiraVersion =
    contenido.usos.length > 0 &&
    !(tipo === 'CURSO_VIRTUAL' && titulo === contenido.titulo && descripcion === contenido.descripcion);

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
      }),
      // **El criterio viaja para los DOS tipos que pueden evaluar**, y va aparte de modalidad
      // y horas —que sí son sólo de la capacitación— a propósito.
      //
      // Estaba dentro del spread de CAPACITACION, así que al dibujar el campo en el curso
      // virtual se habría mostrado uno editable que descarta en silencio lo que se escribe. Un
      // campo que acepta y no guarda es peor que uno ausente: el ausente manda a preguntar, el
      // que miente deja a alguien creyendo que declaró un criterio que no existe.
      //
      // Los dos tipos alimentan la MISMA función: `veredictoDelIntento` lee `exigeEvaluacion`
      // y `notaMinima` del contenido sin mirar el tipo.
      ...((tipo === 'CAPACITACION' || tipo === 'CURSO_VIRTUAL') && {
        exigeEvaluacion,
        notaMinima: notaMinima.trim() === '' ? undefined : Number(notaMinima),
      }),
      // REQ-SIG-26 · la clase viaja siempre, y el enlace sólo cuando la clase lo usa. Mandar
      // el enlace de un curso que pasó a paquete no lo borra —el rastro de dónde estuvo se
      // conserva— pero tampoco hay que reescribirlo desde un campo que ya no se ve.
      ...(tipo === 'CURSO_VIRTUAL' && {
        claseCurso,
        ...(claseCurso === 'ENLACE' && {
          documentoNombre: docNombre.trim() || undefined,
          documentoUrl: docUrl.trim() || undefined,
        }),
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

        {/* La regla del 80 % está implementada en `lib/sig/cierre.ts` y se aplica al cerrar,
            pero quien EDITA el contenido nunca la leía: subía la nota mínima sin saber que
            con eso decide si una asignación reprobada queda abierta. */}
        {tipo === 'CAPACITACION' && (
          <div className="flex flex-col gap-2.5">
            <Regla etiqueta="Evaluación de conocimiento · PRO-TAL-04 numeral 5.3" />
            {exigeEvaluacion && notaMinima.trim() !== '' ? (
              <p
                className="rounded-tarjeta px-3 py-2.5 text-11_5 leading-relaxed [text-wrap:pretty]"
                style={{
                  background: 'var(--hf-warn-100)',
                  color: 'var(--hf-warn-text)',
                  border: '1px solid var(--hf-warn-border)',
                }}
              >
                Quien no alcance el {notaMinima} %{' '}
                <strong className="font-semibold">no cierra la asignación</strong>: se
                refuerza la información y se repite la evaluación. El intento fallido queda
                registrado con su nota; no se borra ni se sobrescribe.
              </p>
            ) : (
              // Sin evaluación exigida —o sin mínimo declarado— no hay nada que reprobar y
              // el cierre pasa. Decirlo evita que alguien suponga que el 80 % rige igual.
              <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
                Sin evaluación exigida o sin nota mínima declarada no hay nada que reprobar:
                la asistencia cierra la asignación. En cuanto se exija una nota, quien no la
                alcance deja de cerrar y el intento fallido queda registrado igual.
              </p>
            )}
          </div>
        )}

        {/* REQ-SIG-26 · el lado que faltaba. Antes esto era `tipo === 'CAPACITACION'` y un
            curso virtual no veía NUNCA el cargador: se podía crear y no publicar por
            ninguna vía, mientras el colaborador leía «avisale a quien lo publicó». */}
        {tipo === 'CURSO_VIRTUAL' && (
          <CursoVirtual
            contenido={contenido}
            clase={claseCurso}
            onClase={setClaseCurso}
            plataforma={docNombre}
            onPlataforma={setDocNombre}
            enlace={docUrl}
            onEnlace={setDocUrl}
          />
        )}

        {tipo === 'CAPACITACION' && <PaquetesScorm contenido={contenido} />}

        <Historial contenido={contenido} />

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

/// El historial de versiones del lienzo.
///
/// **Decisión: no se agrega columna para la nota de «qué cambió».** `VersionContenido` no
/// tiene ese campo y agregarlo con una migración habría dejado la nota vacía en todas las
/// filas ya escritas —y una nota vacía se lee como «no cambió nada», que es exactamente la
/// confusión entre «no sé» y «cero» que este repo no admite—. Se muestra entonces lo que el
/// modelo SÍ congela: el título de esa versión, cuándo se publicó, quién la publicó y
/// cuántos registros quedaron anclados a ella; y se dice en pantalla que la nota del cambio
/// no se está guardando, para que el hueco no se lea como una versión sin cambios.
// ──────────────────────────────────────────────────────────────────────────────
// El paquete SCORM del curso
// ──────────────────────────────────────────────────────────────────────────────

/// Subir el `.zip` y ver qué se subió.
///
/// **La advertencia va ANTES de guardar y con esas palabras** (D-1/D-4). No alcanza con
/// mostrar «DESPACHO»: la etiqueta no dice nada a quien no leyó el requerimiento, y lo que
/// hay que decir es que el correo y el nombre de cada colaborador se transmiten al tercero
/// y que la huella del paquete no congela el curso. Es la diferencia entre lo que un
/// auditor puede afirmar y lo que no.
///
/// El análisis del manifiesto lo devuelve la acción en su mensaje —edición, archivos,
/// clase y dominios—, así que no se adivina nada en el cliente: la clase se detecta al
/// analizar y se lee de la fila guardada.
function PaquetesScorm({
  contenido,
  bloqueado = false,
}: {
  contenido: ContenidoFila;
  /// REQ-SIG-26 · la clase se cambió en pantalla y todavía no se guardó. Subir ahora lo
  /// rechazaría el servidor, que sigue leyendo la clase anterior: se dice en vez de dejar
  /// que la persona elija un archivo para nada.
  bloqueado?: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [mensajeScorm, setMensajeScorm] = useState<{ ok: boolean; texto: string } | null>(null);

  const paquetes = contenido.paquetes;
  const vigente = paquetes[0] ?? null;
  const esCurso = contenido.tipo === 'CURSO_VIRTUAL';

  return (
    <div className="flex flex-col gap-2.5">
      <Regla
        etiqueta={esCurso ? 'Paquete del curso · SCORM 2004' : 'Curso SCORM 2004 · REQ-SIG-14'}
        cola={
          paquetes.length === 0
            ? 'sin paquete'
            : paquetes.length === 1
              ? '1 paquete'
              : `${paquetes.length} paquetes`
        }
      />

      {/* Que el cierre deje de ser manual no es un detalle de implementación: es lo que
          quien configura el contenido tiene que saber antes de subir el archivo. */}
      <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
        {esCurso ? 'Este curso ' : 'Con un paquete cargado, esta capacitación '}
        <strong className="font-semibold">
          {esCurso ? 'no se cierra a mano' : 'deja de cerrarse a mano'}
        </strong>
        : el formulario de asistencia y nota no aparece en la bandeja y el cierre lo hace el
        curso cuando reporta que terminó (P14). Sólo se acepta SCORM 2004 y un único SCO; un
        paquete con dos SCO se rechaza con el motivo.
      </p>

      {/* Sin paquete, el curso existe pero nadie puede hacerlo. Es el estado que produce el
          «avisale a quien lo publicó» del otro lado, y quien lo publica tiene que leerlo
          acá para saber que la pelota es suya. */}
      {esCurso && paquetes.length === 0 && (
        <p
          className="rounded-tarjeta px-3 py-2.5 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{
            background: 'var(--hf-warn-100)',
            color: 'var(--hf-warn-text)',
            border: '1px solid var(--hf-warn-border)',
          }}
        >
          Este curso todavía no tiene contenido:{' '}
          <strong className="font-semibold">nadie puede iniciarlo</strong>. Quien lo tenga
          asignado ve un aviso diciendo que avise a quien lo publicó.
        </p>
      )}

      {bloqueado && (
        <p
          className="rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
        >
          Guardá primero el cambio de clase: hasta entonces el servidor sigue teniendo este
          curso como de enlace externo y va a rechazar el paquete.
        </p>
      )}

      <form
        className="flex flex-wrap items-center gap-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const formulario = e.currentTarget as HTMLFormElement;
          const datos = new FormData(formulario);
          datos.set('contenidoId', String(contenido.id));
          setSubiendo(true);
          setMensajeScorm(null);
          const r = await subirPaqueteScorm(datos);
          setSubiendo(false);
          setMensajeScorm({ ok: r.ok, texto: r.mensaje });
          if (r.ok) formulario.reset();
        }}
      >
        <input
          type="file"
          name="archivo"
          accept=".zip"
          required
          disabled={bloqueado}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-11_5 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={subiendo || bloqueado}
          className="rounded-campo px-3.5 py-2 text-11_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {subiendo ? 'Analizando…' : vigente === null ? 'Subir paquete SCORM' : 'Reemplazar paquete'}
        </button>
      </form>

      {mensajeScorm !== null && (
        <p
          className="rounded-tarjeta px-3 py-2.5 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={
            mensajeScorm.ok
              ? { background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }
              : {
                  background: 'var(--hf-warn-100)',
                  color: 'var(--hf-warn-text)',
                  border: '1px solid var(--hf-warn-border)',
                }
          }
        >
          {mensajeScorm.texto}
        </p>
      )}

      {paquetes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-11_5">
            <thead>
              <tr className="text-left" style={{ color: 'var(--hf-text-label)' }}>
                <th className="px-2 py-1.5 font-mono text-10 font-medium uppercase">Versión</th>
                <th className="px-2 py-1.5 font-mono text-10 font-medium uppercase">Clase</th>
                <th className="px-2 py-1.5 font-mono text-10 font-medium uppercase">Edición</th>
                <th className="px-2 py-1.5 font-mono text-10 font-medium uppercase">Archivos</th>
                <th className="px-2 py-1.5 font-mono text-10 font-medium uppercase">Huella</th>
              </tr>
            </thead>
            <tbody>
              {paquetes.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--hf-border-field)' }}>
                  <td className="px-2 py-2 align-top font-mono text-10_5">v{p.version}</td>
                  <td className="px-2 py-2 align-top leading-relaxed">
                    {p.clase === 'DESPACHO' ? (
                      // Las palabras son el control, no la etiqueta. «DESPACHO» a secas no
                      // le dice a nadie que los datos de sus colaboradores salen.
                      <span style={{ color: 'var(--hf-warn-text)' }}>
                        Despacho — comparte correo y nombre con{' '}
                        {p.dominiosExternos.length === 0
                          ? 'un tercero no declarado'
                          : p.dominiosExternos.join(', ')}
                      </span>
                    ) : (
                      'Autocontenido — el contenido no sale de la aplicación'
                    )}
                  </td>
                  <td className="px-2 py-2 align-top font-mono text-10_5">{p.edicion}</td>
                  <td className="px-2 py-2 align-top font-mono text-10_5">{p.archivos}</td>
                  <td className="px-2 py-2 align-top font-mono text-10_5 leading-relaxed">
                    {p.zipSha256.slice(0, 12)}
                    {/* D-1 · en un despacho el hash cubre la cáscara de 18 KB, no el curso:
                        el proveedor puede cambiarlo mañana y la huella queda idéntica.
                        Mostrar el hash sin esa frase es publicar una evidencia que no
                        existe. */}
                    {p.clase === 'DESPACHO' && (
                      <span className="block text-10 text-muted">
                        cubre la cáscara, no el curso
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// El curso virtual · REQ-SIG-26
// ──────────────────────────────────────────────────────────────────────────────

/// Un curso virtual llega de dos maneras, y la ficha muestra **sólo la de la clase
/// declarada**. Enseñar las dos y dejar que el usuario adivine cuál gana es exactamente lo
/// que produce el curso con enlace y paquete a la vez, del que nadie sabe qué rige.
///
/// La clase se guarda al apretar «Guardar», como el resto de la ficha. El paquete NO: se
/// sube solo, en el momento, porque el zip pasa por el analizador y su resultado es una
/// conversación aparte —qué edición, cuántos archivos, si es despacho y con qué dominios—.
function CursoVirtual({
  contenido,
  clase,
  onClase,
  plataforma,
  onPlataforma,
  enlace,
  onEnlace,
}: {
  contenido: ContenidoFila;
  clase: ClaseCurso;
  onClase: (c: ClaseCurso) => void;
  plataforma: string;
  onPlataforma: (v: string) => void;
  enlace: string;
  onEnlace: (v: string) => void;
}) {
  const tienePaquete = contenido.paquetes.length > 0;
  // El cambio de clase todavía no está guardado, y decirlo evita que alguien suba un zip
  // contra un curso que el servidor sigue teniendo como de enlace —y reciba el rechazo.
  const clasePendiente = clase !== (contenido.claseCurso ?? 'PAQUETE');

  return (
    <div className="flex flex-col gap-2.5">
      <Regla
        etiqueta="Clase del curso · REQ-SIG-26"
        cola={contenido.claseCurso === null ? 'sin declarar' : undefined}
      />

      <div className="flex flex-wrap gap-2">
        {CLASES_CURSO.map((c) => {
          const activo = clase === c.clase;
          return (
            <button
              key={c.clase}
              onClick={() => onClase(c.clase)}
              aria-pressed={activo}
              className="flex max-w-[46ch] flex-col gap-1 rounded-tarjeta px-3.5 py-2.5 text-left"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
              }}
            >
              <span
                className="text-12_5 font-semibold"
                style={{ color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)' }}
              >
                {c.etiqueta}
              </span>
              <span className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
                {c.consecuencia}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cambiar de clase no borra nada, y hay que decirlo: alguien que ve desaparecer el
          campo del enlace supone que se perdió, y vuelve a pegarlo «por las dudas». */}
      {clasePendiente && (
        <p
          className="rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
        >
          La clase cambia cuando guardes, no ahora.{' '}
          <strong className="font-semibold">No se borra nada</strong>: el enlace que ya tenía
          queda guardado aunque deje de usarse, y los registros cerrados contra la clase
          anterior se siguen explicando con él.
        </p>
      )}

      {clase === 'ENLACE' ? (
        <>
          <div className="grid grid-cols-[200px_1fr] gap-3">
            <Campo etiqueta="Plataforma">
              <input
                value={plataforma}
                onChange={(e) => onPlataforma(e.target.value)}
                placeholder="Coursebox"
                className="entrada-campo"
              />
            </Campo>
            <Campo etiqueta="Enlace del curso">
              <input
                value={enlace}
                onChange={(e) => onEnlace(e.target.value)}
                placeholder="https://my.coursebox.ai/…"
                className="entrada-campo"
                style={{ color: 'var(--hf-brand-nav)' }}
              />
            </Campo>
          </div>
          <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
            Este curso se abre en la plataforma del proveedor.{' '}
            <strong className="font-semibold text-secondary">
              Desde acá no se ve el avance de nadie
            </strong>
            : no hay nota que recibir ni avance que reanudar, y al terminarlo cada persona lo
            declara. Lo que queda registrado es esa declaración, no un resultado del curso.
          </p>
          {tienePaquete && (
            // Contradicción real: el servidor deja el paquete donde está, pero lo que rige
            // pasa a ser el enlace. Un paquete escondido del que nadie sabe es peor que uno
            // nombrado.
            <p
              className="rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
              style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
            >
              Este curso además tiene {contenido.paquetes.length} paquete(s) cargado(s) de
              cuando era de clase paquete. No se borran, pero{' '}
              <strong className="font-semibold">dejan de usarse</strong>: como enlace externo
              el curso se abre afuera.
            </p>
          )}
        </>
      ) : (
        <PaquetesScorm contenido={contenido} bloqueado={clasePendiente} />
      )}
    </div>
  );
}

function Historial({ contenido }: { contenido: ContenidoFila }) {
  const versiones = contenido.versiones;

  return (
    <div className="flex flex-col gap-2.5">
      <Regla
        etiqueta="Historial de versiones"
        cola={versiones.length === 1 ? '1 versión' : `${versiones.length} versiones`}
      />

      {versiones.length === 0 ? (
        // Un contenido sin ninguna fila de versión no es uno «sin cambios»: es uno cuyo
        // primer acuse no tendría contra qué verificarse. Se avisa con los tokens de
        // faltante, no en gris.
        <p
          className="rounded-tarjeta px-3 py-2.5 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{
            background: 'var(--hf-warn-100)',
            color: 'var(--hf-warn-text)',
            border: '1px solid var(--hf-warn-border)',
          }}
        >
          Este contenido no tiene ninguna versión registrada, y eso no es lo mismo que no
          haber cambiado nunca: un acuse contra él no tendría texto congelado contra el cual
          verificarse. Guardar una edición crea la fila que falta.
        </p>
      ) : (
        versiones.map((v) => {
          const vigente = v.version === contenido.version;
          return (
            <div
              key={v.version}
              className="flex items-start gap-3 rounded-tarjeta px-3 py-2.5"
              style={{
                background: vigente ? 'var(--hf-brand-100)' : 'var(--hf-bg-subtle)',
                border: `1px solid ${vigente ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
              }}
            >
              <span
                className="w-[26px] flex-none font-mono text-11 font-semibold"
                style={{ color: vigente ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)' }}
              >
                v{v.version}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-11_5 leading-snug text-secondary">{v.titulo}</span>
                <span className="font-mono text-9 text-muted">
                  {new Date(v.publicadaEn).toLocaleDateString('es-AR')}
                  {v.publicadaPor !== null && ` · ${v.publicadaPor}`}
                </span>
              </span>
              <span
                className="flex-none font-mono text-10"
                style={{ color: vigente ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)' }}
              >
                {v.registros} registro{v.registros === 1 ? '' : 's'}
              </span>
            </div>
          );
        })
      )}

      {versiones.length > 0 && (
        <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
          Cada fila muestra el título con el que se publicó esa versión, no una nota de qué
          cambió: <strong className="font-semibold text-secondary">esa nota no se está
          guardando</strong> —el modelo no tiene dónde—, así que un renglón sin descripción
          del cambio significa que nadie la registró, no que la versión saliera igual a la
          anterior.
        </p>
      )}

      <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
        Editar sube la versión y{' '}
        <strong className="font-semibold text-secondary">no invalida nada</strong>: cada
        registro conserva la versión que su autor realizó, y por eso sigue siendo
        verificable. Volver a exigir la lectura es una acción aparte, que se decide al
        publicar.
      </p>
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
  const [claseCurso, setClaseCurso] = useState<ClaseCurso>('PAQUETE');
  // El zip del alta. Opcional: un curso se crea hoy y el proveedor entrega el paquete
  // mañana, y obligarlo acá haría que el curso no se pueda ni empezar a configurar.
  const [zip, setZip] = useState<File | null>(null);
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
      }),
      // **El criterio viaja para los DOS tipos que pueden evaluar**, y va aparte de modalidad
      // y horas —que sí son sólo de la capacitación— a propósito.
      //
      // Estaba dentro del spread de CAPACITACION, así que al dibujar el campo en el curso
      // virtual se habría mostrado uno editable que descarta en silencio lo que se escribe. Un
      // campo que acepta y no guarda es peor que uno ausente: el ausente manda a preguntar, el
      // que miente deja a alguien creyendo que declaró un criterio que no existe.
      //
      // Los dos tipos alimentan la MISMA función: `veredictoDelIntento` lee `exigeEvaluacion`
      // y `notaMinima` del contenido sin mirar el tipo.
      ...((tipo === 'CAPACITACION' || tipo === 'CURSO_VIRTUAL') && {
        exigeEvaluacion,
        notaMinima: notaMinima.trim() === '' ? undefined : Number(notaMinima),
      }),
      ...(tipo === 'CURSO_VIRTUAL' && {
        claseCurso,
        ...(claseCurso === 'ENLACE' && {
          documentoNombre: docNombre.trim() || undefined,
          documentoUrl: docUrl.trim() || undefined,
        }),
      }),
      ...(tipo === 'VERIFICACION' && {
        items: items
          .map((t) => t.trim())
          .filter((t) => t !== '')
          .map((texto) => ({ texto, obligatorio: true, permiteNoAplica: true })),
      }),
    };
    const r = await crearContenido(datos);
    if (!r.ok) {
      setOcupado(false);
      setError(r.mensaje);
      return;
    }

    // EL ALTA DE UN CURSO DE PAQUETE SON DOS PASOS, Y HAY QUE CONTARLOS COMO DOS.
    //
    // `crearContenido` emite el código; sólo entonces existe algo a qué colgarle el zip. Si
    // el paquete no pasa el análisis, **el contenido queda creado igual y no se borra**: un
    // «no se pudo crear» sería falso, y quien lo lea va a crearlo otra vez y va a terminar
    // con dos cursos. Lo que se dice es qué quedó hecho, qué no, y dónde se termina.
    if (tipo === 'CURSO_VIRTUAL' && claseCurso === 'PAQUETE' && zip !== null && r.id !== undefined) {
      const datosZip = new FormData();
      datosZip.set('contenidoId', String(r.id));
      datosZip.set('archivo', zip);
      const subida = await subirPaqueteScorm(datosZip);
      setOcupado(false);
      if (!subida.ok) {
        setError(
          `El contenido ${r.codigo} quedó creado, pero el paquete NO se aceptó: ` +
            `${subida.mensaje} · Subilo desde la ficha del curso cuando lo tengas corregido; ` +
            'no lo crees de nuevo.',
        );
        return;
      }
    }

    setOcupado(false);
    window.location.reload();
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
          <CriterioAlCrear
            exigeEvaluacion={exigeEvaluacion}
            setExigeEvaluacion={setExigeEvaluacion}
            notaMinima={notaMinima}
            setNotaMinima={setNotaMinima}
          />
        </div>
      )}

      {/* **El criterio también al crear un curso virtual.** Todo el bloque de arriba —incluido
          el criterio— colgaba de `tipo === 'CAPACITACION'`, así que un curso nacía sin forma de
          declarar qué se exige para aprobarlo y había que ir a editarlo después. Modalidad y
          horas SÍ se quedan allá: son de la capacitación presencial, y un curso en línea no
          las tiene. */}
      {tipo === 'CURSO_VIRTUAL' && (
        <div className="grid grid-cols-2 gap-3">
          <CriterioAlCrear
            exigeEvaluacion={exigeEvaluacion}
            setExigeEvaluacion={setExigeEvaluacion}
            notaMinima={notaMinima}
            setNotaMinima={setNotaMinima}
          />
        </div>
      )}

      {/* REQ-SIG-26 · lo que faltaba. Elegir «Curso Virtual» no cambiaba NADA en pantalla:
          no se podía decir si el curso era un paquete o un enlace, ni adjuntar ninguno de
          los dos, y el curso nacía imposible de completar. */}
      {tipo === 'CURSO_VIRTUAL' && (
        <div className="flex flex-col gap-2.5">
          <span className="etiqueta-campo">Cómo llega el curso</span>
          <div className="flex flex-wrap gap-2">
            {CLASES_CURSO.map((c) => {
              const activo = claseCurso === c.clase;
              return (
                <button
                  key={c.clase}
                  onClick={() => setClaseCurso(c.clase)}
                  aria-pressed={activo}
                  className="flex max-w-[46ch] flex-col gap-1 rounded-tarjeta px-3.5 py-2.5 text-left"
                  style={{
                    background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                  }}
                >
                  <span
                    className="text-12_5 font-semibold"
                    style={{
                      color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    }}
                  >
                    {c.etiqueta}
                  </span>
                  <span className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
                    {c.consecuencia}
                  </span>
                </button>
              );
            })}
          </div>

          {claseCurso === 'ENLACE' ? (
            <div className="grid grid-cols-[200px_1fr] gap-3">
              <Campo etiqueta="Plataforma">
                <input
                  value={docNombre}
                  onChange={(e) => setDocNombre(e.target.value)}
                  placeholder="Coursebox"
                  className="entrada-campo"
                />
              </Campo>
              <Campo etiqueta="Enlace del curso">
                <input
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                  placeholder="https://my.coursebox.ai/…"
                  className="entrada-campo"
                />
              </Campo>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Campo etiqueta="Paquete SCORM · opcional">
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setZip(e.target.files?.[0] ?? null)}
                  className="rounded-campo border border-border-field bg-surface px-3 py-2 text-11_5"
                />
              </Campo>
              {/* La frase es el contrato con el colaborador que después va a leer «avisale
                  a quien lo publicó». Sin ella, el curso nace vacío y nadie sabe por qué. */}
              <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
                {zip === null ? (
                  <>
                    Sin archivo, el curso{' '}
                    <strong className="font-semibold text-secondary">
                      queda creado pero nadie va a poder iniciarlo
                    </strong>{' '}
                    hasta que subas el paquete desde la ficha.
                  </>
                ) : (
                  <>
                    El archivo se analiza al crear: edición, número de SCO y dominios
                    externos. Si no pasa, el contenido queda creado igual y el paquete se
                    sube después desde la ficha.
                  </>
                )}
              </p>
            </div>
          )}
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
          <CriterioDeAprobacion
            exigeEvaluacion={exigeEvaluacion}
            setExigeEvaluacion={setExigeEvaluacion}
            notaMinima={notaMinima}
            setNotaMinima={setNotaMinima}
          />
        </div>

        {/* «Aplica a» del lienzo. Es el mismo alcance que la rama de LECTURA ya deriva de
            `usos`: quién recibe la capacitación no es un campo del contenido, sale de las
            obligaciones que lo asignan. */}
        <div className="col-span-2">
          <Campo etiqueta="Aplica a">
            <span className="entrada-campo">
              {contenido.usos.length === 0
                ? 'Sin asignar'
                : contenido.usos.map((u) => u.alcance).join(' · ')}
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

  // REQ-SIG-26 · antes este tipo caía hasta la rama de TAREA y mostraba «Evidencia · Nota y
  // anexo», que no es nada de lo que un curso virtual guarda. Lo que define a un curso es su
  // CLASE —de ella depende si el cierre es automático o declarado— y quién lo tiene asignado.
  if (tipo === 'CURSO_VIRTUAL') {
    const clase = contenido.claseCurso;
    return (
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Clase del curso">
          <span className="entrada-campo">
            {clase === 'ENLACE'
              ? 'Enlace externo · lo declara la persona'
              : clase === 'PAQUETE'
                ? 'Paquete SCORM · lo cierra el curso'
                : // Un curso sin clase no es «uno normal»: es uno que nadie puede hacer ni
                  // cerrar, y el servidor lo rechaza. Se avisa con los tokens de faltante.
                  'Sin declarar'}
          </span>
        </Campo>
        <Campo etiqueta="Aplica a">
          <span className="entrada-campo">
            {contenido.usos.length === 0
              ? 'Sin asignar'
              : contenido.usos.map((u) => u.alcance).join(' · ')}
          </span>
        </Campo>
        {/* **El criterio también acá, desde el 22/09/2026.** Se dibujaba sólo en la rama de
            CAPACITACION, y cuando REQ-SIG-24/26 separó CURSO_VIRTUAL como tipo propio el tipo
            nuevo heredó el reproductor y el veredicto **pero no el campo que los alimenta**:
            `veredictoDelIntento` lee `exigeEvaluacion` y `notaMinima` del contenido, y no
            había pantalla desde la cual ponerlos en un curso.
            Lo que producía no era que todo cerrara —el veredicto cae a lo que el SCO reporte
            en `success_status`, así que un curso que se declara reprobado no cierra— sino que
            **el criterio lo decidiera el paquete y no la organización**, contra P15. */}
        <div className="col-span-2">
          <CriterioDeAprobacion
            exigeEvaluacion={exigeEvaluacion}
            setExigeEvaluacion={setExigeEvaluacion}
            notaMinima={notaMinima}
            setNotaMinima={setNotaMinima}
          />
        </div>
      </div>
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

/// El criterio de aprobación, compartido por la capacitación y el curso virtual.
///
/// El lienzo lo llama «Criterio de aprobación» y lo muestra como «≥ 80 %». Es el mismo dato
/// que la app pedía como «Nota mínima»: se alinea el rótulo y se conserva el campo, porque
/// acá el criterio se decide, no sólo se lee.
///
/// **Es un componente y no dos bloques iguales a propósito.** Los dos tipos que pueden exigir
/// evaluación alimentan la MISMA función —`veredictoDelIntento` lee `exigeEvaluacion` y
/// `notaMinima` del contenido, sin mirar el tipo—, así que dos copias de este formulario
/// serían dos formas de declarar una sola regla. Es la lección que este repositorio ya pagó
/// con `diaDe` copiada en cinco módulos.
///
/// La nota se deshabilita mientras no se exija evaluación: un mínimo sin evaluación exigida es
/// un número que no rige, y dejarlo escribible invita a creer que sí.
function CriterioDeAprobacion({
  exigeEvaluacion,
  setExigeEvaluacion,
  notaMinima,
  setNotaMinima,
}: {
  exigeEvaluacion: boolean;
  setExigeEvaluacion: (v: boolean) => void;
  notaMinima: string;
  setNotaMinima: (v: string) => void;
}) {
  return (
    <Campo etiqueta="Criterio de aprobación">
      <span className="flex items-center gap-2.5">
        <label className="flex items-center gap-2 text-12 text-secondary">
          <input
            type="checkbox"
            checked={exigeEvaluacion}
            onChange={(e) => setExigeEvaluacion(e.target.checked)}
          />
          Exige evaluación
        </label>
        <span className="font-mono text-12 text-muted">≥</span>
        <input
          value={notaMinima}
          onChange={(e) => setNotaMinima(e.target.value)}
          inputMode="decimal"
          disabled={!exigeEvaluacion}
          aria-label="Criterio de aprobación · nota mínima"
          className="entrada-campo w-20 font-mono disabled:opacity-50"
        />
        <span className="font-mono text-12 text-muted">%</span>
      </span>
    </Campo>
  );
}

/// El criterio de aprobación en el formulario de ALTA. Mismo dato que `CriterioDeAprobacion`,
/// otra disposición: acá son dos celdas de una rejilla y allá una fila dentro de la ficha.
///
/// Se comparte entre la capacitación y el curso virtual por la misma razón que el otro: los
/// dos alimentan `veredictoDelIntento`, que lee `exigeEvaluacion` y `notaMinima` del contenido
/// sin mirar el tipo. Dos copias serían dos formas de declarar una sola regla.
function CriterioAlCrear({
  exigeEvaluacion,
  setExigeEvaluacion,
  notaMinima,
  setNotaMinima,
}: {
  exigeEvaluacion: boolean;
  setExigeEvaluacion: (v: boolean) => void;
  notaMinima: string;
  setNotaMinima: (v: string) => void;
}) {
  return (
    <>
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
      <Campo etiqueta="Criterio de aprobación">
        <input
          value={notaMinima}
          onChange={(e) => setNotaMinima(e.target.value)}
          inputMode="decimal"
          disabled={!exigeEvaluacion}
          placeholder="80"
          aria-label="Criterio de aprobación · nota mínima"
          className="entrada-campo font-mono disabled:opacity-50"
        />
      </Campo>
    </>
  );
}
