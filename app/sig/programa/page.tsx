// app/sig/programa/page.tsx
//
// Esta ruta quedó duplicada por mi culpa.
//
// Ya existía acá la grilla proceso × mes del FOR-CAL-04, de sólo lectura, y construí la
// misma vista en `/sig/auditorias/programa` sin notarlo — con la cabecera editable, el
// navegador de año, los perfiles de auditor y la exportación a Excel. Durante un rato hubo
// dos entradas en la barra lateral, con la misma abreviatura, apuntando a la misma matriz.
//
// Se consolida en `/sig/auditorias/programa`: vive junto a la lista de auditorías y su
// ficha, y el nombre dice de qué programa habla. Esta ruta queda como redirección
// permanente en vez de borrarse, porque un enlace guardado o un marcador no tienen por qué
// romperse por un reordenamiento nuestro.

import { permanentRedirect } from 'next/navigation';

export default function ProgramaPage() {
  permanentRedirect('/sig/auditorias/programa');
}
