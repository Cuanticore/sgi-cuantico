// app/scorm/runner/page.tsx
//
// El runner vive en el origen de contenido y no tiene sesión ni acceso a la base: recibe el
// estado del intento por `postMessage` desde la página del player y le devuelve los cambios.
// El SCO cuelga de un iframe anidado del MISMO origen, que es lo que le permite encontrar
// `API_1484_11` subiendo por `window.parent`.

import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { esOrigenDeContenido } from '@/lib/sig/scorm-origen';
import Runner from './Runner.client';

export default async function Page() {
  const cabeceras = await headers();
  if (!esOrigenDeContenido(cabeceras.get('host'), process.env.SCORM_ORIGEN_CONTENIDO)) {
    notFound();
  }
  const origenApp = process.env.SCORM_ORIGEN_APP ?? '';
  if (origenApp === '') notFound();

  return <Runner origenApp={origenApp} />;
}
