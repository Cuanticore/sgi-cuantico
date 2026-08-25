// app/components/sgsi/metodologia/DocumentoMetodologia.tsx
//
// Handoff v2.1 screen 10. MET-SIG-01 v3.0 rendered as a document, with its table of
// contents down the side.
//
// The division of labour is deliberate and is the point of the screen:
//
//   · The PROSE is the approved document’s. It is the part an auditor reads to understand
//     what Cuántico decided and why, and it does not change because a row changed.
//   · Every REFERENCE TABLE — value, degradation, frequency, maturity, impact and risk
//     bands, the risk matrix, the zones, the acceptance criteria, the reassigned threats
//     and the worked example — is rendered from the database, so the document cannot drift
//     from the engine. A methodology that describes a scale the tool no longer uses is
//     worse than no methodology: it is a false statement with a signature on it.
//
// The two declared deviations get their own framed block near the top rather than a line
// in a paragraph. A deviation an auditor has to hunt for reads as one that was hidden.

import Link from 'next/link';
import IndiceMetodologia, { type EntradaIndice } from './IndiceMetodologia';

export interface EscalaValorVista {
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
export interface ReasignadaVista {
  codigo: string;
  nombre: string;
  desde: string | null;
  hacia: string;
  haciaCodigo: string;
}
export interface CeldaMatriz {
  frecuencia: string;
  desde: string | null;
  hasta: string | null;
}
export interface FilaMatriz {
  impacto: string;
  celdas: CeldaMatriz[];
}
export interface TipoVista {
  codigo: string;
  nombre: string;
  abreviatura: string;
  subtipos: number;
  ejemplos: string[];
}
export interface AmenazaVista {
  codigo: string;
  nombre: string;
  grupo: string;
}

export interface EjemploVista {
  amenaza: { codigo: string; nombre: string };
  valores: { D: number; I: number; C: number };
  degradaciones: { D: number; I: number; C: number };
  frecuencia: { nombre: string; vecesAno: number };
  nivelControl: { nivel: number; nombre: string; eficacia: number };
  valorActivo: number;
  impacto: number;
  nivelImpacto: string | null;
  riesgoPotencial: number;
  nivelPotencial: string | null;
  frecuenciaResidual: number;
  riesgoResidual: number;
  nivelResidual: string | null;
}

export interface MetodologiaVista {
  parametros: Record<string, string>;
  dimensiones: { codigo: string; nombre: string; activa: boolean }[];
  reasignadas: ReasignadaVista[];
  valores: EscalaValorVista[];
  degradaciones: DegradacionVista[];
  frecuencias: FrecuenciaVista[];
  madureces: MadurezVista[];
  umbralesImpacto: UmbralVista[];
  umbralesRiesgo: UmbralVista[];
  relevancias: RelevanciaVista[];
  criterios: CriterioVista[];
  cortesZona: { impactoAlto: number | null; impactoBajo: number | null; aroFrecuente: number | null };
  matriz: FilaMatriz[];
  tipos: TipoVista[];
  subtiposTotal: number;
  amenazas: AmenazaVista[];
  ejemplo: EjemploVista | null;
  controlesTotal: number;
  controlesAplicables: number;
  capacidadesTotal: number;
  dominios: string[];
  activosTotal: number;
  riesgosTotal: number;
}

const INDICE: EntradaIndice[] = [
  { id: 'objetivo', numero: '1', etiqueta: 'Objetivo' },
  { id: 'alcance', numero: '2', etiqueta: 'Alcance' },
  { id: 'definiciones', numero: '3', etiqueta: 'Definiciones' },
  { id: 'marco', numero: '4', etiqueta: 'Marco de referencia' },
  { id: 'modelo', numero: '5', etiqueta: 'Modelo de activos y desviaciones' },
  { id: 'tablas', numero: '6', etiqueta: 'Tablas de referencia' },
  { id: 'formulas', numero: '7', etiqueta: 'Fórmulas del modelo' },
  { id: 'madurez', numero: '8', etiqueta: 'Evaluación de la madurez' },
  { id: 'ciclo', numero: '9', etiqueta: 'Ciclo de valoración' },
  { id: 'alta', numero: '10', etiqueta: 'Cómo dar de alta un activo' },
  { id: 'aceptacion', numero: '11', etiqueta: 'Criterios de aceptación' },
  { id: 'plan', numero: '12', etiqueta: 'Plan de tratamiento' },
  { id: 'roles', numero: '13', etiqueta: 'Roles y responsabilidades' },
  { id: 'anexo-a', numero: 'A', etiqueta: 'Catálogo de amenazas' },
  { id: 'anexo-b', numero: 'B', etiqueta: 'Control de cambios' },
];

/// The document’s own front matter. Not database rows: the code, the version and the
/// approval chain are properties of the DOCUMENT, and the day they live in a table is the
/// day someone edits the version number without reissuing the document.
const PORTADA: [string, string][] = [
  ['Código', 'MET-SIG-01'],
  ['Versión', '3.0'],
  ['Fecha de emisión', 'Agosto de 2026'],
  ['Elaboró', 'Líder del Sistema Integrado de Gestión'],
  ['Revisó', 'Chief Operating Officer'],
  ['Aprobó', 'Comité del Sistema Integrado de Gestión'],
  ['Clasificación', 'Privado'],
  ['Marco', 'MAGERIT v3.0 · ISO/IEC 27001:2022'],
];

const DEFINICIONES: [string, string][] = [
  ['Activo', 'Componente o funcionalidad de un sistema de información susceptible de ser atacado deliberada o accidentalmente, con consecuencias para la organización.'],
  ['Dimensión de seguridad', 'Faceta del activo que hace valioso protegerlo. Cuántico trabaja con Disponibilidad, Integridad y Confidencialidad.'],
  ['Valor del activo', 'Estimación del daño que sufriría Cuántico si el activo se viera comprometido en una dimensión determinada.'],
  ['Amenaza', 'Causa potencial de un incidente que puede causar daño a un activo.'],
  ['Degradación', 'Fracción del valor del activo que se pierde si la amenaza se materializa. Se expresa por dimensión.'],
  ['Frecuencia', 'Número de veces al año que se estima que la amenaza se materializará.'],
  ['Impacto', 'Medida del daño sobre el activo derivado de la materialización de una amenaza.'],
  ['Riesgo', 'Medida del daño probable sobre el sistema: combina impacto y frecuencia.'],
  ['Control', 'Medida técnica u organizativa que reduce la frecuencia de la amenaza o limita el daño que causa. MAGERIT los denomina «salvaguardas»; aquí se usa siempre «control» por coherencia con el Sistema Integrado de Gestión.'],
  ['Riesgo potencial', 'Riesgo calculado sin considerar control alguno. También llamado riesgo inherente.'],
  ['Riesgo residual', 'Riesgo que permanece después de aplicar los controles existentes.'],
];

const MARCO: string[] = [
  'MAGERIT v3.0, Libro I «Método»: modelo de valor, cálculo del impacto y del riesgo, y tratamiento de los controles.',
  'MAGERIT v3.0, Libro II «Catálogo de Elementos»: tipos de activo, dimensiones de valoración, criterios de valoración y catálogo de amenazas.',
  'ISO/IEC 27001:2022, cláusulas 6.1.2 «Apreciación de riesgos» y 6.1.3 «Tratamiento de riesgos», y su Anexo A.',
  'ISO/IEC 27005: directrices para la gestión de riesgos de seguridad de la información.',
  'Ley 1581 de 2012 y Decreto 1074 de 2015 de Colombia: régimen de protección de datos personales.',
];

const CICLO: [string, string, string, string][] = [
  ['1. Identificar el activo', 'Se detecta un activo nuevo o un cambio en uno existente.', 'Inventario de activos', 'Dueño del proceso'],
  ['2. Clasificar', 'Se le asigna tipo y subtipo MAGERIT, código y atributos.', 'Inventario de activos', 'Líder del SIG'],
  ['3. Valorar el activo', 'Se valora en Disponibilidad, Integridad y Confidencialidad.', 'Ficha del activo', 'Propietario del activo'],
  ['4. Determinar amenazas', 'Se aplican todas las amenazas que la norma asigna a su tipo. No se eligen a mano.', 'Amenazas y tipos', 'Automático'],
  ['5. Estimar degradación y frecuencia', 'Se revisa el valor propuesto por amenaza y se ajusta si el contexto lo justifica.', 'Amenazas y tipos', 'Líder del SIG con Gestión Tecnológica'],
  ['6. Calcular impacto y riesgo', 'Se obtiene de las fórmulas del capítulo 7.', 'Matrices de riesgo', 'Automático'],
  ['7. Valorar los controles', 'Se registra la madurez CMM de los controles que previenen la amenaza.', 'Madurez de los controles', 'Gestión Tecnológica'],
  ['8. Decidir el tratamiento', 'Mitigar, transferir, evitar o aceptar, según el residual y los criterios del capítulo 11.', 'Planes de tratamiento', 'Comité del SIG'],
  ['9. Hacer seguimiento', 'Se verifica la ejecución del plan y se recalcula el residual.', 'Resumen SGSI', 'Líder del SIG'],
];

const GRANULARIDAD: [string, string, string][] = [
  ['57 repositorios de código de un mismo producto', 'Un activo por producto o por sistema, no uno por repositorio', 'Comparten dueño, criticidad y controles. Registrarlos uno a uno multiplica el trabajo sin añadir información.'],
  ['Doce buckets de respaldo con la misma política', 'Un activo: «Buckets de respaldo en AWS»', 'Misma valoración y mismos controles.'],
  ['Un bucket privado de staging y uno público con datos de clientes', 'Dos activos distintos', 'Difieren en exposición y en confidencialidad, luego difieren en riesgo.'],
  ['Veinte portátiles del mismo modelo y configuración', 'Un activo: «Parque de portátiles corporativos», con la cantidad en su campo', 'El control es el mismo para todos. El detalle individual vive en la gestión de inventario de TI.'],
  ['El portátil del CEO', 'Activo independiente', 'Distinta valoración por la información que maneja.'],
  ['Una instancia de máquina virtual', 'Se registra el servicio o la aplicación que soporta, no la instancia', 'Las instancias nacen y mueren; el servicio permanece.'],
  ['Un proveedor SaaS nuevo', 'Un activo de tipo Servicios, con el proveedor registrado', 'Permite gestionarlo también como subencargado.'],
];

const PREGUNTAS: [string, string, string][] = [
  ['Disponibilidad', '¿Cuánto daño causa que este activo no esté disponible durante una jornada laboral?', 'Que un cliente externo lo note, que detenga facturación o que incumpla un acuerdo de nivel de servicio.'],
  ['Integridad', '¿Qué pasa si el contenido de este activo se altera sin que nadie lo advierta?', 'Que alimente decisiones, reportes regulatorios o transacciones financieras.'],
  ['Confidencialidad', '¿Qué pasa si el contenido se publica íntegro en Internet mañana?', 'Que contenga datos personales, información de clientes, secretos técnicos o credenciales.'],
];

const TRATAMIENTOS: [string, string][] = [
  ['Mitigar', 'El caso normal: una acción de mejora sobre uno o varios controles, con su salto de madurez comprometido.'],
  ['Transferir', 'No hay salto de madurez. Se registra el instrumento —póliza de ciberseguridad o cláusula contractual— y el riesgo remanente, porque transferir nunca transfiere todo: un seguro cubre la pérdida financiera, no la reputacional ni la sanción del regulador.'],
  ['Evitar', 'La decisión de no hacer o de descontinuar, y los activos que se dan de baja. Es el único tratamiento que modifica el inventario.'],
  ['Aceptar', 'Justificación escrita, aprobación del Comité y fecha de revisión. Una aceptación sin fecha de caducidad no es una decisión: es un olvido con formato. Las declaraciones de no aplicabilidad de un control también se registran como aceptación.'],
];

const ROLES: [string, string][] = [
  ['Comité del SIG', 'Aprueba la metodología y los criterios de aceptación. Decide el tratamiento de los riesgos Alto y Crítico.'],
  ['Líder del SIG', 'Mantiene el inventario y la valoración, consolida los resultados y convoca las revisiones.'],
  ['Propietario del activo', 'Valora el activo en las tres dimensiones y responde por las decisiones de tratamiento que le corresponden.'],
  ['Custodio del activo', 'Opera el activo y aporta la información técnica sobre los controles existentes y su madurez.'],
  ['Gestión Tecnológica', 'Estima la frecuencia y la degradación de las amenazas técnicas y valora la madurez de los controles.'],
  ['Dueños de proceso', 'Identifican activos nuevos en su proceso y reportan cambios.'],
];

const CAMBIOS: [string, string, string][] = [
  ['1.0', 'Agosto de 2026', 'Emisión inicial. Adopción de MAGERIT v3.0 con la desviación de tres dimensiones.'],
  ['2.0', 'Agosto de 2026', 'Escala de valoración reducida de 0–10 a 0–5 y umbrales reescalados. Se modela únicamente el efecto preventivo de los controles. Se incorpora la regla de codificación de activos por área.'],
  ['3.0', 'Agosto de 2026', 'Se incorpora la evaluación de madurez CMM de los 93 controles del Anexo A con sus métricas de informe (cap. 8), la regla de agregación de la eficacia por media ponderada acotada por el control principal (7.4), y el plan de tratamiento con la acción sobre el control como unidad de gestión (cap. 12).'],
];

function num(v: number, decimales = 2): string {
  return v.toLocaleString('es-CO', { maximumFractionDigits: decimales, minimumFractionDigits: 0 });
}

function pct(v: number, decimales = 0): string {
  return `${num(v, decimales)} %`;
}

/// Scale labels carry their reading after an em dash. Column headers cannot.
function corto(nombre: string): string {
  return nombre.split('—')[0].trim();
}

function rango(u: UmbralVista, techo: number): string {
  if (u.hasta >= techo) return `≥ ${num(u.desde)}`;
  return `${num(u.desde)} – ${num(u.hasta)}`;
}

/// Risk colours travel as a background/foreground pair, never as a background alone: the
/// level is always written in the cell, and the colour only reinforces it.
function tonoRiesgo(nivel: string | null): { bg: string; fg: string } {
  const n = (nivel ?? '').toLowerCase();
  if (n.startsWith('crít')) {
    return { bg: 'var(--hf-risk-critico-bg)', fg: 'var(--hf-risk-critico-fg)' };
  }
  if (n.startsWith('alto')) return { bg: 'var(--hf-risk-alto-bg)', fg: 'var(--hf-risk-alto-fg)' };
  if (n.startsWith('medio')) return { bg: 'var(--hf-risk-medio-bg)', fg: 'var(--hf-risk-medio-fg)' };
  if (n.startsWith('bajo')) return { bg: 'var(--hf-risk-bajo-bg)', fg: 'var(--hf-risk-bajo-fg)' };
  return { bg: 'var(--hf-cmm-nulo-bg)', fg: 'var(--hf-cmm-nulo-fg)' };
}

export default function DocumentoMetodologia({ datos }: { datos: MetodologiaVista }) {
  const activas = datos.dimensiones.filter((d) => d.activa);
  const inactivas = datos.dimensiones.filter((d) => !d.activa);
  const escalaMin = datos.valores.length > 0 ? Math.min(...datos.valores.map((v) => v.valor)) : 0;
  const escalaMax = datos.valores.length > 0 ? Math.max(...datos.valores.map((v) => v.valor)) : 0;

  const techoImpacto =
    datos.umbralesImpacto.length > 0 ? Math.max(...datos.umbralesImpacto.map((u) => u.hasta)) : 0;
  const techoRiesgo =
    datos.umbralesRiesgo.length > 0 ? Math.max(...datos.umbralesRiesgo.map((u) => u.hasta)) : 0;

  const umbralValoracion = datos.parametros['umbral_valoracion'] ?? '—';
  const delta = datos.parametros['delta_techo_eficacia'] ?? 'δ';
  const revisionCompleta = datos.parametros['periodicidad_revision_completa'] ?? '—';
  const revisionParcial = datos.parametros['periodicidad_revision_parcial'] ?? '—';

  // Columns read left to right from rare to frequent, the way the document prints them;
  // the scale rows are stored the other way round.
  const frecuenciasMatriz = [...datos.frecuencias].reverse();
  const sinRatificar = datos.criterios.filter((c) => !c.ratificado).length;

  const z = datos.cortesZona;
  const zonaDerivable = z.impactoAlto !== null && z.impactoBajo !== null && z.aroFrecuente !== null;

  const gruposAmenaza = [...new Set(datos.amenazas.map((a) => a.grupo))];

  const formulas = [
    'valor(a)              =  máx( v_D , v_I , v_C )',
    'impacto_d(a,t)        =  v_d(a) × degradación_d(t)',
    'impacto(a,t)          =  máx( impacto_D , impacto_I , impacto_C )',
    'riesgo(a,t)           =  impacto(a,t) × aro(t)              ← potencial',
    '',
    `eficacia(t)           =  Σ w_i · efi(nivel_i) / Σ w_i ,  acotada por  efi(principal) + ${delta}`,
    'aro_residual(a,t)     =  aro(t) × ( 1 − eficacia(t) )',
    'riesgo_residual(a,t)  =  impacto(a,t) × aro_residual(a,t)',
    '',
    'índice de madurez     =  media de la eficacia de los controles aplicables',
    `entra al análisis     =  valor(a) ≥ ${umbralValoracion}`,
  ];

  return (
    <main className="px-8 pt-6 pb-14">
      <div className="flex gap-8">
        <IndiceMetodologia entradas={INDICE} />

        <article className="flex min-w-0 flex-1 flex-col gap-8">
          {/* ── Portada ───────────────────────────────────────────────────────── */}
          <header className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="font-mono text-10_5 uppercase tracking-[0.1em] text-label">
                MET-SIG-01 · versión 3.0 · documento aprobado
              </p>
              <h1 className="titulo-pagina">
                Metodología de análisis y valoración de riesgos de seguridad de la información
              </h1>
              <p className="parrafo text-muted">
                Las tablas de referencia de este documento no están transcritas: se leen de
                las mismas filas que usa el motor de cálculo. Si el Comité mueve un umbral o
                una escala, este documento lo dice al recargarlo, y no queda describiendo una
                versión que la herramienta ya no aplica.
              </p>
            </div>

            <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
              <div style={{ minWidth: 560 }}>
                <table className="w-full border-collapse text-12">
                  <tbody>
                    {PORTADA.map(([campo, contenido], i) => (
                      <tr key={campo} className={i > 0 ? 'border-t border-hairline' : undefined}>
                        <td className="w-[180px] px-4 py-2 align-top">
                          <span className="etiqueta-campo">{campo}</span>
                        </td>
                        <td className="px-4 py-2 align-top">
                          <span className="text-12_5 text-primary">{contenido}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </header>

          {/* ── 1 ─────────────────────────────────────────────────────────────── */}
          <Capitulo id="objetivo" numero="1" titulo="Objetivo">
            <p className="parrafo">
              Definir el método con el que Cuántico identifica, analiza, valora y trata los
              riesgos de seguridad de la información sobre sus activos, de manera que el
              resultado sea repetible por cualquier persona del equipo, comparable entre
              periodos y verificable por un auditor externo.
            </p>
            <p className="parrafo">
              El método se basa en MAGERIT v3.0, la metodología de análisis y gestión de
              riesgos de los sistemas de información publicada por el Ministerio de Hacienda y
              Administraciones Públicas de España en octubre de 2012, y se articula con los
              requisitos de las cláusulas 6.1.2 y 6.1.3 de ISO/IEC 27001:2022.
            </p>
          </Capitulo>

          {/* ── 2 ─────────────────────────────────────────────────────────────── */}
          <Capitulo id="alcance" numero="2" titulo="Alcance">
            <p className="parrafo">
              Aplica a todos los activos de información y activos asociados que soportan los
              procesos incluidos en el alcance del Sistema de Gestión de Seguridad de la
              Información de Cuántico, con independencia de si residen en instalaciones
              propias, en la nube o en el domicilio de un colaborador en teletrabajo.
            </p>
            <p className="text-11_5 text-faint">
              Hoy el alcance cubre {num(datos.activosTotal, 0)} activos vigentes y{' '}
              {num(datos.riesgosTotal, 0)} riesgos calculados.
            </p>
          </Capitulo>

          {/* ── 3 ─────────────────────────────────────────────────────────────── */}
          <Capitulo id="definiciones" numero="3" titulo="Definiciones">
            <TablaDoc
              minWidth={720}
              cabeceras={['Término', 'Definición']}
              anchos={[190, undefined]}
              filas={DEFINICIONES.map(([t, d]) => [t, d])}
            />
          </Capitulo>

          {/* ── 4 ─────────────────────────────────────────────────────────────── */}
          <Capitulo id="marco" numero="4" titulo="Marco de referencia">
            <ul className="flex flex-col gap-1.5">
              {MARCO.map((m) => (
                <li key={m} className="parrafo flex gap-2">
                  <span className="text-accent-500">·</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </Capitulo>

          {/* ── 5 ─────────────────────────────────────────────────────────────── */}
          <Capitulo id="modelo" numero="5" titulo="Modelo de activos">
            <p className="parrafo">
              Todo activo se clasifica en uno de los diez tipos definidos por MAGERIT. La
              clasificación no es decorativa: determina qué amenazas se le aplican y, por
              tanto, qué riesgos se valoran.
            </p>

            <TablaDoc
              minWidth={860}
              cabeceras={['Código', 'Tipo de activo', 'Abrev.', 'Subtipos', 'Ejemplos de subtipos']}
              anchos={[86, 220, 76, 84, undefined]}
              mono={[0, 2, 3]}
              filas={datos.tipos.map((t) => [
                t.codigo,
                t.nombre,
                t.abreviatura,
                num(t.subtipos, 0),
                t.ejemplos.join(', ') || '—',
              ])}
            />
            <p className="text-11_5 text-faint">
              La taxonomía completa registra {num(datos.subtiposTotal, 0)} subtipos con su
              código oficial. Se registra siempre el código y su descripción juntos, de modo
              que el tipo sea legible sin consultar la norma.
            </p>

            <Subcapitulo id="codificacion" numero="5.1" titulo="Codificación del activo">
              <p className="parrafo">
                Cada activo lleva un código único, inmutable y no reutilizable, construido a
                partir del área responsable y del tipo MAGERIT. El consecutivo es
                independiente por cada combinación de área y tipo, y no se recicla aunque el
                activo se dé de baja.
              </p>
              <div className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-border-default bg-subtle px-4 py-3">
                <span className="font-mono text-15 text-primary">ÁREA-TIPO-CONSECUTIVO</span>
                <span className="text-11_5 text-muted">
                  los prefijos por área y las abreviaturas de tipo vigentes están en{' '}
                  <Link
                    href="/sgsi/parametros#procesos"
                    className="text-accent-700 underline underline-offset-2"
                  >
                    Configuración del modelo
                  </Link>
                </span>
              </div>
            </Subcapitulo>

            <Subcapitulo
              id="desviaciones"
              numero="5.2"
              titulo="Desviaciones declaradas respecto de la norma"
            >
              <p className="parrafo">
                Cuántico aplica MAGERIT de manera integral con dos desviaciones, que se
                declaran aquí de forma expresa. Un auditor acepta una desviación documentada y
                aplicada con consistencia; lo que no admite es que falte sin explicación.
              </p>

              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}
              >
                <Desviacion
                  ordinal="Primera desviación"
                  titulo={`Tres dimensiones en lugar de cinco`}
                >
                  <p className="parrafo text-12_5">
                    MAGERIT define cinco dimensiones de seguridad. Cuántico trabaja con{' '}
                    {activas.map((d) => d.nombre).join(', ')}, por coherencia con el inventario
                    FOR-SIG-12 y con la tríada de ISO/IEC 27001.{' '}
                    {inactivas.length > 0 && (
                      <>
                        {inactivas.map((d) => d.nombre).join(' y ')}{' '}
                        {inactivas.length === 1 ? 'sigue modelada e inactiva' : 'siguen modeladas e inactivas'}
                        , de modo que la decisión sea reversible sin migración.
                      </>
                    )}
                  </p>
                  <p className="parrafo text-12_5">
                    Como consecuencia, las amenazas que la norma dirige exclusiva o
                    principalmente a Autenticidad o Trazabilidad se reasignan, de modo que su
                    riesgo no desaparezca del análisis. La reasignación queda registrada en la
                    propia fila de degradación, no en un comentario:
                  </p>

                  {datos.reasignadas.length === 0 ? (
                    <p className="text-11_5 text-danger-text">
                      No hay ninguna reasignación registrada en la base. La desviación está
                      declarada pero no aplicada: revisar la parametrización de degradación.
                    </p>
                  ) : (
                    <ul className="flex flex-col">
                      {datos.reasignadas.map((r) => (
                        <li
                          key={`${r.codigo}-${r.haciaCodigo}`}
                          className="flex flex-wrap items-baseline gap-2 border-b border-hairline py-1.5 last:border-b-0"
                        >
                          <span className="font-mono text-11 font-semibold text-secondary">
                            {r.codigo}
                          </span>
                          <span className="min-w-0 flex-1 text-11_5 text-primary">{r.nombre}</span>
                          <span className="shrink-0 font-mono text-10 text-muted">
                            {r.desde ?? '?'} → {r.haciaCodigo}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Desviacion>

                <Desviacion
                  ordinal="Segunda desviación"
                  titulo={`Escala de valor de ${escalaMin} a ${escalaMax}`}
                >
                  <p className="parrafo text-12_5">
                    La escala de valoración de los activos que propone MAGERIT es de 0 a 10.
                    Cuántico la reduce a {escalaMin}–{escalaMax} para alinearla con las escalas
                    que el equipo ya usa en el resto del Sistema Integrado de Gestión y para
                    reducir la discusión sobre matices que no cambian la decisión.
                  </p>
                  <p className="parrafo text-12_5">
                    Los umbrales de nivel de impacto, de nivel de riesgo y las zonas se
                    reescalaron en la misma proporción, de modo que la clasificación de los
                    riesgos se conserva. Son los umbrales del capítulo 6, y son los que el
                    motor aplica.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {datos.valores.map((v) => (
                      <span
                        key={v.valor}
                        className="rounded-badge bg-subtle px-2 py-0.5 font-mono text-10_5 text-secondary"
                      >
                        {v.etiqueta}
                      </span>
                    ))}
                  </div>
                </Desviacion>
              </div>
            </Subcapitulo>
          </Capitulo>

          {/* ── 6 ─────────────────────────────────────────────────────────────── */}
          <Capitulo id="tablas" numero="6" titulo="Tablas de referencia">
            <p className="parrafo">
              Todas las listas desplegables de la herramienta salen de estas tablas. Modificar
              un valor aquí recalcula el análisis completo. Lo que sigue no es una
              transcripción: es la lectura directa de las filas que el motor consulta.
            </p>

            <Subcapitulo id="t-valor" numero="6.1" titulo="Valor del activo en una dimensión">
              <p className="parrafo">
                Se valora el daño que sufriría Cuántico si el activo se viera comprometido en
                esa dimensión. En la herramienta se selecciona con una lista que describe cada
                nivel, nunca escribiendo un número suelto.
              </p>
              <TablaDoc
                minWidth={420}
                cabeceras={['Etiqueta que se selecciona', 'Valor']}
                anchos={[undefined, 100]}
                mono={[1]}
                filas={datos.valores.map((v) => [v.etiqueta, num(v.valor, 0)])}
              />
            </Subcapitulo>

            <Subcapitulo id="t-degradacion" numero="6.2" titulo="Degradación">
              <p className="parrafo">
                Cuánto valor pierde el activo, en esa dimensión, si la amenaza se materializa.
                Se define por amenaza y por dimensión.
              </p>
              <TablaDoc
                minWidth={620}
                cabeceras={['Grado', 'Fracción que se pierde', 'Lectura']}
                anchos={[160, 170, undefined]}
                mono={[1]}
                filas={datos.degradaciones.map((d) => [
                  d.nombre,
                  pct(d.factor * 100),
                  d.lectura ?? '—',
                ])}
              />
            </Subcapitulo>

            <Subcapitulo id="t-frecuencia" numero="6.3" titulo="Frecuencia">
              <TablaDoc
                minWidth={520}
                cabeceras={['Frecuencia', 'Veces por año']}
                anchos={[undefined, 140]}
                mono={[1]}
                filas={datos.frecuencias.map((f) => [f.nombre, num(f.vecesAno, 2)])}
              />
            </Subcapitulo>

            <Subcapitulo id="t-madurez" numero="6.4" titulo="Madurez de los controles">
              <p className="parrafo">
                La eficacia de un control no depende solo de que exista, sino de cómo está
                implantado. Se estima con el modelo de madurez CMM que propone MAGERIT, y la
                correspondencia entre nivel y eficacia es la que publica la herramienta PILAR
                del CCN-CERT.
              </p>
              <TablaDoc
                minWidth={720}
                cabeceras={['Nivel', 'Nombre', 'Eficacia', 'Qué significa']}
                anchos={[70, 200, 100, undefined]}
                mono={[0, 2]}
                filas={datos.madureces.map((m) => [
                  `L${m.nivel}`,
                  m.nombre,
                  pct(m.eficacia * 100),
                  m.lectura ?? '—',
                ])}
              />
            </Subcapitulo>

            <Subcapitulo id="t-umbrales" numero="6.5" titulo="Niveles de impacto y de riesgo">
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
              >
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="etiqueta-campo">Nivel de impacto</p>
                  <TablaDoc
                    minWidth={280}
                    cabeceras={['Nivel', `Rango (${escalaMin} a ${escalaMax})`]}
                    anchos={[undefined, 130]}
                    mono={[1]}
                    filas={datos.umbralesImpacto.map((u) => [u.nombre, rango(u, techoImpacto)])}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="etiqueta-campo">Nivel de riesgo</p>
                  <TablaDoc
                    minWidth={280}
                    cabeceras={['Nivel', 'Rango (impacto × veces/año)']}
                    anchos={[undefined, 170]}
                    mono={[1]}
                    filas={datos.umbralesRiesgo.map((u) => [u.nombre, rango(u, techoRiesgo)])}
                  />
                </div>
              </div>
            </Subcapitulo>

            <Subcapitulo id="t-matriz" numero="6.6" titulo="Matriz de riesgo">
              <p className="parrafo">
                La matriz no está dibujada a mano: cada casilla se obtiene multiplicando la
                banda de impacto por la frecuencia y clasificando el resultado con los mismos
                umbrales del apartado anterior. Una banda es un rango, no un punto, así que la
                casilla que cae en dos niveles según dónde se esté dentro de la banda lo dice
                en lugar de elegir uno y ocultarlo.
              </p>

              <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
                <div style={{ minWidth: 760 }}>
                  <table className="w-full border-collapse text-11_5">
                    <thead>
                      <tr className="bg-subtle text-left">
                        <th className="etiqueta-campo px-3 py-2.5 font-normal">
                          Impacto ↓ · Frecuencia →
                        </th>
                        {frecuenciasMatriz.map((f) => (
                          <th key={f.nombre} className="etiqueta-campo px-3 py-2.5 font-normal">
                            {corto(f.nombre)}
                            <span className="block font-mono text-9 normal-case tracking-normal text-faint">
                              {num(f.vecesAno, 2)}/año
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datos.matriz.map((fila) => (
                        <tr key={fila.impacto} className="border-t border-hairline">
                          <td className="px-3 py-2">
                            <span className="text-11_5 text-primary">{fila.impacto}</span>
                          </td>
                          {[...fila.celdas].reverse().map((c) => {
                            const etiqueta =
                              c.desde === c.hasta
                                ? (c.desde ?? '—')
                                : `${c.desde ?? '—'} – ${c.hasta ?? '—'}`;
                            // The cell is painted with the WORST level it can reach, and the
                            // text spells out the whole range, so the colour never overstates
                            // or understates on its own.
                            const t = tonoRiesgo(c.hasta);
                            return (
                              <td key={c.frecuencia} className="px-1.5 py-1.5">
                                <span
                                  className="block rounded-badge px-2 py-1.5 text-center font-mono text-10"
                                  style={{ background: t.bg, color: t.fg }}
                                >
                                  {etiqueta}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="parrafo text-muted">
                Conviene detenerse en una consecuencia que suele sorprender: un impacto Bajo
                que se materializa todos los meses produce más daño anual que un impacto Muy
                alto que ocurre una vez cada cien años. Es correcto, y es justamente lo que una
                matriz cualitativa de cinco por cinco oculta.
              </p>
              <p className="parrafo text-muted">
                La misma matriz clasifica el riesgo inherente y el residual: lo que cambia
                entre uno y otro no es el criterio, sino dónde cae cada riesgo una vez
                descontada la eficacia de los controles. Mientras la madurez de todos los
                controles esté en L0, las dos matrices son idénticas: no es un error del
                cálculo, es el punto de partida honesto de una organización que aún no ha
                valorado la eficacia real de sus controles.
              </p>
            </Subcapitulo>

            <Subcapitulo id="t-zonas" numero="6.7" titulo="Zonas de riesgo">
              {zonaDerivable ? (
                <TablaDoc
                  minWidth={560}
                  cabeceras={['Zona', 'Criterio']}
                  anchos={[280, undefined]}
                  filas={[
                    [
                      'Zona 1 — Crítica',
                      `Impacto ≥ ${num(z.impactoAlto!)} y ocurre al menos ${num(z.aroFrecuente!)} vez al año`,
                    ],
                    ['Zona 2 — Atención', 'Riesgo intermedio: todo lo que no cae en las otras tres'],
                    [
                      'Zona 3 — Asumible',
                      `Impacto < ${num(z.impactoBajo!)} y menos de ${num(z.aroFrecuente!)} vez al año`,
                    ],
                    [
                      'Zona 4 — Catastrófica poco probable',
                      `Impacto ≥ ${num(z.impactoAlto!)} pero excepcional`,
                    ],
                  ]}
                />
              ) : (
                <p className="parrafo text-danger-text">
                  Los cortes de zona no se pueden derivar de las bandas cargadas. El documento
                  no imprime un número que el motor no esté usando.
                </p>
              )}
              <p className="text-11_5 text-faint">
                MAGERIT Libro I, capítulo 3. Los cortes salen del límite inferior de la banda de
                impacto Alto, del de la banda Medio y de la frecuencia anual: reescalar la
                escala de valor los mueve solo.
              </p>
            </Subcapitulo>
          </Capitulo>

          {/* ── 7 ─────────────────────────────────────────────────────────────── */}
          <Capitulo id="formulas" numero="7" titulo="Fórmulas del modelo">
            <p className="parrafo">
              La notación es la siguiente: <em>a</em> es un activo, <em>t</em> una amenaza y{' '}
              <em>d</em> una dimensión de seguridad, con <em>d</em> perteneciente al conjunto{' '}
              {activas.map((x) => x.nombre).join(', ')}.
            </p>

            <div
              className="tabla-ancha rounded-tarjeta p-4"
              style={{ background: 'var(--hf-code-bg)' }}
            >
              <pre
                className="font-mono text-11_5 leading-relaxed"
                style={{ color: 'var(--hf-accent-300)' }}
              >
                {formulas.join('\n')}
              </pre>
            </div>

            <p className="parrafo font-medium text-primary">
              No existe impacto residual. Solo se modela el efecto preventivo: la eficacia
              reduce la frecuencia, nunca el impacto.
            </p>

            <Subcapitulo id="f-controles" numero="7.4" titulo="Efecto de los controles">
              <p className="parrafo">
                Un control puede reducir el riesgo de dos maneras: haciendo que la amenaza
                ocurra menos veces —control preventivo— o haciendo que, cuando ocurre, el daño
                sea menor —control limitador—. Cuántico modela explícitamente solo el efecto
                preventivo. El efecto de los controles que limitan el daño se refleja bajando
                la degradación de la amenaza, de modo que hay un único juicio por fila y no
                dos, y el efecto de un respaldo o de la redundancia queda registrado donde
                realmente actúa: sobre cuánto se pierde, no sobre cuántas veces ocurre.
              </p>
              <p className="parrafo">
                Una amenaza rara vez la contiene un solo control. La eficacia que entra en el
                cálculo es la de la combinación, y la forma de combinarla no es indiferente: la
                media simple esconde el eslabón débil. Cuántico usa una media ponderada por la
                relevancia de cada control, acotada por el control principal con un margen{' '}
                <span className="font-mono text-secondary">δ = {delta}</span>.
              </p>

              <TablaDoc
                minWidth={640}
                cabeceras={['Relevancia', 'Peso', 'Criterio de asignación']}
                anchos={[160, 80, undefined]}
                mono={[1]}
                filas={datos.relevancias.map((r) => [r.nombre, num(r.peso, 0), r.criterio])}
              />

              <p className="parrafo text-muted">
                El techo es lo esencial de la regla: los controles secundarios acompañan al
                principal, no lo sustituyen. El techo solo actúa cuando el principal está
                débil; cuando está fuerte no interviene. Queda expresamente descartada la
                composición probabilística —uno menos el producto de los complementos—, que con
                cuatro controles en L3 arrojaría una eficacia del 99,995 %: la eficacia de
                MAGERIT no es una probabilidad de bloqueo independiente sino un grado de calidad
                de implantación, y controles operados por la misma organización comparten modos
                de fallo.
              </p>
            </Subcapitulo>

            <Subcapitulo id="f-ejemplo" numero="7.5" titulo="Ejemplo resuelto">
              {datos.ejemplo === null ? (
                <p className="parrafo text-danger-text">
                  El ejemplo se calcula sobre una amenaza del catálogo y esa amenaza no está
                  cargada. Se omite antes que narrarlo de memoria.
                </p>
              ) : (
                <EjemploResuelto ejemplo={datos.ejemplo} />
              )}
            </Subcapitulo>
          </Capitulo>

          {/* ── 8 ─────────────────────────────────────────────────────────────── */}
          <Capitulo id="madurez" numero="8" titulo="Evaluación de la madurez de los controles">
            <p className="parrafo">
              La eficacia de un control no se declara: se deriva de su nivel de madurez.
              Conviene mirar la forma de esa correspondencia (apartado 6.4), porque explica
              dónde está el esfuerzo que rinde: el salto grande está entre L2 y L3. La norma
              está diciendo que lo que de verdad cambia el riesgo es pasar de «se hace, cada
              quien a su manera» a «hay un proceso definido».
            </p>

            <Subcapitulo id="m-alcance" numero="8.1" titulo="Alcance de la evaluación">
              <p className="parrafo">
                Se evalúan los {num(datos.controlesTotal, 0)} controles del Anexo A, repartidos
                en los dominios {datos.dominios.join(', ')}. Hoy{' '}
                {num(datos.controlesAplicables, 0)} aplican y{' '}
                {num(datos.controlesTotal - datos.controlesAplicables, 0)} no. Los que no
                aplican se marcan como tales con justificación escrita y quedan excluidos de
                todos los promedios, pero no se borran: su no aplicabilidad es una decisión que
                el Comité aprueba y que un auditor revisará.
              </p>
            </Subcapitulo>

            <Subcapitulo id="m-metricas" numero="8.2" titulo="Métricas del informe de progreso">
              <p className="parrafo">
                Ni MAGERIT ni ISO/IEC 27001 imponen una forma de agregar la madurez de varios
                controles en un número. Hay que elegirla y declararla. Cuántico reporta tres
                cifras, cada una con una función distinta.
              </p>
              <TablaDoc
                minWidth={780}
                cabeceras={['Métrica', 'Cómo se calcula', 'Por qué esa y no otra']}
                anchos={[160, 230, undefined]}
                filas={[
                  [
                    'Índice de madurez',
                    'Media de la eficacia de los controles aplicables',
                    'La eficacia es una escala de razón y se puede promediar. El nivel L0–L5 es ordinal y promediarlo no es riguroso. Además la eficacia es la que alimenta el riesgo residual, de modo que madurez y riesgo hablan el mismo idioma.',
                  ],
                  [
                    'Nivel típico',
                    'Mediana del nivel de los controles aplicables',
                    'La mediana es el estadístico correcto para una escala ordinal y resiste los valores extremos.',
                  ],
                  [
                    'Titular del informe',
                    'Porcentaje de controles en L3 o superior',
                    'Es la cifra que un Comité entiende sin explicación y sobre la que se puede comprometer una meta. L3 es el umbral significativo.',
                  ],
                ]}
              />
              <p className="parrafo text-muted">
                Dos decisiones deliberadas. La moda queda descartada: es insensible al avance
                —se pueden subir ocho controles de L1 a L2 sin que se mueva— y por tanto
                inservible para un informe de progreso. Y el nivel medio se conserva solo como
                referencia comparativa entre periodos, nunca como «la madurez de la
                organización»: un L5 compensando un L0 esconde precisamente lo que hay que
                gestionar. Las brechas nunca se agregan: un control en L1 es una acción concreta
                con dueño y fecha, no un decimal dentro de un promedio.
              </p>
            </Subcapitulo>

            <Subcapitulo id="m-grafica" numero="8.3" titulo="Presentación gráfica">
              <p className="parrafo">
                El diagrama de araña se construye sobre las {num(datos.capacidadesTotal, 0)}{' '}
                capacidades operativas que define ISO/IEC 27002:2022, no sobre los{' '}
                {num(datos.dominios.length, 0)} dominios del Anexo A. Cuatro ejes no muestran
                nada; quince dan la resolución necesaria para ver dónde está el desequilibrio.
                Se grafican tres series: línea base, situación actual y objetivo.
              </p>
            </Subcapitulo>

            <Subcapitulo id="m-periodicidad" numero="8.4" titulo="Periodicidad y trazabilidad">
              <p className="parrafo">
                La madurez se reevalúa con periodicidad{' '}
                <span className="font-mono text-secondary">{revisionParcial}</span> y en todo
                caso antes de la revisión por la dirección. Cada corte conserva la calificación
                anterior como línea base, de modo que el avance sea demostrable y no una
                impresión. Cada control lleva el campo de evidencia que sustenta su nivel: sin
                evidencia, el nivel no se sostiene ante un auditor.
              </p>
            </Subcapitulo>
          </Capitulo>

          {/* ── 9 ─────────────────────────────────────────────────────────────── */}
          <Capitulo id="ciclo" numero="9" titulo="Ciclo de valoración de riesgos">
            <p className="parrafo">
              El ciclo tiene nueve pasos. Los tres primeros construyen el inventario, los cuatro
              siguientes producen la valoración y los dos últimos cierran con el tratamiento y
              el seguimiento.
            </p>
            <TablaDoc
              minWidth={900}
              cabeceras={['Paso', 'Qué se hace', 'Dónde se registra', 'Responsable']}
              anchos={[210, undefined, 190, 200]}
              filas={CICLO.map(([paso, que, donde, quien]) => [paso, que, donde, quien])}
            />

            <Subcapitulo id="c-periodicidad" numero="9.1" titulo="Periodicidad">
              <ul className="flex flex-col gap-1.5">
                <li className="parrafo flex gap-2">
                  <span className="text-accent-500">·</span>
                  <span>
                    Revisión completa del análisis:{' '}
                    <span className="font-mono text-secondary">{revisionCompleta}</span>, antes de
                    la revisión por la dirección.
                  </span>
                </li>
                <li className="parrafo flex gap-2">
                  <span className="text-accent-500">·</span>
                  <span>
                    Revisión parcial:{' '}
                    <span className="font-mono text-secondary">{revisionParcial}</span>, sobre los
                    activos con riesgo residual Alto o Crítico.
                  </span>
                </li>
                <li className="parrafo flex gap-2">
                  <span className="text-accent-500">·</span>
                  <span>
                    Revisión disparada por un evento: de inmediato, ante un incidente de
                    seguridad significativo, la incorporación de un proveedor cloud o SaaS, el
                    lanzamiento de un producto o entorno nuevo, un cambio de arquitectura
                    relevante, o un cambio normativo que afecte el tratamiento de datos
                    personales.
                  </span>
                </li>
              </ul>
            </Subcapitulo>
          </Capitulo>

          {/* ── 10 ────────────────────────────────────────────────────────────── */}
          <Capitulo id="alta" numero="10" titulo="Cómo dar de alta un activo">
            <p className="parrafo">
              Esta es la parte del ciclo donde más se pierde calidad. Un inventario crece por
              acumulación si no hay un criterio explícito de qué se registra y con qué
              granularidad.
            </p>

            <Subcapitulo id="a-granularidad" numero="10.1" titulo="Regla de granularidad">
              <p className="parrafo">
                La regla es una sola: dos elementos son el mismo activo si comparten
                propietario, comparten valoración en las tres dimensiones y se protegen con los
                mismos controles. Si difieren en cualquiera de las tres cosas, son activos
                distintos.
              </p>
              <TablaDoc
                minWidth={900}
                cabeceras={['Situación', 'Decisión correcta', 'Por qué']}
                anchos={[280, 260, undefined]}
                filas={GRANULARIDAD.map(([s, d, p]) => [s, d, p])}
              />
            </Subcapitulo>

            <Subcapitulo id="a-excluido" numero="10.2" titulo="Qué no se inventaría por separado">
              <ul className="flex flex-col gap-1.5">
                {[
                  'Instancias, contenedores y recursos efímeros que se recrean automáticamente: se registra el servicio que soportan.',
                  'Documentos individuales dentro de un repositorio ya inventariado.',
                  'Personas nombradas: se registra el rol. La lista nominal vive en Talento Humano.',
                  'Licencias individuales de un mismo producto: se registran como cantidad dentro del activo del producto.',
                ].map((t) => (
                  <li key={t} className="parrafo flex gap-2">
                    <span className="text-accent-500">·</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Subcapitulo>

            <Subcapitulo id="a-procedimiento" numero="10.3" titulo="Procedimiento de alta">
              <ol className="flex flex-col gap-1.5">
                {[
                  'Verificar que no exista ya. Buscar por nombre y por proveedor antes de crear nada.',
                  'Asignar código según la regla del apartado 5.1. El código no se reutiliza aunque el activo se dé de baja.',
                  'Clasificar. Elegir tipo y subtipo MAGERIT de la lista. Si ninguno encaja, escoger el más cercano y dejar constancia en observaciones; no inventar tipos nuevos.',
                  'Asignar propietario y custodio. El propietario responde por el valor del activo y decide sobre su tratamiento; el custodio lo opera en el día a día. Nunca deben quedar vacíos.',
                  'Completar los atributos: entorno, si contiene datos de cliente, si contiene datos personales bajo la Ley 1581, si está expuesto a Internet y el proveedor o subencargado.',
                  'Declarar la dependencia. Indicar de qué activo superior depende.',
                  'Valorar en las tres dimensiones usando las listas descriptivas. El valor del activo se calcula solo.',
                ].map((t, i) => (
                  <li key={t} className="parrafo flex gap-2">
                    <span className="w-4 shrink-0 font-mono text-11 text-faint">{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
              <p className="parrafo rounded-campo border border-accent-border bg-accent-50 px-3 py-2 text-12_5">
                Si el valor resultante alcanza{' '}
                <span className="font-mono font-semibold text-accent-700">{umbralValoracion}</span>,
                el activo entra a la valoración de riesgos con todas las amenazas de su tipo. El
                umbral es un parámetro del motor, no una constante del método.
              </p>
            </Subcapitulo>

            <Subcapitulo id="a-preguntas" numero="10.4" titulo="Preguntas para valorar sin sesgo">
              <TablaDoc
                minWidth={880}
                cabeceras={['Dimensión', 'Pregunta', 'Qué eleva el valor']}
                anchos={[150, 340, undefined]}
                filas={PREGUNTAS.map(([d, p, q]) => [d, p, q])}
              />
            </Subcapitulo>

            <Subcapitulo id="a-buscar" numero="10.5" titulo="Dónde buscar activos que faltan">
              <ul className="flex flex-col gap-1.5">
                {[
                  'La facturación. Todo lo que se paga existe: revisar los cargos de los proveedores contra el inventario.',
                  'La consola de AWS, en particular el inventario de recursos y la configuración de cuentas.',
                  'El centro de administración de Microsoft 365: licencias asignadas, aplicaciones empresariales y dominios verificados.',
                  'La organización de GitHub: repositorios, aplicaciones instaladas y secretos de despliegue.',
                  'El registrador de dominios y el proveedor de DNS.',
                  'Los contratos vigentes con proveedores y los acuerdos de tratamiento de datos personales.',
                  'Los tickets de la mesa de ayuda de los últimos seis meses: revelan sistemas que nadie declaró.',
                ].map((t) => (
                  <li key={t} className="parrafo flex gap-2">
                    <span className="text-accent-500">·</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Subcapitulo>
          </Capitulo>

          {/* ── 11 ────────────────────────────────────────────────────────────── */}
          <Capitulo id="aceptacion" numero="11" titulo="Criterios de aceptación del riesgo">
            <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
              <div style={{ minWidth: 860 }}>
                <table className="w-full border-collapse text-12">
                  <thead>
                    <tr className="bg-subtle text-left">
                      <th className="etiqueta-campo px-3 py-2.5 font-normal" style={{ width: 110 }}>
                        Residual
                      </th>
                      <th className="etiqueta-campo px-3 py-2.5 font-normal">Decisión</th>
                      <th className="etiqueta-campo px-3 py-2.5 font-normal" style={{ width: 250 }}>
                        Plazo
                      </th>
                      <th className="etiqueta-campo px-3 py-2.5 font-normal" style={{ width: 180 }}>
                        Quién aprueba
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.criterios.map((c) => {
                      const t = tonoRiesgo(c.umbral);
                      return (
                        <tr key={c.umbral} className="border-t border-hairline">
                          <td className="px-3 py-2 align-top">
                            <span
                              className="inline-block rounded-badge px-2 py-0.5 font-mono text-10"
                              style={{ background: t.bg, color: t.fg }}
                            >
                              {c.umbral}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <span className="text-12 leading-snug text-primary">{c.decision}</span>
                          </td>
                          <td className="flex flex-col gap-1 px-3 py-2 align-top">
                            <span className="text-11_5 leading-snug text-muted">
                              Plan: {c.plazoPlan} · Ejecución: {c.plazoEjecucion}
                            </span>
                            <span
                              className={`w-fit rounded-badge border px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] ${
                                c.ratificado
                                  ? 'border-accent-border bg-accent-100 text-accent-700'
                                  : 'border-warn-border bg-warn-100 text-warn-text'
                              }`}
                            >
                              {c.ratificado ? 'ratificado' : 'pendiente de ratificación'}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <span className="text-11_5 text-muted">{c.aprueba}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {sinRatificar > 0 && (
              <p className="parrafo rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-12_5 text-warn-text">
                {sinRatificar === datos.criterios.length
                  ? 'Ninguno de estos plazos está ratificado todavía.'
                  : `${sinRatificar} de ${datos.criterios.length} plazos no están ratificados todavía.`}{' '}
                El Comité del SIG aún no los ha ratificado, de modo que son la propuesta vigente
                y no un compromiso adquirido. La herramienta los aplica marcados como tales
                hasta que el acta los confirme.
              </p>
            )}

            <p className="parrafo">
              Aceptar un riesgo Alto o Crítico requiere aprobación expresa del Comité, con
              justificación escrita y fecha de revisión. Un riesgo aceptado sin registro no es
              una decisión: es un olvido.
            </p>
          </Capitulo>

          {/* ── 12 ────────────────────────────────────────────────────────────── */}
          <Capitulo id="plan" numero="12" titulo="Plan de tratamiento">
            <p className="parrafo">
              La cláusula 6.1.3 de ISO/IEC 27001 exige elaborar un plan de tratamiento y obtener
              la aprobación del propietario del riesgo; la cláusula 8.3 exige conservar la
              información documentada de su implementación. Lo que la norma no dice es cuál es
              la unidad del plan, y ahí se juega su utilidad.
            </p>

            <Subcapitulo id="p-unidad" numero="12.1" titulo="La unidad del plan es la acción sobre un control">
              <p className="parrafo">
                Un plan por riesgo es inmanejable —hoy hay {num(datos.riesgosTotal, 0)} riesgos
                calculados— y además incorrecto. Desde que la eficacia se deriva de la madurez de
                los controles, un riesgo individual no puede bajarse por separado: lo único que
                mueve la aguja es elevar la madurez de un control, y eso reduce de golpe todos
                los riesgos que ese control mitiga. De ahí que el plan se registre como una lista
                de acciones sobre controles, que el Comité puede leer, aprobar y seguir.
              </p>
            </Subcapitulo>

            <Subcapitulo id="p-campos" numero="12.2" titulo="Qué se registra en cada acción">
              <TablaDoc
                minWidth={880}
                cabeceras={['Bloque', 'Campos', 'Por qué']}
                anchos={[140, 300, undefined]}
                filas={[
                  ['Identificación', 'Código, título en una línea y control asociado', 'El control es la clave que conecta la acción con los riesgos que reduce.'],
                  ['Origen', 'Qué brecha o riesgo la motiva', 'Permite al auditor entender por qué existe esa acción y no otra.'],
                  ['Efecto esperado', 'Madurez actual, madurez objetivo, salto y riesgos que mueve', 'Se calcula, no se captura. Si se teclea, mentirá en el siguiente corte.'],
                  ['Gobierno', 'Responsable de la ejecución, propietario del riesgo que aprueba, fechas y recursos', 'Son dos personas distintas: la norma exige la aprobación del propietario del riesgo, no basta con asignar un responsable.'],
                  ['Seguimiento', 'Estado, avance y evidencia', 'La evidencia es el enlace al documento, ticket o registro que prueba la ejecución.'],
                  ['Cierre', 'Fecha real, madurez alcanzada y verificación de eficacia', 'Implementar no es lo mismo que funcionar. Este es el campo que más pesa y el que más se omite.'],
                ]}
              />
            </Subcapitulo>

            <Subcapitulo id="p-tipos" numero="12.3" titulo="Cada tipo de tratamiento se registra distinto">
              <TablaDoc
                minWidth={760}
                cabeceras={['Tratamiento', 'Qué se registra']}
                anchos={[150, undefined]}
                filas={TRATAMIENTOS.map(([t, q]) => [t, q])}
              />
            </Subcapitulo>

            <Subcapitulo id="p-verificacion" numero="12.4" titulo="Verificación de eficacia">
              <p className="parrafo">
                Una acción no se cierra con la evidencia de que se ejecutó, sino con la
                demostración de que sirvió. La reevaluación de la madurez del control en el corte
                siguiente es esa verificación: si el control subió de nivel, la acción funcionó;
                si sigue donde estaba, no. Por eso el plan de tratamiento y la evaluación de
                madurez son el mismo ciclo visto en dos momentos.
              </p>
            </Subcapitulo>

            <Subcapitulo id="p-priorizacion" numero="12.5" titulo="Priorización">
              <p className="parrafo">
                El orden del plan no lo decide una preferencia personal: resulta de multiplicar
                el salto de madurez comprometido por el número de riesgos residuales de nivel
                Medio o superior que ese control toca. Esa cuenta la hace la herramienta y es la
                que abre{' '}
                <Link href="/sgsi/planes" className="text-accent-700 underline underline-offset-2">
                  Planes de tratamiento
                </Link>
                .
              </p>
            </Subcapitulo>
          </Capitulo>

          {/* ── 13 ────────────────────────────────────────────────────────────── */}
          <Capitulo id="roles" numero="13" titulo="Roles y responsabilidades">
            <TablaDoc
              minWidth={760}
              cabeceras={['Rol', 'Responsabilidad en el análisis de riesgos']}
              anchos={[200, undefined]}
              filas={ROLES.map(([r, d]) => [r, d])}
            />
          </Capitulo>

          {/* ── Anexo A ───────────────────────────────────────────────────────── */}
          <Capitulo id="anexo-a" numero="A" titulo="Anexo A. Catálogo de amenazas MAGERIT">
            <p className="parrafo">
              Las {num(datos.amenazas.length, 0)} amenazas del capítulo 5 del Libro II, leídas del
              catálogo vigente. La correspondencia entre cada amenaza, los tipos de activo que
              afecta y los controles que la mitigan se administra en{' '}
              <Link href="/sgsi/amenazas" className="text-accent-700 underline underline-offset-2">
                Amenazas y tipos
              </Link>
              . El asterisco de N.* e I.* es literal: son entradas reales del catálogo.
            </p>

            <div className="flex flex-col gap-5">
              {gruposAmenaza.map((grupo) => {
                const delGrupo = datos.amenazas.filter((a) => a.grupo === grupo);
                return (
                  <div key={grupo} className="flex flex-col gap-2">
                    <p className="etiqueta-campo">
                      {grupo} · {num(delGrupo.length, 0)}
                    </p>
                    <ul
                      className="grid gap-x-6 gap-y-1"
                      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
                    >
                      {delGrupo.map((a) => (
                        <li
                          key={a.codigo}
                          className="flex min-w-0 items-baseline gap-2 border-b border-hairline py-1"
                        >
                          <span className="w-12 shrink-0 font-mono text-11 text-secondary">
                            {a.codigo}
                          </span>
                          <span className="min-w-0 text-11_5 text-primary">{a.nombre}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Capitulo>

          {/* ── Anexo B ───────────────────────────────────────────────────────── */}
          <Capitulo id="anexo-b" numero="B" titulo="Anexo B. Control de cambios">
            <TablaDoc
              minWidth={760}
              cabeceras={['Versión', 'Fecha', 'Descripción del cambio']}
              anchos={[90, 150, undefined]}
              mono={[0]}
              filas={CAMBIOS.map(([v, f, d]) => [v, f, d])}
            />
            <p className="text-11 text-faint">
              MET-SIG-01 v3.0 · elaboró el Líder del SIG · aprobó el Comité del Sistema Integrado
              de Gestión. La parametrización vigente que este documento describe se consulta en{' '}
              <Link
                href="/sgsi/parametros"
                className="text-accent-700 underline underline-offset-2"
              >
                Configuración del modelo
              </Link>
              .
            </p>
          </Capitulo>
        </article>
      </div>
    </main>
  );
}

/* ── Piezas ─────────────────────────────────────────────────────────────────── */

function Capitulo({
  id,
  numero,
  titulo,
  children,
}: {
  id: string;
  numero: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 74 }} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2 border-b border-hairline-strong pb-2">
        <span className="font-mono text-11 tracking-[0.08em] text-label">{numero}</span>
        <h2 className="text-19 font-semibold tracking-[-0.015em] text-primary">{titulo}</h2>
      </div>
      {children}
    </section>
  );
}

function Subcapitulo({
  id,
  numero,
  titulo,
  children,
}: {
  id: string;
  numero: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 74 }} className="flex flex-col gap-2.5">
      <h3 className="flex items-baseline gap-2 text-14 font-semibold text-primary">
        <span className="font-mono text-10_5 text-label">{numero}</span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/// The framed deviation. It reads as a statement the organisation signed, not as a caveat
/// in the margin.
function Desviacion({
  ordinal,
  titulo,
  children,
}: {
  ordinal: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-tarjeta border border-warn-border bg-warn-100 p-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-9_5 uppercase tracking-[0.1em] text-warn-text">
          {ordinal} · declarada
        </span>
        <h4 className="text-14_5 font-semibold text-primary">{titulo}</h4>
      </div>
      {children}
    </section>
  );
}

function EjemploResuelto({ ejemplo: e }: { ejemplo: EjemploVista }) {
  const pasos: [string, string, string][] = [
    ['Valor del activo', `máximo de ${e.valores.D}, ${e.valores.I} y ${e.valores.C}`, num(e.valorActivo, 0)],
    [
      'Impacto en Disponibilidad',
      `${e.valores.D} × ${pct(e.degradaciones.D * 100)}`,
      num(e.valores.D * e.degradaciones.D),
    ],
    [
      'Impacto acumulado',
      'máximo de los impactos por dimensión',
      `${num(e.impacto)} — nivel ${e.nivelImpacto ?? 'sin clasificar'}`,
    ],
    [
      'Riesgo potencial',
      `${num(e.impacto)} × ${num(e.frecuencia.vecesAno)} veces al año`,
      `${num(e.riesgoPotencial)} — nivel ${e.nivelPotencial ?? 'sin clasificar'}`,
    ],
    [
      'Controles preventivos',
      `en nivel L${e.nivelControl.nivel} — ${e.nivelControl.nombre}`,
      `eficacia ${pct(e.nivelControl.eficacia * 100)}`,
    ],
    [
      'Frecuencia residual',
      `${num(e.frecuencia.vecesAno)} × ( 1 − ${num(e.nivelControl.eficacia)} )`,
      `${num(e.frecuenciaResidual)} veces al año`,
    ],
    [
      'Riesgo residual',
      `${num(e.impacto)} × ${num(e.frecuenciaResidual)}`,
      `${num(e.riesgoResidual)} — nivel ${e.nivelResidual ?? 'sin clasificar'}`,
    ],
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <p className="parrafo">
        Un servidor de base de datos productiva se valora en {e.valores.D} en Disponibilidad,{' '}
        {e.valores.I} en Integridad y {e.valores.C} en Confidencialidad. Se analiza frente a la
        amenaza <span className="font-mono text-secondary">{e.amenaza.codigo}</span>{' '}
        {e.amenaza.nombre}, cuya degradación en Disponibilidad es{' '}
        {pct(e.degradaciones.D * 100)} y cuya frecuencia estimada es{' '}
        {corto(e.frecuencia.nombre).toLowerCase()} —{num(e.frecuencia.vecesAno)} veces al año—,
        con sus controles preventivos en L{e.nivelControl.nivel}.
      </p>

      <TablaDoc
        minWidth={720}
        cabeceras={['Paso', 'Cálculo', 'Resultado']}
        anchos={[220, 280, undefined]}
        mono={[1, 2]}
        filas={pasos.map(([p, c, r]) => [p, c, r])}
      />

      <p className="text-11 leading-relaxed text-faint">
        Ninguna de estas cifras está escrita en la página: la degradación, la frecuencia y la
        eficacia se leen del catálogo, la aritmética la hace el mismo módulo que calcula los
        riesgos del inventario y los niveles los asigna la misma función que clasifica las
        matrices. Si el Comité cambia un umbral, este ejemplo cambia con él.
      </p>
    </div>
  );
}

function TablaDoc({
  cabeceras,
  filas,
  anchos,
  minWidth,
  mono,
}: {
  cabeceras: string[];
  filas: (string | number)[][];
  anchos?: (number | undefined)[];
  minWidth: number;
  mono?: number[];
}) {
  const esMono = (i: number) => mono?.includes(i) ?? false;

  return (
    <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
      <div style={{ minWidth }}>
        <table className="w-full border-collapse text-12">
          <thead>
            <tr className="bg-subtle text-left">
              {cabeceras.map((c, i) => (
                <th
                  key={c}
                  style={anchos?.[i] ? { width: anchos[i] } : undefined}
                  className="etiqueta-campo px-3 py-2.5 font-normal"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i} className="border-t border-hairline">
                {fila.map((celda, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 align-top leading-snug ${
                      j === 0 ? 'text-12_5 text-primary' : 'text-11_5 text-secondary-soft'
                    } ${esMono(j) ? 'font-mono tabular-nums' : ''}`}
                  >
                    {celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
