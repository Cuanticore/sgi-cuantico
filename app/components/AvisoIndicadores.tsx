// app/components/AvisoIndicadores.tsx
//
// What the Indicadores screen shows when the SharePoint workbook cannot be read.
//
// It replaces a full-page error that also replaced the SHELL — so a 404 on a SharePoint
// path locked the person out of the SGSI module too, which does not touch SharePoint at
// all. The remote dependency of one domain was taking down the other. Now the shell stays,
// the sidebar and its links keep working, and only the sections that genuinely need the
// workbook are missing.
//
// The message names the probable cause instead of saying "verifica la configuración". A 404
// and a 401 are different problems with different owners: one is a path, the other is a
// permission, and telling them apart is most of the fix.

interface Props {
  /// HTTP status from the Graph call, when there was one.
  estado: number | null;
  /// Which year's workbook failed, so the message points at the right variables.
  anio: string;
  /// Stack and message, shown outside production only.
  detalle: string | null;
}

export interface Diagnostico {
  titulo: string;
  causa: string;
  revisar: string[];
}

/// Exported for its tests. It is the only branching in this file, and it is the part that
/// decides whether the reader is sent to look at a path or at a credential — getting that
/// backwards sends somebody to rotate a secret over a renamed file.
export function diagnostico(estado: number | null, anio: string): Diagnostico {
  if (estado === 404) {
    return {
      titulo: 'No se encontró el archivo de indicadores en SharePoint',
      causa:
        'La ruta o el nombre del archivo no existen en el sitio. Un 404 acá casi siempre es un archivo movido o renombrado, no un problema de permisos: las credenciales funcionaron, el archivo no estaba.',
      revisar: [
        `SHAREPOINT_INDICATORS_PATH${anio === '2025' ? '_2025' : ''} — la carpeta`,
        `SHAREPOINT_INDICATORS_FILE${anio === '2025' ? '_2025' : ''} — el nombre exacto, con su extensión`,
        'SHAREPOINT_SITE_URL y SHAREPOINT_SITE_NAME — el sitio donde se busca',
      ],
    };
  }
  if (estado === 401 || estado === 403) {
    return {
      titulo: 'SharePoint rechazó las credenciales',
      causa:
        'La aplicación se autenticó mal o no tiene permiso sobre el sitio. Suele ser un secreto vencido o un permiso de Graph que nunca se consintió.',
      revisar: [
        'SHAREPOINT_CLIENT_SECRET — ¿venció?',
        'SHAREPOINT_CLIENT_ID y SHAREPOINT_TENANT_ID',
        'Los permisos de aplicación del App Registration sobre Microsoft Graph, y su consentimiento de administrador',
      ],
    };
  }
  return {
    titulo: 'No se pudo leer la matriz de indicadores',
    causa:
      estado === null
        ? 'La llamada a SharePoint no llegó a responder. Puede ser red, DNS o el servicio del otro lado.'
        : `SharePoint respondió ${estado}.`,
    revisar: ['La conectividad del servidor hacia graph.microsoft.com', 'El estado del servicio de SharePoint'],
  };
}

export default function AvisoIndicadores({ estado, anio, detalle }: Props) {
  const d = diagnostico(estado, anio);

  return (
    <main className="px-8 pt-6 pb-14">
      <div
        className="flex max-w-[86ch] flex-col gap-3 rounded-tarjeta border px-5 py-5"
        style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-17 font-bold" style={{ color: 'var(--hf-warn-text)' }}>
            {d.titulo}
          </h1>
          {estado !== null && (
            <span
              className="rounded-badge px-2 py-0.5 font-mono text-10 font-bold"
              style={{ background: 'var(--hf-warn-500)', color: '#ffffff' }}
            >
              HTTP {estado}
            </span>
          )}
          <span className="font-mono text-10_5" style={{ color: 'var(--hf-warn-text-soft)' }}>
            matriz {anio}
          </span>
        </div>

        <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
          {d.causa}
        </p>

        <div className="flex flex-col gap-1">
          <span className="etiqueta-campo text-9" style={{ color: 'var(--hf-warn-text-soft)' }}>
            QUÉ REVISAR
          </span>
          <ul className="flex flex-col gap-1">
            {d.revisar.map((r) => (
              <li key={r} className="text-11_5" style={{ color: 'var(--hf-warn-text)' }}>
                · {r}
              </li>
            ))}
          </ul>
        </div>

        {/* The part that matters most on this screen: the other domain is fine. */}
        <p
          className="rounded-campo border px-3 py-2 text-11_5 [text-wrap:pretty]"
          style={{
            background: 'var(--hf-accent-50)',
            borderColor: 'var(--hf-accent-border)',
            color: 'var(--hf-accent-800)',
          }}
        >
          <strong>El SGSI no depende de SharePoint.</strong> El inventario de activos, las
          matrices de riesgo, los controles y los planes de tratamiento están en la base de
          datos y siguen funcionando: entrá por el menú de la izquierda.
        </p>

        {detalle && (
          <details className="mt-1">
            <summary
              className="cursor-pointer font-mono text-10_5"
              style={{ color: 'var(--hf-warn-text-soft)' }}
            >
              detalle técnico
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-campo bg-slate-900 p-4 text-10_5 leading-relaxed text-amber-200">
              {detalle}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
