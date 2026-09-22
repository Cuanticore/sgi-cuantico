# El formulario del plan de tratamiento · Plan de implementación

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para implementarlo tarea por tarea. Los pasos
> usan casillas (`- [ ]`) para llevar la cuenta.

**Objetivo:** que editar un plan de tratamiento entre de una en la pantalla, y que Observaciones
deje de ser un campo de una línea.

**Arquitectura:** la carcasa compartida `Popup.tsx` gana un tope de alto opcional —con el valor de
hoy por defecto, para que los otros siete popups no cambien— y `PopupAccion.tsx` lo usa junto con
un ancho mayor y los campos reagrupados en seis bloques. Ninguna acción de servidor cambia.

**Herramientas:** Next.js, React, Tailwind, Jest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-22-plan-tratamiento-formulario-design.md`

---

## Antes de empezar · tres cosas del entorno

**No se crea un worktree.** Seis sesiones comparten este árbol y hay un tablero de coordinación en
`C:\tmp\coordinacion-indicadores.md`. Crear un worktree acá desordena esa coordinación.

**Nunca `git add -A`, `git commit -a` ni `git stash`.** Hay trabajo sin commitear de otras
sesiones en el árbol. Cada paso de commit de este plan lista las rutas explícitas.

**`npx tsc --noEmit` está rojo por trabajo ajeno** —`analisis-riesgos.query.ts:231-232` y la prop
`encabezado` de `GrillaAnalisis`—. Mientras siga así, `npm run verificar` no llega al final. Corre
las pruebas con `npx jest <ruta>` mientras trabajas, y deja `npm run verificar` para cuando esa
otra rama esté verde. **Corre las pruebas desde Bash, no desde PowerShell.**

**Ningún archivo de este plan lo está tocando otra sesión.** Se comprobó el 2026-09-22.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `app/components/sgsi/Popup.tsx` | La carcasa: overlay, tarjeta, tope de alto | Modificar |
| `app/components/sgsi/__tests__/Popup.test.tsx` | Que el tope por defecto no cambie | **Crear** |
| `app/components/sgsi/planes/PopupAccion.tsx` | El formulario de la acción | Modificar |
| `app/components/sgsi/planes/__tests__/PopupAccion.test.tsx` | Observaciones multilínea y el orden | **Crear** |

---

### Tarea 1 · `Popup` gana un tope de alto opcional

**Archivos:**
- Modificar: `app/components/sgsi/Popup.tsx:18-27` (props), `:55` (overlay), `:86` (cuerpo)
- Crear: `app/components/sgsi/__tests__/Popup.test.tsx`

- [ ] **Paso 1 · Escribir las pruebas que fallan**

Crea `app/components/sgsi/__tests__/Popup.test.tsx` con exactamente esto:

```tsx
// app/components/sgsi/__tests__/Popup.test.tsx
//
// El tope de alto del cuerpo. La prueba que importa no es la del popup que pide más alto:
// es la del que NO PIDE NADA. `Popup` lo usan ocho pantallas y siete no van a cambiar, así
// que el valor por defecto es una invariante, no una implementación.
//
// Se afirma sobre `style.maxHeight` y no sobre una clase porque el tope es un valor
// calculado, y jsdom conserva `min()` y `calc()` íntegros — se comprobó antes de escribir
// esto.

import { render, screen } from '@testing-library/react';
import Popup from '../Popup';

function montar(props: { alto?: string } = {}) {
  render(
    <Popup titulo="Prueba" ancho={820} onCerrar={() => {}} {...props}>
      <p>contenido</p>
    </Popup>,
  );
}

function cuerpo(): HTMLElement {
  const el = screen.getByRole('dialog').querySelector('[data-popup="cuerpo"]');
  if (el === null) throw new Error('El popup no marca su cuerpo con data-popup="cuerpo".');
  return el as HTMLElement;
}

describe('el tope de alto del cuerpo', () => {
  it('sin `alto`, se topa en 61vh — los siete popups que no piden nada no cambian', () => {
    montar();
    expect(cuerpo().style.maxHeight).toBe('61vh');
  });

  it('con `alto`, lo usa', () => {
    montar({ alto: '80vh' });
    expect(cuerpo().style.maxHeight).toContain('80vh');
  });

  it('con `alto`, la tarjeta no puede desbordar la pantalla', () => {
    // 216px = los 96 del margen del overlay más los ~120 del encabezado y el pie. Sin este
    // tope, pedir 90vh deja el botón de guardar por debajo del borde y sin forma de llegar.
    montar({ alto: '80vh' });
    expect(cuerpo().style.maxHeight).toBe('min(80vh, calc(100vh - 216px))');
  });
});

describe('el margen del overlay', () => {
  it('sin `alto`, conserva los 78px de siempre', () => {
    montar();
    expect(screen.getByRole('dialog').className).toContain('py-[78px]');
  });

  it('con `alto`, cede a 48px', () => {
    // 78 arriba y 78 abajo son 156px que, sumados a un cuerpo de 80vh, no caben en la
    // ventana de una pantalla de 1080.
    montar({ alto: '80vh' });
    const overlay = screen.getByRole('dialog');
    expect(overlay.className).toContain('py-12');
    expect(overlay.className).not.toContain('py-[78px]');
  });
});
```

- [ ] **Paso 2 · Correr y verificar que fallan**

```bash
npx jest app/components/sgsi/__tests__/Popup.test.tsx
```

Esperado: **5 pruebas fallando.** Las tres primeras con
`El popup no marca su cuerpo con data-popup="cuerpo".`; la cuarta pasa por casualidad —hoy el
overlay sí tiene `py-[78px]`— y la quinta falla porque no hay prop `alto`.

**Si la cuarta pasa, está bien.** Es la invariante que ya se cumple; está para que se note si
alguien la rompe después.

- [ ] **Paso 3 · Añadir la prop `alto`**

En `app/components/sgsi/Popup.tsx`, dentro de `interface Props`, justo después de `ancho`:

```tsx
  /// Tope del cuerpo antes de que aparezca el desplazamiento. Por defecto `61vh`, que es lo
  /// que tenían los ocho popups antes de que esto fuera un parámetro: un popup que no pida
  /// nada tiene que verse exactamente igual que ayer.
  ///
  /// El tope REAL es el menor entre esto y `calc(100vh - 216px)` —96px de margen del overlay
  /// más ~120 de encabezado y pie—, para que la tarjeta no pueda desbordar la pantalla por
  /// muy alto que se le pida. Un popup cuyo botón de guardar queda por debajo del borde no
  /// es un popup alto: es un popup inusable.
  alto?: string;
```

Y en la firma del componente:

```tsx
export default function Popup({ titulo, subtitulo, ancho, alto, onCerrar, pie, children }: Props) {
```

- [ ] **Paso 4 · Aplicarla al overlay y al cuerpo**

Reemplaza la línea 55 (`className` del overlay):

```tsx
      className={`fixed inset-0 z-[60] flex items-start justify-center px-5 ${
        alto === undefined ? 'py-[78px]' : 'py-12'
      }`}
```

Reemplaza el div del cuerpo (línea 86):

```tsx
        <div
          data-popup="cuerpo"
          className="overflow-y-auto px-5 py-4"
          style={{
            maxHeight: alto === undefined ? '61vh' : `min(${alto}, calc(100vh - 216px))`,
          }}
        >
          {children}
        </div>
```

- [ ] **Paso 5 · Correr y verificar que pasan**

```bash
npx jest app/components/sgsi/__tests__/Popup.test.tsx
```

Esperado: **5 pasando.**

- [ ] **Paso 6 · Comprobar que no se rompió ningún otro popup**

```bash
npx jest app/components/sgsi app/sig --silent
```

Esperado: todo verde. Si algo falla acá, es que el cambio del overlay tocó a alguien más —y esa
es exactamente la razón de correrlo.

- [ ] **Paso 7 · Commit**

```bash
git add app/components/sgsi/Popup.tsx app/components/sgsi/__tests__/Popup.test.tsx
git commit -m "feat(sgsi): el alto del popup pasa a ser un parametro, con el de hoy por defecto

La carcasa la comparten ocho pantallas y el alto estaba escrito fijo en 61vh.
Ahora es opcional: quien no pide nada se ve igual que ayer, y hay una prueba
que lo vigila.

El tope real es el menor entre lo pedido y calc(100vh - 216px), para que la
tarjeta no pueda dejar el boton de guardar por debajo del borde.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 2 · Observaciones deja de ser una línea

**Archivos:**
- Modificar: `app/components/sgsi/planes/PopupAccion.tsx:442-448`
- Crear: `app/components/sgsi/planes/__tests__/PopupAccion.test.tsx`

- [ ] **Paso 1 · Escribir las pruebas que fallan**

Crea `app/components/sgsi/planes/__tests__/PopupAccion.test.tsx`:

```tsx
// app/components/sgsi/planes/__tests__/PopupAccion.test.tsx
//
// Observaciones era un `<input>` de una línea. El defecto no es el tamaño: es que un
// `<input>` DESCARTA LOS SALTOS DE LÍNEA, así que el seguimiento de tres reuniones se
// guardaba como un párrafo corrido y nadie se enteraba hasta releerlo.
//
// Por eso hay dos pruebas y no una. La del elemento sola pasaría con un `textarea` de una
// fila que sirviera de poco; la del viaje del dato es la que falla si el texto no sobrevive.
//
// El popup importa acciones de servidor, que arrastran `next/cache` —que en jsdom no
// arranca—. Se simulan, igual que hace `PopupPlanCritico.test.tsx`.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PopupAccion from '../PopupAccion';
import { guardarAccion } from '@/app/sgsi/acciones/plan';
import type { AccionVista } from '../PlanesTratamiento';

jest.mock('@/app/sgsi/acciones/plan', () => ({
  guardarAccion: jest.fn(),
  darDeBajaAccion: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const mockGuardar = guardarAccion as jest.Mock;

const ACCION: AccionVista = {
  codigo: 'PT-013',
  accion: 'Activar elevación temporal de privilegios con aprobación',
  tipo: 'MITIGAR',
  origen: 'Las cuentas privilegiadas tienen MFA pero no elevación temporal.',
  responsable: 'Gestión Tecnológica',
  aprueba: 'Líder del SIG',
  fechaObjetivo: '2026-12-18',
  fechaAprobacion: null,
  fechaCierre: null,
  estado: 'NO_INICIADA',
  avance: 0,
  verificacion: 'PENDIENTE',
  observacion: null,
  recursos: null,
  madurezAlcanzada: null,
  justificacionAceptacion: null,
  control: {
    codigo: 'A.8.2',
    nombre: 'Derechos de acceso privilegiado',
    capacidad: 'Gestión de identidad',
    lineaBase: 50,
    actual: 50,
    objetivo: 90,
  },
  alcance: null,
  controlId: 7,
  responsableId: 3,
  apruebaId: 5,
  madurezAlcanzadaId: null,
  instrumento: null,
  riesgoRemanente: null,
  fechaRevisionAceptacion: null,
};

const CONTROLES = [{ id: 7, codigo: 'A.8.2', nombre: 'Derechos de acceso privilegiado' }];
const CARGOS = [
  { id: 3, nombre: 'Gestión Tecnológica' },
  { id: 5, nombre: 'Líder del SIG' },
];
const MADUREZ = [{ id: 30, nivel: 90, nombre: 'Definido' }];

function montar() {
  render(
    <PopupAccion
      accion={ACCION}
      controles={CONTROLES}
      cargos={CARGOS}
      madurez={MADUREZ}
      onCerrar={() => {}}
    />,
  );
}

beforeEach(() => {
  mockGuardar.mockReset();
  mockGuardar.mockResolvedValue({ ok: true, mensaje: 'Guardada.' });
});

describe('Observaciones', () => {
  it('es un campo de varias líneas', () => {
    montar();
    expect(screen.getByLabelText('Observaciones').tagName).toBe('TEXTAREA');
  });

  it('los saltos de línea llegan al guardado', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('Observaciones'), {
      target: { value: 'Comité 12/01\nComité 09/02\nPendiente la cotización' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la acción' }));

    await waitFor(() => expect(mockGuardar).toHaveBeenCalled());
    expect(mockGuardar).toHaveBeenCalledWith(
      'PT-013',
      expect.objectContaining({
        observacion: 'Comité 12/01\nComité 09/02\nPendiente la cotización',
      }),
    );
  });
});
```

- [ ] **Paso 2 · Correr y verificar que fallan**

```bash
npx jest app/components/sgsi/planes/__tests__/PopupAccion.test.tsx
```

Esperado: **2 fallando.** La primera con `Expected: "TEXTAREA" / Received: "INPUT"`. La segunda
porque el `<input>` normaliza los saltos: el valor que llega no tiene `\n`.

- [ ] **Paso 3 · Cambiar el elemento**

En `app/components/sgsi/planes/PopupAccion.tsx`, reemplaza el bloque de las líneas 434-449
—el `div` con Recursos y Observaciones— por sólo Recursos, a ancho completo por ahora:

```tsx
        <Campo etiqueta="Recursos o presupuesto">
          <input
            value={d.recursos ?? ''}
            onChange={(e) => set('recursos', e.target.value || null)}
            className={entrada}
          />
        </Campo>

        {/* Observaciones es donde se escribe el seguimiento de una acción que dura meses.
            Un `<input>` descarta los saltos de línea, así que tres reuniones quedaban en un
            párrafo corrido. */}
        <Campo etiqueta="Observaciones">
          <textarea
            value={d.observacion ?? ''}
            onChange={(e) => set('observacion', e.target.value || null)}
            rows={10}
            className={entrada}
          />
        </Campo>
```

- [ ] **Paso 4 · Correr y verificar que pasan**

```bash
npx jest app/components/sgsi/planes/__tests__/PopupAccion.test.tsx
```

Esperado: **2 pasando.**

Es posible que salga un aviso de `act(...)` en la segunda: el guardado corre dentro de un
`useTransition` y React avisa de la actualización fuera de `act`. **Es un aviso, no un fallo.**
No lo silencies envolviendo nada: el `waitFor` ya espera lo que hay que esperar, y silenciarlo
taparía un fallo real si mañana el guardado deja de llamarse.

- [ ] **Paso 5 · Commit**

```bash
git add app/components/sgsi/planes/PopupAccion.tsx app/components/sgsi/planes/__tests__/PopupAccion.test.tsx
git commit -m "fix(sgsi): las observaciones del plan admiten varias lineas

Era un input de una sola linea, y un input descarta los saltos: el seguimiento
de tres reuniones se guardaba como un parrafo corrido. La columna ya es TEXT,
asi que no hace falta migracion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 3 · El formulario se agranda y se reagrupa

**Archivos:**
- Modificar: `app/components/sgsi/planes/PopupAccion.tsx:129` (ancho y alto), `:227-268` y
  `:315-382` (bloques), `:434-449` (último bloque)
- Modificar: `app/components/sgsi/planes/__tests__/PopupAccion.test.tsx` (añadir un `describe`)

- [ ] **Paso 1 · Escribir la prueba que falla**

Añade al final de `app/components/sgsi/planes/__tests__/PopupAccion.test.tsx`:

```tsx
describe('el orden de los campos', () => {
  // «Estado» y «Avance» son lo que más se toca al administrar un plan, y Estado estaba en el
  // quinto renglón: había que bajar para la operación más frecuente. Se afirma el orden del
  // documento y no una posición en píxeles, que jsdom no mide.
  it('Estado va antes que Origen y justificación', () => {
    montar();
    const estado = screen.getByLabelText('Estado');
    const origen = screen.getByLabelText('Origen y justificación');
    const posicion = estado.compareDocumentPosition(origen);
    expect(posicion & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Observaciones es el último campo del formulario', () => {
    montar();
    const observaciones = screen.getByLabelText('Observaciones');
    const recursos = screen.getByLabelText('Recursos o presupuesto');
    const posicion = recursos.compareDocumentPosition(observaciones);
    expect(posicion & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

- [ ] **Paso 2 · Correr y verificar que la primera falla**

```bash
npx jest app/components/sgsi/planes/__tests__/PopupAccion.test.tsx
```

Esperado: **3 pasando, 1 fallando.** Falla «Estado va antes que Origen y justificación»: hoy
Estado está después. La de Observaciones ya pasa por la tarea 2.

- [ ] **Paso 3 · Agrandar el popup**

En `PopupAccion.tsx`, línea 129, reemplaza `ancho={820}` por:

```tsx
      ancho={1040}
      alto="80vh"
```

- [ ] **Paso 4 · Subir Estado al segundo bloque**

Reemplaza el `div` de dos columnas que hoy tiene Tipo y Control (líneas 227-268) por uno de
tres, con Estado al final. **Mantén intactos el `Campo` de Control con su `pie` y el `Link` de
«administrar el control ↗»**: sólo cambia la rejilla y se le añade Estado.

```tsx
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Campo etiqueta="Tipo de tratamiento">
            <select
              value={d.tipo}
              onChange={(e) => set('tipo', e.target.value as TipoAccion)}
              className={entrada}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta="Control asociado"
            pie={
              d.controlId ? (
                <Link
                  href="/sgsi/controles"
                  className="font-mono text-10 text-accent-700 underline decoration-accent-border underline-offset-2"
                >
                  administrar el control ↗
                </Link>
              ) : undefined
            }
          >
            <select
              value={d.controlId ?? ''}
              onChange={(e) => set('controlId', e.target.value === '' ? null : Number(e.target.value))}
              className={entrada}
            >
              <option value="">Sin control</option>
              {controles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Estado">
            <select
              value={d.estado}
              onChange={(e) => set('estado', e.target.value as EstadoAccion)}
              className={entrada}
            >
              {ESTADOS.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
        </div>
```

- [ ] **Paso 5 · Juntar los cinco campos cortos en un renglón**

Reemplaza los dos `div` de rejilla que hoy tienen Estado/Fecha/Avance y Verificación/Madurez
(líneas 315-382) por uno solo. **Estado ya no va acá** —subió al bloque anterior— y Recursos
baja desde el último bloque:

```tsx
        {/* Cinco campos cortos en un renglón: es lo que 1040 px de ancho permiten y lo que
            libera los dos renglones que Observaciones necesita. Cinco columnas sólo a partir
            de `xl`; por debajo se apilan de a tres y de a dos, porque el popup nunca mide más
            que la ventana. */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Campo etiqueta="Fecha objetivo">
            <input
              type="date"
              value={d.fechaObjetivo ?? ''}
              onChange={(e) => set('fechaObjetivo', e.target.value || null)}
              className={entrada}
            />
          </Campo>

          <Campo etiqueta="Avance">
            <input
              type="number"
              min={0}
              max={100}
              value={d.avance ?? 0}
              onChange={(e) => set('avance', Number(e.target.value))}
              className={entrada}
            />
          </Campo>

          <Campo etiqueta="Verificación de eficacia">
            <select
              value={d.verificacion}
              onChange={(e) => set('verificacion', e.target.value as VerificacionEficacia)}
              className={entrada}
            >
              {VERIFICACIONES.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {v.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Madurez alcanzada">
            <select
              value={d.madurezAlcanzadaId ?? ''}
              onChange={(e) =>
                set('madurezAlcanzadaId', e.target.value === '' ? null : Number(e.target.value))
              }
              className={entrada}
            >
              <option value="">Sin registrar</option>
              {madurez.map((m) => (
                <option key={m.id} value={m.id}>
                  L{m.nivel} — {m.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Recursos o presupuesto">
            <input
              value={d.recursos ?? ''}
              onChange={(e) => set('recursos', e.target.value || null)}
              className={entrada}
            />
          </Campo>
        </div>
```

- [ ] **Paso 6 · Quitar el Recursos que quedó duplicado**

En el último bloque, borra el `Campo` de «Recursos o presupuesto» que la tarea 2 dejó ahí.
Tiene que quedar **sólo** Observaciones:

```tsx
        {/* Observaciones es donde se escribe el seguimiento de una acción que dura meses.
            Un `<input>` descarta los saltos de línea, así que tres reuniones quedaban en un
            párrafo corrido. */}
        <Campo etiqueta="Observaciones">
          <textarea
            value={d.observacion ?? ''}
            onChange={(e) => set('observacion', e.target.value || null)}
            rows={10}
            className={entrada}
          />
        </Campo>
```

**Comprueba que «Recursos o presupuesto» aparece una sola vez en el archivo:**

```bash
grep -c "Recursos o presupuesto" app/components/sgsi/planes/PopupAccion.tsx
```

Esperado: `1`. Si sale `2`, quedó duplicado y `getByLabelText` fallará con «found multiple
elements».

- [ ] **Paso 7 · Correr y verificar que pasan**

```bash
npx jest app/components/sgsi/planes/__tests__/PopupAccion.test.tsx app/components/sgsi/__tests__/Popup.test.tsx
```

Esperado: **9 pasando** (5 de `Popup`, 4 de `PopupAccion`).

- [ ] **Paso 8 · Correr toda la suite**

```bash
npx jest --silent
```

Esperado: todo verde. El número de pruebas habrá subido en 9 respecto del estado anterior.

- [ ] **Paso 9 · Commit**

```bash
git add app/components/sgsi/planes/PopupAccion.tsx app/components/sgsi/planes/__tests__/PopupAccion.test.tsx
git commit -m "feat(sgsi): el formulario del plan entra de una en la pantalla

1040 px de ancho y 80vh de alto. Estado sube al primer renglon porque es lo
que mas se toca al administrar, y cinco campos cortos se juntan en un renglon
donde antes ocupaban tres.

Con eso Observaciones cabe a ancho completo al final, que es lo que hacia
falta para que el campo sirva de algo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Tarea 4 · Recorrido de punta a punta · Regla 3 del harness

**Esto no es opcional y no lo cubre ninguna prueba de arriba.** Las nueve pruebas no ven si el
formulario entra sin desplazamiento: jsdom no mide alturas. Los números del spec —550 px de
cuerpo, 216 de descuento, 10 filas— son estimaciones contadas sobre el código.

- [ ] **Paso 1 · Levantar la aplicación**

**No levantes otro `next dev`.** El de `localhost:3000` es de otra sesión y es compartido.
Úsalo. Si no responde, avisa a `indicadores-40` antes de levantar nada.

- [ ] **Paso 2 · Ejecutar el recorrido y anotar lo que se ve**

```
  1. Abrir /sgsi/planes                    -> la grilla, 19 acciones
  2. Clic en el lápiz de PT-013            -> el popup abre a 1040 px
  3. Sin tocar la rueda del ratón          -> se ven los 13 campos y los dos botones del pie
  4. Escribir tres líneas en Observaciones -> el campo las muestra como tres líneas
  5. Guardar la acción                     -> «Guardada», el popup cierra
  6. Reabrir PT-013                        -> las tres líneas están, con sus saltos
  7. Cambiar el tipo a «Transferir»        -> salen instrumento y remanente; vuelve el scroll
  8. Abrir el popup de un control          -> sigue viéndose igual que antes del cambio
```

El **paso 8** es el que comprueba que tocar la carcasa compartida no arrastró a los otros siete
popups. El **paso 3** es el único que verifica el objetivo de toda la tarea.

- [ ] **Paso 3 · Si el paso 3 falla, ajustar sólo las filas**

Si queda desplazamiento, baja `rows={10}` a `rows={8}` en Observaciones y repite. **No toques el
tope de `Popup`**: está puesto para que la tarjeta no desborde, y subirlo cambia el problema por
uno peor.

- [ ] **Paso 4 · Anotar el resultado en el PR**

El recorrido ejecutado, paso por paso y con lo que se vio, más dos cosas que el spec pide decir:

- si el renglón de cinco columnas queda usable en una ventana de 1366×768 (ahí salen tres
  columnas, no cinco);
- el valor final de `rows` si hubo que bajarlo.

---

## Cuando esta rama esté verde

`npm run verificar` no puede pasar mientras el trabajo de AG Grid de otra sesión deje `tsc` en
rojo. En cuanto lo arreglen:

```bash
npm run verificar
```

Y antes del PR, además:

```bash
npm run verificar:build
```

No hace falta `npm run verificar:migraciones`: este cambio no toca `prisma/migrations/`.
