# Tasks: Catálogo de Nivel 3 y estandarización del árbol

**Regla 1 de HARNESS.md manda sobre esta lista.** Cada tarea que cambia comportamiento observable
escribe su prueba **antes** del arreglo y la **ve en rojo**. Ninguna de las tres entregas cae en las
excepciones (renombres, comentarios, formato, tipos sin efecto en runtime, documentación).

Las fases van en orden y no se solapan: la 2 necesita el árbol limpio de la 1, y la 3 necesita el
catálogo de la 2.

---

## Fase 0 · Decisiones antes de tocar nada

- [ ] **0.1** Presentar los 27 nombres del vocabulario y su reparto propuesto por clase. **Decide el
      SIG.** Incluye `EMPRESA`, que hoy no tiene ninguna fila en `plantilla_nivel`.
- [x] **0.2** Decidir qué queda en la plantilla mínima de cada clase, ahora que `AMBIENTES` tiene
      que resolverse contra los tres ambientes reales (`DE DESARROLLO`, `DE PRUEBAS`,
      `DE PRODUCCIÓN`).
- [ ] **0.3** Confirmar que `CUANTICO` #4 y los pares `ILC`/`UNAD`/`SIG` bajo padres distintos
      quedan **fuera** de este cambio, y anotarlos donde no se pierdan.

## Fase 1 · Enderezar el árbol

> El orden dentro de esta fase no es negociable: primero los datos, después la restricción.

- [ ] **1.1** Levantar el túnel a producción y correr `npx tsx scripts/auditar-niveles.ts` contra
      **15432**. Guardar la salida: es la foto previa.
- [ ] **1.2** Correr `npx tsx scripts/estandarizar-niveles.ts` **sin `--aplicar`** contra 15432.
      Comparar con el plan de 5432 (105 renombres, 4 fusiones, 0 conflictos). **Si el plan de
      producción trae conflictos, parar**: hay una decisión de negocio esperando.
- [ ] **1.3** Respaldo de la base, como manda el workflow de despliegue.
- [ ] **1.4** `--aplicar`. **Guardar la salida completa**: es el único registro de qué se movió a
      dónde, y sin ella la fusión no se puede deshacer.
- [ ] **1.5** `auditar-niveles.ts` otra vez. Las colisiones al normalizar tienen que dar **cero**.
- [ ] **1.6** 🔴 Prueba en rojo: un caso en `lib/sig/__tests__/` que exija que dos hermanos que sólo
      difieren en la caja sean rechazados. Falla porque hoy el índice es sobre el nombre literal.
- [ ] **1.7** Migración que reemplaza `nivel_activo_identidad` por el índice funcional sobre
      `(grado, upper(btrim(nombre)), padre_id) NULLS NOT DISTINCT`. Comentario de cabecera que
      explique por qué `NULLS NOT DISTINCT`, por qué `upper(btrim(...))` y no la regla entera, y que
      **`verificar:migraciones` no puede detectar el fallo** porque corre sobre base vacía.
- [ ] **1.8** Actualizar la nota de identidad de `prisma/schema.prisma` (~línea 3674), que hoy
      describe el índice anterior.
- [ ] **1.9** `npm run verificar:migraciones` en limpio.
- [ ] **1.10** Correr `e2e/grafo.spec.ts` antes y después. Si cambia, es porque `MINTRACE` y
      `Mintrace` dejaron de ser dos. Anotar el cambio en el PR.

## Fase 2 · El catálogo

- [x] **2.1** 🔴 Prueba en rojo: `aplicarPlantilla` no puede crear un nivel cuyo nombre no esté en
      el catálogo. Falla porque hoy no hay catálogo.
- [x] **2.2** Modelo `CatalogoNivel3` en `prisma/schema.prisma`, único sobre `(clase, nombre)`.
- [x] **2.3** Migración que crea `catalogo_nivel_3` y la siembra con lo decidido en 0.1. Nombres
      pasados por `normalizarNombreNivel`.
- [x] **2.4** Migración que corrige los cuatro nombres de `plantilla_nivel` (0.2) y **después**
      agrega la FK a `catalogo_nivel_3`. En ese orden: la FK rechaza las filas de hoy.
- [x] **2.5** `aplicarPlantilla` y `crearNivel` validan contra el catálogo cuando el grado es 3.
- [x] **2.6** `npm run verificar:migraciones` en limpio. Son dos migraciones más y la 2.4 tiene un
      orden interno que sólo se ejerce corriéndola.

## Fase 3 · El selector

- [x] **3.1** 🔴 Prueba en rojo en `lib/sig/__tests__/catalogo-nivel-3.test.ts`: un nombre que
      existe bajo otra rama se ofrece como **del catálogo** bajo la rama actual. Es el caso del
      screenshot y falla porque el módulo no existe.
- [x] **3.2** `lib/sig/catalogo-nivel-3.ts` — módulo puro, sin Prisma. Cubrir: sin Nivel 2 elegido;
      rama huérfana (`claseDeNivel` → `null`) devuelve sólo existentes; orden estable.
- [x] **3.3** 🔴 Prueba en rojo sobre `guardarDatosGenerales` con `{ tipo: 'nuevo' }`: crea el nodo
      bajo el Nivel 2, es idempotente si ya existe, rechaza un nombre fuera del catálogo, rechaza un
      `nivel2Id` que no es de grado 2, y **no crea nada si la escritura del activo falla**.
- [x] **3.4** `guardarDatosGenerales` acepta la forma discriminada y resuelve-o-crea en la
      transacción, con bitácora del alta y del cambio de `nivelId`. Manejo de P2002 → re-resolver.
- [x] **3.5** `JerarquiaActivo` en `FichaActivo.tsx` (~2287-2379): dos grupos en el selector,
      `Edicion` lleva la forma nueva. Conservar `conElegido`.
- [x] **3.6** Prueba de componente en `app/components/sgsi/activos/__tests__/`: elegir del catálogo
      y **no guardar** no dispara ninguna acción.
- [x] **3.7** Copy en español de Colombia: `tú` o impersonal, imperativo sin tilde aguda, sin voseo.
      Revisar también los `titulo=` de los tres selectores, que hoy describen el filtrado viejo.

## Fase 4 · Verificación (HARNESS.md)

- [x] **4.1** `npm run verificar:build` en limpio. **No pipear a `tail`**: el código de salida del
      pipe es el del último comando y reporta 0 con la suite en rojo.
- [x] **4.2** `npm run verificar:migraciones` en limpio.
- [x] **4.3** **Regla 3 — aplica.** Hay pantalla, hay estado y hay una decisión de la persona. El
      recorrido, paso a paso, en el PR:

```
Recorrido EJECUTADO el 2026-09-22 · activo PRY-PER-0002 «Gestor de Programas y
Proyectos», uno de los 3 vigentes sin ubicar · Chromium contra el next dev de
localhost:3000 · base 5432

  1. Abrir la ficha             -> Nivel 3 dice «— elige el nivel 2 —»
  2. CUANTICO / GESTIÓN DE PROY -> existentes: Documentación, Aplicaciones de negocio
                                   (ninguno es PERSONAS, que es donde va un [P])
  3. Abrir el Nivel 3           -> grupo «Del catálogo — se crea al guardar», 24 nombres;
                                   PERSONAS está
  4. Elegir PERSONAS            -> «Al guardar se crea «PERSONAS» bajo GESTIÓN DE
                                   PROYECTOS… Si sales sin guardar, no se crea nada.»
  5. Guardar («Guardar 1 cambio») -> confirmado en pantalla
  6. Reabrir la ficha           -> ids 4/11/146 · «CUANTICO · GESTIÓN DE PROYECTOS · PERSONAS»

  Errores de JavaScript en el recorrido: ninguno.

Comprobado en la base, no deducido de la pantalla:

  nivel_activo #146   PERSONAS · grado 3 · padre 11 · orden 3 · activo
  activo #538         PRY-PER-0002 · nivel_id 146   (antes NULL)
  bitácora            2 renglones: alta de nivel_activo 146, y activo.nivelId (vacío) -> 146
  activos sin nivel   3 -> 2

Comprobado en el árbol que dibuja /tecnologia/grafo (`armarArbol`):

  n146 «PERSONAS» · padre n11 GESTIÓN DE PROYECTOS · profundidad 2 · meta «1 activo(s)»
  debajo: PRY-PER-0002 · 592 nodos en total

Deshacer, si hiciera falta: `activo.nivel_id` de #538 a NULL y `nivel_activo` #146 a
`activo = false`.
```
- [ ] **4.4** El PR describe también el resultado de la Fase 1 contra producción: cuántos renombres,
      cuántas fusiones, y la salida guardada de 1.4.

## Fase 5 · Deuda que este cambio deja anotada

- [ ] **5.1** `e2e/` no cubre el recorrido de carga y clasificación de activos — el que motivó tres
      de las cinco cicatrices de HARNESS.md. Este cambio agrega un recorrido más que se prueba a
      mano. Candidato natural a `e2e/jerarquia.spec.ts`, **que sólo lee**.
- [ ] **5.1.b** **`e2e/grafo.spec.ts:149` depende de que el inventario tenga huecos.** El paso 11
      hace `selectOption({ label: 'Sin nivel' })`. Hoy quedan **2** activos vigentes sin nivel —eran
      3 y este recorrido ubicó uno—. El día que se ubiquen los tres, esa opción puede desaparecer y
      el paso se cae con un error que habla de un `selectOption`, no de que se acabaron los activos
      sin ubicar. **Y este cambio existe para que ubicarlos sea fácil**, así que es el efecto
      secundario natural de que funcione. Ese paso necesita un caso armado, no un accidente de los
      datos. *(Filo detectado por indicadores-40 al revisar el spec antes del recorrido; los pasos
      8 y 11 los verificó: el 8 deriva sus dos números de la pantalla y sobrevive.)*
- [ ] **5.1.c** Los tres selects de la jerarquía **no se pueden direccionar por etiqueta**: su
      nombre accesible concatena la etiqueta con el texto de la opción elegida
      (`NIVEL 3— elige el nivel 2 —`), así que ni `getByLabel` por subcadena ni exacto sirven. El
      recorrido tuvo que ir por `title`. Es un olor de accesibilidad y hace frágil cualquier
      recorrido futuro: un lector de pantalla anuncia lo mismo que ve Playwright.
- [ ] **5.2** La asimetría de D2: `CÓDIGO  FUENTE` con dos espacios internos entraría al índice.
      Ningún escritor lo produce. Anotado, no arreglado.
- [ ] **5.3.b** Voseo preexistente en `FichaActivo.tsx:2556` («elegí una cuenta del dominio»),
      en `CuentasDelActivo`. HARNESS.md lo prohíbe. Está fuera de lo que este cambio toca, así que
      queda anotado y no arreglado: los dos de la jerarquía sí se corrigieron porque eran copy de
      esta pantalla.
- [ ] **5.3** Las tildes siguen distinguiendo identidades. `auditar-niveles.ts` §4 ya mide lo que
      costaría unificarlas. Decisión con dueño, sin fecha.
