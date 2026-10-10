// app/api/v1/sistemas/route.ts
//
// **Tarea 3.1 · listar los sistemas con hoja de vida.**
//
// La ruta hace tres cosas y ninguna más: validar la paginación, consultar, y envolver con el
// constructor puro. Toda la forma de la respuesta vive en `lib/sig/hoja-de-vida-json.ts` y toda
// la regla de paginación en `lib/api/paginacion.ts`, porque las dos se prueban mejor sin una
// base delante.
//
// SE PIDE UNA FILA DE MÁS, a propósito: es cómo se sabe si hay página siguiente sin una segunda
// consulta de conteo, que sobre una tabla grande cuesta más que la página misma.
//
// SE ORDENA POR `codigo` Y NO POR `id`. El código es la clave natural, estable y conocida por
// quien consume la API; `id` es un autoincremental cuyo orden es el de creación, que no es el
// orden en que nadie quiere leer un expediente. Ver el encabezado de `paginacion.ts`.

import { conToken } from '@/lib/api/con-token';
import { operacion } from '@/lib/api/catalogo-rutas';
import { armarPagina, leerPaginacion } from '@/lib/api/paginacion';
import { problema } from '@/lib/api/problema';
import { fichaDeSistema } from '@/lib/sig/hoja-de-vida-json';
import { prisma } from '@/lib/db';

const OP = operacion('listarSistemas');

export const GET = conToken(OP.permiso, async (request) => {
  const pagina = leerPaginacion(new URL(request.url));
  if (!pagina.ok) return problema('peticion-invalida', pagina.detalle);

  const filas = await prisma.sistema.findMany({
    where: pagina.desde === null ? undefined : { codigo: { gt: pagina.desde } },
    orderBy: { codigo: 'asc' },
    take: pagina.limite + 1,
    include: {
      producto: { select: { nombre: true } },
      propietario: { select: { nombre: true } },
      responsableTecnico: { select: { nombre: true } },
    },
  });

  const { datos, siguiente } = armarPagina(filas, pagina.limite, (f) => f.codigo);

  return Response.json(
    { datos: datos.map(fichaDeSistema), siguiente },
    // El expediente nombra personas, sistemas reales y su criticidad. Es exactamente el mapa
    // que el layout de `/tecnologia` se niega a mostrar sin el grupo del Directorio, así que no
    // se guarda en ningún intermediario.
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
