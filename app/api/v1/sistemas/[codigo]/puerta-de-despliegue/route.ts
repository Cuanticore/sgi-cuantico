// app/api/v1/sistemas/[codigo]/puerta-de-despliegue/route.ts
//
// **La ruta que consulta la automatización de cada repositorio antes de publicar una versión.**
//
// Consulta lo mínimo —la cabecera del sistema, sus puertas y sus liberaciones— y delega toda la
// decisión en `lib/sig/puerta-de-despliegue.ts`, que es donde vive la norma y donde está
// probada. Acá no se decide nada: si alguna condición apareciera escrita en este archivo,
// habría dos sitios que responden la misma pregunta.
//
// POR QUÉ ESTA RUTA EXISTE EN VEZ DE QUE EL REPOSITORIO LO CALCULE. Un producto como MinTrace
// tiene varios repositorios. Si cada uno trajera su copia de la regla serían cuatro copias y,
// el día que el procedimiento cambie, cuatro respuestas distintas durante un tiempo que nadie
// puede medir. La automatización que se instala en cada repo son quince líneas de `curl` que no
// conocen la norma — y por eso no pueden desviarse de ella.
//
// DEVUELVE 200 AUNQUE LA PUERTA ESTÉ CERRADA, y es deliberado: que un sistema no pueda
// desplegar no es un error de la petición. La petición se atendió perfectamente y la respuesta
// es «no, y estas son las seis razones». Un 403 acá se confundiría con el 403 de alcance
// insuficiente del token, que es un problema completamente distinto y se arregla de otra forma.

import { conToken } from '@/lib/api/con-token';
import { operacion } from '@/lib/api/catalogo-rutas';
import { problema } from '@/lib/api/problema';
import { puertaDeDespliegue } from '@/lib/sig/puerta-de-despliegue';
import { prisma } from '@/lib/db';

const OP = operacion('consultarPuertaDeDespliegue');

export const GET = conToken(
  OP.permiso,
  async (request, _autor, contexto: { params: Promise<{ codigo: string }> }) => {
    const { codigo } = await contexto.params;
    const version = new URL(request.url).searchParams.get('version')?.trim() ?? '';

    if (version === '') {
      return problema(
        'peticion-invalida',
        'Falta el parámetro «version»: la autorización de paso a producción es por versión, ' +
          'no por sistema. Sin ella no hay nada que verificar.',
      );
    }

    const sistema = await prisma.sistema.findUnique({
      where: { codigo },
      select: {
        codigo: true,
        nombre: true,
        abiertaEn: true,
        cerradaEn: true,
        puertas: { select: { puerta: true, resultado: true } },
        liberaciones: {
          select: { version: true, planReversion: true, resultado: true, autoriza: { select: { nombre: true } } },
        },
      },
    });

    if (sistema === null) {
      return problema(
        'no-encontrado',
        `No existe ningún sistema con el código «${codigo}». Revisa el archivo .sgi/sistema.yml ` +
          'del repositorio: es de donde la automatización toma este código.',
      );
    }

    const decision = puertaDeDespliegue(
      {
        codigo: sistema.codigo,
        nombre: sistema.nombre,
        abiertaEn: sistema.abiertaEn?.toISOString() ?? null,
        cerradaEn: sistema.cerradaEn?.toISOString() ?? null,
        puertas: sistema.puertas,
        liberaciones: sistema.liberaciones.map((l) => ({
          version: l.version,
          autoriza: l.autoriza?.nombre ?? null,
          planReversion: l.planReversion,
          resultado: l.resultado,
        })),
      },
      version,
    );

    return Response.json(
      { sistema: sistema.codigo, nombre: sistema.nombre, version, ...decision },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  },
);
