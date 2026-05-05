# ProcessGrid compacto + OcCardsRow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer el gauge de procesos más legible (50px→64px) y añadir una fila horizontal de tarjetas de calificación por OC debajo del grid de procesos.

**Architecture:** Se crea un nuevo componente `OcCardsRow` que recibe `OcRadarData[]` (ya computado en `DashboardShell`) y lo renderiza como fila horizontal scrollable. `ProcessGrid` recibe ajustes visuales menores. `DashboardShell` inserta `OcCardsRow` entre `ProcessGrid` e `IndicatorsTable`.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS 3, Jest + @testing-library/react

---

## File Map

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Crear | `app/components/OcCardsRow.tsx` | Fila scrollable de tarjetas de calificación por OC |
| Crear | `app/components/__tests__/OcCardsRow.test.tsx` | Tests del nuevo componente |
| Modificar | `app/components/ProcessGrid.tsx` | Gauge 50→64px, padding/gap reducido |
| Modificar | `app/components/DashboardShell.tsx` | Importar y renderizar OcCardsRow |

---

### Task 1: Crear `OcCardsRow` con tests

**Files:**
- Create: `app/components/OcCardsRow.tsx`
- Create: `app/components/__tests__/OcCardsRow.test.tsx`

- [ ] **Step 1.1: Escribir los tests**

Crear `app/components/__tests__/OcCardsRow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import OcCardsRow from '../OcCardsRow';
import type { OcRadarData } from '@/app/lib/types';

const mockOcData: OcRadarData[] = [
  { codigo: 'OC1', label: 'OC1 - Satisfacción del clie…', cumplimiento: 92, meta: 90 },
  { codigo: 'OC2', label: 'OC2 - Tiempo de entrega', cumplimiento: 75, meta: 90 },
  { codigo: 'OC3', label: 'OC3 - Calidad del producto', cumplimiento: 87, meta: 90 },
];

test('renders a card for each OC', () => {
  render(<OcCardsRow ocData={mockOcData} />);
  expect(screen.getByText('OC1')).toBeInTheDocument();
  expect(screen.getByText('OC2')).toBeInTheDocument();
  expect(screen.getByText('OC3')).toBeInTheDocument();
});

test('shows description from label (part after " - ")', () => {
  render(<OcCardsRow ocData={mockOcData} />);
  expect(screen.getByText('Satisfacción del clie…')).toBeInTheDocument();
  expect(screen.getByText('Tiempo de entrega')).toBeInTheDocument();
});

test('shows cumplimiento percentage', () => {
  render(<OcCardsRow ocData={mockOcData} />);
  expect(screen.getByText('92% / meta 90%')).toBeInTheDocument();
  expect(screen.getByText('75% / meta 90%')).toBeInTheDocument();
});

test('shows "En meta" for cumplimiento >= 95% of meta', () => {
  render(<OcCardsRow ocData={[{ codigo: 'OC1', label: 'OC1 - X', cumplimiento: 90, meta: 90 }]} />);
  expect(screen.getByText('En meta')).toBeInTheDocument();
});

test('shows "Alerta" for cumplimiento between 85-95% of meta', () => {
  // 80/90 = 0.889 — dentro del rango [0.85, 0.95)
  render(<OcCardsRow ocData={[{ codigo: 'OC1', label: 'OC1 - X', cumplimiento: 80, meta: 90 }]} />);
  expect(screen.getByText('Alerta')).toBeInTheDocument();
});

test('shows "Crítico" for cumplimiento below 85% of meta', () => {
  render(<OcCardsRow ocData={[{ codigo: 'OC1', label: 'OC1 - X', cumplimiento: 75, meta: 90 }]} />);
  expect(screen.getByText('Crítico')).toBeInTheDocument();
});

test('renders nothing when ocData is empty', () => {
  const { container } = render(<OcCardsRow ocData={[]} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 1.2: Correr los tests para verificar que fallan**

```bash
npx jest --testPathPattern=OcCardsRow --no-coverage
```

Resultado esperado: FAIL — "Cannot find module '../OcCardsRow'"

- [ ] **Step 1.3: Crear el componente**

Crear `app/components/OcCardsRow.tsx`:

```tsx
import type { OcRadarData } from '@/app/lib/types';
import type { IndicatorStatus } from '@/app/lib/types';

function ocStatus(cumplimiento: number, meta: number): IndicatorStatus {
  if (meta === 0) return 'sin_datos';
  const ratio = cumplimiento / meta;
  if (ratio >= 0.95) return 'en_meta';
  if (ratio >= 0.85) return 'alerta';
  return 'critico';
}

function statusColor(status: IndicatorStatus): string {
  if (status === 'en_meta') return '#22c55e';
  if (status === 'alerta') return '#f59e0b';
  if (status === 'critico') return '#ef4444';
  return '#94a3b8';
}

function statusLabel(status: IndicatorStatus): string {
  if (status === 'en_meta') return 'En meta';
  if (status === 'alerta') return 'Alerta';
  if (status === 'critico') return 'Crítico';
  return 'Sin datos';
}

export default function OcCardsRow({ ocData }: { ocData: OcRadarData[] }) {
  if (ocData.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 mb-6">
      {ocData.map(oc => {
        const status = ocStatus(oc.cumplimiento, oc.meta);
        const color = statusColor(status);
        const desc = oc.label.split(' - ').slice(1).join(' - ');
        const barWidth = oc.meta > 0
          ? `${Math.min((oc.cumplimiento / oc.meta) * 100, 100).toFixed(1)}%`
          : '0%';

        return (
          <div
            key={oc.codigo}
            className="min-w-[200px] bg-white rounded-xl shadow-sm border border-slate-50 p-3 flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <span className="text-xs font-bold text-slate-900">{oc.codigo}</span>
              <span className="text-[10px] text-slate-400 ml-auto">{statusLabel(status)}</span>
            </div>
            <p className="text-[11px] text-slate-600 truncate">{desc}</p>
            <div className="bg-slate-100 rounded-full h-1.5 w-full">
              <div
                className="h-1.5 rounded-full"
                style={{ width: barWidth, background: color }}
              />
            </div>
            <p className="text-[10px] text-slate-400">
              {oc.cumplimiento}% / meta {oc.meta}%
            </p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 1.4: Correr los tests para verificar que pasan**

```bash
npx jest --testPathPattern=OcCardsRow --no-coverage
```

Resultado esperado: PASS — 7 tests passed

- [ ] **Step 1.5: Commit**

```bash
git add app/components/OcCardsRow.tsx app/components/__tests__/OcCardsRow.test.tsx
git commit -m "feat: add OcCardsRow component with horizontal scrollable OC qualification cards"
```

---

### Task 2: Actualizar `ProcessGrid` — gauge más grande y tarjetas más compactas

**Files:**
- Modify: `app/components/ProcessGrid.tsx`

- [ ] **Step 2.1: Actualizar el SVG gauge**

En `app/components/ProcessGrid.tsx`, en la función `SvgGauge`, cambiar la línea:

```tsx
// antes
<svg viewBox="0 0 50 50" className="w-[50px] h-[50px] flex-shrink-0">
```

por:

```tsx
// después
<svg viewBox="0 0 50 50" className="w-[64px] h-[64px] flex-shrink-0">
```

El `viewBox` permanece `"0 0 50 50"` — el navegador escala todo (trazo y texto) proporcionalmente al renderizar en 64px.

- [ ] **Step 2.2: Reducir padding y gap de la tarjeta**

En el mismo archivo, dentro del `return` de `ProcessGrid`, cambiar en el `div` de la tarjeta:

```tsx
// antes
className={`bg-white rounded-xl p-4 shadow-sm border flex items-center gap-3.5 cursor-pointer ...`}
```

por:

```tsx
// después
className={`bg-white rounded-xl p-3 shadow-sm border flex items-center gap-2.5 cursor-pointer ...`}
```

(Solo `p-4 → p-3` y `gap-3.5 → gap-2.5`; el resto del className permanece igual.)

- [ ] **Step 2.3: Verificar que los tests existentes siguen pasando**

```bash
npx jest --no-coverage
```

Resultado esperado: todos los tests pasan (no hay tests de ProcessGrid — el cambio es visual).

- [ ] **Step 2.4: Commit**

```bash
git add app/components/ProcessGrid.tsx
git commit -m "feat: enlarge ProcessGrid gauge to 64px and compact card padding"
```

---

### Task 3: Insertar `OcCardsRow` en `DashboardShell`

**Files:**
- Modify: `app/components/DashboardShell.tsx`

- [ ] **Step 3.1: Importar `OcCardsRow`**

En `app/components/DashboardShell.tsx`, añadir la importación después de la línea de `IndicatorsTable`:

```tsx
// antes
import IndicatorsTable from './IndicatorsTable';
```

```tsx
// después
import IndicatorsTable from './IndicatorsTable';
import OcCardsRow from './OcCardsRow';
```

- [ ] **Step 3.2: Renderizar `OcCardsRow` entre `ProcessGrid` e `IndicatorsTable`**

En el `return` de `DashboardShell`, después de `<ProcessGrid ... />` y antes de `<IndicatorsTable ... />`:

```tsx
// antes
      <ProcessGrid
        procesos={procesos}
        selected={processFilter}
        onSelect={handleProcessSelect}
      />
      <IndicatorsTable
```

```tsx
// después
      <ProcessGrid
        procesos={procesos}
        selected={processFilter}
        onSelect={handleProcessSelect}
      />
      <OcCardsRow ocData={ocData} />
      <IndicatorsTable
```

`ocData` ya está definido en `DashboardShell` como `const ocData = computeOcRadarData(indicadores, objetivosCalidad, processFilter);` — no se necesita ningún cambio adicional.

- [ ] **Step 3.3: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores

- [ ] **Step 3.4: Correr todos los tests**

```bash
npx jest --no-coverage
```

Resultado esperado: todos los tests pasan

- [ ] **Step 3.5: Commit**

```bash
git add app/components/DashboardShell.tsx
git commit -m "feat: wire OcCardsRow into DashboardShell below ProcessGrid"
```
