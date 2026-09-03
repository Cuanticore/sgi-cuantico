# Trabajos programados

**Fecha:** 02/09/2026 · **Naturaleza:** componente transversal que falta.
**Verificado contra el código**, no contra las specs.

---

## 1. Qué hay y qué no

| Pieza | Estado |
|---|---|
| `enviarCorreo()` — SMTP con nodemailer | `lib/sgsi/notificaciones.ts:35` · **construido** |
| `enviarNotificacion()` — los cinco tipos: `NUEVA`, `PROXIMIDAD`, `VENCIMIENTO`, `SEMANAL`, `MENSUAL` | `lib/sig/envios.ts:30` · **construido** |
| `generarAsignaciones()` — abre los periodos | `app/sig/acciones/tareas.ts:21` · **construido** |
| **Quien dispara todo eso por calendario** | **No existe** |

`generarAsignaciones()` **no la llama nadie**. Es una server action huérfana: está escrita, probada y sin quien la invoque. Lo mismo con los tipos `SEMANAL` y `MENSUAL` de `enviarNotificacion`.

**La consecuencia práctica:** hoy el motor de tareas no se mueve solo. Los periodos no se abren, las asignaciones no vencen, y los correos semanal y mensual no salen, salvo que alguien entre y apriete algo. Todo el módulo A depende de un componente que no está.

No hay ninguna dependencia de scheduling en `package.json` —ni `node-cron`, ni colas— y no hay ruta de API para trabajos.

---

## 2. La propuesta

**Una ruta protegida que el cron del servidor invoca.** No es una idea nueva: **el servidor ya tiene cron y ya lo usamos**, en `deploy/respaldo-postgres.sh` para el respaldo diario de Postgres. Esto sigue el mismo camino.

```
POST /api/sig/trabajos/[nombre]
Authorization: Bearer <SIG_TRABAJOS_SECRET>
```

Por qué así y no de otra forma:

- **Corre en el mismo proceso Next** que ya tiene Prisma, la sesión de SMTP y las server actions. Cero configuración duplicada.
- **No agrega dependencias.** Un worker aparte con `node-cron` obligaría a un segundo despliegue, un segundo juego de variables de entorno y un segundo sitio donde mirar cuando algo falle.
- **No depende de GitHub Actions.** Poner los trabajos ahí mete la disponibilidad del sistema de gestión en manos de un tercero y obliga a exponer la ruta a internet.

La ruta **verifica el secreto y nada más**: no usa la sesión, porque no hay persona detrás. El secreto va en `.env` como `SIG_TRABAJOS_SECRET`.

---

## 3. Los ocho trabajos

| Trabajo | Cuándo | Qué hace |
|---|---|---|
| `generar-asignaciones` | Diario, 05:00 | Abre los periodos que corresponda según cada obligación y su anclaje (R12) |
| `marcar-vencidas` | Diario, 05:10 | Pasa a vencida lo que cruzó su fecha límite. **La asignación sigue abierta y exigible** |
| `avisos-por-vencer` | Diario, 06:00 | Envía `PROXIMIDAD` según los `diasAviso` de cada obligación |
| `correo-semanal` | Lunes, 07:00 | El resumen de pendientes por persona |
| `correo-mensual` | Día 1, 07:00 | El seguimiento por proceso al responsable |
| `excepciones-vencidas` | Diario, 05:20 | Levanta hallazgo por cada excepción que pasó su fecha de cierre sin cerrarse (REQ-SIG-08 · G4) |
| `permisos-temporales-vencidos` | Cada hora | Cierra los accesos temporales cuya vigencia expiró (REQ-SIG-07 · O14) |
| `sincronizar-directorio` | Diario, 04:30 | Trae altas y bajas de Azure AD y marca las anomalías del directorio de colaboradores |

---

## 4. Dos reglas que hacen esto seguro

**T1 · Los trabajos son idempotentes, y ya lo son por diseño.** `Asignacion` tiene `@@unique([obligacionId, personaId, periodo])`: correr la generación dos veces no duplica nada. Es exactamente lo que permite que un cron reintente sin miedo, y es la razón por la que esa restricción está en el esquema.

**T2 · Toda ejecución deja registro.** Un cron que falla en silencio es peor que no tener cron: el sistema parece funcionar y las tareas simplemente dejan de aparecer.

```
model EjecucionTrabajo {
  id        Int
  trabajo   String
  inicio    DateTime
  fin       DateTime?
  resultado enum { EXITOSO, FALLIDO, PARCIAL }
  creados   Int      // asignaciones abiertas, correos enviados, etc.
  detalle   String?  // el conteo por tipo
  error     String?
}
```

Y con eso, una regla que se sigue sola: **si el trabajo de generación no corrió ayer, el tablero del líder del SIG lo dice.** Es más importante que cualquier indicador de cumplimiento, porque sin él todos los demás mienten a la baja.

---

## 5. Lo que queda por decidir

1. **La hora exacta y la zona.** `America/Bogota`, y conviene que la generación corra antes que los avisos, que es como está propuesto arriba.
2. **Qué pasa si un trabajo falla.** Propuesta: reintentar una vez a los quince minutos y, si vuelve a fallar, enviar correo al líder del SIG. No callarlo.
3. **Si el correo semanal se envía a quien no tiene nada pendiente.** Recomiendo que no: un correo que dice «no tienes nada» semana tras semana entrena a la gente a no abrirlo, y el día que traiga algo tampoco lo van a abrir.
4. **Dónde se ve esto.** Propuesta: en Configuración, con el histórico de ejecuciones y un botón para correr un trabajo a mano — que es lo que hoy no existe y hace falta para la carga inicial.
