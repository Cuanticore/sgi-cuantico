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

- [ ] **4.1** `npm run verificar:build` en limpio. **No pipear a `tail`**: el código de salida del
      pipe es el del último comando y reporta 0 con la suite en rojo.
- [ ] **4.2** `npm run verificar:migraciones` en limpio.
- [ ] **4.3** **Regla 3 — aplica.** Hay pantalla, hay estado y hay una decisión de la persona. El
      recorrido, paso a paso, en el PR:

```
Recorrido ejecutado (activo de INC, base local 5432):
  1. Abrir la ficha del activo          -> Nivel 1 PROYECTOS, Nivel 2 INC, Nivel 3 «— sin ubicar —»
  2. Abrir el selector de Nivel 3       -> 2 existentes + el catálogo de PROYECTOS, separados
  3. Elegir «CÓDIGO FUENTE» y NO guardar-> salir; /tecnologia/grafo sigue con 2 hijos bajo INC
  4. Volver, elegir «CÓDIGO FUENTE»     -> Guardar
  5. Reabrir la ficha                   -> PROYECTOS · INC · CÓDIGO FUENTE
  6. Abrir /tecnologia/grafo            -> INC con 3 hijos, el nuevo con 1 activo
  7. Repetir el paso 4 con otro activo  -> reutiliza el nodo, no crea un segundo
```

- [ ] **4.4** El PR describe también el resultado de la Fase 1 contra producción: cuántos renombres,
      cuántas fusiones, y la salida guardada de 1.4.

## Fase 5 · Deuda que este cambio deja anotada

- [ ] **5.1** `e2e/` no cubre el recorrido de carga y clasificación de activos — el que motivó tres
      de las cinco cicatrices de HARNESS.md. Este cambio agrega un recorrido más que se prueba a
      mano. Candidato natural a `e2e/jerarquia.spec.ts`, **que sólo lee**.
- [ ] **5.2** La asimetría de D2: `CÓDIGO  FUENTE` con dos espacios internos entraría al índice.
      Ningún escritor lo produce. Anotado, no arreglado.
- [ ] **5.3.b** Voseo preexistente en `FichaActivo.tsx:2556` («elegí una cuenta del dominio»),
      en `CuentasDelActivo`. HARNESS.md lo prohíbe. Está fuera de lo que este cambio toca, así que
      queda anotado y no arreglado: los dos de la jerarquía sí se corrigieron porque eran copy de
      esta pantalla.
- [ ] **5.3** Las tildes siguen distinguiendo identidades. `auditar-niveles.ts` §4 ya mide lo que
      costaría unificarlas. Decisión con dueño, sin fecha.
