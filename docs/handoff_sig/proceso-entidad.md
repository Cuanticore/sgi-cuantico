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
  id       Int
  codigo   String  @unique   // EST, COM, PRY, SSC, TAL, LCO, TEC, SIG, FIN
  nombre   String
  tipo     enum { ESTRATEGICO, MISIONAL, APOYO }
  areaId   Int                // obligatorio: un proceso vive en un área
  cargoId  Int                // → CargoResponsable, NO → Persona
  activo   Boolean @default(true)
}
```

**Un proceso pertenece a un área.** Un área puede tener varios procesos; un proceso vive en una sola.

**El dueño es un cargo, no una persona.** El mapa de MAN-SIG-02 nombra gerencias —«Gerencia de Operaciones», no «Yuliet Rojas»—, y modelarlo así es más fiel y sobrevive a la rotación: cuando alguien cambia de puesto, las obligaciones del proceso lo siguen solas. `CargoResponsable` ya existe en el esquema, así que no agrega tabla nueva.

**`tipo` sale del mapa** y no es decorativo: la clasificación en estratégicos, misionales y de apoyo es la que ISO 9001 espera ver, y es como se agrupa el programa de auditoría.

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

## 3. Los nueve procesos

Tomados del **mapa de procesos de MAN-SIG-02**, que es la fuente. Confirmado el 02/09/2026.

| Código | Tipo | Proceso | Cargo responsable | Quien lo ocupa |
|---|---|---|---|---|
| `EST` | Estratégico | Gestión Estratégica | Gerencia General | Daniel Medina |
| `COM` | Misional | Gestión Comercial | Gerencia Comercial | por confirmar |
| `PRY` | Misional | Gestión de Proyectos | Gerencia de Operaciones | Yuliet Rojas |
| `SSC` | Misional | Soporte y Servicio al Cliente | Gerencia de Operaciones | Yuliet Rojas |
| `TAL` | Apoyo | Talento Humano | Líder Administrativo | Albeiro Medina |
| `LCO` | Apoyo | Gestión Legal y de Compras | Chief Legal Officer | Marcela Molina |
| `TEC` | Apoyo | Gestión Tecnológica | **por confirmar** | por confirmar |
| `SIG` | Apoyo | Sistema Integrado de Gestión | Líder del SIG | Katherine Quiroga |
| `FIN` | Apoyo | Gestión Financiera | Líder Administrativo | Albeiro Medina |

### 3.1 Dos correcciones a lo que yo tenía

**Inventé un proceso que no existe.** Escribí «Tecnología y Soporte» como si fuera uno solo. En el mapa son **dos procesos distintos y de bandas distintas**: `SSC` Soporte y Servicio al Cliente es **misional**, y `TEC` Gestión Tecnológica es **de apoyo**. En la conversación diaria se mezclan; en el sistema de gestión no son lo mismo.

**Gestión de Proyectos no es de Laura Agudelo.** Es de la **Gerencia de Operaciones**, que ocupa Yuliet Rojas. Laura Agudelo figura en la relación de personal como Director de Consultoría.

Ese error de mi parte llegó a `configuracion-base-tareas.md`, que hay que corregir antes de cargar.

### 3.2 Lo que estos nueve confirman del modelo

- **Un cargo, dos procesos.** Gerencia de Operaciones es dueña de `PRY` y `SSC`; Líder Administrativo de `TAL` y `FIN`. Con `Area` sola no se podía escribir.
- **`TEC` es el proceso con más obligaciones de todo el sistema** —dieciocho— y el que soporta el SGSI entero. Es el que menos conviene dejar sin cargo asignado, y es justo el que está sin confirmar.
- **`SIG` no tiene auditoría en el programa.** Auditarse a sí mismo exige separación de funciones: lo audita alguien de otro proceso.

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

1. **El cargo responsable de `TEC` Gestión Tecnológica.** Es el más urgente: dieciocho obligaciones y el soporte del SGSI entero cuelgan de un proceso sin dueño.
2. **Si «Gerencia Comercial» y «Director de Ventas» son el mismo cargo.** El mapa dice lo primero, la relación de personal lo segundo.
3. **El área de cada proceso.** El mapa da la banda y el cargo, no el área; hay que fijarla antes de migrar.
4. **Si el área del proceso y el área del dueño pueden diferir.** El modelo dice que el proceso vive en un área; nada obliga a que quien ocupa el cargo pertenezca a esa misma. El caso de Yuliet Rojas —área Operaciones— sugiere que sí, y conviene dejarlo dicho para que nadie lo valide de más.
5. **Corregir `configuracion-base-tareas.md`**, que arrastra mi error de asignar Proyectos a Laura Agudelo y de fundir Gestión Tecnológica con Soporte al Cliente.
