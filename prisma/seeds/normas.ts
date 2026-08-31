// prisma/seeds/normas.ts
//
// Catálogo de numerales (decisión 3.1.1: catálogo, no constante). ISO 9001:2015 con
// sus numerales auditables; ISO/IEC 27001:2022 con los 13 numerales de gestión (los
// 93 controles del Anexo A ya viven en la base del SGSI). Idempotente.
// npx tsx --env-file=.env prisma/seeds/normas.ts

import { prisma } from '@/lib/db';

const ISO_9001: [string, string, boolean][] = [
  ['4.1', 'Comprensión de la organización y su contexto', true],
  ['4.2', 'Comprensión de las necesidades y expectativas de las partes interesadas', true],
  ['4.3', 'Determinación del alcance del sistema de gestión', true],
  ['4.4', 'Sistema de gestión de la calidad y sus procesos', true],
  ['5.1', 'Liderazgo y compromiso', true],
  ['5.2', 'Política', true],
  ['5.3', 'Roles, responsabilidades y autoridades', true],
  ['6.1', 'Acciones para abordar riesgos y oportunidades', true],
  ['6.2', 'Objetivos de la calidad y planificación para lograrlos', true],
  ['6.3', 'Planificación de los cambios', true],
  ['7.1', 'Recursos', true],
  ['7.1.5', 'Recursos de seguimiento y medición', false],
  ['7.2', 'Competencia', true],
  ['7.3', 'Toma de conciencia', true],
  ['7.4', 'Comunicación', true],
  ['7.5', 'Información documentada', true],
  ['8.1', 'Planificación y control operacional', true],
  ['8.2', 'Requisitos para los productos y servicios', true],
  ['8.3', 'Diseño y desarrollo', true],
  ['8.4', 'Control de los procesos, productos y servicios suministrados externamente', true],
  ['8.5', 'Producción y provisión del servicio', true],
  ['8.5.3', 'Propiedad perteneciente a clientes o proveedores externos', false],
  ['8.5.5', 'Actividades posteriores a la entrega', false],
  ['8.6', 'Liberación de los productos y servicios', true],
  ['8.7', 'Control de salidas no conformes', true],
  ['9.1', 'Seguimiento, medición, análisis y evaluación', true],
  ['9.2', 'Auditoría interna', true],
  ['9.3', 'Revisión por la dirección', true],
  ['10.1', 'Generalidades', true],
  ['10.2', 'No conformidad y acción correctiva', true],
  ['10.3', 'Mejora continua', true],
];

const ISO_27001_GESTION: [string, string, boolean][] = [
  ['4.1', 'Contexto de la organización', true],
  ['4.2', 'Partes interesadas', true],
  ['4.3', 'Alcance del sistema de gestión de seguridad de la información', true],
  ['4.4', 'Sistema de gestión de seguridad de la información', true],
  ['5.1', 'Liderazgo y compromiso', true],
  ['5.2', 'Política', true],
  ['5.3', 'Roles, responsabilidades y autoridades', true],
  ['6.1', 'Planificación', true],
  ['6.2', 'Objetivos y planificación para lograrlos', true],
  ['6.3', 'Planificación de los cambios', true],
  ['7.1', 'Recursos', true],
  ['7.2', 'Competencia', true],
  ['7.3', 'Toma de conciencia', true],
  ['7.4', 'Comunicación', true],
  ['7.5', 'Información documentada', true],
  ['8.1', 'Planificación y control operacional', true],
  ['8.2', 'Valoración de los riesgos de seguridad de la información', true],
  ['8.3', 'Tratamiento de los riesgos de seguridad de la información', true],
  ['9.1', 'Seguimiento, medición, análisis y evaluación', true],
  ['9.2', 'Auditoría interna', true],
  ['9.3', 'Revisión por la dirección', true],
  ['10.1', 'Mejora continua', true],
  ['10.2', 'No conformidad y acción correctiva', true],
];

async function main() {
  const normas: [string, string, string, [string, string, boolean][]][] = [
    ['ISO 9001:2015', 'Sistemas de gestión de la calidad — Requisitos', '2015', ISO_9001],
    ['ISO/IEC 27001:2022', 'Seguridad de la información — Requisitos', '2022', ISO_27001_GESTION],
  ];

  for (const [codigo, nombre, version, requisitos] of normas) {
    const norma = await prisma.normaAuditable.upsert({
      where: { codigo },
      update: { nombre, version },
      create: { codigo, nombre, version },
    });
    for (const [numeral, titulo, auditable] of requisitos) {
      await prisma.requisitoNorma.upsert({
        where: { normaId_numeral: { normaId: norma.id, numeral } },
        update: { titulo, auditable },
        create: { normaId: norma.id, numeral, titulo, orden: 0, auditable },
      });
    }
  }
  console.log('Catálogo de normas listo.');
}

main().finally(() => prisma.$disconnect());