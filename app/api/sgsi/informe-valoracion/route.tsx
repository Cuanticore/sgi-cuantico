// app/api/sgsi/informe-valoracion/route.ts
//
// El informe de valoración, descargable. Word y Excel; el PDF lo hace el navegador
// imprimiendo la pantalla, así que no pasa por acá.
//
// ── EL WORD ES EL MISMO ÁRBOL DE REACT, NO UNA SEGUNDA PLANTILLA ────────────────────────
//
// `renderToStaticMarkup(<InformeDocumento …>)` y se sirve con `application/msword`. Word abre
// HTML y lo convierte a documento; es lo que hace cualquier exportador «a Word» que no genere
// OOXML de verdad.
//
// Se eligió esto sobre `docx` o `html-to-docx` por una razón concreta y no por evitar una
// dependencia: **no hay una segunda plantilla que mantener**. Con una librería de OOXML, el
// documento habría que describirlo otra vez —párrafos, tablas, colores— y a partir de ahí
// serían dos descripciones del mismo informe. El día que se agrega una sección, alguien la
// agrega en una sola, y el Word que se archiva deja de decir lo que dice la pantalla.
//
// Lo que se pierde: no hay paginación real, ni encabezados de página, ni índice navegable de
// Word. El salto de página por capítulo sí funciona —`page-break-before` lo respeta— y el
// documento se puede editar. Para un informe que se revisa y se firma, alcanza.
//
// ── EL `<html>` DE ALREDEDOR IMPORTA ────────────────────────────────────────────────────
//
// Word necesita el `charset` declarado o los acentos salen rotos, y necesita `@page` para el
// tamaño y los márgenes. Eso NO puede vivir en el componente —en la pantalla lo pone el layout
// de Next— así que se arma acá, alrededor del mismo cuerpo.
//
// La ruta está fuera de `/sgsi`, así que el portero del layout no la ve: el permiso se
// comprueba acá explícitamente, como hacen `exportar-activos` y `plantilla-activos`.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { renderToStaticMarkup } from 'react-dom/server';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { leerInforme } from '@/app/sgsi/informe-valoracion/informe.query';
import { construirLibroInforme } from '@/lib/sgsi/informe-libro';
import InformeDocumento from '@/app/components/sgsi/informe/InformeDocumento';

export const dynamic = 'force-dynamic';

function lista(valor: string | null): string[] {
  return (valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/// El nombre del archivo. Lleva la fecha porque estos documentos se archivan y se comparan
/// entre sí: dos «Informe de valoración.docx» en la misma carpeta no se distinguen.
function nombreArchivo(extension: string, fecha: Date): string {
  return `Informe de valoracion de activos ${fecha.toISOString().slice(0, 10)}.${extension}`;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });
  if (!puede(rolDesdeGrupos(session.user?.grupos), 'sgsi:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  const url = new URL(request.url);
  const formato = url.searchParams.get('formato') ?? 'word';
  const datos = await leerInforme({
    procesos: lista(url.searchParams.get('procesos')),
    responsables: lista(url.searchParams.get('responsables')),
  });

  if (formato === 'excel') {
    const libro = await construirLibroInforme(datos);
    const buffer = await libro.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombreArchivo('xlsx', datos.generadoEn))}`,
      },
    });
  }

  if (formato !== 'word') {
    return NextResponse.json(
      { error: `Formato no soportado: ${formato}. Son «word» y «excel»; el PDF lo imprime el navegador.` },
      { status: 400 },
    );
  }

  const cuerpo = renderToStaticMarkup(<InformeDocumento datos={datos} />);

  // `xmlns:w` y la `WordDocument` de `<xml>` son lo que hace que Word lo abra como documento
  // propio y no como «página web» en modo lectura. Es fea y es la que funciona.
  const documento = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Informe de valoración de activos de información</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4 landscape; margin: 1.6cm 1.4cm; }
body { margin: 0; }
table { border-collapse: collapse; }
</style>
</head>
<body>${cuerpo}</body>
</html>`;

  return new NextResponse(documento, {
    headers: {
      // `charset=utf-8` en la cabecera además del `<meta>`: Word mira la cabecera primero, y
      // sin esto los acentos del informe salen como rombos.
      'Content-Type': 'application/msword; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombreArchivo('doc', datos.generadoEn))}`,
    },
  });
}
