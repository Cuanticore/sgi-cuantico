# `Proceso` como entidad

**Fecha:** 02/09/2026 · **Decisiones:** D1 y D2 del [registro del 02/09/2026](decisiones-2026-09-02.md)
**Naturaleza:** cambio transversal, no un módulo. Toca cuatro entidades existentes y agrega una pantalla de configuración.

---

## 1. Por qué

En el esquema solo existe `Area`. Pero todo el sistema de gestión se organiza por **proceso**: los dueños de tarea son por proceso, el programa de auditoría es por proceso, los indicadores son por proceso, y `RequisitoLegal.procesoEncargado` quedó como **`String`**, que es la única violación viva del invariante de origen tipado.

Hoy «área» hace de dos cosas a la vez. El caso que lo zanja es real: **Yuliet Rojas está en el área Operaciones y lidera el proceso Tecnología y Soporte.** Con una sola entidad ese hecho no se puede escribir.

---

## 2. Modelo

```
model Proceso {
  id            Int
  codigo        String  @unique   // EST, COM, PRY, TEC, TAL, FIN, LCO, SIG
  nombre        String
  areaId        Int                // obligatorio: un proceso vive en un área
  responsableId Int                // el dueño del proceso
  activo        Boolean @default(true)
}
```

**Un proceso pertenece a un área.** Un área puede tener varios procesos; un proceso vive en una sola. La migración es mecánica y permite seguir agregando por área sin perder el detalle por proceso.

### 2.1 Qué migra — y qué no

| Entidad | Llave | Nota |
|---|---|---|
| `Auditoria` y el programa anual | **gana `procesoId`** | El programa se planea por proceso, no por área |
| Indicadores | **gana `procesoId`** | |
| `RequisitoLegal.procesoEncargado` | **pasa de `String` a `procesoId`** | Elimina el último texto libre donde debería haber una llave |
| Configuración de dueños de tarea | **`procesoId`** | Es la tabla que ya escribimos en `configuracion-base-tareas.md` |
| `Activo` | `areaId`, **sin cambio** | Los 234 activos no se tocan. La columna «Proceso» de FOR-SIG-12 se conserva como dato heredado, sin volverse llave |
| `Hallazgo` | `areaId`, **sin cambio** | Quien reporta un hallazgo piensa en áreas, no en procesos |
| `Obligacion.alcanceAreaId` | sin cambio | El alcance por área sigue siendo por área |

Es la migración más pequeña que elimina el texto libre y arregla el programa de auditoría.

---

## 3. Los procesos

Ocho confirmados contra FOR-CAL-04 y las decisiones D10 y D11:

| Código | Proceso | Dueño | Área del dueño |
|---|---|---|---|
| `EST` | Estratégico | Daniel Medina | por confirmar |
| `COM` | Comercial | Lina Medina | por confirmar |
| `PRY` | Proyectos | Laura Agudelo | por confirmar |
| `TEC` | Tecnología y Soporte | Yuliet Rojas | **Operaciones** |
| `TAL` | Talento Humano | Albeiro Medina | **Finanzas** |
| `FIN` | Financiero | Albeiro Medina | **Finanzas** |
| `LCO` | Legal y Compras | Marcela Molina | por confirmar |
| `SIG` | Sistema Integrado de Gestión | Katherine Quiroga | por confirmar |

> **Falta el noveno.** El programa de auditoría dice que en febrero se auditaron **nueve** procesos y acá hay ocho. No lo invento: hay que sacarlo de FOR-CAL-04 antes de cargar.

Dos casos que valen la pena señalar, porque son los que justifican la entidad:

- **Albeiro Medina lidera dos procesos** —Talento Humano y Financiero— desde una sola área. Con `Area` sola, o se duplicaba la persona o se perdía uno de los dos.
- **Yuliet Rojas y su área no coinciden con su proceso.** Operaciones no es Tecnología y Soporte.

---

## 4. La pantalla

**Configuración · Procesos.** Una lista con los nueve, y por cada uno: código, nombre, área a la que pertenece, dueño, y **qué cuelga de él** — cuántas auditorías, cuántos indicadores, cuántos requisitos legales y cuántas obligaciones de tarea.

Ese último conteo es el que importa: es lo que permite ver de un vistazo un proceso sin dueño de tarea asignado, o uno que nunca se ha auditado.

---

## 5. Riesgos de la migración

1. **`RequisitoLegal.procesoEncargado` tiene texto libre existente.** Hay que mapearlo a los nueve códigos y decidir qué hacer con lo que no encaje. La matriz está vacía hoy, así que el riesgo es bajo — pero eso puede cambiar si se carga antes de migrar.
2. **El programa de auditoría ya tiene filas por área.** Migrarlas exige decidir a qué proceso corresponde cada una. Con ocho de nueve procesos identificados y un mapeo casi uno a uno con las áreas, es mecánico salvo en los casos de Albeiro.
3. **Nada de esto rompe lo construido si se hace en ese orden:** crear `Proceso`, poblarlo, agregar las llaves como opcionales, migrar, y solo entonces volverlas obligatorias.

---

## 6. Lo que queda por decidir

1. **El noveno proceso.**
2. **El área de cinco de los ocho dueños**, que no está confirmada.
3. **Si el área del proceso y el área del dueño pueden diferir.** El modelo dice que el proceso vive en un área; nada obliga a que su dueño pertenezca a esa misma área. El caso de Yuliet sugiere que sí pueden diferir, y conviene dejarlo dicho para que nadie lo valide de más.
