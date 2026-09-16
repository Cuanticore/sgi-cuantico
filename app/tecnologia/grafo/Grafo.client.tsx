'use client';

// app/tecnologia/grafo/Grafo.client.tsx
//
// El grafo en SVG. Se dibuja a mano y no con una librería porque lo único que hace falta es
// colocar cajas en columnas y curvar líneas entre ellas: traer un motor de grafos para eso
// agregaría cientos de kilobytes y un acomodo automático que reordena los nodos en cada
// render — y un mapa que se mueve solo no se puede señalar con el dedo en una reunión.
//
// **Las columnas no son niveles.** Son la distancia a la dependencia más profunda, y por
// eso la flecha siempre va hacia la derecha. El filtro por Nivel 1 / 2 / 3 es otra cosa: dice
// QUÉ SE DIBUJA, no dónde.
//
// **Todo el acomodo sale de un solo `useMemo` encadenado.** Los tres bugs que originaron el
// harness de este repo tenían la misma forma: dos pasos contando desde orígenes distintos.
// Acá `subgrafoDeRama` alimenta a `columnasDelGrafo`, que alimenta a `ordenDentroDeColumnas`,
// en ese orden y sin que nadie más pueda escribir en el medio.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  columnasDelGrafo,
  ordenDentroDeColumnas,
  subgrafoDeRama,
  ETIQUETA_TIPO_DEPENDENCIA,
  type Arista,
  type TipoDependencia,
} from '@/lib/sig/dependencias';
import { activosDeRama, rutaDeNivel, type Nivel } from '@/lib/sig/niveles';

const ANCHO_CAJA = 124;
const ALTO_CAJA = 40;
const SEP_X = 176;
const SEP_Y = 56;
const MARGEN = 16;
/// D6 · la banda de rótulos vive DENTRO del lienzo. Dos contenedores que deben permanecer
/// alineados terminan desalineándose; uno solo no puede.
const ALTO_ROTULOS = 26;

type Modo = 'dep' | 'jer' | 'todo';
type Relacion = 'dep' | 'jer' | 'desp';

/// El valor `'sin-nivel'` del primer selector no es un caso degenerado: es una opción. Los
/// activos sin clasificar son trabajo pendiente conocido, y esconderlos detrás de «Todos»
/// sería perder inventario en silencio.
const SIN_NIVEL = 'sin-nivel';

function colorCriticidad(v: number | null): string {
  if (v === null) return '#b6bdb9';
  if (v >= 5) return '#a52016';
  if (v === 4) return '#b8791a';
  if (v === 3) return '#0f7a5a';
  return '#6b7570';
}

function etiquetaCriticidad(v: number | null): string {
  if (v === null) return 'sin valorar';
  if (v >= 5) return 'muy alto';
  if (v === 4) return 'alto';
  if (v === 3) return 'medio';
  return 'bajo';
}

export interface NodoGrafo {
  id: number;
  codigo: string | null;
  nombre: string;
  criticidad: number | null;
  /// E2 · apunta al nivel 3. Los grados 1 y 2 se derivan subiendo por `padreId`.
  nivelId: number | null;
}

interface Linea {
  de: number;
  a: number;
  rel: Relacion;
  tipo: TipoDependencia | null;
}

export default function GrafoClient({
  nodos,
  dependencias,
  contencion,
  despliegues = [],
  niveles,
  totalActivos,
}: {
  nodos: NodoGrafo[];
  dependencias: Arista[];
  contencion: { hijoId: number; padreId: number }[];
  despliegues?: { activoId: number; servidorId: number }[];
  niveles: Nivel[];
  totalActivos: number;
}) {
  const [modo, setModo] = useState<Modo>('dep');
  // D-3 · APAGADO por defecto, y la decisión es explícita sobre por qué. El libro dibuja
  // ~138 aristas de despliegue más que esta vista; encenderlas por omisión daría el mapa
  // técnico completo a costa de la legibilidad que buscó el autor del SVG.
  const [verDespliegues, setVerDespliegues] = useState(false);
  // D7 · sin selección al entrar. Arrancar con `nodos[0].id` elegía por el usuario el activo
  // de código más bajo y dejaba todo lo demás apagado, sin forma de soltarlo.
  const [sel, setSel] = useState<number | null>(null);
  const [n1, setN1] = useState('');
  const [n2, setN2] = useState('');
  const [n3, setN3] = useState('');

  // El interruptor sólo tiene sentido en «Ambas»: en «Dependencias» y en «Jerarquía» la
  // vista promete UNA relación, y colar una tercera rompería esa promesa.
  const desplieguesVisibles = modo === 'todo' && verDespliegues;

  const hayFiltro = n1 !== '';
  const nivelFiltrado = useMemo<number | null>(() => {
    if (n1 === SIN_NIVEL) return null;
    if (n3 !== '') return Number(n3);
    if (n2 !== '') return Number(n2);
    return n1 === '' ? null : Number(n1);
  }, [n1, n2, n3]);

  const nivelesDe = (padreId: number | null, grado: number) =>
    niveles.filter((x) => x.grado === grado && x.padreId === padreId && x.activo);

  // Una ruta por nivel, no una por caja: `rutaDeNivel` reconstruye el mapa de niveles en cada
  // llamada, y el lienzo la pide para cada nodo dibujado.
  //
  // Un `nivelId` que no está en la tabla se nombra `nivel #N` y no «sin nivel»: son dos datos
  // distintos —uno es una llave rota, el otro una clasificación pendiente— y confundirlos
  // escondería el que hay que arreglar.
  const rutas = useMemo(() => {
    const m = new Map<number, string>();
    for (const x of niveles) m.set(x.id, rutaDeNivel(x.id, niveles));
    return m;
  }, [niveles]);
  const rutaDe = (nivelId: number | null) =>
    nivelId === null ? 'sin nivel' : rutas.get(nivelId) ?? `nivel #${nivelId}`;

  const vista = useMemo(() => {
    // 1 · las relaciones que este modo promete dibujar, con su origen anotado. Sin el origen,
    //     el panel no puede decir por qué llegó cada vecino.
    const relaciones: Linea[] = [
      ...(modo === 'jer'
        ? []
        : dependencias.map((d) => ({ de: d.activoId, a: d.dependeDeId, rel: 'dep' as const, tipo: d.tipo }))),
      ...(modo === 'dep'
        ? []
        : contencion.map((c) => ({ de: c.padreId, a: c.hijoId, rel: 'jer' as const, tipo: null }))),
      ...(desplieguesVisibles
        ? despliegues.map((d) => ({ de: d.activoId, a: d.servidorId, rel: 'desp' as const, tipo: null }))
        : []),
    ];

    // 2 · quién participa de ALGUNA relación, mirando todas las fuentes y no sólo las del
    //     modo actual. «Sin relaciones declaradas» es una afirmación sobre el inventario, no
    //     sobre lo que se está dibujando ahora.
    const declarado = new Set<number>();
    for (const d of dependencias) {
      declarado.add(d.activoId);
      declarado.add(d.dependeDeId);
    }
    for (const c of contencion) {
      declarado.add(c.hijoId);
      declarado.add(c.padreId);
    }
    const enDespliegue = new Set<number>();
    for (const d of despliegues) {
      enDespliegue.add(d.activoId);
      enDespliegue.add(d.servidorId);
    }

    // 3 · los candidatos a dibujarse. Sin filtro se conserva el comportamiento de siempre:
    //     los activos sin ninguna relación no se dibujan, porque llenar la primera columna de
    //     cajas sueltas taparía las pocas cadenas que hay. **Con filtro esa razón desaparece**
    //     (D11): una rama tiene treinta activos, no trescientos, y «cuáles nadie conectó con
    //     nada» pasa a ser el hallazgo.
    const candidatos = nodos.filter((n) => {
      const soloDespliegue = !declarado.has(n.id) && enDespliegue.has(n.id);
      if (soloDespliegue && !desplieguesVisibles) return false;
      if (hayFiltro) return true;
      return declarado.has(n.id) || enDespliegue.has(n.id);
    });
    const idsCandidatos = new Set(candidatos.map((n) => n.id));

    // 4 · el sujeto y la frontera. D2 · filtrar define quién es el SUJETO; lo que lo sostiene
    //     se sigue dibujando, apagado, porque MINTRACE no se sostiene solo.
    const sujeto = hayFiltro
      ? activosDeRama(nivelFiltrado, niveles, candidatos)
      : idsCandidatos;
    const aristas: Arista[] = relaciones
      .filter((r) => idsCandidatos.has(r.de) && idsCandidatos.has(r.a))
      .map((r) => ({ activoId: r.de, dependeDeId: r.a, tipo: r.tipo ?? 'USA' }));
    const sub = subgrafoDeRama(sujeto, aristas);

    // Las líneas dibujadas se derivan de lo que `subgrafoDeRama` dejó pasar, no de repetir su
    // criterio: un mismo par puede ser dependencia Y despliegue, y las dos líneas se dibujan.
    const dejadas = new Set(sub.aristas.map((a) => `${a.activoId}>${a.dependeDeId}`));
    const lineas = relaciones.filter(
      (r) => idsCandidatos.has(r.de) && idsCandidatos.has(r.a) && dejadas.has(`${r.de}>${r.a}`),
    );

    const visibles = candidatos.filter((n) => sub.sujeto.has(n.id) || sub.frontera.has(n.id));
    const ids = visibles.map((n) => n.id);

    // 5 · las columnas, SIEMPRE sobre el subgrafo visible. Conservar las globales dejaría una
    //     rama filtrada arrancando desplazada, con las primeras columnas vacías.
    const columnas = columnasDelGrafo(ids, sub.aristas);

    // 6 · el orden vertical por baricentro (D5), determinista.
    const orden = ordenDentroDeColumnas(
      columnas,
      sub.aristas,
      new Map(visibles.map((n) => [n.id, n.codigo ?? `#${n.id}`])),
    );

    const posicion = new Map<number, { x: number; y: number }>();
    for (const n of visibles) {
      posicion.set(n.id, {
        x: MARGEN + (columnas.get(n.id) ?? 0) * SEP_X,
        y: ALTO_ROTULOS + MARGEN + (orden.get(n.id) ?? 0) * SEP_Y,
      });
    }

    const conectados = new Set<number>();
    for (const l of lineas) {
      conectados.add(l.de);
      conectados.add(l.a);
    }

    return {
      visibles,
      lineas,
      columnas,
      posicion,
      sujeto: sub.sujeto,
      frontera: sub.frontera,
      declarado,
      enDespliegue,
      conectados,
      maxColumna: Math.max(0, ...columnas.values()),
    };
  }, [
    modo,
    nodos,
    dependencias,
    contencion,
    despliegues,
    desplieguesVisibles,
    hayFiltro,
    nivelFiltrado,
    niveles,
  ]);

  const ancho = useMemo(
    () => Math.max(...[...vista.posicion.values()].map((p) => p.x + ANCHO_CAJA), 400) + MARGEN,
    [vista],
  );
  const alto = useMemo(
    () => Math.max(...[...vista.posicion.values()].map((p) => p.y + ALTO_CAJA), 200) + MARGEN,
    [vista],
  );

  const porId = useMemo(() => new Map(vista.visibles.map((n) => [n.id, n])), [vista]);
  // Un nodo de frontera nunca queda elegido, y un nodo que el filtro sacó tampoco: el panel
  // prometería un detalle que esta vista no cargó.
  const elegido = sel !== null && vista.sujeto.has(sel) ? porId.get(sel) ?? null : null;

  // D8 · los vecinos salen de las líneas que se están dibujando. Calcularlos siempre con
  // `dependencias` hacía que en «Jerarquía» el panel listara vecinos invisibles y dijera «sin
  // dependencias declaradas» junto a un nodo con líneas punteadas a la vista.
  const vecinos = useMemo(() => {
    if (elegido === null) return [];
    const SENTIDO: Record<Relacion, [string, string]> = {
      dep: ['depende de', 'depende de él'],
      jer: ['contiene a', 'está dentro de'],
      desp: ['corre en', 'acá corre'],
    };
    return vista.lineas
      .filter((l) => l.de === elegido.id || l.a === elegido.id)
      .map((l) => {
        const saliente = l.de === elegido.id;
        return {
          activoId: saliente ? l.a : l.de,
          sentido: SENTIDO[l.rel][saliente ? 0 : 1],
          detalle: l.tipo === null ? null : ETIQUETA_TIPO_DEPENDENCIA[l.tipo],
          rel: l.rel,
        };
      });
  }, [elegido, vista]);

  const resaltados = useMemo(() => {
    if (elegido === null) return null;
    return new Set<number>([elegido.id, ...vecinos.map((v) => v.activoId)]);
  }, [elegido, vecinos]);

  const rutaFiltro =
    n1 === SIN_NIVEL ? 'Sin nivel' : nivelFiltrado === null ? '' : rutaDeNivel(nivelFiltrado, niveles);
  const enRama = vista.sujeto.size;
  const enFrontera = vista.frontera.size;

  const limpiarFiltro = () => {
    setN1('');
    setN2('');
    setN3('');
  };

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex max-w-[106ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Mapa tecnológico · grafo</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            El mismo inventario del{' '}
            <Link href="/tecnologia/mapa" className="font-medium text-accent hover:underline">
              árbol
            </Link>
            , visto como lo que es.{' '}
            <strong className="font-semibold text-secondary">
              Las columnas no son niveles: son distancia a la dependencia más profunda
            </strong>
            , y por eso la flecha siempre va hacia la derecha.
          </p>
        </div>
        <div className="ml-auto flex flex-none flex-col items-end gap-1.5">
          <span className="etiqueta-campo">Ver</span>
          <div className="flex gap-1.5">
            {(
              [
                ['dep', 'Dependencias'],
                ['jer', 'Jerarquía'],
                ['todo', 'Ambas'],
              ] as const
            ).map(([id, etiqueta]) => {
              const activo = modo === id;
              return (
                <button
                  key={id}
                  onClick={() => setModo(id)}
                  aria-pressed={activo}
                  className="rounded-campo px-3 py-1.5 text-11_5"
                  style={{
                    background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                    color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    fontWeight: activo ? 600 : 500,
                  }}
                >
                  {etiqueta}
                </button>
              );
            })}
          </div>
          {/* D-3 · el interruptor vive PEGADO a los modos y solo se habilita en «Ambas»,
              porque ahi es donde la decision lo puso: los otros dos modos prometen UNA
              relacion y una tercera linea rompe esa promesa. */}
          <label
            className="mt-0.5 flex items-center gap-1.5 text-11_5"
            style={{ color: modo === 'todo' ? 'var(--hf-text-secondary-soft)' : 'var(--hf-text-muted)' }}
          >
            <input
              type="checkbox"
              checked={verDespliegues}
              disabled={modo !== 'todo'}
              onChange={(e) => setVerDespliegues(e.target.checked)}
            />
            Sumar dónde corre cada activo ({despliegues.length})
          </label>
        </div>
      </div>

      {/* D1 · tres selectores ENCADENADOS. `NivelActivo` es una jerarquía de verdad (E1), no
          tres columnas de Excel: ofrecer un nivel 2 sin su padre permitiría pedir
          combinaciones que la jerarquía no admite. */}
      <div className="mt-4 flex flex-wrap items-end gap-2.5 rounded-tarjeta border border-border-field bg-subtle px-4 py-3">
        <SelectorNivel
          etiqueta="Nivel 1"
          valor={n1}
          onChange={(v) => {
            setN1(v);
            setN2('');
            setN3('');
          }}
          opciones={[
            ...nivelesDe(null, 1).map((x) => ({ valor: String(x.id), texto: x.nombre })),
            { valor: SIN_NIVEL, texto: 'Sin nivel' },
          ]}
        />
        <SelectorNivel
          etiqueta="Nivel 2"
          valor={n2}
          deshabilitado={n1 === '' || n1 === SIN_NIVEL}
          onChange={(v) => {
            setN2(v);
            setN3('');
          }}
          opciones={
            n1 === '' || n1 === SIN_NIVEL
              ? []
              : nivelesDe(Number(n1), 2).map((x) => ({ valor: String(x.id), texto: x.nombre }))
          }
        />
        <SelectorNivel
          etiqueta="Nivel 3"
          valor={n3}
          deshabilitado={n2 === ''}
          onChange={setN3}
          opciones={n2 === '' ? [] : nivelesDe(Number(n2), 3).map((x) => ({ valor: String(x.id), texto: x.nombre }))}
        />
        <button
          onClick={limpiarFiltro}
          className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 text-secondary"
        >
          Todo
        </button>
        {hayFiltro && (
          /* D10 · sin esta línea, un grafo filtrado es indistinguible de uno incompleto. */
          <span className="ml-auto flex flex-col items-end gap-0.5">
            <strong className="text-12_5 font-semibold text-primary">{rutaFiltro}</strong>
            <span className="font-mono text-9_5 text-muted">
              {`${enRama} en la rama · ${enFrontera} de frontera · ${totalActivos - enRama - enFrontera} fuera`}
            </span>
          </span>
        )}
      </div>

      {vista.visibles.length === 0 ? (
        <p className="mt-6 max-w-[86ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
          {hayFiltro
            ? 'Ningún activo de esta rama está dibujado. Puede que la rama esté vacía o que sus activos todavía no tengan nivel asignado.'
            : 'Ningún activo participa todavía de una dependencia ni de la jerarquía de contención, así que no hay grafo que dibujar.'}{' '}
          Se declaran en{' '}
          <Link href="/tecnologia/dependencias" className="font-medium text-accent underline">
            Dependencias
          </Link>
          .
        </p>
      ) : (
        <div className="mt-3.5 flex flex-col gap-3.5 xl:flex-row">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
            <div className="min-h-0 flex-1 overflow-auto p-1">
              <svg
                viewBox={`0 0 ${ancho} ${alto}`}
                width={ancho}
                height={alto}
                role="img"
                aria-label={`Grafo de ${vista.visibles.length} activos y ${vista.lineas.length} relaciones.`}
                style={{ maxWidth: 'none' }}
                onClick={() => setSel(null)}
              >
                <defs>
                  <marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#b6bdb9" />
                  </marker>
                  <marker id="flAct" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#12437f" />
                  </marker>
                </defs>

                {/* D6 · los rótulos, dentro del lienzo y a la x de su columna. Antes vivían en
                    una barra flex de otro contenedor con scroll: con más de cuatro columnas
                    ya no correspondían, y al desplazar en horizontal se quedaban quietos.
                    Se numeran en vez de nombrarse porque «Plataforma» supone una forma del
                    grafo, y un rótulo que miente es peor que uno neutro. */}
                <g>
                  <rect x={0} y={0} width={ancho} height={ALTO_ROTULOS} fill="#f6f8f7" />
                  <line x1={0} y1={ALTO_ROTULOS} x2={ancho} y2={ALTO_ROTULOS} stroke="#e2e6e3" strokeWidth={1} />
                  {Array.from({ length: vista.maxColumna + 1 }, (_, i) => (
                    <text
                      key={i}
                      x={MARGEN + i * SEP_X}
                      y={17}
                      fontSize={8}
                      fontFamily="ui-monospace, monospace"
                      fill="#8a938e"
                      letterSpacing="0.05em"
                    >
                      {i === 0 ? 'NADA DEPENDE DE ELLOS' : `A ${i} DE DISTANCIA`}
                    </text>
                  ))}
                </g>

                {vista.lineas.map((l, k) => {
                  const a = vista.posicion.get(l.de) as { x: number; y: number };
                  const b = vista.posicion.get(l.a) as { x: number; y: number };
                  const x1 = a.x + ANCHO_CAJA;
                  const y1 = a.y + ALTO_CAJA / 2;
                  const x2 = b.x;
                  const y2 = b.y + ALTO_CAJA / 2;
                  const activa = sel === l.de || sel === l.a;
                  const mitad = (x1 + x2) / 2;
                  return (
                    <path
                      key={`${l.rel}-${l.de}-${l.a}-${k}`}
                      d={`M ${x1} ${y1} C ${mitad} ${y1} ${mitad} ${y2} ${x2} ${y2}`}
                      fill="none"
                      stroke={activa ? '#12437f' : '#dbe0dd'}
                      strokeWidth={activa ? 1.9 : 1.2}
                      strokeDasharray={l.rel === 'jer' ? '4 4' : l.rel === 'desp' ? '1 3' : undefined}
                      markerEnd={activa ? 'url(#flAct)' : 'url(#fl)'}
                      opacity={resaltados === null || activa ? 1 : 0.45}
                    />
                  );
                })}

                {vista.visibles.map((n) => {
                  const p = vista.posicion.get(n.id) as { x: number; y: number };
                  const esFrontera = vista.frontera.has(n.id);
                  const activo = sel === n.id;
                  const suelto = !vista.declarado.has(n.id) && !vista.enDespliegue.has(n.id);
                  const etiqueta = `${n.codigo ?? `#${n.id}`} · ${n.nombre}${esFrontera ? ' · fuera de la rama' : ''}`;
                  const ruta = rutaDe(n.nivelId);
                  return (
                    <g
                      key={n.id}
                      role={esFrontera ? undefined : 'button'}
                      aria-label={etiqueta}
                      onClick={(e) => {
                        e.stopPropagation();
                        // D2 · la frontera es contexto, no sujeto.
                        if (!esFrontera) setSel(n.id);
                      }}
                      style={{ cursor: esFrontera ? 'default' : 'pointer' }}
                      opacity={resaltados === null || resaltados.has(n.id) ? 1 : 0.55}
                    >
                      <title>{`${etiqueta} · ${ruta}`}</title>
                      <rect
                        x={p.x}
                        y={p.y}
                        width={ANCHO_CAJA}
                        height={ALTO_CAJA}
                        rx={7}
                        fill={activo ? '#e9f0fb' : esFrontera ? '#f4f6f5' : '#ffffff'}
                        stroke={activo ? '#12437f' : esFrontera ? '#c3cac6' : '#e2e6e3'}
                        strokeWidth={activo ? 1.8 : 1}
                        strokeDasharray={esFrontera || suelto ? '3 3' : undefined}
                      />
                      {!esFrontera && (
                        <circle cx={p.x + ANCHO_CAJA - 10} cy={p.y + 10} r={3.5} fill={colorCriticidad(n.criticidad)} />
                      )}
                      <text x={p.x + 9} y={p.y + 15} fontFamily="ui-monospace, monospace" fontSize={7.5} fill="#8a938e">
                        {n.codigo ?? `#${n.id}`}
                      </text>
                      <text
                        x={p.x + 9}
                        y={p.y + 29}
                        fontSize={10.5}
                        fontWeight={activo ? 600 : 400}
                        fill={esFrontera ? '#6b7570' : '#1a211e'}
                      >
                        {n.nombre.length > 20 ? `${n.nombre.slice(0, 19)}…` : n.nombre}
                      </text>
                      {esFrontera && (
                        /* D3 · un activo sin clasificar que sostiene a la rama se nombra en
                           ámbar: es el dato que falta, apareciendo justo donde importa. */
                        <text
                          x={p.x + 9}
                          y={p.y + 38}
                          fontSize={7}
                          fontFamily="ui-monospace, monospace"
                          fill={n.nivelId === null ? '#8a4407' : '#a0a8a4'}
                        >
                          {ruta.length > 26 ? `${ruta.slice(0, 25)}…` : ruta}
                        </text>
                      )}
                      {!esFrontera && suelto && (
                        <text x={p.x + 9} y={p.y + 38} fontSize={7} fontFamily="ui-monospace, monospace" fill="#8a4407">
                          sin relaciones declaradas
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-hairline bg-subtle px-4 py-2.5">
              <Trazo etiqueta="depende de" />
              {modo !== 'dep' && <Trazo etiqueta="está dentro de" guiones="3 3" />}
              {/* D9 · el trazo que se dibuja se nombra. Antes se prendía el interruptor y
                  aparecía un tercer tipo de línea sin entrada en la convención. */}
              {desplieguesVisibles && <Trazo etiqueta="corre en" guiones="1 2" />}
              {hayFiltro && enFrontera > 0 && <Trazo etiqueta="fuera de la rama" caja />}
              <span className="ml-auto flex flex-wrap items-center gap-3">
                {[5, 4, 3, 1, null].map((v) => (
                  <span key={String(v)} className="inline-flex items-center gap-1.5">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: colorCriticidad(v) }} />
                    <span className="font-mono text-9 text-muted">{etiquetaCriticidad(v)}</span>
                  </span>
                ))}
              </span>
            </div>
          </section>

          <aside className="flex w-full flex-none flex-col gap-3 xl:w-[358px]">
            {elegido !== null && (
              <>
                <section
                  className="flex flex-col gap-2.5 rounded-tarjeta bg-surface px-4 py-3.5"
                  style={{ border: '1px solid var(--hf-brand-200, #d3dceb)' }}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-10 font-semibold text-accent">
                      {elegido.codigo ?? `#${elegido.id}`}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: colorCriticidad(elegido.criticidad) }}
                      />
                      <span className="font-mono text-9" style={{ color: colorCriticidad(elegido.criticidad) }}>
                        {etiquetaCriticidad(elegido.criticidad)}
                      </span>
                    </span>
                  </span>
                  <span className="text-14 font-semibold leading-snug text-primary">{elegido.nombre}</span>
                  <span className="font-mono text-9 text-faint">
                    {rutaDe(elegido.nivelId)}
                  </span>
                  <span className="h-px bg-hairline" />
                  <div className="flex gap-2.5">
                    {modo === 'todo' ? (
                      <Cifra valor={vecinos.length} etiqueta="Vecinos" color="var(--hf-brand-nav)" />
                    ) : (
                      <>
                        <Cifra
                          valor={vecinos.filter((v) => v.sentido === (modo === 'jer' ? 'está dentro de' : 'depende de')).length}
                          etiqueta={modo === 'jer' ? 'Está dentro de' : 'Depende de'}
                          color="#8a4407"
                        />
                        <Cifra
                          valor={vecinos.filter((v) => v.sentido === (modo === 'jer' ? 'contiene a' : 'depende de él')).length}
                          etiqueta={modo === 'jer' ? 'Contiene a' : 'Dependen de él'}
                          color="var(--hf-brand-nav)"
                        />
                      </>
                    )}
                    <Cifra
                      valor={vista.columnas.get(elegido.id) ?? 0}
                      etiqueta="Columna"
                      color="var(--hf-text-muted)"
                    />
                  </div>
                </section>

                <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
                  <Rotulo texto="Vecinos directos" derecha={String(vecinos.length)} />
                  {vecinos.map((v, k) => (
                    <span
                      key={`${v.activoId}-${k}`}
                      className="flex items-center gap-2 rounded-campo border border-border-field bg-subtle px-2.5 py-1.5"
                    >
                      <span
                        className="flex-none font-mono text-8_5 uppercase"
                        style={{ color: v.sentido === 'depende de' ? '#8a4407' : 'var(--hf-brand-nav)' }}
                      >
                        {v.sentido}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-11_5 text-primary">
                        {porId.get(v.activoId)?.nombre ?? `#${v.activoId}`}
                      </span>
                      <span className="flex-none font-mono text-8_5 text-faint">
                        {v.detalle ?? (vista.frontera.has(v.activoId) ? 'frontera' : '')}
                      </span>
                    </span>
                  ))}
                  {vecinos.length === 0 && (
                    <span className="text-11_5 text-muted [text-wrap:pretty]">
                      Sin relaciones visibles en este modo.
                    </span>
                  )}
                </section>
              </>
            )}

            {/* Por qué existe esta pantalla habiendo un árbol. Va en la pantalla y no en un
                comentario del código porque quien pregunta «¿para qué dos mapas?» está
                mirándola, no leyéndolo. */}
            <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
              <Rotulo texto="Por qué grafo y no árbol" />
              <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
                El árbol dibuja bien la <strong className="font-semibold">contención</strong> —qué
                está dentro de qué— pero obliga a que cada cosa tenga un solo padre. La
                dependencia no es así: una base de datos la usan tres aplicaciones a la vez.
              </span>
              <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
                En el árbol, esas tres relaciones se dibujan como tres nodos repetidos, y
                entonces «cuántos dependen de esa base» hay que contarlo a mano. Acá se ve.
              </span>
              <span
                className="rounded-campo px-3 py-2.5 text-10_5 leading-relaxed [text-wrap:pretty]"
                style={{ background: '#fffaf3', border: '1px solid #f2b473', color: '#8a4407' }}
              >
                Las dos vistas conviven y muestran{' '}
                <strong className="font-semibold">relaciones distintas del mismo inventario</strong>. El
                árbol responde «qué compone a este producto»; el grafo responde «qué se cae si
                cae esto».
              </span>
            </section>

            <p className="rounded-tarjeta border border-border-field bg-surface px-3.5 py-3 text-10_5 leading-relaxed text-secondary [text-wrap:pretty]">
              {hayFiltro ? (
                <>
                  Se dibujan los {enRama} activos de la rama y los {enFrontera} de afuera que la
                  sostienen. Lo que está a un salto se muestra apagado porque una rama no se
                  sostiene sola: esconderlo diría que sí.
                </>
              ) : (
                <>
                  Se dibujan {vista.visibles.length} de {totalActivos} activos: los que participan de
                  alguna dependencia o de la jerarquía de contención. Los demás no tienen relación
                  que mostrar, y llenar la primera columna con cajas sueltas taparía las cadenas
                  que sí hay. Filtra por nivel para verlos.
                </>
              )}
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}

function SelectorNivel({
  etiqueta,
  valor,
  opciones,
  onChange,
  deshabilitado = false,
}: {
  etiqueta: string;
  valor: string;
  opciones: { valor: string; texto: string }[];
  onChange: (v: string) => void;
  deshabilitado?: boolean;
}) {
  return (
    <span className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      <select
        aria-label={etiqueta}
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-11_5 text-primary disabled:text-faint"
      >
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </span>
  );
}

function Trazo({ etiqueta, guiones, caja = false }: { etiqueta: string; guiones?: string; caja?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="26" height="10">
        {caja ? (
          <rect x="1" y="1" width="24" height="8" rx="2" fill="#f4f6f5" stroke="#c3cac6" strokeDasharray="3 3" />
        ) : (
          <line x1="0" y1="5" x2="26" y2="5" stroke="#b6bdb9" strokeWidth="1.6" strokeDasharray={guiones} />
        )}
      </svg>
      <span className="font-mono text-9 text-muted">{etiqueta}</span>
    </span>
  );
}

function Cifra({ valor, etiqueta, color }: { valor: number; etiqueta: string; color: string }) {
  return (
    <span className="flex flex-1 flex-col gap-0.5">
      <span className="font-mono text-17 font-semibold tabular-nums" style={{ color }}>
        {valor}
      </span>
      <span className="etiqueta-campo leading-snug">{etiqueta}</span>
    </span>
  );
}

function Rotulo({ texto, derecha }: { texto: string; derecha?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
        {texto}
      </span>
      <span className="h-px flex-1 bg-hairline" />
      {derecha !== undefined && <span className="flex-none font-mono text-9 text-faint">{derecha}</span>}
    </span>
  );
}
