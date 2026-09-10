'use client';

// app/sig/personas/PopupPersona.tsx
//
// El popup de una persona (REQ-SIG-15 §3). Cuatro pestañas, 760 px.
//
// **Reemplaza al panel lateral de reasignación**, que pasa a ser el pie de la pestaña de
// datos base: es la misma persona vista de más cerca, y tener dos superficies —un panel para
// mover pendientes y un popup para editar— obligaría a abrir una para enterarse de lo que la
// otra dice.
//
// **P2 · sin `personas:administrar` el popup abre en SOLO LECTURA.** El censo es visible para
// quien entra a la pantalla, porque «a quién le falta área» es una pregunta que también
// responde quien no edita. Un popup que se abre y no guarda es mejor que un botón que
// desaparece sin explicación.
//
// ── Lo que este popup NO hace, y es deliberado ────────────────────────────────────────────
//
//   · **No edita el nombre ni el correo** (D-1). Los manda el Directorio y
//     `planificarSincronizacion` los sobrescribe a las 05:00. Un campo editable cuyo valor se
//     revierte solo es peor que uno bloqueado: parece funcionar.
//   · **No otorga permisos con los grupos de interés** (P12). El acceso lo siguen dando —sólo—
//     los grupos del Directorio.

import { useEffect, useState } from 'react';

import Popup from '@/app/components/sgsi/Popup';
import Pestanas, { type Pestana } from '@/app/components/sgsi/Pestanas';
import {
  guardarPertenencia,
  preverPertenencia,
  type DatosPertenencia,
} from '@/app/sig/acciones/personas-edicion';
import type { PersonaFila } from './Personas.client';

export interface CatalogosDelPopup {
  areas: { id: number; nombre: string; prefijo: string }[];
  cargos: { id: number; nombre: string }[];
  tiposContrato: { id: number; nombre: string }[];
  gruposInteres: {
    id: number;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    derivado: boolean;
  }[];
}

type Seccion = 'base' | 'licencias' | 'contactos' | 'grupos';

/// El estado del formulario. Cadenas y no números porque los `select` y los `input` trabajan
/// con cadenas; la conversión ocurre una vez, al enviar.
interface Formulario {
  areaId: string;
  cargoId: string;
  areaDesde: string;
  cargoDesde: string;
  documentoIdentidad: string;
  tipoContratoId: string;
  fechaIngreso: string;
  telefono: string;
  correoPersonal: string;
  ciudad: string;
  direccion: string;
  motivo: string;
}

function desdeLaFila(p: PersonaFila): Formulario {
  return {
    areaId: p.areaId === null ? '' : String(p.areaId),
    cargoId: p.cargoId === null ? '' : String(p.cargoId),
    areaDesde: p.areaDesde ?? '',
    cargoDesde: p.cargoDesde ?? '',
    documentoIdentidad: p.documentoIdentidad ?? '',
    tipoContratoId: p.tipoContratoId === null ? '' : String(p.tipoContratoId),
    fechaIngreso: p.fechaIngreso ?? '',
    telefono: p.telefono ?? '',
    correoPersonal: p.correoPersonal ?? '',
    ciudad: p.ciudad ?? '',
    direccion: p.direccion ?? '',
    motivo: '',
  };
}

/// Cadena vacía → `null`, que es «vaciado a propósito». La acción distingue `null` de
/// `undefined` justamente para eso.
const oNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());
const idONull = (v: string): number | null => (v === '' ? null : Number(v));

function aDatos(f: Formulario): DatosPertenencia {
  return {
    areaId: idONull(f.areaId),
    cargoId: idONull(f.cargoId),
    areaDesde: oNull(f.areaDesde),
    cargoDesde: oNull(f.cargoDesde),
    documentoIdentidad: oNull(f.documentoIdentidad),
    tipoContratoId: idONull(f.tipoContratoId),
    fechaIngreso: oNull(f.fechaIngreso),
    telefono: oNull(f.telefono),
    correoPersonal: oNull(f.correoPersonal),
    ciudad: oNull(f.ciudad),
    direccion: oNull(f.direccion),
    motivo: f.motivo.trim() === '' ? undefined : f.motivo.trim(),
  };
}

export default function PopupPersona({
  persona,
  catalogos,
  administra,
  onCerrar,
  pieDeDatosBase,
}: {
  persona: PersonaFila;
  catalogos: CatalogosDelPopup;
  administra: boolean;
  onCerrar: () => void;
  /// El panel de reasignación de pendientes (R9), que pasa a ser el pie de esta pestaña en
  /// vez de vivir en una superficie propia. Lo arma quien llama, porque su acción y su estado
  /// ya viven allá.
  pieDeDatosBase: React.ReactNode;
}) {
  const [seccion, setSeccion] = useState<Seccion>('base');
  const [f, setF] = useState<Formulario>(() => desdeLaFila(persona));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frases, setFrases] = useState<string[]>([]);

  const campo = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setF((previo) => ({ ...previo, [k]: v }));

  // **P3 · la previsión bajo los dos `select`.** Se pide al servidor y no se calcula acá: la
  // cuenta la hace el mismo código que va a guardar (`calcular()`), así que el número de
  // antes no puede diferir del de después. Calcularla en el cliente sería una segunda cuenta.
  const [prevision, setPrevision] = useState<{ asignadas: number; frases: string[] } | null>(null);
  const [previendo, setPreviendo] = useState(false);

  // Los cinco campos que mueven el número, sueltos. El efecto depende de éstos y **no del
  // formulario entero**: el teléfono no genera tareas, y pedir una previsión cada vez que
  // alguien teclea una letra en la dirección serían decenas de viajes al servidor por nada.
  //
  // Se extraen como primitivas en vez de listar `f.areaId` en el arreglo de dependencias
  // porque el efecto cerraría sobre todo `f` y leería valores viejos de lo que no depende —
  // el aviso de `react-hooks/exhaustive-deps` tenía razón, y ésta es la forma de resolverlo
  // sin silenciarlo.
  const { areaId, cargoId, areaDesde, cargoDesde, fechaIngreso } = f;

  useEffect(() => {
    if (!administra) return;
    let vigente = true;
    // Se espera a que quien edita deje de tocar los selects: sin esto, cambiar de área y de
    // cargo seguido dispara dos previsiones y la primera puede contestar última.
    const t = setTimeout(() => {
      setPreviendo(true);
      // Sólo la pertenencia. Los demás campos van `undefined`, que para la acción significa
      // «el formulario no trajo esto» y no «vacíalo»: la previsión no escribe nada, pero el
      // tipo es el mismo y conviene que diga la verdad.
      void preverPertenencia(persona.id, {
        areaId: idONull(areaId),
        cargoId: idONull(cargoId),
        areaDesde: oNull(areaDesde),
        cargoDesde: oNull(cargoDesde),
        fechaIngreso: oNull(fechaIngreso),
      })
        .then((r) => {
          if (!vigente) return;
          setPrevision(r.ok ? { asignadas: r.asignadas, frases: r.frases } : null);
        })
        .finally(() => {
          if (vigente) setPreviendo(false);
        });
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [administra, persona.id, areaId, cargoId, areaDesde, cargoDesde, fechaIngreso]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    const r = await guardarPertenencia(persona.id, aDatos(f));
    setGuardando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setMensaje(r.mensaje);
    setFrases(r.frases);
  };

  const pestanas: readonly Pestana<Seccion>[] = [
    { clave: 'base', etiqueta: 'Datos base' },
    { clave: 'licencias', etiqueta: 'Licencias' },
    { clave: 'contactos', etiqueta: 'Contactos' },
    {
      clave: 'grupos',
      etiqueta: 'Grupos de interés',
      cuantos: catalogos.gruposInteres.length,
    },
  ];


  return (
    <Popup
      titulo={`${administra ? 'Editar' : 'Ver'} a ${persona.nombre}`}
      subtitulo={`${persona.correo} · ${persona.area ?? 'sin área'} · ${persona.cargo ?? 'sin cargo asignado'}`}
      ancho={760}
      onCerrar={onCerrar}
      pie={
        <>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted"
          >
            Cerrar
          </button>
          {administra && seccion === 'base' && (
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--hf-brand-nav)' }}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </>
      }
    >
      {!administra && (
        // P2 · se dice por qué no se puede editar, en vez de mostrar campos apagados sin
        // explicación. Quien lee esto necesita saber a quién pedirle el permiso.
        <p
          className="mb-3 rounded-campo border px-3 py-2 text-12"
          style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)', color: 'var(--hf-warn-text)' }}
        >
          Solo lectura: editar una persona exige el permiso <code>personas:administrar</code>,
          que da el grupo Líderes SIG del Directorio.
        </p>
      )}

      <Pestanas pestanas={pestanas} activa={seccion} onCambiar={setSeccion} nombre="persona">
        {seccion === 'base' && (
          <div className="flex flex-col gap-4">
            {/* D-1 · el nombre y el correo se muestran y NO se editan. Con la nota de por qué,
                porque un campo bloqueado sin explicación se lee como un defecto. */}
            <div className="rounded-campo border border-hairline bg-app px-3 py-2">
              <p className="text-12_5 text-primary">{persona.nombre}</p>
              <p className="text-11_5 text-muted">{persona.correo}</p>
              <p className="mt-1 text-10_5 text-faint [text-wrap:pretty]">
                El nombre y el correo los manda el Directorio Activo y la sincronización los
                sobrescribe. Editarlos acá duraría hasta las 05:00 del día siguiente.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                etiqueta="Área"
                valor={f.areaId}
                onCambiar={(v) => campo('areaId', v)}
                opciones={catalogos.areas.map((a) => ({ valor: String(a.id), texto: `${a.prefijo} · ${a.nombre}` }))}
                deshabilitado={!administra}
                vacio="Sin área"
              />
              <Campo
                etiqueta="Pertenece al área desde"
                tipo="date"
                valor={f.areaDesde}
                onCambiar={(v) => campo('areaDesde', v)}
                deshabilitado={!administra}
                nota="No es cuándo se digita: es desde cuándo pertenece. Decide qué periodos le corresponden."
              />
              <Select
                etiqueta="Cargo"
                valor={f.cargoId}
                onCambiar={(v) => campo('cargoId', v)}
                opciones={catalogos.cargos.map((c) => ({ valor: String(c.id), texto: c.nombre }))}
                deshabilitado={!administra}
                vacio="Sin cargo"
              />
              <Campo
                etiqueta="Ocupa el cargo desde"
                tipo="date"
                valor={f.cargoDesde}
                onCambiar={(v) => campo('cargoDesde', v)}
                deshabilitado={!administra}
                nota="El cargo arrastra los activos de los que es propietario."
              />
            </div>

            {/* P3 · la previsión, con su desglose. El desglose no es un adorno: «40» sin decir
                de dónde sale se lee como un error y nadie guarda. */}
            {administra && (
              <div
                className="rounded-campo border px-3 py-2"
                style={{ background: 'var(--hf-brand-100-soft)', borderColor: 'var(--hf-border-field)' }}
              >
                {previendo && <p className="text-12 text-muted">Calculando…</p>}
                {!previendo && prevision === null && (
                  <p className="text-12 text-muted">
                    Elegí área o cargo para ver cuántas tareas quedarían asignadas.
                  </p>
                )}
                {!previendo && prevision !== null && (
                  <>
                    <p className="text-12_5 font-semibold text-primary">
                      {prevision.asignadas === 0
                        ? 'Al guardar no se le asignaría ninguna tarea nueva.'
                        : `Al guardar se le asignarán ${prevision.asignadas} tarea(s)`}
                    </p>
                    {prevision.frases.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {prevision.frases.map((x) => (
                          <li key={x} className="text-11_5 text-secondary">
                            · {x}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {/* P10 · el área y el cargo se proponen desde la persona y se dice en voz
                    alta. Y cuando falta, se dice qué falta en vez de inventar un valor: el
                    prefijo del área forma el código de un activo y el código es inmutable. */}
                {f.areaId === '' && (
                  <p className="mt-1 text-11_5" style={{ color: 'var(--hf-warn-text)' }}>
                    Sin área, ninguna obligación por área le va a generar nada. Y no se puede
                    crear un activo a su nombre: el prefijo del área forma el código, que es
                    inmutable.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo
                etiqueta="Documento de identidad"
                valor={f.documentoIdentidad}
                onCambiar={(v) => campo('documentoIdentidad', v)}
                deshabilitado={!administra}
              />
              <Select
                etiqueta="Tipo de contrato"
                valor={f.tipoContratoId}
                onCambiar={(v) => campo('tipoContratoId', v)}
                opciones={catalogos.tiposContrato.map((t) => ({ valor: String(t.id), texto: t.nombre }))}
                deshabilitado={!administra}
                vacio="Sin definir"
              />
              <Campo
                etiqueta="Fecha de ingreso"
                tipo="date"
                valor={f.fechaIngreso}
                onCambiar={(v) => campo('fechaIngreso', v)}
                deshabilitado={!administra}
                nota="Es el piso de todas sus tareas: nada anterior se le genera."
              />
              <Campo
                etiqueta="Motivo (opcional)"
                valor={f.motivo}
                onCambiar={(v) => campo('motivo', v)}
                deshabilitado={!administra}
                nota="Se exige donde la decisión tiene consecuencia, no para corregir un dato."
              />
            </div>

            {error && (
              <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>
                {error}
              </p>
            )}
            {mensaje && (
              <div
                className="rounded-campo border px-3 py-2"
                style={{ background: '#e6efe9', borderColor: '#0b5c44' }}
              >
                <p className="text-12_5 font-semibold" style={{ color: '#0b5c44' }}>
                  {mensaje}
                </p>
                {frases.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {frases.map((x) => (
                      <li key={x} className="text-11_5" style={{ color: '#0b5c44' }}>
                        · {x}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* R9 · el panel de reasignación, ahora como pie de esta pestaña. */}
            <div className="border-t border-hairline-strong pt-3">{pieDeDatosBase}</div>
          </div>
        )}

        {seccion === 'licencias' && (
          <PendienteDeConstruir
            que="Las licencias del tenant"
            por="Lee dos consultas de Graph que el consentimiento vigente ya permite (D-2), y cada una degrada por separado: una lista vacía y un 403 no se ven igual nunca."
          />
        )}

        {seccion === 'contactos' && (
          <PendienteDeConstruir
            que="Los datos de contacto y los contactos de emergencia"
            por="El contacto de emergencia es dato personal de un tercero que nunca autorizó nada, así que entra al inventario de tratamientos y sólo lo ve quien administra personas."
          />
        )}

        {seccion === 'grupos' && (
          <div className="flex flex-col gap-3">
            {/* P12 · la línea que tiene que estar. */}
            <p className="text-11_5 text-muted [text-wrap:pretty]">
              Un grupo de interés <strong>no otorga ningún permiso</strong>. Sirve para dirigir
              obligaciones y para reportar; el acceso a la aplicación lo dan —sólo— los grupos
              del Directorio Activo.
            </p>
            {catalogos.gruposInteres.map((g) => (
              <div key={g.id} className="flex items-start gap-2 border-t border-hairline pt-2">
                <input
                  type="checkbox"
                  // P10 · «Todos» va marcado y deshabilitado: su pertenencia se calcula.
                  checked={g.derivado}
                  disabled
                  aria-label={g.nombre}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <p className="text-12_5 text-primary">
                    {g.nombre} <span className="font-mono text-10_5 text-faint">{g.codigo}</span>
                  </p>
                  {g.descripcion !== null && (
                    <p className="text-11 text-muted [text-wrap:pretty]">{g.descripcion}</p>
                  )}
                  {g.derivado && (
                    <p className="mt-0.5 text-10_5" style={{ color: 'var(--hf-warn-text)' }}>
                      Derivado: pertenece toda persona activa, por construcción. No se puede
                      desmarcar — quedar fuera de la concienciación es una excepción que
                      necesita justificación, no una casilla.
                    </p>
                  )}
                </div>
              </div>
            ))}
            <PendienteDeConstruir
              que="Marcar y desmarcar los grupos no derivados"
              por="Al desmarcar, los pendientes de ese grupo se listan y no se borran, igual que al cambiar de área."
            />
          </div>
        )}
      </Pestanas>
    </Popup>
  );
}

/// Lo que todavía no está, dicho con lo que va a hacer cuando esté. Un panel vacío se lee
/// como un defecto; uno que dice qué falta y por qué importa, no.
function PendienteDeConstruir({ que, por }: { que: string; por: string }) {
  return (
    <div className="rounded-campo border border-dashed border-border-field px-3 py-3">
      <p className="text-12_5 font-medium text-secondary">{que} · todavía no está construido</p>
      <p className="mt-0.5 text-11_5 text-muted [text-wrap:pretty]">{por}</p>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  onCambiar,
  tipo = 'text',
  deshabilitado = false,
  nota,
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (v: string) => void;
  tipo?: string;
  deshabilitado?: boolean;
  nota?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      <input
        type={tipo}
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => onCambiar(e.target.value)}
        className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 disabled:bg-app disabled:text-muted"
      />
      {nota !== undefined && <span className="text-10_5 text-faint [text-wrap:pretty]">{nota}</span>}
    </label>
  );
}

function Select({
  etiqueta,
  valor,
  onCambiar,
  opciones,
  vacio,
  deshabilitado = false,
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (v: string) => void;
  opciones: { valor: string; texto: string }[];
  vacio: string;
  deshabilitado?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      <select
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => onCambiar(e.target.value)}
        className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 disabled:bg-app disabled:text-muted"
      >
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}
