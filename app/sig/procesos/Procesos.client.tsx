'use client';

// app/sig/procesos/Procesos.client.tsx
//
// Los nueve procesos y qué cuelga de cada uno. Lo que esta pantalla hace bien —y es el
// punto— es MOSTRAR LO QUE FALTA en vez de rellenarlo: el prompt lo pide expresamente
// («no inventes datos que falten; déjalo visible como faltante»), y acá faltan dos cosas
// sin las cuales la tabla `Proceso` no se puede poblar.

import { ETIQUETA_TIPO, type TipoProceso } from '@/lib/sig/procesos';

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
  creado: boolean;
  areaSugerida: { id: number; nombre: string } | null;
  cargo: { estado: string; candidatos: { id: number; nombre: string }[]; cargoId: number | null };
  colgando: { programadas: number; requisitos: number; celdas: number };
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

      <div className="mt-5 overflow-x-auto rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Proceso</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Área</th>
              <th className="px-4 py-3 font-semibold">Dueño (cargo)</th>
              <th className="px-4 py-3 text-right font-semibold">Programa</th>
              <th className="px-4 py-3 text-right font-semibold">Legales</th>
              <th className="px-4 py-3 text-right font-semibold">Celdas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const t = COLOR_TIPO[f.tipo];
              const sinNada =
                f.colgando.programadas === 0 && f.colgando.requisitos === 0 && f.colgando.celdas === 0;
              return (
                <tr key={f.codigo} className="border-t border-border-default">
                  <td className="px-4 py-3 font-mono text-11 font-semibold text-accent">{f.codigo}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-primary">{f.nombre}</div>
                    <div className="text-10_5 text-muted">{f.ocupaHoy}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9 font-semibold uppercase"
                      style={{ background: t.fondo, color: t.texto }}
                    >
                      {ETIQUETA_TIPO[f.tipo]}
                    </span>
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
                  <Conteo n={f.colgando.requisitos} />
                  <Conteo n={f.colgando.celdas} />
                  {sinNada && <td className="hidden" />}
                </tr>
              );
            })}
          </tbody>
        </table>
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

function Conteo({ n }: { n: number }) {
  return (
    <td className="px-4 py-3 text-right font-mono text-11_5 tabular-nums">
      {n === 0 ? <span className="text-faint">—</span> : <span className="text-primary">{n}</span>}
    </td>
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
