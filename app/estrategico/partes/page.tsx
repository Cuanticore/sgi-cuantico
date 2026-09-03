// app/estrategico/partes/page.tsx
//
// MAT-EST-02: la grilla agrupada por tipo con el mapa poder×interés y la ficha de
// cada necesidad con su seguimiento año por año.
//
// La pantalla era de sólo lectura. Tres acciones del servidor no tenían quien las llamara:
// `crearParteInteresada` y `agregarNecesidad` no se importaban en ninguna parte, y
// `guardarSeguimientoParte` se importaba en el cliente y no se invocaba nunca — la más
// engañosa de las tres, porque el import hacía parecer que estaba conectada.

import { prisma } from '@/lib/db';
import {
  estadoDeEvaluacion,
  proximaEvaluacion,
  resultadoVigente,
  type ResultadoEvaluacion,
} from '@/lib/sig/organizaciones';
import PartesClient from './Partes.client';

export const dynamic = 'force-dynamic';

export default async function PartesPage() {
  const [partes, personas] = await Promise.all([
    prisma.parteInteresada.findMany({
      where: { activa: true },
      orderBy: { descripcion: 'asc' },
      include: {
        necesidades: {
          include: {
            seguimiento: { orderBy: { anio: 'desc' } },
            responsable: { select: { id: true, nombre: true } },
          },
        },
        // D4 · «Organizaciones · las mismas del inventario de activos». El lienzo lo dibuja
        // asi a proposito: la organizacion es UNA fila, y la parte interesada la agrupa. El
        // conteo de activos es lo que POL-TEC-02 necesita para saber a cuantos afecta una
        // reevaluacion que sale mal.
        organizaciones: {
          where: { activo: true },
          orderBy: { nombre: 'asc' },
          include: {
            _count: { select: { activos: { where: { activo: true } } } },
            evaluaciones: { orderBy: [{ anio: 'desc' }] },
          },
        },
      },
    }),
    prisma.persona.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ]);

  const hoy = new Date();
  const filas = partes.map((p) => ({
    id: p.id,
    tipo: p.tipo,
    descripcion: p.descripcion,
    organizaciones: p.organizaciones.map((o) => {
      const evaluaciones = o.evaluaciones.map((x) => ({
        anio: x.anio,
        fecha: x.fecha,
        resultado: x.resultado as ResultadoEvaluacion,
      }));
      const proxima = proximaEvaluacion(evaluaciones);
      return {
        id: o.id,
        nombre: o.nombre,
        tipo: o.tipo,
        activos: o._count.activos,
        // Los tres se DERIVAN de las evaluaciones registradas. Una columna «estado» se
        // quedaria vieja el 1 de enero sin que nadie toque la organizacion.
        estado: estadoDeEvaluacion(evaluaciones, hoy),
        resultado: resultadoVigente(evaluaciones),
        proxima: proxima?.toISOString().slice(0, 10) ?? null,
      };
    }),
    necesidades: p.necesidades.map((n) => ({
      id: n.id,
      texto: n.texto,
      clase: n.clase,
      poder: n.poder,
      interes: n.interes,
      riesgoOportunidadTexto: n.riesgoOportunidadTexto ?? '',
      esRiesgo: n.esRiesgo,
      esOportunidad: n.esOportunidad,
      banderas: {
        sgsi: n.generaRequisitosSgsi,
        clima: n.requisitoCambioClimatico,
        alcance: n.requiereCambioAlcanceSig,
      },
      responsable: n.responsable?.nombre ?? null,
      seguimiento: n.seguimiento.map((s) => ({
        anio: s.anio,
        planAccion: s.planAccion ?? '',
        seguimiento: s.seguimiento ?? '',
        evidencia: s.evidencia ?? '',
      })),
    })),
  }));

  return <PartesClient filas={filas} personas={personas} anioActual={new Date().getUTCFullYear()} />;
}
