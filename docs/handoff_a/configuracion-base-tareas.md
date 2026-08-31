# Configuración base de tareas por proceso · instrucciones de carga

**Fecha:** 2026-08-31
**Para:** carga inicial del módulo A (`Persona`, `Area`, `Obligacion`)
**Fuente de contraste:** `FOR-CAL-04 Programa de Auditoría Interna 2026`, que es hoy el único documento del SIG donde están escritos los responsables por proceso

---

## 1. Responsables por proceso · confirmación

Contrasté tu instrucción contra el programa de auditoría 2026. **Coincide en siete de los nueve procesos.** Los dos que no coinciden son cambios reales, no errores míos ni tuyos: hay que saber que se están cambiando.

| Proceso | Prefijo | Responsable · tu instrucción | `FOR-CAL-04` 2026 | Estado |
|---|---|---|---|---|
| Gestión Estratégica | `EST` | Daniel Medina | Daniel Medina | ✅ Coincide |
| Gestión Comercial | `COM` | Lina Medina | Daniel Medina · Lina Medina | ⚠️ Se acota a Lina |
| Gestión de Proyectos | `PRY` | Laura Agudelo | Laura Agudelo | ✅ Coincide |
| Soporte y Servicio al Cliente | `SAC` | Yuliet Rojas | Yuliet Rojas | ✅ Coincide |
| Talento Humano | `TAL` | **Albeiro Medina** | Lina Medina | 🔄 **Cambia de responsable** |
| Gestión Legal y Compras | `LEG` | Marcela Molina | Marcela Molina | ✅ Coincide |
| Gestión Tecnológica | `TEC` | Yuliet Rojas | Yuliet Rojas | ✅ Coincide |
| Sistema Integrado de Gestión | `SIG` | Katherine Quiroga | Laura Agudelo · Katherine Quiroga | ⚠️ Se acota a Katherine · **ver §1.2** |
| Gestión Financiera | `FIN` | **Albeiro Medina** | Lina Medina | 🔄 **Cambia de responsable** |

### 1.1 Los dos cambios

**Talento Humano y Gestión Financiera pasan de Lina Medina a Albeiro Medina.** Es coherente con lo que muestra el repositorio: la aprobación del `PRG-TAL-01 Programa de Gestión del Riesgo Psicosocial`, del 10/08/2026, está firmada por Albeiro, y su inducción está registrada el 26/02/2026. Con este cambio Lina queda solo con Comercial, y Albeiro asume los dos procesos de apoyo.

**Consecuencia práctica:** `FOR-CAL-04` queda desactualizado en tres filas. Conviene corregirlo antes de la próxima auditoría, o el auditor encontrará que el programa nombra a una persona y el sistema a otra. Eso no lo arregla el software.

### 1.2 El único dato que necesito que confirmes

Escribiste **«Katherine: SIC»**. Lo estoy leyendo como **Sistema Integrado de Gestión (`SIG`)**, por descarte: es el único proceso que queda sin responsable, y `FOR-CAL-04` ya nombra a Katherine Quiroga en Gestión de Calidad. Pero «SIC» también podría leerse como Soporte y Servicio al Cliente, que en la codificación del SIG es `SAC` y que en tu instrucción ya quedó con Yuliet.

**Si «SIC» era otra cosa, dilo antes de cargar.** Es un valor de configuración: corregirlo después implica reasignar las asignaciones ya generadas de ese proceso.

Nota menor: en `FOR-CAL-04` el nombre está escrito «Katherine Quirogaa», con una `a` de más. En la carga va **Katherine Quiroga**.

---

## 2. Personas de la configuración base

Estas siete personas son las que la configuración base necesita nombradas, porque responden por un proceso. El resto de la organización —unas 34 cuentas— entra sola por la sincronización con el Directorio.

| Persona | Área | Rol en el SIG |
|---|---|---|
| Daniel Medina | Gestión Estratégica | Responsables SIG |
| Laura Agudelo | Gestión de Proyectos | Responsables SIG |
| Katherine Quiroga | Sistema Integrado de Gestión | Responsables SIG |
| Lina Medina | Gestión Comercial | SIG-Propietarios |
| Albeiro Medina | Talento Humano ⚠️ *(responde también por Gestión Financiera)* | SIG-Propietarios |
| Marcela Molina | Gestión Legal y Compras | SIG-Propietarios |
| Yuliet Rojas | Soporte y Servicio al Cliente ⚠️ *(responde también por Gestión Tecnológica)* | SIG-Propietarios |

**No hay columna de correo en esta tabla, a propósito.** El correo lo pone el Directorio: es la decisión de §3.1 de la especificación —AD manda sobre nombre, correo y existencia; el SIG manda sobre área y cargo—. Inventar aquí un correo que después no coincida con el UPN real crearía personas duplicadas, que es justo lo que el `oid` de Azure existe para evitar.

**Dos personas responden por dos procesos.** El modelo lo soporta sin nada especial: `Persona.areaId` es **una** área —la de pertenencia— mientras que responder por un proceso es ser `responsableSeguimiento` de las obligaciones de ese proceso, que es una relación distinta y admite varias.

Pero el área de pertenencia **no es decorativa**: es la que acota el resumen mensual y la que usa el filtro «mi área». Las dos marcadas con ⚠️ las elegí yo por descarte y **hay que confirmarlas**: si Albeiro pertenece a Gestión Financiera y no a Talento Humano, su resumen mensual cambia de contenido. Lo mismo con Yuliet entre Soporte y Tecnológica.

---

## 3. Orden de carga

El orden importa: cada paso depende del anterior.

| # | Paso | Detalle |
|---|---|---|
| 1 | **Áreas** | Ya existen las diez de `REQ-SIG-01 §3.2` con su prefijo de tres letras. Verificar que estén activas; no crear ninguna. |
| 2 | **Sincronizar el Directorio** | Trae las ~34 personas con su `oid`, nombre y correo reales. **Antes de esto no se carga nada más**: sin `Persona` no hay a quién asignar. |
| 3 | **Área y cargo** | Sobre las personas ya creadas, asignar el área de la tabla del §2. El resto de la organización queda con área en blanco hasta que alguien la ponga; no bloquea nada. |
| 4 | **Cargos** | Reusar el catálogo `CargoResponsable` que ya existe. No duplicar cargos con otro nombre. |
| 5 | **Contenidos** | Los diez de `contenidos-capacitacion.md`, más los de lectura, verificación y tarea que salgan del levantamiento de obligaciones. |
| 6 | **Obligaciones** | Con su alcance, periodicidad, plazo y `responsableSeguimiento` según la tabla del §1. |
| 7 | **Generar asignaciones** | Correr la generación. Es idempotente: si algo salió mal, se corrige y se vuelve a correr. |

---

## 4. Reglas de la carga

| # | Regla |
|---|---|
| **C1** | **`responsableSeguimiento` por defecto es el responsable del proceso** al que pertenece la obligación, según la tabla del §1. Se puede sobrescribir por obligación, pero el valor por defecto sale de ahí. |
| **C2** | **El alcance por área o por cargo se resuelve al generar, no al cargar.** Una obligación dirigida a «Área · Gestión Financiera» alcanzará a quien pertenezca a esa área en el momento de generar cada periodo. No hay que enumerar personas. |
| **C3** | **Ninguna obligación se carga con alcance `PERSONA`** salvo que de verdad sea de esa persona y de nadie más. Con alcance por persona, una desvinculación deja la obligación huérfana; con alcance por cargo o área, se reasigna sola en el periodo siguiente. |
| **C4** | **Las cuatro capacitaciones de alcance «todas las personas» no se programan en el mismo mes.** Con 34 personas activas son ~150 asignaciones al año solo de capacitación; concentradas producen una bandeja que nadie atiende. Distribuir por trimestre. |
| **C5** | **La fecha de inicio de cada obligación no es retroactiva.** Cargar con `fechaInicio` en el pasado genera de golpe todos los periodos vencidos y estrena el sistema con deuda que nadie contrajo. Arrancar en el periodo vigente. |
| **C6** | **Toda la carga queda en bitácora** con el autor real de la sesión que la ejecuta, no con un usuario de sistema. |

---

## 5. Lo que NO se carga

- **Correos.** Los pone el Directorio (§2).
- **Roles.** Los dan los grupos de AD; la aplicación no guarda roles propios.
- **El inventario de obligaciones completo.** Este documento configura *quién responde*; *qué obligaciones existen* sale del levantamiento por procedimiento, que es trabajo del líder del SIG con cada líder de proceso. La aplicación no puede inventarlo.
- **Personas sin cuenta en el tenant.** Contratistas y proveedores quedan fuera del alcance del módulo A.

---

## 6. Pendiente antes de cargar

1. **Confirmar «SIC»** (§1.2). Es el único valor que no pude resolver contra un documento.
2. **Confirmar el área de pertenencia** de Albeiro Medina y de Yuliet Rojas (§2). Decide qué ven en el resumen mensual.
3. **Corregir `FOR-CAL-04`** en las filas que quedan desactualizadas: Talento Humano, Gestión Financiera y —si se acotan— Gestión Comercial y Gestión de Calidad.
4. Decidir si Laura Agudelo conserva corresponsabilidad sobre el Sistema Integrado de Gestión junto a Katherine, o si sale del todo. La tabla del §1 asume que sale.

Nada de esto bloquea el desarrollo: son valores de configuración, no de diseño. Pero conviene resolverlos **antes** de generar asignaciones, porque cambiar un responsable después obliga a reasignar lo ya generado.
