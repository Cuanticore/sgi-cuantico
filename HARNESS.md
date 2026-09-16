# Harness de entrega

Reglas obligatorias para todo cambio que entre a `main`. No son recomendaciones.

En este repo **mergear a `main` despliega a producción**: el workflow `Build and Deploy`
corre en el push a `main`, no en el PR. No hay paso intermedio, no hay staging, no hay
revisión después del merge. Lo que se mergea, sale.

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
npx prisma generate     # obligatorio antes de tsc, si no da ~30 falsos errores
npx tsc --noEmit        # 0 errores
npm run lint            # 0 errores (los 5 warnings preexistentes se toleran)
npm test                # todo verde
npm run build           # tiene que compilar
```

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

Y el CI **no corre en el PR**: el workflow se dispara con el push a `main`. Si estos
comandos no se corren a mano antes de mergear, no los corre nadie.

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

**No hay runner de pruebas de punta a punta.** `@playwright/test` está en las
`devDependencies`, pero no existe `playwright.config.*` ni un solo spec. La dependencia
declarada sin arnés es peor que no tenerla: en el `package.json` parece cubierto y no cubre
nada.

Mientras eso siga así, la Regla 3 se cumple **a mano**, y el recorrido escrito en el PR es la
única evidencia que queda. Funciona, pero no se repite solo: no protege contra la regresión
de dentro de tres meses, que es justo cuando nadie se acuerda de por qué existía la regla.

Montar Playwright y automatizar el recorrido de carga de activos es la primera deuda a pagar.
Cuando exista, esta sección se reemplaza por el comando que lo corre, y la Regla 3 pasa a ser
verificable como las otras dos.

---

## Nota sobre este repo

- Los libros del SGSI (`*.xlsx`, `*.xls`, `*.xlsm`) y `Errores.txt` **no entran al
  repositorio**: llevan nombres de personas y descripciones de sistemas reales.
- Los mensajes de commit no llevan atribución a herramientas de IA.
- El copy visible al usuario va en español de Colombia: `tú` o impersonal, imperativo sin
  tilde aguda. Nada de voseo.
