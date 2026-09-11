# Requerimiento · La madurez declarada contra la evidencia

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-22 · madurez verificada |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-11 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Líder del SIG (el grueso) + equipo de desarrollo (la regla) |
| **Gobierna** | `MET-SIG-01 Metodología v3 §8.4 y §12.4` |
| **Toca** | `Control.actualId` · `EjecucionVerificacion` · `lib/sgsi/madurez.ts` · la pantalla de Madurez |
| **Secuencia** | **Segundo de tres.** REQ-SIG-21 hace que el modelo reaccione a la madurez; éste hace que la madurez sea verdadera |
| **Estado** | D-1 **bloquea** · D-2 y D-3 abiertas |

---

## 1 · Objetivo

REQ-SIG-21 consigue que el riesgo residual **reaccione** cuando el control clave está flojo. Este requerimiento consigue que el nivel de ese control **diga la verdad**.

Los dos juntos, o ninguno sirve solo: un modelo sensible alimentado con madureces optimistas produce números precisos y falsos, que es peor que números imprecisos y evidentemente provisionales.

---

## 2 · El hallazgo

### 2.1 El salto

Entre la línea base del GAP del 2 de marzo de 2026 y la evaluación actual:

| | Línea base (GAP) | Actual |
|---|---|---|
| L0 · Inexistente | **65** | 0 |
| L1 · Inicial | 22 | 0 |
| L2 · Repetible | 5 | 11 |
| L3 · Definido | 0 | **44** |
| L4 · Gestionado | 0 | **31** |
| Sin evaluar | 1 | 7 |
| **Eficacia media** | **5.1 %** | **86.6 %** |

**61 de 85 controles evaluados subieron tres niveles o más.** La organización pasó de una eficacia media del 5 % al 87 % en un ciclo, y **nada en el sistema contrasta esa declaración contra evidencia de que el control funcionó**.

No afirmo que sea falso. Afirmo que **es indistinguible de serlo**, y que la mitad residual de todo el análisis de riesgos cuelga de ese número.

### 2.2 Veinte controles se autodelatan

De los **75 controles en L3 o superior, 20 tienen evidencia escrita que admite un vacío**. Una muestra, textual del propio dato:

| Nivel | Control | Evidencia registrada |
|---|---|---|
| L3 | **A.8.14** Redundancia de las instalaciones | «Redundancia de infraestructura en AWS; **sin prueba formal de conmutación**» |
| L3 | **A.5.30** Preparación TIC para la continuidad | «Redundancia en AWS y respaldos probados; **falta ejercitar el plan completo**» |
| L3 | A.6.3 Concienciación y formación | «Capacitaciones con registro de asistencia; **sin simulacros de phishing ni métricas**» |
| L3 | A.8.12 Prevención de fuga de datos | «Políticas activas en Purview; **falta afinar y medir**» |
| L3 | A.5.35 Revisión independiente | «Revisión parcial ejecutada; **hallazgos aún sin cerrar**» |
| L3 | A.8.6 Gestión de la capacidad | «Observabilidad con Grafana; **umbrales aún sin formalizar**» |
| L3 | A.5.28 Recolección de evidencia | «Retención de logs en Sentinel; **falta procedimiento forense formalizado**» |
| L3 | A.8.9 Gestión de configuraciones | «Líneas base en Intune e IaC; **falta verificación de cumplimiento**» |

**Y un contraste que importa**: `A.8.13 Respaldo de la información` está en **L4** con evidencia «respaldos automáticos **con pruebas de restauración ejecutadas y registradas**». Ése sí sostiene su nivel. La diferencia entre A.8.13 y A.8.14 no es de redacción: uno probó y el otro no.

**Ninguno de los 31 controles en L4 admite vacío en su evidencia.** O están todos completos, o el texto dejó de ser honesto justo donde más pesa: L4 vale 95 % de eficacia.

### 2.3 La metodología pide la verificación y el código no la mira

`MET-SIG-01 v3` tiene el capítulo **12.4 · Verificación de eficacia**, y su plan de tratamiento registra «fecha real, madurez alcanzada **y verificación de eficacia**».

El esquema tiene `EjecucionVerificacion` con su `ResultadoVerificacion`. Existe, se puede registrar, se puede consultar.

**Y ni `lib/sgsi/riesgos.ts` ni `lib/sgsi/madurez.ts` la mencionan.** Verificado: `grep -n "verificacion"` sobre los dos archivos no devuelve una línea. La eficacia que alimenta los 725 riesgos sale **únicamente** de un nivel CMM autodeclarado.

---

## 3 · Qué se hace · en dos tiempos

### 3.1 Primero corregir, después reglar

La tentación es escribir una regla que baje automáticamente las madureces sin verificar. **No.** Una regla que mueve 75 controles de golpe produce un tablero irreconocible y nadie la va a creer.

El orden es al revés: **corregir los 20 que su propia evidencia delata, y después poner la regla que impide que vuelva a pasar.**

### 3.2 Tiempo 1 · la revisión de los 20

Para cada uno de los 20 controles de §2.2, con su líder de proceso:

| Pregunta | Si la respuesta es no |
|---|---|
| ¿Existe el proceso documentado? | El nivel no llega a L3 |
| ¿Se ejecutó al menos una vez y quedó registro? | El nivel no llega a L3 |
| ¿Se mide y se revisa periódicamente? | El nivel no llega a L4 |
| ¿Hay una verificación con resultado eficaz en los últimos 12 meses? | El nivel **no puede sostener L4** |

El resultado de cada revisión se registra como `EjecucionVerificacion` —eficaz o no eficaz— **aunque el nivel no cambie**. Una verificación que confirma el nivel vale tanto como una que lo corrige: es la que permite decir que el 86,6 % está sostenido.

**Empezar por los dos de continuidad**, `A.8.14` y `A.5.30`, porque son los que sostienen el riesgo de los tres activos de valor 5.

### 3.3 Tiempo 2 · la regla que impide la deriva

```
Un control en L4 o L5 exige una EjecucionVerificacion con resultado EFICAZ
en los últimos 12 meses.
Un control en L3 exige al menos una ejecución registrada, sin ventana.
```

Sin esa verificación, el control queda marcado **«declarado, no verificado»**.

**Qué hace la marca, y qué no.** No baja el nivel automáticamente — eso violaría la regla de la casa, «la aplicación registra y señala; no impide», y además escondería la decisión. Lo que hace:

1. **Aparece en la pantalla de Madurez** junto al control, con la fecha de la última verificación o «nunca».
2. **El índice de madurez se reporta dos veces**: *declarado* y *verificado*. El segundo excluye los no verificados del promedio. La diferencia entre los dos números **es la medida de cuánto del tablero descansa en una declaración**.
3. **Cada riesgo cuyo control principal esté no verificado lleva el aviso** en su detalle, junto a la eficacia — que es donde REQ-SIG-21 ya puso el aviso de «sin relevancia».
4. **Genera una obligación** para el responsable del control, con la periodicidad del motor de tareas.

Si la eficacia del riesgo debe además **acotarse** mientras el control no esté verificado es la decisión **D-2**. Mi recomendación es **no acotar todavía**: primero que el tablero muestre la brecha entre declarado y verificado durante un ciclo, y con ese número a la vista se decide. Acotar de entrada mueve 725 riesgos por una regla que nadie ha visto operar.

---

## 4 · El caso que lo originó

```
TEC-GEN-0004 · MINTRACE — Ambiente de producción · D5 I5 C5
A.24 Denegación de servicio · inherente 5 (Alto)

Control principal:  A.8.14 Redundancia de las instalaciones
  nivel declarado:  L3  ·  eficacia 90 %
  evidencia:        «Redundancia en AWS; sin prueba formal de conmutación»
  verificación:     ninguna registrada
  realidad:         no hay segunda región — decisión de presupuesto
```

Con el nivel declarado, el residual es **0.45 · Bajo** y no aparece en ningún tablero. Con el nivel corregido a L1 y REQ-SIG-21 operando, es **4.25 · Medio** y sube a la lista de activos sin plan.

Y entonces la decisión que ya está tomada —no hay presupuesto para la segunda región— **se registra como lo que es**: una `AccionPlan` de tipo `ACEPTAR`, con su justificación, su fecha de revisión y la firma del aprobador que `CriterioAceptacion` señala.

**Eso es lo que este requerimiento compra**: que una decisión de negocio consciente deje de estar escondida en un nivel de madurez optimista.

---

## 5 · Criterios de aceptación

1. Los **20 controles** de §2.2 tienen, cada uno, una `EjecucionVerificacion` registrada con su resultado — eficaz o no eficaz — y su fecha.
2. `A.8.14` y `A.5.30` están revisados **antes** que los otros 18.
3. La pantalla de Madurez reporta **dos índices**: declarado y verificado. Al arrancar la diferencia será grande; ése es el punto.
4. `select count(*) from control where actual_id in (L4, L5)` sin verificación eficaz vigente → cada uno aparece marcado «declarado, no verificado».
5. Un control marcado genera **una obligación** para su responsable.
6. El detalle de un riesgo cuyo **control principal** esté no verificado muestra el aviso junto a la eficacia.
7. Ningún nivel de madurez cambia **automáticamente**. Los cambios de §3.2 se hacen a mano, con su bitácora y su razón escrita.
8. Bajar un control de L3 a L1 mueve **todos** los riesgos que ese control mitiga, en una sola regeneración. Es la propiedad que la metodología promete y hay que verla funcionar.

---

## 6 · Decisiones

- **D-1 · quién revisa los 20 · BLOQUEA.** Es el trabajo central y no lo puede hacer el desarrollo. Propuesta: líder del SIG con el líder de cada proceso, dos sesiones, empezando por los dos de continuidad.
- **D-2 · ¿la eficacia se acota mientras el control no esté verificado?** Recomiendo **no** en este ciclo: primero mostrar la brecha entre índice declarado e índice verificado, y decidir con ese número a la vista.
- **D-3 · la ventana de vigencia.** Propongo **12 meses** para L4/L5, alineado con el ciclo de auditoría interna. Si la revisión por la dirección es semestral, puede ser 6.

---

## 7 · Lo que no entra

- **Bajar niveles automáticamente.** Ni con regla ni con migración. La madurez la mueve una persona, con evidencia y bitácora.
- **Cambiar la escala CMM ni la curva de eficacia.** Son de PILAR/CCN-CERT y la metodología las adopta.
- **Rehacer el GAP.** La línea base del 2 de marzo se conserva tal cual: es la que hace demostrable el progreso.
- **La exigencia por criticidad**, que es REQ-SIG-23 y necesita que este requerimiento haya corrido primero — no tiene sentido comparar un nivel exigido contra un nivel que no se sostiene.
