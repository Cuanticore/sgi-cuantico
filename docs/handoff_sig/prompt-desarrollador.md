# Prompt de arranque para el desarrollador

Copia todo lo que está debajo de la línea y pégalo como primer mensaje en la sesión del agente, con el repositorio ya clonado y la rama `docs/reconciliacion-specs` traída.

---

Vas a construir la ampliación del SIG de CUANTICO sobre el repositorio `sgi-cuantico`. La especificación completa está en la rama `docs/reconciliacion-specs`, pull request #7. **Solo toca `docs/`: ninguna línea de código viene escrita, y eso es deliberado.**

## 1. Antes de escribir nada

**Rota el secreto de Azure AD.** Dos documentos del repositorio tenían el `AZURE_AD_CLIENT_SECRET` en texto plano. Se limpió el historial y nunca llegó al remoto, pero estuvo en disco sin cifrar. No empieces con un secreto vivo que ya circuló. Confirma que se rotó antes de seguir.

Después lee, **en este orden**:

1. `docs/handoff_sig/decisiones-2026-09-02.md` — diecisiete decisiones. **Es la fuente de verdad: si una spec dice otra cosa, manda este documento.**
2. `docs/handoff_sig/control-de-integracion.md` — qué está construido y qué no, verificado contra el esquema.
3. `docs/handoff_sig/trabajos-programados.md` — el componente que falta y sin el cual nada se mueve solo.
4. `docs/handoff_sig/carga-de-datos.md` — de dónde sale cada dato.
5. Las specs de `docs/superpowers/specs/`, en el orden en que las vayas necesitando.

Los prototipos interactivos están en `docs/handoff_*/design/`. Ábrelos: muchos tienen la regla de negocio demostrada con un interruptor, y eso ahorra media discusión.

## 2. Nueve invariantes que no se negocian

Si alguno te estorba, párate y pregunta. No lo rodees.

1. **Lo derivable se calcula, nunca se almacena.** No hay columna de estado, de nivel, de severidad ni de porcentaje.
2. **No hay borrados físicos.** Todo es baja lógica con fecha.
3. **La validación vive en el servidor.** La interfaz ayuda; no decide.
4. **Ningún umbral, plazo ni periodicidad en el código.** Son datos parametrizables.
5. **Se guarda la referencia al nivel, no el número.** Si la escala cambia, lo guardado sigue significando lo mismo.
6. **Origen tipado, nunca texto libre**, en todo lo que se vaya a contar o filtrar.
7. **La bitácora va en la misma transacción** que el hecho que registra.
8. **La aplicación no guarda roles.** Los dan los grupos de AD.
9. **El color nunca viaja solo.** Siempre con texto al lado.

## 3. Orden de construcción

### Fase 0 · Sin esto, lo demás no funciona

- **Trabajos programados.** Ruta protegida `POST /api/sig/trabajos/[nombre]` invocada por el cron del servidor, con `EjecucionTrabajo` registrando cada corrida. Hoy `generarAsignaciones()` está escrita en `app/sig/acciones/tareas.ts:21` **y no la llama nadie**: el motor de tareas no se mueve solo. Empieza por aquí.
- **Entidad `Proceso`** con `tipo`, `areaId` y `cargoId` → `CargoResponsable`. Migran auditorías, indicadores, requisitos legales y dueños de tarea. Los 234 activos **no se tocan**. Antes de poblar, unifica el catálogo de cargos: hay cargos escritos de dos y tres formas distintas, y un duplicado deja un proceso apuntando a un cargo que nadie ocupa.
- **Navegación de seis pestañas**: Mi SIG · SIG · Actividades · Estratégico · Tecnología · Personas. Hazlo antes de agregar pantallas, no después. **No renombres las claves de permiso**: siguen siendo `operacion:*` aunque la pestaña se llame Actividades.

### Fase 1 · Las costuras

- `AlcanceObligacion` con `ACTIVO`, `TIPO_ACTIVO` y `NIVEL_ACTIVO`. Es la más importante del paquete: sin ella, cuatro obligaciones de política no se pueden expresar.
- `ContenidoSig` versionado que **no invalida** registros previos.
- `Evidencia` con dueño obligatorio.
- Fusión de `Proveedor` y `ParteInteresada` en una sola organización.

### Fase 2 a 5 · Los módulos

En este orden, porque cada uno usa al anterior:

| | Módulo | Spec |
|---|---|---|
| 2 | Gestión de Colaboradores + leer/aceptar/firmar | REQ-SIG-09 |
| 3 | Operación del SGSI | REQ-SIG-07 |
| 4 | Gestión Tecnológica | REQ-SIG-06 |
| 5 | Ciclo de vida de desarrollo seguro | REQ-SIG-08 |

## 4. Lo que NO debes hacer

- **No construyas un segundo motor de listas de verificación.** Las verificaciones del SGSI y los 73 ítems de PTR-TEC-03 son contenidos del módulo A. Duplicar el planificador sería el error más caro del paquete.
- **No construyas la entidad de riesgo del sistema** en REQ-SIG-08. El hueco es deliberado y está en el comité (D15).
- **No implementes el bloqueo por puerta de control** (D17). La aplicación registra y señala; no impide.
- **No traigas EPS, pensión, ARL, caja, cesantías, hijos ni edad** al módulo de colaboradores. Son datos de nómina.
- **No inventes datos que falten.** Si un dueño, un código o una periodicidad no está, déjalo visible como faltante. Varias pantallas ya lo hacen así a propósito.

## 5. Cómo reportar

Si encuentras que una spec contradice al código, o que algo especificado no se puede construir como está escrito: **anótalo y sigue con lo que no dependa de eso.** No cambies la spec por tu cuenta y no adivines la intención. El documento de decisiones se actualiza del lado de quien especifica.

Al terminar cada fase, dime qué quedó construido, qué no y por qué.
