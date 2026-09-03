# Configuración base de tareas por proceso · instrucciones de carga

**Fecha:** 2026-08-31
**Para:** carga inicial del módulo A (`Persona`, `Area`, `Obligacion`)
**Fuente de contraste:** `FOR-CAL-04 Programa de Auditoría Interna 2026`, que es hoy el único documento del SIG donde están escritos los responsables por proceso

---

## 1. Responsables por proceso · confirmado el 02/09/2026

**Actualizado contra el mapa de procesos de MAN-SIG-02**, que es la fuente, y contra el programa de auditoría `FOR-CAL-04` 2026.

**El dueño de un proceso es un cargo, no una persona** (ver [proceso-entidad.md](../handoff_sig/proceso-entidad.md)). La persona sale de quién ocupa el cargo hoy.

| Proceso | Código | Tipo | Cargo responsable | Quien lo ocupa | vs. `FOR-CAL-04` |
|---|---|---|---|---|---|
| Gestión Estratégica | `EST` | Estratégico | Gerencia General | Daniel Medina | ✅ Coincide |
| Gestión Comercial | `COM` | Misional | Gerencia Comercial | Lina Medina | ⚠️ Se acota a Lina |
| Gestión de Proyectos | `PRO` | Misional | Gerencia de Operaciones | Yuliet Rojas | 🔄 **Cambia** · estaba Laura Agudelo |
| Soporte y Servicio al Cliente | `SAC` | Misional | Gerencia de Operaciones | Yuliet Rojas | ✅ Coincide |
| Talento Humano | `TAL` | Apoyo | Líder Administrativo | Albeiro Medina | 🔄 **Cambia** · estaba Lina Medina |
| Gestión Legal y de Compras | `LCO` | Apoyo | Chief Legal Officer | Marcela Molina | ✅ Coincide |
| Gestión Tecnológica | `TEC` | Apoyo | Gerencia de Operaciones | Yuliet Rojas | ✅ Coincide |
| Sistema Integrado de Gestión | `SIG` | Apoyo | Líder del SIG | Katherine Quiroga | ⚠️ Se acota a Katherine |
| Gestión Financiera | `FIN` | Apoyo | Líder Administrativo | Albeiro Medina | 🔄 **Cambia** · estaba Lina Medina |

### 1.1 Los tres cambios frente al programa de auditoría

**Talento Humano y Gestión Financiera pasan de Lina Medina a Albeiro Medina.** Coherente con el repositorio: la aprobación del `PRG-TAL-01 Programa de Gestión del Riesgo Psicosocial`, del 10/08/2026, está firmada por Albeiro.

**Gestión de Proyectos pasa de Laura Agudelo a la Gerencia de Operaciones.** El mapa asigna el proceso a la gerencia, no a la Dirección de Consultoría, que es el cargo de Laura.

**Consecuencia práctica:** `FOR-CAL-04` queda desactualizado en cuatro filas. Conviene corregirlo antes de la próxima auditoría, o el auditor encontrará que el programa nombra a una persona y el sistema a otra. Eso no lo arregla el software.

Nota menor: en `FOR-CAL-04` el nombre está escrito «Katherine Quirogaa», con una `a` de más. En la carga va **Katherine Quiroga**.

> **El mismo cargo escrito de varias formas es ahora un defecto que importa.** Antes el dueño era una persona y el nombre del cargo era descriptivo; con el dueño convertido en cargo, `CargoResponsable` es una llave. Y en las fuentes hay al menos tres casos de un cargo con dos o tres nombres: Lina Medina figura como **«Gerente Comercial»** en el mapa y como **«Director de Ventas · National Sales Manager»** en la relación de personal; Yuliet Rojas como **«Gerencia de Operaciones»**, **«Gerente de Operaciones · Chief Operating Officer»** y **«Operations & Services Manager»**.
>
> Si se cargan como cargos distintos, un proceso queda apuntando a un cargo que nadie ocupa. **Hay que unificar el catálogo de cargos antes de cargar los procesos**, y es el mismo problema que «Prestación de Servicios» escrito de tres formas en la relación de personal.

### 1.2 Un cargo con tres procesos, y lo que eso concentra

**Gerencia de Operaciones responde por `PRO`, `SAC` y `TEC`.** Sumando las obligaciones estimadas de los tres, es alrededor de **la mitad de la carga de todo el sistema** en un solo cargo, y `TEC` por sí solo es el proceso con más obligaciones porque soporta el SGSI entero.

Eso no es un problema del software y el modelo lo soporta sin nada especial. Pero conviene que quede dicho antes de generar las primeras asignaciones: si esa concentración no es sostenible, el momento de repartirla es **antes** de la carga, no después.

### 1.3 Los códigos de proceso reusan los prefijos que ya existen

No se inventa una tercera convención. Los prefijos de tres letras ya están en uso en los códigos de documento y de activo del SIG: `MAT-EST-01`, `FOR-CAL-04`, `PRO-PRO-01`, `FOR-TEC-04`, `FOR-TAL-01`, `FOR-FIN-03`, `FOR-LCO-05`, `FOR-SIG-12`.

De los nueve, **`COM` y `SAC` son los únicos que no pude verificar contra un código de documento real.** Si el SIG ya usa otros para esos dos, mandan los del SIG.

---

## 2. Personas de la configuración base

Estas siete personas son las que la configuración base necesita nombradas, porque responden por un proceso. El resto de la organización —unas 34 cuentas— entra sola por la sincronización con el Directorio.

| Persona | Cargo | Área | Procesos que responde |
|---|---|---|---|
| Daniel Medina | Gerencia General | por confirmar | `EST` |
| Lina Medina | Gerencia Comercial | por confirmar | `COM` |
| Yuliet Rojas | Gerencia de Operaciones | **Operaciones** | `PRO` · `SAC` · `TEC` |
| Albeiro Medina | Líder Administrativo | **Finanzas** | `TAL` · `FIN` |
| Marcela Molina | Chief Legal Officer | por confirmar | `LCO` |
| Katherine Quiroga | Líder del SIG | por confirmar | `SIG` |

Seis personas para nueve procesos. **Laura Agudelo sale de esta tabla**: el mapa asigna Gestión de Proyectos a la Gerencia de Operaciones, no a la Dirección de Consultoría.

Con el modelo de dos roles vigente desde el 01/09/2026, las seis van en **`SIG-Seguridad`** («Líderes SIG»); los grupos `Responsables SIG` y `SIG-Propietarios` que nombraba la versión anterior de esta tabla ya no existen.

**No hay columna de correo en esta tabla, a propósito.** El correo lo pone el Directorio: es la decisión de §3.1 de la especificación —AD manda sobre nombre, correo y existencia; el SIG manda sobre área y cargo—. Inventar aquí un correo que después no coincida con el UPN real crearía personas duplicadas, que es justo lo que el `oid` de Azure existe para evitar.

**Dos cargos responden por varios procesos**, y uno por tres. El modelo lo soporta sin nada especial: el área de pertenencia de la persona es **una**, mientras que responder por un proceso es la relación `Proceso.cargoId`, que es distinta y admite varias.

El área de pertenencia **no es decorativa**: es la que acota el resumen mensual y la que usa el filtro «mi área». Dos están confirmadas por D11 —Yuliet en Operaciones, Albeiro en Finanzas— y **las otras cuatro faltan**. Nótese que el área de la persona no tiene por qué coincidir con el área del proceso que lidera: Yuliet está en Operaciones y responde por Gestión Tecnológica.

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

> **Corregido el 02/09/2026.** Este apartado decía que «contratistas y proveedores quedan fuera del alcance del módulo A». **Ya no es cierto y era el supuesto más equivocado de este documento:** de las 38 personas activas, **32 son contratistas**, y PRO-TAL-04 les exige capacitación. Todo colaborador activo tiene cuenta del Directorio y entra al motor de tareas. Ver [REQ-SIG-09](../superpowers/specs/2026-09-02-sig-gestion-colaboradores-design.md).

---

## 6. Pendiente antes de cargar

1. **Unificar el catálogo de cargos** antes de cargar los procesos (§1.1). Es lo que más riesgo tiene: con el dueño convertido en cargo, un cargo duplicado deja un proceso apuntando a alguien que no existe.
2. **Confirmar el área de pertenencia** de Daniel Medina, Lina Medina, Marcela Molina y Katherine Quiroga (§2). Decide qué ven en el resumen mensual.
3. **Confirmar los códigos `COM` y `SAC`** (§1.3), que son los dos que no pude verificar contra un código de documento real.
4. **Corregir `FOR-CAL-04`** en las cuatro filas desactualizadas: Talento Humano, Gestión Financiera, Gestión de Proyectos y —si se acotan— Gestión Comercial y Gestión de Calidad.
5. **Revisar la concentración en Gerencia de Operaciones** (§1.2), que responde por tres de los nueve procesos. Si hay que repartirla, el momento es antes de generar asignaciones.
6. Decidir si Laura Agudelo conserva corresponsabilidad sobre el Sistema Integrado de Gestión junto a Katherine, o si sale del todo. La tabla del §1 asume que sale.

Nada de esto bloquea el desarrollo: son valores de configuración, no de diseño. Pero conviene resolverlos **antes** de generar asignaciones, porque cambiar un responsable después obliga a reasignar lo ya generado.
