import '@testing-library/jest-dom';

// `next/jest` carga el `.env` del proyecto, así que las variables de la máquina de quien
// corre las pruebas entran al entorno de la suite. Para casi todo eso es lo que se quiere
// —`DATABASE_URL`, por ejemplo— pero no para las que ALTERAN UNA DECISIÓN DE PERMISOS.
//
// `SGI_ROL_DEV` simula pertenecer al grupo. Con la variable puesta en el `.env` local,
// `rolDesdeGrupos([])` deja de devolver Colaborador y quince pruebas de permisos fallan sin
// que nadie haya tocado el código: el resultado depende de quién corre la suite. Ese es el
// tipo de prueba que se «arregla» ajustando la aserción, y así se pierde la garantía.
//
// Se limpian acá, una vez, antes de cualquier prueba. Los casos que necesitan la variable la
// ponen ellos mismos y la restauran al terminar.
const entorno = process.env as Record<string, string | undefined>;
for (const clave of ['SGI_ROL_DEV', 'SGI_ACCESO_SIN_GRUPO', 'SGI_ROL_POR_DEFECTO']) {
  delete entorno[clave];
}
