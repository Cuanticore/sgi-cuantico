# Asignar equipos a las personas — Plan de implementación (REQ-SIG-16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que desde **Equipos de colaboradores** se abra un popup sobre la fila de una persona, se le asigne un equipo del inventario o se cree uno ya asignado, y que la tarjeta **ACTIVOS ASIGNADOS** deje de decir `0` mientras **SIN NINGÚN ACTIVO** deja de decir `36`. Y que el registro diga la verdad sobre de quién es cada equipo: para el equipo personal, que su dueño aceptó los lineamientos; para el equipo usado, que la información del anterior se borró.

**Architecture:** `Activo.personaId` ya existe y **nadie lo escribe**. Este requerimiento abre **un** camino de escritura y no dos: una acción nueva, `asignarCustodioPersona`, en `app/sgsi/acciones/activos.ts`, junto a las otras tres escrituras de `Activo`. Todo lo que **decide** algo —qué subtipos se ofrecen, cuál es la valoración propuesta, cuándo hace falta motivo, cuándo un acta de borrado sirve— vive en un módulo puro con sus pruebas (`lib/sgsi/equipos.ts`), sin Prisma y sin React. Lo que toca Prisma es cableado y se verifica corriendo. La custodia se escribe en **una sola transacción** junto a su bitácora, que sin tabla de historia (D-2) es el único rastro de que el equipo cambió de manos.

**Tech Stack:** Next 16.3.2 (App Router, Server Actions), Prisma 7 + Postgres, jest + ts-jest (`npm test`).

**Requerimiento:** `docs/handoff_sig/asignar-equipo-desde-inventario.md` v1.3 — las reglas se citan como P1…P21, la titularidad como T1…T6, el acta de borrado como B1…B8 y las decisiones como D-1…D-13. **Fuente de verdad superior:** `docs/handoff_sig/decisiones-2026-09-02.md`; si la spec y ese documento chocan, manda ese documento y la spec se corrige del lado de quien especifica.

**Corte en tres fases.** **F1** (Tasks 1–7) es la asignación y el alta con su bitácora: entrega valor sola y es lo que apaga las 36 filas rojas. **F2** (Tasks 8–10) es la titularidad BYOD con la verificación del acta de aceptación. **F3** (Tasks 11–15) es el acta de borrado. F2 y F3 se apilan sobre F1 sin rehacer nada de lo que F1 construyó.

---

## Preparación · antes de la Task 1

```bash
npm install
npx prisma generate      # ← NO es opcional, y hay que repetirlo después de cada migrate dev
npm test
npx tsc --noEmit -p tsconfig.json
npm run lint
```

**`npx prisma generate` primero, o se persiguen fantasmas.** Con el cliente desactualizado, `tsc` reporta errores del tipo «Property 'x' does not exist on type 'PrismaClient'» en archivos que nadie tocó.

**El servicio de Postgres en compose se llama `sgi-postgres`, no `postgres`.** Verificado hoy en `docker-compose.dev.yml:8`. Todo comando de verificación de este plan va así:

```bash
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c '…'
```

**El estado verde del repositorio hay que medirlo al empezar, no copiarlo de otro plan.** Los planes anteriores registran 49 suites / 911 pruebas (08/09) y 58 suites / 1095 pruebas (10/09), y desde entonces entraron SCORM, soportes y la edición de persona. La primera acción de la Task 1 es anotar la cifra real y usarla como línea base; `npm run lint` debe seguir dando **0 errores** y solo las advertencias preexistentes.

> **Aviso de concurrencia.** `app/sgsi/acciones/activos.ts` y `app/components/sgsi/activos/ficha.query.ts` estaban siendo editados por otro trabajo mientras se escribía este plan. **Las líneas que la spec cita ya no coinciden** (ver H1). Todo lo que este plan afirme sobre esos dos archivos debe **verificarse contra el estado del archivo al implementar**, no contra los números de línea de la spec.

---

## Las tres mediciones que el requerimiento pide ANTES de construir

El §8 del encargo pide tres consultas. **No se corrieron** al escribir este plan —la base estaba en uso por otro trabajo— así que quedan escritas aquí, exactas, para correrlas como primer paso de la Task 1. Los tres resultados cambian el plan: el primero decide si la búsqueda del popup necesita paginación, el segundo decide si F1 puede aceptar un alta el primer día, y el tercero decide si F2 se puede construir.

### M1 · Cuántos activos vigentes caen en los subtipos asignables

```sql
SELECT count(*) AS asignables
FROM activo a
JOIN tipo_magerit    t ON t.id = a.tipo_id
JOIN subtipo_magerit s ON s.id = a.subtipo_id
WHERE a.activo = true
  AND (t.codigo || '/' || s.codigo) IN (
    '[HW]/[pc]','[HW]/[mobile]','[HW]/[pda]','[HW]/[peripheral]','[HW]/[print]',
    '[HW]/[scan]','[HW]/[crypto]','[Media]/[usb]','[Media]/[disk]','[Media]/[cd]',
    '[Media]/[dvd]','[Media]/[tape]','[AUX]/[furniture]'
  );
```

Y el reparto completo, que es de donde sale el pie de P8 («Se ofrecen N de M equipos») y la verificación 5:

```sql
SELECT t.codigo || '/' || s.codigo AS par, count(*) AS cuantos
FROM activo a
JOIN tipo_magerit    t ON t.id = a.tipo_id
JOIN subtipo_magerit s ON s.id = a.subtipo_id
WHERE a.activo = true
GROUP BY 1 ORDER BY 2 DESC;
```

**Antes de confiar en el `IN`, hay que comprobar cómo están escritos los códigos en la base.** El esquema los documenta con corchetes (`schema.prisma:324`, `:344`), pero si la carga los guardó sin ellos, el `IN` devuelve 0 y parecería que no hay equipos:

```sql
SELECT codigo FROM tipo_magerit ORDER BY codigo;
SELECT t.codigo, s.codigo FROM subtipo_magerit s JOIN tipo_magerit t ON t.id = s.tipo_id
WHERE s.codigo ILIKE '%mobile%' OR s.codigo ILIKE '%pc%';
```

**Lo que se sabe sin correrla:** el inventario tiene **299 activos vigentes** y la spec estima **≈21** de hardware entregable (§2.2). Con ese orden de magnitud la lista del popup se filtra en el cliente con un `useMemo` y **no** hace falta paginación del servidor. Si M1 devuelve más de ~150, D-1 hay que releerla.

### M2 · Cuántas de las 36 personas activas tienen área y cargo

```sql
SELECT count(*)                                                              AS activas,
       count(*) FILTER (WHERE area_id  IS NOT NULL)                          AS con_area,
       count(*) FILTER (WHERE cargo_id IS NOT NULL)                          AS con_cargo,
       count(*) FILTER (WHERE area_id IS NOT NULL AND cargo_id IS NOT NULL)  AS con_ambos
FROM persona
WHERE activa = true;
```

**Lo que ya se midió y no hay que volver a derivar:** `cargo_id` está en **0 de 36** y `area_id` en **1 de 36**. La consecuencia está en H3 y es lo más importante de este plan: **F1 rechazaría 36 de 36 altas** hasta que esos datos se carguen. La consulta se corre igual, para saber si cambió.

### M3 · Cuántas personas activas firmaron la aceptación de los lineamientos

```sql
-- Primero: ¿existe el contenido? (ver H4 — al escribir este plan, NO existe)
SELECT id, codigo, titulo, exige_firma, activo
FROM contenido_sig
WHERE activo = true AND (titulo ILIKE '%dispositiv%' OR titulo ILIKE '%lineamiento%')
ORDER BY codigo;

-- Después, con el código que la consulta anterior devuelva:
SELECT (SELECT count(*) FROM persona WHERE activa = true)      AS activas,
       count(DISTINCT p.id)                                    AS firmaron
FROM persona p
JOIN acta_aceptacion aa ON aa.persona_id  = p.id
JOIN contenido_sig   c  ON c.id           = aa.contenido_id
WHERE p.activa = true
  AND c.codigo = '<código del ContenidoSig de lineamientos de dispositivos personales>';
```

Si la primera consulta vuelve vacía, M3 **no tiene contra qué comparar** y F2 queda como dice H4. Eso no es un fallo del desarrollo: es una respuesta válida y hay que reportarla.

---

## Preguntas que bloquean, y hay que responder antes de tocar F2 y F3

### Q1 · D-11 · ¿Se aprueba la columna `Activo.esDelColaborador`?

Es la **única migración** del requerimiento y contradice la propiedad «no toca el esquema» que traía la versión 1.2 de la spec. Está marcada para ratificación en §7.

**Verificado a mano, y la spec tiene razón: no se deriva de nada.** `propietarioId` es nullable y está vacío por diseño en la carga (`schema.prisma:683-687` lo dice con esas palabras), así que «sin propietario» no distingue un portátil personal de un servidor. `Proveedor` guarda organizaciones. El subtipo dice qué aparato es, no de quién. No hay convención de nombre que sobreviva a que alguien escriba distinto.

- **Bloquea:** Task 8, Task 10, Task 14 y, por dependencia, los puntos 21, 21b, 22, 22b, 23 y 24 del checklist.
- **Si se rechaza:** F1 y F3 se construyen igual y completos. F2 no se construye. El popup ofrecería el portátil personal de una persona para dárselo a otra, y el SGSI no podría responder cuántos de sus dispositivos de punto final son de terceros — que es la primera pregunta de A.8.1 en teletrabajo.
- **`npx prisma migrate dev` no se corre hasta tener el sí.**

### Q2 · D-4 · ¿La valoración D/I/C es obligatoria en el alta desde el popup?

Es más estricto que `crearActivo`, que hoy la acepta ausente (`ActivoNuevo.valores?`, y el mensaje «Sin valoración todavía no alcanza el umbral, así que no tiene riesgos» es una salida legítima de la acción, no un error).

- **Bloquea:** el criterio de rechazo de la Task 5, y los puntos 20 y 20b del checklist.
- **Si se relaja:** hace falta una lista y un conteo de «equipos creados sin valorar» en la pantalla de Equipos, o el hueco queda invisible. Eso es una tarea más, no menos.
- **La propuesta de este plan es sostener D-4**, porque la corrida de arranque produce 36 activos de una sentada y nadie vuelve después a valorarlos uno por uno. Con `2/2/4` el `max(D,I,C)` da exactamente `umbral_valoracion` (4, `ficha.query.ts` línea del parámetro), y el equipo entra al análisis; con `2/2/3` los 36 portátiles quedan fuera de las matrices.

### Q3 · ¿Cuál es el `ContenidoSig` de los lineamientos de dispositivos personales?

Es el valor del parámetro `contenido_lineamientos_dispositivos` (§4.3) y es contra lo que T3 verifica la aceptación.

- **Al escribir este plan ese contenido no existe en la base, y ningún requerimiento de la cola lo crea** (H4).
- **Bloquea:** Task 9 entera y los puntos 21 y 21b del checklist.
- **No se inventa un código.** Sin el contenido, el parámetro apuntaría a algo inexistente y la verificación T3 caería siempre en la rama «parámetro mal configurado» (21b), que es la conducta correcta pero deja el caso BYOD —la mayoría del parque— sin poder registrarse.

---

## Hallazgos previos · dónde la spec no coincide con el código

Anotados y **no corregidos por cuenta propia**, según el punto 9 del encargo.

**H1 · Las líneas que la spec cita ya no coinciden con el archivo.** `app/sgsi/acciones/activos.ts` creció desde que se escribió la v1.3: `DatosGenerales` está en `:101-123` (la spec dice 95-115), `ActivoNuevo` en `:222-241` (dice 212-231), `crearActivo` en `:248` (dice 212), el `create` en `:312-330` (dice 302-320), `darDeBajaActivo` en `:367` (dice 357) y `revalidarSgsi` en `:447-458` (dice 417-428). El archivo además ganó `abrirOverlayActivo` (REQ-SIG-20) y `DatosGenerales` ganó `criticidadId`. **Nada de esto cambia el requerimiento** —las funciones son las mismas y hacen lo mismo— pero cualquier tarea que diga «en la línea N» se debe releer contra el archivo del día. El archivo estaba **en edición concurrente** mientras se escribía este plan.

**H2 · El custodio cargo es obligatorio en el TIPO, no en la validación.** La spec dice que `crearActivo` exige custodio cargo. En el código, `ActivoNuevo.custodioId` es `number` (no opcional, así que TypeScript lo exige a quien llame) pero la validación en tiempo de ejecución es `idOpcional(datos.custodioId, 'el custodio')` (`activos.ts:263`) y `Activo.custodioId` es `Int?` en el esquema (`schema.prisma:688`). **Es obligatorio de hecho para cualquier llamador tipado, y opcional para la base.** Al implementar hay que decidir cuál de las dos es la verdad y decirlo; este plan asume la del tipo —el alta pide custodio cargo— porque es lo que la spec describe y lo que la pantalla necesita para P10.

**H3 · Con los datos de hoy, F1 rechaza 36 de 36 altas.** `Persona.cargoId` está en **0 de 36** y `areaId` en **1 de 36**. P10 es explícito en que **no se inventa el área ni el cargo** —el prefijo del área forma un código inmutable— así que el alta rápida se va a rechazar para 35 o 36 personas hasta que REQ-SIG-15 cargue esos datos. **Esto no es un defecto de la implementación y hay que decirlo antes de probar, no al probar.** El plan lo trata así: la Task 5 construye el rechazo con su frase y su enlace (verificación 11), y la Task 7 hace visible el faltante; **la carga de área y cargo para las 36 personas es una tarea de datos que va antes del primer uso real y no depende del desarrollo.**

**H4 · El `ContenidoSig` de los lineamientos de dispositivos personales no existe — y hoy NINGÚN contenido exige firma.** Los 22 `ContenidoSig` se siembran desde Excel en `prisma/seeds/obligaciones.ts` (la columna `EXIGE_FIRMA` se lee en `:202` y se escribe en `:437`), y **ese libro no trae una sola fila con `EXIGE_FIRMA` en verdadero**, ni ninguna de lineamientos del puesto remoto o de dispositivos personales. Tampoco hay un `INSERT INTO contenido_sig` en ninguna migración. Lo más cercano que existe es un **paso de ciclo**, no un contenido: `VIN-SEG-5 · Lineamientos del puesto de trabajo remoto` (`prisma/migrations/20260903200000_ciclos_colaborador/migration.sql:78`), y «dispositivos personales» aparece solo como texto de justificación del SoA (`prisma/data/soa.json:70` y `:308`, controles A.5.10 y A.6.7).

La consecuencia va más allá de este requerimiento: el conjunto de compromisos exigidos que la aplicación deriva de `contenidoSig where exigeFirma` está **vacío**, así que la anomalía `ACCESOS_SIN_FIRMAR` (`lib/sig/colaboradores.ts:148-160`) hoy no señala a nadie. El comentario de `app/sig/colaboradores/page.tsx:69-71` ya lo dice: «Mientras ninguno esté marcado, el conjunto queda VACÍO y no nulo».

**Consecuencia para este plan: F2 no se puede construir completa.** Se puede construir la columna (Q1) y el bloqueo de reasignación (T5), pero la verificación de la aceptación (T3, D-12) queda con su rama de «parámetro mal configurado» ejercitada y **la rama feliz sin un solo dato**. Es una respuesta válida al encargo, no un bloqueo del desarrollo.

**H5b · La spec no dice si vale un acta de una versión anterior del contenido.** `ActaAceptacion` congela `contenidoVersion` y `versionContenidoId` (`schema.prisma:2740-2745`), y **no hay índice único sobre `(personaId, contenidoId)`**: una persona puede tener varias actas del mismo contenido, porque F4 dice que el acta es inmutable y una nueva firma nace como acta nueva (`prisma/migrations/20260903180000_acta_aceptacion/migration.sql:29-35`). T3 dice «consulta si esa persona ya la firmó» sin decir **de qué versión**. Las dos lecturas son defendibles —cualquier acta, o solo la de la versión vigente— y cambian a quién bloquea el popup el día que los lineamientos se reediten. **Se anota, no se resuelve aquí.** La propuesta de este plan, si nadie decide: la más reciente, sin exigir versión vigente, porque D-6 fija que «el versionado no invalida» y exigir la versión vigente contradiría esa decisión del documento que manda.

**H5 · `ActaBorradoSeguro` sigue sin un solo camino de escritura, y `ActaBorrado.tsx` no existe.** Confirmado: el único uso en `app/` es el conteo de anomalías de `app/sig/estado/page.tsx:97`, que lee `personaId` para saber quién salió sin acta. En `app/components/sgsi/` no hay ningún `ActaBorrado.tsx`. F3 es, literalmente, el primer camino de la aplicación para cerrar A.8.10.

**H6 · La carga del consolidado BORRA los vínculos del acta de borrado y toda la custodia.** `lib/sgsi/consolidado-carga.ts:366` ejecuta `tx.actaBorradoActivo.deleteMany({})` y `:373` ejecuta `tx.activo.deleteMany({})` antes de escribir el plan de carga, porque V19 **sustituye** el inventario. Es correcto para lo que ese importador hace, y tiene una consecuencia que este requerimiento no puede ignorar: **si alguien vuelve a correr la carga del consolidado después de la corrida de arranque, las 36 asignaciones de custodia y los vínculos acta↔activo se pierden**, y lo único que queda es la bitácora. La bitácora, además, guarda el **código** del activo, no su id, así que sobrevive a la recarga y es reconstruible a mano — que es un argumento más para P14 (nombres y códigos, no ids). **No se resuelve en este requerimiento**: se anota, y la regla de trabajo es que la corrida de arranque va **después** de la última carga del consolidado.

**H7 · `revalidarSgsi` no revalida la pantalla de Equipos.** Hoy revalida seis rutas (`activos.ts:447-458`) y ninguna es `/tecnologia/equipos`. Sin agregarla, la tarjeta ACTIVOS ASIGNADOS y el renglón naranja siguen mostrando el número anterior después de asignar, y quien asigna lo intenta otra vez. Es P18 y es una línea.

**H8 · La pantalla de Equipos no tiene ningún renglón para personas inactivas.** `page.tsx:24-25` trae solo `activa: true` y `page.tsx:46` cuenta solo `personaId: null`. Un equipo asignado a alguien que salió queda **invisible en las dos direcciones**. P21 lo pide y no existe hoy: es trabajo nuevo, no un ajuste.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/sgsi/equipos.ts` **(crear)** | **Puro.** El par tipo/subtipo, la valoración por defecto, cuándo hace falta motivo, el pie de la lista, el nombre repetido, la siguiente persona sin equipo, la herencia del alta anterior. Sin Prisma, sin React: es lo que se prueba en jest |
| `lib/sgsi/__tests__/equipos.test.ts` **(crear)** | Pruebas del módulo puro de F1 |
| `lib/sgsi/borrado.ts` **(crear, F3)** | **Puro.** Qué acta sirve para qué asignación (B3), qué propone el sistema sobre nuevo/usado (B1), qué métodos ofrece según la titularidad (B8) |
| `lib/sgsi/__tests__/borrado.test.ts` **(crear, F3)** | Pruebas del módulo puro de F3 |
| `app/sgsi/acciones/activos.ts` **(modificar)** | `asignarCustodioPersona` nueva; `ActivoNuevo` suma `personaId` y (F2) `esDelColaborador`; `revalidarSgsi` suma `/tecnologia/equipos`. **Archivo en edición concurrente: releer antes de tocar** |
| `app/tecnologia/equipos/page.tsx` **(modificar)** | Las consultas que alimentan el popup y los dos renglones nuevos (P20, P21, B5) |
| `app/tecnologia/equipos/Equipos.client.tsx` **(modificar)** | El `Link` pasa a ser `button`; la píldora del activo gana su `×` (P17); los renglones nuevos |
| `app/tecnologia/equipos/PopupEquipo.tsx` **(crear)** | El popup de 760 px, dos mitades del mismo tamaño |
| `app/components/sgsi/ActaBorrado.tsx` **(crear, F3)** | El formulario del acta, **fuera** del popup, para que REQ-SIG-09 use el mismo (B6) |
| `prisma/schema.prisma` **(modificar, F2)** | Una sola columna: `Activo.esDelColaborador` (T6, D-11). **Bloqueada por Q1** |
| `prisma/migrations/<ts>_equipos_parametros/migration.sql` **(crear)** | Las tres filas de `Parametro` y (F2) la quinta de `MetodoBorrado` |
| `lib/sgsi/permisos.ts` | **No se toca.** `tecnologia:escribir` ya existe y ya es el permiso del módulo |

---

# F1 · La asignación y el alta

## Task 1: La línea base y las tres mediciones

**Files:** ninguno — es medición, no código.

- [ ] **Step 1: Anotar el estado verde real**

```bash
npm install && npx prisma generate
npm test 2>&1 | tail -5
npx tsc --noEmit -p tsconfig.json
npm run lint
```

Expected: `npm test` en verde; `tsc` **0 errores**; `lint` **0 errores** y solo las advertencias preexistentes. **Anotar las cifras exactas de suites y pruebas**: es contra ellas que se lee «sin regresiones» en el resto del plan.

- [ ] **Step 2: Correr M1, M2 y M3** (los SQL están arriba, en «Las tres mediciones»)

```bash
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -f /dev/stdin <<'SQL'
-- pegar aquí M1, M2 y M3
SQL
```

Expected: tres números anotados. **Si M2 devuelve `con_ambos = 0`, H3 se confirma y hay que decirlo en el reporte antes de seguir**, porque significa que la Task 5 va a rechazar todas las altas hasta que los datos existan.

- [ ] **Step 3: Confirmar que el campo sigue sin camino de escritura**

```bash
rg -c "personaId" app/sgsi/acciones/activos.ts
```

Expected: `0` (o «no matches»). Si ya no da 0, alguien más abrió el camino y este plan hay que releerlo entero.

- [ ] **Step 4: Formular Q1, Q2 y Q3 y esperar respuesta.** F1 no depende de ninguna de las tres: las Tasks 2 a 7 se pueden ejecutar con cualquier respuesta.

---

## Task 2: El módulo puro de decisiones

**Files:**
- Create: `lib/sgsi/equipos.ts`
- Test: `lib/sgsi/__tests__/equipos.test.ts`

Todo lo que este requerimiento **decide** vive aquí, sin base de datos. Es lo que hace comprobable el par tipo/subtipo (verificación 4), la valoración que cae del lado correcto del umbral (verificación 20) y el pie que cuadra con la consulta (verificación 5).

- [ ] **Step 1: Escribir la prueba que falla**

Crear `lib/sgsi/__tests__/equipos.test.ts` con, como mínimo, estos bloques:

```ts
import {
  VALORACION_POR_DEFECTO,
  alcanzaUmbral,
  esAsignable,
  exigeMotivo,
  heredarDelAltaAnterior,
  nombreYaUsado,
  parsearSubtiposAsignables,
  parsearValoracion,
  resumenDeLaLista,
  siguienteSinEquipo,
} from '../equipos';

describe('parsearSubtiposAsignables', () => {
  it('lee pares tipo/subtipo separados por coma', () => {
    expect(parsearSubtiposAsignables('[HW]/[pc], [Media]/[usb]')).toEqual([
      { tipo: '[HW]', subtipo: '[pc]' },
      { tipo: '[Media]', subtipo: '[usb]' },
    ]);
  });

  // P3 · una entrada sin barra no es un par y NO se puede interpretar como subtipo suelto:
  // eso es exactamente el defecto que el par vino a impedir.
  it('rechaza una entrada sin par completo en vez de adivinar', () => {
    expect(() => parsearSubtiposAsignables('[pc]')).toThrow(/tipo\/subtipo/);
  });

  it('el parámetro vacío no es una lista vacía silenciosa', () => {
    expect(() => parsearSubtiposAsignables('')).toThrow(/equipos_subtipos_asignables/);
  });
});

describe('esAsignable', () => {
  const lista = parsearSubtiposAsignables('[HW]/[pc], [HW]/[mobile], [Media]/[usb]');

  it('acepta el par que está en la lista', () => {
    expect(esAsignable({ tipo: '[HW]', subtipo: '[mobile]' }, lista)).toBe(true);
  });

  // Verificación 4 · `[mobile]` existe en [HW] (un portátil) y en [COM] (la red celular).
  // Filtrar por el subtipo suelto metería una red de comunicaciones en la lista de equipos.
  it('el mismo subtipo bajo otro tipo NO es asignable', () => {
    expect(esAsignable({ tipo: '[COM]', subtipo: '[mobile]' }, lista)).toBe(false);
  });
});

describe('la valoración por defecto', () => {
  it('lee 2/2/4 del parámetro', () => {
    expect(parsearValoracion('2/2/4')).toEqual({ D: 2, I: 2, C: 4 });
  });

  // P11 · verificación 20. El 4 no es decorativo: es lo que hace que el equipo EXISTA para
  // el sistema. max(2,2,4) = 4 = umbral_valoracion, así que entra al análisis.
  it('la propuesta cae exactamente sobre el umbral', () => {
    expect(alcanzaUmbral(VALORACION_POR_DEFECTO, 4)).toBe(true);
  });

  it('y con C en 3 ya no entra — es la línea que el default pisa a propósito', () => {
    expect(alcanzaUmbral({ D: 2, I: 2, C: 3 }, 4)).toBe(false);
  });

  it('un parámetro mal escrito no se degrada a un default silencioso', () => {
    expect(() => parsearValoracion('2-2-4')).toThrow(/equipos_valoracion_por_defecto/);
  });
});

describe('exigeMotivo', () => {
  // P5 · sin tabla de historia (D-2), la fila de bitácora es TODO lo que va a quedar de esa
  // entrega. Un motivo vacío no se puede reconstruir después.
  it('reasignar un equipo que ya tenía dueño exige motivo', () => {
    expect(exigeMotivo({ anterior: 12, nuevo: 27 })).toBe(true);
  });

  // P17 · liberar es cambiar de manos a nadie, y también queda solo en la bitácora.
  it('liberar exige motivo', () => {
    expect(exigeMotivo({ anterior: 12, nuevo: null })).toBe(true);
  });

  it('asignar un equipo libre no lo exige', () => {
    expect(exigeMotivo({ anterior: null, nuevo: 27 })).toBe(false);
  });

  it('un motivo de menos de 10 caracteres no cuenta como motivo', () => {
    expect(exigeMotivo({ anterior: 12, nuevo: 27, motivo: 'se dañó' })).toBe(true);
    expect(exigeMotivo({ anterior: 12, nuevo: 27, motivo: 'reemplazo por daño de pantalla' })).toBe(false);
  });
});

describe('resumenDeLaLista', () => {
  // P8 · verificación 5. Una lista corta sin explicación se lee como una lista rota.
  it('dice cuántos se ofrecen de cuántos y por qué', () => {
    expect(resumenDeLaLista({ ofrecidos: 3, vigentes: 21 })).toMatch(/Se ofrecen 3 de 21 equipos/);
  });

  it('con todos ofrecidos no inventa una exclusión', () => {
    expect(resumenDeLaLista({ ofrecidos: 21, vigentes: 21 })).not.toMatch(/El resto/);
  });
});

describe('nombreYaUsado', () => {
  // P12d · H-14 de REQ-SIG-12 ya trae pares repetidos. Es aviso, no bloqueo.
  it('encuentra el activo vigente que ya se llama así, sin importar mayúsculas ni espacios', () => {
    const vigentes = [{ codigo: 'TEC-EQU-0007', nombre: 'Portátil Dell Latitude 5440' }];
    expect(nombreYaUsado('  portátil dell latitude 5440 ', vigentes)?.codigo).toBe('TEC-EQU-0007');
  });

  it('propone la forma que sí distingue', () => {
    expect(nombreYaUsado('Portátil', [{ codigo: 'X', nombre: 'Portátil' }])?.sugerencia)
      .toMatch(/S\/N/);
  });
});

describe('siguienteSinEquipo', () => {
  const personas = [
    { id: 1, nombre: 'Ana',    activos: 0 },
    { id: 2, nombre: 'Bruno',  activos: 1 },
    { id: 3, nombre: 'Carlos', activos: 0 },
  ];

  // P12c · avanza en el orden de la pantalla (nombre asc) y respeta el filtro activo.
  it('salta a la siguiente persona sin ningún activo', () => {
    expect(siguienteSinEquipo(personas, 1)?.id).toBe(3);
  });

  it('cuando no quedan, lo dice en vez de reabrirse sobre la misma', () => {
    expect(siguienteSinEquipo(personas, 3)).toBeNull();
  });

  it('cuenta cuántas quedan, que es lo que el pie muestra', () => {
    expect(personas.filter((p) => p.activos === 0).length).toBe(2);
  });
});

describe('heredarDelAltaAnterior', () => {
  // P12b · el único campo que siempre nace vacío es el nombre, porque es el único que de
  // verdad cambia entre un portátil y el siguiente.
  it('hereda tipo, subtipo, área, custodio y valoración, y nunca el nombre', () => {
    const previa = { nombre: 'Portátil Dell', tipoId: 3, subtipoId: 9, areaId: 7, custodioId: 4, valores: { D: 2, I: 2, C: 4 } };
    const siguiente = heredarDelAltaAnterior(previa, { areaDeLaPersona: null, cargoDeLaPersona: null });
    expect(siguiente.nombre).toBe('');
    expect(siguiente).toMatchObject({ tipoId: 3, subtipoId: 9, areaId: 7, custodioId: 4 });
  });

  // P10 gana sobre P12b: lo recordado se aplica SOLO donde no hay nada mejor que proponer.
  it('el área de la persona gana sobre la heredada cuando la persona tiene área', () => {
    const previa = { nombre: 'x', tipoId: 3, subtipoId: 9, areaId: 7, custodioId: 4, valores: { D: 2, I: 2, C: 4 } };
    expect(heredarDelAltaAnterior(previa, { areaDeLaPersona: 2, cargoDeLaPersona: 5 })).toMatchObject({ areaId: 2, custodioId: 5 });
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npm test -- equipos`
Expected: FAIL — `Cannot find module '../equipos'`

- [ ] **Step 3: Escribir `lib/sgsi/equipos.ts`** hasta que las pruebas pasen. Sin `import { prisma }`, sin `react`: si el módulo necesita cualquiera de los dos, la decisión está en el lugar equivocado.

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `npm test -- equipos && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, y `tsc` sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add lib/sgsi/equipos.ts lib/sgsi/__tests__/equipos.test.ts
git commit -m "feat(sig): las decisiones de asignar un equipo, puras y probadas"
```

**Cierra del checklist §8:** parte de **4** (par tipo/subtipo), **5** (el pie cuadra) y **20** (la valoración cae del lado correcto del umbral). Los tres se terminan de cerrar contra la base en las tareas siguientes.

---

## Task 3: Los tres parámetros, en `Parametro` y no en el fuente

**Files:**
- Create: `prisma/migrations/<timestamp>_equipos_parametros/migration.sql`

Los tres son filas editables sin desplegar, por la misma razón que REQ-SIG-15 argumentó para los nombres de las licencias: agregar un subtipo entregable tiene que ser una fila, no un despliegue.

- [ ] **Step 1: La comprobación que tiene que fallar primero**

```bash
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c \
"select clave, valor from parametro where clave like 'equipos_%' or clave = 'contenido_lineamientos_dispositivos';"
```

Expected: **0 filas.**

- [ ] **Step 2: Escribir la migración**

```sql
-- REQ-SIG-16 §4.3 · los tres parámetros del popup de equipos.
--
-- El par `tipo/subtipo` y NO el subtipo suelto: `[mobile]` existe en `[HW]` (un portátil) y
-- en `[COM]` (la red celular), y filtrar por el código a secas metería una red de
-- comunicaciones en la lista de equipos entregables (P3, verificación 4).
INSERT INTO parametro (clave, valor, descripcion, actualizado) VALUES
  ('equipos_subtipos_asignables',
   '[HW]/[pc],[HW]/[mobile],[HW]/[pda],[HW]/[peripheral],[HW]/[print],[HW]/[scan],[HW]/[crypto],[Media]/[usb],[Media]/[disk],[Media]/[cd],[Media]/[dvd],[Media]/[tape],[AUX]/[furniture]',
   'REQ-SIG-16 P3 · pares tipo/subtipo que se ofrecen como equipo entregable a una persona.',
   now()),
  -- P11 · max(2,2,4) = 4 = umbral_valoracion. Con 2/2/3 el equipo NO entra al análisis.
  ('equipos_valoracion_por_defecto', '2/2/4',
   'REQ-SIG-16 P11 · valoración D/I/C propuesta al crear un equipo desde el popup.',
   now())
ON CONFLICT (clave) DO NOTHING;
```

> **`contenido_lineamientos_dispositivos` NO se siembra aquí.** Sembrarlo con un código inventado haría que T3 verificara contra un contenido que no existe y dejaría al SGSI afirmando que nadie firmó. Va en la Task 9, **bloqueada por Q3** (H4).

- [ ] **Step 3: Aplicarla y verificar**

```bash
npm run db:up && npx prisma migrate dev --name equipos_parametros && npx prisma generate
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c \
"select clave, valor from parametro where clave like 'equipos_%' order by clave;"
```

Expected: **2 filas**, con los valores de arriba.

- [ ] **Step 4: Comprobar que el filtro cuadra con la base** (verificación 5, la mitad de datos)

Correr M1 de nuevo con los pares del parámetro recién sembrado. Expected: el número de `asignables` y el de `vigentes` son los dos que el pie de la lista va a imprimir.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations
git commit -m "feat(sig): los parametros de subtipos asignables y valoracion por defecto"
```

**Cierra del checklist §8:** **20b** (el default sale de un parámetro; se comprueba cambiándolo a `3/3/5` en la Task 5).

---

## Task 4: La acción de servidor — un campo, un camino

**Files:**
- Modify: `app/sgsi/acciones/activos.ts` — **releer el archivo completo antes de tocarlo (H1)**

Es la única escritura de `Activo.personaId` en toda la aplicación (D-5). No nace un `app/tecnologia/acciones/`: no existe, y este campo es de `Activo`, cuyo módulo de acciones es el del SGSI.

- [ ] **Step 1: La comprobación que tiene que fallar primero**

Antes de escribir nada, con `npm run dev` levantado, llamar la acción desde una consola de servidor o una ruta de prueba temporal — **no** desde la pantalla:

```bash
rg -n "asignarCustodioPersona" app/sgsi/acciones/activos.ts
```

Expected: **sin resultados.** Es el estado de partida y es lo que la verificación 18 va a volver a ejercitar al final de F3.

- [ ] **Step 2: Escribir la acción**

```ts
export async function asignarCustodioPersona(
  codigoActivo: string,
  personaId: number | null,   // null = liberar (P17)
  motivo?: string,            // obligatorio si el activo ya tenía custodio (P5)
): Promise<Resultado>
```

Y dentro, en este orden:

1. `const autor = await autorConPermiso('tecnologia:escribir');` — **P13.** Es el único permiso del archivo que no es `sgsi:escribir` ni `activo:valorar`, y es deliberado: quien administra los equipos de la gente no es necesariamente quien valora activos de información. Hoy los tres los tiene el mismo grupo, así que no cambia nada en la práctica.
2. Envolver todo en `ejecutar(...)`, como las otras cuatro acciones del archivo. El popup **no** llama a Prisma.
3. **Validaciones, y cada una con su frase** (P15). Ninguna devuelve «no se pudo asignar»:
   - el activo existe y está **vigente**;
   - la persona existe y está **activa** (si `personaId !== null`);
   - hay **motivo de al menos 10 caracteres** si el activo ya tenía custodio o si se está liberando — usando `exigeMotivo` del módulo puro;
   - el subtipo está en `equipos_subtipos_asignables` **o** quien asigna confirmó el aviso (P16): fuera de la lista **se puede**, pero la acción lo registra en el motivo y el popup lo dijo antes.
4. **Una sola `$transaction`**, siguiendo el patrón que ya usan `guardarDatosGenerales` (`activos.ts:146-197`) y `darDeBajaActivo` (`activos.ts:377-386`):
   - `tx.activo.update({ where: { id }, data: { personaId } })` — **y ningún otro campo.** Nombre, descripción, área, tipo, valoración, propietario y ubicación no se tocan (P6, D-5);
   - `registrar(tx, autor, [{ tabla: 'activo', registroId: activo.codigo, campo: 'custodio persona', anterior: <NOMBRE de la persona anterior o null>, nuevo: <NOMBRE de la persona nueva o null>, motivo }])`.
5. Fuera de la transacción: `revalidarSgsi()`.

> **La fila 4 es la que sostiene todo el requerimiento.** `registrar` ya escribe `(vacío)` cuando el valor es nulo (`bitacora.ts:42-47`), así que liberar queda legible. Lo que **no** hace por sí solo es convertir un id en un nombre: **la acción tiene que cargar los nombres antes de escribir la fila.** Una fila que diga «12 → 27» no la lee nadie, y dentro de un año nadie sabrá quiénes eran 12 y 27. Sin tabla de historia (D-2), **esa fila es el único registro de que el equipo cambió de manos**, y además es la entrada del control de B1 en F3.

- [ ] **Step 3: `revalidarSgsi` suma la ruta de esta pantalla** (P18, H7)

En `activos.ts:447-458`, agregar `'/tecnologia/equipos'` al arreglo. **En la función que ya existe, no con un `revalidatePath` suelto en la acción nueva:** la lista de rutas del SGSI vive en un solo lugar y así se queda.

- [ ] **Step 4: Verificar contra la base, sin pasar por la pantalla**

```bash
npx tsc --noEmit -p tsconfig.json && npm run lint && npm test
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c \
"select tabla, registro_id, campo, valor_anterior, valor_nuevo, motivo, usuario
 from bitacora where campo = 'custodio persona' order by id desc limit 5;"
```

Expected después de asignar un activo desde el popup de la Task 5: una fila con `campo = 'custodio persona'`, `registro_id` = el **código** del activo, y `valor_anterior` / `valor_nuevo` con **nombres de persona**, nunca números. Es la verificación 6.

- [ ] **Step 5: Commit**

```bash
git add app/sgsi/acciones/activos.ts
git commit -m "feat(sig): la custodia persona se escribe en un solo lugar y con su bitacora"
```

**Cierra del checklist §8:** **1** (el camino de escritura existe), **2** (el contador inverso se mueve), **6** (reasignar exige motivo y la bitácora usa nombres), **7** (sin columna nueva), **14** (liberar), **15** (la ficha no lo edita — se comprueba buscando el campo en `FichaActivo.tsx` y confirmando que no está).

---

## Task 5: `crearActivo` extendida con un campo, y el popup

**Files:**
- Modify: `app/sgsi/acciones/activos.ts` (`ActivoNuevo` y su `create`)
- Create: `app/tecnologia/equipos/PopupEquipo.tsx`
- Modify: `app/tecnologia/equipos/Equipos.client.tsx`
- Modify: `app/tecnologia/equipos/page.tsx`

- [ ] **Step 1: La comprobación que tiene que fallar primero**

Crear un activo desde el popup **antes** de extender `crearActivo` deja el activo sin dueño:

```bash
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c \
"select codigo, persona_id from activo order by id desc limit 1;"
```

Expected al empezar: `persona_id` en `NULL`. Al terminar la tarea: el código nuevo con su `persona_id` puesto, **en una sola operación**. No debe existir un instante en que el activo exista sin dueño (verificación 9).

- [ ] **Step 2: Un campo en `ActivoNuevo`, y nada más** (P12)

`ActivoNuevo` (`activos.ts:222-241`) suma `personaId?: number | null`, y el `create` (`activos.ts:312-330`) lo pasa. **Todo lo demás queda exactamente como está**: el `ContadorCodigo` atómico, el código `AAA-TTT-NNNN` inmutable, la valoración inicial, `registrarAlta` y `generarRiesgos`. Una segunda ruta de alta sería una segunda forma de emitir códigos, y los códigos son irrepetibles por diseño.

> **`DatosGenerales` NO lo suma** (§4.2, D-5). La custodia no se edita en la ficha del activo: se asigna en el popup, que es el único camino y el único que escribe la bitácora con su motivo.

- [ ] **Step 3: El popup, 760 px, dos mitades del mismo tamaño** (P2)

Usa `app/components/sgsi/Popup.tsx` tal cual: ya resuelve overlay, Escape, foco de vuelta al que lo abrió y cuerpo con scroll a 61vh. **No se reimplementa la cáscara.**

- **DEL INVENTARIO**: buscador por código o nombre, interruptor **«solo disponibles» marcado** (P4), filas del subtipo asignable con `personaId = null`. Desmarcado trae también las que están en manos de alguien, **con el nombre de quien las tiene en la propia fila** — no se ocultan (P4). Cada fila enlaza a `/sgsi/inventario/[codigo]` para todo lo demás (P6).
- **¿NO ESTÁ EN LA LISTA?**: el alta rápida, con el mismo peso visual. Con ~21 equipos para 36 personas, la creación **es el caso normal** (§2.2): un enlace pequeño al pie cobraría 30 clics por una decisión de diseño.
- El pie de la lista imprime `resumenDeLaLista(...)` del módulo puro (P8).
- **P9 · el vacío no es un `PopupVacio`**: si la lista filtrada vuelve sin filas, el popup muestra «El inventario no tiene equipos disponibles. Créelo aquí y queda asignado a …» y el **formulario de alta desplegado**, no plegado.
- **P7 · `cantidad > 1` avisa y pide confirmación explícita**, no se rechaza: hay agrupaciones legítimas y el sistema no puede distinguirlas; lo que no puede es que alguien registre veinte portátiles en unas manos sin enterarse.
- **P1 · sin `tecnologia:escribir` el botón no se dibuja.** La pantalla sigue visible con `tecnologia:ver`, porque «a quién le falta equipo» también la responde quien no asigna. Un botón que existe y devuelve «no autorizado» se lee como que la aplicación está rota.

- [ ] **Step 4: El alta rápida, seis campos y ninguno inventado** (P10, P11)

Área y custodio cargo se **proponen desde la persona** y se dice en voz alta: «tomados de la ficha de …». Valoración propuesta desde `equipos_valoracion_por_defecto`.

> **H3 se hace visible aquí.** Con `cargo_id` en 0 de 36 y `area_id` en 1 de 36, esos dos campos van a quedar **vacíos y obligatorios** en 35 o 36 de los casos, con el enlace al popup de REQ-SIG-15 para ponérselos, y el alta se rechaza con la frase. **Es la conducta correcta y es la verificación 11**: no se inventa un área, porque el prefijo del área forma el código y el código no se corrige nunca.

- [ ] **Step 5: El `Link` deja de ser un `Link`**

`Equipos.client.tsx:199-204` pasa de `<Link href="/sgsi/inventario">` a un `<button>` que abre el popup **en la misma pantalla**. El comentario de `:196-198` **se conserva y se corrige**: la regla que defiende sigue viva, pero aplicada por campo — la custodia se escribe aquí y en ningún otro lugar; el resto del activo se edita en la ficha y en ningún otro lugar. Y se agrega la `×` en la píldora del activo asignado, que llama a la misma acción con `personaId: null` (P17).

- [ ] **Step 6: Verificar los puntos 1, 2, 8, 9, 11, 12, 13 y 20b**

```bash
npm run dev
```

1. Asignar `TEC-EQU-XXXX` a una persona y recargar: **ACTIVOS ASIGNADOS** pasa de 0 a 1 y la fila sale del rojo (1); el renglón «N activos vigentes sin custodio persona» baja en 1 (2).
2. Poner `personaId` en todos los equipos y abrir el popup: sale el alta desplegada, no «sin resultados» (8).
3. Crear un equipo desde el popup: nace con código y con `persona_id` en el mismo instante (9).
4. Persona sin área: el alta se rechaza con la frase y no emite un código con prefijo inventado (11).
5. Sin `tecnologia:escribir`: el botón **no está en el DOM** (12) — comprobarlo con el inspector, no solo mirando la pantalla.
6. Activo con `cantidad = 20`: la confirmación aparece y sin ella no se asigna (13).
7. Cambiar `equipos_valoracion_por_defecto` a `3/3/5` y recargar: el formulario propone lo nuevo, sin desplegar nada (20b).

Y contra la base, la verificación 3 y la 4:

```sql
-- 3 · ningún [vhost], [firewall] ni [router] en la lista de candidatos
-- 4 · con un [COM]/[mobile] en el inventario, NO aparece; con un [HW]/[mobile], sí
SELECT a.codigo, t.codigo || '/' || s.codigo AS par
FROM activo a JOIN tipo_magerit t ON t.id=a.tipo_id JOIN subtipo_magerit s ON s.id=a.subtipo_id
WHERE a.activo = true AND s.codigo IN ('[mobile]','[vhost]','[firewall]','[router]')
ORDER BY 2;
```

- [ ] **Step 7: Verificar que el generador de tareas no cambió** (verificación 16, D-7)

```bash
curl -s -X POST -H "Authorization: Bearer $SIG_TRABAJOS_SECRET" \
  http://localhost:3004/api/sig/trabajos/generar-asignaciones
```

Expected: **el mismo número de asignaciones antes y después de asignar 10 equipos.** El alcance por activo se reparte al **propietario**, que es un cargo; el custodio persona no participa en ninguna resolución de alcance. Y por eso **el popup no imprime «se le asignaron N tareas»**: serían cero, y un cero sin explicación se lee como un fallo (P19, D-7).

- [ ] **Step 8: Commit**

```bash
git add app/sgsi/acciones/activos.ts app/tecnologia/equipos
git commit -m "feat(sig): el popup asigna un equipo del inventario o crea uno ya asignado"
```

**Cierra del checklist §8:** **1**, **2**, **3**, **4**, **8**, **9**, **10** (el alta valorada genera riesgos), **11**, **12**, **13**, **16**, **20b**.

---

## Task 6: La corrida de arranque — 36 altas sin cerrar el popup

**Files:**
- Modify: `app/tecnologia/equipos/PopupEquipo.tsx`

**Esta tarea es la que decide si la herramienta sirve.** Si la implementación obliga a cerrar y reabrir el popup 36 veces, el requerimiento no está cumplido aunque las pruebas pasen.

- [ ] **Step 1: El formulario recuerda la última alta** (P12b)

Tipo, subtipo, área, custodio cargo y valoración arrancan con **lo del alta anterior de la misma sesión**, no con los valores por defecto. El único campo que siempre nace vacío es el **nombre**. La regla exacta ya está probada en `heredarDelAltaAnterior` (Task 2): el área de la persona gana cuando la persona tiene área; lo recordado se aplica solo donde no hay nada mejor que proponer.

- [ ] **Step 2: «Guardar y seguir con la siguiente sin equipo»** (P12c)

Guarda, **no cierra el popup**, y lo reabre sobre la siguiente persona sin ningún activo, con el formulario ya relleno. El pie dice **«quedan N personas sin equipo»**. Avanza en el orden de la pantalla (`nombre asc`, `page.tsx:41`) y **respeta el filtro activo**: con **Sin activos** puesto, avanza por esa lista. La función ya está probada (`siguienteSinEquipo`).

- [ ] **Step 3: El nombre repetido avisa antes de guardar** (P12d)

Si el nombre ya existe entre los activos vigentes: «ya hay un activo vigente llamado así: `TEC-EQU-0007`», y se propone `Portátil Dell Latitude 5440 · S/N 7XKQ2M3`. **Es aviso, no bloqueo**: dos monitores idénticos con el mismo nombre son legítimos.

- [ ] **Step 4: La verificación 9b — la más importante y la que más se salta**

Con el inventario sin equipos y 36 personas sin nada, **crear los 36 PCs sin cerrar el popup ni una vez**.

```sql
-- al terminar
SELECT count(*) FILTER (WHERE persona_id IS NULL) AS sin_custodio,
       count(*)                                    AS vigentes
FROM activo WHERE activo = true;

SELECT codigo FROM activo
WHERE codigo LIKE 'TEC-EQU-%' AND activo = true
ORDER BY codigo;
```

Expected: en la pantalla, `SIN NINGÚN ACTIVO` = **0** y `PROMEDIO POR PERSONA` = **1.0**; en la base, 36 activos nuevos con **código consecutivo y sin huecos** (P12e — el contador es atómico dentro de la transacción, así que 36 altas seguidas no producen ni choques ni saltos).

- [ ] **Step 5: Las verificaciones 9c y 9d**

9c: a partir de la segunda alta, **el único campo que hay que escribir es el nombre**. 9d: crear dos equipos con el mismo nombre; en el segundo el popup nombra el código del primero y propone la forma con serial, y **se puede seguir de todos modos**.

- [ ] **Step 6: La verificación 17 — teclado y foco**

Escape cierra; el foco vuelve al botón de la fila (ya lo hace `Popup.tsx:48-50`); la lista se recorre con Tab; **la búsqueda no roba el foco al escribir**.

- [ ] **Step 7: Commit**

```bash
git add app/tecnologia/equipos
git commit -m "feat(sig): la corrida de arranque no obliga a cerrar el popup"
```

**Cierra del checklist §8:** **9b**, **9c**, **9d**, **17**.

---

## Task 7: Los dos renglones que faltan en la pantalla

**Files:**
- Modify: `app/tecnologia/equipos/page.tsx`
- Modify: `app/tecnologia/equipos/Equipos.client.tsx`

- [ ] **Step 1: La comprobación que tiene que fallar primero** (H8)

```sql
-- equipos asignados a personas INACTIVAS: hoy no salen en ninguna parte de la pantalla
SELECT count(*) FROM activo a JOIN persona p ON p.id = a.persona_id
WHERE a.activo = true AND p.activa = false;
```

Expected hoy: un número que **no aparece** en la pantalla. Las filas de arriba traen solo personas activas (`page.tsx:24-25`) y el renglón naranja cuenta solo `personaId: null` (`page.tsx:46`). Esos activos son invisibles en las dos direcciones, que es justo el hueco que el renglón naranja existe para evitar.

- [ ] **Step 2: «N equipos siguen asignados a personas inactivas»** (P21, verificación 14b)

Con su enlace. **No se liberan solos.** `Activo.personaId` se queda apuntando a la persona inactiva, y sus equipos siguen listados para armar el acta de borrado. Liberarlos automáticamente inventaría una devolución que quizá no ocurrió y —sin tabla de historia— **borraría el único dato que dice qué tenía esa persona**, justo el día en que hace falta.

- [ ] **Step 3: El renglón naranja se vuelve un termómetro** (P20)

«N activos vigentes sin custodio persona» pasa de dato inerte a medida de cuánto falta. Es el número que responde A.5.9 sin salir de la pantalla.

- [ ] **Step 4: Verificar la 14b**

Inactivar a una persona con dos equipos. Expected: siguen apuntando a ella, **no** salen en las filas de arriba, **no** se cuentan como «sin custodio persona», y el renglón nuevo dice «2 equipos siguen asignados a personas inactivas».

- [ ] **Step 5: Commit**

```bash
git add app/tecnologia/equipos
git commit -m "feat(sig): los equipos de quien se va dejan de ser invisibles"
```

**Cierra del checklist §8:** **14b**, y termina de cerrar **2** y **5**.

> **Fin de F1.** En este punto la pantalla deja de mostrar 36 filas rojas, el camino de escritura existe con su bitácora, y **nada de F2 ni de F3 está construido todavía**. Los puntos de §8 que quedan abiertos son: 18, 18b, 18c, 18d, 18e, 18f, 18g, 18h, 19, 21, 21b, 22, 22b, 23 y 24.

---

# F2 · La titularidad BYOD

> **Fase bloqueada por Q1 (la columna) y Q3 (el contenido de los lineamientos).** La Task 8 no se ejecuta sin el sí explícito a D-11; la Task 9 no se puede terminar mientras el `ContenidoSig` no exista (H4).

## Task 8: Una columna booleana, y nada más

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_activo_es_del_colaborador/migration.sql`

**Bloqueada por Q1. No correr `migrate dev` antes de la respuesta.**

- [ ] **Step 1: La columna** (T6)

```prisma
/// REQ-SIG-16 · el equipo es del colaborador (BYOD), no de la organización. Decide qué
/// acta corresponde, qué métodos de borrado son posibles y si el activo puede cambiar
/// de manos alguna vez. Falso en todo lo que no sea un dispositivo de punto final.
esDelColaborador Boolean @default(false) @map("es_del_colaborador")
```

`ActivoNuevo` suma `esDelColaborador?: boolean` y el `create` lo pasa (§4.2).

- [ ] **Step 2: Verificar que la migración es una columna y nada más** (verificación 24)

```bash
npx prisma migrate dev --name activo_es_del_colaborador && npx prisma generate
git diff --stat main -- prisma/schema.prisma
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c '\d activo' | rg es_del_colaborador
```

Expected: **una** columna booleana con default en `activo`. **Ninguna tabla nueva, ninguna fila existente alterada.** El default `false` es verdad para todo lo que hay hoy: servicios, datos y servidores son de la organización.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/sgsi/acciones/activos.ts
git commit -m "feat(sig): la titularidad BYOD del activo, una columna con default"
```

**Cierra del checklist §8:** **24**.

---

## Task 9: La primera pregunta es de quién es el equipo

**Files:**
- Modify: `app/tecnologia/equipos/PopupEquipo.tsx`
- Modify: `app/sgsi/acciones/activos.ts`
- Create: `prisma/migrations/<timestamp>_parametro_lineamientos/migration.sql`

**Bloqueada por Q3.** Sin el `ContenidoSig` de los lineamientos, la rama feliz de T3 no tiene datos (H4).

- [ ] **Step 1: La comprobación que tiene que fallar primero**

```sql
SELECT count(*) FROM parametro WHERE clave = 'contenido_lineamientos_dispositivos';
```

Expected: `0`.

- [ ] **Step 2: La titularidad va primero, y arranca en BYOD** (T1)

Dos respuestas, no «nuevo o usado»: **BYOD — el equipo es del colaborador** (propuesta por defecto, porque es la mayoría del parque) y **De la organización**. La titularidad decide qué acta corresponde, qué métodos de borrado son legales y si el activo puede reasignarse. Es una propuesta, no un candado, y por P12b el valor elegido se hereda a las altas siguientes de la misma corrida — **así la corrida de arranque paga un clic, no 36.**

- [ ] **Step 3: BYOD verifica el acta, no la crea** (T3, D-12)

El parámetro `contenido_lineamientos_dispositivos` guarda el **código** del `ContenidoSig`. La consulta sigue el patrón que la aplicación ya usa para saber qué compromisos firmó alguien (`app/sig/colaboradores/page.tsx:53-55`): `actaAceptacion` con `contenido.codigo`, cruzado contra `personaId`.

Tres resultados, y los tres distintos:

| Lo que encuentra | Qué hace el popup |
|---|---|
| Acta firmada | «✓ Aceptó los lineamientos de dispositivos personales el DD/MM/AAAA · acta ACT-2026-XXXX» y deja registrar |
| Sin acta | **Bloquea**, nombra el compromiso que falta y enlaza a la bandeja de esa persona |
| El parámetro apunta a un contenido inexistente | Dice que **el parámetro está mal configurado y nombra la clave**. No deja pasar como si nadie hubiera firmado, ni bloquea como si todos hubieran incumplido |

**Es bloqueo, no aviso.** Registrar el equipo personal de quien no aceptó las reglas deja al SGSI certificando por escrito que un dispositivo no gobernado procesa información de la organización. Lo que lo hace tolerable es que **no se firma nada aquí**: se consulta un acta que ya debería existir desde la vinculación, y si falta, el enlace lleva a donde se resuelve.

> **La validación va también en el servidor.** Una comprobación que solo vive en el popup se salta llamando a la acción directamente, y ésta sostiene un control de la norma.

- [ ] **Step 4: Verificar 21 y 21b**

21: registrar un equipo BYOD a una persona **sin** acta → rechazado, con el nombre del compromiso y el enlace; con el acta firmada → se registra y el popup muestra su código y su fecha.
21b: apuntar `contenido_lineamientos_dispositivos` a un código inexistente → el popup dice que el parámetro está mal configurado y **nombra la clave**.

```bash
docker compose -f docker-compose.dev.yml exec -T sgi-postgres psql -U sgi -d sgi_sgsi -c \
"update parametro set valor = 'NO-EXISTE-0000' where clave = 'contenido_lineamientos_dispositivos';"
```

- [ ] **Step 5: Commit**

**Cierra del checklist §8:** **21**, **21b**.

---

## Task 10: Un equipo BYOD no se reasigna nunca

**Files:**
- Modify: `app/tecnologia/equipos/PopupEquipo.tsx`
- Modify: `app/sgsi/acciones/activos.ts`

- [ ] **Step 1: En la lista, aparece y está deshabilitado** (T5)

Marcado BYOD, el activo **no** es candidato para otra persona **ni siquiera con «ver todo el inventario»**. Aparece con la leyenda «equipo personal de Carlos Andrés Mejía», deshabilitado. Ofrecer el equipo personal de Carlos para dárselo a Andrés es una operación que no existe en el mundo real, y una lista que la ofrece hace que alguien la intente.

- [ ] **Step 2: Y en el servidor, rechazada** (verificación 22)

`asignarCustodioPersona` rechaza con su frase cuando el activo tiene `esDelColaborador = true` y el `personaId` destino **no** es el actual. Se comprueba **llamando a la acción directamente**, no desde la pantalla.

- [ ] **Step 3: A la salida se da de baja, no se libera** (verificación 22b)

Al desvincular a su dueño, el equipo BYOD se ofrece para **baja** (`darDeBajaActivo`, `activos.ts:367`) con su acta, no para reasignación. **Este popup no crea esa acta**: la muestra si existe y la pide cuando alguien dé de baja un activo BYOD (B8). El acta se levanta en la desvinculación de REQ-SIG-09, que es otro requerimiento.

- [ ] **Step 4: Commit**

**Cierra del checklist §8:** **22**, **22b**.

---

# F3 · El acta de borrado

> **F3 no depende de F2 salvo en un punto:** el quinto método de borrado (Task 14) solo tiene sentido con la columna de Q1. Todo lo demás de F3 se construye aunque D-11 se rechace.

## Task 11: El módulo puro del acta

**Files:**
- Create: `lib/sgsi/borrado.ts`
- Test: `lib/sgsi/__tests__/borrado.test.ts`

- [ ] **Step 1: Escribir la prueba que falla**

Los casos que no se negocian:

```ts
describe('proponerEstadoDelEquipo', () => {
  // B1 · el sistema propone y dice de dónde lo sacó.
  it('con custodio actual: USADO, y no se puede cambiar — es un hecho del dato', () => {
    expect(proponerEstadoDelEquipo({ personaId: 12, bitacora: [] }))
      .toEqual({ estado: 'USADO', tenedor: 12, editable: false });
  });

  it('liberado pero con bitácora de custodia: USADO, y el valorAnterior dice quién', () => {
    expect(proponerEstadoDelEquipo({
      personaId: null,
      bitacora: [{ campo: 'custodio persona', valorAnterior: 'Carlos Andrés Mejía', valorNuevo: '(vacío)' }],
    })).toMatchObject({ estado: 'USADO', tenedorNombre: 'Carlos Andrés Mejía', editable: true });
  });

  // B2 · todo activo del consolidado nace SIN bitácora de custodia aunque lleve tres años
  // en el escritorio de alguien. Un control que solo se activa con datos que la aplicación
  // misma produjo no protege nada durante el primer año.
  it('sin nada: NUEVO, pero editable', () => {
    expect(proponerEstadoDelEquipo({ personaId: null, bitacora: [] }))
      .toEqual({ estado: 'NUEVO', tenedor: null, editable: true });
  });
});

describe('actaSirve', () => {
  // B3 · las DOS condiciones. Un acta de Carlos que no menciona el portátil no dice que el
  // portátil se borró; un acta que menciona el portátil pero es de otra persona no dice
  // nada de los datos de Carlos.
  it('exige que el acta sea de la persona que lo tuvo', () => {
    expect(actaSirve({ acta: { personaId: 99, activos: [7] }, tenedorId: 12, activoId: 7 }))
      .toEqual({ sirve: false, razon: 'OTRA_PERSONA' });
  });

  it('un acta de la persona correcta que no incluye el activo se acepta y le AGREGA la fila', () => {
    expect(actaSirve({ acta: { personaId: 12, activos: [3] }, tenedorId: 12, activoId: 7 }))
      .toEqual({ sirve: true, agregarActivo: true });
  });

  it('un acta de la persona correcta que ya lo incluye sirve tal cual', () => {
    expect(actaSirve({ acta: { personaId: 12, activos: [7] }, tenedorId: 12, activoId: 7 }))
      .toEqual({ sirve: true, agregarActivo: false });
  });
});

describe('metodosOfrecidos', () => {
  // B8 · aplicarle «destrucción física» al portátil personal de un colaborador no es una
  // opción que deba estar en la lista.
  it('un activo BYOD solo ofrece el retiro remoto por MDM', () => {
    expect(metodosOfrecidos({ esDelColaborador: true }, CATALOGO)).toEqual(['Retiro remoto de datos corporativos (MDM)']);
  });

  it('un activo de la organización ofrece los cuatro sembrados y NO ofrece ése', () => {
    expect(metodosOfrecidos({ esDelColaborador: false }, CATALOGO))
      .not.toContain('Retiro remoto de datos corporativos (MDM)');
  });
});

describe('esperandoActaDeBorrado', () => {
  // B5 · se DERIVA, no se guarda. Un estado «pendiente» guardado sería decir que el control
  // se cumplió a medias, y a medias no existe.
  it('liberado, con bitácora de custodia y sin acta que lo incluya', () => {
    expect(esperandoActaDeBorrado({ personaId: null, tuvoCustodio: true, actas: [] })).toBe(true);
  });

  it('con un acta que lo cubre, ya no espera', () => {
    expect(esperandoActaDeBorrado({ personaId: null, tuvoCustodio: true, actas: [1] })).toBe(false);
  });

  it('un activo que nunca tuvo custodio no espera nada', () => {
    expect(esperandoActaDeBorrado({ personaId: null, tuvoCustodio: false, actas: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- borrado`
Expected: FAIL — `Cannot find module '../borrado'`

- [ ] **Step 3: Escribir `lib/sgsi/borrado.ts`** hasta que pase.

- [ ] **Step 4:** `npm test -- borrado && npx tsc --noEmit -p tsconfig.json`

- [ ] **Step 5: Commit**

**Cierra del checklist §8:** la lógica de **18b**, **18e**, **18f**, **18g** y **23**; los cinco se terminan de cerrar contra la base en las tareas siguientes.

---

## Task 12: `ActaBorrado.tsx`, fuera del popup

**Files:**
- Create: `app/components/sgsi/ActaBorrado.tsx`

- [ ] **Step 1: La comprobación que tiene que fallar primero**

```bash
rg -l "ActaBorrado" app/components/
```

Expected: **sin resultados** (H5).

- [ ] **Step 2: El formulario, cinco campos, todos del modelo que ya existe**

Fecha del borrado, **método** (del catálogo `MetodoBorrado`), quién lo ejecutó, nota, y evidencia opcional por `Evidencia`. Todos están en `ActaBorradoSeguro` (`schema.prisma:2688-2706`) y no hace falta ni una columna.

**Vive en `app/components/sgsi/ActaBorrado.tsx` y no dentro del popup** (B6, verificación 18h). La desvinculación de REQ-SIG-09 necesita exactamente el mismo formulario; si nace embebido en este popup, esa pantalla escribirá su propia versión: **dos formas de crear el acta que cierra A.8.10, con dos conjuntos de campos obligatorios.** Es la misma razón por la que `Popup.tsx` existe en un solo lugar.

- [ ] **Step 3: Commit**

**Cierra del checklist §8:** **18h**.

---

## Task 13: El equipo usado no se entrega sin acta, y se valida en el servidor

**Files:**
- Modify: `app/sgsi/acciones/activos.ts`
- Modify: `app/tecnologia/equipos/PopupEquipo.tsx`

- [ ] **Step 1: La comprobación que tiene que fallar primero — la verificación 18**

Con un activo que tiene custodio, intentar asignarlo a otra persona **llamando a la acción de servidor directamente**, con el acta omitida.

Expected **antes** de esta tarea: la asignación **se hace** (F1 no exige acta). Expected **después**: `ok: false` con la razón concreta. **Esta es la verificación que más se salta y la que sostiene el control**: una validación que solo vive en el cliente se salta con una llamada directa.

- [ ] **Step 2: La firma crece con un parámetro** (§5)

```ts
asignarCustodioPersona(
  codigoActivo: string,
  personaId: number | null,
  motivo?: string,
  borrado?:
    | { actaId: number }                  // escogida del listado (B3.1)
    | { acta: ActaBorradoNueva },         // registrada en el momento (B3.2)
): Promise<Resultado>
```

**Sin parámetro de fecha de entrega: no hay dónde guardarla** (§4.1, D-2). La que queda es la de la bitácora. La fecha que sí viaja es la **del borrado**, dentro de `acta`, porque ésa sí tiene columna.

- [ ] **Step 3: Las tres ramas del popup, y la tercera no guarda nada** (B3, B4)

1. **Escoger del listado**: las actas de esa persona, con fecha y método. Si ya incluye el activo, se selecciona; si no, **se le agrega** una fila de `ActaBorradoActivo` en la misma transacción. El acta de una desvinculación cubre el portátil, el celular y el disco externo, y que a alguien se le haya pasado uno no obliga a levantar un acta nueva.
2. **Registrar una nueva**, con `ActaBorrado.tsx`. El acta nace **con el activo ya asociado**: un acta sin activos asociados no se guarda (criterio 7 del modelo, `schema.prisma:2686-2687`).
3. **«Todavía no se ha borrado»** → **no hay tercer camino que diga "pendiente"**. El popup dice «Este equipo no se puede entregar todavía. Bórrelo primero y vuelva a registrar el acta aquí» y ofrece **dejarlo liberado** (`personaId = null`). Un estado «pendiente de borrado» guardado en la base sería decir que el control se cumplió a medias, y a medias no existe: o la información se borró, o el próximo la va a encontrar.

- [ ] **Step 4: Las cinco escrituras, en la misma `$transaction`** (P14)

| # | Escritura | Cuándo |
|---|---|---|
| 1 | `ActaBorradoSeguro` + su `ActaBorradoActivo` | Solo con `{ acta }` |
| 2 | `ActaBorradoActivo` sobre un acta existente | Solo con `{ actaId }` y si aún no lo incluía |
| 3 | `Activo.personaId` | Siempre |
| 4 | `Bitacora` de la custodia, **con nombres** | Siempre |
| 5 | `Bitacora` del alta del acta (`registrarAlta(tx, autor, 'acta_borrado_seguro', …)`) | Solo con `{ acta }` |

**Aquí la transacción no es una formalidad:** un acta guardada con la asignación fallida deja constancia de un borrado para una entrega que no ocurrió, y una asignación guardada con el acta fallida entrega el equipo sin la evidencia. El segundo caso es exactamente el incidente que este control existe para impedir.

- [ ] **Step 5: P14b — la validación del acta va en el servidor**

La acción comprueba **por su cuenta**, con `actaSirve` del módulo puro, que si el activo tuvo custodio anterior el acta corresponde a **esa persona** y cubre **ese activo**. Las dos condiciones.

- [ ] **Step 6: Verificar 18, 18b, 18c, 18d, 18e y 18f**

```sql
-- 18c · el acta nace con el activo, no existe un instante sin él
SELECT a.id, a.fecha, count(aa.activo_id) AS activos
FROM acta_borrado_seguro a LEFT JOIN acta_borrado_activo aa ON aa.acta_id = a.id
GROUP BY 1,2 HAVING count(aa.activo_id) = 0;
```

Expected: **0 filas.** Nunca un acta sin activos.

18d (**todo o nada**): forzar el fallo de la escritura del acta → el activo **no** cambia de custodio; forzar el fallo de la asignación → el acta **no** queda guardada.
18e: activo con custodio → «usado» y no se puede cambiar; activo liberado con bitácora → «usado» y nombra a quien lo tuvo; recién creado → «nuevo».
18f: un activo cargado por el consolidado, sin bitácora → propone «nuevo» y **deja marcarlo como usado**, eligiendo al tenedor anterior entre las personas, **inactivas incluidas** — que son justo las que devuelven equipos.

- [ ] **Step 7: La verificación 19 — la corrida de arranque no paga por esto**

Repetir la corrida de 36 altas de la Task 6. Expected: la pregunta de equipo nuevo/usado **no aparece ni una vez**. Un equipo creado en el formulario es nuevo por construcción: acaba de nacer con `personaId` puesto (B7).

- [ ] **Step 8: Commit**

**Cierra del checklist §8:** **18**, **18b**, **18c**, **18d**, **18e**, **18f**, **19**.

---

## Task 14: El quinto método de borrado

**Files:**
- Create: `prisma/migrations/<timestamp>_metodo_borrado_mdm/migration.sql`

**Depende de Q1**: sin la columna, el formulario no puede elegir qué métodos ofrecer.

- [ ] **Step 1: La fila**

Es **una fila en el catálogo, no una migración de esquema**: `MetodoBorrado` existe y ya está sembrada con cuatro métodos (`prisma/migrations/20260903170000_colaboradores/migration.sql:119-124`).

```sql
INSERT INTO metodo_borrado (nombre, orden, activo)
VALUES ('Retiro remoto de datos corporativos (MDM)', 5, true)
ON CONFLICT (nombre) DO NOTHING;
```

- [ ] **Step 2: Verificar la 23**

Activo BYOD: el formulario ofrece **solo** «Retiro remoto de datos corporativos (MDM)». Activo de la organización: ofrece los cuatro sembrados y **no** ofrece ése. La regla ya está probada en `metodosOfrecidos` (Task 11); aquí se comprueba con datos reales.

- [ ] **Step 3: Commit**

**Cierra del checklist §8:** **23**.

---

## Task 15: «Esperando acta de borrado» se deriva, no se guarda

**Files:**
- Modify: `app/tecnologia/equipos/page.tsx`
- Modify: `app/tecnologia/equipos/Equipos.client.tsx`

- [ ] **Step 1: La consulta, sin campo, sin enum y sin tabla** (B5)

> Activos vigentes con `personaId = null`, con **al menos una fila de bitácora de custodio persona**, y **sin** acta que los incluya.

```sql
SELECT count(*) AS esperando_acta
FROM activo a
WHERE a.activo = true
  AND a.persona_id IS NULL
  AND EXISTS (SELECT 1 FROM bitacora b
              WHERE b.tabla = 'activo' AND b.registro_id = a.codigo
                AND b.campo = 'custodio persona')
  AND NOT EXISTS (SELECT 1 FROM acta_borrado_activo aa WHERE aa.activo_id = a.id);
```

**La bitácora se consulta por `registro_id` = el CÓDIGO del activo**, que es lo que la Task 4 escribe. Es también lo que la hace sobrevivir a H6.

- [ ] **Step 2: Verificar la 18g**

Liberar un equipo usado sin acta → aparece en el renglón «N equipos esperando acta de borrado», y **no hay ninguna columna nueva** que lo diga:

```bash
git diff main -- prisma/schema.prisma | rg "^\+" | rg -v "esDelColaborador|es_del_colaborador"
```

Expected: nada más que la columna de la Task 8 (o nada en absoluto, si Q1 se rechazó).

- [ ] **Step 3: Commit**

**Cierra del checklist §8:** **18g**.

---

## Task 16: Cierre

- [ ] **Step 1: Correr todo**

```bash
npm test && npm run lint && npx tsc --noEmit -p tsconfig.json && npm run build
```

Expected: la suite en verde contra la línea base de la Task 1, lint sin errores nuevos, **0 errores de tipos** —`next.config.js` tiene `typescript.ignoreBuildErrors: true`, así que el build **no** avisa— y build exitoso.

- [ ] **Step 2: Recorrer el checklist §8 punto por punto** con la tabla de abajo, y **reportar cuáles quedaron sin correr y por qué**.

- [ ] **Step 3: Confirmar lo que NO se hizo.** La lista de §9 del requerimiento, releída contra el diff:

```bash
git diff --stat main
git diff main -- lib/sig/generacion.ts lib/sig/prevision.ts   # debe estar VACÍO (P19, D-7)
git diff main -- app/components/sgsi/activos/FichaActivo.tsx  # la custodia NO se edita ahí (D-5)
```

---

## Checklist del requerimiento · los 38 puntos de §8

| # | Verificación | Fase | Tarea |
|---|---|:-:|---|
| 1 | El camino de escritura existe | F1 | Task 4 · Task 5 Step 6 |
| 2 | El contador inverso se mueve | F1 | Task 4 Step 3 · Task 7 Step 3 |
| 3 | El filtro por defecto | F1 | Task 5 Step 6 |
| 4 | El par tipo/subtipo, no el subtipo suelto | F1 | Task 2 (prueba) + Task 5 Step 6 (datos) |
| 5 | El pie dice cuántos quedaron fuera | F1 | Task 2 (prueba) + Task 3 Step 4 (cuadre) |
| 6 | Reasignar exige motivo, y la bitácora usa nombres | F1 | Task 2 + Task 4 Step 4 |
| 7 | El custodio persona no necesitó esquema | F1 | Task 4 · Task 15 Step 2 |
| 8 | El vacío abre el formulario | F1 | Task 5 Step 3 |
| 9 | El alta queda asignada de una vez | F1 | Task 5 Step 1 |
| **9b** | **La corrida de arranque completa, sin cerrar el popup** | F1 | **Task 6 Step 4** |
| 9c | El formulario recuerda | F1 | Task 6 Step 5 |
| 9d | El nombre repetido avisa | F1 | Task 6 Step 5 |
| 10 | El alta valorada genera riesgos | F1 | Task 5 Step 6 |
| 11 | El área no se adivina | F1 | Task 5 Step 4 y Step 6 |
| 12 | Sin permiso, sin botón | F1 | Task 5 Step 6 |
| 13 | El aviso de cantidad | F1 | Task 5 Step 6 |
| 14 | Liberar | F1 | Task 4 · Task 5 Step 5 |
| 14b | Los equipos de quien se va no desaparecen | F1 | Task 7 Step 4 |
| 15 | La ficha del activo no lo edita | F1 | Task 5 Step 2 · Task 16 Step 3 |
| 16 | El generador no cambió | F1 | Task 5 Step 7 |
| 17 | Teclado y foco | F1 | Task 6 Step 6 |
| **18** | **El equipo usado no se entrega sin acta — llamando a la acción DIRECTAMENTE** | F3 | **Task 13 Step 1 y Step 5** |
| 18b | El acta tiene que ser de esa persona y de ese activo | F3 | Task 11 + Task 13 Step 6 |
| 18c | El acta nueva nace con el activo | F3 | Task 13 Step 6 |
| 18d | Todo o nada | F3 | Task 13 Step 6 |
| 18e | El sistema propone la respuesta | F3 | Task 11 + Task 13 Step 6 |
| 18f | Y se puede corregir | F3 | Task 13 Step 6 |
| 18g | El pendiente se deriva, no se guarda | F3 | Task 15 Step 2 |
| 18h | El formulario del acta es reusable | F3 | Task 12 |
| 19 | La corrida de arranque no lo padece | F3 | Task 13 Step 7 |
| 20 | La valoración por defecto cae del lado correcto del umbral | F1 | Task 2 + Task 5 Step 6 |
| 20b | Y sale de un parámetro | F1 | Task 3 · Task 5 Step 6 |
| 21 | BYOD exige la aceptación de los lineamientos | F2 | Task 9 Step 4 — **bloqueada por Q3 (H4)** |
| 21b | El parámetro mal configurado se nota | F2 | Task 9 Step 4 — **bloqueada por Q3** |
| 22 | Un equipo BYOD no se le puede dar a otra persona | F2 | Task 10 Step 2 — **bloqueada por Q1** |
| 22b | Y a la salida se da de baja, no se libera | F2 | Task 10 Step 3 — **bloqueada por Q1** |
| 23 | El método de borrado corresponde a la titularidad | F3 | Task 11 + Task 14 Step 2 — **bloqueada por Q1** |
| 24 | La migración es una columna y nada más | F2 | Task 8 Step 2 — **bloqueada por Q1** |

**22 de los 38 puntos se cierran en F1, sin ninguna respuesta pendiente.** Los 16 restantes dependen de Q1, Q3 o de F3.

---

## Lo que este plan NO hace, y es deliberado

Releído contra §9 del requerimiento antes de cada commit:

- **No agrega tabla de historia de custodia** (D-2). Un activo apunta a quien lo tiene ahora; lo anterior queda en la bitácora. Si al implementar parece que hace falta —y hay un argumento, sobre todo por H6— se anota y se sigue.
- **No guarda fecha de entrega.** No hay columna y es deliberado. La que queda es `Bitacora.ocurridoEn`, que es **cuándo se digitó**. El requerimiento del acta de entrega (D-6) es el que va a agregar la fecha real.
- **No libera equipos al desvincular ni al bloquear** (P21). Se quedan apuntando a la persona inactiva para poder armar el acta de borrado, y la Task 7 agrega el renglón que los hace visibles.
- **No sincroniza nada desde Intune** (D-13). Ni cumplimiento, ni cifrado, ni versión de sistema operativo, ni última conexión. Ese registro ya existe y duplicarlo produciría dos respuestas a «¿este equipo cumple?».
- **No ejecuta el borrado remoto.** Registra que se hizo, con quién, cuándo, con qué método y con qué evidencia. Lo ejecuta Intune desde su consola.
- **No crea una `Solicitud` para pedir el borrado** (D-10). `TipoSolicitud` no tiene ese valor, y un flujo de pide-autoriza-ejecuta sobra para algo que hace la misma persona que entrega el equipo.
- **No toca el generador de tareas** (P19, D-7). El alcance por activo se reparte al **propietario**, que es un cargo; la custodia persona no participa en ninguna resolución de alcance, y el popup **no** informa tareas generadas porque serían **cero**. La verificación 16 lo comprueba corriendo `generar-asignaciones` antes y después.
- **No inventa área, cargo ni valoración.** Cuando el dato falta, lo pide y rechaza el alta con su frase.
- **No agrega un segundo camino de alta de activos.** `crearActivo` se extiende con uno o dos campos; el contador de códigos sigue siendo uno solo.
- **No construye la pantalla de actas de borrado.** Crea el componente que las escribe y la primera vía para registrarlas. La lista completa, su consulta y su exportación son de REQ-SIG-09.

---

## Pendientes que no dependen del desarrollo

1. **Q1 · ratificar D-11** (la columna `esDelColaborador`). Sin el sí, F2 no arranca.
2. **Q2 · ratificar D-4** (valoración obligatoria en el alta). Si se relaja, hay una tarea más, no menos.
3. **Q3 · crear o identificar el `ContenidoSig` de los lineamientos de dispositivos personales** (H4). Hoy no existe y ningún requerimiento de la cola lo crea. **Sin él, el caso BYOD —que es la mayoría del parque— no se puede registrar**, y la verificación 21 no tiene datos.
4. **Cargar área y cargo de las 36 personas activas** (H3). Con `cargo_id` en 0 de 36, el alta del popup se rechaza para todas. **El primer trabajo de este requerimiento no es de programación.**
5. **Fijar el orden entre la corrida de arranque y la carga del consolidado** (H6). `consolidado-carga.ts:366,373` vacía `acta_borrado_activo` y `activo`: si el consolidado se vuelve a cargar después de asignar los 36 equipos, la custodia y los vínculos del acta se pierden. La regla de trabajo es: **primero el consolidado, después la corrida.**
6. **Escribir en el procedimiento —no en el código— que el acta de borrado se arma ANTES de reasignar el equipo** (§4.1, D-2). Sin tabla de historia, quien arma el acta leyendo `activosACargo` no encuentra el equipo si ya rotó al reemplazo. Es el orden correcto de todas maneras: primero se verifica que la información se borró, después el equipo se entrega a otro. Va también en el documento de desvinculación.
