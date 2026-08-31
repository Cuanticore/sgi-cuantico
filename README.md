This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# sgi-cuantico

## Personas y acceso (SIG)

Toda cuenta autenticada del tenant entra como **Colaborador**: ve sus propias tareas en Mi
SIG y nada del SGSI. Los permisos del SGSI siguen viniendo de tres grupos del Directorio —
Responsables SIG, SIG-Propietarios, SIG-Auditoría.

La tabla persona es un espejo del Directorio: se crea la fila al iniciar sesión y el
líder del SIG puede sincronizar el censo completo desde Microsoft Graph. Quien desaparece
del Directorio se **inactiva**, nunca se borra, porque sus registros sostienen una
auditoría. Área y cargo son del SIG y la sincronización no los toca.

## Motor de tareas (SIG)

`ContenidoSig` (capacitación, lectura, verificación o tarea), `Obligacion` (la lista
maestra del numeral 8) y `Asignacion` (la instancia concreta por persona y periodo)
forman el motor que los módulos B, C y D consumen. La generación es **idempotente**:
se puede correr cuantas veces se quiera y nunca duplica, porque la unique tripla
(obligación, persona, periodo) lo impide. El alcance se resuelve al generar, no al
definir: quien ingresa después recibe los periodos siguientes, nunca los pasados.

«Vencida» no es un estado: es `PENDIENTE` con fecha límite anterior a hoy, calculada
al leer. Todo cierre se valida en el servidor (ítems obligatorios, versión leída,
nota mínima) y queda en `RegistroRealizado`, inmutable. Reabrir conserva el registro
anterior y el nuevo cierre crea otro.

## Notificaciones, indicadores e histórico (SIG)

Los correos salen por SMTP (las mismas credenciales de las menciones del SGSI) y cada
envío queda registrado en `EnvioNotificacion` — correr el disparo dos veces no duplica
nada. Reglas del diseño: sin pendientes no se envía el semanal; un correo por persona,
agrupado; el mensual cubre solo el área del destinatario y el del líder del SIG todas;
un envío fallido queda registrado con su detalle. La hora y los días de envío se
configuran con `SGI_CORREO_HORA`, `SGI_CORREO_DIA_SEMANAL` y `SGI_CORREO_DIA_MENSUAL`.

Los indicadores (cumplimiento, deuda, cierres administrativos) se calculan al leer y
viven en `lib/sig/cumplimiento.ts`: la barra de Obligaciones y el correo mensual
comparten esa única copia. El histórico personal exporta a Excel y a la vista
imprimible, con el cierre administrativo señalado con quién lo hizo.

## Mejora: NC y ACPM (SIG)

`Hallazgo` cubre NC mayor, NC menor, observación y oportunidad de mejora. El código
(`HAL-2026-NNNN`) no lleva el tipo: reclasificar no rompe la trazabilidad. El estado se
calcula —abierto, en análisis, en ejecución, en verificación— y solo se almacenan las
marcas de cerrado y anulado, que son actos de una persona. Cualquiera reporta; solo el
líder del SIG clasifica; nadie cierra su propio hallazgo; no se cierra sin verificación
eficaz cuando el tipo la exige.

Las acciones del hallazgo son **asignaciones del motor de A**: aparecen en Mi SIG del
responsable junto a lo recurrente. Los plazos por tipo se parametrizan en
`plazo_por_tipo_hallazgo`. La evidencia reusa `Evidencia` (control, registro o hallazgo:
exactamente un origen, impuesto por CHECK).