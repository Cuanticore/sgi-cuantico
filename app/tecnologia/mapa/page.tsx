// app/tecnologia/mapa/page.tsx
//
// El mapa tecnológico: de la empresa al contenedor. **Es el componente clave del módulo**
// según la spec, y lo es porque responde de un vistazo la pregunta que hoy nadie contesta:
// qué hay, dónde cuelga y dónde vive.
//
// D3 · **los despliegues entran como hojas**, no se corta en el activo. Es donde está la
// información que hoy no se ve, y el despliegue sigue sin ser un activo: es una hoja de
// presentación, no un nodo del inventario.

import { prisma } from '@/lib/db';
import { armarArbol, rutaDeNivel, type Nivel } from '@/lib/sig/niveles';
import MapaClient from './Mapa.client';

export const dynamic = 'force-dynamic';

export default async function MapaPage() {
  const [niveles, activos, despliegues, valores, dependencias] = await Promise.all([
    prisma.nivelActivo.findMany({
      select: { id: true, grado: true, nombre: true, padreId: true, clase: true, activo: true },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    }),
    prisma.activo.findMany({
      where: { activo: true },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        nivelId: true,
        propietarioId: true,
        personaId: true,
        tipo: { select: { nombre: true } },
        area: { select: { nombre: true } },
      },
      orderBy: { codigo: 'asc' },
    }),
    prisma.despliegue.findMany({
      where: { activoRegistro: true },
      orderBy: [{ ambiente: 'asc' }, { nombre: 'asc' }],
    }),
    prisma.activoValor.findMany({ select: { activoId: true, valor: { select: { valor: true } } } }),
    prisma.dependenciaActivo.findMany({
      include: { dependeDe: { select: { id: true, codigo: true, nombre: true } } },
    }),
  ]);

  const criticidad = new Map<number, number>();
  for (const v of valores) {
    const previo = criticidad.get(v.activoId);
    if (previo === undefined || v.valor.valor > previo) criticidad.set(v.activoId, v.valor.valor);
  }

  const jerarquia: Nivel[] = niveles;

  const arbol = armarArbol({
    niveles: jerarquia,
    activos: activos.map((a) => ({
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      nivelId: a.nivelId,
      tipo: a.tipo.nombre,
      propietarioId: a.propietarioId,
      criticidad: criticidad.get(a.id) ?? null,
    })),
    despliegues: despliegues.map((d) => ({
      id: d.id,
      activoId: d.activoId,
      nombre: d.nombre,
      ambiente: d.ambiente,
      estado: d.estado,
    })),
  });

  // El detalle de cada nodo se arma acá y viaja completo: el panel no vuelve a consultar al
  // cambiar de selección, que sobre un árbol de centenares de nodos serían centenares de
  // idas al servidor para mostrar cuatro campos.
  const detalleActivo = Object.fromEntries(
    activos.map((a) => [
      `a${a.id}`,
      {
        ruta: a.nivelId === null ? 'Sin clasificar' : rutaDeNivel(a.nivelId, jerarquia),
        campos: [
          { etiqueta: 'Tipo', valor: a.tipo.nombre },
          { etiqueta: 'Área', valor: a.area.nombre },
          {
            etiqueta: 'Propietario',
            valor: a.propietarioId === null ? 'sin propietario' : 'asignado',
            alerta: a.propietarioId === null,
          },
          {
            etiqueta: 'Criticidad',
            // Sin valorar NO es «bajo»: es que nadie lo miró.
            valor: criticidad.get(a.id) === undefined ? 'sin valorar' : String(criticidad.get(a.id)),
            alerta: criticidad.get(a.id) === undefined,
          },
        ],
        dependencias: dependencias
          .filter((d) => d.activoId === a.id)
          .map((d) => ({ tipo: d.tipo, nombre: d.dependeDe.nombre })),
      },
    ]),
  );

  const detalleDespliegue = Object.fromEntries(
    despliegues.map((d) => [
      `d${d.id}`,
      {
        campos: [
          { etiqueta: 'Ambiente', valor: d.ambiente },
          { etiqueta: 'Servidor', valor: d.servidor ?? '—' },
          { etiqueta: 'IP', valor: d.ip ?? '—' },
          { etiqueta: 'URL', valor: d.url ?? '—' },
          { etiqueta: 'Rama · tag', valor: d.tagRama ?? '—' },
          { etiqueta: 'Puerto', valor: d.puerto ?? '—' },
          { etiqueta: 'Estado', valor: d.estado },
        ],
        evidencia: d.evidencia,
        confianza: d.confianza,
      },
    ]),
  );

  return (
    <MapaClient
      arbol={arbol}
      detalleActivo={detalleActivo}
      detalleDespliegue={detalleDespliegue}
      sinClasificar={activos.filter((a) => a.nivelId === null).length}
      desplieguesHuerfanos={despliegues.filter((d) => d.activoId === null).length}
    />
  );
}
