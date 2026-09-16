// app/components/sgsi/informe/InformeDocumento.tsx
//
// El informe de valoración de activos, como documento. Un capítulo por proceso, con su tabla
// de contenido.
//
// ── POR QUÉ ESTÁ TODO EN ESTILOS EN LÍNEA Y NO EN CLASES ────────────────────────────────
//
// Es feo y es deliberado. Este mismo árbol se sirve de TRES maneras: en pantalla, impreso a
// PDF por el navegador, y como `.doc` con `Content-Type: application/msword`. El importador
// de HTML de Word ignora las hojas de estilo y las clases: sólo respeta el atributo `style`
// de cada elemento y los atributos de tabla. Con clases de Tailwind, el Word saldría como
// texto plano sin una sola línea de tabla.
//
// La alternativa era una segunda plantilla sólo para Word, y eso es exactamente lo que este
// módulo existe para evitar: dos plantillas es dos cosas que editar y una que se olvida, y el
// día que difieren, el documento que alguien archivó dice algo distinto del que ve en
// pantalla. Una fuente, tres salidas.
//
// Por la misma razón los colores son hexadecimales literales y no `var(--hf-*)`: Word no
// resuelve propiedades personalizadas de CSS, y la matriz saldría en blanco y negro. Los
// valores son los de `app/globals.css` — si la rampa cambia allá, hay que cambiarla acá, y la
// prueba de que son los mismos es que están escritos al lado.
//
// ── NO LLEVA 'use client' ───────────────────────────────────────────────────────────────
//
// Es un componente de servidor puro, sin estado y sin eventos. Eso es lo que permite que la
// ruta de Word lo pase por `renderToStaticMarkup` y obtenga el mismo HTML que ve la pantalla.

import type { ProcesoDelInforme } from '@/lib/sgsi/informe-valoracion';
import type { MatrizClasica, ColumnaFrecuencia, FilaImpacto } from '@/lib/sgsi/matriz-clasica';
import { SIN_CALCULAR } from '@/lib/sgsi/informe-valoracion';

/// Los mismos valores que `--hf-risk-*` en `app/globals.css`, escritos literales porque Word
/// no resuelve variables de CSS. Indexados por POSICIÓN de la banda, no por su nombre: así
/// renombrar «Crítico» a «Extremo» no vuelve la matriz gris de golpe.
const RAMPA = [
  { bg: '#a52016', fg: '#ffffff' },
  { bg: '#c25a1e', fg: '#ffffff' },
  { bg: '#e0b93c', fg: '#3a2c05' },
  { bg: '#dfe8e2', fg: '#3d5648' },
];

const TINTA = '#1f2a37';
const TINTA_SUAVE = '#5b6875';
const LINEA = '#d7dde3';
const FONDO_CABECERA = '#f1f4f7';

const CUERPO: React.CSSProperties = {
  fontFamily: "'Segoe UI', Calibri, Arial, sans-serif",
  fontSize: '10.5pt',
  color: TINTA,
  lineHeight: 1.45,
};

const TABLA: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  fontSize: '9.5pt',
  marginBottom: '14pt',
};

const TH: React.CSSProperties = {
  border: `1px solid ${LINEA}`,
  background: FONDO_CABECERA,
  padding: '4pt 6pt',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '8.5pt',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: TINTA_SUAVE,
};

const TD: React.CSSProperties = {
  border: `1px solid ${LINEA}`,
  padding: '4pt 6pt',
  verticalAlign: 'top',
};

const NUM: React.CSSProperties = { ...TD, textAlign: 'right', whiteSpace: 'nowrap' };

const H2: React.CSSProperties = {
  fontSize: '15pt',
  margin: '0 0 2pt',
  color: '#12263f',
  // Cada proceso arranca en página nueva: un capítulo partido a la mitad de una hoja es
  // ilegible en el PDF que se archiva y en el impreso que circula por el comité.
  pageBreakBefore: 'always',
  breakBefore: 'page',
};

const H3: React.CSSProperties = {
  fontSize: '11pt',
  margin: '16pt 0 6pt',
  color: '#12263f',
};

const NOTA: React.CSSProperties = {
  fontSize: '8.5pt',
  color: TINTA_SUAVE,
  margin: '0 0 10pt',
};

export interface DatosDocumento {
  capitulos: ProcesoDelInforme[];
  generadoEn: Date;
  alcance: string;
  filasImpacto: FilaImpacto[];
  columnasFrecuencia: ColumnaFrecuencia[];
  umbralValoracion: number;
  totalActivos: number;
  totalEnAnalisis: number;
  totalAceptaciones: number;
}

function fecha(d: Date): string {
  // Escrito a mano y no con `toLocaleDateString`: el mismo texto se produce en el servidor y
  // en el navegador, y dos compilaciones de ICU no siempre coinciden. En un documento que se
  // archiva, la fecha no puede depender de qué máquina lo generó.
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function colorDeBanda(nombre: string | null, bandas: readonly string[]) {
  if (nombre === null) return { bg: '#ffffff', fg: TINTA_SUAVE };
  const i = bandas.indexOf(nombre);
  return RAMPA[Math.min(Math.max(i < 0 ? RAMPA.length - 1 : i, 0), RAMPA.length - 1)];
}

export default function InformeDocumento({ datos }: { datos: DatosDocumento }) {
  // El orden de las bandas sale de la primera matriz que haya: es el del catálogo, y es el
  // que da el color. Sin matrices no hay color que dar, y la lista vacía deja todo en blanco
  // en vez de pintar con una escala inventada.
  const bandasOrdenadas =
    datos.capitulos.find((c) => c.matrizInherente !== null)?.porBandaResidual
      .map((b) => b.etiqueta)
      .filter((e) => e !== SIN_CALCULAR) ?? [];

  return (
    <div style={CUERPO}>
      {/* ── Portada ────────────────────────────────────────────────────────────────── */}
      <h1 style={{ fontSize: '21pt', margin: '0 0 4pt', color: '#12263f' }}>
        Informe de valoración de activos de información
      </h1>
      <p style={{ ...NOTA, fontSize: '10pt', marginBottom: '16pt' }}>
        Aceptación del riesgo residual · Sistema de Gestión de Seguridad de la Información
      </p>

      <table style={{ ...TABLA, width: 'auto', marginBottom: '20pt' }}>
        <tbody>
          <Dato etiqueta="Alcance" valor={datos.alcance} />
          <Dato etiqueta="Fecha de generación" valor={fecha(datos.generadoEn)} />
          <Dato
            etiqueta="Activos incluidos"
            valor={`${datos.totalActivos} · ${datos.totalEnAnalisis} dentro del análisis de riesgos`}
          />
          <Dato
            etiqueta="Umbral de valoración"
            valor={`${datos.umbralValoracion} — un activo entra al análisis cuando su valor lo alcanza`}
          />
          <Dato
            etiqueta="Aceptaciones formales"
            valor={
              datos.totalAceptaciones === 0
                ? 'Ninguna registrada'
                : `${datos.totalAceptaciones} planes de tipo Aceptar`
            }
          />
        </tbody>
      </table>

      {/* ── Resumen del proceso de valoración ──────────────────────────────────────── */}
      <h2 style={{ ...H3, marginTop: 0, fontSize: '13pt' }}>Resumen del proceso de valoración</h2>
      <p style={{ margin: '0 0 8pt' }}>
        Cada activo se valora en las dimensiones de <strong>disponibilidad</strong>,{' '}
        <strong>integridad</strong> y <strong>confidencialidad</strong>. El valor del activo es
        el <strong>mayor</strong> de las tres, no su promedio: un activo es tan crítico como su
        dimensión más comprometida, y promediar escondería un secreto absoluto detrás de dos
        dimensiones irrelevantes.
      </p>
      <p style={{ margin: '0 0 8pt' }}>
        Los activos que alcanzan el umbral de {datos.umbralValoracion} entran al análisis de
        riesgos. Sobre cada uno se cruzan las amenazas aplicables a su tipo MAGERIT; para cada
        par (activo, amenaza) se calcula el <strong>impacto</strong> a partir del valor y de la
        degradación, y el <strong>riesgo inherente</strong> multiplicándolo por la frecuencia
        esperada. La eficacia agregada de los controles que mitigan la amenaza reduce esa
        frecuencia, y de ahí sale el <strong>riesgo residual</strong> (MET-SIG-01 §7).
      </p>
      <p style={{ margin: '0 0 8pt' }}>
        Donde este informe dice <strong>«{SIN_CALCULAR}»</strong> no está diciendo «bajo». Es un
        estado del modelo: la eficacia de los controles de esa amenaza todavía no está
        establecida, así que el residual es <em>desconocido</em>. Sustituirlo por cero dibujaría
        un riesgo tratado que nadie trató, y por eso se imprime aparte en cada tabla.
      </p>
      <p style={{ ...NOTA, marginBottom: '20pt' }}>
        Ninguna cifra de este documento está almacenada: todas se derivan al leer, con las
        mismas funciones que alimentan las pantallas de Valoración, Análisis de riesgos y
        Matrices. Un informe y una pantalla que discrepan son un informe que nadie puede firmar.
      </p>

      {/* ── Tabla de contenido ─────────────────────────────────────────────────────── */}
      <h2 style={{ ...H3, fontSize: '13pt' }}>Contenido</h2>
      <table style={TABLA}>
        <thead>
          <tr>
            <th style={TH}>Proceso</th>
            <th style={{ ...TH, textAlign: 'right' }}>Activos</th>
            <th style={{ ...TH, textAlign: 'right' }}>En análisis</th>
            <th style={{ ...TH, textAlign: 'right' }}>Aceptaciones</th>
          </tr>
        </thead>
        <tbody>
          {datos.capitulos.map((c) => (
            <tr key={c.ancla}>
              <td style={TD}>
                <a href={`#${c.ancla}`} style={{ color: '#12263f', textDecoration: 'none' }}>
                  {c.proceso}
                </a>
              </td>
              <td style={NUM}>{c.activos}</td>
              <td style={NUM}>{c.enAnalisis}</td>
              <td style={NUM}>{c.aceptaciones.length || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={NOTA}>
        Los capítulos van ordenados por cuántos activos pone cada proceso en el análisis, de
        mayor a menor — no alfabéticamente: el que más expone es el que primero hay que mirar.
      </p>

      {datos.capitulos.length === 0 && (
        <p style={{ ...NOTA, fontSize: '10pt' }}>
          El recorte seleccionado no incluye ningún activo. Ampliá el alcance desde las opciones
          del informe.
        </p>
      )}

      {/* ── Un capítulo por proceso ────────────────────────────────────────────────── */}
      {datos.capitulos.map((c) => (
        <section key={c.ancla}>
          <h2 id={c.ancla} style={H2}>
            {c.proceso}
          </h2>
          <p style={NOTA}>
            {c.activos} {c.activos === 1 ? 'activo' : 'activos'} · {c.enAnalisis} dentro del
            análisis de riesgos
          </p>

          {/* 1 · Resumen de la valoración */}
          <h3 style={H3}>1 · Resumen de la valoración</h3>
          <ConteoTabla
            titulo="Nivel de valor"
            filas={c.porNivelValor}
            total={c.activos}
          />
          <p style={NOTA}>
            Los rangos en cero se imprimen igual: «0» es una afirmación, y una fila ausente
            obliga a preguntarse si el rango no existe o si nadie lo contó.
          </p>

          {/* 2 · Frecuencias por tipo */}
          <h3 style={H3}>2 · Frecuencias por tipo de activo</h3>
          <ConteoTabla titulo="Tipo MAGERIT" filas={c.porTipo} total={c.activos} />

          {/* 3 · Matrices */}
          {c.matrizInherente !== null && c.matrizResidual !== null ? (
            <>
              <h3 style={H3}>3 · Matrices de riesgo · impacto × frecuencia</h3>
              <p style={NOTA}>
                Estas matrices cuentan <strong>riesgos</strong>, no activos: un activo con doce
                amenazas aplicables pone doce puntos. Por eso sus totales no coinciden con los{' '}
                {c.enAnalisis} activos en análisis.
              </p>
              <Matriz
                titulo="Riesgo inherente — antes de controles"
                matriz={c.matrizInherente}
                filas={datos.filasImpacto}
                columnas={datos.columnasFrecuencia}
                bandas={bandasOrdenadas}
              />
              <Matriz
                titulo="Riesgo residual — después de controles"
                matriz={c.matrizResidual}
                filas={datos.filasImpacto}
                columnas={datos.columnasFrecuencia}
                bandas={bandasOrdenadas}
              />
            </>
          ) : (
            <>
              <h3 style={H3}>3 · Matrices de riesgo</h3>
              <p style={NOTA}>
                Este proceso no tiene riesgos ubicables, así que no se imprime la matriz. Dos
                cuadrículas de ceros parecerían un error de cálculo.
              </p>
            </>
          )}

          {/* 4 · Riesgo residual */}
          <h3 style={H3}>4 · Riesgo residual</h3>
          <ConteoTabla
            titulo="Banda residual"
            filas={c.porBandaResidual}
            total={c.enAnalisis}
          />
          {c.traslado.length > 0 && (
            <>
              <h3 style={{ ...H3, fontSize: '10pt', marginTop: '10pt' }}>
                Traslado inherente → residual
              </h3>
              <table style={TABLA}>
                <thead>
                  <tr>
                    <th style={TH}>Inherente</th>
                    <th style={TH}>Residual</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Activos</th>
                  </tr>
                </thead>
                <tbody>
                  {c.traslado.map((t) => (
                    <tr key={`${t.inherente}|${t.residual}`}>
                      <td style={TD}>{t.inherente}</td>
                      <td style={TD}>{t.residual}</td>
                      <td style={NUM}>{t.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={NOTA}>Es lo que el tratamiento consiguió, dicho en una tabla.</p>
            </>
          )}

          {/* 5 · Aceptación del riesgo residual — sólo si la hay */}
          {c.aceptaciones.length > 0 && (
            <>
              <h3 style={H3}>5 · Aceptación del riesgo residual</h3>
              <table style={TABLA}>
                <thead>
                  <tr>
                    <th style={TH}>Plan</th>
                    <th style={TH}>Activo</th>
                    <th style={TH}>Justificación</th>
                    <th style={TH}>Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {c.aceptaciones.map((a) => (
                    <tr key={a.planCodigo}>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{a.planCodigo}</td>
                      <td style={TD}>
                        {a.activoCodigo}
                        <br />
                        <span style={{ color: TINTA_SUAVE, fontSize: '8.5pt' }}>
                          {a.activoNombre}
                        </span>
                      </td>
                      <td style={TD}>{a.justificacion ?? '—'}</td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                        {a.fechaRevision ?? (
                          <strong style={{ color: '#a52016' }}>Sin fecha</strong>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={NOTA}>
                Aceptar es planificar, no dejar de hacerlo. Una aceptación sin fecha de revisión
                es una que nadie vuelve a mirar, y va marcada a propósito.
              </p>
            </>
          )}

          {/* 6 · Detalle */}
          <h3 style={H3}>
            {c.aceptaciones.length > 0 ? '6' : '5'} · Detalle de activos
          </h3>
          <table style={TABLA}>
            <thead>
              <tr>
                <th style={TH}>Código</th>
                <th style={TH}>Activo</th>
                <th style={TH}>Tipo</th>
                <th style={TH}>Responsable</th>
                <th style={{ ...TH, textAlign: 'right' }}>Valor</th>
                <th style={TH}>Inherente</th>
                <th style={TH}>Residual</th>
              </tr>
            </thead>
            <tbody>
              {c.filas.map((f) => {
                const cr = colorDeBanda(f.bandaResidual, bandasOrdenadas);
                return (
                  <tr key={f.codigo}>
                    <td style={{ ...TD, whiteSpace: 'nowrap', fontFamily: 'Consolas, monospace' }}>
                      {f.codigo}
                    </td>
                    <td style={TD}>{f.nombre}</td>
                    <td style={TD}>{f.tipo}</td>
                    <td style={TD}>{f.responsable ?? '—'}</td>
                    <td style={NUM}>
                      {f.valor}
                      <br />
                      <span style={{ color: TINTA_SUAVE, fontSize: '8pt' }}>{f.nivelValor}</span>
                    </td>
                    <td style={TD}>{f.bandaInherente ?? '—'}</td>
                    <td
                      style={{
                        ...TD,
                        whiteSpace: 'nowrap',
                        background: f.bandaResidual === null ? '#ffffff' : cr.bg,
                        color: f.bandaResidual === null ? TINTA_SUAVE : cr.fg,
                        fontWeight: 600,
                      }}
                    >
                      {f.bandaResidual ?? SIN_CALCULAR}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <tr>
      <th style={{ ...TH, whiteSpace: 'nowrap' }}>{etiqueta}</th>
      <td style={TD}>{valor}</td>
    </tr>
  );
}

function ConteoTabla({
  titulo,
  filas,
  total,
}: {
  titulo: string;
  filas: readonly { etiqueta: string; n: number }[];
  total: number;
}) {
  if (filas.length === 0) {
    return <p style={NOTA}>Sin datos para esta tabla.</p>;
  }
  return (
    <table style={TABLA}>
      <thead>
        <tr>
          <th style={TH}>{titulo}</th>
          <th style={{ ...TH, textAlign: 'right' }}>Activos</th>
          <th style={{ ...TH, textAlign: 'right' }}>%</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.etiqueta}>
            <td style={TD}>{f.etiqueta}</td>
            <td style={NUM}>{f.n}</td>
            {/* Con total cero el porcentaje no es 0 %, es indefinido: una división por cero
                impresa como «0 %» afirma algo que nadie calculó. */}
            <td style={NUM}>{total > 0 ? `${Math.round((f.n / total) * 100)} %` : '—'}</td>
          </tr>
        ))}
        <tr>
          <td style={{ ...TD, fontWeight: 600 }}>Total</td>
          <td style={{ ...NUM, fontWeight: 600 }}>{total}</td>
          <td style={NUM}>—</td>
        </tr>
      </tbody>
    </table>
  );
}

function Matriz({
  titulo,
  matriz,
  filas,
  columnas,
  bandas,
}: {
  titulo: string;
  matriz: MatrizClasica;
  filas: readonly FilaImpacto[];
  columnas: readonly ColumnaFrecuencia[];
  bandas: readonly string[];
}) {
  return (
    <>
      <h3 style={{ ...H3, fontSize: '10pt', marginTop: '10pt' }}>{titulo}</h3>
      <table style={{ ...TABLA, marginBottom: '6pt' }}>
        <thead>
          <tr>
            <th style={TH}>Impacto ↓ · Frecuencia →</th>
            {columnas.map((col) => (
              <th key={col.nombre} style={{ ...TH, textAlign: 'center' }} title={col.lectura}>
                {col.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f.nombre}>
              <th style={{ ...TH, textTransform: 'none', fontSize: '9pt' }}>{f.nombre}</th>
              {columnas.map((col, j) => {
                const n = matriz.conteos[i]?.[j] ?? 0;
                const c = colorDeBanda(matriz.bandas[i]?.[j] ?? null, bandas);
                return (
                  <td
                    key={col.nombre}
                    // El conteo va ESCRITO dentro de la casilla y no sólo codificado en el
                    // color: el color es un apoyo, y en una impresión a blanco y negro —o
                    // para quien no distingue el rojo del verde— sería el único portador.
                    style={{
                      ...TD,
                      textAlign: 'center',
                      background: c.bg,
                      color: c.fg,
                      fontWeight: n > 0 ? 700 : 400,
                      opacity: n > 0 ? 1 : 0.55,
                    }}
                    title={`${f.nombre} · ${col.lectura} · ${matriz.bandas[i]?.[j] ?? 'sin banda'}`}
                  >
                    {n === 0 ? '·' : n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={NOTA}>
        {matriz.total} {matriz.total === 1 ? 'riesgo ubicado' : 'riesgos ubicados'}
        {matriz.sinImpacto > 0 && ` · ${matriz.sinImpacto} sin impacto calculado`}
        {matriz.sinResidual > 0 && ` · ${matriz.sinResidual} sin residual calculado`}
        {'. '}
        El color de cada casilla es el de su propia banda de riesgo, no el de lo que cayó
        adentro: una casilla vacía en zona crítica sigue siendo crítica, y ésa es justamente la
        lectura que la matriz aporta.
      </p>
    </>
  );
}
