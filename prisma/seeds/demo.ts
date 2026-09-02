// prisma/seeds/demo.ts
//
// Datos de prueba para recorrer los flujos del SIG en LOCAL. Nada de esto va a producción.
//
// Existe porque un flujo no se puede verificar sin datos: «clasificar hallazgo → causa raíz
// → acción → verificación → cierre» son cinco pantallas encadenadas, y con cero hallazgos
// se puede comprobar que el botón existe, no que el flujo funcione.
//
// TRES REGLAS QUE ESTE SCRIPT NO ROMPE
//
//   1. No corre fuera de localhost. La guarda está abajo y es lo primero que se ejecuta.
//   2. Es aditivo e idempotente: sólo `upsert` por clave natural. Ni un `DELETE`, ni un
//      `TRUNCATE`. Correrlo dos veces no duplica nada, y respeta lo que ya haya —los 234
//      activos del seed real, los 13 importados a mano, el hallazgo que se reportó.
//   3. NO siembra lo que el sistema genera: asignaciones, registros de realizado, envíos de
//      notificación ni cifras derivadas. Las asignaciones se producen corriendo
//      `generarAsignaciones()`, que es el camino legítimo; sembrarlas es exactamente lo que
//      el paquete de trabajo prohíbe, porque deja el sistema arrancando con datos que nadie
//      produjo.
//
// Correr con:  npx tsx --env-file=.env prisma/seeds/demo.ts

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

// ── La guarda ────────────────────────────────────────────────────────────────
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL no está definida.');
  process.exit(1);
}
const host = new URL(url).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error(
    `\n  NEGADO. Este script sólo corre contra localhost, y DATABASE_URL apunta a «${host}».\n` +
      '  Son datos de prueba: en una base compartida contaminarían el inventario real y\n' +
      '  nadie sabría después qué fila es de verdad.\n',
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

/// Las nueve personas del grupo `Líderes SIG`. El `oid` es sintético y marcado como tal:
/// el real lo trae Azure al iniciar sesión, y no hay que confundirlos.
const PERSONAS: { correo: string; nombre: string; area: string }[] = [
  { correo: 'albeiro.medina@cuantico.com', nombre: 'Albeiro Medina', area: 'Talento Humano' },
  { correo: 'daniel.medina@cuantico.com', nombre: 'Daniel Medina', area: 'Gestión Estratégica' },
  { correo: 'diego.munoz@cuantico.com', nombre: 'Diego Muñoz', area: 'Gestión Tecnológica' },
  { correo: 'jhon.tamayo@cuantico.com', nombre: 'Jhon Tamayo', area: 'Gestión Tecnológica' },
  { correo: 'katherine.quiroga@cuantico.com', nombre: 'Katherine Quiroga', area: 'Sistema Integrado de Gestión' },
  { correo: 'laura.agudelo@cuantico.com', nombre: 'Laura Agudelo', area: 'Gestión de Proyectos' },
  { correo: 'lina.medina@cuantico.com', nombre: 'Lina Medina', area: 'Gestión Comercial' },
  { correo: 'michael.medina@cuantico.com', nombre: 'Michael Medina', area: 'Gestión Tecnológica' },
  { correo: 'yuliet.rojas@cuantico.com', nombre: 'Yuliet Rojas', area: 'Soporte y Servicio al Cliente' },
];

async function personas(): Promise<Map<string, number>> {
  const areas = await prisma.area.findMany({ select: { id: true, nombre: true } });
  const porNombre = new Map(areas.map((a) => [a.nombre, a.id]));
  const ids = new Map<string, number>();

  for (const p of PERSONAS) {
    const fila = await prisma.persona.upsert({
      where: { correo: p.correo },
      // El `oid` real lo pone Azure al iniciar sesión; si la fila ya existe no se toca.
      update: { nombre: p.nombre, areaId: porNombre.get(p.area) ?? null, activa: true },
      create: {
        oid: `demo-${p.correo.split('@')[0]}`,
        correo: p.correo,
        nombre: p.nombre,
        areaId: porNombre.get(p.area) ?? null,
        activa: true,
      },
      select: { id: true },
    });
    ids.set(p.correo, fila.id);
  }
  console.log(`  personas          ${ids.size}`);
  return ids;
}

/// Contenidos de los cuatro tipos, para que el panel de cierre de Mi SIG se pueda recorrer
/// entero: la lectura pide versión, la verificación pide sus ítems, la capacitación pide
/// nota, y la tarea sólo la nota.
async function contenidos(): Promise<Map<string, number>> {
  const definidos = [
    {
      codigo: 'CAP-001',
      tipo: 'CAPACITACION' as const,
      titulo: 'Inducción y reinducción del SGC',
      descripcion: 'Qué es el SIG, para qué existe y qué se espera de cada persona.',
      procedimientoOrigen: 'MAN-CAL-01 Manual del SIG',
      duracionHoras: 2,
      modalidad: 'Virtual',
      exigeEvaluacion: true,
      notaMinima: 3.5,
    },
    {
      codigo: 'CAP-004',
      tipo: 'CAPACITACION' as const,
      titulo: 'Phishing e ingeniería social',
      descripcion: 'Reconocer un correo fraudulento y qué hacer al recibirlo.',
      procedimientoOrigen: 'POL-SIG-02 Política de seguridad de la información',
      duracionHoras: 1,
      modalidad: 'Virtual',
      exigeEvaluacion: true,
      notaMinima: 4,
    },
    {
      codigo: 'LEC-001',
      tipo: 'LECTURA' as const,
      titulo: 'Política de seguridad de la información',
      descripcion: 'Lectura obligatoria con acuse de la versión vigente.',
      procedimientoOrigen: 'POL-SIG-02',
      documentoCodigo: 'POL-SIG-02',
      documentoNombre: 'Política de seguridad de la información',
      documentoVersion: '3',
      documentoUrl: 'https://cuantico.sharepoint.com/sig/POL-SIG-02',
    },
    {
      codigo: 'LVE-001',
      tipo: 'VERIFICACION' as const,
      titulo: 'Verificación mensual del puesto de trabajo',
      descripcion: 'Lista de chequeo del escritorio limpio y del bloqueo de sesión.',
      procedimientoOrigen: 'PTR-TEC-01',
      items: [
        { texto: 'La sesión queda bloqueada al ausentarse', obligatorio: true, permiteNoAplica: false },
        { texto: 'No hay documentos clasificados sobre el escritorio', obligatorio: true, permiteNoAplica: false },
        { texto: 'Los respaldos locales están cifrados', obligatorio: true, permiteNoAplica: true },
        { texto: 'El equipo tiene el antivirus actualizado', obligatorio: false, permiteNoAplica: true },
      ],
    },
    {
      codigo: 'TAR-001',
      tipo: 'TAREA' as const,
      titulo: 'Revisión trimestral de accesos del proceso',
      descripcion: 'Confirmar que sólo el personal vigente conserva acceso a los sistemas del proceso.',
      procedimientoOrigen: 'PRO-TEC-01',
    },
  ];

  const ids = new Map<string, number>();
  for (const c of definidos) {
    const { items, ...datos } = c as typeof c & { items?: { texto: string; obligatorio: boolean; permiteNoAplica: boolean }[] };
    const fila = await prisma.contenidoSig.upsert({
      where: { codigo: c.codigo },
      update: {},
      create: datos,
      select: { id: true },
    });
    ids.set(c.codigo, fila.id);

    if (items) {
      const existentes = await prisma.itemVerificacion.count({ where: { contenidoId: fila.id } });
      if (existentes === 0) {
        await prisma.itemVerificacion.createMany({
          data: items.map((i, n) => ({ ...i, contenidoId: fila.id, orden: n + 1 })),
        });
      }
    }
  }
  console.log(`  contenidos        ${ids.size}`);
  return ids;
}

/// Una obligación por alcance y por periodicidad distinta, para que la pantalla de
/// Obligaciones muestre los cuatro casos y la generación tenga qué resolver.
async function obligaciones(
  contenidoIds: Map<string, number>,
  personaIds: Map<string, number>,
): Promise<number> {
  const areas = await prisma.area.findMany({ select: { id: true, nombre: true } });
  const areaTec = areas.find((a) => a.nombre === 'Gestión Tecnológica')?.id;
  const cargo = await prisma.cargoResponsable.findFirst({ where: { activo: true }, select: { id: true } });
  const lider = personaIds.get('katherine.quiroga@cuantico.com')!;
  const tec = personaIds.get('diego.munoz@cuantico.com')!;

  // La fecha de inicio NO es retroactiva (regla C5 de la carga): arrancar en el periodo
  // vigente evita estrenar el sistema con deuda que nadie contrajo.
  const inicio = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const definidas = [
    { contenido: 'CAP-001', alcance: 'TODOS' as const, periodicidad: 'ANUAL' as const, plazoDias: 30, diasAviso: 7, responsableSeguimientoId: lider },
    { contenido: 'CAP-004', alcance: 'TODOS' as const, periodicidad: 'SEMESTRAL' as const, plazoDias: 21, diasAviso: 5, responsableSeguimientoId: lider },
    { contenido: 'LEC-001', alcance: 'TODOS' as const, periodicidad: 'ANUAL' as const, plazoDias: 15, diasAviso: 5, responsableSeguimientoId: lider },
    { contenido: 'LVE-001', alcance: 'AREA' as const, alcanceAreaId: areaTec, periodicidad: 'MENSUAL' as const, plazoDias: 10, diasAviso: 3, responsableSeguimientoId: tec },
    { contenido: 'TAR-001', alcance: 'CARGO' as const, alcanceCargoId: cargo?.id, periodicidad: 'TRIMESTRAL' as const, plazoDias: 20, diasAviso: 7, responsableSeguimientoId: tec },
  ];

  let creadas = 0;
  for (const o of definidas) {
    const contenidoId = contenidoIds.get(o.contenido)!;
    const ya = await prisma.obligacion.findFirst({ where: { contenidoId }, select: { id: true } });
    if (ya) continue;
    const { contenido, ...datos } = o;
    void contenido;
    await prisma.obligacion.create({ data: { ...datos, contenidoId, fechaInicio: inicio } });
    creadas++;
  }
  console.log(`  obligaciones      ${creadas} nueva(s) de ${definidas.length}`);
  return creadas;
}

/// Un hallazgo por tipo, en distintos puntos del flujo, para que la grilla muestre los
/// cuatro semáforos y la ficha se pueda recorrer con cada exigencia.
async function hallazgos(personaIds: Map<string, number>): Promise<number> {
  const areas = await prisma.area.findMany({ select: { id: true, nombre: true } });
  const area = (n: string) => areas.find((a) => a.nombre === n)?.id ?? areas[0].id;
  const detecta = personaIds.get('katherine.quiroga@cuantico.com')!;
  const responsable = personaIds.get('diego.munoz@cuantico.com')!;
  const anio = new Date().getUTCFullYear();

  const definidos = [
    {
      codigo: `HAL-${anio}-9001`,
      tipo: 'NC_MAYOR' as const,
      origen: 'AUDITORIA_INTERNA' as const,
      origenReferencia: 'Auditoría interna ISO 9001 · febrero',
      descripcion: 'No hay evidencia de la revisión anual de accesos en tres de los nueve procesos.',
      requisitoIncumplido: 'ISO/IEC 27001:2022 · 5.18 Derechos de acceso',
      evidenciaObjetiva: 'Actas de revisión ausentes para COM, FIN y LEG en el periodo 2026.',
      area: 'Gestión Tecnológica',
      clasificado: true,
    },
    {
      codigo: `HAL-${anio}-9002`,
      tipo: 'NC_MENOR' as const,
      origen: 'QUEJA' as const,
      origenReferencia: 'Queja de cliente · radicado 2026-0431',
      descripcion: 'El acta de cierre del proyecto se entregó nueve días después del plazo pactado.',
      requisitoIncumplido: 'ISO 9001:2015 · 8.5.1 Control de la producción',
      evidenciaObjetiva: 'Radicado del cliente y fecha de entrega registrada en el repositorio.',
      area: 'Gestión de Proyectos',
      clasificado: true,
    },
    {
      codigo: `HAL-${anio}-9003`,
      tipo: 'OBSERVACION' as const,
      origen: 'REVISION_DIRECCION' as const,
      origenReferencia: 'Revisión por la dirección · primer semestre',
      descripcion: 'El tablero de indicadores no distingue lo planeado de lo ejecutado.',
      requisitoIncumplido: 'ISO 9001:2015 · 9.1.1 Seguimiento y medición',
      evidenciaObjetiva: 'FOR-CAL-11 sin diligenciar en el periodo.',
      area: 'Sistema Integrado de Gestión',
      clasificado: false,
    },
    {
      codigo: `HAL-${anio}-9004`,
      tipo: 'OPORTUNIDAD' as const,
      origen: 'OTRO' as const,
      origenReferencia: 'Propuesta interna del equipo de soporte',
      descripcion: 'Automatizar el recordatorio de la verificación mensual del puesto de trabajo.',
      requisitoIncumplido: '—',
      evidenciaObjetiva: 'Tres periodos con cumplimiento por debajo del 70 %.',
      area: 'Soporte y Servicio al Cliente',
      clasificado: false,
    },
  ];

  let creados = 0;
  for (const h of definidos) {
    const { area: nombreArea, clasificado, ...datos } = h;
    const ya = await prisma.hallazgo.findUnique({ where: { codigo: h.codigo }, select: { id: true } });
    if (ya) continue;
    await prisma.hallazgo.create({
      data: {
        ...datos,
        areaId: area(nombreArea),
        detectadoPorId: detecta,
        fechaDeteccion: new Date(Date.UTC(anio, 1, 20)),
        ...(clasificado
          ? {
              clasificadoPorId: detecta,
              fechaClasificacion: new Date(Date.UTC(anio, 1, 24)),
              responsableId: responsable,
              fechaCompromiso: new Date(Date.UTC(anio, 2, 25)),
            }
          : {}),
      },
    });
    creados++;
  }
  console.log(`  hallazgos         ${creados} nuevo(s) de ${definidos.length}`);
  return creados;
}

/// DOFA y PESTEL con entradas en cada casilla. Sin un análisis vigente esas dos pantallas
/// no tienen a qué colgar nada.
async function contexto(personaIds: Map<string, number>): Promise<void> {
  const aprueba = personaIds.get('daniel.medina@cuantico.com')!;
  const anio = new Date().getUTCFullYear();

  const analisis = [
    {
      tipo: 'DOFA' as const,
      acta: `ACT-EST-${anio}-02`,
      entradas: [
        { casilla: 'FORTALEZA', texto: 'Equipo técnico certificado en la norma', efecto: 'FAVORABLE' as const },
        { casilla: 'FORTALEZA', texto: 'Operación 100 % remota ya consolidada', efecto: 'FAVORABLE' as const },
        { casilla: 'OPORTUNIDAD', texto: 'Contratación pública exige certificación ISO 27001', efecto: 'FAVORABLE' as const },
        { casilla: 'DEBILIDAD', texto: 'La matriz de requisitos legales está sin diligenciar', efecto: 'ADVERSO' as const },
        { casilla: 'DEBILIDAD', texto: 'Dos áreas sin prefijo de proceso ratificado', efecto: 'ADVERSO' as const },
        { casilla: 'AMENAZA', texto: 'Aumento del phishing dirigido al sector', efecto: 'ADVERSO' as const },
      ],
    },
    {
      tipo: 'PESTEL' as const,
      acta: `ACT-EST-${anio}-03`,
      entradas: [
        { casilla: 'POLITICO', texto: 'Política de compras públicas con requisitos de seguridad', efecto: 'FAVORABLE' as const },
        { casilla: 'ECONOMICO', texto: 'Presión sobre las tarifas en licitaciones', efecto: 'ADVERSO' as const },
        { casilla: 'SOCIAL', texto: 'Expectativa de trabajo remoto sostenida', efecto: 'FAVORABLE' as const },
        { casilla: 'TECNOLOGICO', texto: 'Adopción de IA en la operación de los clientes', efecto: 'FAVORABLE' as const },
        { casilla: 'ECOLOGICO', texto: 'Reporte de huella de carbono exigido por dos clientes', efecto: 'ADVERSO' as const },
        { casilla: 'LEGAL', texto: 'Ley 1581 y su reglamentación sobre datos personales', efecto: 'ADVERSO' as const },
      ],
    },
  ];

  for (const a of analisis) {
    let fila = await prisma.analisisContexto.findFirst({
      where: { tipo: a.tipo, anio },
      select: { id: true },
    });
    if (!fila) {
      fila = await prisma.analisisContexto.create({
        data: {
          tipo: a.tipo,
          anio,
          aprobadoPorId: aprueba,
          fechaAprobacion: new Date(Date.UTC(anio, 0, 15)),
          actaReferencia: a.acta,
          vigente: true,
        },
        select: { id: true },
      });
    }
    const ya = await prisma.entradaContexto.count({ where: { analisisId: fila.id } });
    if (ya === 0) {
      await prisma.entradaContexto.createMany({
        data: a.entradas.map((e, n) => ({ ...e, analisisId: fila!.id, orden: n + 1 })),
      });
    }
    console.log(`  ${a.tipo.padEnd(17)} ${a.entradas.length} entradas`);
  }
}

async function main(): Promise<void> {
  console.log(`\nDatos de prueba · base local «${new URL(url!).pathname.slice(1)}»\n`);

  const personaIds = await personas();
  const contenidoIds = await contenidos();
  await obligaciones(contenidoIds, personaIds);
  await hallazgos(personaIds);
  await contexto(personaIds);

  console.log('\nListo. Lo que NO se sembró, a propósito:');
  console.log('  · asignaciones y registros de realizado — se generan con generarAsignaciones()');
  console.log('  · riesgos del SGSI y cifras derivadas   — se calculan al leer');
  console.log('\nSiguiente paso: entrar a Operación y correr la generación de asignaciones.\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
