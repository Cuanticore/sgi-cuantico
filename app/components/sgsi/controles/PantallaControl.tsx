'use client';

// app/components/sgsi/controles/PantallaControl.tsx
//
// Iteración 3 — el formulario del control a pantalla completa, dos columnas (58/42),
// con cabecera y franja inferior fijas como la ficha del activo.
//
// Columna izquierda — la evaluación: la escalera de madurez (L0 abajo, L5 arriba, con
// altura proporcional al salto de eficacia), los tres marcadores (inicial / actual /
// objetivo), el avance y la brecha, la descripción normativa, la justificación del SoA
// verbatim y las amenazas / acción del plan.
//
// Columna derecha — el trabajo: evidencias en un flujo cronológico único (más reciente
// arriba) con autor y fecha, filtro por tipo con contador y buscador.
//
// Persistencia: los mismos server actions que el popup (guardarMadurez, cambiarEstadoSoa,
// guardarMadurezObjetivo, agregarEvidencias, quitarEvidencia), todo dentro de la
// bitácora como siempre.

import { useRef } from 'react';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EFICACIA_POR_NIVEL, eficaciaDeNivel, esAplicable, etiquetaSoa } from '@/lib/sgsi/madurez';
import {
  agregarEvidencias,
  cambiarEstadoSoa,
  guardarMadurez,
  guardarMadurezObjetivo,
  quitarEvidencia,
  restaurarEvidencia,
  verificarEnlacesActivos,
  type TipoEvidencia,
} from '@/app/sgsi/acciones/controles';
import type { EstadoSoa } from '@/lib/sgsi/madurez';
import { crearAccionDesdeControl } from '@/app/sgsi/acciones/plan';
import { BloqueFormulas, PopupEquivalencia } from './PopupControl';
import type { ControlVista } from './ControlesMadurez';

function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/// Render de una nota con formato mínimo, SIEMPRE desde el texto guardado: no hay HTML
/// en la entrada (la action lo sanea) y el render solo interpreta los marcadores.
/// `**negrita**`, `*cursiva*`, menciones `@correo`, líneas `- ` (lista) y `> ` (cita).
function NotaRender({ texto }: { texto: string }) {
  const lineas = (texto ?? '').replace(/<[^>]*>/g, '').split('\n');
  const bloques: { tipo: 'p' | 'cita' | 'lista'; lineas: string[] }[] = [];
  for (const linea of lineas) {
    const trim = linea.trim();
    const tipo: 'p' | 'cita' | 'lista' = trim.startsWith('> ') ? 'cita' : trim.startsWith('- ') ? 'lista' : 'p';
    const utlimo = bloques[bloques.length - 1];
    if (utlimo && utlimo.tipo === tipo) utlimo.lineas.push(trim);
    else bloques.push({ tipo, lineas: [trim] });
  }
  return (
    <span className="text-11_5 text-secondary [text-wrap:pretty]">
      {bloques.map((bloque, i) => {
        const contenido = bloque.lineas.map((l, j) => (
          <span key={j}>
            {j > 0 && <br />}
            <TextoEnriquecido linea={bloque.tipo === 'lista' ? l.slice(2) : bloque.tipo === 'cita' ? l.slice(2) : l} />
          </span>
        ));
        if (bloque.tipo === 'cita') {
          return (
            <span key={i} className="block border-l-2 border-hairline-strong pl-2 text-muted">
              {contenido}
            </span>
          );
        }
        if (bloque.tipo === 'lista') {
          return (
            <span key={i} className="block">
              {bloque.lineas.map((l, j) => (
                <span key={j} className="flex gap-1.5">
                  <span className="text-faint">•</span>
                  <span>
                    <TextoEnriquecido linea={l.slice(2)} />
                  </span>
                </span>
              ))}
            </span>
          );
        }
        return <span key={i}>{contenido}</span>;
      })}
    </span>
  );
}

function TextoEnriquecido({ linea }: { linea: string }) {
  const tokens = linea.split(/(\*\*[^*]+\*\*|\*[^*]+\*|@[\w.+-]+@[\w.-]+\.[a-z]{2,})/gi);
  return (
    <>
      {tokens.map((t, i) => {
        if (/^\*\*.+\*\*$/.test(t)) return <strong key={i}>{t.slice(2, -2)}</strong>;
        if (/^\*.+\*$/.test(t)) return <em key={i}>{t.slice(1, -1)}</em>;
        if (/^@[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(t)) {
          return (
            <span key={i} className="rounded-badge bg-accent-100 px-1.5 py-0.5 font-mono text-9_5 text-accent-700">
              {t}
            </span>
          );
        }
        return <span key={i}>{t}</span>;
      })}
    </>
  );
}

const ESCALA = [
  { nivel: 0, nombre: 'Inexistente' },
  { nivel: 1, nombre: 'Inicial / ad hoc' },
  { nivel: 2, nombre: 'Reproducible pero intuitivo' },
  { nivel: 3, nombre: 'Proceso definido' },
  { nivel: 4, nombre: 'Gestionado y medible' },
  { nivel: 5, nombre: 'Optimizado' },
];

const TIPOS: { valor: TipoEvidencia; etiqueta: string }[] = [
  { valor: 'ENLACE', etiqueta: 'Enlaces' },
  { valor: 'ARCHIVO', etiqueta: 'Anexos' },
  { valor: 'NOTA', etiqueta: 'Notas' },
];

const ROJO = '#a52016';
const NARANJA = '#ef8020';
const VERDE = '#0f7a5a';

function semaforo(nivel: number | null) {
  if (nivel === null) {
    return { fg: 'var(--hf-cmm-nulo-fg)', bg: 'var(--hf-cmm-nulo-bg)', bd: 'var(--hf-cmm-nulo-bd)' };
  }
  if (nivel <= 1) {
    return { fg: 'var(--hf-cmm-rojo-fg)', bg: 'var(--hf-cmm-rojo-bg)', bd: 'var(--hf-cmm-rojo-bd)' };
  }
  if (nivel <= 3) {
    return {
      fg: 'var(--hf-cmm-naranja-fg)',
      bg: 'var(--hf-cmm-naranja-bg)',
      bd: 'var(--hf-cmm-naranja-bd)',
    };
  }
  return { fg: 'var(--hf-cmm-verde-fg)', bg: 'var(--hf-cmm-verde-bg)', bd: 'var(--hf-cmm-verde-bd)' };
}

const nivelTexto = (v: number | null) => (v === null ? '—' : `L${v}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export interface NavegacionControles {
  anterior: string | null;
  siguiente: string | null;
}

export default function PantallaControl({
  control,
  onCerrar,
  onNavegar,
  navegacion,
  puedeEditarSoa = true,
  directorio = [],
}: {
  control: ControlVista;
  onCerrar: () => void;
  onNavegar?: (codigo: string) => void;
  navegacion?: NavegacionControles;
  puedeEditarSoa?: boolean;
  directorio?: { nombre: string; correo: string }[];
}) {
  const [nivel, setNivel] = useState<number | null>(control.actual);
  const [objetivo, setObjetivo] = useState<number | null>(control.objetivo);
  const [tipo, setTipo] = useState<TipoEvidencia>('ENLACE');
  const [lote, setLote] = useState('');
  const [enlace, setEnlace] = useState('');
  const [tituloEnlace, setTituloEnlace] = useState('');
  const [motivoQuitar, setMotivoQuitar] = useState<Record<number, string>>({});
  const [verFormulas, setVerFormulas] = useState(false);
  const [verEquivalencia, setVerEquivalencia] = useState(false);
  const [soaEditado, setSoaEditado] = useState<EstadoSoa | null>(null);
  const [justificacionEditada, setJustificacionEditada] = useState(control.justificacionSoa ?? '');
  const [soaAviso, setSoaAviso] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [filtroPanel, setFiltroPanel] = useState<'todo' | TipoEvidencia>('todo');
  const [busqueda, setBusqueda] = useState('');
  const [confirmarSalto, setConfirmarSalto] = useState<number | null>(null);
  /// Subidas en curso: nombre, progreso y el XHR para poder cancelar.
  const [subidas, setSubidas] = useState<
    { id: string; nombre: string; pct: number; xhr: XMLHttpRequest | null }[]
  >([]);
  /// Resultado de la última verificación de enlaces: id → ok.
  const [enlacesVerificados, setEnlacesVerificados] = useState<Record<number, boolean>>({});
  const [verificando, setVerificando] = useState(false);
  /// Autocompletado de menciones `@`: resultado filtrado y el rango del texto a
  /// reemplazar (del `@` al cursor).
  const [sugerencias, setSugerencias] = useState<{ nombre: string; correo: string }[]>([]);
  const [mencionRango, setMencionRango] = useState<{ ini: number; fin: number } | null>(null);
  const notaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const alEscribirNota = (v: string) => {
    setLote(v);
    const pos = notaRef.current?.selectionStart ?? v.length;
    const antes = v.slice(0, pos);
    const m = /@([\w.@\s-]*)$/i.exec(antes);
    if (m) {
      const q = m[1].trim().toLowerCase();
      const filtradas = directorio
        .filter((p) => p.nombre.toLowerCase().includes(q) || p.correo.toLowerCase().includes(q))
        .slice(0, 6);
      setSugerencias(filtradas);
      setMencionRango({ ini: pos - m[0].length, fin: pos });
    } else {
      setSugerencias([]);
      setMencionRango(null);
    }
  };

  const insertarMencion = (p: { nombre: string; correo: string }) => {
    if (!mencionRango) return;
    setLote(lote.slice(0, mencionRango.ini) + `@${p.correo} ` + lote.slice(mencionRango.fin));
    setSugerencias([]);
    setMencionRango(null);
    notaRef.current?.focus();
  };

  /// Formato mínimo en la nota: `**negrita**`, `*cursiva*`, línea `-` lista, línea `>` cita.
  const envolver = (antes: string, despues: string, prefijo?: string) => {
    const t = notaRef.current;
    if (!t) return;
    const v = t.value;
    const s = t.selectionStart ?? v.length;
    const e = t.selectionEnd ?? v.length;
    const sel = v.slice(s, e);
    const nuevo = prefijo
      ? v.slice(0, s) + prefijo + (sel || '') + v.slice(e)
      : v.slice(0, s) + antes + (sel || 'texto') + despues + v.slice(e);
    setLote(nuevo);
    requestAnimationFrame(() => {
      t.focus();
      t.selectionStart = s + antes.length;
      t.selectionEnd = s + antes.length + (sel ? sel.length : 0);
    });
  };

  const correr = (op: () => Promise<{ ok: boolean; mensaje: string }>) =>
    iniciar(async () => {
      const r = await op();
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) router.refresh();
    });

  const avance = control.lineaBase !== null && nivel !== null ? nivel - control.lineaBase : null;
  const brecha = objetivo !== null && nivel !== null ? Math.max(0, objetivo - nivel) : null;
  const cambioNivel = nivel !== null && nivel !== control.actual;
  const cambioObjetivo = objetivo !== control.objetivo;
  const soaDirty = soaEditado !== null || justificacionEditada !== (control.justificacionSoa ?? '');
  const sinGuardar = (cambioNivel || cambioObjetivo || soaDirty) && !pendiente;

  const elegirNivel = (n: number) => {
    setSoaAviso(null);
    if (nivel === null) {
      setNivel(n);
      setConfirmarSalto(null);
      return;
    }
    if (Math.abs(n - nivel) > 2) {
      setConfirmarSalto(n);
      return;
    }
    setNivel(n);
  };

  const guardarMadurezActual = () => {
    if (nivel === null) return;
    correr(async () => {
      const r = await guardarMadurez([{ codigoControl: control.codigo, nivel }]);
      if (r.ok) setConfirmarSalto(null);
      return r;
    });
  };

  const evidencias = useMemo(() => {
    const lista = [...control.evidencias].sort((a, b) => {
      const la = a.creadaEn ?? '';
      const lb = b.creadaEn ?? '';
      if (la !== lb) return lb.localeCompare(la);
      return Number(b.esBase) - Number(a.esBase);
    });
    const b = busqueda.trim().toLowerCase();
    return lista.filter((e) => {
      if (filtroPanel !== 'todo' && e.tipo !== filtroPanel) return false;
      if (b && !e.texto.toLowerCase().includes(b)) return false;
      return true;
    });
  }, [control.evidencias, filtroPanel, busqueda]);

  const conteos = useMemo(() => {
    const c: Record<'todo' | TipoEvidencia, number> = { todo: control.evidencias.length, NOTA: 0, ENLACE: 0, ARCHIVO: 0 };
    for (const e of control.evidencias) c[e.tipo as 'NOTA' | 'ENLACE' | 'ARCHIVO'] += 1;
    return c;
  }, [control.evidencias]);

  const urlValida = (u: string) => {
    try {
      const p = new URL(u);
      return p.protocol === 'http:' || p.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const agregarEnlace = () => {
    const u = enlace.trim();
    if (!urlValida(u)) {
      setAviso({
        ok: false,
        texto: 'Solo se aceptan enlaces http:// o https:// — nunca javascript:. El esquema se valida antes de guardarse.',
      });
      return;
    }
    correr(async () => {
      const r = await agregarEvidencias(
        control.codigo,
        'ENLACE',
        JSON.stringify({ url: u, titulo: tituloEnlace.trim() }),
      );
      if (r.ok) {
        setEnlace('');
        setTituloEnlace('');
      }
      return r;
    });
  };

  const textoEnlace = (texto: string): { url: string; titulo: string } | null => {
    try {
      const d = JSON.parse(texto);
      if (typeof d.url === 'string') return { url: d.url, titulo: typeof d.titulo === 'string' ? d.titulo : d.url };
      return null;
    } catch {
      return null;
    }
  };

  /// Subida de anexos con XHR para progreso por archivo y cancelación. El servidor
  /// valida tipo (contenido), tamaño, hash y versión; aquí solo se muestra el avance.
  const subirUno = (file: File) => {
    const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setSubidas((s) => [...s, { id, nombre: file.name, pct: 0, xhr: null }]);
    const xhr = new XMLHttpRequest();
    setSubidas((s) => s.map((u) => (u.id === id ? { ...u, xhr } : u)));
    xhr.open('POST', '/api/sgsi/anexo');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setSubidas((s) => s.map((u) => (u.id === id ? { ...u, pct } : u)));
      }
    };
    xhr.onload = () => {
      const r = JSON.parse(xhr.responseText || '{}');
      setSubidas((s) => s.filter((u) => u.id !== id));
      if (xhr.status >= 200 && xhr.status < 300 && r.ok) {
        setAviso({ ok: true, texto: r.mensaje ?? 'Anexo subido.' });
        router.refresh();
      } else {
        setAviso({ ok: false, texto: r.mensaje ?? 'No se pudo subir el archivo.' });
      }
    };
    xhr.onerror = () => {
      setSubidas((s) => s.filter((u) => u.id !== id));
      setAviso({ ok: false, texto: `Falló la subida de ${file.name}.` });
    };
    const form = new FormData();
    form.append('file', file);
    form.append('codigoControl', control.codigo);
    xhr.send(form);
  };

  const cancelarSubida = (id: string) => {
    setSubidas((list) => {
      const objetivo = list.find((u) => u.id === id);
      objetivo?.xhr?.abort();
      return list.filter((u) => u.id !== id);
    });
  };

  const verificarEnlaces = () => {
    setVerificando(true);
    iniciar(async () => {
      try {
        const r = await verificarEnlacesActivos(control.codigo);
        if (r.ok && r.resultados) {
          setEnlacesVerificados(Object.fromEntries(r.resultados.map((x) => [x.id, x.ok])));
        }
        setAviso({ ok: r.ok, texto: r.mensaje });
      } finally {
        setVerificando(false);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label={`Formulario del control ${control.codigo}`}
    >
      {/* Cabecera fija */}
      <header className="flex items-center gap-3 border-b border-hairline-strong px-5 py-3">
        <div className="min-w-0">
          <p className="font-mono text-11 text-secondary">
            {control.codigo} · {control.dominio} · {control.capacidad}
          </p>
          <p className="truncate text-14 font-semibold text-primary">{control.nombre}</p>
        </div>
        <span
          className="rounded-badge border px-2 py-0.5 font-mono text-9_5 uppercase tracking-[0.06em]"
          style={{
            color: control.soa === 'no' ? '#8a938e' : control.soa === 'parcial' ? '#8a4407' : '#12437f',
            background: control.soa === 'no' ? '#f5f7f6' : control.soa === 'parcial' ? '#fff3e6' : '#f7f9fd',
            borderColor: control.soa === 'no' ? '#e2e6e3' : control.soa === 'parcial' ? '#f2b473' : '#d3dceb',
          }}
        >
          {etiquetaSoa(control.soa)}
        </span>
        {control.soaAlcanceAdaptado && (
          <span className="rounded-badge border border-warn-border bg-warn-100 px-2 py-0.5 font-mono text-9_5 text-warn-text">
            alcance adaptado
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {sinGuardar && <span className="font-mono text-10 text-warn-text">◆ cambios sin guardar</span>}
          <button
            onClick={onCerrar}
            className="rounded-campo border border-border-field px-3 py-1.5 text-12 text-muted hover:bg-subtle"
          >
            Cerrar
          </button>
        </div>
      </header>

      {/* Cuerpo a dos columnas: 58 / 42 */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '58% 42%' }}>
        {/* Columna izquierda — la evaluación */}
        <div className="min-w-0 overflow-y-auto p-5">
          <section className="flex flex-col gap-4">
            <EscaleraMadurez
              lineaBase={control.lineaBase}
              actual={nivel}
              objetivo={objetivo}
              parcial={control.soa === 'parcial'}
              onElegir={elegirNivel}
              confirmarSalto={confirmarSalto}
              onConfirmar={(n) => {
                setNivel(n);
                setConfirmarSalto(null);
              }}
              onCancelar={() => setConfirmarSalto(null)}
              avance={avance}
              brecha={brecha}
            />

            {/* Madurez objetivo — la decisión del Comité, guardada con su propio botón. */}
            <div className="flex flex-wrap items-end gap-3 rounded-campo border border-hairline-strong bg-surface p-3">
              <label className="flex flex-col gap-1">
                <span className="etiqueta-campo">Madurez objetivo</span>
                <select
                  value={objetivo === null ? '' : String(objetivo)}
                  onChange={(e) => setObjetivo(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-[280px] rounded-campo border border-border-field bg-surface px-2.5 py-1.5 font-mono text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                >
                  <option value="">— sin objetivo —</option>
                  {ESCALA.map((e) => (
                    <option key={e.nivel} value={e.nivel}>
                      L{e.nivel} — {e.nombre} · {pct(EFICACIA_POR_NIVEL[e.nivel])}
                    </option>
                  ))}
                </select>
              </label>
              {cambioObjetivo && (
                <button
                  onClick={() => correr(() => guardarMadurezObjetivo(control.codigo, objetivo))}
                  disabled={pendiente}
                  className="rounded-campo border border-accent-500 bg-accent-100 px-3 py-1.5 text-11_5 font-semibold text-accent-700 disabled:opacity-50"
                >
                  {pendiente ? 'Guardando…' : 'Guardar el objetivo'}
                </button>
              )}
              <p className="ml-auto font-mono text-10_5 text-faint">
                avance {avance === null ? '—' : avance > 0 ? `+${avance}` : avance < 0 ? `−${Math.abs(avance)}` : '0'} · brecha {brecha ?? '—'}
              </p>
            </div>

            {aviso && (
              <p
                className="rounded-campo border px-3 py-2 text-11_5"
                style={{
                  borderColor: aviso.ok ? 'var(--hf-accent-border)' : 'var(--hf-danger-border)',
                  background: aviso.ok ? 'var(--hf-accent-50)' : 'var(--hf-danger-bg)',
                  color: aviso.ok ? 'var(--hf-accent-800)' : 'var(--hf-danger-text)',
                }}
              >
                {aviso.texto}
              </p>
            )}

            {/* Descripción del control — texto normativo de ISO/IEC 27002:2022 */}
            <div className="rounded-campo border border-hairline-strong bg-surface p-3">
              <p className="etiqueta-campo">Descripción del control (ISO/IEC 27002:2022)</p>
              <p className="parrafo mt-1 text-12 text-secondary">
                {control.soaDescripcion ?? 'Sin descripción cargada.'}
              </p>
            </div>

            {/* Justificación del SoA — verbatim DEC-SIG-01 §7 */}
            <div
              className="rounded-campo border p-3"
              style={{
                borderColor: control.soa === 'no' ? '#e2e6e3' : control.soa === 'parcial' ? '#f2b473' : '#d3dceb',
                background: control.soa === 'no' ? '#fbfcfb' : control.soa === 'parcial' ? '#fff3e6' : '#f7f9fd',
              }}
            >
              <p
                className="etiqueta-campo"
                style={{ color: control.soa === 'no' ? '#8a938e' : control.soa === 'parcial' ? '#8a4407' : '#12437f' }}
              >
                Justificación del SoA · {etiquetaSoa(control.soa)}
              </p>
              <p className="mt-0.5 font-mono text-9_5 text-faint">
                {control.soaDocumento} v{control.soaVersion} ·{' '}
                {control.soaFecha
                  ? new Date(control.soaFecha)
                      .toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
                      .replace(/de\s/g, '')
                  : ''}{' '}
                · aprobó {control.soaAprobadoPor}
              </p>
              {control.soaAlcanceAdaptado && (
                <p className="mt-2 rounded-campo border border-warn-border bg-warn-100 p-2 text-10_5 text-warn-text">
                  DEC-SIG-01 §9: arrendar o adquirir instalaciones propias obliga a revisar
                  de inmediato el alcance de implementación de los controles del dominio A.7.
                </p>
              )}
              <p className="mt-2 text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
                {control.justificacionSoa ?? 'Sin justificación registrada.'}
              </p>
              {puedeEditarSoa && (
                <>
                  <textarea
                    value={justificacionEditada}
                    onChange={(e) => {
                      setJustificacionEditada(e.target.value);
                      setSoaAviso(null);
                    }}
                    rows={4}
                    placeholder="Texto íntegro del DEC-SIG-01, sin resumir ni reescribir…"
                    className="mt-2 w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-11_5 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                  />
                  {soaAviso && <p className="mt-1.5 text-11 text-danger-text">{soaAviso}</p>}
                  <p className="mt-1 text-10_5 text-faint">
                    Solo SIG-Seguridad edita la justificación: cada cambio va a la bitácora
                    con el motivo y deja el SoA pendiente de reaprobación (control de cambios
                    del DEC-SIG-01).
                  </p>
                  {(soaEditado !== null || justificacionEditada !== (control.justificacionSoa ?? '')) && (
                    <button
                      onClick={() =>
                        correr(async () => {
                          const r = await cambiarEstadoSoa(
                            control.codigo,
                            soaEditado ?? control.soa,
                            justificacionEditada,
                          );
                          if (r.ok) {
                            setSoaEditado(null);
                            setSoaAviso(null);
                          } else {
                            setSoaAviso(r.mensaje);
                          }
                          return r;
                        })
                      }
                      disabled={pendiente}
                      className="mt-2 rounded-campo border border-accent-500 bg-accent-100 px-3 py-1.5 text-11_5 font-semibold text-accent-700 disabled:opacity-50"
                    >
                      {pendiente ? 'Guardando…' : 'Guardar la justificación'}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Fórmula, equivalencia, amenazas y acción del plan */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setVerEquivalencia(true)}
                className="rounded-campo border border-border-field px-2.5 py-1.5 font-mono text-10_5 text-accent-700 hover:bg-accent-50"
              >
                equivalencia de niveles
              </button>
              <button
                onClick={() => setVerFormulas((v) => !v)}
                className="rounded-campo border border-border-field px-2.5 py-1.5 font-mono text-10_5 text-accent-700 hover:bg-accent-50"
              >
                {verFormulas ? 'ocultar la fórmula' : 'ver la fórmula'}
              </button>
            </div>
            {verEquivalencia && <PopupEquivalencia onCerrar={() => setVerEquivalencia(false)} />}
            {verFormulas && <BloqueFormulas nivel={nivel} control={control} />}

            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <section>
                <p className="etiqueta-campo">Amenazas que mitiga</p>
                {control.amenazas.length === 0 ? (
                  <p className="mt-1.5 text-11_5 text-faint">sin relación registrada</p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {control.amenazas.map((a) => (
                      <li key={a.codigo} className="text-11_5 leading-tight">
                        <span className="font-mono text-11 text-secondary">{a.codigo}</span>
                        <span className="block text-muted">{a.nombre}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <p className="etiqueta-campo">Acción del plan de tratamiento</p>
                {control.accion ? (
                  <div className="mt-1.5">
                    <p className="text-11_5 text-secondary">
                      <span className="font-mono">{control.accion.codigo}</span> ·{' '}
                      {control.accion.estado.toLowerCase().replace(/_/g, ' ')}
                    </p>
                    <Link
                      href="/sgsi/planes"
                      className="mt-1 inline-block font-mono text-10_5 text-accent-700 underline decoration-accent-border underline-offset-2"
                    >
                      editar la acción ↗
                    </Link>
                  </div>
                ) : (
                  <div className="mt-1.5">
                    <p className="text-11_5 text-faint">sin acción asociada</p>
                    {esAplicable(control.soa) && (
                      <button
                        onClick={() => correr(() => crearAccionDesdeControl(control.codigo))}
                        disabled={pendiente}
                        className="mt-1.5 rounded-campo border border-accent-border bg-accent-100 px-2.5 py-1 text-11_5 font-semibold text-accent-700 disabled:opacity-50"
                      >
                        + Agregarlo al plan
                      </button>
                    )}
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>

        {/* Columna derecha — evidencia y trabajo */}
        <aside className="flex min-w-0 flex-col border-l border-hairline">
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
            {(['todo', 'NOTA', 'ENLACE', 'ARCHIVO'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltroPanel(f)}
                className={`rounded-chip border px-2.5 py-1 font-mono text-9_5 uppercase tracking-[0.06em] ${
                  filtroPanel === f
                    ? 'border-accent-500 bg-accent-100 text-accent-700'
                    : 'border-border-field text-muted hover:bg-accent-50'
                }`}
              >
                {f === 'todo' ? 'Todo' : TIPOS.find((t) => t.valor === f)?.etiqueta} ·{' '}
                {conteos[f]}
              </button>
            ))}
            {Object.values(enlacesVerificados).includes(false) && (
              <span className="font-mono text-9_5 text-danger-text">◆ enlaces rotos en rojo</span>
            )}
            <button
              onClick={verificarEnlaces}
              disabled={verificando}
              title="Consulta con HEAD (timeout corto) cada enlace activo — no persiste nada"
              className="rounded-chip border border-border-field px-2.5 py-1 font-mono text-9_5 uppercase tracking-[0.06em] text-muted hover:bg-accent-50 disabled:opacity-40"
            >
              {verificando ? 'verificando…' : 'verificar enlaces'}
            </button>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="buscar en las entradas…"
              className="ml-auto w-44 rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-11_5 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {evidencias.length === 0 ? (
              <p className="text-11_5 text-faint">
                Sin evidencia en este filtro. Sin evidencia, el máximo admisible en auditoría
                es L2.
              </p>
            ) : (
              <ul className="flex flex-col">
                {evidencias.map((e) => {
                  const esEnlace = e.tipo === 'ENLACE';
                  const enlaceDatos = esEnlace ? textoEnlace(e.texto) : null;
                  const esArchivo = e.tipo === 'ARCHIVO';
                  const esImagen = esArchivo && (e.archivoMime ?? '').startsWith('image/');
                  const esPdf = esArchivo && e.archivoMime === 'application/pdf';
                  return (
                    <li
                      key={e.id}
                      className={`flex items-start justify-between gap-3 border-t border-hairline py-2.5 ${e.activo === false ? 'opacity-55' : ''}`}
                    >
                      <span className="min-w-0">
                        <span className="rounded-badge bg-subtle px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] text-muted">
                          {TIPOS.find((t) => t.valor === e.tipo)?.etiqueta ?? e.tipo}
                        </span>
                        {e.esBase && (
                          <span className="ml-2 font-mono text-9 text-faint">
                            base de la evaluación · no se retira
                          </span>
                        )}
                        {!e.activo && (
                          <span className="ml-2 font-mono text-9 text-faint">retirado</span>
                        )}
                        {esArchivo ? (
                          <span className="ml-2 text-11_5 text-secondary">
                            {e.archivoNombre ?? e.texto}
                            {e.archivoVersion !== null && e.archivoVersion > 1 && (
                              <span className="ml-1.5 font-mono text-9 text-muted">
                                v{e.archivoVersion}
                              </span>
                            )}
                            {e.archivoTamano !== null && (
                              <span className="ml-1.5 font-mono text-9 text-faint">
                                {formatoTamano(e.archivoTamano)}
                              </span>
                            )}
                            {e.archivoSha256 && (
                              <span className="ml-1.5 font-mono text-9 text-faint">
                                sha256:{e.archivoSha256.slice(0, 12)}…
                              </span>
                            )}
                            {e.activo && (
                              <span className="ml-2 flex flex-wrap gap-1.5">
                                <a
                                  href={`/api/sgsi/anexo?id=${e.id}`}
                                  className="font-mono text-10_5 text-accent-700 underline decoration-accent-border underline-offset-2"
                                >
                                  descargar
                                </a>
                                {(esImagen || esPdf) && (
                                  <a
                                    href={`/api/sgsi/anexo?id=${e.id}&inline=1`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-10_5 text-accent-700 underline decoration-accent-border underline-offset-2"
                                  >
                                    vista previa
                                  </a>
                                )}
                              </span>
                            )}
                            {esImagen && e.activo && (
                              <img
                                src={`/api/sgsi/anexo?id=${e.id}&inline=1`}
                                alt={`Miniatura de ${e.archivoNombre ?? e.texto}`}
                                loading="lazy"
                                className="mt-1.5 h-12 rounded-campo border border-hairline object-contain"
                              />
                            )}
                          </span>
                        ) : enlaceDatos ? (
                          <>
                            <a
                              href={enlaceDatos.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-11_5 text-accent-700 underline decoration-accent-border underline-offset-2"
                            >
                              {enlaceDatos.titulo || enlaceDatos.url}
                            </a>
                            <span className="ml-1.5 font-mono text-9 text-faint">
                              {new URL(enlaceDatos.url).hostname}
                            </span>
                            {enlacesVerificados[e.id] === false && (
                              <span
                                className="ml-1.5 rounded-badge border border-danger-border bg-danger-bg px-1.5 py-0.5 font-mono text-9 text-danger-text"
                                title="La verificación de enlaces no recibió respuesta"
                              >
                                ⚠ enlace roto
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="ml-2 inline-block align-top">
                            <NotaRender texto={e.texto} />
                          </span>
                        )}
                        <span className="mt-0.5 block font-mono text-9 text-faint">
                          {e.creadaPor?.split('@')[0] ?? 'sistema'}
                          {e.creadaEn
                            ? ' · ' + new Date(e.creadaEn).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) +
                              ' ' +
                              new Date(e.creadaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </span>
                      </span>
                      {!e.esBase && (
                        <span className="flex flex-none items-center gap-1.5">
                          {e.activo ? (
                            <>
                              <input
                                value={motivoQuitar[e.id] ?? ''}
                                onChange={(ev) => setMotivoQuitar((m) => ({ ...m, [e.id]: ev.target.value }))}
                                placeholder="motivo"
                                className="w-28 rounded-campo border border-border-field px-2 py-0.5 text-11 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                              />
                              <button
                                onClick={() => correr(() => quitarEvidencia(e.id, motivoQuitar[e.id] ?? ''))}
                                disabled={pendiente || !(motivoQuitar[e.id] ?? '').trim()}
                                title={!(motivoQuitar[e.id] ?? '').trim() ? 'Escribí el motivo: queda en la bitácora' : undefined}
                                className="rounded-campo border border-danger-border px-2 py-0.5 font-mono text-10 text-danger-text disabled:opacity-40"
                              >
                                quitar
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => correr(() => restaurarEvidencia(e.id))}
                              disabled={pendiente}
                              title="Deshacer la baja lógica"
                              className="rounded-campo border border-border-field px-2 py-0.5 font-mono text-10 text-accent-700 hover:bg-accent-50 disabled:opacity-40"
                            >
                              deshacer
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Compositor */}
          <div className="border-t border-hairline px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoEvidencia)}
                className="rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-12 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
              {tipo === 'ENLACE' ? (
                <>
                  <input
                    value={enlace}
                    onChange={(e) => setEnlace(e.target.value)}
                    placeholder="https://… (solo http/https)"
                    className="min-w-[180px] flex-1 rounded-campo border border-border-field bg-surface px-2.5 py-1.5 font-mono text-11 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                  />
                  <input
                    value={tituloEnlace}
                    onChange={(e) => setTituloEnlace(e.target.value)}
                    placeholder="título del enlace (opcional)"
                    className="min-w-[140px] flex-1 rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-11 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                  />
                  <button
                    onClick={agregarEnlace}
                    disabled={pendiente || !enlace.trim()}
                    className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white disabled:opacity-50"
                    style={{ background: VERDE }}
                  >
                    Agregar
                  </button>
                </>
              ) : tipo === 'ARCHIVO' ? (
                <div className="w-full">
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      for (const f of Array.from(e.dataTransfer.files)) subirUno(f);
                    }}
                    className="flex cursor-pointer flex-col items-center gap-1 rounded-campo border border-dashed border-border-field px-3 py-4 text-center hover:bg-accent-50"
                  >
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        for (const f of Array.from(e.target.files ?? [])) subirUno(f);
                        e.target.value = '';
                      }}
                    />
                    <span className="text-11_5 text-secondary">
                      Arrastrá los archivos aquí o hacé clic para elegirlos
                    </span>
                    <span className="font-mono text-9_5 text-faint">
                      PDF · ofimática (docx/xlsx/pptx) · imágenes · texto · zip — sin
                      macros ni ejecutables
                    </span>
                  </label>
                  {subidas.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {subidas.map((u) => (
                        <li key={u.id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-mono text-10_5 text-secondary">
                            {u.nombre}
                          </span>
                          <span className="h-1.5 w-28 overflow-hidden rounded-swatch bg-hairline">
                            <span
                              className="block h-full rounded-swatch bg-accent-500 transition-[width]"
                              style={{ width: `${u.pct}%` }}
                            />
                          </span>
                          <span className="w-9 text-right font-mono text-9_5 tabular-nums text-faint">
                            {u.pct}%
                          </span>
                          <button
                            onClick={() => cancelarSubida(u.id)}
                            aria-label={`Cancelar la subida de ${u.nombre}`}
                            className="rounded-campo border border-danger-border px-1.5 py-0.5 font-mono text-9 text-danger-text"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => envolver('**', '**')}
                      title="negrita"
                      className="rounded-campo border border-border-field px-2 py-1 font-mono text-10_5 font-bold text-muted hover:bg-accent-50"
                    >
                      B
                    </button>
                    <button
                      onClick={() => envolver('*', '*')}
                      title="cursiva"
                      className="rounded-campo border border-border-field px-2 py-1 font-mono text-10_5 italic text-muted hover:bg-accent-50"
                    >
                      I
                    </button>
                    <button
                      onClick={() => envolver('', '', '- ')}
                      title="lista"
                      className="rounded-campo border border-border-field px-2 py-1 font-mono text-10_5 text-muted hover:bg-accent-50"
                    >
                      • lista
                    </button>
                    <button
                      onClick={() => envolver('', '', '> ')}
                      title="cita"
                      className="rounded-campo border border-border-field px-2 py-1 font-mono text-10_5 text-muted hover:bg-accent-50"
                    >
                      ≫ cita
                    </button>
                  </div>
                  <div className="relative min-w-[220px] flex-1">
                    <textarea
                      ref={notaRef}
                      value={lote}
                      onChange={(e) => alEscribirNota(e.target.value)}
                      rows={3}
                      placeholder={'Nota… (`**negrita**`, `*cursiva*`, `- lista`, `> cita`, `@usuario` para mencionar)'}
                      className="w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 font-mono text-11_5 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                    />
                    {sugerencias.length > 0 && mencionRango && (
                      <div className="absolute left-1 top-full z-10 mt-1 w-64 overflow-hidden rounded-campo border border-border-default bg-surface shadow-lg">
                        {sugerencias.map((p) => (
                          <button
                            key={p.correo}
                            onClick={() => insertarMencion(p)}
                            className="flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-11 hover:bg-accent-50"
                          >
                            <span className="truncate font-medium text-primary">{p.nombre}</span>
                            <span className="shrink-0 font-mono text-9_5 text-faint">{p.correo}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      correr(async () => {
                        const r = await agregarEvidencias(control.codigo, 'NOTA', lote);
                        if (r.ok) setLote('');
                        return r;
                      })
                    }
                    disabled={pendiente || lote.trim() === ''}
                    className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white disabled:opacity-50"
                    style={{ background: VERDE }}
                  >
                    Agregar
                  </button>
                </>
              )}
            </div>
            <p className="mt-2 text-10_5 text-faint">
              Partido en líneas o «;» crea una entrada por fragmento. La evidencia base de la
              evaluación (c.ev) es de solo lectura y no se puede eliminar.
            </p>
          </div>
        </aside>
      </div>

      {/* Franja inferior fija */}
      <footer className="flex items-center gap-3 border-t border-hairline-strong px-5 py-2.5">
        {onNavegar && (
          <>
            <button
              onClick={() => navegacion?.anterior && onNavegar(navegacion.anterior)}
              disabled={!navegacion?.anterior}
              className="rounded-campo border border-border-field px-3 py-1.5 font-mono text-11 text-muted hover:bg-subtle disabled:opacity-40"
            >
              ‹ anterior
            </button>
            <button
              onClick={() => navegacion?.siguiente && onNavegar(navegacion.siguiente)}
              disabled={!navegacion?.siguiente}
              className="rounded-campo border border-border-field px-3 py-1.5 font-mono text-11 text-muted hover:bg-subtle disabled:opacity-40"
            >
              siguiente ›
            </button>
          </>
        )}
        <span className="ml-auto font-mono text-10 text-faint">
          {pendiente ? 'sincronizando…' : sinGuardar ? '◆ cambios sin guardar' : 'sincronizado'}
        </span>
        {esAplicable(control.soa) && (
          <button
            onClick={guardarMadurezActual}
            disabled={pendiente || !cambioNivel || nivel === null}
            title={!cambioNivel ? 'La madurez no cambió' : undefined}
            className="rounded-campo px-3.5 py-1.5 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: VERDE }}
          >
            {pendiente ? 'Guardando…' : 'Guardar la madurez'}
          </button>
        )}
        <button
          onClick={onCerrar}
          className="rounded-campo border border-border-field px-3 py-1.5 text-12 text-muted hover:bg-subtle"
        >
          Cerrar
        </button>
      </footer>
    </div>
  );
}

/// Escalera vertical de seis peldaños, L0 abajo y L5 arriba, con la altura de cada
/// peldaño proporcional al salto de eficacia (L2→L3 vale 40 puntos y L4→L5 solo 5).
function EscaleraMadurez({
  lineaBase,
  actual,
  objetivo,
  parcial,
  onElegir,
  confirmarSalto,
  onConfirmar,
  onCancelar,
  avance,
  brecha,
}: {
  lineaBase: number | null;
  actual: number | null;
  objetivo: number | null;
  parcial: boolean;
  onElegir: (n: number) => void;
  confirmarSalto: number | null;
  onConfirmar: (n: number) => void;
  onCancelar: () => void;
  avance: number | null;
  brecha: number | null;
}) {
  const alto = (n: number) => Math.max(EFICACIA_POR_NIVEL[n] * 100, 16);
  const tramo = (i: number): string | null => {
    if (lineaBase !== null && actual !== null && i >= Math.min(lineaBase, actual) && i < Math.max(lineaBase, actual)) {
      return VERDE;
    }
    if (actual !== null && objetivo !== null && i >= Math.min(actual, objetivo) && i < Math.max(actual, objetivo)) {
      return NARANJA;
    }
    return null;
  };
  const orden = [...ESCALA].sort((a, b) => b.nivel - a.nivel);

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="etiqueta-campo">Escalera de madurez</p>
        <p className="font-mono text-10 text-faint">
          peldaño actual: {actual === null ? 'por evaluar' : `L${actual}`}
          {avance !== null && ` · avance ${avance > 0 ? `+${avance}` : avance}${avance > 0 ? ' nivel' + (avance > 1 ? 'es' : '') : ''}`}
          {brecha !== null && ` · brecha ${brecha} ${brecha === 1 ? 'nivel' : 'niveles'}`}
        </p>
      </div>

      <div className="mt-2 flex flex-col gap-[3px]">
        {orden.map((e) => {
          const i = e.nivel;
          const s = semaforo(i);
          const esInicial = lineaBase === i;
          const esActual = actual === i;
          const esObjetivo = objetivo === i;
          const color = tramo(i);
          const esAviso = confirmarSalto === i;
          return (
            <div key={i} className="flex items-stretch gap-2" style={{ minHeight: alto(i), maxHeight: alto(i) }}>
              <div className="flex w-[140px] flex-none flex-col justify-center px-2">
                <span className="font-mono text-10 font-bold" style={{ color: s.fg }}>
                  L{i}
                </span>
                <span className="truncate text-10 leading-tight text-muted">{e.nombre}</span>
              </div>

              <button
                onClick={() => onElegir(i)}
                aria-label={`Calificar el control en L${i} — ${e.nombre} · ${pct(EFICACIA_POR_NIVEL[i])}`}
                className="min-w-0 flex-1 rounded-campo border px-2 py-0.5 text-left transition-colors hover:bg-accent-50 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                style={{
                  background: color ?? 'var(--hf-row-blanco)',
                  borderColor: esActual ? s.bd : esInicial ? ROJO : esObjetivo ? NARANJA : color ?? 'var(--hf-hairline-strong)',
                  borderWidth: esActual ? 2 : 1,
                  borderStyle: esObjetivo ? 'dashed' : 'solid',
                  boxShadow: esInicial ? `inset 3px 0 0 0 ${ROJO}` : undefined,
                }}
              >
                <span className="font-mono text-9_5 text-faint">{pct(EFICACIA_POR_NIVEL[i])}</span>
                {esAviso && (
                  <span className="ml-2 font-mono text-9_5 text-warn-text">
                    ¿confirmar salto L{actual ?? '—'} → L{i}?
                  </span>
                )}
              </button>

              <div className="flex w-[190px] flex-none flex-col justify-center gap-0.5">
                {esInicial && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-9_5" style={{ color: ROJO }}>
                    <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: ROJO }} />
                    inicial · GAP 2 mar 2026
                  </span>
                )}
                {esActual && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-9_5" style={{ color: s.fg }}>
                    <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s.fg }} />
                    actual · agosto de 2026
                  </span>
                )}
                {esActual && parcial && i >= 4 && (
                  <span className="font-mono text-9_5 text-warn-text">
                    ⚠ alcance adaptado: L4/L5 difíciles de sostener en auditoría
                  </span>
                )}
                {esObjetivo && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-9_5" style={{ color: NARANJA }}>
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full border"
                      style={{ borderColor: NARANJA, borderStyle: 'dashed' }}
                    />
                    objetivo aprobado
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {confirmarSalto !== null && (
        <div className="mt-3 flex items-center gap-3 rounded-campo border border-warn-border bg-warn-100 px-3 py-2">
          <p className="min-w-0 flex-1 text-11_5 text-warn-text" style={{ textWrap: 'pretty' }}>
            Pasar de {actual === null ? '«por evaluar»' : nivelTexto(actual)} a {nivelTexto(confirmarSalto)} es un salto de más de dos niveles.{' '}
            {parcial && confirmarSalto >= 4
              ? 'Un control con alcance adaptado difícilmente sostiene L4/L5 en auditoría. '
              : ''}
            ¿Confirmar?
          </p>
          <button
            onClick={() => onConfirmar(confirmarSalto)}
            className="rounded-campo border border-warn-500 bg-warn-100 px-3 py-1 text-11_5 font-semibold text-warn-text"
          >
            Confirmar
          </button>
          <button onClick={onCancelar} className="rounded-campo border border-border-field px-3 py-1 text-11_5 text-muted">
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
