# El gate de verificación antes del despliegue — Especificación y diseño

- **Fecha:** 2026-09-16
- **Estado:** implementado
- **Alcance:** `package.json`, `.github/workflows/deploy.yml`, `.github/workflows/verificacion.yml`,
  `lib/__tests__/despliegue-verificado.test.ts`, `HARNESS.md`
- **Regla 3 del harness:** no aplica. El cambio no tiene pantalla ni recorrido que una persona
  opere; lo que sí se ejecutó, en verde y en rojo, está en la sección 7.

---

## 1. Qué se pide y por qué

«Un harness para correr los tests antes de los despliegues y con esto asegurar calidad.»

`HARNESS.md` ya existía y ya era exigente, pero era **un documento**. Enumeraba cinco comandos
obligatorios y admitía, en su propio texto, que no los corría nadie:

> Y el CI **no corre en el PR**: el workflow se dispara con el push a `main`. Si estos
> comandos no se corren a mano antes de mergear, no los corre nadie.

La brecha no era de rigor sino de mecanismo. En este repositorio mergear a `main` despliega a
producción, y el workflow `Build and Deploy` **arrancaba construyendo la imagen**: entre el
merge y producción no había ni tipos, ni ESLint, ni las 2332 pruebas. La única barrera era que
alguien se acordara.

El 16/09/2026 se cobró un despliegue: un `export const` dentro de un archivo `'use server'`
dejó a `main` sin compilar y producción se quedó con la imagen anterior.

## 2. Lo que el sistema tenía

`.github/workflows/deploy.yml`, un solo job sobre un runner **self-hosted que vive en el host
de producción**. Sus pasos, en orden:

1. Checkout
2. Preflight — variables requeridas por el servidor
3. Preflight — espacio en disco
4. Login a GHCR → Buildx → **construir y empujar la imagen**
5. Sincronizar compose y scripts → desplegar → respaldo

Los dos preflights valen la pena leerlos: los dos existen por la misma razón que este gate.
Fallan **antes** de construir, cuando fallar es gratis y el contenedor viejo sigue sirviendo.
El preflight de disco existe porque el despliegue #41 murió con `No space left on device`
después de haber construido la imagen entera.

El gate nuevo es el tercer preflight, y sigue el mismo criterio.

Tres hechos del entorno que condicionan todo el diseño:

- **El runner es el servidor de producción.** Todo lo que corra ahí compite por su CPU y su
  disco, y ese disco ya se llenó una vez.
- **El runner no tiene Node instalado**: el workflow nunca lo usó, sólo `docker`.
- **`next build` ignora los errores de TypeScript** (`ignoreBuildErrors: true`), así que
  construir la imagen no sustituye a `tsc --noEmit`. Y al revés tampoco: hay errores que sólo
  ve el build.

## 3. Decisiones

### D1 · Un solo comando, y los tres momentos corren el mismo

`npm run verificar` encadena los cuatro checks rápidos; `npm run verificar:build` agrega el
build. El PR, el despliegue y la terminal de quien programa invocan **esa misma cosa**.

La alternativa era desplegar la lista de comandos dentro de cada workflow. Se descartó porque
tres listas copiadas divergen, y la divergencia es silenciosa: la lista que se queda corta
sigue dando verde. Ésta es la misma forma de defecto que las tres cicatrices del 15/09 —el
problema no está en una pieza, está entre las piezas—.

Encadenado con `&&`, nunca con `;`: con `;` los cuatro corren igual y el código de salida es
el del último, así que una suite roja seguida de un lint verde sale 0.

### D2 · El gate del despliegue va antes de construir, no después

Después de construir, la imagen ya está en el registro y el disco del host ya pagó la
construcción. Antes, un rojo no cuesta nada y el contenedor viejo sigue sirviendo.

Va **después** de los dos preflights existentes, no antes: primero lo que cuesta segundos
—variables, disco—, después lo que cuesta minutos. Además el `npm ci` necesita disco, y el
preflight de disco es justo el que garantiza que lo haya.

### D3 · El gate del PR es un workflow aparte, y ése sí corre el build

Son dos momentos distintos, no una redundancia. En `main` el rojo aparece con el cambio ya
mergeado: la rama protegida queda rota y hay que arreglarla con prisa, que es como se cometen
los segundos errores. En el PR aparece cuando el cambio todavía no salió.

El despliegue **no** corre `next build` en su paso de verificación porque lo corre el
`docker buildx build` de dos pasos más abajo. El PR sí lo corre: ahí no hay imagen que
construir, y un build roto que no se ve en el PR es exactamente el despliegue caído del
16/09/2026.

### D4 · `actions/setup-node`, no una etapa del `Dockerfile`

La opción elegante era una etapa `verificacion` en el `Dockerfile`: reutiliza el árbol de
`deps`, no instala nada en el host y corre en el mismo entorno que el build. Se descartó por
dos razones concretas:

1. **`node:22-alpine` trae BusyBox `grep`, que no soporta `--include`**, y
   `lib/__tests__/use-server.test.ts` depende de esa bandera. La suite se caería dentro del
   contenedor por una razón que no tiene nada que ver con el código.
2. **No se pudo probar.** No hay Docker en la máquina donde se escribió esto, así que la
   etapa habría entrado a `main` sin haberse ejecutado nunca. Mergear un gate no probado para
   asegurar calidad es la contradicción exacta que este documento trata de cerrar.

`actions/setup-node@v4` descarga y cachea Node en el runner, así que no exige que el host
tenga Node —no lo tiene— y no depende de su PATH. Se fija `node-version: 22`, el mismo major
que `node:22-alpine` en el `Dockerfile`.

Si el disco del host vuelve a ser el problema, la etapa del `Dockerfile` es el camino a
revisar; el arreglo previo sería sacarle a `use-server.test.ts` la dependencia de GNU `grep`.

### D5 · El `node_modules` se borra al terminar, siempre

El workspace del runner persiste entre ejecuciones y `npm ci` deja alrededor de un giga. En
una máquina cuyo preflight exige 8G libres para construir, dejarlo puesto sería restarle un
giga a ese margen en cada despliegue.

Se borra con `if: always()` porque el caso que más importa es el del gate en rojo: ahí el job
se corta y nadie pasa a limpiar. El caché de npm (`~/.npm`) **no** se toca: es lo que hace que
el `npm ci` siguiente no vuelva a bajar el árbol entero de internet.

### D6 · El gate del PR no corre sobre forks

El runner vive en el host de producción. Un PR desde un fork ejecutaría código de un
desconocido en esa máquina. Se limita con

```yaml
if: github.event.pull_request.head.repo.full_name == github.repository
```

Quien puede abrir una rama en este repositorio ya puede empujar a `main`, así que no se le
concede nada nuevo. Un PR desde un fork no falla: se queda sin correr, y se ve que no corrió.

### D7 · `concurrency` con `cancel-in-progress`

Empujar tres veces seguidas a un PR no debería dejar tres verificaciones compitiendo por el
único runner que hay. Sólo interesa la última.

### D8 · El gate se protege a sí mismo con una prueba

`lib/__tests__/despliegue-verificado.test.ts` sostiene, en doce aserciones, que el camino a
producción siga pasando por los checks. Un gate es una línea de YAML que cualquiera puede
borrar sin que nada se ponga rojo; con esta prueba, borrarlo se pone rojo.

Tiene precedente en el repositorio: `use-server.test.ts` convirtió un fallo de build de más de
un minuto en una prueba de milisegundos sobre 36 archivos a la vez. Mismo movimiento.

Lo que sostiene:

| # | Aserción |
|---|---|
| 1 | `verificar` existe como script de npm |
| 2-5 | encadena `prisma generate`, `tsc --noEmit`, `lint` y `test` |
| 6 | encadena con `&&` y no con `;` |
| 7 | `verificar:build` existe y agrega el build |
| 8 | `deploy.yml` ejecuta el comando de verificación |
| 9 | lo ejecuta **antes** de `buildx build` |
| 10 | el paso no está marcado `continue-on-error: true` |
| 11 | `verificacion.yml` se dispara en `pull_request` |
| 12 | el PR corre **el mismo** comando |

La 9 y la 10 se escribieron dos veces. En la primera versión pasaban **en vacío**: con el paso
ausente, el índice es `-1` y `-1 < construccion` es cierto. Una prueba que pasa por ausencia
de lo que vigila no vigila nada, así que ahora afirma primero que los dos pasos existen.

## 4. Contrato

### 4.1 Scripts de npm

```json
"verificar":       "npx prisma generate && npx tsc --noEmit && npm run lint && npm test",
"verificar:build": "npm run verificar && npm run build"
```

### 4.2 Qué corre en cada momento

| Cuándo | Workflow | Comando | Si se pone rojo |
|---|---|---|---|
| Antes del PR | — | `verificar:build` | te enteras en segundos |
| El PR | `Verificación` | `verificar:build` | el PR queda en rojo antes de mergear |
| Push a `main` | `Build and Deploy` | `verificar` | no se construye nada; el contenedor viejo sigue sirviendo |

### 4.3 Dependencia nueva

`js-yaml` y `@types/js-yaml` en `devDependencies`. La prueba del gate necesita leer los
workflows como estructura y no como texto: afirmar «el paso A va antes que el paso B» con
`indexOf` sobre la fuente es frágil y da mensajes de error que no dicen nada. `js-yaml` ya
estaba en el árbol de forma transitiva —vía ESLint—; se declara explícitamente porque
depender de una dependencia de otro es depender de que ese otro no cambie.

## 5. Lo que este diseño deliberadamente no hace

- **No monta Playwright.** La Regla 3 sigue cumpliéndose a mano. Sigue siendo la primera deuda
  del harness.
- **No pone un hook de `pre-push`.** Añade fricción local para cubrir lo que el gate del PR ya
  cubre, y se salta con `--no-verify`.
- **No mueve el CI a `ubuntu-latest`.** El único runner que existe es el self-hosted;
  cambiarlo es una línea, pero depende de minutos de GitHub que no se sabe si la organización
  tiene.
- **No configura la protección de rama.** Requiere permisos de administración sobre el
  repositorio y no se puede hacer desde el código. Ver la sección 6.

## 6. Lo que queda pendiente, y sin esto el gate del PR sólo informa

GitHub deja mergear un PR con un check en rojo mientras ese check no esté marcado como
obligatorio en la protección de rama. Una vez, en `Settings → Branches`, sobre `main`:

- **Require status checks to pass before merging**, agregando el check `verificar`. Aparece en
  la lista después de la primera ejecución del workflow.
- **Require branches to be up to date before merging.** Sin esto, dos PR que pasan por
  separado pueden romper `main` al mergearse uno detrás del otro — que es, otra vez, un
  defecto que vive entre las piezas.

El gate del push a `main` **no depende de esto** y bloquea desde el primer despliegue.

## 7. Verificación ejecutada

Regla 1, en orden:

1. Se escribió `despliegue-verificado.test.ts` **antes** de tocar nada más.
2. Primera corrida: la suite no arrancaba (`ENOENT` sobre `verificacion.yml`) y no se veía
   ninguna aserción. Se corrigió para que un workflow ausente ponga roja la aserción concreta.
3. Segunda corrida: **10 rojas, 2 verdes** — y las 2 verdes lo estaban en vacío. Se
   endurecieron.
4. Tercera corrida: **12 de 12 en rojo.**
5. Se implementaron los scripts y los dos workflows.
6. **12 de 12 en verde.**

Regla 2, sobre el árbol completo:

```
npm run verificar   -> prisma generate ok · tsc 0 errores · eslint 0 errores (5 warnings
                       preexistentes) · 126 suites, 2332 pruebas, todo verde · EXIT 0
npm run build       -> compila · EXIT 0
```

Y la cadena vista en rojo, que es lo que demuestra que corta:

```
# con un error de tipos deliberado en un archivo temporal
npm run verificar   -> lib/__tmp-gate-roto.ts(2,14): error TS2322 · EXIT 2
                       ESLint y Jest NO llegaron a correr — el && cortó
```

**Lo que no se pudo ejecutar:** los dos workflows. No hay Docker ni un runner de GitHub
Actions en la máquina donde se escribió esto, así que el YAML está validado como estructura
—la prueba lo parsea— y revisado a mano, pero la primera ejecución real será la primera vez
que corran. El riesgo concreto está acotado a `actions/setup-node` sobre el runner
self-hosted; si ese paso falla, falla **antes** de construir y el contenedor viejo sigue
sirviendo, que es precisamente para lo que se ordenaron así los pasos.
