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

import { useEffect, useRef, useState } from 'react';

import Popup from '@/app/components/sgsi/Popup';
import Pestanas, { type Pestana } from '@/app/components/sgsi/Pestanas';
import {
  guardarPertenencia,
  leerContactosEmergencia,
  leerGruposDePersona,
  preverPertenencia,
  type DatosPertenencia,
} from '@/app/sig/acciones/personas-edicion';
import type { ContactoPropuesto } from '@/lib/sig/contactos';
import BloqueoCuenta from './BloqueoCuenta';
import Link from 'next/link';
import { resumenDePersona, type ResumenDePersona } from '@/app/sig/acciones/persona-resumen';
import {
  formacionDePersona,
  pendientesDePersona,
  type FilaFormacion,
  type PendienteDePersona,
} from '@/app/sig/acciones/persona-actividad';
import AsociarPc from './AsociarPc';
import LicenciasPersona from './LicenciasPersona';
import PendientesPersona from './PendientesPersona';
import FormacionPersona from './FormacionPersona';
import type { PersonaFila } from './Personas.client';

/// Un contenido que se le puede asignar a alguien a mano. Viaja en los catálogos —una vez por
/// pantalla, no una por fila— porque el `select` de asignar lo necesita entero y son unas
/// pocas decenas de filas.
export interface ContenidoAsignable {
  id: number;
  codigo: string;
  titulo: string;
  tipo: string;
  claseCurso: string | null;
  notaMinima: number | null;
}

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
  contenidos: ContenidoAsignable[];
}

/// Las pestañas del popup. Se exporta porque la tabla decide en cuál abrir: el nombre lleva
/// a Datos base y el botón de la columna a Pendientes, y esa elección tiene que ser un valor
/// tipado y no una cadena suelta que mañana no coincida con ninguna pestaña.
export type SeccionDelPopup =
  | 'resumen'
  | 'base'
  | 'pendientes'
  | 'formacion'
  | 'licencias'
  | 'contactos'
  | 'grupos'
  | 'cuenta';

type Seccion = SeccionDelPopup;

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

/// **P9.3 · los contactos NO están en `PersonaFila`.** Son dato personal de un tercero y no
/// pueden viajar en el payload del censo, que llega al navegador de cualquiera que abra la
/// pantalla. Se piden con `leerContactosEmergencia` al abrir la pestaña, y hasta que llegan
/// esto vale `null` — que es «todavía no se sabe», distinto de «no tiene ninguno».
type Contactos = ContactoPropuesto[] | null;

const FILA_VACIA: ContactoPropuesto = { nombre: '', parentesco: '', telefono: '' };

/// Los ids de los grupos de interés marcados, o `null` mientras no se sabe. **No están en
/// `PersonaFila` a propósito**: el censo son 90 filas que viajan enteras al navegador, y
/// sumarle a cada una sus membresías infla ese payload por un dato que sólo mira quien abre la
/// pestaña Grupos de una persona. Se piden con `leerGruposDePersona` al abrir la pestaña.
type Grupos = number[] | null;

/// `contactos` y `grupos` van `undefined` en la previsión y cuando la pestaña nunca se abrió:
/// la acción lee esa ausencia como «el formulario no trajo la lista», no como «vaciala».
function aDatos(f: Formulario, contactos: Contactos, grupos: Grupos): DatosPertenencia {
  return {
    ...(contactos !== null && { contactosEmergencia: contactos }),
    ...(grupos !== null && { gruposInteres: grupos }),
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
  bloqueoDisponible,
  onCerrar,
  seccionInicial = 'base',
  destinos,
}: {
  persona: PersonaFila;
  catalogos: CatalogosDelPopup;
  administra: boolean;
  /// **P25 · si esto es `false`, la pestaña Cuenta no existe en el DOM.** Lo decide el
  /// servidor: hace falta el permiso `personas:bloquear` Y que `GRAPH_BLOQUEO_HABILITADO`
  /// esté en «true», y la variable no se puede leer desde el navegador. No se dibuja
  /// deshabilitada — un botón que existe y responde 403 se lee como que la aplicación está
  /// rota, y alguien va a probarlo con tres personas distintas antes de concluirlo.
  bloqueoDisponible: boolean;
  onCerrar: () => void;
  /// En qué pestaña abre. La columna Pendientes manda `'pendientes'`, porque quien aprieta
  /// ese botón vino a ver qué le falta a alguien, no a editarle el contrato.
  seccionInicial?: Seccion;
  /// Las personas activas a las que se puede traspasar la carga. Las arma quien llama: ya
  /// tiene el censo entero, y volver a pedirlo acá sería un viaje por una lista que ya viajó.
  destinos: { id: number; nombre: string }[];
}) {
  const [seccion, setSeccion] = useState<Seccion>(seccionInicial);
  const [f, setF] = useState<Formulario>(() => desdeLaFila(persona));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frases, setFrases] = useState<string[]>([]);

  const campo = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setF((previo) => ({ ...previo, [k]: v }));

  // P9.3 · la lista se pide al servidor recién cuando alguien abre la pestaña, y una sola vez
  // por popup: pedirla de nuevo en cada cambio de pestaña pisaría lo que se está editando.
  const [contactos, setContactos] = useState<Contactos>(null);
  const [errorContactos, setErrorContactos] = useState<string | null>(null);
  // Un pedido en vuelo. Es una referencia y no estado porque nadie lo mira en pantalla —
  // «cargando» se deduce de que todavía no hay lista ni error— y porque marcarlo como estado
  // obligaría a un `setState` sincrónico dentro del efecto, que es una cascada de renders.
  const pedidoDeContactos = useRef(false);

  useEffect(() => {
    if (seccion !== 'contactos') return;
    // Sin el permiso no se piden: la acción los negaría igual, y un viaje al servidor para
    // que conteste que no es un viaje que haga falta hacer.
    if (!administra) return;
    if (contactos !== null || pedidoDeContactos.current) return;

    let vigente = true;
    pedidoDeContactos.current = true;
    void leerContactosEmergencia(persona.id)
      .then((r) => {
        if (!vigente) return;
        if (!r.ok) {
          setErrorContactos(r.mensaje);
          return;
        }
        // Se quedan los cuatro campos que la pantalla edita. El `orden` no se copia: la
        // posición en este arreglo ES el orden, y arrastrar los dos invita a que discrepen.
        setContactos(
          r.contactos.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            parentesco: c.parentesco,
            telefono: c.telefono,
          })),
        );
      })
      .finally(() => {
        pedidoDeContactos.current = false;
      });
    return () => {
      vigente = false;
    };
  }, [seccion, administra, persona.id, contactos]);

  const filaContacto = (i: number, parche: Partial<ContactoPropuesto>) =>
    setContactos((previo) =>
      previo === null ? previo : previo.map((c, j) => (j === i ? { ...c, ...parche } : c)),
    );

  const quitarContacto = (i: number) =>
    setContactos((previo) => (previo === null ? previo : previo.filter((_, j) => j !== i)));

  const agregarContacto = () =>
    setContactos((previo) => [...(previo ?? []), { ...FILA_VACIA }]);

  // El resumen se pide al abrir su pestaña, por la misma razón que los grupos y los
  // contactos: son seis consultas por persona, y el censo son noventa y una. Traerlas con la
  // lista costaría quinientas consultas para mostrar seis números de una sola persona.
  const [resumen, setResumen] = useState<ResumenDePersona | null>(null);
  const [errorResumen, setErrorResumen] = useState<string | null>(null);
  const pedidoDeResumen = useRef(false);

  useEffect(() => {
    if (seccion !== 'resumen') return;
    if (resumen !== null || pedidoDeResumen.current) return;

    let vigente = true;
    pedidoDeResumen.current = true;
    void resumenDePersona(persona.id)
      .then((r) => {
        if (!vigente) return;
        if (!r.ok || r.resumen === null) {
          setErrorResumen(r.mensaje);
          return;
        }
        setResumen(r.resumen);
      })
      .finally(() => {
        pedidoDeResumen.current = false;
      });
    return () => {
      vigente = false;
    };
  }, [seccion, persona.id, resumen]);

  // ── Los pendientes ────────────────────────────────────────────────────────────────────
  //
  // **Se piden a nivel del POPUP y no de la pestaña**, que es lo que los distingue de los
  // contactos y los grupos. Los miran DOS pestañas: la de Pendientes, que es su casa, y la de
  // Cuenta, que advierte qué carga queda abierta antes de bloquear (P22). Si se cargaran sólo
  // al abrir Pendientes, entrar directo a Cuenta mostraría «no tiene pendientes» sobre alguien
  // que sí tiene — que es la peor forma posible de fallar en esa pantalla.
  //
  // Dejaron de viajar en el censo: eran 91 arreglos completos en el payload de una pantalla
  // donde se mira uno por vez. La columna conserva los dos números, que es lo que se mira
  // siempre.
  const [pendientes, setPendientes] = useState<PendienteDePersona[] | null>(null);
  const [errorPendientes, setErrorPendientes] = useState<string | null>(null);
  const pedidoDePendientes = useRef(false);

  useEffect(() => {
    if (seccion !== 'pendientes' && seccion !== 'cuenta') return;
    if (!administra) return;
    if (pendientes !== null || pedidoDePendientes.current) return;

    let vigente = true;
    pedidoDePendientes.current = true;
    void pendientesDePersona(persona.id)
      .then((r) => {
        if (!vigente) return;
        if (!r.ok || r.pendientes === null) {
          setErrorPendientes(r.mensaje);
          return;
        }
        setPendientes(r.pendientes);
      })
      .finally(() => {
        pedidoDePendientes.current = false;
      });
    return () => {
      vigente = false;
    };
  }, [seccion, administra, persona.id, pendientes]);

  // ── La formación ──────────────────────────────────────────────────────────────────────
  const [formacion, setFormacion] = useState<{
    enCurso: FilaFormacion[];
    realizadas: FilaFormacion[];
    noCursadas: FilaFormacion[];
  } | null>(null);
  const [errorFormacion, setErrorFormacion] = useState<string | null>(null);
  const pedidoDeFormacion = useRef(false);

  useEffect(() => {
    if (seccion !== 'formacion') return;
    if (!administra) return;
    if (formacion !== null || pedidoDeFormacion.current) return;

    let vigente = true;
    pedidoDeFormacion.current = true;
    void formacionDePersona(persona.id)
      .then((r) => {
        if (!vigente) return;
        if (!r.ok || r.enCurso === null || r.realizadas === null || r.noCursadas === null) {
          setErrorFormacion(r.mensaje);
          return;
        }
        setFormacion({
          enCurso: r.enCurso,
          realizadas: r.realizadas,
          noCursadas: r.noCursadas,
        });
      })
      .finally(() => {
        pedidoDeFormacion.current = false;
      });
    return () => {
      vigente = false;
    };
  }, [seccion, administra, persona.id, formacion]);

  // P10 · las membresías se piden al abrir la pestaña, igual que los contactos y por la misma
  // razón de fondo: no inflar el payload del censo con un dato que casi nadie mira.
  const [grupos, setGrupos] = useState<Grupos>(null);
  const [errorGrupos, setErrorGrupos] = useState<string | null>(null);
  const pedidoDeGrupos = useRef(false);

  useEffect(() => {
    if (seccion !== 'grupos') return;
    if (!administra) return;
    if (grupos !== null || pedidoDeGrupos.current) return;

    let vigente = true;
    pedidoDeGrupos.current = true;
    void leerGruposDePersona(persona.id)
      .then((r) => {
        if (!vigente) return;
        if (!r.ok) {
          setErrorGrupos(r.mensaje);
          return;
        }
        setGrupos(r.grupos);
      })
      .finally(() => {
        pedidoDeGrupos.current = false;
      });
    return () => {
      vigente = false;
    };
  }, [seccion, administra, persona.id, grupos]);

  /// Marcar y desmarcar. El derivado nunca llega acá: su casilla está deshabilitada, y si
  /// llegara igual la acción lo rechaza en el servidor.
  const alternarGrupo = (grupoId: number) =>
    setGrupos((previo) =>
      previo === null
        ? previo
        : previo.includes(grupoId)
          ? previo.filter((g) => g !== grupoId)
          : [...previo, grupoId],
    );

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
        // **P16 · los grupos también mueven el número.** La membresía es el tercer término
        // del piso y el alcance `GRUPO_INTERES` dirige obligaciones a quienes pertenecen: si
        // la previsión no los mirara, marcar un grupo no cambiaría el «se le asignarán N» y
        // el popup volvería a prometer un número distinto del que la transacción crea.
        //
        // `grupos` es su propio estado y su identidad sólo cambia cuando la lista cambia, así
        // que entra al arreglo de dependencias tal cual — sin desarmarlo en primitivas como
        // hay que hacer con `f`, que es un objeto con once campos.
        ...(grupos !== null && { gruposInteres: grupos }),
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
  }, [administra, persona.id, areaId, cargoId, areaDesde, cargoDesde, fechaIngreso, grupos]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    const r = await guardarPertenencia(persona.id, aDatos(f, contactos, grupos));
    setGuardando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setMensaje(r.mensaje);
    setFrases(r.frases);
    // Los contactos recién creados ya tienen id en la base y acá no. Guardar de nuevo sin
    // recargarlos los mandaría otra vez sin id, y la acción los crearía duplicados. Volver a
    // `null` hace que el efecto los pida de nuevo con los ids puestos.
    if (contactos !== null) setContactos(null);
  };

  const pestanas: readonly Pestana<Seccion>[] = [
    // Va PRIMERA: quien abre a una persona suele venir a mirar, no a editar. «Qué tiene» se
    // contesta de un vistazo; el contrato y los grupos están una pestaña al lado.
    { clave: 'resumen', etiqueta: 'Resumen' },
    { clave: 'base', etiqueta: 'Datos base' },
    {
      clave: 'pendientes',
      etiqueta: 'Pendientes',
      cuantos: persona.pendientes,
      // La marca de atención se enciende con las VENCIDAS, no con las abiertas: una persona
      // con seis tareas en plazo está normal, y pintarla igual que a una con una vencida
      // enseña a ignorar la marca.
      atencion: persona.vencidas > 0,
    },
    { clave: 'formacion', etiqueta: 'Formación' },
    { clave: 'licencias', etiqueta: 'Licencias' },
    { clave: 'contactos', etiqueta: 'Contactos' },
    {
      clave: 'grupos',
      etiqueta: 'Grupos de interés',
      cuantos: catalogos.gruposInteres.length,
    },
    // P25 · se AGREGA, no se deshabilita. Sin permiso o sin la variable, la pestaña no está.
    ...(bloqueoDisponible ? [{ clave: 'cuenta' as const, etiqueta: 'Cuenta' }] : []),
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
          {/* Guardar aparece donde hay algo que guardar. Licencias no escribe nada, así que
              ahí un botón habilitado prometería un cambio que no ocurre. Y Cuenta tiene su
              propio botón, con su propia confirmación: un «Guardar» genérico al lado de un
              bloqueo es exactamente el clic que P20 viene a hacer imposible. */}
          {administra &&
            seccion !== 'licencias' &&
            seccion !== 'cuenta' &&
            // Pendientes y Formación no editan la persona: tienen sus propios botones, con
            // sus propias confirmaciones. Un «Guardar» genérico al lado de «Asignar»
            // prometería que guarda la asignación, y no guarda nada.
            seccion !== 'pendientes' &&
            seccion !== 'formacion' && (
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

            <Avisos error={error} mensaje={mensaje} frases={frases} />
          </div>
        )}

        {/* La lista de pendientes y sus tres verbos. **Vive acá y en ningún otro lado**: era
            el pie de Datos base, donde la pregunta «¿qué le falta?» aterrizaba dentro de un
            formulario de edición y enmarcada como un traspaso. */}
        {seccion === 'pendientes' && (
          <PendientesPersona
            persona={persona}
            pendientes={pendientes}
            error={errorPendientes}
            administra={administra}
            contenidos={catalogos.contenidos}
            destinos={destinos}
            onCambio={() => {
              // Acaba de cambiar lo que la lista cuenta: se vuelve a pedir. La columna del
              // censo queda vieja hasta recargar, y la acción ya revalida esa ruta.
              setPendientes(null);
              pedidoDePendientes.current = false;
            }}
          />
        )}

        {seccion === 'formacion' && (
          <FormacionPersona
            personaId={persona.id}
            enCurso={formacion?.enCurso ?? null}
            realizadas={formacion?.realizadas ?? null}
            noCursadas={formacion?.noCursadas ?? null}
            error={errorFormacion}
            administra={administra}
          />
        )}

        {/* §3.2 · la pestaña LEE y no escribe (D-2). Las dos consultas de Graph degradan por
            separado (P8) y esa lógica vive en su propio archivo: acá adentro habría convertido
            los cuatro estados de este popup en diez. */}
        {seccion === 'resumen' && (
          <div className="flex flex-col gap-4">
            {errorResumen !== null && (
              <p className="text-12 text-danger-text [text-wrap:pretty]">{errorResumen}</p>
            )}
            {resumen === null && errorResumen === null && (
              <p className="text-12_5 text-faint">Cargando lo que el sistema sabe…</p>
            )}
            {resumen !== null && (
              <>
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(118px,1fr))]">
                  <Cifra
                    n={resumen.tareasAbiertas}
                    etiqueta="Tareas abiertas"
                    alerta={resumen.tareasVencidas > 0 ? `${resumen.tareasVencidas} vencida(s)` : null}
                  />
                  <Cifra n={resumen.tareasCerradas} etiqueta="Ya cumplidas" />
                  <Cifra n={resumen.activos.length} etiqueta="Activos" />
                  <Cifra n={resumen.actasFirmadas} etiqueta="Actas firmadas" />
                  <Cifra n={resumen.accesosVigentes} etiqueta="Accesos vigentes" />
                  <Cifra n={resumen.gruposVigentes} etiqueta="Grupos" />
                </div>

                {/* Los dos vínculos con un activo son cosas distintas y se dicen distinto:
                    custodiar un portátil no es lo mismo que SER el activo «Personal de
                    soporte». Sumarlos en un número diría algo que no es cierto de ninguno. */}
                <div className="flex flex-col gap-1.5">
                  <span className="etiqueta-campo text-9">ACTIVOS</span>
                  {resumen.activos.length === 0 ? (
                    <p className="text-11_5 text-label [text-wrap:pretty]">
                      Sin activos. Ni custodia ninguno ni forma parte de un activo de tipo
                      Personal.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {resumen.activos.map((a) => (
                        <li key={`${a.vinculo}-${a.codigo}`}>
                          <Link
                            href={`/sgsi/inventario/${a.codigo}`}
                            className="flex flex-wrap items-baseline gap-2 rounded-campo border border-border-default bg-subtle px-2.5 py-1.5 hover:bg-app"
                          >
                            <span className="font-mono text-10_5 text-accent-700">{a.codigo}</span>
                            <span className="min-w-0 flex-1 truncate text-11_5 text-primary">
                              {a.nombre}
                            </span>
                            <span className="font-mono text-9_5 text-label">
                              {a.vinculo === 'custodia' ? 'lo custodia' : 'lo encarna'}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {administra && (
                  <AsociarPc
                    personaId={persona.id}
                    nombrePersona={persona.nombre}
                    // El equipo ya asociado se reconoce por el vínculo de custodia; si ya
                    // tiene uno, el bloque lo dice en vez de ofrecer crear un segundo.
                    yaTieneEquipo={resumen.activos.some((a) => a.vinculo === 'custodia')}
                    onHecho={() => {
                      // Se vuelve a pedir el resumen: acaba de cambiar lo que cuenta.
                      setResumen(null);
                      pedidoDeResumen.current = false;
                    }}
                  />
                )}

                <Link
                  href={`/sig/colaboradores/${persona.id}`}
                  className="w-fit text-11_5 font-semibold text-accent-700 hover:underline"
                >
                  Ver el expediente completo →
                </Link>
                <p className="text-10_5 leading-relaxed text-label [text-wrap:pretty]">
                  Acá están las cifras; el expediente tiene las filas — los accesos con su
                  vigencia, las actas con su fecha, los intentos de curso y los últimos
                  movimientos de la bitácora.
                </p>
              </>
            )}
          </div>
        )}

        {seccion === 'licencias' && (
          <LicenciasPersona personaId={persona.id} administra={administra} />
        )}

        {seccion === 'contactos' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Campo
                etiqueta="Teléfono"
                valor={f.telefono}
                onCambiar={(v) => campo('telefono', v)}
                deshabilitado={!administra}
              />
              <Campo
                etiqueta="Correo personal"
                tipo="email"
                valor={f.correoPersonal}
                onCambiar={(v) => campo('correoPersonal', v)}
                deshabilitado={!administra}
                nota="El del Directorio no se edita acá: éste es por dónde se la ubica si pierde el acceso."
              />
              <Campo
                etiqueta="Ciudad"
                valor={f.ciudad}
                onCambiar={(v) => campo('ciudad', v)}
                deshabilitado={!administra}
              />
              <Campo
                etiqueta="Dirección"
                valor={f.direccion}
                onCambiar={(v) => campo('direccion', v)}
                deshabilitado={!administra}
              />
            </div>

            <div className="border-t border-hairline-strong pt-3">
              <p className="text-12_5 font-semibold text-primary">Contactos de emergencia</p>
              {/* P9.2 · por qué se recoge tan poco, dicho donde se está recogiendo. La nota no
                  es un descargo legal: es lo que evita que alguien agregue una columna de
                  documento «por si acaso». */}
              <p className="mt-0.5 text-10_5 text-faint [text-wrap:pretty]">
                Nombre, parentesco y teléfono: nada más. Es dato personal de alguien que nunca
                autorizó nada, y para llamar en una emergencia no hace falta su correo, ni su
                dirección, ni su documento. Sólo lo ve quien tiene{' '}
                <code>personas:administrar</code>, y no sale en el censo ni en ninguna
                exportación. El orden de la lista es el orden en que se llama.
              </p>

              {!administra && (
                <p className="mt-2 text-11_5 text-muted [text-wrap:pretty]">
                  No se muestran: leerlos exige <code>personas:administrar</code>.
                </p>
              )}

              {/* «Cargando» se deduce: no hay lista y tampoco hay error todavía. Un estado
                  aparte para decir lo mismo podría quedar desfasado de los otros dos. */}
              {administra && contactos === null && errorContactos === null && (
                <p className="mt-2 text-12 text-muted">Cargando…</p>
              )}

              {administra && errorContactos !== null && (
                <p className="mt-2 text-12" style={{ color: 'var(--hf-danger-text)' }}>
                  {errorContactos}
                </p>
              )}

              {administra && contactos !== null && (
                <div className="mt-3 flex flex-col gap-2">
                  {contactos.length === 0 && (
                    <p className="text-12 text-muted">
                      No hay ninguno cargado. Sin contacto de emergencia, ante un accidente no
                      hay a quién llamar.
                    </p>
                  )}
                  {contactos.map((c, i) => (
                    <div
                      // El índice es la identidad de la FILA mientras se edita: un contacto
                      // nuevo todavía no tiene id, y usar el nombre como llave haría que el
                      // campo perdiera el foco en cada letra.
                      key={i}
                      className="grid grid-cols-[1.5rem_1fr_1fr_1fr_2rem] items-end gap-2 border-t border-hairline pt-2"
                    >
                      <span className="pb-2 text-12_5 font-semibold text-muted">{i + 1}</span>
                      <Campo
                        etiqueta="Nombre"
                        valor={c.nombre}
                        onCambiar={(v) => filaContacto(i, { nombre: v })}
                      />
                      <Campo
                        etiqueta="Parentesco"
                        valor={c.parentesco}
                        onCambiar={(v) => filaContacto(i, { parentesco: v })}
                      />
                      <Campo
                        etiqueta="Teléfono"
                        valor={c.telefono}
                        onCambiar={(v) => filaContacto(i, { telefono: v })}
                      />
                      <button
                        type="button"
                        onClick={() => quitarContacto(i)}
                        aria-label={`Quitar el contacto ${i + 1}`}
                        title="Quitar"
                        className="mb-1 rounded-campo border border-border-field bg-surface px-2 py-2 text-12_5 text-muted"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={agregarContacto}
                    className="self-start rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5 text-secondary"
                  >
                    + Agregar contacto
                  </button>
                </div>
              )}
            </div>

            <Avisos error={error} mensaje={mensaje} frases={frases} />
          </div>
        )}

        {seccion === 'grupos' && (
          <div className="flex flex-col gap-3">
            {/* P12 · la línea que tiene que estar. */}
            <p className="text-11_5 text-muted [text-wrap:pretty]">
              Un grupo de interés <strong>no otorga ningún permiso</strong>. Sirve para dirigir
              obligaciones y para reportar; el acceso a la aplicación lo dan —sólo— los grupos
              del Directorio Activo.
            </p>
            {errorGrupos !== null && (
              <p className="text-11_5" style={{ color: 'var(--hf-danger-text)' }}>
                {errorGrupos}
              </p>
            )}
            {administra && grupos === null && errorGrupos === null && (
              <p className="text-11_5 text-muted">Cargando los grupos de esta persona…</p>
            )}
            {catalogos.gruposInteres.map((g) => (
              <div key={g.id} className="flex items-start gap-2 border-t border-hairline pt-2">
                <input
                  type="checkbox"
                  // P10 · «Todos» va marcado y deshabilitado: su pertenencia se calcula, no se
                  // guarda. Los demás reflejan la pertenencia REAL —las membresías vigentes—
                  // y no «lo que el catálogo trae»: una casilla que muestra otra cosa que lo
                  // guardado hace que quien la mira crea que ya arregló algo.
                  checked={g.derivado || (grupos?.includes(g.id) ?? false)}
                  // Mientras la lista no llegó no se puede marcar: la acción recibe el
                  // conjunto COMPLETO, y mandarlo a medias desmarcaría lo que todavía no se
                  // sabe que estaba marcado.
                  disabled={g.derivado || !administra || grupos === null}
                  onChange={() => alternarGrupo(g.id)}
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
            {/* P13 → P4 · lo que pasa al desmarcar se dice ANTES de desmarcar. Quien saca a
                alguien de un grupo tiene que saber que las tareas que ese grupo le generó
                siguen abiertas: no se cierran ni se anulan, porque salir de un grupo no es
                haber cumplido lo que el grupo pedía. */}
            <p className="text-11 text-muted [text-wrap:pretty]">
              Al desmarcar un grupo, la membresía se <strong>cierra con fecha</strong> —no se
              borra, porque quién pertenecía en marzo es una pregunta de auditoría— y los
              pendientes que ese grupo generó <strong>siguen asignados</strong>: se informan al
              guardar, y hay que reasignarlos o anularlos con motivo.
            </p>

            <Avisos error={error} mensaje={mensaje} frases={frases} />
          </div>
        )}

        {/* §6 · bloquear y desbloquear. La pestaña sólo está cuando el servidor la habilitó,
            así que no hace falta comprobarlo otra vez acá: `seccion` nunca puede valer
            'cuenta' sin `bloqueoDisponible`, porque no hay forma de llegar. */}
        {seccion === 'cuenta' && (
          <BloqueoCuenta
            persona={persona}
            // P22 · el bloqueo lista los pendientes y OFRECE moverlos, pero no los mueve. La
            // lista llega desde acá y no de una consulta propia: dos consultas de lo mismo
            // son dos que mañana cuentan distinto, justo en la pantalla donde el número
            // decide si alguien bloquea o reasigna primero.
            pendientes={pendientes}
            onIrAReasignar={() => setSeccion('pendientes')}
          />
        )}
      </Pestanas>
    </Popup>
  );
}

/// El resultado del guardado. Vive en un componente porque las tres pestañas que guardan —la
/// base, la de contactos y la de grupos— tienen que mostrar lo mismo: quien guarda desde
/// Grupos también necesita leer si la transacción le asignó tareas y cuántos pendientes le
/// quedaron abiertos del grupo que acaba de desmarcar.
function Avisos({
  error,
  mensaje,
  frases,
}: {
  error: string | null;
  mensaje: string | null;
  frases: string[];
}) {
  return (
    <>
      {error !== null && (
        <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>
          {error}
        </p>
      )}
      {mensaje !== null && (
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
    </>
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

/// Una cifra del resumen. El número grande y su rótulo debajo; la alerta sólo cuando la hay,
/// porque un «0 vencidas» en rojo pálido enseña a ignorar el rojo.
function Cifra({
  n,
  etiqueta,
  alerta = null,
}: {
  n: number;
  etiqueta: string;
  alerta?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-campo border border-border-default bg-subtle px-2.5 py-2">
      <span className="cifra text-19 text-primary">{n}</span>
      <span className="text-10_5 leading-tight text-muted">{etiqueta}</span>
      {alerta !== null && (
        <span className="text-9_5 font-semibold text-danger-text">{alerta}</span>
      )}
    </div>
  );
}
