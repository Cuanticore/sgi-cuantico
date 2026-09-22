# Exportar los planes de tratamiento, con los riesgos que los justifican — Especificación y diseño

**Fecha:** 2026-09-22
**Código:** PLA-SIG-02 · pantalla «Planes de tratamiento»
**Versión:** 1.0
**Módulo:** SGSI — Tratamiento del riesgo
**Afecta:** `lib/sgsi/planes-libro.ts` (nuevo), `app/api/sgsi/exportar-planes/route.ts` (nuevo), `app/components/sgsi/planes/PlanesTratamiento.tsx`
**Estado:** Diseñado, sin implementar

---

## 1. Qué se pide

Un botón que baje los planes de tratamiento en un Excel con formato, de dos hojas:

1. **Riesgos altos o críticos** — por qué existe el plan.
2. **Planes de tratamiento** — qué se va a hacer.

Las dos juntas son el paquete que se lleva a un comité o a una auditoría: el riesgo y su
tratamiento, en un archivo.

---

## 2. Lo que ya existe, y por qué no alcanza

### 2.1 El patrón de casa está resuelto

Siete libros del SGSI se generan con `exceljs`. El más reciente, `lib/sgsi/analisis-libro.ts`,
tiene el reparto correcto y es el que se copia:

> **La ruta comprueba la sesión y arma las filas; el módulo del libro no toca Prisma y sólo decide
> cómo se ve el ARCHIVO.** Por eso una prueba puede construir el libro y leerle los colores sin
> levantar nada.

No hace falta AG Grid Enterprise —el export con formato es de la versión de 999 USD— y no hace
falta elegir colores nuevos: `colorDeNivel` (`lib/sgsi/riesgo-activo.ts:162`) ya da el par
fondo/texto de cada banda, y es el mismo que pinta la pantalla.

### 2.2 Lo que hay no sirve como hoja 1

`lib/sgsi/registro-residual-libro.ts` produce una hoja por activo con banda y firmante. **Es otra
cosa**: es el registro de *aprobación* del riesgo residual, atado al acta —que, a 2026-09-21, no
la puede firmar nadie porque las diez áreas tienen `lider_cargo_id` en NULL—. Reusarlo ataría este
export a un flujo roto.

El informe de valoración (`/sgsi/informe-valoracion`) tampoco: sale del inventario completo y
responde otra pregunta.

---

## 3. Decisiones

### 3.1 Hoja 1 · una fila por ACTIVO, no por riesgo

Se descartó una fila por par (activo × amenaza) — el registro de riesgos de 6.1.2, de varios
cientos de filas. La hoja es **una fila por activo cuyo peor residual es Alto o Crítico** — del
orden de unas decenas, que es lo que se lee en una reunión.

**Cuántas exactamente, nadie lo ha medido.** Los ~30 que se citan en el repo son los activos que
alcanzan el umbral de valoración, que es otro conjunto (ver §3.3). El número real de esta hoja
hay que contarlo contra la base antes de mergear, y decirlo en el PR.

**Y el nombre de la hoja promete algo que no existe.** Medido contra las 34.914 filas de
`riesgo_calculo` el 2026-09-21: la banda Crítico empieza en 25.0 y **el residual máximo real es
13.0**, así que hay **cero** riesgos en Crítico. El reparto es Alto 191 · Medio 6.957 · Bajo
27.766 · Crítico 0.

La hoja se llama **«Riesgos altos»**, no «Riesgos altos o críticos». El filtro sigue incluyendo
Crítico —el día que la escala cambie tiene que funcionar— pero un libro que se archiva y se lleva
a un comité no puede titular una hoja con una banda que hoy no tiene ni una fila: quien la abra
concluirá que no hay riesgos críticos *porque se trataron*, y la verdad es que la escala no
permite llegar ahí. La nota de la fila 2 lo dice con todas sus letras.

**Lo que se pierde, y hay que decirlo:** la hoja no dice *qué amenaza* pone al activo en rojo. Para
eso está la pantalla, y la hoja lleva la cuenta —«3 de sus 14 amenazas en Alto o Crítico»— para
que se sepa cuántas hay que ir a mirar.

### 3.2 «Alto o crítico» se mide por RESIDUAL

Por inherente entraría casi todo el inventario valorado: el inherente es el riesgo antes de los
controles y sirve para justificar por qué cada control existe, no para decidir qué tratar. El
residual es lo que ISO/IEC 27001 6.1.3 obliga a tratar o a aceptar por escrito.

**El inherente viaja igual, como columna**, para que se vea de dónde bajó cada riesgo. Que un
activo pase de 9.6 a 7.2 es la evidencia de que los controles hacen algo, y sin la columna de
origen el 7.2 no se distingue de un riesgo que siempre estuvo ahí.

### 3.3 El alcance de cada hoja se escribe EN la hoja

El patrón de `analisis-libro.ts`: fila 1 el título, **fila 2 el alcance**, fila 3 los encabezados.

| Hoja | Alcance | Respeta el filtro de la pantalla |
|---|---|---|
| 1 · Riesgos | Todos los activos vigentes con peor residual Alto o Crítico | **No** — ese filtro es de acciones, no de riesgos |
| 2 · Planes | Las acciones activas | **Sí** |

La hoja 2 dice qué filtro se aplicó y cuántas acciones de cuántas salieron. Un archivo que no diga
su alcance es un archivo que miente seis meses después, cuando ya nadie recuerda qué había
seleccionado quien lo bajó.

**La hoja 1 no se limita a los activos «en análisis».** `filasAnalisis` deja fuera los que no
alcanzan `umbral_valoracion` (`analisis-riesgos.ts:358`), y para esta hoja ese recorte sería
incorrecto: un residual Alto es un residual Alto, lo alcance o no el umbral de valoración. La nota
de la fila 2 dice cuántos de cuántos vigentes salieron.

---

## 4. El diseño

### 4.1 Reparto

```
app/api/sgsi/exportar-planes/route.ts    sesión + permiso + datos          (toca Prisma)
lib/sgsi/planes-libro.ts                 cómo se ve el archivo             (puro, se prueba)
```

La ruta **no** está bajo `/sgsi`, así que la puerta del layout no la ve: comprueba `sgsi:ver`
explícitamente y responde **403 y no 404** a quien tiene sesión sin permiso. El archivo lleva el
inventario en riesgo; decir «no existe» sería mentir. Es la misma decisión, con la misma razón,
que `exportar-analisis/route.ts:8-10`.

### 4.2 Hoja 1 · «Riesgos altos o críticos»

| Columna | Origen |
|---|---|
| Código · Activo · Proceso · Propietario | `FilaAnalisis` |
| Valor · D · I · C · Criticidad | `FilaAnalisis` |
| Peor inherente | `peorInherente`, con el color de `colorDeNivel` |
| Peor residual | `peorResidual`, con el color de `colorDeNivel` |
| Amenazas en Alto o Crítico | cuenta sobre los riesgos vigentes del activo |
| Planes | los `PT-0NN` activos que lo cubren, separados por coma |
| Estado del plan | `textoDeEstadoPlan(estadoPlan)` |

El renglón lleva el acento rojo cuando **no** hay plan, con el mismo criterio de
`2026-09-22-acento-alto-sin-plan-design.md`. Si ese spec todavía no está implementado, el acento
usa `estadoPlan === 'pendiente'`, que es lo que hoy pinta la pantalla — **nunca un tercer
criterio inventado acá**.

### 4.3 Hoja 2 · «Planes de tratamiento»

Las once columnas de la grilla, **en el mismo orden que la pantalla**, y detrás lo que en pantalla
no cabe: origen y justificación, recursos, observaciones, fecha de aprobación, fecha de cierre,
instrumento, riesgo remanente, justificación de la aceptación y fecha de revisión.

El orden importa: quien exporta viene de ver la grilla, y un archivo que reordene las columnas lo
obliga a buscar dónde quedó cada una.

Las acciones **sin control asociado** —las que introduce
`2026-09-22-accion-nueva-sin-activo-design.md`— salen con «sin control» y las tres columnas de
madurez vacías, igual que en pantalla.

### 4.4 Detalles del archivo

- `autoFilter` sobre los encabezados de las dos hojas: recortar es la mitad de para qué se exporta.
- Paneles congelados en la fila de encabezados.
- Nombre: `Planes de tratamiento 2026-09-22.xlsx`.
- `Cache-Control: no-store`.

---

## 5. Lo que NO entra

- **Sin gráficos y sin tablas dinámicas.** Es un volcado con formato, no un tablero.
- **No es el informe de valoración**, que ya existe y sale del inventario completo.
- **No se toca `registro-residual-libro.ts`** ni el acta.
- **No se agrega ninguna consulta nueva a la pantalla**: la ruta lee por su cuenta.
- **No hay exportación a PDF ni a CSV.**

---

## 6. Pruebas · Regla 1 del harness

Todas contra `construirLibroPlanes`, que es puro. Se lee el libro en memoria con `exceljs` —el
mismo enfoque de `consolidado-libro.test.ts`— sin ruta, sin sesión y sin base.

| # | Qué prueba |
|---|---|
| P1 | El libro tiene dos hojas, con esos nombres y en ese orden |
| P2 | La hoja 1 sólo trae activos con peor residual Alto o Crítico — un activo en Medio no aparece |
| P3 | La hoja 1 trae un activo Alto **aunque no alcance el umbral de valoración** |
| P4 | La celda de banda lleva el **mismo color** que `colorDeNivel` da para esa banda |
| P5 | Un residual `null` **no se pinta** y dice «sin calcular» — pintarlo diría que el riesgo es alto, y lo que pasa es que no se sabe |
| P6 | El renglón sin plan lleva el acento; el que tiene plan, no |
| P7 | La fila 2 de cada hoja dice el alcance, con las dos cifras |
| P8 | La hoja 2 saca las columnas **en el orden de la pantalla** |
| P9 | Una acción sin control sale con «sin control» y las columnas de madurez vacías, no con ceros |
| P10 | Con cero filas, el libro se genera igual y la nota lo dice — no se cae ni baja el inventario entero |

P10 no es teórico: `9cd892c` arregló exactamente ese defecto en el export de inventario —exportar
con cero filas visibles bajaba los 378 activos—. El mismo error tiene dos formas y ésta es la otra.

P5 es la doctrina que ya sostiene el informe de valoración y la grilla: «no se sabe» no es «alto».

---

## 7. Recorrido de punta a punta · Regla 3

Aplica: hay un botón que una persona oprime y un archivo que abre.

```
Recorrido a ejecutar:
  1. Abrir /sgsi/planes, filtro «Todas»      -> 19 acciones
  2. Clic en «Exportar»                      -> baja «Planes de tratamiento 2026-09-22.xlsx»
  3. Abrirlo                                 -> dos hojas, en ese orden
  4. Hoja 1                                  -> contar las filas y anotarlo en el PR;
                                                las bandas con los colores de la
                                                pantalla; los sin plan en rojo
  5. Cotejar una fila contra la pantalla     -> mismo peor residual, mismos planes
  6. Volver, filtrar por «Aceptar»           -> la grilla se reduce
  7. Exportar otra vez                       -> la hoja 2 trae sólo ésas, y su fila 2
                                                dice el filtro y «N de 19»
  8. La hoja 1 del segundo archivo           -> IGUAL que la del primero
  9. Filtrar a algo con cero resultados      -> exporta igual, hojas vacías con su nota
```

El paso 8 es el que prueba que el filtro de acciones no se coló en la hoja de riesgos. El 9 es
P10 contra la aplicación de verdad.

---

## 8. Riesgos y dependencias

**Depende de los otros dos specs, pero no los bloquea.** Si el acento de «alto sin plan» no está,
la hoja 1 usa el criterio de hoy; si la acción sin control no está, la columna «sin control» no
tiene casos. Las dos son degradaciones limpias, y ninguna obliga a un orden de implementación.

**El costo de la consulta.** La hoja 1 necesita, por cada activo vigente, sus riesgos con residual
y qué plan los cubre. Es lo mismo que ya lee `leerAnalisisRiesgos`, así que no hay consulta nueva
— pero sí es la consulta más pesada de la aplicación, y acá corre en una ruta sin caché. Hay que
medir cuánto tarda con los 398 activos antes de mergear y decirlo en el PR.

**Dos hojas en un archivo no son dos archivos.** Si alguien quiere sólo la hoja de riesgos, se la
lleva con la de planes. Es aceptable: el pedido es el paquete, y separarlo sería dos botones.
