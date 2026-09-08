// app/tecnologia/productos/page.tsx
//
// D14 · **el producto es sólo el agrupador.** Agrupa sistemas y agrupa activos; NO tiene
// ciclo de vida propio. MINTRACE se compone de varios desplegables con ciclo independiente,
// y preguntar «¿en qué fase está MINTRACE?» no tiene respuesta: la tienen sus sistemas,
// cada uno en la suya.
//
// **Dónde están las seis puertas.** El lienzo las dibuja acá, pero pertenecen al SISTEMA:
// REQ-SIG-08 las definió, y la hoja de vida completa —fases, puertas, requisitos, pruebas,
// componentes y liberaciones— vive en `/tecnologia/sistemas`. Esta pantalla lista los
// sistemas del producto con su fase y sus puertas, y lleva a la hoja de vida del que se
// elija. Redibujarla acá crearía el segundo lugar donde se define lo mismo.

import { prisma } from '@/lib/db';
import { faltantesDePlantilla, resumenDeFaltantes, type EsperadoDePlantilla } from '@/lib/sig/niveles';
import { resumirPuertas, type Puerta, type ResultadoPuerta } from '@/lib/sig/desarrollo';
import ProductosClient from './Productos.client';

export const dynamic = 'force-dynamic';

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;

  const [productos, niveles, activos, plantilla, personas, sistemas] = await Promise.all([
    prisma.producto.findMany({
      where: { activo: true },
      include: {
        nivel: { select: { id: true, nombre: true, clase: true } },
        responsable: { select: { nombre: true } },
      },
      orderBy: { nombre: 'asc' },
    }),
    prisma.nivelActivo.findMany({
      select: { id: true, grado: true, nombre: true, padreId: true, clase: true, activo: true },
    }),
    prisma.activo.findMany({
      where: { activo: true, nivelId: { not: null } },
      select: { id: true, nombre: true, nivelId: true },
    }),
    prisma.plantillaNivel.findMany({ orderBy: { orden: 'asc' } }),
    prisma.persona.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    // D14 · el producto agrupa sistemas. La hoja de vida es de cada uno, así que de acá
    // sólo sale lo que la lista necesita para que alguien elija cuál abrir.
    prisma.sistema.findMany({
      where: { activo: true, productoId: { not: null } },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        productoId: true,
        faseActual: true,
        cerradaEn: true,
        puertas: { select: { puerta: true, resultado: true } },
      },
      orderBy: { codigo: 'asc' },
    }),
  ]);

  const elegido = productos.find((x) => String(x.id) === p) ?? productos[0] ?? null;

  // Los nombres de activo bajo cada nivel 3 del producto elegido. Es lo que la plantilla
  // compara para decir qué falta.
  let porNivel3 = new Map<string, string[]>();
  let faltantes: ReturnType<typeof faltantesDePlantilla> = [];
  let cuantosActivos = 0;

  if (elegido !== null) {
    const nivel2 = niveles.filter((n) => n.padreId === elegido.nivelId && n.activo);
    const nivel3 = niveles.filter((n) => nivel2.some((n2) => n2.id === n.padreId) && n.activo);
    const idsDelProducto = new Set([
      elegido.nivelId,
      ...nivel2.map((n) => n.id),
      ...nivel3.map((n) => n.id),
    ]);
    cuantosActivos = activos.filter((a) => a.nivelId !== null && idsDelProducto.has(a.nivelId)).length;

    porNivel3 = new Map();
    for (const n3 of nivel3) {
      const nombres = activos.filter((a) => a.nivelId === n3.id).map((a) => a.nombre);
      const previos = porNivel3.get(n3.nombre) ?? [];
      porNivel3.set(n3.nombre, [...previos, ...nombres]);
    }

    const esperados: EsperadoDePlantilla[] = plantilla
      .filter((x) => x.claseNivel === elegido.nivel.clase)
      .map((x) => ({
        nombreNivel3: x.nombreNivel3,
        activoEsperado: x.activoEsperado,
        obligatorio: x.obligatorio,
      }));
    faltantes = faltantesDePlantilla(esperados, porNivel3);
  }

  const esperadosDeClase =
    elegido === null
      ? []
      : plantilla
          .filter((x) => x.claseNivel === elegido.nivel.clase)
          .map((x) => ({
            nombreNivel3: x.nombreNivel3,
            activoEsperado: x.activoEsperado,
            obligatorio: x.obligatorio,
          }));

  return (
    <ProductosClient
      productos={productos.map((x) => ({
        id: x.id,
        nombre: x.nombre,
        descripcion: x.descripcion,
        clase: x.nivel.clase,
        responsable: x.responsable.nombre,
        clienteRef: x.clienteRef,
        nivelId: x.nivelId,
      }))}
      elegidoId={elegido?.id ?? null}
      cuantosActivos={cuantosActivos}
      esperados={esperadosDeClase}
      presentes={Object.fromEntries(porNivel3)}
      faltantes={faltantes}
      resumen={resumenDeFaltantes(faltantes)}
      // Sólo los niveles de grado 1 de clase PRODUCTOS o PROYECTOS pueden encabezar un
      // producto, y sólo si no lo encabezan ya.
      sistemas={sistemas
        .filter((x) => elegido !== null && x.productoId === elegido.id)
        .map((x) => ({
          id: x.id,
          codigo: x.codigo,
          nombre: x.nombre,
          fase: x.faseActual,
          cerrada: x.cerradaEn !== null,
          puertas: resumirPuertas(
            x.puertas.map((p) => ({
              puerta: p.puerta as Puerta,
              resultado: p.resultado as ResultadoPuerta,
            })),
          ),
        }))}
      raicesDisponibles={niveles
        .filter(
          (n) =>
            n.grado === 1 &&
            n.activo &&
            (n.clase === 'PRODUCTOS' || n.clase === 'PROYECTOS') &&
            !productos.some((x) => x.nivelId === n.id),
        )
        .map((n) => ({ id: n.id, nombre: n.nombre, clase: n.clase }))}
      personas={personas}
    />
  );
}
