// prisma/seeds/licencias.ts
//
// **Los nombres comerciales de los SKU de Microsoft 365** (REQ-SIG-15 P6).
//
// Ni `SPE_E3` ni `ENTERPRISEPACK` le dicen nada a quien abre el popup de una persona. El nombre
// legible entra como dato parametrizable —no como un `Record<string, string>` en el fuente—
// porque un mapa en el código obliga a desplegar el día que la organización compre un producto
// nuevo, y hasta ese día la pantalla muestra el código crudo igual.
//
// **Lo que se siembra acá son los SKU de uso general de Microsoft 365, no los de Cuántico.**
// Cuáles tiene la organización lo dice `GET /subscribedSkus` contra el tenant, y esta semilla
// corre sin tenant. Inventar SKU «de Cuántico» habría puesto en la tabla de parámetros nombres
// de productos que quizá nadie compró; lo que sí es cierto y estable es el catálogo público de
// Microsoft, del que se toman los códigos de uso más extendido.
//
// **Que falte uno no rompe nada, y ésa es la propiedad que sostiene P6.** Un SKU que la
// organización tenga y no esté acá se muestra con su código crudo y con la nota de cómo
// nombrarlo: se agrega una fila en la tabla de parámetros, sin desplegar. El código crudo se
// sigue mostrando junto al nombre en todos los casos, porque es lo que hay que teclear en el
// portal de Microsoft.
//
// Idempotente por `upsert` sobre la clave, igual que el resto de los parámetros: se puede
// volver a correr sobre una base poblada. `update` incluye el valor a propósito — si alguien
// corrigió un nombre a mano en la pantalla de parámetros y vuelve a correr la semilla, el
// nombre vuelve al del catálogo. Corregirlo para siempre es cambiarlo acá.

import type { PrismaClient } from '@prisma/client';

import { claveDeSku } from '../../lib/sgsi/licencias';

/// Códigos tal como Microsoft los publica en su lista de identificadores de producto y de plan
/// de servicio. En español donde Microsoft lo traduce, y con el nombre del producto tal como
/// aparece en el portal, que es donde alguien va a ir a buscarlo.
const SKUS: readonly { codigo: string; nombre: string }[] = [
  // ── Los paquetes completos ──
  { codigo: 'SPE_E3', nombre: 'Microsoft 365 E3' },
  { codigo: 'SPE_E5', nombre: 'Microsoft 365 E5' },
  { codigo: 'SPE_F1', nombre: 'Microsoft 365 F3' },
  { codigo: 'SPB', nombre: 'Microsoft 365 Empresa Premium' },
  { codigo: 'O365_BUSINESS_ESSENTIALS', nombre: 'Microsoft 365 Empresa Básico' },
  { codigo: 'O365_BUSINESS_PREMIUM', nombre: 'Microsoft 365 Empresa Estándar' },
  { codigo: 'O365_BUSINESS', nombre: 'Microsoft 365 Aplicaciones para Empresas' },
  { codigo: 'OFFICESUBSCRIPTION', nombre: 'Microsoft 365 Aplicaciones para Empresa' },
  { codigo: 'ENTERPRISEPACK', nombre: 'Office 365 E3' },
  { codigo: 'ENTERPRISEPREMIUM', nombre: 'Office 365 E5' },
  { codigo: 'STANDARDPACK', nombre: 'Office 365 E1' },
  { codigo: 'DESKLESSPACK', nombre: 'Office 365 F3' },

  // ── Correo ──
  { codigo: 'EXCHANGESTANDARD', nombre: 'Exchange Online (Plan 1)' },
  { codigo: 'EXCHANGEENTERPRISE', nombre: 'Exchange Online (Plan 2)' },
  { codigo: 'EXCHANGEDESKLESS', nombre: 'Exchange Online Kiosco' },

  // ── Identidad y seguridad. Importan para el SIG: son los controles de acceso del A.5.15
  //    al A.5.18, y saber quién los tiene es parte de la revisión de accesos. ──
  { codigo: 'AAD_PREMIUM', nombre: 'Microsoft Entra ID P1' },
  { codigo: 'AAD_PREMIUM_P2', nombre: 'Microsoft Entra ID P2' },
  { codigo: 'EMS', nombre: 'Enterprise Mobility + Security E3' },
  { codigo: 'EMSPREMIUM', nombre: 'Enterprise Mobility + Security E5' },

  // ── Complementos de uso frecuente ──
  { codigo: 'POWER_BI_PRO', nombre: 'Power BI Pro' },
  { codigo: 'POWER_BI_STANDARD', nombre: 'Power BI (gratuito)' },
  { codigo: 'FLOW_FREE', nombre: 'Power Automate (gratuito)' },
  { codigo: 'PROJECTPROFESSIONAL', nombre: 'Project Plan 3' },
  { codigo: 'PROJECTESSENTIALS', nombre: 'Project Plan 1' },
  { codigo: 'VISIOCLIENT', nombre: 'Visio Plan 2' },
  { codigo: 'MCOEV', nombre: 'Teams Teléfono Estándar' },
  { codigo: 'MCOMEETADV', nombre: 'Microsoft 365 Audioconferencia' },
  { codigo: 'TEAMS_EXPLORATORY', nombre: 'Microsoft Teams Exploratory' },
  { codigo: 'WINDOWS_STORE', nombre: 'Windows Store para Empresas' },
];

export async function seedLicencias(prisma: PrismaClient): Promise<number> {
  for (const s of SKUS) {
    const datos = {
      valor: s.nombre,
      descripcion: `Nombre comercial del SKU ${s.codigo} en la pestaña de licencias (REQ-SIG-15 P6)`,
    };
    await prisma.parametro.upsert({
      where: { clave: claveDeSku(s.codigo) },
      update: datos,
      create: { clave: claveDeSku(s.codigo), ...datos },
    });
  }
  return SKUS.length;
}
