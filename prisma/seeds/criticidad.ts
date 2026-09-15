// prisma/seeds/criticidad.ts
//
// REQ-SIG-20 §11 (P9, D-3) · los cinco niveles de `CriticidadNegocio`, declarados por el
// negocio y nunca derivados del residual. Idempotente por `upsert` sobre `codigo`, como el
// resto de `prisma/seeds/`.
//
// C5 siembra `rtoMinutos`/`rpoMinutos` en `null` A PROPÓSITO. «Sin compromiso» es un valor
// declarado — el activo no tiene SLA — y no la ausencia de uno; sembrarlo con un centinela
// grande (999999) ordenaría a los activos sin acuerdo de nivel de servicio como si fueran
// los MÁS tolerantes del inventario, que es exactamente lo contrario de lo que significa.

import type { PrismaClient } from '@prisma/client';

interface NivelCriticidad {
  codigo: string;
  nombre: string;
  rtoMinutos: number | null;
  rpoMinutos: number | null;
  descripcion: string;
  orden: number;
}

const NIVELES: readonly NivelCriticidad[] = [
  {
    codigo: 'C1',
    nombre: 'Crítica continua',
    rtoMinutos: 10,
    rpoMinutos: 5,
    descripcion: 'Multi-región activo-activo, o conmutación automática probada. Réplica síncrona o casi.',
    orden: 1,
  },
  {
    codigo: 'C2',
    nombre: 'Crítica',
    rtoMinutos: 240,
    rpoMinutos: 60,
    descripcion: 'Segunda región en espera tibia, con conmutación probada y documentada.',
    orden: 2,
  },
  {
    codigo: 'C3',
    nombre: 'Importante',
    rtoMinutos: 1440,
    rpoMinutos: 480,
    descripcion: 'Respaldo restaurable con prueba de restauración periódica.',
    orden: 3,
  },
  {
    codigo: 'C4',
    nombre: 'Estándar',
    rtoMinutos: 4320,
    rpoMinutos: 1440,
    descripcion: 'Respaldo diario, restauración bajo demanda.',
    orden: 4,
  },
  {
    codigo: 'C5',
    nombre: 'Sin compromiso',
    rtoMinutos: null,
    rpoMinutos: null,
    descripcion: 'Esfuerzo razonable. Es un valor, no la ausencia de uno.',
    orden: 5,
  },
];

export async function seedCriticidad(prisma: PrismaClient): Promise<number> {
  for (const n of NIVELES) {
    const datos = {
      nombre: n.nombre,
      rtoMinutos: n.rtoMinutos,
      rpoMinutos: n.rpoMinutos,
      descripcion: n.descripcion,
      orden: n.orden,
    };
    await prisma.criticidadNegocio.upsert({
      where: { codigo: n.codigo },
      update: datos,
      create: { codigo: n.codigo, ...datos },
    });
  }
  return NIVELES.length;
}
