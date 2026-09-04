// app/tecnologia/sistemas/page.tsx
//
// La hoja de vida del sistema. FOR-TEC-04: registro único y acumulativo desde la concepción
// hasta el retiro.
//
// **G2 · un sistema sin hoja de vida abierta no debe desplegarse en productivo.** La
// aplicación lo señala; no lo impide (D17).
//
// Esta pantalla llena el hueco que `/tecnologia/productos` dejó declarado: las seis puertas
// viven acá, en el sistema, no en el producto que lo agrupa.

import { prisma } from '@/lib/db';
import {
  faltantesDeHojaDeVida,
  puedeCerrarHojaDeVida,
  resumirPuertas,
  veredictoDePrueba,
  type Severidad,
} from '@/lib/sig/desarrollo';
import SistemasClient from './Sistemas.client';

export const dynamic = 'force-dynamic';

export default async function SistemasPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; t?: string }>;
}) {
  const { s, t } = await searchParams;

  const [sistemas, personas, productos, activos, parametro] = await Promise.all([
    prisma.sistema.findMany({
      where: { activo: true },
      include: {
        puertas: { orderBy: { puerta: 'asc' }, include: { excepcion: { select: { codigo: true } }, verificadoPor: { select: { nombre: true } }, autoriza: { select: { nombre: true } } } },
        requisitos: { orderBy: { codigo: 'asc' } },
        pruebas: { orderBy: { fecha: 'desc' }, include: { ejecutor: { select: { nombre: true } } } },
        componentes: { orderBy: { nombre: 'asc' } },
        tratamientos: true,
        liberaciones: { orderBy: { fecha: 'desc' } },
        propietario: { select: { nombre: true } },
        responsableTecnico: { select: { nombre: true } },
        producto: { select: { nombre: true } },
        activoInventario: { select: { codigo: true, nombre: true } },
        excepciones: { where: { cerradaEn: null }, select: { codigo: true } },
      },
      orderBy: { codigo: 'asc' },
    }),
    prisma.persona.findMany({ where: { activa: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.producto.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.activo.findMany({ where: { activo: true }, select: { id: true, codigo: true, nombre: true }, orderBy: { codigo: 'asc' } }),
    prisma.parametro.findUnique({ where: { clave: 'desarrollo_severidad_bloquea' } }),
  ]);

  // G6 · el umbral sale del parámetro. Si alguien lo borró de la tabla se usa ALTOS, que es
  // el valor de carga: caer a «no bloquea nada» ante un parámetro faltante convertiría un
  // error de configuración en un permiso silencioso.
  const severidadBloquea = (parametro?.valor ?? 'ALTOS') as Severidad;

  const elegido = sistemas.find((x) => x.codigo === s) ?? sistemas[0] ?? null;

  return (
    <SistemasClient
      pestana={t ?? 'identidad'}
      elegidoCodigo={elegido?.codigo ?? null}
      severidadBloquea={severidadBloquea}
      lista={sistemas.map((x) => ({
        id: x.id,
        codigo: x.codigo,
        nombre: x.nombre,
        fase: x.faseActual,
        criticidad: x.criticidad,
        trataDatosPersonales: x.trataDatosPersonales,
        cerrada: x.cerradaEn !== null,
        puertas: resumirPuertas(x.puertas),
      }))}
      ficha={
        elegido === null
          ? null
          : {
              id: elegido.id,
              codigo: elegido.codigo,
              nombre: elegido.nombre,
              descripcion: elegido.descripcion,
              tipo: elegido.tipo,
              fase: elegido.faseActual,
              criticidad: elegido.criticidad,
              contratado: elegido.contratado,
              trataDatosPersonales: elegido.trataDatosPersonales,
              rolTratamiento: elegido.rolTratamiento,
              rtoObjetivo: elegido.rtoObjetivo,
              rpoObjetivo: elegido.rpoObjetivo,
              propietario: elegido.propietario?.nombre ?? null,
              responsableTecnico: elegido.responsableTecnico?.nombre ?? null,
              producto: elegido.producto?.nombre ?? null,
              clienteRef: elegido.clienteRef,
              activo:
                elegido.activoInventario === null
                  ? null
                  : `${elegido.activoInventario.codigo ?? ''} ${elegido.activoInventario.nombre}`.trim(),
              cerrada: elegido.cerradaEn !== null,
              abiertaEn: elegido.abiertaEn?.toISOString().slice(0, 10) ?? null,
              cerradaEn: elegido.cerradaEn?.toISOString().slice(0, 10) ?? null,
              excepcionesAbiertas: elegido.excepciones.map((x) => x.codigo),
              puertas: elegido.puertas.map((p) => ({
                puerta: p.puerta,
                resultado: p.resultado,
                fecha: p.fecha?.toISOString().slice(0, 10) ?? null,
                verificadoPor: p.verificadoPor?.nombre ?? null,
                autoriza: p.autoriza?.nombre ?? null,
                excepcion: p.excepcion?.codigo ?? null,
                observacion: p.observacion,
              })),
              requisitos: elegido.requisitos.map((r) => ({
                codigo: r.codigo,
                categoria: r.categoria,
                texto: r.texto,
                estado: r.estado,
                prioridad: r.prioridad,
              })),
              pruebas: elegido.pruebas.map((p) => ({
                codigo: p.codigo,
                tipo: p.tipo,
                fecha: p.fecha.toISOString().slice(0, 10),
                ejecutor: p.ejecutor?.nombre ?? p.ejecutorExterno,
                criticos: p.criticos,
                altos: p.altos,
                medios: p.medios,
                bajos: p.bajos,
                // El veredicto se CALCULA contra el parámetro y la excepción abierta; no se
                // guarda. Guardarlo quedaría viejo el día que la organización endurezca el
                // umbral, y la prueba seguiría diciendo «no bloquea» con el criterio anterior.
                veredicto: veredictoDePrueba(p, severidadBloquea, elegido.excepciones.length > 0),
              })),
              componentes: elegido.componentes.map((c) => ({
                nombre: c.nombre,
                tipo: c.tipo,
                version: c.version,
                licencia: c.licencia,
                criticidad: c.criticidad,
                vulnerabilidades: c.vulnerabilidadesConocidas,
                estado: c.estado,
              })),
              liberaciones: elegido.liberaciones.map((l) => ({
                version: l.version,
                fecha: l.fecha.toISOString().slice(0, 10),
                tipo: l.tipo,
                planReversion: l.planReversion,
                resultado: l.resultado,
              })),
              tratamientos: elegido.tratamientos.length,
              faltantes: faltantesDeHojaDeVida({
                trataDatosPersonales: elegido.trataDatosPersonales,
                tratamientos: elegido.tratamientos.length,
                requisitos: elegido.requisitos.length,
                pruebas: elegido.pruebas.length,
                componentes: elegido.componentes.length,
                rtoObjetivo: elegido.rtoObjetivo,
                rpoObjetivo: elegido.rpoObjetivo,
                criticidad: elegido.criticidad,
                activoId: elegido.activoId,
              }),
              vetoCierre: (() => {
                const v = puedeCerrarHojaDeVida(elegido.puertas);
                return v.puede ? null : v.motivo;
              })(),
            }
      }
      personas={personas}
      productos={productos}
      activos={activos.map((a) => ({ id: a.id, etiqueta: `${a.codigo ?? `#${a.id}`} · ${a.nombre}` }))}
    />
  );
}
