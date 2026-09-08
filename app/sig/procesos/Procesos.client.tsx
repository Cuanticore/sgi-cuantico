'use client';

// app/sig/procesos/Procesos.client.tsx
//
// Los nueve procesos y qué cuelga de cada uno. Lo que esta pantalla hace bien —y es el
// punto— es MOSTRAR LO QUE FALTA en vez de rellenarlo: el prompt lo pide expresamente
// («no inventes datos que falten; déjalo visible como faltante»), y acá faltan dos cosas
// sin las cuales la tabla `Proceso` no se puede poblar.
//
// La tabla se agrupa por banda y elige un proceso; la ficha lateral lo cuenta entero. Es
// la división del lienzo, y no es cosmética: el mapa de MAN-SIG-02 se lee por bandas, y lo
// que hay que saber de un proceso —el cargo duplicado de COM, la ausencia de auditoría en
// SIG— no cabe en una fila de tabla sin volverla ilegible para los otros ocho.

import { useState } from 'react';
import { ETIQUETA_TIPO, agruparPorBanda, type TipoProceso } from '@/lib/sig/procesos';

const COLOR_TIPO: Record<TipoProceso, { fondo: string; texto: string }> = {
  ESTRATEGICO: { fondo: '#e9f0fb', texto: '#12437f' },
  MISIONAL: { fondo: '#e8f4ef', texto: '#0b5c44' },
  APOYO: { fondo: '#f5f7f6', texto: '#4a544f' },
};

export interface FilaProceso {
  codigo: string;
  nombre: string;
  tipo: TipoProceso;
  cargoDelMapa: string;
  ocupaHoy: string;
  /// Lo que hay que saber de este proceso antes de tocarlo. `null` en los que no tienen
  /// nada que advertir.
  nota: string | null;
  creado: boolean;
  areaSugerida: { id: number; nombre: string } | null;
  cargo: { estado: string; candidatos: { id: number; nombre: string }[]; cargoId: number | null };
  /// `indicadores` es `number | null`: vienen de SharePoint y `null` significa que la
  /// consulta no se pudo hacer, no que el proceso no tenga ninguno.
  colgando: {
    programadas: number;
    requisitos: number;
    celdas: number;
    indicadores: number | null;
  };
}

export default function ProcesosClient({
  filas,
  areas,
  cargosResidualesDeArea,
  huerfanos,
  totalCargos,
  migradas,
}: {
  filas: FilaProceso[];
  areas: { id: number; nombre: string; prefijo: string }[];
  cargosResidualesDeArea: { id: number; nombre: string }[];
  huerfanos: string[];
  totalCargos: number;
  migradas: {
    programadas: number; requisitos: number; celdas: number;
    totalProgramadas: number; totalRequisitos: number; totalCeldas: number;
  };
}) {
  const creados = filas.filter((f) => f.creado).length;
  const cargosResueltos = filas.filter((f) => f.cargo.cargoId !== null).length;
  // El lienzo abre con un proceso ya elegido: una ficha lateral vacía obliga a adivinar que
  // hay que hacer clic para que aparezca algo.
  const [elegido, setElegido] = useState<string | null>(filas[0]?.codigo ?? null);
  const seleccion = filas.find((f) => f.codigo === elegido) ?? null;
  const bandas = agruparPorBanda(filas);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Procesos</h1>
          <p className="max-w-[86ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Los nueve del mapa de MAN-SIG-02, con lo que cuelga de cada uno. El proceso es
            distinto del área: la Gerencia de Operaciones responde por tres —dos misionales y
            uno de apoyo— y con una sola entidad ese hecho no se puede escribir.
          </p>
        </div>
        <span className="ml-auto flex flex-none flex-col items-end gap-0.5">
          <span className="font-mono text-12_5 font-semibold text-primary">
            {creados} de {filas.length}
          </span>
          <span className="font-mono text-9 uppercase tracking-[0.07em] text-muted">
            creados en la base
          </span>
        </span>
      </div>

      {/* Los dos bloqueos, con la evidencia. No es un error de la aplicación y no se
          disimula: es lo que hay que decidir antes de poblar. */}
      {creados === 0 && (
        <section
          className="mt-5 flex max-w-[100ch] flex-col gap-3 rounded-tarjeta px-4 py-3.5"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)', border: '1px solid #f2b473' }}
        >
          <h2 className="text-12_5 font-semibold">
            La tabla está vacía a propósito: faltan dos datos que la fuente no da
          </h2>

          <div className="flex flex-col gap-1">
            <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em]">
              1 · El área de cada proceso
            </span>
            <p className="text-11_5 leading-relaxed [text-wrap:pretty]">
              El mapa da la banda y el cargo, no el área. Y al mirar la base aparece algo que
              el documento no previó: las {areas.length} áreas cargadas se llaman <strong>igual</strong>{' '}
              que los nueve procesos, una por una, así que <code className="font-mono">areaId</code>{' '}
              apuntaría a su homónima sin agregar información. Peor: el caso que justifica la
              decisión —Yuliet Rojas, área <strong>Operaciones</strong>, tres procesos— no se
              puede escribir, porque no existe un área llamada Operaciones. Tampoco{' '}
              <strong>Finanzas</strong>, que D11 asigna a Albeiro Medina.
            </p>
            <p className="font-mono text-10 leading-relaxed">
              áreas cargadas: {areas.map((a) => `${a.prefijo} ${a.nombre}`).join(' · ')}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em]">
              2 · La correspondencia de cargos
            </span>
            <p className="text-11_5 leading-relaxed [text-wrap:pretty]">
              Sólo <strong>{cargosResueltos} de {filas.length}</strong> procesos resuelven su cargo
              contra los {totalCargos} del catálogo. No es un problema de duplicados:{' '}
              <strong>el mapa está en español y el catálogo en inglés</strong>. «Gerencia de
              Operaciones» no empareja con <code className="font-mono">Chief Operating Officer</code>{' '}
              ni con <code className="font-mono">Operations &amp; Services Manager</code>, y esos dos
              no son variantes del mismo puesto. Hace falta que alguien declare la
              correspondencia; la aplicación no la adivina.
            </p>
          </div>

          {cargosResidualesDeArea.length > 0 && (
            <p className="text-11_5 leading-relaxed [text-wrap:pretty]">
              Además, {cargosResidualesDeArea.length} entrada(s) del catálogo de cargos son
              nombres de <strong>área</strong>, no puestos:{' '}
              {cargosResidualesDeArea.map((c) => `«${c.nombre}»`).join(', ')}. Un proceso cuyo
              dueño es «Gestión Tecnológica» no dice quién responde, dice dónde ocurre.
            </p>
          )}
        </section>
      )}

      <div className="mt-5 flex items-start gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-tarjeta border border-border-field bg-surface">
          <table className="w-full text-left text-12_5">
            <thead>
              <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Proceso</th>
                <th className="px-4 py-3 font-semibold">Área</th>
                <th className="px-4 py-3 font-semibold">Dueño (cargo)</th>
                <th className="px-4 py-3 text-right font-semibold">Programa</th>
                <th className="px-4 py-3 text-right font-semibold">Indicadores</th>
                <th className="px-4 py-3 text-right font-semibold">Legales</th>
                <th className="px-4 py-3 text-right font-semibold">Celdas</th>
              </tr>
            </thead>
            {/* Una banda por `tbody`: el encabezado dice lo que antes repetía la columna
                «Tipo» una vez por fila, y de paso ordena el mapa como lo dibuja MAN-SIG-02.
                Las tres bandas se dibujan aunque una quede vacía — que el mapa tenga tres
                es del mapa, no de lo que haya cargado. */}
            {bandas.map((banda) => {
              const t = COLOR_TIPO[banda.tipo];
              return (
                <tbody key={banda.tipo}>
                  <tr className="border-t border-border-default">
                    <th
                      colSpan={8}
                      scope="colgroup"
                      className="px-4 py-2 text-left font-mono text-9 font-bold uppercase tracking-[0.08em]"
                      style={{ background: t.fondo, color: t.texto }}
                    >
                      {banda.titulo}
                      <span className="ml-2 font-normal opacity-70">
                        {banda.procesos.length}{' '}
                        {banda.procesos.length === 1 ? 'proceso' : 'procesos'}
                      </span>
                    </th>
                  </tr>
                  {banda.procesos.map((f) => {
                    const activa = f.codigo === elegido;
                    return (
                      <tr
                        key={f.codigo}
                        onClick={() => setElegido(f.codigo)}
                        className="cursor-pointer border-t border-border-default"
                        style={{ background: activa ? 'var(--hf-brand-100-soft)' : undefined }}
                      >
                        <td className="px-4 py-3 font-mono text-11 font-semibold text-accent">
                          {f.codigo}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setElegido(f.codigo)}
                            aria-pressed={activa}
                            className="text-left font-medium text-primary"
                          >
                            {f.nombre}
                          </button>
                          <div className="text-10_5 text-muted">{f.ocupaHoy}</div>
                        </td>
                        <td className="px-4 py-3">
                          {f.areaSugerida ? (
                            <span className="text-11_5 text-muted">
                              {f.areaSugerida.nombre}
                              <span className="ml-1.5 font-mono text-9 text-faint">homónima</span>
                            </span>
                          ) : (
                            <Faltante>sin área</Faltante>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-11_5 text-primary">{f.cargoDelMapa}</div>
                          {f.cargo.cargoId !== null ? (
                            <div className="font-mono text-9 text-muted">
                              resuelto · #{f.cargo.cargoId}
                            </div>
                          ) : (
                            <Faltante>
                              {f.cargo.estado === 'AMBIGUO'
                                ? `${f.cargo.candidatos.length} candidatos`
                                : 'sin correspondencia'}
                            </Faltante>
                          )}
                        </td>
                        <Conteo n={f.colgando.programadas} />
                        <Conteo n={f.colgando.indicadores} />
                        <Conteo n={f.colgando.requisitos} />
                        <Conteo n={f.colgando.celdas} />
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>

        {seleccion && <FichaProceso proceso={seleccion} />}
      </div>

      <p className="mt-3 text-11 leading-relaxed text-muted [text-wrap:pretty]">
        Los conteos se calculan contra el TEXTO que hoy referencia al proceso
        (<code className="font-mono">procesoRef</code>, <code className="font-mono">procesoEncargado</code>),
        porque es lo único que hay hasta que la migración corra. Migradas hasta ahora:{' '}
        {migradas.programadas}/{migradas.totalProgramadas} del programa,{' '}
        {migradas.requisitos}/{migradas.totalRequisitos} requisitos legales,{' '}
        {migradas.celdas}/{migradas.totalCeldas} celdas de plan. Las llaves nacieron
        opcionales a propósito: crear, poblar, migrar, y sólo entonces volverlas obligatorias.
      </p>

      {huerfanos.length > 0 && (
        <section className="mt-4 flex max-w-[100ch] flex-col gap-1.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3">
          <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
            Textos que no corresponden a ninguno de los nueve
          </span>
          <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
            La migración va a tener que resolverlos a mano. Aparecen porque el proceso se
            escribió como texto libre, que es justo lo que esta entidad viene a cerrar.
          </p>
          <ul className="flex flex-wrap gap-2">
            {huerfanos.map((h) => (
              <li
                key={h}
                className="rounded-[4px] px-2 py-0.5 font-mono text-10_5"
                style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
              >
                {h}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/// `null` no es cero y no se dibuja igual. Cero es una respuesta —«no cuelga nada de este
/// proceso»—; `null` es que no se pudo preguntar, y pintarlo como un guion lo haría pasar
/// por cero, que es la lectura contraria.
function Conteo({ n }: { n: number | null }) {
  return (
    <td className="px-4 py-3 text-right font-mono text-11_5 tabular-nums">
      {n === null ? (
        <span
          title="No se pudo consultar la fuente: no es cero, es que no se sabe."
          className="rounded-[4px] px-1.5 py-0.5 text-9 font-semibold uppercase"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
        >
          s/d
        </span>
      ) : n === 0 ? (
        <span className="text-faint">—</span>
      ) : (
        <span className="text-primary">{n}</span>
      )}
    </td>
  );
}

/// La ficha lateral de 372 px del lienzo: el proceso elegido, qué cuelga de él, y por qué
/// el dueño es un cargo. La tabla dice los nueve de un vistazo; la ficha dice UNO entero.
function FichaProceso({ proceso }: { proceso: FilaProceso }) {
  const t = COLOR_TIPO[proceso.tipo];

  return (
    <aside className="flex w-[372px] flex-none flex-col gap-3">
      <div className="flex flex-col gap-2.5 rounded-tarjeta bg-surface px-4 py-4" style={{ border: '1px solid var(--hf-brand-border)' }}>
        <span className="flex items-center gap-2">
          <span className="font-mono text-11 font-semibold" style={{ color: 'var(--hf-brand-nav)' }}>
            {proceso.codigo}
          </span>
          <span
            className="ml-auto rounded-[4px] px-2 py-0.5 font-mono text-8_5 font-semibold uppercase tracking-[0.06em]"
            style={{ background: t.fondo, color: t.texto }}
          >
            {ETIQUETA_TIPO[proceso.tipo]}
          </span>
        </span>
        <span className="text-14 font-semibold leading-snug text-primary">{proceso.nombre}</span>

        <div className="grid grid-cols-2 gap-2.5">
          <span className="flex flex-col gap-0.5">
            <span className="etiqueta-campo">Cargo responsable</span>
            <span className="text-11_5 text-primary">{proceso.cargoDelMapa}</span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="etiqueta-campo">Quien lo ocupa hoy</span>
            <span className="text-11_5 text-primary">{proceso.ocupaHoy}</span>
          </span>
        </div>

        {proceso.nota !== null && (
          <p
            className="rounded-campo px-3 py-2.5 text-10_5 leading-relaxed [text-wrap:pretty]"
            style={{
              background: 'var(--hf-brand-100-soft)',
              border: '1px solid var(--hf-brand-border)',
              color: 'var(--hf-brand-nav)',
            }}
          >
            {proceso.nota}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-4">
        <span className="flex items-center gap-2.5">
          <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
            Qué cuelga de este proceso
          </span>
          <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
        </span>

        <Detalle n={proceso.colgando.programadas} etiqueta="auditorías en el programa" />
        <Detalle n={proceso.colgando.indicadores} etiqueta="indicadores" />
        <Detalle n={proceso.colgando.requisitos} etiqueta="requisitos legales a cargo" />
        <Detalle n={proceso.colgando.celdas} etiqueta="celdas de plan" />

        {/* El lienzo pide un quinto contador —«obligaciones de tarea»— que hoy NO se puede
            calcular: `Obligacion` no tiene `procesoId` ni ninguna ruta hacia `Proceso`, y
            fabricar el cruce por texto daría un número que parecería medido. Se dice que
            falta el cruce, en vez de mostrar un cero que se leería como «ninguna». */}
        <p
          className="rounded-campo px-3 py-2 text-10_5 leading-relaxed [text-wrap:pretty]"
          style={{
            background: 'var(--hf-warn-100)',
            border: '1px solid var(--hf-warn-border)',
            color: 'var(--hf-warn-text)',
          }}
        >
          Las <strong className="font-semibold">obligaciones de tarea</strong> por proceso
          todavía no se pueden medir: la obligación no guarda de qué proceso viene, así que
          no hay por dónde contarlas. No es cero, es que el cruce no existe.
        </p>
      </div>

      {/* Esto estaba escrito sólo en comentarios de `lib/sig/procesos.ts` y del esquema:
          quien mira la pantalla y ve un cargo donde esperaba una persona no tenía dónde
          leer por qué. Es texto; no consulta nada. */}
      <div className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-4">
        <span className="flex items-center gap-2.5">
          <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
            Por qué el dueño es un cargo
          </span>
          <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
        </span>
        <p className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
          El mapa nombra <strong className="font-semibold">gerencias</strong>, no personas:
          «Gerencia de Operaciones», no «Yuliet Rojas». Modelarlo como cargo es más fiel y
          sobrevive a la rotación.
        </p>
        <p className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
          La entidad <code className="font-mono text-10_5">CargoResponsable</code> ya existe
          en el esquema, así que <code className="font-mono text-10_5">Proceso.cargoId</code>{' '}
          no agrega tabla nueva.
        </p>
        <p className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
          La persona sale de quién ocupa el cargo hoy. Cuando alguien cambia de puesto, las
          obligaciones del proceso lo siguen solas: nadie tiene que acordarse de
          reasignarlas.
        </p>
      </div>
    </aside>
  );
}

/// Un contador de la ficha. Cero se pinta en rojo porque acá informa —un proceso sin una
/// sola auditoría en el programa es un hallazgo—; `null` se pinta en ámbar porque informa
/// otra cosa distinta: que no se pudo consultar.
function Detalle({ n, etiqueta }: { n: number | null; etiqueta: string }) {
  const desconocido = n === null;
  const vacio = n === 0;

  return (
    <div
      className="flex items-center gap-3 rounded-campo px-3 py-2.5"
      style={{
        background: desconocido
          ? 'var(--hf-warn-100)'
          : vacio
            ? 'var(--hf-danger-bg)'
            : 'var(--hf-bg-subtle)',
        border: `1px solid ${
          desconocido
            ? 'var(--hf-warn-border)'
            : vacio
              ? 'var(--hf-danger-border)'
              : 'var(--hf-border-field)'
        }`,
      }}
    >
      <span
        className="w-[30px] flex-none font-mono text-14 font-semibold tabular-nums"
        style={{
          color: desconocido
            ? 'var(--hf-warn-text)'
            : vacio
              ? 'var(--hf-danger-text)'
              : 'var(--hf-brand-nav)',
        }}
      >
        {desconocido ? 's/d' : n}
      </span>
      <span
        className="min-w-0 flex-1 text-11_5"
        style={{
          color: desconocido
            ? 'var(--hf-warn-text)'
            : vacio
              ? 'var(--hf-danger-text)'
              : 'var(--hf-text-secondary)',
        }}
      >
        {etiqueta}
        {desconocido && ' · no se pudo consultar la fuente'}
      </span>
    </div>
  );
}

/// El faltante se pinta con los tokens de aviso, no en gris: lo que informa es que el dato
/// no está, y en gris se lee como «no aplica».
function Faltante({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-[4px] px-1.5 py-0.5 font-mono text-9 font-semibold uppercase"
      style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
    >
      {children}
    </span>
  );
}
