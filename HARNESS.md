# Harness de entrega

Reglas obligatorias para todo cambio que entre a `main`. No son recomendaciones.

En este repo **mergear a `main` despliega a producción**: el workflow `Build and Deploy`
corre en el push a `main`. No hay paso intermedio, no hay staging, no hay revisión después
del merge. Lo que se mergea, sale.

Por eso el despliegue verifica antes de construir, y el PR verifica antes de dejar mergear:
un rojo en `main` no es un build roto, es producción sin desplegar. Ver
[Quién corre esto, y cuándo](#quién-corre-esto-y-cuándo).

---

## Por qué existe este documento

El 2026-09-15, en una sola sesión, **tres bugs seguidos llegaron a producción con la suite
en verde** y reventaron en el primer uso real:

| Bug | Tests en verde al mergear | Qué pasaba al usarlo |
|---|---|---|
| `rowCount` inflado | 1963 | el proceso moría por falta de memoria al subir el archivo |
| Bucle al crear catálogo | 2020 | elegir «crear» no llevaba a ningún lado: se revalidaba para siempre |
| El mapeo se borraba a sí mismo | 2030 | el servidor rechazaba la decisión que la persona acababa de tomar |
| `export const` en `'use server'` | 2093 | el despliegue falló: `main` no compilaba |

Los tres comparten la misma forma. **Ninguno era un defecto de una pieza: los tres vivían
entre las piezas.** Cada unidad hacía bien su trabajo; lo que fallaba era la composición —
un paso que no escribía alimentando a otro que esperaba que hubiera escrito, un número de
fila que dos funciones contaban desde orígenes distintos, una lista que se encogía justo
cuando otra la necesitaba entera.

Una suite unitaria no ve eso por construcción. Prueba las piezas de a una, que es
exactamente donde el defecto no estaba.

No se agregan reglas por disciplina. Se agregan porque hay tres cicatrices.

---

## Regla 1 · Ningún cambio de comportamiento sin un test que falle primero

Escribe el test **antes** del arreglo y **verifícalo en rojo**. Un test escrito después pasa
por construcción y no prueba nada: prueba que el código hace lo que hace.

Ver el rojo es la parte que no se puede saltar. Es lo único que demuestra que el test
realmente mira lo que dice mirar.

Excepciones, y sólo éstas: cambios que no alteran comportamiento observable —renombres,
comentarios, formato, tipos sin efecto en runtime, documentación—.

## Regla 2 · Ningún PR sin los tres checks en limpio

```bash
npm run verificar         # prisma generate && tsc --noEmit && lint && test
npm run verificar:build   # los cuatro de arriba, y además el build
```

Es un solo comando y encadenado con `&&`: el primero que se pone rojo corta, y el código de
salida es distinto de cero. Con `;` los cuatro correrían igual y saldría el del último — una
suite roja seguida de un lint verde daría salida 0.

Lo que corre por dentro, y por qué está en ese orden:

```bash
npx prisma generate     # obligatorio antes de tsc, si no da ~30 falsos errores
npx tsc --noEmit        # 0 errores
npm run lint            # 0 errores (los 5 warnings preexistentes se toleran)
npm test                # todo verde
npm run build           # tiene que compilar
```

**No los copies a mano en otro lado.** Que el PR, el despliegue y tu terminal corran
exactamente la misma invocación es lo que impide que las tres listas se separen; el día que
se separen, la que se queda corta sigue dando verde y nadie se entera.
`lib/__tests__/despliegue-verificado.test.ts` es lo que sostiene esa igualdad.

Una advertencia sobre `tsc`: `tsconfig.json` trae `incremental: true` y el caché
(`tsconfig.tsbuildinfo`) puede quedar rancio y reportar errores de código que ya se arregló.
Falla del lado seguro —alarma de más, nunca de menos—, pero si ves un error que no aparece en
el archivo que nombra, borra `tsconfig.tsbuildinfo` y vuelve a correr. En CI no pasa: cada
ejecución arranca de un checkout limpio.

`next build` **ignora los errores de TypeScript** (`ignoreBuildErrors: true`), así que no
reemplaza a `tsc --noEmit`. Pero tampoco al revés: hay errores que **sólo** el build ve.

**El build entró a esta lista el 16/09/2026, y por una cicatriz.** Un `export const` en un
archivo `'use server'` tumbó el despliegue de `main`. Los otros tres checks daban verde:
`tsc` no conoce la regla —no es de tipos, es de la frontera cliente/servidor—, ESLint
tampoco, y Jest no aplica la directiva. Producción se quedó con la imagen anterior.

Cuando un error de build se pueda convertir en un test, conviértelo: `npm run build` tarda
más de un minuto y `lib/__tests__/use-server.test.ts` cubre esa misma clase de fallo en
milisegundos, sobre los 36 archivos a la vez. El build sigue siendo obligatorio igual —
atrapa lo que todavía no tiene test.

### Quién corre esto, y cuándo

Hasta el 16/09/2026 la respuesta era «tú, a mano, o nadie»: el único workflow se disparaba con
el push a `main` y empezaba construyendo la imagen. Ni los tipos, ni ESLint, ni las pruebas
eran condición para llegar a producción. Ahora son tres momentos:

| Cuándo | Qué corre | Qué pasa si se pone rojo |
|---|---|---|
| Tu terminal, antes del PR | `npm run verificar:build` | te enteras en segundos, que es lo barato |
| El PR (`Verificación`) | `npm run verificar:build` | el PR queda en rojo antes de mergear |
| El push a `main` (`Build and Deploy`) | `npm run verificar` | **no se construye nada**: el contenedor viejo sigue sirviendo |

El despliegue no corre el build en ese paso porque lo corre el `docker buildx build` de dos
pasos más abajo: compilar dos veces no agrega información. El PR sí lo corre, porque ahí no
hay imagen que construir y es justo el error que tumbó el despliegue del 16/09/2026.

Correrlo a mano antes del PR **sigue siendo lo correcto**, y no por disciplina: el CI tarda
minutos y tu terminal tarda segundos.

> **Pendiente de configuración en GitHub, y hasta que se haga esto el gate del PR no bloquea
> nada.** El workflow `Verificación` corre en cada PR, pero GitHub deja mergear un PR con el
> check en rojo mientras ese check no esté marcado como obligatorio. Se hace una sola vez, en
> `Settings → Branches → Add branch ruleset` (o `Add rule`) sobre `main`:
>
> - **Require status checks to pass before merging**, y agregar el check llamado `verificar`.
>   Aparece en la lista después de la primera ejecución del workflow: si todavía no corrió
>   nunca, GitHub no lo ofrece.
> - **Require branches to be up to date before merging** — sin esto, dos PR que pasan por
>   separado pueden romper `main` al mergearse uno detrás del otro. Es el caso de los tres
>   bugs de arriba: el defecto vivía entre las piezas, no en una.
>
> Requiere permisos de administración sobre el repositorio. El gate del push a `main` **no
> depende de esto** y bloquea desde el primer despliegue.

### Qué deja el despliegue cuando se cae

Un rojo en `Build and Deploy` escribe un resumen en la página del run —no sólo en el log, que
hay que descargar y leer entero— con lo que hace falta para decidir sin entrar al servidor:

- **qué contenedor siguió sirviendo**, porque un despliegue caído no deja producción vacía y
  suponer lo contrario lleva a movimientos apurados;
- **qué migraciones quedaron en mal estado**, con el comando exacto para resolverlas;
- las últimas migraciones registradas y las últimas líneas del contenedor.

Entró el 18/09/2026. Ese día `migrate deploy` abortó con `42703: column "nombre" does not
exist` y el log decía eso y nada más. Lo que de verdad importaba —que el índice SÍ se había
creado antes de abortar, y que había **dos** migraciones rotas y no una— hubo que ir a
buscarlo por SSH. Ese diagnóstico ya estaba ahí: la conexión abierta, el contenedor
corriendo, el estado a una consulta de distancia.

Y entrar a producción a diagnosticar es justo lo que uno no quiere estar haciendo con el
despliegue caído y prisa encima: es el momento de menos calma y más permisos.

El despliegue exitoso también deja resumen, y avisa si quedan migraciones rotas aunque haya
pasado — una migración que nadie resolvió no falla hoy, falla el día que alguien agregue la
siguiente, sin relación aparente con su cambio.

`lib/__tests__/despliegue-diagnosticable.test.ts` es lo que impide que esto se borre: es un
bloque de YAML que sólo corre cuando algo ya salió mal, así que puede romperse y pasar meses
sin que nadie lo note — hasta el día que se necesita.

## Regla 3 · Ningún merge sin prueba de punta a punta, cuando aplica

«De punta a punta» significa **ejecutar el recorrido completo como lo hace una persona**,
contra la aplicación corriendo, con datos reales o equivalentes a los reales.

No cuenta como prueba de punta a punta:

- que la suite unitaria pase;
- que `curl` devuelva 200;
- que el servidor levante y la imagen sea la nueva;
- razonar que el flujo debería funcionar.

Los tres bugs de arriba sobrevivieron a todo eso.

### Cuándo aplica

**Aplica** cuando el cambio toca algo que una persona opera:

- una pantalla o un componente con estado;
- un flujo de más de un paso, donde la salida de uno alimenta al siguiente;
- una server action invocada desde la interfaz;
- lectura de archivos subidos por el usuario;
- cualquier cosa donde el usuario decide algo y el sistema reacciona.

**No aplica** cuando el cambio es interno y no hay recorrido que recorrer:

- refactor sin cambio de comportamiento observable;
- tipos, comentarios, documentación;
- datos de catálogo o migraciones sin pantalla asociada;
- scripts que no toca ningún usuario.

Ante la duda, aplica. El costo de probar de más es media hora; el de probar de menos ya está
medido arriba, tres veces.

### Qué escribir en el PR

Cuando aplica, el PR describe **el recorrido que se ejecutó y qué se vio**, paso por paso.
No basta con «probado»: eso no es verificable ni por quien revisa ni por quien vuelva dentro
de seis meses.

```
Recorrido ejecutado (FOR-SIG-12 V21, 94 filas):
  1. Subir el archivo          -> «Faltan 4 por decidir», botón apagado
  2. Crear proveedor «Claude»  -> aparece el campo de nombre con «Claude»
  3. Mapear ubicación «Claude» -> el selector ofrece las 9 ubicaciones
  4. Aplicar y revalidar       -> «Importar 94 activos»
  5. Importar                  -> 94 creados, 2 catálogos registrados
  6. Abrir el inventario       -> 393 activos, los nuevos con su código
```

Cuando no aplica, dilo y di por qué. Una línea alcanza.

---

## Lo que este harness todavía no puede exigir de forma automática

De las tres reglas, **sólo la 2 está automatizada.** Conviene tenerlo presente: el CI en verde
dice que los checks pasaron, no que la Regla 1 y la Regla 3 se cumplieron.

**La marca de *required* no está puesta.** El workflow `Verificación` corre en cada PR, pero
GitHub deja mergear un PR con un check en rojo mientras ese check no esté marcado como
obligatorio en la protección de rama. Hasta que alguien con permisos de administración corra
el comando de la Regla 2, el gate del PR **informa pero no bloquea**. El del push a `main` sí
bloquea desde el primer día: ahí no hay nada que marcar, el despliegue simplemente no ocurre.

**Nadie verifica que el test se haya visto en rojo primero.** La Regla 1 es la más importante
de las tres y es la única que no deja rastro: un test escrito después del arreglo pasa igual y
se ve idéntico en el diff. No hay forma razonable de automatizar eso; queda en la honestidad
de quien escribe y en lo que diga el PR.

**El runner de punta a punta ya existe, y cubre un solo recorrido.** Desde el 16/09/2026 hay
`playwright.config.ts` y `e2e/`. Deja de ser cierto que la dependencia esté declarada sin arnés;
sigue siendo cierto que casi todo se prueba a mano.

---

## El runner de punta a punta

```powershell
$env:DATABASE_URL = '…'   # una base con datos reales; hoy, el túnel SSM
npm run e2e
```

Levanta `next dev` solo —o reutiliza el que esté corriendo— y corre los specs de `e2e/`.
Chromium, un trabajador, **sin reintentos**: un recorrido que sólo pasa a veces no es evidencia.

**No está en `verificar:build`, y es a propósito.** Necesita una base con datos reales, que hoy
es producción por el túnel. Encadenarlo a los checks locales haría que `npm run verificar`
fallara en cualquier máquina sin túnel, y la respuesta a eso siempre termina siendo saltárselo.

**La sesión se acuña, no se inicia.** `/tecnologia/:path*` está detrás de Azure AD, y
automatizar un inicio de sesión corporativo arrastraría MFA y las credenciales de una persona a
un archivo. `e2e/sesion.ts` firma un token con el mismo `NEXTAUTH_SECRET` de la aplicación y lo
pone como cookie, con el grupo `Líderes SIG` que exige la puerta del layout. Sin el secreto la
cookie no vale nada, así que no debilita ninguna puerta. Si mañana cambia el nombre del grupo,
el recorrido falla — y tiene que fallar.

**Los specs de `e2e/` sólo leen.** Es la regla que hace tolerable correr contra producción:
navegar y hacer clic sí, escribir nunca. Lo que necesite escribir va a la suite unitaria, con
datos armados a mano.

| Spec | Recorrido | Pasos |
|---|---|---|
| `e2e/grafo.spec.ts` | `/tecnologia/grafo` · filtro por Nivel 1/2/3, frontera, acomodo determinista | 13 |

**Lo que sigue a mano.** El recorrido de carga de activos —el que motivó tres de las cuatro
cicatrices de arriba— todavía no tiene spec, y es la siguiente deuda. Mientras tanto ese flujo
se prueba a mano y el recorrido escrito en el PR es la única evidencia que queda.

`test-results/` no entra al repositorio. Las trazas y capturas de un recorrido fallido llevan la
pantalla entera —códigos de activo, IP, nombres de servidores—, que es exactamente el mapa que
el layout de `/tecnologia` se niega a mostrar sin el grupo del Directorio.

---

## Nota sobre este repo

- Los libros del SGSI (`*.xlsx`, `*.xls`, `*.xlsm`) y `Errores.txt` **no entran al
  repositorio**: llevan nombres de personas y descripciones de sistemas reales.
- Los mensajes de commit no llevan atribución a herramientas de IA.
- El copy visible al usuario va en español de Colombia: `tú` o impersonal, imperativo sin
  tilde aguda. Nada de voseo.
