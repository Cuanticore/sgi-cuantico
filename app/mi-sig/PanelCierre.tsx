'use client';

// app/mi-sig/PanelCierre.tsx
//
// El panel lateral (396px) que el lienzo dibuja: un panel distinto por tipo de contenido.
// La validación vive en el servidor (R4) — acá solo se arma la petición.

import { useState } from 'react';
import type { TarjetaBandeja } from './bandeja.query';
import { cerrarAsignacion } from '@/app/sig/acciones/tareas';

export default function PanelCierre({
  tarjeta,
  alCerrar,
}: {
  tarjeta: TarjetaBandeja;
  alCerrar: () => void;
}) {
  const [versionLeida, setVersionLeida] = useState(false);
  const [asistio, setAsistio] = useState<boolean | null>(null);
  const [calificacion, setCalificacion] = useState('');
  const [respuestas, setRespuestas] = useState<Record<number, 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA'>>({});
  /// La nota de cada ítem. La columna `respuesta_item.nota` existe, la acción la acepta y
  /// la escribe, y esta pantalla nunca la pedía: un «no cumple» se registraba sin una línea
  /// que dijera qué se encontró. Ese es el dato que después alguien busca en la evidencia.
  const [notasItem, setNotasItem] = useState<Record<number, string>>({});
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const esVerificacion = tarjeta.tipo === 'VERIFICACION';

  const respondidos = tarjeta.items.filter((i) => respuestas[i.id] !== undefined).length;

  /// Los NÚMEROS de los ítems obligatorios sin responder — «03», no el id de la base. El
  /// número es lo que se ve en la pantalla, y es lo único con lo que alguien puede decir
  /// «me falta el tres».
  const obligatoriosPendientes = tarjeta.items
    .map((item, n) => ({ item, numero: String(n + 1).padStart(2, '0') }))
    .filter(({ item }) => item.obligatorio && respuestas[item.id] === undefined)
    .map(({ numero }) => numero);

  async function registrar() {
    setEnviando(true);
    setError(null);
    setMensaje(null);
    const bytes = archivo ? Array.from(new Uint8Array(await archivo.arrayBuffer())) : [];
    const resultado = await cerrarAsignacion(tarjeta.id, {
      versionLeida: tarjeta.tipo === 'LECTURA' && versionLeida ? `v${tarjeta.version}` : undefined,
      asistio: tarjeta.tipo === 'CAPACITACION' ? (asistio ?? undefined) : undefined,
      calificacion:
        tarjeta.tipo === 'CAPACITACION' && calificacion !== '' ? Number(calificacion) : undefined,
      nota: nota || undefined,
      respuestas:
        esVerificacion && Object.keys(respuestas).length > 0
          ? Object.entries(respuestas).map(([itemId, respuesta]) => ({
              itemId: Number(itemId),
              respuesta,
              nota: notasItem[Number(itemId)]?.trim() || undefined,
            }))
          : undefined,
      archivo:
        archivo && (tarjeta.tipo === 'TAREA' || tarjeta.tipo === 'CAPACITACION')
          ? { nombre: archivo.name, mime: archivo.type || 'application/octet-stream', bytes }
          : undefined,
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.mensaje);
    } else {
      setMensaje(resultado.mensaje);
      setTimeout(alCerrar, 900);
    }
  }

  // P14 · el cierre lo hace el player. Acá no hay nada que declarar, y por eso el panel
  // entero se reemplaza en vez de sólo esconder los campos: dejar el botón «Registrar»
  // llamando a `cerrarAsignacion` permitiría declararse aprobado en el curso que no se
  // abrió, que es exactamente la razón de ser del player. El servidor lo rechaza igual
  // (`app/sig/acciones/tareas.ts`), pero una pantalla que ofrece lo que el servidor niega
  // enseña a desconfiar de la pantalla.
  if (tarjeta.tipo === 'CAPACITACION' && tarjeta.tienePaqueteScorm) {
    return (
      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-[396px] flex-col overflow-y-auto bg-surface shadow-xl"
        style={{ borderLeft: '1px solid var(--hf-border-field)' }}
        aria-label="Abrir el curso"
      >
        <header
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--hf-hairline-strong)' }}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-10_5 uppercase" style={{ color: 'var(--hf-text-label)' }}>
              {ETIQUETA[tarjeta.tipo]}
            </span>
            <h2 className="truncate text-15 font-semibold text-primary">{tarjeta.titulo}</h2>
            <span className="truncate font-mono text-10 text-muted">
              {tarjeta.codigo}
              {tarjeta.procedimientoOrigen ? ` · ${tarjeta.procedimientoOrigen}` : ''}
            </span>
          </div>
          <button
            onClick={alCerrar}
            aria-label="Cerrar panel"
            className="flex-none rounded-[5px] px-2 py-1 text-15 text-muted hover:bg-app focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-5 px-5 py-5">
          <p className="text-12_5 leading-relaxed text-primary">
            Esta capacitación es un curso en línea. Se cierra sola cuando el curso reporta que
            la terminaste: no hay que registrar asistencia ni nota a mano.
          </p>
          {tarjeta.exigeEvaluacion && tarjeta.notaMinima !== null && (
            <p className="text-12 leading-relaxed text-muted">
              Se aprueba con {tarjeta.notaMinima} o más. Si el curso reporta menos, el intento
              queda registrado y la asignación sigue abierta para repetir la evaluación.
            </p>
          )}
        </div>

        <footer
          className="flex items-center gap-2 px-5 py-4"
          style={{ borderTop: '1px solid var(--hf-hairline-strong)' }}
        >
          <span className="flex-1 font-mono text-9_5 leading-relaxed text-label">
            El resultado lo reporta el curso.
          </span>
          <button
            onClick={alCerrar}
            className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-muted"
          >
            Cancelar
          </button>
          <a
            href={`/mi-sig/curso/${tarjeta.id}`}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            Abrir el curso
          </a>
        </footer>
      </aside>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-[396px] flex-col overflow-y-auto bg-surface shadow-xl"
      style={{ borderLeft: '1px solid var(--hf-border-field)' }}
      aria-label="Cerrar asignación"
    >
      <header
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--hf-hairline-strong)' }}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-10_5 uppercase" style={{ color: 'var(--hf-text-label)' }}>
            {ETIQUETA[tarjeta.tipo]}
          </span>
          <h2 className="truncate text-15 font-semibold text-primary">{tarjeta.titulo}</h2>
          {/*
            El lienzo pone acá el procedimiento de origen —«PTR-TEC-01 Protocolo de Backups ·
            mensual»— porque lo que ubica una verificación de respaldos es el protocolo del
            que sale: es ahí donde dice cómo se hace. `procedimientoOrigen` ya viajaba al
            cliente y la cabecera lo descartaba. Va con el código y en el mismo orden que la
            tarjeta de la bandeja, para que la persona reconozca lo que acaba de pulsar.
          */}
          <span className="truncate font-mono text-10 text-muted">
            {tarjeta.codigo}
            {tarjeta.procedimientoOrigen ? ` · ${tarjeta.procedimientoOrigen}` : ''}
          </span>
        </div>
        <button
          onClick={alCerrar}
          aria-label="Cerrar panel"
          className="flex-none rounded-[5px] px-2 py-1 text-15 text-muted hover:bg-app focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          ✕
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-5 py-5">
        {tarjeta.tipo === 'LECTURA' && (
          <section className="flex flex-col gap-3">
            <div
              className="flex flex-col gap-1 rounded-campo px-4 py-3"
              style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-200)' }}
            >
              {/* El rótulo dice qué es la tarjeta. Sin él, el nombre del documento y el
                  título de la asignación —que a menudo coinciden— se leen como el mismo
                  dato repetido en dos tamaños. */}
              <span className="etiqueta-campo">Documento</span>
              <span className="text-12 font-semibold" style={{ color: 'var(--hf-brand-nav)' }}>
                {tarjeta.documentoNombre ?? tarjeta.titulo}
              </span>
              <span className="font-mono text-10_5 text-muted">
                Versión {tarjeta.version}
                {tarjeta.documentoVersion ? ` · ${tarjeta.documentoVersion}` : ''}
              </span>
              {/*
                El lienzo pone «Abrir el documento →» acá, y con razón: pedirle a alguien que
                declare haber leído un documento que no puede abrir convierte el acuse en una
                formalidad. `documentoUrl` ya llegaba al cliente y nadie lo usaba.
              */}
              {tarjeta.documentoUrl && (
                <a
                  href={tarjeta.documentoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit text-12 font-semibold underline underline-offset-2"
                  style={{ color: 'var(--hf-brand-nav)' }}
                >
                  Abrir el documento →
                </a>
              )}
            </div>
            <label className="flex items-start gap-2 text-12_5 text-primary">
              <input
                type="checkbox"
                checked={versionLeida}
                onChange={(e) => setVersionLeida(e.target.checked)}
                className="mt-0.5"
              />
              Declaro haber leído la versión {tarjeta.version}
            </label>
          </section>
        )}

        {tarjeta.tipo === 'CAPACITACION' && (
          <section className="flex flex-col gap-3">
            <span className="etiqueta-campo">Asistencia</span>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setAsistio(v)}
                  aria-pressed={asistio === v}
                  className="flex-1 rounded-campo px-3 py-2 text-12_5 font-medium"
                  style={{
                    background: asistio === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    color: asistio === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    border: '1px solid var(--hf-border-field)',
                  }}
                >
                  {v ? 'Asistió' : 'No asistió'}
                </button>
              ))}
            </div>
            {asistio && tarjeta.exigeEvaluacion && (
              <div className="flex flex-col gap-1.5">
                <label className="flex flex-col gap-1">
                  {/* La nota mínima va en el RÓTULO, no en el placeholder: ahí se borraba
                      con el primer dígito, justo cuando la persona necesita saber contra
                      qué está comparando lo que escribe. Sin mínimo declarado se calla en
                      vez de rotular un guion, que se leería como «el mínimo es ninguno». */}
                  <span className="etiqueta-campo">
                    Calificación
                    {tarjeta.notaMinima !== null ? ` · mínima ${tarjeta.notaMinima}` : ''}
                  </span>
                  <input
                    type="number"
                    value={calificacion}
                    onChange={(e) => setCalificacion(e.target.value)}
                    className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                  />
                </label>
              </div>
            )}
          </section>
        )}

        {esVerificacion && (
          <section className="flex flex-col gap-3">
            {/* Cuánto falta, ANTES de pulsar. El servidor rechaza el cierre con «el ítem 47
                es obligatorio» —por id, que en pantalla no se ve—, así que quien diligencia
                se enteraba del faltante recién al fallar, y sin poder saber cuál era. */}
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="etiqueta-campo">Ítems de verificación</span>
              <span className="font-mono text-9_5 text-label">
                {respondidos} de {tarjeta.items.length} respondidos
              </span>
              {obligatoriosPendientes.length > 0 && (
                <span className="font-mono text-9_5 font-semibold" style={{ color: '#a52016' }}>
                  · falta{obligatoriosPendientes.length === 1 ? '' : 'n'} el obligatorio
                  {obligatoriosPendientes.length === 1 ? '' : 's'}{' '}
                  {obligatoriosPendientes.join(', ')}
                </span>
              )}
            </span>
            {tarjeta.items.map((item, n) => (
              <div
                key={item.id}
                className="flex flex-col gap-1.5 rounded-campo border border-border-field bg-surface p-3"
              >
                {/* El número es lo que permite decir «me falta el tres». Cuatro ítems de
                    aspecto idéntico, sin numerar, obligan a describir el texto entero para
                    señalar cuál quedó sin responder. */}
                <span className="flex items-start gap-2">
                  <span className="flex-none pt-px font-mono text-10 text-label">
                    {String(n + 1).padStart(2, '0')}
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-12_5 font-medium text-primary">{item.texto}</span>
                    {/* Obligatorio se DICE. Llegaba al cliente desde la consulta y no se
                        dibujaba, así que los ítems se veían todos iguales y el que frenaba
                        el cierre era indistinguible del que no. */}
                    {item.obligatorio && (
                      <span className="font-mono text-9 uppercase tracking-wide text-label">
                        obligatorio
                      </span>
                    )}
                  </span>
                </span>
                <div className="flex gap-1.5 pl-[22px]">
                  {(['CUMPLE', 'NO_CUMPLE', 'NO_APLICA'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setRespuestas({ ...respuestas, [item.id]: v })}
                      aria-pressed={respuestas[item.id] === v}
                      disabled={v === 'NO_APLICA' && !item.permiteNoAplica}
                      className="rounded-campo px-2.5 py-1 text-11 font-medium disabled:opacity-40"
                      style={{
                        background:
                          respuestas[item.id] === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                        color:
                          respuestas[item.id] === v
                            ? 'var(--hf-brand-nav)'
                            : 'var(--hf-text-secondary-soft)',
                        border: '1px solid var(--hf-border-field)',
                      }}
                    >
                      {v === 'CUMPLE' ? 'Cumple' : v === 'NO_CUMPLE' ? 'No cumple' : 'No aplica'}
                    </button>
                  ))}
                </div>

                {/* La nota aparece cuando ya hay respuesta: pedirla antes es pedir la
                    explicación de algo que todavía no se decidió.

                    Con «No cumple» se nombra como HALLAZGO y se avisa si está vacía. Avisa,
                    no impide: la regla de cierre no la exige (`validarCierre`), y bloquear
                    acá sería inventar en el cliente una regla que el servidor no tiene —el
                    error que este repositorio ya cometió una vez con la independencia del
                    auditor. */}
                {respuestas[item.id] !== undefined && (
                  <div className="flex flex-col gap-1 pl-[22px]">
                    <input
                      value={notasItem[item.id] ?? ''}
                      onChange={(e) => setNotasItem({ ...notasItem, [item.id]: e.target.value })}
                      placeholder={
                        respuestas[item.id] === 'NO_CUMPLE'
                          ? 'Qué se encontró'
                          : respuestas[item.id] === 'NO_APLICA'
                            ? 'Por qué no aplica'
                            : 'Nota · opcional'
                      }
                      className="w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                    />
                    {respuestas[item.id] === 'NO_CUMPLE' &&
                      (notasItem[item.id] ?? '').trim() === '' && (
                        <span className="text-10_5 leading-snug" style={{ color: '#8a4407' }}>
                          Sin nota, el «no cumple» queda registrado sin decir qué se
                          encontró.
                        </span>
                      )}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {(tarjeta.tipo === 'TAREA' || tarjeta.tipo === 'CAPACITACION') && (
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Anexo · opcional</span>
            <input
              type="file"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
            />
            {/* El lienzo nombra qué se espera: un anexo sin ejemplo se deja vacío. */}
            <span className="text-11 text-muted">
              {archivo
                ? archivo.name
                : tarjeta.tipo === 'CAPACITACION'
                  ? 'Certificado o constancia · arrastra un archivo o busca en tu equipo'
                  : 'Arrastra un archivo o busca en tu equipo'}
            </span>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">
            {tarjeta.tipo === 'TAREA' ? 'Qué se hizo' : 'Nota'}
          </span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={4}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          />
        </label>

        {error && (
          <p
            className="rounded-campo px-3 py-2 text-12"
            style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
          >
            {error}
          </p>
        )}
        {mensaje && (
          <p
            className="rounded-campo px-3 py-2 text-12"
            style={{ background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }}
          >
            {mensaje}
          </p>
        )}
      </div>

      <footer
        className="flex items-center gap-2 px-5 py-4"
        style={{ borderTop: '1px solid var(--hf-hairline-strong)' }}
      >
        {/* El lienzo pone la condición de cierre justo al lado del botón que cierra, que es
            donde se lee. La ayuda estaba repartida —dentro del panel para Lectura y
            Capacitación, en ninguna parte para Verificación y Tarea— y este borde quedaba
            vacío: quien iba a pulsar «Registrar» no tenía delante qué se le exige. */}
        <span className="flex-1 font-mono text-9_5 leading-relaxed text-label">
          {pieDelPanel(tarjeta)}
        </span>
        <button
          onClick={alCerrar}
          className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-muted"
        >
          Cancelar
        </button>
        <button
          onClick={registrar}
          disabled={enviando}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {enviando ? 'Guardando…' : 'Registrar'}
        </button>
      </footer>
    </aside>
  );
}

/// Qué se le exige a este cierre, en una línea.
///
/// Los números salen del contenido y no de la plantilla del lienzo: el lienzo dibujó «los
/// cuatro ítems» y «mínima 80» porque su muestra tenía cuatro ítems y ochenta de mínimo.
/// Copiar esas cifras convertiría la ayuda en una frase que acierta por casualidad.
function pieDelPanel(tarjeta: TarjetaBandeja): string {
  switch (tarjeta.tipo) {
    case 'LECTURA':
      return 'Queda usuario, fecha, hora y versión leída.';

    case 'VERIFICACION': {
      const obligatorios = tarjeta.items.filter((i) => i.obligatorio).length;
      if (obligatorios === 0) return 'Ningún ítem es obligatorio; responder los que apliquen.';
      if (obligatorios === tarjeta.items.length) {
        return obligatorios === 1
          ? 'El único ítem es obligatorio.'
          : `Los ${obligatorios} ítems son obligatorios.`;
      }
      return `${obligatorios} de los ${tarjeta.items.length} ítems son obligatorios.`;
    }

    case 'CAPACITACION':
      // Sin evaluación exigida no hay nada que aprobar, y sin nota mínima declarada no se
      // puede decir cuál es: en los dos casos la asistencia es lo que cierra.
      if (!tarjeta.exigeEvaluacion || tarjeta.notaMinima === null) {
        return 'Sin evaluación exigida: la asistencia cierra la capacitación.';
      }
      return `Nota mínima ${tarjeta.notaMinima} para aprobar.`;

    default:
      return 'Queda usuario, fecha y hora.';
  }
}

const ETIQUETA: Record<string, string> = {
  LECTURA: 'Lectura',
  VERIFICACION: 'Verificación',
  CAPACITACION: 'Capacitación',
  TAREA: 'Tarea',
};