# Aprobación del riesgo residual · diseño

**Fecha:** 2026-09-16 · **Estado:** propuesta, pendiente de revisión
**Decisiones tomadas con:** Daniel Medina, en sesión del 16/09/2026

---

## Por qué existe

El SGSI registra la aceptación formal del riesgo residual como una `AccionPlan` de tipo
`ACEPTAR`, con justificación, fecha de revisión y un cargo aprobador en `apruebaId`. Lo que
no existe en ninguna parte es **el acto de aprobar**: ni quién lo hizo, ni cuándo, ni el
documento que lo sostiene.

Tres huecos concretos, verificados en el código el 16/09/2026:

1. El informe de valoración dedica una sección entera a «Aceptación del riesgo residual»
   (`lib/sgsi/informe-documento.ts:246`) y en ella imprime plan, activo, justificación y
   fecha de revisión. **No imprime quién aprobó.** El tipo `AceptacionDelInforme`
   (`lib/sgsi/informe-valoracion.ts:67`) no tiene el campo y la consulta no lo selecciona.
2. `AccionPlan.fechaAprobacion` existe en el esquema y **la aplicación nunca la escribe**:
   el único lugar que la puebla es la importación del FOR-SIG-13
   (`app/sgsi/acciones/importar-planes.ts:243`). Un plan creado desde la aplicación queda
   con cargo aprobador y sin fecha.
3. `CriterioAceptacion.ratificado` arranca en `false` para las cuatro bandas y **no hay
   ningún camino en la aplicación para marcarlo `true`**: sólo lecturas en todo el
   repositorio.

Este diseño cierra el primero. El segundo y el tercero quedan anotados y fuera de alcance.

ISO/IEC 27001:2022 6.1.3 e) exige conservar información documentada de la aceptación de los
riesgos residuales por sus propietarios. Hoy la organización lo hace, y no queda rastro.

---

## Qué se construye, en una frase

**La aplicación genera el acta de aprobación del riesgo residual, la entrega firmable, y
registra quién la firmó cuando vuelve firmada.** La firma ocurre fuera del sistema.

---

## Alcance

### Qué activos entran

Los activos cuyo **peor riesgo residual** clasifica en **Alto** o **Crítico**.

El colapso de los muchos riesgos de un activo a una sola banda se hace con `peorBanda`
(`lib/sgsi/informe-valoracion.ts:175`) — **la misma función que usa el informe de
valoración, no una copia.** Si esta página y el informe discreparan sobre la banda de un
activo, el acta firmada quedaría sin respaldo documental.

Eso arrastra la regla que esa función ya sostiene: **basta con que un solo riesgo del activo
esté sin calcular para que el activo entero sea «Sin calcular»**, porque el riesgo que falta
puede ser el peor de todos. Un activo así **no se puede aprobar** y no entra al acta.

### Qué no entra, y cómo se ve que no entró

| Caso | Tratamiento |
|---|---|
| Activos «Sin calcular» | Fuera del acta, **contados en su propia tarjeta**. El tablero no puede verse completo cuando no lo está |
| Activos bajo el umbral de valoración | Fuera. No tienen riesgos calculados: no hay pregunta que responder |
| Activos en banda Media o Baja | Fuera de esta versión, por decisión explícita |
| Procesos sin cargo líder o sin persona activa en él | El acta los lista como **«sin firmante resoluble»** con sus activos contados. No se inventa un firmante ni se cae al Líder del SIG por defecto |

### El caso Crítico no es una aceptación

`CriterioAceptacion` para la banda Crítico dice «**No aceptable — mitigar o evitar**»
(`prisma/seeds/escalas.ts:167`). Aprobar un residual crítico no es aceptarlo dentro del
criterio: es pasarle por encima.

El acta los imprime en una sección aparte, rotulada **«Excepciones al criterio de
aceptación»**, y cada renglón exige una justificación escrita. Los de banda Alta van en la
sección normal.

---

## Quién firma

**Los dueños de proceso.** En el esquema, el dueño de un proceso es `Area.liderCargo`
(`prisma/schema.prisma:203`), y la persona firmante es quien tenga ese cargo
(`Persona.cargoId`).

Esto cierra el hueco más grande que tenía la alternativa de usar el propietario del activo:
`Activo.propietarioId` es **nulo para buena parte del inventario** — la migración no podía
inventar propietarios—, mientras que `Activo.areaId` es obligatorio. Todo activo tiene
proceso, luego todo activo tiene firmante.

Reglas de resolución:

- **Un cargo líder con varias personas activas:** todas figuran como firmantes del proceso.
  Basta con que una firme para que el proceso quede cubierto, y el registro dice cuál.
- **Un cargo líder sin persona activa, o un área sin cargo líder:** el proceso aparece como
  «sin firmante resoluble», con sus activos contados aparte. El acta se puede generar igual
  —la ausencia es justamente lo que hay que ver— pero ese proceso nunca queda cubierto.
- **Un activo sin propietario** no afecta a la firma. Sigue impreso en el acta como dato.

### Lo que este diseño deliberadamente NO hace

**No firma electrónicamente.** Hay en el repositorio un mecanismo completo de firma
—`ActaAceptacion`, `PanelFirma`, `lib/sig/asentar-firma.ts`, con huella del documento,
declaración copiada, IP, agente y acta inmutable— y **no se usa acá**, por decisión del
16/09/2026: el acta se firma por fuera, en papel o en sesión.

Queda dicho para que quien lea esto en seis meses sepa que la omisión fue deliberada y no un
descuido. Si mañana se quiere firma electrónica, el camino es `ContenidoSig` con
`exigeFirma = true` más una `Asignacion` por firmante, y **no hay que construir nada de
firma**: ya está hecho y probado.

**No hay eslabón del Comité.** Los criterios de aceptación dicen que Alto lo aprueban «Líder
del SIG y Comité» y Crítico «Comité del SIG». El acta que este diseño produce la firman los
dueños de proceso, que el criterio no nombra. Eso no incumple el criterio —son firmas de
más, no de menos— pero tampoco lo refleja. **Alinear las cuatro filas de
`CriterioAceptacion` con lo que de verdad se hace es trabajo aparte, y conviene hacerlo.**

---

## El acta

Un solo documento por periodo, que **todos los dueños de proceso firman completo** — no cada
uno su sección. Contenido, en orden:

1. **Encabezado.** Periodo, fecha de generación, quién la generó, y el código del acta.
2. **Declaración de lo que se aprueba.** Texto fijo, versionado en código: qué significa
   aprobar un riesgo residual y qué obligación de revisión deja abierta.
3. **Resumen.** Totales por banda, por proceso, y el conteo de activos «Sin calcular» que
   quedaron fuera —dicho en el acta, no sólo en la pantalla.
4. **Activos en banda Alta**, agrupados por proceso: código, nombre, banda, cifra residual y
   el plan de tratamiento citado cuando existe (código, tipo, estado).
5. **Excepciones al criterio · activos en banda Crítica**, con la misma estructura más la
   justificación de cada uno.
6. **Hoja de firmas.** Un renglón por proceso: proceso, cargo líder, nombre de la persona,
   y espacio para firma y fecha. Los procesos «sin firmante resoluble» aparecen con el
   renglón rotulado como tal.
7. **Constancia.** La huella `sha256` del alcance, para que el acta firmada se pueda
   contrastar contra las cifras que decía aprobar.

### Cómo se produce

Tres módulos, y la frontera entre ellos importa:

```
lib/sgsi/acta-residual.ts      función PURA  → HTML (cadena)
lib/pdf.ts                     único módulo que toca puppeteer → bytes
app/sgsi/acciones/acta-residual.ts   'use server' · genera, guarda, registra
```

`acta-residual.ts` es puro y devuelve HTML, igual que `lib/sgsi/informe-documento.ts` y por
las mismas razones que ese archivo documenta: se prueba como cadena, sin levantar un
navegador y sin `react-dom/server`, que la App Router prohíbe en su grafo de módulos.

### El PDF, y lo que cuesta

Decisión: **PDF real con puppeteer**, no HTML impreso por el navegador.

Dos correcciones que no son opinión, verificadas contra el `Dockerfile`:

1. **`puppeteer` a secas no arranca en esta imagen.** El runtime es `node:22-alpine`
   (`Dockerfile:31`) y el Chromium que puppeteer descarga está enlazado contra glibc. La
   forma que funciona es **`puppeteer-core` más el Chromium del sistema**:

   ```dockerfile
   # etapa runner
   RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
   ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
   ENV PUPPETEER_SKIP_DOWNLOAD=true
   ```

   Va en la etapa **runner**, no sólo en la de construcción. Cuesta unos 300 MB de imagen.

2. **Una instancia, una renderización a la vez, timeout duro.** Este servidor ya mató un
   proceso por falta de memoria una vez —la cicatriz de `rowCount` inflado, documentada en
   `HARNESS.md`—. Lanzar un Chromium por petición lo repite.

`--no-sandbox` es necesario porque el contenedor corre como usuario no privilegiado
(`Dockerfile:99`) sin capacidades adicionales. Es aceptable **porque sólo se renderiza HTML
propio**, generado por la propia aplicación, nunca contenido de terceros. Escrito acá para
que quien lo vea en el código no lo tome por descuido.

`output: standalone` traza las importaciones; hay que **verificar en `npm run build` que
`puppeteer-core` quede resuelto en el bundle** y, si no, declararlo en
`serverExternalPackages` de `next.config.js`.

---

## Modelo de datos

Cuatro tablas nuevas. Ninguna migración sobre tablas existentes.

**Sobre los bytes en la misma tabla.** `EvidenciaArchivo` separa los blobs de su metadata a
propósito, «para que los listados de la grilla y del panel nunca arrastren los blobs»
(`prisma/schema.prisma:608`). Acá no se separan, y la razón es que los volúmenes son otros:
un acta por año y un puñado de soportes, contra miles de evidencias. A cambio, la regla se
sostiene en las consultas: **ninguna lectura de listado selecciona la columna de bytes.**
Sólo la ruta de descarga la toca. Si algún día esto crece, separarlas es una migración
mecánica.

### `ActaRiesgoResidual`

Una por periodo. Es el documento generado.

| Campo | Tipo | Nota |
|---|---|---|
| `codigo` | `String @unique` | `ARR-2026-001`. El año va en el código: la numeración se reinicia con él |
| `periodo` | `String` | `2026`. Misma forma que `Asignacion.periodo` |
| `estado` | enum | `EMITIDA` · `APROBADA` · `DESACTUALIZADA` · `VENCIDA` · `ANULADA` |
| `alcanceHash` | `String` | sha256 sobre la lista canónica `código\|banda\|cifra`, ordenada |
| `generadaEn` / `generadaPorId` | | |
| `documentoSha256` | `String` | Huella del PDF emitido |
| `documento` | `Bytes` | El PDF generado. En BD, con el precedente de `EvidenciaArchivo` |

### `ActivoActaResidual`

El detalle **congelado**: un renglón por activo. Existe para poder responder «¿quién aprobó
TEC-SRV-0012, con qué cifra y en qué acta?» con una consulta, sin abrir un JSON.

`actaId`, `activoId`, `codigo`, `nombre`, `proceso`, `banda`, `cifraResidual`,
`planCodigo?`, `planTipo?`, `justificacionExcepcion?`.

Los textos se copian, no se referencian: el acta tiene que seguir diciendo lo que decía
aunque el activo se renombre después. Es la misma doctrina de la regla F2 de
`ActaAceptacion`.

### `FirmanteActaResidual`

Un renglón por proceso del acta.

`actaId`, `areaId`, `proceso`, `cargoId?`, `cargoNombre?`, `resoluble Boolean`, `activos`,
`aprobo Boolean @default(false)`, `firmanteId?`, `fechaFirma?`, `soporteId?`,
`registradoPorId?`, `motivo?`.

**Tres estados, y la pantalla no puede confundir ninguno con otro:**

| Estado | Cómo se guarda | Qué significa |
|---|---|---|
| Sin firmante resoluble | `resoluble = false` | El área no tiene cargo líder, o el cargo no tiene persona activa. Es deuda del catálogo de cargos, y no se arregla insistiéndole a nadie |
| Pendiente de firma | `resoluble = true`, `aprobo = false` | Hay a quién buscar, y no ha firmado |
| Firmada | `aprobo = true`, con `firmanteId` | Firmó esa persona, en papel, y `registradoPorId` dice quién lo asentó |

`firmanteId` es **quién firmó el papel**, elegido entre las personas del cargo; `registradoPorId`
es **quién lo asentó en el sistema**, que casi nunca es la misma. Separarlos es lo que impide
que la aplicación afirme que alguien actuó dentro de ella cuando firmó fuera.

### `SoporteActaResidual`

El acta firmada que vuelve escaneada. Uno a muchos con el acta: una aprobación puede
recogerse en dos sesiones.

`actaId`, `bytes`, `mime`, `sha256`, `nombreOriginal`, `cargadoPorId`, `cargadoEn`, `motivo`.

Validación **idéntica a la de anexos**, reutilizando `lib/sgsi/anexo-archivo.ts`: lista
blanca de extensiones, **MIME verificado por contenido y no por extensión**, rechazo de
macros y ejecutables, límite de tamaño y antivirus. No se reescribe: se importa.

---

## Estados, caducidad y vigencia

```
generar ──> EMITIDA ──registrar todas las firmas──> APROBADA
               │                                        │
               └──────cambian las cifras────────────────┴──> DESACTUALIZADA
               └──────vence el periodo──────────────────┴──> VENCIDA
               └──────anular con motivo─────────────────┴──> ANULADA
```

No hay estado borrador: generar es emitir. Un acta a medio hacer que se puede editar no
congela nada, y lo que este documento tiene que congelar son las cifras que alguien firmó.

- **`DESACTUALIZADA`** se calcula **al leer, nunca precocinado**: se recalcula el
  `alcanceHash` del momento y se compara con el que el acta congeló. Si difieren, el acta
  afirma cifras que ya no son las vigentes y hay que emitir una nueva. El acta anterior
  **nunca se toca**: nace una nueva y la anterior se conserva.
- **`VENCIDA`** cuando `generadaEn + vigencia < hoy`. La vigencia es un `Parametro`:
  `vigencia_acta_residual_meses`, por defecto `12`.
- Una firma registrada **no se puede retirar**. Si se registró por error, se anula el acta
  entera con motivo y se emite otra. Corregir una firma en su sitio es reescribir evidencia.

---

## Pantalla

**`/sgsi/riesgo-residual`**, permiso `sgsi:ver`. Escribir exige `sgsi:escribir`.

No hay pantalla en Mi SIG: al firmarse por fuera, no hay nada que una persona sin acceso al
SGSI tenga que hacer dentro de la aplicación.

### Tarjetas

| Tarjeta | Qué cuenta |
|---|---|
| Activos por aprobar | Alto + Crítico |
| Críticos | Los de la sección de excepciones |
| Procesos cubiertos | Firmados / total |
| Personas pendientes | Firmantes resueltos que no han firmado |
| Sin calcular | Activos excluidos por eficacia desconocida. **No es un cero** |
| Sin firmante resoluble | Procesos sin persona en el cargo líder |

### Cuerpo

1. **Estado del acta vigente** del periodo: código, fecha, estado, y el aviso de
   desactualización cuando aplica, diciendo **qué cambió** respecto de lo firmado.
2. **Tabla de firmantes:** proceso · cargo · persona · estado · fecha · soporte.
   Con `sgsi:escribir`, cada renglón admite marcar la firma contra un soporte cargado.
3. **Tabla de activos:** código, nombre, proceso, banda, cifra, plan citado. Ordenada por
   banda y cifra descendente: el que más expone, primero.

### Acciones

- **Generar el acta** → produce el PDF, lo congela con su huella y su snapshot, lo deja
  descargable. Regenerar emite una nueva; no sobreescribe.
- **Cargar el acta firmada** → un `SoporteActaResidual`, y en la misma operación se marcan
  las personas que firmaron en él.
- **Descargar**: el acta generada (PDF), cada soporte firmado, y el **registro en Excel**
  —una fila por activo con su banda, su proceso, quién firmó y cuándo— con `exceljs`, que ya
  es dependencia, siguiendo `lib/sgsi/inventario-libro.ts`.

---

## Bitácora

Se registra, con el vocabulario de `lib/sgsi/bitacora.ts`: emisión del acta, carga de cada
soporte (con nombre, tamaño y sha256, como hace `app/api/sgsi/anexo/route.ts`), cada firma
marcada —**diciendo quién la marcó y a nombre de quién**—, la anulación, y cada descarga.

La diferencia entre «yo firmé» y «alguien registró que firmé» tiene que ser legible seis
meses después. Registrar una firma ajena es legítimo acá —la firma real está en el papel—
pero el sistema nunca debe afirmar que la persona actuó dentro de él.

---

## Pruebas

### Regla 1 · el test primero, y visto en rojo

Unitarias puras, sin base de datos:

| Qué prueba | Contra qué |
|---|---|
| Selección del alcance | Alto y Crítico entran; Medio y Bajo no; un activo con un riesgo sin calcular queda fuera **y se cuenta aparte** |
| Resolución de firmantes | Cargo con dos personas; cargo sin persona; área sin cargo líder — los tres estados distinguibles |
| `alcanceHash` | Estable ante el reordenamiento de la lista; cambia si cambia una cifra, una banda o entra un activo |
| Estados | `DESACTUALIZADA` al cambiar una cifra; `VENCIDA` al pasar la vigencia; una firma no se puede retirar |
| HTML del acta | Las excepciones van en su sección; los «sin firmante resoluble» aparecen rotulados; los totales cuadran con el detalle |

`lib/__tests__/use-server.test.ts` cubre la frontera cliente/servidor del nuevo archivo de
acciones sin que haya que tocarlo.

El PDF no se prueba lanzando Chromium en Jest. Se prueba el HTML; que el HTML se convierta
en PDF lo cubre el recorrido manual.

### Regla 3 · el recorrido de punta a punta, y un conflicto declarado

**Los specs de `e2e/` sólo leen**, porque corren contra producción por el túnel SSM. Este
flujo escribe actas y soportes: **no puede ir al runner existente sin romper esa regla.**

Hasta que exista una base sembrada para pruebas, el recorrido se ejecuta a mano y se escribe
en el PR, paso a paso:

```
Recorrido ejecutado (periodo 2026):
  1. Abrir /sgsi/riesgo-residual   -> N activos Alto, M Críticos, K sin calcular
  2. Generar el acta               -> ARR-2026-001, PDF descargable, hoja de firmas con los procesos
  3. Cargar el acta firmada        -> soporte registrado, sha256 visible
  4. Marcar dos firmas             -> los dos procesos quedan cubiertos, el resto sigue pendiente
  5. Cambiar una madurez y volver  -> el acta aparece DESACTUALIZADA diciendo qué cambió
  6. Descargar el registro         -> Excel con una fila por activo y su firmante
```

Levantar una base local sembrada para automatizar esto es la deuda que queda abierta, y es
trabajo aparte de este diseño.

---

## Supuestos, y qué los tumba

1. **Todos los dueños de proceso firman el documento completo**, no cada uno su sección. Si
   se quisiera lo segundo, deja de haber un acta y hay N, una por proceso.
2. **La firma se marca contra un soporte cargado.** No se admite marcar una firma sin el
   papel que la sostiene: sería exactamente el registro que nadie puede auditar.
3. **Una sola acta vigente por periodo.** Regenerar emite una nueva y desplaza a la
   anterior, que se conserva.

## Fuera de alcance, y anotado

- Imprimir el aprobador en la sección 5 del informe de valoración (el hueco 1 de arriba)
  queda **posible** con estas tablas, pero no se hace acá.
- Escribir `AccionPlan.fechaAprobacion` desde la aplicación.
- Ratificar `CriterioAceptacion` desde la aplicación.
- Alinear las cuatro filas de `CriterioAceptacion.aprueba` con los dueños de proceso.
