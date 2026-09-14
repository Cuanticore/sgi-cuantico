'use client';

// app/sig/personas/LicenciasPersona.tsx
//
// **La pestaña de licencias del popup de una persona** (REQ-SIG-15 §3.2).
//
// Vive en su propio archivo y no dentro de `PopupPersona.tsx` porque tiene su propio pedido al
// servidor, su propio estado de carga y dos degradaciones distintas que resolver. Metida en
// línea, el popup pasaba de cuatro estados a diez.
//
// ── Las tres reglas que esta pantalla tiene que hacer visibles ────────────────────────────
//
// **P6 · el nombre comercial va con el código crudo al lado, siempre.** El código es lo que hay
// que teclear en el portal de Microsoft, y es la única forma de reconocer un SKU que todavía
// nadie parametrizó.
//
// **P7 · la pestaña LEE y no escribe** (D-2). Lo dice en una línea, porque quien abre una
// pantalla de licencias en una herramienta de gestión espera poder asignarlas.
//
// **P8 · una lista vacía y un 403 no se ven igual nunca.** Las dos consultas son
// independientes: un 403 en el inventario del tenant **no borra la lista de la persona**, y
// «esta persona no tiene licencias» se dice con otras palabras que «no pudimos preguntar».
// `estadoDeConsulta` es lo que obliga a elegir entre los tres casos y no entre dos.

import { useEffect, useState } from 'react';

import {
  leerLicenciasDePersona,
  type ResultadoLicencias,
} from '@/app/sig/acciones/personas-edicion';
import { explicarFallo, type FalloGraph } from '@/lib/sgsi/graph-fallo';
import {
  estadoDeConsulta,
  explicarAnomalia,
  fraseDelSku,
  type InventarioDePersona,
  type LicenciasDeLaPantalla,
  type RenglonInventario,
  type ResumenSku,
} from '@/lib/sgsi/licencias';

export default function LicenciasPersona({
  personaId,
  administra,
}: {
  personaId: number;
  administra: boolean;
}) {
  // `null` es «todavía no llegó», que no es «no hay». La misma distinción que los contactos y
  // los grupos, y acá además se repite un nivel más abajo con cada una de las dos consultas.
  const [datos, setDatos] = useState<LicenciasDeLaPantalla | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Sin el permiso no se pide: la acción lo negaría igual, y un viaje al servidor para que
    // conteste que no es un viaje que haga falta hacer.
    if (!administra) return;
    let vigente = true;
    void leerLicenciasDePersona(personaId).then((r: ResultadoLicencias) => {
      if (!vigente) return;
      if (!r.ok || r.licencias === undefined) {
        setError(r.mensaje);
        return;
      }
      setDatos(r.licencias);
    });
    return () => {
      vigente = false;
    };
  }, [personaId, administra]);

  if (!administra) {
    return (
      <p className="text-11_5 text-muted [text-wrap:pretty]">
        No se muestran: leer las licencias del Directorio exige <code>personas:administrar</code>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* D-2 · dicho antes de que alguien busque el botón que no está. */}
      <p className="text-11_5 text-muted [text-wrap:pretty]">
        Esta pestaña <strong>lee y no escribe</strong>: asignar y quitar licencias se sigue
        haciendo en el portal de Microsoft. Quitar una licencia de Exchange arranca el reloj de
        30 días para el borrado del buzón, y esa consecuencia no puede vivir detrás de una
        casilla de un popup.
      </p>

      {error !== null && (
        <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>
          {error}
        </p>
      )}

      {datos === null && error === null && <p className="text-12 text-muted">Cargando…</p>}

      {datos !== null && (
        <>
          {/* Las dos listas, una al lado de la otra (§3.2). Cada columna resuelve su propio
              resultado: no hay un estado compartido del que las dos dependan, que es lo que
              haría que una arrastrara a la otra. */}
          <div className="grid grid-cols-2 gap-4">
            <ListaDeLaPersona r={datos.persona} />
            <ListaDelTenant r={datos.tenant} />
          </div>

          {/* P7 · los cruces. Fuera de la columna de la persona porque son la conclusión, no
              un dato más de la lista. */}
          {datos.persona.ok && <Anomalias inventario={datos.persona.datos} />}
        </>
      )}
    </div>
  );
}

/// **Lo que esta persona tiene.** Los tres estados, dichos distinto.
function ListaDeLaPersona({
  r,
}: {
  r: LicenciasDeLaPantalla['persona'];
}) {
  const estado = estadoDeConsulta(r, (d: InventarioDePersona) => d.renglones.length);
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-12_5 font-semibold text-primary">Lo que esta persona tiene</h4>

      {estado === 'NO_SE_PUDO_PREGUNTAR' && !r.ok && <NoSePudo fallo={r.fallo} />}

      {estado === 'VACIA' && (
        // Y NO «no se pudo leer». Es un hecho comprobado: la consulta respondió y no trajo
        // ninguna. Si además tiene tareas pendientes, el bloque de cruces lo levanta.
        <p className="text-12 text-muted [text-wrap:pretty]">
          No tiene ninguna licencia asignada. La consulta respondió: es un hecho, no un dato que
          falte.
        </p>
      )}

      {r.ok &&
        r.datos.renglones.map((l: RenglonInventario) => (
          <article
            key={l.codigo}
            className="rounded-campo border border-hairline bg-app px-3 py-2"
          >
            {/* P6 · nombre comercial y código crudo, siempre los dos. */}
            <p className="text-12_5 text-primary">
              {l.comercial ?? l.codigo}{' '}
              <span className="font-mono text-10_5 text-faint">{l.codigo}</span>
            </p>
            {l.comercial === null && (
              <p className="mt-0.5 text-10_5" style={{ color: 'var(--hf-warn-text)' }}>
                Sin nombre comercial parametrizado. Se agrega como parámetro{' '}
                <code>licencia_sku_{l.codigo.toLowerCase()}</code>, sin desplegar nada.
              </p>
            )}
            {l.serviciosHabilitados.length > 0 && (
              <p className="mt-1 text-11 text-secondary [text-wrap:pretty]">
                <strong>{l.serviciosHabilitados.length} servicio(s) habilitado(s):</strong>{' '}
                {l.serviciosHabilitados.join(', ')}
              </p>
            )}
            {l.serviciosDeshabilitados.length > 0 && (
              // Se dicen aparte: el inventario de software de A.5.9 es lo que la persona USA, y
              // un servicio apagado dentro de una licencia no es software que use.
              <p className="mt-0.5 text-11 text-muted [text-wrap:pretty]">
                {l.serviciosDeshabilitados.length} deshabilitado(s):{' '}
                {l.serviciosDeshabilitados.join(', ')}
              </p>
            )}
          </article>
        ))}
    </section>
  );
}

/// **Lo que el tenant tiene.** Su propio resultado: un 403 acá deja intacta la columna de la
/// izquierda, que es exactamente lo que P8 pide poder ver en pantalla.
function ListaDelTenant({ r }: { r: LicenciasDeLaPantalla['tenant'] }) {
  const estado = estadoDeConsulta(r, (d: ResumenSku[]) => d.length);
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-12_5 font-semibold text-primary">Lo que el tenant tiene</h4>

      {estado === 'NO_SE_PUDO_PREGUNTAR' && !r.ok && (
        <>
          <NoSePudo fallo={r.fallo} />
          <p className="text-10_5 text-faint [text-wrap:pretty]">
            Falta el contexto del tenant —cuántos puestos hay y cuántos quedan libres—, nada
            más. La lista de la persona se leyó aparte y sigue siendo válida.
          </p>
        </>
      )}

      {estado === 'VACIA' && (
        <p className="text-12 text-muted [text-wrap:pretty]">
          El tenant no tiene ninguna suscripción. La consulta respondió y vino vacía.
        </p>
      )}

      {r.ok &&
        r.datos.map((s: ResumenSku) => (
          <article
            key={s.codigo}
            className="rounded-campo border border-hairline bg-app px-3 py-2"
          >
            <p className="text-12_5 text-primary">
              {s.comercial ?? s.codigo}{' '}
              <span className="font-mono text-10_5 text-faint">{s.codigo}</span>
            </p>
            <p
              className="mt-0.5 text-11_5"
              style={s.sobreasignado ? { color: 'var(--hf-warn-text)' } : undefined}
            >
              {fraseDelSku(s)}
            </p>
          </article>
        ))}

      {r.ok && r.datos.length > 0 && (
        <p className="text-10_5 text-faint [text-wrap:pretty]">
          El código crudo se muestra siempre junto al nombre: es lo que hay que teclear en el
          portal, y es la única forma de reconocer un SKU que todavía nadie parametrizó.
        </p>
      )}
    </section>
  );
}

/// **P7 · los tres cruces que el portal de Microsoft no puede hacer.**
///
/// El inventario de software por persona es la lista de la izquierda —A.5.9 pide poder armarla
/// sin entrar al portal cuenta por cuenta— y acá van los dos cruces que necesitan algo que el
/// portal no sabe: quién salió de la organización y a quién se le está exigiendo una tarea.
function Anomalias({ inventario }: { inventario: InventarioDePersona }) {
  return (
    <div className="border-t border-hairline-strong pt-3">
      <p className="text-12_5 font-semibold text-primary">
        Cruces con el SIG ({inventario.renglones.length} licencia(s) en el inventario de esta
        persona)
      </p>
      <p className="mt-0.5 text-10_5 text-faint [text-wrap:pretty]">
        El portal de Microsoft no puede hacerlos: no sabe quién salió de la organización ni a
        quién se le está exigiendo una tarea.
      </p>
      {inventario.anomalias.length === 0 ? (
        <p className="mt-2 text-12 text-muted">
          Sin hallazgos: ni licencia en cuenta inactiva, ni tareas exigidas a alguien sin
          licencia.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {inventario.anomalias.map((a) => (
            <li
              key={a.clase}
              className="rounded-campo border px-3 py-2 text-11_5 [text-wrap:pretty]"
              style={{
                background: 'var(--hf-warn-100)',
                borderColor: 'var(--hf-warn-border)',
                color: 'var(--hf-warn-text)',
              }}
            >
              {explicarAnomalia(a)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/// Por qué NO se pudo preguntar, con el recurso y el permiso que `graph-fallo.ts` redacta. Es
/// lo que evita que alguien se vaya a Azure a conceder un permiso que ya está concedido.
function NoSePudo({ fallo }: { fallo: FalloGraph }) {
  return (
    <p
      className="rounded-campo border px-3 py-2 text-11_5 [text-wrap:pretty]"
      style={{
        background: 'var(--hf-warn-100)',
        borderColor: 'var(--hf-warn-border)',
        color: 'var(--hf-warn-text)',
      }}
    >
      {explicarFallo(fallo)}
    </p>
  );
}
