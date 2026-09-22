# Catálogo de Nivel 3, y el árbol del inventario enderezado

> Borrador del cuerpo del PR. **Mergear a `main` despliega a producción**, así que esto se lee
> antes, no después.

## Qué arregla

En la ficha del activo, el selector de **Nivel 3** sólo ofrecía los nodos que ya colgaban del
Nivel 2 elegido. Bajo `PROYECTOS / INC` eso eran dos opciones, así que un activo de código fuente
en INC **no se podía clasificar sin salir de la ficha** a crear el nodo en `/tecnologia/niveles` y
volver. El vocabulario real de la organización son 27 nombres; el selector ofrecía los que la rama
ya tuviera.

Detrás había una causa y una fábrica:

- **La causa.** `nivel_activo_identidad` indexaba el nombre **literal**, así que `MONITOR` y
  `Monitor` le parecían distintos. En producción convivieron bajo el mismo padre, y
  `PRODUCTOS` / `Productos` como dos raíces.
- **La fábrica.** `plantilla_nivel` —la única lista de nombres de Nivel 3 del sistema, y lo que
  `aplicarPlantilla` usa para crear las ramas de un producto nuevo— tenía cuatro nombres por clase
  y **los cuatro divergían del árbol real**. Cualquier limpieza que no la tocara se deshacía con el
  próximo producto.

## Qué entra

| | |
|---|---|
| `catalogo_nivel_3` | El vocabulario por clase. 52 filas, derivadas del árbol en la propia migración |
| `plantilla_nivel` | Subordinada al catálogo por llave foránea: ya no puede inventar nombres |
| El selector | Ofrece lo que la rama tiene **y** lo que el catálogo permite, en dos grupos |
| `guardarDatosGenerales` · `crearActivo` | Instancian un nombre del catálogo bajo la rama, al guardar |
| `nivel_activo_identidad` | Pasa a `(grado, upper(btrim(nombre)), padre_id)`, `NULLS NOT DISTINCT`, `WHERE activo` |
| `lib/sig/aplicar-fusion.ts` | El ejecutor de la fusión, sacado del script para poder ejercerlo |
| `scripts/verificar-fusion.ts` | El arnés que faltaba: ejecuta el SQL contra la forma real del árbol |

## Lo que ya se hizo sobre datos, y no viaja en este PR

**La estandarización del árbol se aplicó a mano, antes de este PR**, porque fusionar es mudar hijos
y activos y eso no es una migración: es una operación que se revisa antes de que ocurra.

```
Producción · 2026-09-22
  Aplicado: 4 fusión(es), 105 renombre(s), EMPRESA apagada.

  PRODUCTOS #2   absorbe #131 «Productos»    -> 1 activo cambia de rama (65 -> 66)
  MONITOR   #13  absorbe #127 «Monitor»
  MINTRACE  #6   absorbe #132 «Mintrace»
  DOCUMENTACIÓN PRIVADA #141 absorbe #133

  Auditoría posterior: 0 niveles con padre inexistente · 0 con padre apagado
                       0 activos fuera del grado 3
```

Lo mismo en la base local. **Los tres nodos absorbidos quedan `activo = false` conservando su
nombre**: es lo único que permite deshacer la fusión, y es la razón de que el índice nuevo sea
parcial.

## Cómo se verificó

### Regla 1 — el rojo, visto primero

| Qué | Rojo |
|---|---|
| `opcionesDeNivel3` | Se escribió primero el comportamiento actual a propósito: **5 fallaron, 8 pasaron** |
| `resolverNivel3` | 9 en rojo, las 13 anteriores intactas |
| `crearNivel` + catálogo | 1 en rojo de 5; las otras 4 pasaban de forma vacía, y así se dijo |
| El selector en la ficha | **Al revés: implementación primero.** Se comprobó con un control — catálogo forzado a vacío → 3 de 5 se caen |
| La fusión | Rojo **ejecutando SQL**, nombrando a `#133` |
| El índice nuevo | «Dos hermanos que sólo difieren en la caja: ACEPTADOS» → `RECHAZADOS` |

### Regla 2 — los checks

`npm run verificar` · `verificar:migraciones` · `verificar:fusion`, los tres en limpio.

### Regla 3 — el recorrido, ejecutado

```
Activo PRY-PER-0002 «Gestor de Programas y Proyectos», sin ubicar, en Gestión de Proyectos.
Su Nivel 2 no tenía PERSONAS, que es donde va un activo de tipo Personal.

  1. Abrir la ficha             -> Nivel 3 dice «— elige el nivel 2 —»
  2. CUANTICO / GESTIÓN DE PROY -> existentes: Documentación, Aplicaciones de negocio
  3. Abrir el Nivel 3           -> grupo «Del catálogo — se crea al guardar», 24 nombres
  4. Elegir PERSONAS            -> «Al guardar se crea… Si sales sin guardar, no se crea nada.»
  5. Guardar («Guardar 1 cambio») -> confirmado en pantalla
  6. Reabrir la ficha           -> «CUANTICO · GESTIÓN DE PROYECTOS · PERSONAS»

  Errores de JavaScript: ninguno.

Comprobado en la base, no deducido de la pantalla:
  nivel_activo #146 PERSONAS · grado 3 · padre 11 · activo
  activo #538 · nivel_id 146 (antes NULL) · 2 renglones de bitácora
En el árbol que dibuja /tecnologia/grafo: n146 bajo n11, «1 activo(s)», con PRY-PER-0002 debajo.

e2e/grafo.spec.ts tras la fusión: 1 passed (20,0 s). No se movió.
```

## Lo que costó, y qué se aprendió

**Tres intentos contra producción, dos revertidos por la transacción sin tocar un dato.**

1. **P2002.** El ejecutor mudaba los hijos de un nodo absorbido al superviviente **incluso cuando
   ese hijo estaba él mismo absorbido después**. Colisión en un estado intermedio que el estado
   final no tiene. El plan se había verificado tres veces —simulación local, simulación en
   producción, y un `diff` entre las dos— y las tres dijeron «0 conflictos». **Las tres tenían
   razón: ninguna ejecuta el SQL.** De ahí sale `verificar-fusion.ts`.
2. **P2028.** La transacción expiró a los 5.237 ms contra un límite de 5.000: ~110 escrituras
   secuenciales, cada una cruzando el túnel. En local, menos de un segundo. **La latencia es lo
   único que ningún ensayo local reproduce.**
3. Aplicado.

## Riesgos y reversión

- **Las fusiones ya ocurrieron** y no viajan en este PR. Deshacerlas es devolver `padreId`,
  `nivelId` y `nombre` a lo anotado, y reactivar los absorbidos. La salida del script y una
  instantánea de `nivel_activo` + `activo.nivel_id` + `producto.nivel_id` están guardadas.
- **Las migraciones** son aditivas salvo el índice, que se revierte con un `DROP` y recrear el
  anterior. Sin pérdida de datos.
- **El código** se revierte con el commit.
- **Producción corre hoy con el índice literal** hasta que este PR entre. Mientras tanto, nadie
  debe normalizar a mano el nombre de un nodo absorbido: reventaría por unicidad.

## Sin esto, el despliegue habría fallado

`_prisma_migrations` tenía `20260916200000_identidad_de_nivel` a medias desde el 18/09 —
`finished_at` y `rolled_back_at` en NULL— y Prisma se niega a aplicar **cualquier** migración
mientras haya una fila así. **El merge no habría desplegado nada**, y el fallo no habría hablado de
este PR. Se resolvió con `migrate resolve --rolled-back`, que sólo marca la fila.

Efecto secundario que importa: esa migración **se vuelve a aplicar**, su `CREATE INDEX IF NOT
EXISTS` queda en no-op, y su `UPDATE plantilla_nivel` corre por fin. Eso es lo que deja la plantilla
en mayúscula para que `20260922120100` le corrija las tildes y la FK no rechace nada.

*(Desatascado por indicadores-40, con el visto bueno del usuario.)*

## Fuera de alcance, y decidido a propósito

- **`CUANTICO` #4 como cuarta raíz**, contra D8. Tiene 263 activos; es decisión de negocio.
- **`ILC` #7/#129, `UNAD` #21/#122, `SIG` #12/#138**: mismo nombre bajo padres distintos. No son
  hermanos, así que el algoritmo no los toca, y con razón.
- **El reparto definitivo del vocabulario por clase.** El catálogo se sembró con los 27 nombres que
  hoy se usan; decidir si `CREDENCIALES` e `IDENTIDAD Y CREDENCIALES` son lo mismo es del SIG.

## Deuda que este cambio deja anotada

- `e2e/` no cubre el recorrido de carga y clasificación de activos.
- `e2e/grafo.spec.ts:149` depende de que el inventario tenga huecos: elige la opción «Sin nivel», y
  quedan 4 activos sin ubicar en producción. **Este cambio existe para que ubicarlos sea fácil**,
  así que romper esa prueba es el efecto secundario de que funcione.
- Los tres selects de la jerarquía **no se pueden direccionar por etiqueta**: su nombre accesible
  concatena la etiqueta con el texto de la opción. Un lector de pantalla anuncia eso mismo.
- `lib/sig/despliegues.ts:50` lleva un byte NUL crudo, así que git lo trata como binario y sus
  diffs no son revisables. El de `fusion-niveles.ts` se corrigió en este PR.
