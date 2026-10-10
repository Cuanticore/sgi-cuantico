import 'server-only';

// lib/api/catalogo-rutas.ts
//
// **Tarea 3.6 · el documento OpenAPI se genera del código y no se escribe aparte.**
//
// EL PROBLEMA QUE ESTO EVITA, Y QUE ESTE PROYECTO YA TIENE MEDIDO. La propuesta de la hoja de
// vida nació de un expediente trasladado a mano: 464 comentarios de celda, 214 casillas
// `[PENDIENTE]` y 156 valores que no calzaron en sus listas. Ésa es la forma que toma un
// documento que se mantiene aparte de la cosa que describe. Un `openapi.yaml` escrito a mano es
// el mismo animal: nace exacto, se desincroniza al tercer cambio, y lo peor es que **sigue
// pareciendo exacto** — nadie ve desde afuera que ya miente.
//
// POR QUÉ NO ALCANZA CON «generar el documento desde un objeto». Si este catálogo fuera sólo la
// fuente del documento, seguiría siendo un archivo aparte que alguien olvida. Lo que lo sostiene
// es que **la ruta lee de acá lo que necesita para funcionar**: el permiso que le pasa a
// `conToken` sale de este catálogo. Una entrada desactualizada no produce un documento
// equivocado — produce una ruta que no autoriza lo que debe, y eso sí se nota.
//
// La otra mitad de la red es `app/api/v1/__tests__/toda-ruta-esta-en-el-catalogo.test.ts`, que
// recorre el árbol de archivos y falla si aparece un `route.ts` sin entrada acá.
//
// POR QUÉ NO SE AGREGA UNA LIBRERÍA. La tarea 4.5 deja anotado que hoy no hay ninguna librería
// de esquemas en el repo y que la decisión está abierta. Un generador de OpenAPI tira de esa
// misma cuerda; mientras la decisión no se tome, el catálogo se describe con tipos de
// TypeScript y el documento se arma con un literal. Son treinta líneas y no comprometen nada.

import type { Permiso } from '@/lib/sgsi/permisos';
import { CODIGOS_DE_PROBLEMA, type CodigoProblema } from '@/lib/api/problema';
import { LIMITE_MAXIMO, LIMITE_POR_DEFECTO } from '@/lib/api/paginacion';

export interface ParametroApi {
  nombre: string;
  en: 'path' | 'query';
  obligatorio: boolean;
  tipo: 'string' | 'integer';
  descripcion: string;
}

export interface OperacionApi {
  /// El `operationId`. Es lo que usan los generadores de cliente para nombrar la función, así
  /// que es contrato: cambiarlo renombra un método en el código de quien consume la API.
  id: string;
  metodo: 'get';
  /// Relativa a `/api/v1`, con marcadores al estilo OpenAPI: `/sistemas/{codigo}`.
  ruta: string;
  resumen: string;
  descripcion: string;
  /// Lo que `conToken` va a exigir. **La ruta lee este campo**; no es documentación.
  permiso: Permiso;
  parametros: readonly ParametroApi[];
  /// Los problemas propios de esta operación. El 401 y el 403 NO se declaran acá: los agrega
  /// el generador, porque toda ruta de `/api/v1` pasa por la envoltura y puede devolverlos.
  /// Repetirlos en cada entrada es la clase de duplicación donde una se termina olvidando.
  problemas: readonly CodigoProblema[];
}

/// Los parámetros de paginación, idénticos en toda colección. Se declaran una vez: el día que
/// el tope cambie, cambia en `paginacion.ts` y el documento lo sigue solo.
const PAGINACION: readonly ParametroApi[] = [
  {
    nombre: 'limite',
    en: 'query',
    obligatorio: false,
    tipo: 'integer',
    descripcion: `Cuántas filas devolver, entre 1 y ${LIMITE_MAXIMO}. Por omisión ${LIMITE_POR_DEFECTO}. Un valor fuera de rango se rechaza, no se recorta.`,
  },
  {
    nombre: 'desde',
    en: 'query',
    obligatorio: false,
    tipo: 'string',
    descripcion:
      'Cursor: la clave natural de la última fila recibida. Se toma del campo «siguiente» de la respuesta anterior. Se pagina por clave y no por desplazamiento, para que un alta en medio del recorrido no duplique ni se salte filas.',
  },
];

const CODIGO_DE_SISTEMA: ParametroApi = {
  nombre: 'codigo',
  en: 'path',
  obligatorio: true,
  tipo: 'string',
  descripcion:
    'El código del sistema, por ejemplo «SIS-001». Es la clave natural, inmutable, y es lo que un repositorio declara en su archivo de vínculo.',
};

/// **El catálogo.** Una entrada por operación expuesta en `/api/v1`.
export const OPERACIONES: readonly OperacionApi[] = [
  {
    id: 'comprobarSalud',
    metodo: 'get',
    ruta: '/salud',
    resumen: 'Comprobar que el token está vivo',
    descripcion:
      'Devuelve el nombre y el alcance del token que llamó. Sirve para verificar una credencial recién emitida sin tocar ningún dato del expediente.',
    permiso: 'misig:ver',
    parametros: [],
    problemas: [],
  },
  {
    id: 'obtenerOpenApi',
    metodo: 'get',
    ruta: '/openapi',
    resumen: 'Obtener el contrato de esta API',
    descripcion:
      'El documento OpenAPI 3.1, armado desde el mismo catálogo del que las rutas leen su permiso. No se mantiene aparte, así que no puede desincronizarse.',
    // Detrás del token como todo lo demás. `/api/v1` no tiene rutas públicas, y el contrato de
    // una API privada enumera su superficie: es justo lo que uno no publica por comodidad.
    // `misig:ver` es el permiso más amplio del vocabulario — cualquier token vigente lo tiene.
    permiso: 'misig:ver',
    parametros: [],
    problemas: [],
  },
  {
    id: 'listarSistemas',
    metodo: 'get',
    ruta: '/sistemas',
    resumen: 'Listar los sistemas con hoja de vida',
    descripcion:
      'Los sistemas registrados, ordenados por código y paginados por cursor. Devuelve la ficha breve de cada uno; el expediente completo se pide por código.',
    permiso: 'tecnologia:ver',
    parametros: PAGINACION,
    problemas: ['peticion-invalida'],
  },
  {
    id: 'obtenerSistema',
    metodo: 'get',
    ruta: '/sistemas/{codigo}',
    resumen: 'Obtener la hoja de vida completa de un sistema',
    descripcion:
      'El expediente entero: la ficha del sistema y sus siete colecciones hijas — puertas, excepciones, requisitos, pruebas, tratamientos de datos personales, liberaciones y componentes de terceros.',
    permiso: 'tecnologia:ver',
    parametros: [CODIGO_DE_SISTEMA],
    problemas: ['no-encontrado'],
  },
  {
    id: 'consultarPuertaDeDespliegue',
    metodo: 'get',
    ruta: '/sistemas/{codigo}/puerta-de-despliegue',
    resumen: '¿Puede este sistema desplegar esta versión a producción?',
    descripcion:
      'Responde `puedeDesplegar`, los `faltantes` que lo impiden y los `avisos` que no. Es la ruta que consulta la automatización de cada repositorio antes de publicar una versión.\n\nLa regla vive acá y no en el repositorio a propósito: un producto puede tener varios repositorios, y cuatro copias de la norma son cuatro respuestas distintas el día que el procedimiento cambie. El repositorio pregunta; el SGI responde.\n\nNo exige P1 a P4: esas puertas se registran y se cuentan, no detienen (D17). Exige la hoja de vida abierta (PRO-TEC-04 §5.3), P5 superada (PRO-PRO-03 §5.2) y una liberación de esa versión exacta con autorizador y plan de reversión — las tres últimas, por los 23 despliegues sin autorización que documentó el expediente SIS-001.',
    permiso: 'tecnologia:ver',
    parametros: [
      CODIGO_DE_SISTEMA,
      {
        nombre: 'version',
        en: 'query',
        obligatorio: true,
        tipo: 'string',
        descripcion:
          'La versión que se quiere desplegar, por ejemplo «v2.4.0». Se compara exacta contra las liberaciones registradas: un prefijo dejaría que la autorización de «v2.4» cubriera un «v2.4.0» que nadie miró.',
      },
    ],
    problemas: ['no-encontrado', 'peticion-invalida'],
  },
];

/// La entrada del catálogo, o un error al cargar el módulo.
///
/// Revienta a propósito en vez de devolver `undefined`: una ruta que pida un identificador
/// inexistente tiene que fallar cuando se carga el módulo —es decir, en el build y en las
/// pruebas— y no responder 500 en la primera petición de un cliente.
export function operacion(id: string): OperacionApi {
  const encontrada = OPERACIONES.find((o) => o.id === id);
  if (!encontrada) {
    throw new Error(
      `No hay ninguna operación «${id}» en el catálogo de rutas. Agrégala en lib/api/catalogo-rutas.ts.`,
    );
  }
  return encontrada;
}

/// El esquema de un problema, como lo emite `lib/api/problema.ts`.
const ESQUEMA_PROBLEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: Object.keys(CODIGOS_DE_PROBLEMA) },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
  },
  required: ['type', 'title', 'status'],
};

function respuestaDeProblema(codigo: CodigoProblema) {
  return {
    description: CODIGOS_DE_PROBLEMA[codigo].titulo,
    content: { 'application/problem+json': { schema: ESQUEMA_PROBLEMA } },
  };
}

/// El documento OpenAPI 3.1 que describe `/api/v1`, armado desde el catálogo.
export function documentoOpenApi(): object {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const op of OPERACIONES) {
    const respuestas: Record<string, unknown> = {
      '200': { description: op.resumen },
      // El 401 y el 403 van en TODAS, sin declararse una por una: `conToken` los puede
      // devolver en cualquier ruta de `/api/v1`, por construcción.
      '401': respuestaDeProblema('no-autenticado'),
      '403': respuestaDeProblema('sin-permiso'),
      '500': respuestaDeProblema('error-interno'),
    };
    for (const p of op.problemas) {
      respuestas[String(CODIGOS_DE_PROBLEMA[p].estado)] = respuestaDeProblema(p);
    }

    paths[op.ruta] ??= {};
    paths[op.ruta][op.metodo] = {
      operationId: op.id,
      summary: op.resumen,
      description: `${op.descripcion}\n\nAlcance requerido en el token: \`${op.permiso}\`.`,
      parameters: op.parametros.map((p) => ({
        name: p.nombre,
        in: p.en,
        required: p.obligatorio,
        description: p.descripcion,
        schema: { type: p.tipo },
      })),
      responses: respuestas,
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'SIG Cuántico · API de servicio',
      version: '1.0.0',
      description:
        'Lectura y diligenciamiento de la hoja de vida de los sistemas (FOR-TEC-04) por parte de agentes automatizados.\n\nLa identidad es un token de servicio con alcance acotado y vencimiento obligatorio, no una cuenta de persona: la bitácora registra «api:<nombre del token>» y nunca suplanta a nadie.\n\nUn agente diligencia; una persona cierra. Cerrar una puerta de control, aprobar o prorrogar una excepción y cerrar la hoja de vida exigen un autor de clase persona, y ningún alcance de token los habilita.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        tokenServicio: {
          type: 'http',
          scheme: 'bearer',
          description:
            'El secreto emitido en la pantalla de tokens, con el prefijo `sgi_live_`. Se envía como `Authorization: Bearer <secreto>`. Sólo se muestra una vez al emitirlo; en la base vive únicamente su hash.',
        },
      },
    },
    // A nivel de documento, no de operación: no hay rutas públicas en `/api/v1`, y declararlo
    // una vez evita que una ruta nueva nazca documentada como abierta por omisión.
    security: [{ tokenServicio: [] }],
    paths,
  };
}
