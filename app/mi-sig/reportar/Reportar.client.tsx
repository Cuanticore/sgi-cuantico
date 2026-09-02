'use client';

// app/mi-sig/reportar/Reportar.client.tsx
//
// El formulario en el idioma de quien reporta, no en el del SIG.
//
// Antes preguntaba «Origen», «Referencia del origen», «Descripción del hallazgo»,
// «Requisito incumplido (norma y numeral)» y «Evidencia objetiva». El lienzo pregunta
// «¿Qué pasó?», «¿En qué proceso?», «¿Cuándo lo detectaste?» y «¿Cómo lo supiste?», y
// arriba dice por qué: «No tienes que clasificarlo ni decidir si es una no conformidad:
// de eso se encarga el líder del SIG».
//
// El cambio más importante es lo que YA NO se pregunta. El numeral de la norma incumplido
// es exactamente el campo que hace que alguien cierre la pestaña: quien vio el problema
// casi nunca sabe contra qué requisito va, y pedírselo convierte un reporte de treinta
// segundos en una tarea de investigación. Lo llena el líder al clasificar, que es quien
// tiene el criterio — y es lo que B3 dice desde el principio.
//
// Esta es la única superficie de escritura de un Colaborador. Si acá se rinde, el sistema
// no se entera de nada.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportarHallazgo } from '@/app/sig/acciones/hallazgos';

/// Las siete formas de enterarse, en lenguaje de quien se enteró. El valor que viaja es
/// el del enum; la etiqueta es la que la persona reconoce.
const COMO: { valor: string; etiqueta: string; ayuda: string }[] = [
  { valor: 'OTRO', etiqueta: 'Lo vi trabajando', ayuda: 'En el día a día del proceso' },
  { valor: 'QUEJA', etiqueta: 'Un cliente se quejó', ayuda: 'O un proveedor, o alguien de otra área' },
  { valor: 'INDICADOR', etiqueta: 'Un indicador se salió', ayuda: 'Una cifra que no dio' },
  { valor: 'AUDITORIA_INTERNA', etiqueta: 'En una auditoría interna', ayuda: 'Durante la auditoría o revisando su informe' },
  { valor: 'AUDITORIA_EXTERNA', etiqueta: 'En una auditoría externa', ayuda: 'De un cliente o de la certificadora' },
  { valor: 'REVISION_DIRECCION', etiqueta: 'En la revisión por la dirección', ayuda: 'En el comité' },
  { valor: 'SGSI', etiqueta: 'Es de seguridad de la información', ayuda: 'Un riesgo o un control del SGSI' },
];

export default function ReportarHallazgoClient({
  correo,
  areas,
  origenInicial,
  referenciaInicial,
}: {
  correo: string;
  areas: { id: number; nombre: string }[];
  /// Precargados cuando se llega desde la pantalla que originó el hallazgo.
  origenInicial?: string | null;
  referenciaInicial?: string | null;
}) {
  const [quePaso, setQuePaso] = useState('');
  const [areaId, setAreaId] = useState('');
  const [cuando, setCuando] = useState(new Date().toISOString().slice(0, 10));
  const [como, setComo] = useState(
    COMO.some((c) => c.valor === origenInicial) ? (origenInicial as string) : '',
  );
  const [referencia, setReferencia] = useState(referenciaInicial ?? '');
  const [evidencia, setEvidencia] = useState('');
  const [yaHiciste, setYaHiciste] = useState('');
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const elegido = COMO.find((c) => c.valor === como) ?? null;
  const listo = quePaso.trim() !== '' && areaId !== '' && como !== '';

  async function enviar() {
    setEnviando(true);
    setAviso(null);
    const r = await reportarHallazgo({
      origen: (como || 'OTRO') as 'OTRO',
      origenReferencia: referencia.trim(),
      descripcion: quePaso.trim(),
      // El numeral NO se le pide a quien reporta: lo define el líder al clasificar.
      requisitoIncumplido: '',
      // Lo que la persona vio, y lo que ya hizo si hizo algo. Van juntos porque los dos
      // son lo mismo para un auditor: qué sostiene el hallazgo.
      evidenciaObjetiva: [evidencia.trim(), yaHiciste.trim() && `Ya se hizo: ${yaHiciste.trim()}`]
        .filter(Boolean)
        .join('\n'),
      areaId: Number(areaId),
      fechaDeteccion: new Date(`${cuando}T00:00:00.000Z`),
    });
    setEnviando(false);
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setTimeout(() => router.push('/mi-sig/historial'), 1600);
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <Campo etiqueta="¿Qué pasó? · obligatorio">
        <textarea
          value={quePaso}
          onChange={(e) => setQuePaso(e.target.value)}
          rows={4}
          autoFocus
          placeholder="Contá qué viste, con las palabras que usarías para explicárselo a un compañero."
          className="entrada-campo leading-relaxed"
        />
      </Campo>

      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="¿En qué proceso? · obligatorio">
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="entrada-campo"
          >
            <option value="">Elegir el proceso…</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="¿Cuándo lo detectaste?">
          <input
            type="date"
            value={cuando}
            onChange={(e) => setCuando(e.target.value)}
            className="entrada-campo font-mono"
          />
        </Campo>
      </div>

      <div className="flex flex-col gap-2">
        <span className="etiqueta-campo">¿Cómo lo supiste? · obligatorio</span>
        <div className="grid grid-cols-2 gap-2">
          {COMO.map((c) => {
            const activo = como === c.valor;
            return (
              <button
                key={c.valor}
                onClick={() => setComo(c.valor)}
                aria-pressed={activo}
                className="flex flex-col gap-0.5 rounded-campo px-3.5 py-2.5 text-left"
                style={{
                  background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                  border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                }}
              >
                <span
                  className="text-12_5"
                  style={{
                    color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-primary)',
                    fontWeight: activo ? 600 : 500,
                  }}
                >
                  {c.etiqueta}
                </span>
                <span className="text-11 text-muted">{c.ayuda}</span>
              </button>
            );
          })}
        </div>
        {elegido && (
          <Campo etiqueta="¿Tenés una referencia? · opcional">
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder={
                elegido.valor === 'INDICADOR'
                  ? 'Qué indicador y de qué mes'
                  : elegido.valor === 'SGSI'
                    ? 'El código del riesgo o del control, si lo sabés'
                    : elegido.valor === 'QUEJA'
                      ? 'Quién se quejó, o el número del caso'
                      : 'Un número, una fecha, un nombre — lo que tengas'
              }
              className="entrada-campo"
            />
          </Campo>
        )}
      </div>

      <Campo etiqueta="Evidencia · opcional pero muy útil">
        <textarea
          value={evidencia}
          onChange={(e) => setEvidencia(e.target.value)}
          rows={2}
          placeholder="Dónde está lo que viste: un correo, un archivo, una pantalla, un número de caso."
          className="entrada-campo leading-relaxed"
        />
        {/* El lienzo dibuja «Arrastra un archivo o busca en tu equipo». No se pone la zona
            de arrastre: `Evidencia` se ata a un control o a un registro de realizado, no a
            un hallazgo, así que el archivo no tendría dónde guardarse. Se dice en vez de
            aceptar un archivo que se pierde al enviar. */}
        <span className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
          Todavía no se puede adjuntar el archivo acá —el modelo no tiene dónde guardarlo—,
          así que por ahora describí dónde está. Una captura de pantalla suele bastar, y el
          líder del SIG la pide si la necesita.
        </span>
      </Campo>

      <Campo etiqueta="¿Ya hiciste algo al respecto? · opcional">
        <textarea
          value={yaHiciste}
          onChange={(e) => setYaHiciste(e.target.value)}
          rows={2}
          placeholder="Si contuviste el problema, contalo: cuenta como corrección inmediata."
          className="entrada-campo leading-relaxed"
        />
      </Campo>

      <p
        className="rounded-tarjeta px-4 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
        style={{
          background: 'var(--hf-brand-100)',
          border: '1px solid var(--hf-brand-border)',
          color: 'var(--hf-brand-nav)',
        }}
      >
        Tu reporte queda visible de inmediato, pero{' '}
        <strong className="font-semibold">no consume plazos hasta que el líder del SIG lo clasifique</strong>.
        Recibirás aviso cuando lo haga.
      </p>

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

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/mi-sig')}
          className="rounded-campo border border-border-field bg-surface px-4 py-2.5 text-12_5 font-medium text-secondary"
        >
          Cancelar
        </button>
        <button
          onClick={enviar}
          disabled={!listo || enviando}
          className="rounded-campo px-4 py-2.5 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {enviando ? 'Enviando…' : 'Enviar el reporte'}
        </button>
        <span className="text-11_5 text-muted">
          {listo ? `Se registra a tu nombre · ${correo}` : 'Faltan el qué, el proceso y el cómo.'}
        </span>
      </div>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="etiqueta-campo">{etiqueta}</span>
      {children}
    </label>
  );
}
