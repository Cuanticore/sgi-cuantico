// app/components/sgsi/parametros/ParametrosModelo.tsx
//
// Handoff v2.1 screen 9, "Configuración del modelo". Eight sections, one per family of
// parameters, with a sticky index of links across the top.
//
// The screen is a server component: nothing here is interactive except the section index
// and the eight support catalogues, and each is a separate client island. Everything else
// is a rendering of rows the engine reads, so it can never disagree with the engine.
//
// Three things this screen must never do, all of which the v1 tool did:
//
//   1. Print a scale value that is also a table row. "L3 = 90%" written into the JSX
//      keeps saying 90% after the Committee moves the row.
//   2. Present the acceptance deadlines as settled. MET-SIG-01 records that the Committee
//      has not ratified them, and `ratificado` carries that on every row.
//   3. Carry the zone cuts as constants. They are derived from the impact bands and the
//      annual frequency, so a rescale of the 0–5 scale moves them too.

import Link from 'next/link';
import { ZONAS } from '@/lib/sgsi/clasificar';
import IndiceSecciones, { type Seccion } from './IndiceSecciones';
import CatalogoEditable from './CatalogoEditable';

export interface ParametroVista {
  clave: string;
  valor: string;
  descripcion: string | null;
  actualizado: string | null;
}
export interface DimensionVista {
  codigo: string;
  nombre: string;
  activa: boolean;
}
export interface ValorVista {
  valor: number;
  etiqueta: string;
}
export interface DegradacionVista {
  nombre: string;
  factor: number;
  lectura: string | null;
}
export interface FrecuenciaVista {
  nombre: string;
  vecesAno: number;
}
export interface MadurezVista {
  nivel: number;
  nombre: string;
  eficacia: number;
  lectura: string | null;
}
export interface UmbralVista {
  nombre: string;
  desde: number;
  hasta: number;
}
export interface CriterioVista {
  umbral: string;
  decision: string;
  plazoPlan: string;
  plazoEjecucion: string;
  aprueba: string;
  ratificado: boolean;
}
export interface RelevanciaVista {
  nombre: string;
  peso: number;
  esPrincipal: boolean;
  criterio: string;
}
export interface CortesZonaVista {
  impactoAlto: number | null;
  impactoBajo: number | null;
  aroFrecuente: number | null;
}
export interface TipoVista {
  codigo: string;
  nombre: string;
  abreviatura: string;
  subtipos: number;
  activos: number;
  amenazas: number;
}
export interface AreaVista {
  id: number;
  prefijo: string;
  nombre: string;
  lider: string | null;
  activos: number;
  activa: boolean;
}
/// The shape every editable support catalogue travels in. `id` is what the mutation layer
/// addresses: the name is editable, so it can never be the handle.
export interface CatalogoVista {
  id: number;
  nombre: string;
  protegido: boolean;
  activo: boolean;
  usos: number;
}
export interface ConteoVista {
  nombre: string | null;
  conteo: number | null;
}
export interface RepartoVista {
  campo: string;
  reparto: ConteoVista[];
}
export interface CapacidadVista {
  id: number;
  nombre: string;
  nombreCorto: string;
  controles: number;
  aplicables: number;
  eficaciaMedia: number | null;
  objetivoMedio: number | null;
}
export interface CargoVista {
  id: number;
  nombre: string;
  activo: boolean;
  usos: number;
}

export interface ParametrosVista {
  parametros: ParametroVista[];
  dimensiones: DimensionVista[];
  valores: ValorVista[];
  degradaciones: DegradacionVista[];
  frecuencias: FrecuenciaVista[];
  madureces: MadurezVista[];
  umbralesImpacto: UmbralVista[];
  umbralesRiesgo: UmbralVista[];
  criterios: CriterioVista[];
  relevancias: RelevanciaVista[];
  cortesZona: CortesZonaVista;
  tipos: TipoVista[];
  subtiposTotal: number;
  amenazasTotal: number;
  areas: AreaVista[];
  ubicaciones: CatalogoVista[];
  entornos: CatalogoVista[];
  proveedores: CatalogoVista[];
  tratamientos: CatalogoVista[];
  estadosTratamiento: CatalogoVista[];
  gruposAmenaza: ConteoVista[];
  tiposEvidencia: ConteoVista[];
  funcionesControl: ConteoVista[];
  contenidoSensible: RepartoVista[];
  capacidades: CapacidadVista[];
  cargos: CargoVista[];
  lineaBase: { nombre: string; fecha: string | null } | null;
  activosTotal: number;
}

const SECCIONES: Seccion[] = [
  { id: 'globales', numero: 1, etiqueta: 'Parámetros globales' },
  { id: 'tipos', numero: 2, etiqueta: 'Tipos y subtipos' },
  { id: 'escalas', numero: 3, etiqueta: 'Escalas' },
  { id: 'umbrales', numero: 4, etiqueta: 'Umbrales' },
  { id: 'zonas', numero: 5, etiqueta: 'Zonas y aceptación' },
  { id: 'procesos', numero: 6, etiqueta: 'Procesos y codificación' },
  { id: 'catalogos', numero: 7, etiqueta: 'Catálogos de listas' },
  { id: 'capacidades', numero: 8, etiqueta: 'Capacidades y roles' },
];

/// MET-SIG-01 §13. These six have no table behind them — the tool's `cargo_responsable`
/// catalogue is the list of PEOPLE-shaped positions the rows point at, which is a
/// different list — so they are transcribed from the approved document and labelled as
/// such. The responsibilities are rendered in full on the Metodología screen.
const ROLES_METODOLOGIA = [
  ['Comité del SIG', 'Aprueba la metodología y los criterios de aceptación. Decide el tratamiento de los riesgos Alto y Crítico.'],
  ['Líder del SIG', 'Mantiene el inventario y la valoración, consolida los resultados y convoca las revisiones.'],
  ['Propietario del activo', 'Valora el activo en las tres dimensiones y responde por las decisiones de tratamiento que le corresponden.'],
  ['Custodio del activo', 'Opera el activo y aporta la información técnica sobre los controles existentes y su madurez.'],
  ['Gestión Tecnológica', 'Estima la frecuencia y la degradación de las amenazas técnicas y valora la madurez de los controles.'],
  ['Dueños de proceso', 'Identifican activos nuevos en su proceso y reportan cambios.'],
] as const;

const TERNARIO: Record<string, string> = {
  SI: 'Sí',
  NO: 'No',
  POR_DEFINIR: 'Por definir',
};

const EVIDENCIA: Record<string, string> = {
  ENLACE: 'Enlace',
  ARCHIVO: 'Archivo',
  NOTA: 'Nota',
};

/// Numbers print in the reader's locale conventions — a comma for the decimal mark — and
/// never with trailing zeros they did not earn.
function num(v: number, decimales = 2): string {
  return v.toLocaleString('es-CO', {
    maximumFractionDigits: decimales,
    minimumFractionDigits: 0,
  });
}

function pct(v: number, decimales = 0): string {
  return `${num(v, decimales)} %`;
}

/// The band's own bounds, read from the row. A band that runs to the top of the scale
/// prints as "≥ desde" rather than inventing an upper bound the row does not claim.
function rango(u: UmbralVista, techo: number): string {
  if (u.hasta >= techo) return `≥ ${num(u.desde)}`;
  return `${num(u.desde)} – ${num(u.hasta)}`;
}

export default function ParametrosModelo({ datos }: { datos: ParametrosVista }) {
  const activas = datos.dimensiones.filter((d) => d.activa);
  const escalaMin = datos.valores.length > 0 ? Math.min(...datos.valores.map((v) => v.valor)) : null;
  const escalaMax = datos.valores.length > 0 ? Math.max(...datos.valores.map((v) => v.valor)) : null;

  const techoImpacto =
    datos.umbralesImpacto.length > 0 ? Math.max(...datos.umbralesImpacto.map((u) => u.hasta)) : 0;
  const techoRiesgo =
    datos.umbralesRiesgo.length > 0 ? Math.max(...datos.umbralesRiesgo.map((u) => u.hasta)) : 0;

  const sinRatificar = datos.criterios.filter((c) => !c.ratificado).length;

  // An example of the asset code built from real rows, so it cannot describe a prefix or
  // an abbreviation the catalogue does not have.
  const ejemploCodigo =
    datos.areas.length > 0 && datos.tipos.length > 0
      ? `${datos.areas[0].prefijo}-${datos.tipos[0].abreviatura}-0001`
      : null;

  const z = datos.cortesZona;
  const zonaDerivable =
    z.impactoAlto !== null && z.impactoBajo !== null && z.aroFrecuente !== null;

  const reglasZona: Record<string, string> = zonaDerivable
    ? {
        'Zona 1 — Crítica': `impacto ≥ ${num(z.impactoAlto!)} y frecuencia ≥ ${num(z.aroFrecuente!)} vez/año`,
        'Zona 4 — Catastrófica poco probable': `impacto ≥ ${num(z.impactoAlto!)} y frecuencia < ${num(z.aroFrecuente!)} vez/año`,
        'Zona 3 — Asumible': `impacto < ${num(z.impactoBajo!)} y frecuencia < ${num(z.aroFrecuente!)} vez/año`,
        'Zona 2 — Atención': 'todo lo demás',
      }
    : {};

  return (
    <main className="px-8 pt-6 pb-14">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="titulo-pagina">Configuración del modelo</h1>
          <p className="parrafo text-muted">
            Todo lo que el motor lee para calcular. Las escalas, los umbrales y los
            catálogos son filas de la base, no constantes del código: cambiar una aquí
            recalcula el análisis completo sin un despliegue. Esta pantalla no guarda una
            copia de ningún valor — lo lee de la misma tabla que el cálculo.
          </p>
        </header>

        <IndiceSecciones secciones={SECCIONES} />

        {/* ── 1 ─────────────────────────────────────────────────────────────────── */}
        <Seccion
          id="globales"
          numero={1}
          titulo="Parámetros globales"
          descripcion="Los tunables del motor, en una sola tabla clave/valor. El umbral de valoración decide qué activos entran al análisis; el borrado físico deshabilitado es lo que hace que toda baja sea lógica y que la bitácora sea completa."
        >
          <Rejilla>
            <Tarjeta titulo={`Parámetros del motor · ${datos.parametros.length}`}>
              <table className="w-full border-collapse text-12">
                <tbody>
                  {datos.parametros.map((p) => (
                    <tr key={p.clave} className="border-b border-hairline last:border-b-0">
                      <td className="py-1.5 pr-3 align-top">
                        <span className="font-mono text-11 text-secondary">{p.clave}</span>
                        {p.descripcion && (
                          <span className="block text-10_5 leading-snug text-faint">
                            {p.descripcion}
                          </span>
                        )}
                      </td>
                      <td className="w-32 py-1.5 text-right align-top">
                        <span className="rounded-badge bg-accent-100 px-1.5 py-0.5 font-mono text-11 text-accent-700">
                          {p.valor}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>

            <div className="flex min-w-0 flex-col gap-4">
              <Tarjeta
                titulo={`Dimensiones de seguridad · ${activas.length} de ${datos.dimensiones.length} activas`}
                pie="MAGERIT define cinco. Cuántico declara la desviación y trabaja con las tres primeras; Autenticidad y Trazabilidad siguen modeladas e inactivas para que la decisión sea reversible sin migración."
              >
                <ul className="flex flex-col">
                  {datos.dimensiones.map((d) => (
                    <li
                      key={d.codigo}
                      className="flex items-center gap-2 border-b border-hairline py-1.5 last:border-b-0"
                    >
                      <span className="w-6 shrink-0 font-mono text-11 font-semibold text-secondary">
                        {d.codigo}
                      </span>
                      <span className="min-w-0 flex-1 text-12 text-primary">{d.nombre}</span>
                      <Distintivo
                        texto={d.activa ? 'activa' : 'inactiva'}
                        tono={d.activa ? 'acento' : 'neutro'}
                      />
                    </li>
                  ))}
                </ul>
              </Tarjeta>

              <Tarjeta titulo="Escala vigente y corte de la evaluación">
                <dl className="flex flex-col gap-2">
                  <Dato
                    etiqueta="Escala de valoración"
                    valor={
                      escalaMin === null
                        ? 'sin escala cargada'
                        : `${escalaMin}–${escalaMax} · ${datos.valores.length} niveles`
                    }
                  />
                  <Dato
                    etiqueta="Línea base vigente"
                    valor={
                      datos.lineaBase
                        ? `${datos.lineaBase.nombre}${datos.lineaBase.fecha ? ` · ${datos.lineaBase.fecha}` : ''}`
                        : 'sin establecer'
                    }
                  />
                  <Dato etiqueta="Activos vigentes" valor={num(datos.activosTotal, 0)} />
                  <Dato
                    etiqueta="Amenazas activas del catálogo"
                    valor={num(datos.amenazasTotal, 0)}
                  />
                </dl>
              </Tarjeta>
            </div>
          </Rejilla>
        </Seccion>

        {/* ── 2 ─────────────────────────────────────────────────────────────────── */}
        <Seccion
          id="tipos"
          numero={2}
          titulo="Tipos y subtipos MAGERIT"
          descripcion="La clasificación no es decorativa: el tipo determina qué amenazas se aplican al activo y, por tanto, qué riesgos se valoran. La abreviatura es la que entra en el código del activo."
        >
          <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
            <div style={{ minWidth: 880 }}>
              <table className="w-full border-collapse text-12">
                <thead>
                  <tr className="bg-subtle text-left">
                    <Th ancho={96}>Código</Th>
                    <Th>Tipo de activo</Th>
                    <Th ancho={110}>Abreviatura</Th>
                    <Th ancho={110}>Subtipos</Th>
                    <Th ancho={140}>Amenazas aplicables</Th>
                    <Th ancho={110}>Activos</Th>
                  </tr>
                </thead>
                <tbody>
                  {datos.tipos.map((t) => (
                    <tr key={t.codigo} className="border-t border-hairline">
                      <Td>
                        <span className="font-mono text-11 text-secondary">{t.codigo}</span>
                      </Td>
                      <Td>
                        <span className="text-12_5 text-primary">{t.nombre}</span>
                      </Td>
                      <Td>
                        <span className="rounded-badge bg-subtle px-1.5 py-0.5 font-mono text-11 text-secondary">
                          {t.abreviatura}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-11 tabular-nums text-muted">
                          {num(t.subtipos, 0)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-11 tabular-nums text-muted">
                          {t.amenazas === 0 ? 'sin parametrizar' : num(t.amenazas, 0)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-11 tabular-nums text-muted">
                          {num(t.activos, 0)}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-11 text-faint">
            {num(datos.tipos.length, 0)} tipos y {num(datos.subtiposTotal, 0)} subtipos. La
            preclasificación amenaza–tipo es la que genera los riesgos, y se edita en{' '}
            <Link href="/sgsi/amenazas" className="text-accent-700 underline underline-offset-2">
              Amenazas y tipos
            </Link>
            .
          </p>
        </Seccion>

        {/* ── 3 ─────────────────────────────────────────────────────────────────── */}
        <Seccion
          id="escalas"
          numero={3}
          titulo="Las cuatro escalas"
          descripcion="Valor, degradación, frecuencia y madurez. Cada fila operativa referencia el nivel, nunca el número: eso es lo que permite volver a cinco dimensiones o a una escala 0–10 sin tocar el código."
        >
          <Rejilla>
            <Tarjeta
              titulo="Valor del activo en una dimensión"
              pie="Se selecciona con una lista que describe cada nivel, nunca escribiendo un número suelto."
            >
              <TablaSimple
                cabeceras={['Etiqueta', 'Valor']}
                filas={datos.valores.map((v) => [v.etiqueta, num(v.valor, 0)])}
              />
            </Tarjeta>

            <Tarjeta
              titulo="Degradación"
              pie="Atributo de la amenaza y por dimensión. Los controles que limitan el daño se reflejan aquí, bajando la degradación, no en el impacto."
            >
              <TablaSimple
                cabeceras={['Grado', 'Fracción', 'Lectura']}
                filas={datos.degradaciones.map((d) => [
                  d.nombre,
                  pct(d.factor * 100),
                  d.lectura ?? '—',
                ])}
              />
            </Tarjeta>

            <Tarjeta
              titulo="Frecuencia esperada (ARO)"
              pie="Veces al año que se estima que la amenaza se materializará. Es la que la eficacia de los controles reduce."
            >
              <TablaSimple
                cabeceras={['Frecuencia', 'Veces/año']}
                filas={datos.frecuencias.map((f) => [f.nombre, num(f.vecesAno, 2)])}
              />
            </Tarjeta>

            <Tarjeta
              titulo="Madurez CMM y eficacia"
              pie="El salto grande está entre L2 y L3. De L3 a L5 solo se gana el resto: lo que cambia el riesgo es pasar de «se hace a su manera» a «hay un proceso definido»."
            >
              <TablaSimple
                cabeceras={['Nivel', 'Nombre', 'Eficacia']}
                filas={datos.madureces.map((m) => [`L${m.nivel}`, m.nombre, pct(m.eficacia * 100)])}
              />
            </Tarjeta>
          </Rejilla>

          <Tarjeta
            titulo="Relevancia del control dentro del grupo que mitiga una amenaza"
            pie="La eficacia que entra al cálculo es la de la combinación, ponderada por relevancia y acotada por el control principal. La media simple esconde el eslabón débil; los controles secundarios acompañan al principal, no lo sustituyen."
          >
            <div className="tabla-ancha">
              <div style={{ minWidth: 560 }}>
                <table className="w-full border-collapse text-12">
                  <thead>
                    <tr className="bg-subtle text-left">
                      <Th ancho={150}>Relevancia</Th>
                      <Th ancho={70}>Peso</Th>
                      <Th>Criterio de asignación</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.relevancias.map((r) => (
                      <tr key={r.nombre} className="border-t border-hairline">
                        <Td>
                          <span className="text-12_5 text-primary">{r.nombre}</span>
                          {r.esPrincipal && (
                            <Distintivo texto="uno por amenaza" tono="acento" />
                          )}
                        </Td>
                        <Td>
                          <span className="font-mono text-11 tabular-nums text-secondary">
                            {num(r.peso, 0)}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-11_5 leading-snug text-muted">{r.criterio}</span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Tarjeta>
        </Seccion>

        {/* ── 4 ─────────────────────────────────────────────────────────────────── */}
        <Seccion
          id="umbrales"
          numero={4}
          titulo="Umbrales de impacto y de riesgo"
          descripcion="Las bandas se clasifican en tiempo de lectura, nunca se almacenan. Una banda guardada es un segundo sitio donde puede vivir la misma cifra, y dos sitios es como un informe termina contradiciéndose."
        >
          <Rejilla>
            <Tarjeta
              titulo="Nivel de impacto"
              pie="Sobre el impacto acumulado, que queda en la misma escala que el valor del activo."
            >
              <TablaSimple
                cabeceras={['Nivel', 'Rango']}
                filas={datos.umbralesImpacto.map((u) => [u.nombre, rango(u, techoImpacto)])}
              />
            </Tarjeta>

            <Tarjeta
              titulo="Nivel de riesgo"
              pie="Sobre impacto × veces por año. La misma banda clasifica el riesgo potencial y el residual: lo que cambia entre uno y otro no es el criterio, sino dónde cae el riesgo una vez descontada la eficacia."
            >
              <TablaSimple
                cabeceras={['Nivel', 'Rango']}
                filas={datos.umbralesRiesgo.map((u) => [u.nombre, rango(u, techoRiesgo)])}
              />
            </Tarjeta>
          </Rejilla>
        </Seccion>

        {/* ── 5 ─────────────────────────────────────────────────────────────────── */}
        <Seccion
          id="zonas"
          numero={5}
          titulo="Zonas de riesgo y criterios de aceptación"
          descripcion="Las zonas de MAGERIT (Libro I, cap. 3) separan lo crítico de lo catastrófico poco probable. Sus cortes no son constantes: salen del límite inferior de la banda de impacto Alto, del de la banda Medio y de la frecuencia anual."
        >
          <Rejilla>
            <Tarjeta
              titulo="Zonas"
              pie={
                zonaDerivable
                  ? 'Se evalúan en orden estricto: gana la primera regla que se cumple, de modo que «impacto alto y frecuente» se decide antes que «impacto alto y raro».'
                  : undefined
              }
            >
              {zonaDerivable ? (
                <TablaSimple
                  cabeceras={['Zona', 'Regla']}
                  filas={ZONAS.map((z) => [z, reglasZona[z] ?? '—'])}
                />
              ) : (
                <p className="parrafo text-11_5 text-danger-text">
                  Los cortes de zona no se pueden derivar: falta la banda de impacto Alto,
                  la banda Medio o la frecuencia anual. La pantalla no inventa un número
                  para llenar el hueco.
                </p>
              )}
            </Tarjeta>

            <Tarjeta
              titulo={`Criterios de aceptación · ${datos.criterios.length}`}
              pie="Aceptar un riesgo Alto o Crítico requiere aprobación expresa del Comité, con justificación escrita y fecha de revisión. Un riesgo aceptado sin registro no es una decisión: es un olvido."
            >
              <div className="tabla-ancha">
                <div style={{ minWidth: 620 }}>
                  <table className="w-full border-collapse text-12">
                    <thead>
                      <tr className="bg-subtle text-left">
                        <Th ancho={90}>Residual</Th>
                        <Th>Decisión</Th>
                        <Th ancho={190}>Plazos</Th>
                        <Th ancho={150}>Aprueba</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.criterios.map((c) => (
                        <tr key={c.umbral} className="border-t border-hairline">
                          <Td>
                            <span className="font-mono text-11 text-secondary">{c.umbral}</span>
                          </Td>
                          <Td>
                            <span className="text-11_5 leading-snug text-primary">
                              {c.decision}
                            </span>
                          </Td>
                          <Td>
                            <span className="text-11 leading-snug text-muted">
                              Plan: {c.plazoPlan} · Ejecución: {c.plazoEjecucion}
                            </span>
                            <Distintivo
                              texto={c.ratificado ? 'ratificado' : 'pendiente de ratificación'}
                              tono={c.ratificado ? 'acento' : 'aviso'}
                            />
                          </Td>
                          <Td>
                            <span className="text-11_5 text-muted">{c.aprueba}</span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {sinRatificar > 0 && (
                <p className="parrafo rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-11_5 text-warn-text">
                  {sinRatificar === datos.criterios.length
                    ? 'Ninguno de estos plazos está ratificado todavía.'
                    : `${sinRatificar} de ${datos.criterios.length} plazos no están ratificados todavía.`}{' '}
                  MET-SIG-01 registra que el Comité del SIG aún no los ha ratificado, de
                  modo que son la propuesta vigente y no un compromiso adquirido. La
                  herramienta los aplica marcados como tales hasta que el acta los confirme.
                </p>
              )}
            </Tarjeta>
          </Rejilla>
        </Seccion>

        {/* ── 6 ─────────────────────────────────────────────────────────────────── */}
        <Seccion
          id="procesos"
          numero={6}
          titulo="Procesos y prefijos de codificación"
          descripcion="El código del activo se compone del prefijo del área responsable, la abreviatura del tipo MAGERIT y un consecutivo de cuatro dígitos independiente por cada combinación área/tipo. Lo genera el sistema, es inmutable, no se reutiliza y nunca es editable."
        >
          {ejemploCodigo && (
            <div className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-border-default bg-subtle px-4 py-3">
              <span className="etiqueta-campo">Regla</span>
              <span className="font-mono text-13 text-primary">AAA-TTT-NNNN</span>
              <span className="text-11_5 text-muted">
                por ejemplo <span className="font-mono text-secondary">{ejemploCodigo}</span> ={' '}
                {datos.areas[0].nombre} · {datos.tipos[0].nombre}
              </span>
            </div>
          )}

          <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
            <div style={{ minWidth: 780 }}>
              <table className="w-full border-collapse text-12">
                <thead>
                  <tr className="bg-subtle text-left">
                    <Th ancho={90}>Prefijo</Th>
                    <Th>Proceso o área</Th>
                    <Th ancho={230}>Líder</Th>
                    <Th ancho={100}>Activos</Th>
                    <Th ancho={110}>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {datos.areas.map((a) => (
                    <tr key={a.id} className="border-t border-hairline">
                      <Td>
                        <span className="rounded-badge bg-subtle px-1.5 py-0.5 font-mono text-11 text-secondary">
                          {a.prefijo}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-12_5 text-primary">{a.nombre}</span>
                      </Td>
                      <Td>
                        <span className="text-11_5 text-muted">{a.lider ?? 'sin asignar'}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-11 tabular-nums text-muted">
                          {num(a.activos, 0)}
                        </span>
                      </Td>
                      <Td>
                        <Distintivo
                          texto={a.activa ? 'activa' : 'inactiva'}
                          tono={a.activa ? 'acento' : 'neutro'}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Tarjeta
            titulo={`Alta, renombrado y baja de procesos · ${datos.areas.length}`}
            pie="El prefijo se fija en el alta y no se puede cambiar: ya está dentro del código de cada activo del área, y el código es inmutable. Renombrar el proceso sí es libre — el nombre no es la clave. Un proceso con activos vigentes no se retira: su consecutivo sigue en uso y los activos necesitan su área para mostrarse."
          >
            <CatalogoEditable
              catalogo="area"
              sustantivoUso="activo"
              pidePrefijo
              items={datos.areas.map((a) => ({
                id: a.id,
                nombre: a.nombre,
                prefijo: a.prefijo,
                activo: a.activa,
                usos: a.activos,
              }))}
            />
          </Tarjeta>
        </Seccion>

        {/* ── 7 ─────────────────────────────────────────────────────────────────── */}
        <Seccion
          id="catalogos"
          numero={7}
          titulo="Catálogos de listas"
          descripcion="Listas cerradas en lugar de texto libre. El texto libre es lo que en producción produjo «Líder del SIG» junto a «Lider del SIG» y nombres de personas en una columna de rol. El valor protegido de un catálogo no se puede eliminar."
        >
          <Rejilla>
            <Tarjeta titulo={`Ubicaciones · ${datos.ubicaciones.length} — editable`}>
              <CatalogoEditable
                catalogo="ubicacion"
                items={datos.ubicaciones}
                sustantivoUso="activo"
              />
            </Tarjeta>

            <Tarjeta titulo={`Entornos · ${datos.entornos.length} — editable`}>
              <CatalogoEditable catalogo="entorno" items={datos.entornos} sustantivoUso="activo" />
            </Tarjeta>

            <Tarjeta titulo={`Proveedores · ${datos.proveedores.length} — editable`}>
              <CatalogoEditable
                catalogo="proveedor"
                items={datos.proveedores}
                sustantivoUso="activo"
              />
            </Tarjeta>

            <Tarjeta
              titulo="Contenido sensible del activo"
              pie="Respuestas ternarias a propósito: «por definir» tiene que seguir siendo distinguible de «no», sobre todo en la pregunta de datos personales bajo la Ley 1581."
            >
              <div className="flex flex-col gap-2.5">
                {datos.contenidoSensible.map((c) => (
                  <div key={c.campo} className="flex flex-col gap-1">
                    <span className="text-11_5 text-primary">{c.campo}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {c.reparto.length === 0 ? (
                        <span className="text-10_5 text-faint">sin activos registrados</span>
                      ) : (
                        c.reparto.map((r) => (
                          <span
                            key={r.nombre ?? 'nulo'}
                            className="rounded-badge bg-subtle px-1.5 py-0.5 font-mono text-10 text-secondary"
                          >
                            {TERNARIO[r.nombre ?? ''] ?? r.nombre ?? '—'} · {num(r.conteo ?? 0, 0)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Tarjeta>

            <Tarjeta
              titulo="Tipos de evidencia"
              pie="Por control, nunca por riesgo. Sin evidencia el nivel no se sostiene ante un auditor, y el máximo admisible en auditoría es L2."
            >
              <ListaConteo
                filas={datos.tiposEvidencia.map((t) => ({
                  nombre: EVIDENCIA[t.nombre ?? ''] ?? t.nombre ?? '—',
                  conteo: t.conteo,
                }))}
                sufijo="registradas"
                vacio="sin evidencias registradas"
              />
            </Tarjeta>

            <Tarjeta
              titulo={`Opciones de tratamiento · ${datos.tratamientos.length} — editable`}
              pie="Catálogo en lugar de enumeración fija: la pertenencia está en disputa entre las fuentes y el Comité puede cambiarla. El riesgo apunta a esta lista de forma opcional, así que retirar un valor no deja ningún riesgo sin decisión: los que ya lo eligieron lo conservan."
            >
              <CatalogoEditable
                catalogo="tratamiento"
                items={datos.tratamientos}
                sustantivoUso="riesgo"
              />
            </Tarjeta>

            <Tarjeta
              titulo={`Estado del tratamiento · ${datos.estadosTratamiento.length} — editable`}
              pie="El avance de la decisión, no la decisión. También es opcional en el riesgo, así que retirar un estado no deja ningún riesgo sin avance: los que ya lo eligieron lo conservan."
            >
              <CatalogoEditable
                catalogo="estadoTratamiento"
                items={datos.estadosTratamiento}
                sustantivoUso="riesgo"
              />
            </Tarjeta>

            <Tarjeta
              titulo="Grupos de amenazas"
              pie="Los cuatro grupos del capítulo 5 del Libro II de MAGERIT. El asterisco de N.* e I.* es literal: son entradas reales del catálogo, no marcadores."
            >
              <ListaConteo
                filas={datos.gruposAmenaza}
                sufijo="amenazas"
                vacio="sin amenazas cargadas"
              />
            </Tarjeta>

            <Tarjeta
              titulo="Efecto del control"
              pie="Registrado y todavía sin usar en el cálculo: Cuántico modela solo el efecto preventivo, y la composición por función no está implementada."
            >
              <ListaConteo
                filas={datos.funcionesControl.map((f) => ({
                  nombre: f.nombre ?? 'sin clasificar',
                  conteo: f.conteo,
                }))}
                sufijo="controles"
                vacio="sin clasificar"
              />
            </Tarjeta>
          </Rejilla>
        </Seccion>

        {/* ── 8 ─────────────────────────────────────────────────────────────────── */}
        <Seccion
          id="capacidades"
          numero={8}
          titulo="Capacidades operativas y roles"
          descripcion="El diagrama de araña se construye sobre las quince capacidades operativas de ISO/IEC 27002:2022, no sobre los cuatro dominios del Anexo A: cuatro ejes no muestran nada, quince dan la resolución necesaria para ver dónde está el desequilibrio."
        >
          <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
            <div style={{ minWidth: 880 }}>
              <table className="w-full border-collapse text-12">
                <thead>
                  <tr className="bg-subtle text-left">
                    <Th>Capacidad operativa</Th>
                    <Th ancho={130}>Eje del radar</Th>
                    <Th ancho={110}>Controles</Th>
                    <Th ancho={110}>Aplicables</Th>
                    <Th ancho={170}>Eficacia media</Th>
                    <Th ancho={120}>Objetivo medio</Th>
                  </tr>
                </thead>
                <tbody>
                  {datos.capacidades.map((c) => (
                    <tr key={c.id} className="border-t border-hairline">
                      <Td>
                        <span className="text-12_5 text-primary">{c.nombre}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-11 text-muted">{c.nombreCorto}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-11 tabular-nums text-muted">
                          {num(c.controles, 0)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-11 tabular-nums text-muted">
                          {num(c.aplicables, 0)}
                        </span>
                      </Td>
                      <Td>
                        {c.eficaciaMedia === null ? (
                          <span className="text-11 text-faint">sin calificar</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-swatch bg-hairline">
                              <span
                                className="block h-full rounded-swatch bg-accent-500"
                                style={{ width: `${c.eficaciaMedia}%` }}
                              />
                            </span>
                            <span className="font-mono text-11 tabular-nums text-secondary">
                              {pct(c.eficaciaMedia, 1)}
                            </span>
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="font-mono text-11 tabular-nums text-muted">
                          {c.objetivoMedio === null ? '—' : `L${num(c.objetivoMedio, 1)}`}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="parrafo text-11 text-faint">
            La eficacia media se promedia porque es una escala de razón y es la que alimenta
            el riesgo residual. El objetivo medio se muestra como referencia del compromiso
            del plan; el nivel L0–L5 es ordinal y su promedio no es riguroso como medida de
            madurez.
          </p>

          <Rejilla>
            <Tarjeta
              titulo="Roles del análisis de riesgos · 6"
              pie="Transcritos de MET-SIG-01 §13. Son responsabilidades del método, no filas de un catálogo: el catálogo de cargos de la herramienta es la lista de posiciones a las que apuntan los activos, los controles y las acciones."
            >
              <ul className="flex flex-col">
                {ROLES_METODOLOGIA.map(([rol, responsabilidad]) => (
                  <li
                    key={rol}
                    className="flex flex-col gap-0.5 border-b border-hairline py-2 last:border-b-0"
                  >
                    <span className="text-12_5 text-primary">{rol}</span>
                    <span className="text-11 leading-snug text-muted">{responsabilidad}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>

            <Tarjeta
              titulo={`Catálogo de cargos responsables · ${datos.cargos.length} — editable`}
              pie="El conteo suma cuanto referencia al cargo: activos como propietario o custodio, controles, riesgos, acciones del plan que ejecuta o aprueba, y áreas lideradas. Un cargo con cero referencias es candidato a baja."
            >
              <CatalogoEditable
                catalogo="cargo"
                items={datos.cargos.map((c) => ({
                  id: c.id,
                  nombre: c.nombre,
                  activo: c.activo,
                  usos: c.usos,
                }))}
                sustantivoUso="referencia"
              />
            </Tarjeta>

            <Tarjeta
              titulo={`Nombres de las capacidades · ${datos.capacidades.length} — editable`}
              pie="Solo renombrar. Cada control apunta obligatoriamente a una capacidad, así que una baja dejaría controles sin capacidad y una decimosexta sería un eje del radar sin ningún control detrás. El segundo campo es el nombre corto: es lo que cabe en el eje del radar y en las columnas angostas."
            >
              <CatalogoEditable
                catalogo="capacidad"
                items={datos.capacidades.map((c) => ({
                  id: c.id,
                  nombre: c.nombre,
                  nombreCorto: c.nombreCorto,
                  activo: true,
                  usos: c.controles,
                }))}
                sustantivoUso="control"
                permiteAlta={false}
                permiteBaja={false}
                pideNombreCorto
              />
            </Tarjeta>
          </Rejilla>

          <p className="parrafo text-11 text-faint">
            El detalle del método — desviaciones declaradas, fórmulas, ciclo de valoración y
            responsabilidades completas — está en{' '}
            <Link href="/sgsi/metodologia" className="text-accent-700 underline underline-offset-2">
              MET-SIG-01 Metodología
            </Link>
            .
          </p>
        </Seccion>
      </div>
    </main>
  );
}

/* ── Piezas ─────────────────────────────────────────────────────────────────── */

function Seccion({
  id,
  numero,
  titulo,
  descripcion,
  children,
}: {
  id: string;
  numero: number;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 74 }} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-10_5 tracking-[0.08em] text-label">
            {String(numero).padStart(2, '0')}
          </span>
          <h2 className="text-17 font-semibold tracking-[-0.01em] text-primary">{titulo}</h2>
        </div>
        {descripcion && <p className="parrafo text-12_5 text-muted">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}

/// Two columns when there is room, one when there is not. `minmax(380px, 1fr)` with
/// `min-width: 0` on the cards, never fixed fractions: a fixed fraction is what lets a
/// wide table push the page sideways.
function Rejilla({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}
    >
      {children}
    </div>
  );
}

function Tarjeta({
  titulo,
  pie,
  children,
}: {
  titulo: string;
  pie?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-tarjeta border border-border-default bg-surface p-4">
      <h3 className="etiqueta-campo">{titulo}</h3>
      {children}
      {pie && <p className="parrafo text-10_5 leading-relaxed text-faint">{pie}</p>}
    </section>
  );
}

function TablaSimple({
  cabeceras,
  filas,
}: {
  cabeceras: string[];
  filas: (string | number)[][];
}) {
  return (
    <table className="w-full border-collapse text-12">
      <thead>
        <tr className="text-left">
          {cabeceras.map((c) => (
            <th key={c} className="etiqueta-campo pb-1.5 font-normal">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-t border-hairline">
            {f.map((celda, j) => (
              <td
                key={j}
                className={`py-1.5 pr-3 align-top ${
                  j === 0 ? 'text-12 text-primary' : 'text-11_5 text-muted'
                } ${j > 0 && typeof celda === 'string' && /^[\d\s.,%≥<–-]+$/.test(celda) ? 'font-mono tabular-nums' : ''}`}
              >
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ListaConteo({
  filas,
  sufijo,
  vacio,
}: {
  filas: ConteoVista[];
  sufijo: string;
  vacio: string;
}) {
  if (filas.length === 0) {
    return <p className="text-11_5 text-faint">{vacio}</p>;
  }
  return (
    <ul className="flex flex-col">
      {filas.map((f) => (
        <li
          key={f.nombre ?? 'nulo'}
          className="flex items-baseline gap-2 border-b border-hairline py-1.5 last:border-b-0"
        >
          <span className="min-w-0 flex-1 text-12 text-primary">{f.nombre ?? '—'}</span>
          <span className="shrink-0 font-mono text-10 tabular-nums text-faint">
            {f.conteo === null ? '—' : `${f.conteo} ${sufijo}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1.5 last:border-b-0 last:pb-0">
      <dt className="etiqueta-campo">{etiqueta}</dt>
      <dd className="font-mono text-11_5 text-secondary">{valor}</dd>
    </div>
  );
}

/// Every state on this screen is spelled out in words. Colour reinforces the badge, it
/// never carries it alone.
function Distintivo({ texto, tono }: { texto: string; tono: 'acento' | 'aviso' | 'neutro' }) {
  const estilo =
    tono === 'acento'
      ? 'border-accent-border bg-accent-100 text-accent-700'
      : tono === 'aviso'
        ? 'border-warn-border bg-warn-100 text-warn-text'
        : 'border-border-default bg-subtle text-faint';

  return (
    <span
      className={`inline-block shrink-0 rounded-badge border px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] ${estilo}`}
    >
      {texto}
    </span>
  );
}

function Th({ children, ancho }: { children: React.ReactNode; ancho?: number }) {
  return (
    <th
      style={ancho ? { width: ancho } : undefined}
      className="etiqueta-campo px-3 py-2.5 font-normal"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}
