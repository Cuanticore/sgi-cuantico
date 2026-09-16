// app/sgsi/informe-valoracion/page.tsx
//
// El informe de valoración de activos, en pantalla. La misma marcación que se descarga como
// Word y que el navegador imprime a PDF.
//
// ── EL RECORTE VIAJA EN LA URL, NO EN UN ESTADO ─────────────────────────────────────────
//
// `?procesos=A,B&responsables=C` es lo que define el informe. Eso lo hace enlazable: el
// informe que alguien llevó al comité se puede volver a abrir exactamente igual pegando la
// dirección, y las tres descargas —Word, Excel, PDF— salen del mismo recorte sin tener que
// pasárselo a cada una por separado. Un estado en el cliente habría obligado a reconstruirlo
// en cada ruta de descarga, que es donde se desincronizan.
//
// Sin parámetros: TODO. El informe completo es el que se lleva al comité; el recorte es la
// excepción que alguien elige.

import { leerInforme } from './informe.query';
import InformeDocumento from '@/app/components/sgsi/informe/InformeDocumento';
import BarraInforme from '@/app/components/sgsi/informe/BarraInforme';

export const dynamic = 'force-dynamic';

/// Una lista separada por comas en la URL, ya limpia. Los vacíos se descartan para que
/// `?procesos=` —que es lo que deja un formulario sin selección— signifique «todos» y no
/// «un proceso llamado cadena vacía», que no devolvería nada.
function lista(valor: string | string[] | undefined): string[] {
  const crudo = Array.isArray(valor) ? valor.join(',') : (valor ?? '');
  return crudo
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function InformeValoracionPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const procesos = lista(params.procesos);
  const responsables = lista(params.responsables);

  const datos = await leerInforme({ procesos, responsables });

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <BarraInforme
        procesosDisponibles={datos.procesosDisponibles}
        responsablesDisponibles={datos.responsablesDisponibles}
        procesosElegidos={procesos}
        responsablesElegidos={responsables}
      />

      {/* El documento va sobre blanco y con sombra: en pantalla se lee como la hoja que
          después se imprime, así que lo que se ve es lo que sale. */}
      <article className="rounded-lg border border-border-field bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <InformeDocumento datos={datos} />
      </article>
    </div>
  );
}
