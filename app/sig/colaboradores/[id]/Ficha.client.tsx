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
import { ETIQUETA_GRUPO, OBLIGACIONES_SUBSISTENTES, type GrupoPaso } from '@/lib/sig/ciclos';

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
  compromisos,
  actas,
  vinculacion,
  desvinculacion,
  pasos,
  actasBorrado,
  registros,
}: {
  persona: PersonaFicha;
  accesos: AccesoFila[];
  compromisos: {
    puerta: { abierta: boolean; faltan: number } | null;
    exigidos: { codigo: string; titulo: string; firmado: boolean }[];
  };
  actas: { codigo: string; contenido: string; version: number; aceptadoEn: string; huella: string }[];
  vinculacion: ProgresoFila[];
  desvinculacion: ProgresoFila[];
  pasos: { id: number; ciclo: string; grupo: GrupoPaso; codigo: string; texto: string; fuente: string | null; hecho: boolean }[];
  actasBorrado: { fecha: string; metodo: string; activos: string[] }[];
  registros: { id: number; codigo: string; titulo: string; tipo: string; periodo: string; fechaLimite: string; cerrada: boolean }[];
}) {
  const [vista, setVista] = useState<Vista>('ficha');

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
                      <span
                        className="mt-0.5 flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full font-mono text-9 font-bold"
                        style={
                          p.hecho
                            ? { background: 'var(--hf-accent-500)', color: '#ffffff' }
                            : { background: 'var(--hf-bg-subtle)', color: 'var(--hf-text-muted)' }
                        }
                      >
                        {p.hecho ? '✓' : ''}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={`text-12 ${p.hecho ? 'text-muted' : 'text-primary'}`}>
                          {p.texto}
                        </span>
                        {p.fuente !== null && (
                          <span className="font-mono text-9_5 text-faint">{p.fuente}</span>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          ))}

          {vista === 'desvinculacion' && (
            <>
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
