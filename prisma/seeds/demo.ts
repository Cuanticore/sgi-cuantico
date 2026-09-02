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

/// MAT-EST-02: partes interesadas con sus necesidades. Sin partes, la pantalla de
/// Partes muestra los cuatro cuadrantes en cero y no hay ficha que abrir — que es
/// exactamente por qué la comparación contra el lienzo daba 1 de 7.
///
/// El seguimiento anual NO se siembra completo a propósito: una necesidad con el plan
/// puesto y el seguimiento vacío es el caso que hay que poder recorrer, porque es el
/// estado real de una matriz a mitad de año.
async function partesInteresadas(personaIds: Map<string, number>): Promise<void> {
  const katherine = personaIds.get('katherine.quiroga@cuantico.com');
  const daniel = personaIds.get('daniel.medina@cuantico.com');
  const anio = new Date().getUTCFullYear();

  const definidas = [
    {
      tipo: 'EXTERNA' as const,
      descripcion: 'Clientes corporativos del sector financiero',
      necesidades: [
        {
          texto: 'Continuidad del servicio ante una interrupción del proveedor de nube',
          clase: 'NECESIDAD' as const,
          poder: 'ALTO',
          interes: 'ALTO',
          riesgoOportunidadTexto:
            'Riesgo: una caída prolongada activa las cláusulas de nivel de servicio del contrato.',
          esRiesgo: true,
          esOportunidad: false,
          generaRequisitosSgsi: true,
          requisitoCambioClimatico: false,
          requiereCambioAlcanceSig: false,
          responsableId: daniel,
          seguimiento: [
            {
              anio,
              planAccion: 'Documentar el plan de continuidad y probar la restauración en el segundo semestre.',
              seguimiento: '',
              evidencia: '',
            },
          ],
        },
        {
          texto: 'Certificación ISO 27001 vigente como requisito de contratación',
          clase: 'EXPECTATIVA' as const,
          poder: 'ALTO',
          interes: 'ALTO',
          riesgoOportunidadTexto:
            'Oportunidad: habilita licitaciones que hoy quedan fuera de alcance.',
          esRiesgo: false,
          esOportunidad: true,
          generaRequisitosSgsi: true,
          requisitoCambioClimatico: false,
          requiereCambioAlcanceSig: true,
          responsableId: katherine,
          seguimiento: [],
        },
      ],
    },
    {
      tipo: 'INTERNA' as const,
      descripcion: 'Equipo de desarrollo',
      necesidades: [
        {
          texto: 'Reglas claras de acceso a los ambientes productivos',
          clase: 'NECESIDAD' as const,
          poder: 'BAJO',
          interes: 'ALTO',
          riesgoOportunidadTexto:
            'Riesgo: sin reglas escritas, cada acceso se decide caso por caso y no queda rastro.',
          esRiesgo: true,
          esOportunidad: false,
          generaRequisitosSgsi: true,
          requisitoCambioClimatico: false,
          requiereCambioAlcanceSig: false,
          responsableId: daniel,
          seguimiento: [
            {
              anio: anio - 1,
              planAccion: 'Publicar el procedimiento de creación y administración de usuarios.',
              seguimiento: 'Publicado como PRO-TEC-01 en marzo.',
              evidencia: 'PRO-TEC-01 v1',
            },
          ],
        },
      ],
    },
    {
      tipo: 'EXTERNA' as const,
      descripcion: 'Entes reguladores y de vigilancia',
      necesidades: [
        {
          texto: 'Cumplimiento demostrable de la Ley 1581 sobre datos personales',
          clase: 'NECESIDAD' as const,
          poder: 'ALTO',
          interes: 'BAJO',
          riesgoOportunidadTexto: 'Riesgo: una sanción por tratamiento indebido de datos personales.',
          esRiesgo: true,
          esOportunidad: false,
          generaRequisitosSgsi: true,
          requisitoCambioClimatico: false,
          requiereCambioAlcanceSig: false,
          responsableId: katherine,
          seguimiento: [],
        },
        {
          texto: 'Reporte de huella de carbono de la operación',
          clase: 'EXPECTATIVA' as const,
          poder: 'BAJO',
          interes: 'BAJO',
          riesgoOportunidadTexto: 'Riesgo emergente: dos clientes ya lo piden en el pliego.',
          esRiesgo: true,
          esOportunidad: false,
          generaRequisitosSgsi: false,
          requisitoCambioClimatico: true,
          requiereCambioAlcanceSig: false,
          responsableId: katherine,
          seguimiento: [],
        },
      ],
    },
  ];

  let partes = 0;
  let necesidades = 0;
  for (const d of definidas) {
    let parte = await prisma.parteInteresada.findFirst({
      where: { descripcion: d.descripcion },
      select: { id: true },
    });
    if (!parte) {
      parte = await prisma.parteInteresada.create({
        data: { tipo: d.tipo, descripcion: d.descripcion },
        select: { id: true },
      });
      partes++;
    }
    for (const n of d.necesidades) {
      const { seguimiento, ...campos } = n;
      const ya = await prisma.necesidadExpectativa.findFirst({
        where: { parteId: parte.id, texto: n.texto },
        select: { id: true },
      });
      if (ya) continue;
      const creada = await prisma.necesidadExpectativa.create({
        data: { parteId: parte.id, ...campos },
        select: { id: true },
      });
      necesidades++;
      for (const s of seguimiento) {
        await prisma.seguimientoParteAnual.create({ data: { necesidadId: creada.id, ...s } });
      }
    }
  }
  console.log(`  partes            ${partes} nueva(s), ${necesidades} necesidad(es)`);
}

/// MAT-EST-01: la matriz de requisitos legales. Es la matriz que el hallazgo
/// HAL-2026-9001 dice que está sin diligenciar, así que se siembran pocas filas — y una
/// sin evaluar, que es el estado que la pantalla tiene que saber mostrar.
async function requisitosLegales(personaIds: Map<string, number>): Promise<void> {
  const katherine = personaIds.get('katherine.quiroga@cuantico.com');
  const daniel = personaIds.get('daniel.medina@cuantico.com');

  const definidos = [
    {
      consecutivo: 1,
      normatividad: 'Ley 1581 de 2012',
      articulo: 'Art. 4, 8, 17',
      expedidaPor: 'Congreso de la República',
      tipo: 'Ley',
      objeto: 'Protección de datos personales',
      aplicacion: 'Tratamiento de datos de clientes y empleados',
      sistemaGestion: 'SGSI',
      procesoEncargado: 'Gestión Legal y Compras',
      responsableId: katherine,
      enlace: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981',
      periodicidadRevision: 'ANUAL',
      evaluacion: { resultado: 'PARCIAL' as const, evidencia: 'Aviso de privacidad publicado; falta el registro de bases.' },
    },
    {
      consecutivo: 2,
      normatividad: 'Decreto 1377 de 2013',
      articulo: 'Art. 5, 10',
      expedidaPor: 'Presidencia de la República',
      tipo: 'Decreto',
      objeto: 'Reglamentación parcial de la Ley 1581',
      aplicacion: 'Autorización y aviso de privacidad',
      sistemaGestion: 'SGSI',
      procesoEncargado: 'Gestión Legal y Compras',
      responsableId: katherine,
      enlace: null,
      periodicidadRevision: 'ANUAL',
      evaluacion: { resultado: 'CUMPLE' as const, evidencia: 'Autorizaciones firmadas en el expediente de cada cliente.' },
    },
    {
      consecutivo: 3,
      normatividad: 'Ley 1273 de 2009',
      articulo: 'Art. 269A a 269J',
      expedidaPor: 'Congreso de la República',
      tipo: 'Ley',
      objeto: 'Delitos informáticos',
      aplicacion: 'Acceso abusivo a sistemas y protección de la información',
      sistemaGestion: 'SGSI',
      procesoEncargado: 'Gestión Tecnológica',
      responsableId: daniel,
      enlace: null,
      periodicidadRevision: 'ANUAL',
      // Sin evaluar a propósito: es el estado que la pantalla tiene que mostrar sin
      // inventarse un resultado.
      evaluacion: null,
    },
    {
      consecutivo: 4,
      normatividad: 'Resolución 2400 de 1979',
      articulo: 'Título III',
      expedidaPor: 'Ministerio de Trabajo',
      tipo: 'Resolución',
      objeto: 'Condiciones de seguridad e higiene en el trabajo',
      aplicacion: 'Puestos de trabajo remotos',
      sistemaGestion: 'SGC',
      procesoEncargado: 'Gestión Humana',
      responsableId: katherine,
      enlace: null,
      periodicidadRevision: 'BIANUAL',
      evaluacion: { resultado: 'NO_CUMPLE' as const, evidencia: 'No hay inspección documentada de puestos remotos.' },
    },
  ];

  let creados = 0;
  for (const d of definidos) {
    const { evaluacion, ...campos } = d;
    const ya = await prisma.requisitoLegal.findFirst({
      where: { normatividad: d.normatividad },
      select: { id: true },
    });
    if (ya) continue;
    const creado = await prisma.requisitoLegal.create({ data: campos, select: { id: true } });
    creados++;
    if (evaluacion && katherine) {
      await prisma.evaluacionCumplimiento.create({
        data: {
          requisitoId: creado.id,
          resultado: evaluacion.resultado,
          evidencia: evaluacion.evidencia,
          evaluadoPorId: d.responsableId ?? katherine,
        },
      });
    }
  }
  console.log(`  requisitos legales ${creados} nuevo(s) de ${definidos.length}`);
}

/// MAT-CAL-02: riesgos y oportunidades organizacionales, con sus controles.
///
/// Se siembra la ENTRADA del riesgo —clase, proceso, fuente, causa, efecto, y las escalas
/// de probabilidad e impacto que alguien declaró—, no el resultado. El nivel inherente, el
/// residual y el nivel del mapa se calculan al leer, y `nivelSugerido` queda en `null`
/// porque es lo que el método propone, no un dato de entrada.
async function riesgosOrganizacionales(personaIds: Map<string, number>): Promise<void> {
  const daniel = personaIds.get('daniel.medina@cuantico.com');
  const katherine = personaIds.get('katherine.quiroga@cuantico.com');

  const [factores, probabilidades, impactos, tipos, eficacias] = await Promise.all([
    prisma.factorRiesgo.findMany({ select: { id: true, nombre: true } }),
    prisma.escalaProbabilidad.findMany({ select: { id: true, valor: true } }),
    prisma.escalaImpactoRiesgo.findMany({ select: { id: true, valor: true } }),
    prisma.tipoControlRiesgo.findMany({ select: { id: true, nombre: true } }),
    prisma.eficaciaControl.findMany({ select: { id: true, nombre: true } }),
  ]);
  if (factores.length === 0 || probabilidades.length === 0 || impactos.length === 0) {
    console.log('  riesgos            omitidos: faltan los catálogos del método (MAN-CAL-01)');
    return;
  }

  const factor = (n: string) => factores.find((f) => f.nombre === n)?.id ?? factores[0].id;
  const prob = (v: number) =>
    probabilidades.find((p) => p.valor === v)?.id ?? probabilidades[0].id;
  const imp = (v: number) => impactos.find((i) => i.valor === v)?.id ?? impactos[0].id;

  const definidos = [
    {
      codigo: 'R1',
      clase: 'RIESGO' as const,
      proceso: 'Gestión Tecnológica',
      fuente: 'PROCESO' as const,
      descripcion: 'Pérdida de disponibilidad del servicio por falla del proveedor de nube',
      causa: 'Dependencia de un único proveedor sin plan de continuidad probado',
      efecto: 'Incumplimiento de los niveles de servicio contratados',
      factorId: factor('Tecnológico'),
      probabilidadId: prob(3),
      impactoId: imp(4),
      responsableId: daniel,
      controles: [
        { descripcion: 'Respaldo diario con retención de 30 días y prueba de restauración', tipo: 'Preventivo', eficacia: 'Alta' },
      ],
    },
    {
      codigo: 'R2',
      clase: 'RIESGO' as const,
      proceso: 'Gestión Legal y Compras',
      fuente: 'PARTE_INTERESADA' as const,
      descripcion: 'Sanción por tratamiento indebido de datos personales',
      causa: 'Registro de bases de datos incompleto ante la autoridad',
      efecto: 'Multa y daño reputacional frente a clientes del sector financiero',
      factorId: factor('Legal'),
      probabilidadId: prob(2),
      impactoId: imp(5),
      responsableId: katherine,
      controles: [
        { descripcion: 'Revisión anual de la matriz de requisitos legales', tipo: 'Detectivo', eficacia: 'Media' },
      ],
    },
    {
      codigo: 'R3',
      clase: 'RIESGO' as const,
      proceso: 'Gestión Tecnológica',
      fuente: 'PESTEL' as const,
      descripcion: 'Compromiso de credenciales por phishing dirigido',
      causa: 'Aumento del phishing al sector y ausencia de segundo factor en un sistema',
      efecto: 'Acceso no autorizado a información de clientes',
      factorId: factor('Externo'),
      probabilidadId: prob(4),
      impactoId: imp(4),
      responsableId: daniel,
      controles: [
        { descripcion: 'Segundo factor de autenticación en los sistemas expuestos', tipo: 'Preventivo', eficacia: 'Alta' },
        { descripcion: 'Capacitación anual en seguridad de la información', tipo: 'Preventivo', eficacia: 'Baja' },
      ],
    },
    {
      codigo: 'O1',
      clase: 'OPORTUNIDAD' as const,
      proceso: 'Gestión Comercial',
      fuente: 'DOFA' as const,
      descripcion: 'Acceso a licitaciones que exigen certificación ISO 27001',
      causa: 'La contratación pública incorporó requisitos de seguridad de la información',
      efecto: 'Ampliación del mercado atendible',
      factorId: factor('Reputacional'),
      probabilidadId: prob(3),
      impactoId: imp(3),
      responsableId: katherine,
      controles: [],
    },
  ];

  let creados = 0;
  for (const d of definidos) {
    const { controles, ...campos } = d;
    const ya = await prisma.riesgoOrganizacional.findUnique({
      where: { codigo: d.codigo },
      select: { id: true },
    });
    if (ya) continue;
    const creado = await prisma.riesgoOrganizacional.create({
      data: campos,
      select: { id: true },
    });
    creados++;
    for (const c of controles) {
      const tipoId = tipos.find((t) => t.nombre === c.tipo)?.id ?? tipos[0]?.id;
      const eficaciaId = eficacias.find((e) => e.nombre === c.eficacia)?.id ?? eficacias[0]?.id;
      if (!tipoId || !eficaciaId) continue;
      await prisma.controlRiesgoOrg.create({
        data: { riesgoId: creado.id, descripcion: c.descripcion, tipoId, eficaciaId },
      });
    }
  }
  console.log(`  riesgos org.       ${creados} nuevo(s) de ${definidos.length}`);
}

/// FOR-CAL-04: el programa del año con sus procesos programados, y los perfiles de auditor
/// aprobados que habilitan a crear auditorías (C3).
///
/// Se siembra la ENTRADA: el programa, qué procesos van en qué mes, y quién tiene perfil.
/// Las auditorías NO se siembran: se crean desde la matriz, que es el camino legítimo, y
/// el estado de cada fila sale de si su auditoría existe y tiene informe emitido.
async function programaAuditoria(personaIds: Map<string, number>): Promise<void> {
  const laura = personaIds.get('laura.agudelo@cuantico.com');
  const daniel = personaIds.get('daniel.medina@cuantico.com');
  const katherine = personaIds.get('katherine.quiroga@cuantico.com');
  if (!laura || !daniel || !katherine) {
    console.log('  programa           omitido: faltan personas del censo');
    return;
  }
  const anio = new Date().getUTCFullYear();

  const programa = await prisma.programaAuditoria.upsert({
    where: { anio },
    update: {},
    create: {
      anio,
      alcance:
        'Prestación de servicios de asesoramiento y construcción de productos digitales para la industria GovTech',
      objetivo:
        'Evidenciar la conformidad con los requisitos de la norma ISO 9001:2015 y con la documentación de la organización',
      criterios: 'Norma ISO 9001:2015 y documentación del SIG',
      metodos: 'Visitas en sitio o remotas, entrevistas a responsables y revisión documental',
      aprobadoPorId: laura,
      fechaAprobacion: new Date(Date.UTC(anio, 1, 10)),
    },
    select: { id: true },
  });

  const programadas = [
    { procesoRef: 'Gestión de Calidad', meses: '2', responsableId: laura },
    { procesoRef: 'Gestión Tecnológica', meses: '2,8', responsableId: daniel },
    { procesoRef: 'Gestión Legal y Compras', meses: '3', responsableId: katherine },
    { procesoRef: 'Gestión Financiera', meses: '9', responsableId: daniel },
  ];

  let nuevas = 0;
  for (const p of programadas) {
    const ya = await prisma.auditoriaProgramada.findFirst({
      where: { programaId: programa.id, procesoRef: p.procesoRef },
      select: { id: true },
    });
    if (ya) continue;
    await prisma.auditoriaProgramada.create({
      data: { programaId: programa.id, ...p, plazoInformeDias: 4 },
    });
    nuevas++;
  }

  // Sin un perfil aprobado, `crearAuditoria` rechaza: es el primer eslabón de C3 y sin él
  // la matriz no deja crear nada.
  const perfiles = [
    {
      personaId: laura,
      formacion: 'Ingeniería industrial',
      certificacion: 'Auditor interno ISO 9001:2015',
      entidadCertificadora: 'ICONTEC',
      vigencia: new Date(Date.UTC(anio + 2, 5, 30)),
      experienciaAnios: 6,
    },
    {
      personaId: daniel,
      formacion: 'Ingeniería de sistemas',
      certificacion: 'Auditor interno ISO 27001:2022',
      entidadCertificadora: 'ICONTEC',
      vigencia: new Date(Date.UTC(anio + 1, 10, 15)),
      experienciaAnios: 4,
    },
  ];

  let perfilesNuevos = 0;
  for (const p of perfiles) {
    const ya = await prisma.perfilAuditor.findFirst({
      where: { personaId: p.personaId, certificacion: p.certificacion },
      select: { id: true },
    });
    if (ya) continue;
    await prisma.perfilAuditor.create({
      data: { ...p, aprobadoPorId: laura, aprobadoEn: new Date(Date.UTC(anio, 0, 20)) },
    });
    perfilesNuevos++;
  }

  console.log(
    `  programa ${anio}      ${nuevas} proceso(s) programado(s), ${perfilesNuevos} perfil(es)`,
  );
}

async function main(): Promise<void> {
  console.log(`\nDatos de prueba · base local «${new URL(url!).pathname.slice(1)}»\n`);

  const personaIds = await personas();
  const contenidoIds = await contenidos();
  await obligaciones(contenidoIds, personaIds);
  await hallazgos(personaIds);
  await contexto(personaIds);
  await partesInteresadas(personaIds);
  await requisitosLegales(personaIds);
  await riesgosOrganizacionales(personaIds);
  await programaAuditoria(personaIds);

  console.log('\nListo. Lo que NO se sembró, a propósito:');
  console.log('  · asignaciones y registros de realizado — se generan con generarAsignaciones()');
  console.log('  · riesgos del SGSI y cifras derivadas   — se calculan al leer');
  console.log('  · niveles inherente, residual y del mapa — se calculan al leer');
  console.log('  · auditorias — se crean desde la matriz del programa');
  console.log('\nSiguiente paso: entrar a Operación y correr la generación de asignaciones.\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
