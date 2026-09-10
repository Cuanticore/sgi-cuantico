'use client';

// app/sig/colaboradores/[id]/Ficha.client.tsx
//
// Las tres pantallas de la spec en una: la ficha, el trámite de vinculación y el de
// desvinculación. Son la misma persona vista desde tres momentos.
//
// Dos cosas que esta pantalla tiene que hacer bien, porque las dos son fáciles de romper:
//
// **La puerta de accesos** (C3) se dibuja cerrada mientras falte cualquiera de los
// compromisos, con el conteo a la vista y los que faltan NOMBRADOS. «Faltan dos» manda a
// buscarlos.
//
// **Los pasos de la desvinculación NO se encadenan.** PRO-TAL-03: la revocación de accesos
// se ejecuta el mismo día de la terminación sin esperar a la liquidación ni al paz y salvo.
// Si la pantalla los pusiera en cascada, contradiría el procedimiento — así que todos están
// habilitados desde el principio y el orden es de lectura.

import { useState } from 'react';
import { alternarPaso } from '@/app/sig/acciones/ciclos';
import {
  ETIQUETA_GRUPO,
  OBLIGACIONES_SUBSISTENTES,
  type EstadoRevocacion,
  type GrupoPaso,
} from '@/lib/sig/ciclos';

type Vista = 'ficha' | 'vinculacion' | 'desvinculacion';

export interface PersonaFicha {
  id: number;
  nombre: string;
  correo: string;
  documentoIdentidad: string | null;
  area: string | null;
  cargo: string | null;
  tipoContrato: string | null;
  esNomina: boolean;
  tipoColaborador: string | null;
  origen: string;
  activa: boolean;
  fechaIngreso: string | null;
  fechaTerminacion: string | null;
  retiradoEn: string | null;
  telefono: string | null;
  correoPersonal: string | null;
  ciudad: string | null;
  verificacionAntecedentesEn: string | null;
}

export interface AccesoFila {
  id: number;
  perfil: string;
  sistema: string;
  desde: string;
  hasta: string | null;
  vigente: boolean;
  sinSustento: boolean;
  solicitud: string | null;
}

export interface ProgresoFila {
  grupo: GrupoPaso;
  hechos: number;
  total: number;
  pendientes: { codigo: string; texto: string }[];
}

export default function FichaClient({
  persona,
  accesos,
  activos,
  formacion,
  compromisos,
  actas,
  vinculacion,
  desvinculacion,
  personaId,
  pasos,
  avisoRevocacion,
  actasBorrado,
  registros,
}: {
  persona: PersonaFicha;
  accesos: AccesoFila[];
  /// Los activos cuyo custodio es esta PERSONA (E9), no su cargo.
  activos: { codigo: string; nombre: string; rol: string }[];
  /// Las cuatro tarjetas de competencia. El `tono` es semántico y no un color: la pantalla
  /// decide cómo se pinta, y así «no aprobado» y «sin identificar» avisan igual.
  formacion: { etiqueta: string; valor: string; nota: string; tono: 'ok' | 'aviso' | 'neutro' }[];
  compromisos: {
    puerta: { abierta: boolean; faltan: number } | null;
    exigidos: { codigo: string; titulo: string; firmado: boolean }[];
  };
  actas: {
    codigo: string;
    contenido: string;
    version: number;
    aceptadoEn: string;
    huella: string;
    /// REQ-SIG-13 · el `webUrl` del soporte publicado, o `null` si no está publicado. Sólo
    /// llega con valor cuando la publicación está confirmada por su `driveItemId`.
    sharepoint: string | null;
    /// Qué pasó con la publicación, en palabras: «publicado», «sin encolar», o la frase de
    /// `explicarFallo` que dice qué hacer.
    publicacion: string;
  }[];
  vinculacion: ProgresoFila[];
  desvinculacion: ProgresoFila[];
  personaId: number;
  pasos: {
    id: number;
    ciclo: string;
    grupo: GrupoPaso;
    codigo: string;
    texto: string;
    descripcion: string | null;
    plazo: string | null;
    fuente: string | null;
    hecho: boolean;
    /// Quién lo dio por cumplido y cuándo. `null` mientras está pendiente.
    cumplimiento: { fecha: string; por: string | null; nota: string | null } | null;
  }[];
  /// Calculado en el servidor: depende de `hoy`, y un `new Date()` en el navegador cambia
  /// el marcado entre el render y la hidratación.
  avisoRevocacion: EstadoRevocacion | null;
  actasBorrado: { fecha: string; metodo: string; activos: string[] }[];
  registros: { id: number; codigo: string; titulo: string; tipo: string; periodo: string; fechaLimite: string; cerrada: boolean }[];
}) {
  const [vista, setVista] = useState<Vista>('ficha');
  /// El paso que se está desmarcando, con su motivo. Marcar es un clic; DESMARCAR pide
  /// razón, porque afirma que un control de seguridad NO se cumplió y borra una constancia.
  const [desmarcando, setDesmarcando] = useState<number | null>(null);
  const [motivoPaso, setMotivoPaso] = useState('');
  const [pasoEnCurso, setPasoEnCurso] = useState<number | null>(null);
  const [avisoPaso, setAvisoPaso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function marcar(pasoId: number, motivo?: string) {
    setPasoEnCurso(pasoId);
    const r = await alternarPaso(personaId, pasoId, motivo);
    setPasoEnCurso(null);
    setAvisoPaso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) {
      setDesmarcando(null);
      setMotivoPaso('');
    }
  }

  const vigentes = accesos.filter((a) => a.vigente);
  const sinSustento = vigentes.filter((a) => a.sinSustento);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2.5">
            <h1 className="titulo-pagina">{persona.nombre}</h1>
            <Chip
              texto={persona.activa ? 'Activo' : 'Inactivo'}
              fondo={persona.activa ? '#e6efe9' : 'var(--hf-bg-subtle)'}
              color={persona.activa ? '#0b5c44' : 'var(--hf-text-muted)'}
            />
            {persona.tipoContrato !== null && (
              <Chip
                texto={persona.tipoContrato}
                fondo={persona.esNomina ? '#e8f4ef' : '#e9f0fb'}
                color={persona.esNomina ? '#0b5c44' : '#12437f'}
              />
            )}
          </span>
          <p className="text-12_5 text-muted">
            {persona.cargo ?? 'sin cargo'} · {persona.area ?? 'sin área'}
            {persona.fechaIngreso !== null && ` · desde el ${persona.fechaIngreso}`}
          </p>
        </div>
        <nav className="ml-auto flex flex-none gap-1.5">
          {(['ficha', 'vinculacion', 'desvinculacion'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              aria-pressed={vista === v}
              className="rounded-chip px-3.5 py-1.5 text-12 capitalize"
              style={{
                background: vista === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: vista === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: '1px solid var(--hf-border-field)',
                fontWeight: vista === v ? 600 : 500,
              }}
            >
              {v === 'ficha' ? 'Ficha' : v === 'vinculacion' ? 'Vinculación' : 'Desvinculación'}
            </button>
          ))}
        </nav>
      </header>

      {/* La puerta de accesos, visible en las tres vistas: es la condición que PRO-TAL-01
          pone con todas las letras y no debería haber que ir a buscarla. */}
      {compromisos.puerta !== null && (
        <section
          className="mt-4 flex flex-wrap items-center gap-3 rounded-tarjeta px-4 py-3"
          style={
            compromisos.puerta.abierta
              ? { background: '#e6efe9', border: '1px solid #c9e3d8' }
              : { background: 'var(--hf-warn-100)', border: '1px solid #f2b473' }
          }
        >
          <span
            className="font-mono text-15 font-semibold"
            style={{ color: compromisos.puerta.abierta ? '#0b5c44' : 'var(--hf-warn-text)' }}
          >
            {compromisos.exigidos.length - compromisos.puerta.faltan} de {compromisos.exigidos.length}
          </span>
          <span
            className="text-12_5 leading-relaxed [text-wrap:pretty]"
            style={{ color: compromisos.puerta.abierta ? '#0b5c44' : 'var(--hf-warn-text)' }}
          >
            {compromisos.puerta.abierta ? (
              <>compromisos firmados. La puerta de accesos está abierta.</>
            ) : (
              <>
                compromisos firmados. <strong className="font-semibold">Ningún acceso se habilita</strong>{' '}
                antes de suscribirlos todos (PRO-TAL-01). Faltan:{' '}
                {compromisos.exigidos.filter((c) => !c.firmado).map((c) => c.codigo).join(', ')}.
              </>
            )}
          </span>
        </section>
      )}
      {compromisos.exigidos.length === 0 && (
        <p className="mt-4 text-11_5 text-muted">
          Ningún contenido está marcado como compromiso todavía, así que no hay puerta que
          evaluar. Se marcan con «exige firma» en Contenidos.
        </p>
      )}

      {vista === 'ficha' && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Bloque titulo="Identidad y vinculación">
            <Dato etiqueta="Correo corporativo" valor={persona.correo} />
            <Dato etiqueta="Documento" valor={persona.documentoIdentidad} />
            <Dato etiqueta="Tipo de colaborador" valor={persona.tipoColaborador} />
            <Dato etiqueta="Cuenta" valor={persona.origen === 'MANUAL' ? 'sin cuenta del Directorio' : 'Directorio'} alerta={persona.origen === 'MANUAL'} />
            <Dato etiqueta="Teléfono" valor={persona.telefono} />
            <Dato etiqueta="Correo personal" valor={persona.correoPersonal} />
            <Dato etiqueta="Ciudad" valor={persona.ciudad} />
            <Dato etiqueta="Antecedentes verificados" valor={persona.verificacionAntecedentesEn} />
            {persona.retiradoEn !== null && <Dato etiqueta="Retiro" valor={persona.retiradoEn} />}
          </Bloque>

          <Bloque
            titulo="Accesos vigentes"
            derecha={`${vigentes.length} de ${accesos.length}`}
            alerta={sinSustento.length > 0 ? `${sinSustento.length} sin sustento` : null}
          >
            {accesos.length === 0 ? (
              <p className="text-11_5 text-muted">Sin accesos registrados.</p>
            ) : (
              accesos.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2 border-t border-hairline py-1.5 first:border-t-0">
                  <span className="text-12 text-primary">{a.perfil}</span>
                  <span className="font-mono text-10 text-muted">{a.sistema}</span>
                  <span className="font-mono text-10 text-faint">
                    {a.desde} → {a.hasta ?? 'vigente'}
                  </span>
                  <span className="ml-auto flex flex-none gap-1.5">
                    {a.sinSustento && (
                      <Chip texto="sin sustento" fondo="var(--hf-warn-100)" color="var(--hf-warn-text)" />
                    )}
                    {a.solicitud !== null && (
                      <span className="font-mono text-10 text-muted">{a.solicitud}</span>
                    )}
                  </span>
                </div>
              ))
            )}
            {sinSustento.length > 0 && (
              <p className="mt-1 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                Un acceso vigente sin solicitud que lo respalde es un hallazgo (O13). La
                revisión trimestral tiene que explicar por qué existe o retirarlo.
              </p>
            )}
          </Bloque>

          {/* Lo que la persona tiene en la mano. Faltaba, y es lo primero que se pregunta
              cuando alguien se va: la desvinculación exige acta de borrado seguro sobre
              estos activos, así que sin la lista el trámite se hace de memoria. */}
          <Bloque
            titulo="Activos a cargo"
            derecha={`${activos.length} ${activos.length === 1 ? 'activo' : 'activos'}`}
          >
            {activos.length === 0 ? (
              <p className="text-11_5 text-muted">
                Ninguno registrado a su nombre. No prueba que no tenga: prueba que nadie
                quedó anotado como custodio.
              </p>
            ) : (
              activos.map((a) => (
                <div
                  key={a.codigo}
                  className="flex items-center gap-2 border-t border-hairline py-1.5 first:border-t-0"
                >
                  <span className="font-mono text-10_5 text-accent">{a.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-11_5 text-secondary">
                    {a.nombre}
                  </span>
                  <span className="font-mono text-10 text-muted">{a.rol}</span>
                </div>
              ))
            )}
          </Bloque>

          {/* La competencia sale del MOTOR, no del Excel de Talento Humano. Ése es el
              punto del bloque: una sola verdad sobre cuándo se capacitó y con qué nota. */}
          <Bloque titulo="Formación y competencia">
            <div className="grid grid-cols-2 gap-2.5">
              {formacion.map((f) => (
                <div
                  key={f.etiqueta}
                  className="flex flex-col gap-1 rounded-tarjeta border border-border-field bg-app px-3 py-2.5"
                >
                  <span className="etiqueta-campo">{f.etiqueta}</span>
                  <span
                    className="text-13 font-semibold"
                    style={{
                      color:
                        f.tono === 'ok'
                          ? '#0b5c44'
                          : f.tono === 'aviso'
                            ? 'var(--hf-warn-text)'
                            : 'var(--hf-text-secondary)',
                    }}
                  >
                    {f.valor}
                  </span>
                  <span className="text-10 text-muted [text-wrap:pretty]">{f.nota}</span>
                </div>
              ))}
            </div>
          </Bloque>

          <Bloque titulo="Compromisos firmados" derecha={`${actas.length} acta(s)`}>
            {compromisos.exigidos.map((c) => (
              <div key={c.codigo} className="flex items-center gap-2 border-t border-hairline py-1.5 first:border-t-0">
                <span className="font-mono text-10_5 text-accent">{c.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-11_5 text-secondary">{c.titulo}</span>
                <Chip
                  texto={c.firmado ? 'firmado' : 'pendiente'}
                  fondo={c.firmado ? '#e6efe9' : 'var(--hf-warn-100)'}
                  color={c.firmado ? '#0b5c44' : 'var(--hf-warn-text)'}
                />
              </div>
            ))}
            {actas.map((a) => (
              <div key={a.codigo} className="mt-1 flex flex-wrap items-center gap-2 text-10_5 text-muted">
                <span className="font-mono text-accent">{a.codigo}</span>
                <span>{a.contenido} · v{a.version}</span>
                <span className="font-mono">{a.aceptadoEn}</span>
                {/* La huella recortada: cita el acta sin pegar 64 caracteres, y es lo que
                    permite verificarla contra el artefacto guardado. */}
                <span className="font-mono text-faint">huella {a.huella}…</span>
                {/* Y el artefacto que esa huella verifica. Citar la huella sin poder abrir
                    el documento deja la verificación a medias: se puede nombrar la prueba
                    y no contrastarla. */}
                <a
                  href={`/api/sig/acta?codigo=${encodeURIComponent(a.codigo)}`}
                  className="font-medium text-accent"
                >
                  descargar
                </a>
                {/* D-4/P12 · esta pantalla ya exige rol de responsable, y la carpeta «2.
                    Soportes SIG» está restringida justamente a los responsables: acá el
                    enlace a SharePoint sí se puede abrir. En `/mi-sig` NO se muestra.

                    Y nunca se afirma que algo está publicado sin el enlace que lo respalda:
                    si no hay `webUrl`, se dice el motivo en vez de callarlo. */}
                {a.sharepoint !== null ? (
                  <a
                    href={a.sharepoint}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent"
                  >
                    en SharePoint
                  </a>
                ) : (
                  <span className="text-faint" title={a.publicacion}>
                    sin publicar · {a.publicacion}
                  </span>
                )}
              </div>
            ))}
          </Bloque>

          <Bloque titulo="Últimos registros" derecha={`${registros.length}`}>
            {registros.length === 0 ? (
              <p className="text-11_5 text-muted">Sin asignaciones todavía.</p>
            ) : (
              registros.map((r) => (
                <div key={r.id} className="flex items-center gap-2 border-t border-hairline py-1.5 first:border-t-0">
                  <span className="font-mono text-10_5 text-accent">{r.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-11_5 text-secondary">{r.titulo}</span>
                  <span className="font-mono text-10 text-faint">{r.periodo}</span>
                  <Chip
                    texto={r.cerrada ? 'cerrada' : 'abierta'}
                    fondo={r.cerrada ? '#e6efe9' : 'var(--hf-bg-subtle)'}
                    color={r.cerrada ? '#0b5c44' : 'var(--hf-text-muted)'}
                  />
                </div>
              ))
            )}
          </Bloque>
        </div>
      )}

      {(vista === 'vinculacion' || vista === 'desvinculacion') && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="max-w-[100ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            {vista === 'vinculacion' ? (
              <>
                Un solo proceso para nómina y contratistas.{' '}
                <strong className="font-semibold text-secondary">
                  Lo de seguridad de la información es idéntico
                </strong>
                ; sólo cambia lo administrativo.
              </>
            ) : (
              <>
                <strong className="font-semibold text-secondary">
                  Ningún paso depende de otro.
                </strong>{' '}
                PRO-TAL-03: «la revocación de accesos se ejecuta el mismo día de la
                terminación, sin esperar a la liquidación ni al paz y salvo». Si la pantalla
                los encadenara, contradiría el procedimiento.
              </>
            )}
          </p>

          {avisoPaso && (
            <p
              className="rounded-campo px-3 py-2 text-12"
              style={
                avisoPaso.ok
                  ? { background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }
                  : { background: '#fdeeeb', color: '#a52016' }
              }
            >
              {avisoPaso.texto}
            </p>
          )}

          {(vista === 'vinculacion' ? vinculacion : desvinculacion).map((g) => (
            <section key={g.grupo} className="rounded-tarjeta border border-border-field bg-surface p-4">
              <span className="flex items-center gap-2.5">
                <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
                  {ETIQUETA_GRUPO[g.grupo]}
                </span>
                <span className="h-px flex-1 bg-hairline" />
                <span className="font-mono text-10_5 text-muted">
                  {g.hechos} de {g.total}
                </span>
              </span>
              <div className="mt-2 flex flex-col">
                {pasos
                  .filter(
                    (p) =>
                      p.ciclo === (vista === 'vinculacion' ? 'VINCULACION' : 'DESVINCULACION') &&
                      p.grupo === g.grupo &&
                      // Sólo los que aplican: el progreso ya los filtró por tipo, así que se
                      // cruza contra sus pendientes y hechos.
                      (g.pendientes.some((x) => x.codigo === p.codigo) || p.hecho),
                  )
                  .map((p) => (
                    <div key={p.id} className="flex items-start gap-2.5 border-t border-hairline py-2 first:border-t-0">
                      {/* Era un círculo decorativo. Ahora es EL control: los pasos estaban
                          sembrados, el módulo puro los resolvía y la ficha los dibujaba,
                          pero no existía forma de marcarlos —`pasoDeColaborador` no
                          aparecía en un solo archivo y la tabla tenía cero filas—, así que
                          el ingreso de un colaborador no se podía registrar. */}
                      <button
                        type="button"
                        disabled={pasoEnCurso === p.id}
                        onClick={() => {
                          setAvisoPaso(null);
                          if (p.hecho) {
                            setDesmarcando(desmarcando === p.id ? null : p.id);
                            setMotivoPaso('');
                          } else {
                            void marcar(p.id);
                          }
                        }}
                        aria-pressed={p.hecho}
                        aria-label={
                          p.hecho ? `Desmarcar ${p.codigo}` : `Marcar ${p.codigo} como cumplido`
                        }
                        title={
                          p.hecho
                            ? 'Devolver a pendiente · exige motivo'
                            : 'Marcar como cumplido'
                        }
                        className="mt-0.5 flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full font-mono text-9 font-bold transition-opacity hover:opacity-75 disabled:opacity-40"
                        style={
                          p.hecho
                            ? { background: 'var(--hf-accent-500)', color: '#ffffff' }
                            : {
                                background: 'var(--hf-bg-subtle)',
                                color: 'var(--hf-text-muted)',
                                border: '1px solid var(--hf-border-field)',
                              }
                        }
                      >
                        {pasoEnCurso === p.id ? '·' : p.hecho ? '✓' : ''}
                      </button>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className={`text-12 ${p.hecho ? 'text-muted' : 'text-primary'}`}>
                            {p.texto}
                          </span>
                          {/* El plazo del procedimiento, no una cuenta de días: PRO-TAL-03
                              fija hitos relativos entre sí. */}
                          {p.plazo !== null && (
                            <span
                              className="flex-none rounded-[4px] px-1.5 py-0.5 font-mono text-8_5 font-semibold uppercase"
                              style={{ background: 'var(--hf-bg-subtle)', color: 'var(--hf-text-muted)' }}
                            >
                              {p.plazo}
                            </span>
                          )}
                        </span>
                        {/* Qué hay que hacer. Un paso sin su descripción es una casilla que
                            se marca por costumbre. */}
                        {p.descripcion !== null && (
                          <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                            {p.descripcion}
                          </span>
                        )}
                        {p.fuente !== null && (
                          <span className="font-mono text-9_5 text-faint">{p.fuente}</span>
                        )}

                        {/* La constancia: quién y cuándo. Un paso marcado sin autor no dice
                            más que «alguien tocó una casilla», y es el primer dato que una
                            auditoría pide. */}
                        {p.cumplimiento !== null && (
                          <span className="font-mono text-9_5 text-muted">
                            {p.cumplimiento.fecha}
                            {p.cumplimiento.por === null
                              ? ' · sin autor registrado'
                              : ` · ${p.cumplimiento.por}`}
                            {p.cumplimiento.nota === null ? '' : ` · ${p.cumplimiento.nota}`}
                          </span>
                        )}

                        {desmarcando === p.id && (
                          <span className="mt-1 flex flex-col gap-1">
                            <label className="text-10_5 leading-snug text-muted [text-wrap:pretty]">
                              Devolver a pendiente afirma que este paso NO se cumplió. ¿Por qué?
                            </label>
                            <input
                              value={motivoPaso}
                              onChange={(e) => setMotivoPaso(e.target.value)}
                              placeholder="El motivo queda en la bitácora"
                              className="w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                            />
                            <span className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={pasoEnCurso === p.id || motivoPaso.trim().length < 10}
                                onClick={() => void marcar(p.id, motivoPaso)}
                                className="rounded-campo px-2.5 py-1 text-11 font-semibold text-white disabled:opacity-50"
                                style={{ background: '#a52016' }}
                              >
                                {pasoEnCurso === p.id ? 'Guardando…' : 'Desmarcar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDesmarcando(null);
                                  setMotivoPaso('');
                                }}
                                className="text-11 text-muted hover:underline"
                              >
                                Cancelar
                              </button>
                            </span>
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          ))}

          {vista === 'desvinculacion' && (
            <>
              {avisoRevocacion !== null && (
                <section
                  className="rounded-tarjeta p-4"
                  style={
                    avisoRevocacion.alDia
                      ? { background: '#f7fbf9', border: '1px solid #c9e3d8' }
                      : { background: '#fffbfa', border: '1px solid #f2cdc6' }
                  }
                >
                  <span
                    className="font-mono text-9 font-semibold uppercase tracking-[0.07em]"
                    style={{ color: avisoRevocacion.alDia ? '#0b5c44' : '#a52016' }}
                  >
                    Revocación de accesos
                  </span>
                  <p
                    className="mt-1.5 text-11_5 leading-relaxed [text-wrap:pretty]"
                    style={{ color: avisoRevocacion.alDia ? '#0b5c44' : '#a52016' }}
                  >
                    {avisoRevocacion.texto}
                  </p>
                </section>
              )}

              {vigentes.length > 0 && (
                <section
                  className="rounded-tarjeta p-4"
                  style={{ background: '#fdeeeb', border: '1px solid #f2cdc6' }}
                >
                  <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em]" style={{ color: '#a52016' }}>
                    Accesos vigentes · {vigentes.length}
                  </span>
                  <p className="mt-1.5 text-11_5 leading-relaxed" style={{ color: '#a52016' }}>
                    Siguen abiertos. La revocación va el mismo día de la terminación:{' '}
                    {vigentes.map((a) => `${a.perfil} (${a.sistema})`).join(' · ')}.
                  </p>
                </section>
              )}

              <section className="rounded-tarjeta border border-border-field bg-surface p-4">
                <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
                  Obligaciones subsistentes
                </span>
                <p className="mt-1 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                  El registro de una persona inactiva no se borra (C7), y esto es la razón:
                  siguen vivas después de la salida.
                </p>
                {OBLIGACIONES_SUBSISTENTES.map((o) => (
                  <div key={o.texto} className="mt-1.5 flex flex-wrap items-baseline gap-2 border-t border-hairline pt-1.5">
                    <span className="min-w-0 flex-1 text-11_5 text-secondary [text-wrap:pretty]">{o.texto}</span>
                    <span className="font-mono text-10 text-primary">{o.vigencia}</span>
                    <span className="font-mono text-9_5 text-faint">{o.fuente}</span>
                  </div>
                ))}
              </section>

              <section className="rounded-tarjeta border border-border-field bg-surface p-4">
                <span className="flex items-center gap-2.5">
                  <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
                    Actas de borrado seguro
                  </span>
                  <span className="h-px flex-1 bg-hairline" />
                  <span className="font-mono text-10_5 text-muted">{actasBorrado.length}</span>
                </span>
                {actasBorrado.length === 0 ? (
                  <p className="mt-1.5 text-11_5 text-muted [text-wrap:pretty]">
                    Ninguna. Sin acta, la desvinculación no está completa aunque la persona ya
                    no tenga cuenta (FOR-SIG-18 · A.8.10).
                  </p>
                ) : (
                  actasBorrado.map((x, i) => (
                    <div key={i} className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-hairline pt-1.5 text-11_5">
                      <span className="font-mono text-10_5 text-primary">{x.fecha}</span>
                      <span className="text-secondary">{x.metodo}</span>
                      <span className="font-mono text-10 text-muted">{x.activos.join(', ')}</span>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function Bloque({
  titulo,
  derecha,
  alerta,
  children,
}: {
  titulo: string;
  derecha?: string;
  alerta?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5 rounded-tarjeta border border-border-field bg-surface p-4">
      <span className="flex items-center gap-2.5">
        <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
          {titulo}
        </span>
        <span className="h-px flex-1 bg-hairline" />
        {alerta != null && (
          <span className="font-mono text-9 font-semibold uppercase" style={{ color: '#a52016' }}>
            {alerta}
          </span>
        )}
        {derecha !== undefined && <span className="font-mono text-9_5 text-muted">{derecha}</span>}
      </span>
      {children}
    </section>
  );
}

/// Un dato ausente se NOMBRA como ausente. Dejar la línea vacía no dice si el dato no
/// aplica o si nadie lo puso, y en una ficha de colaborador esa diferencia es la que decide
/// si alguien tiene que ir a buscarlo.
function Dato({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string;
  valor: string | null;
  alerta?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 border-t border-hairline py-1 first:border-t-0">
      <span className="w-[168px] flex-none text-10_5 text-muted">{etiqueta}</span>
      {valor === null || valor === '' ? (
        <span className="font-mono text-10 text-faint">sin registrar</span>
      ) : (
        <span
          className="min-w-0 flex-1 text-11_5"
          style={{ color: alerta ? 'var(--hf-warn-text)' : 'var(--hf-text-primary)' }}
        >
          {valor}
        </span>
      )}
    </div>
  );
}

function Chip({ texto, fondo, color }: { texto: string; fondo: string; color: string }) {
  return (
    <span
      className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-9 font-semibold uppercase"
      style={{ background: fondo, color }}
    >
      {texto}
    </span>
  );
}
