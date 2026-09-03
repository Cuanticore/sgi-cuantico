# Indicadores SGC ISO 9001 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-page Next.js 14 dashboard authenticated via Azure AD, showing Cuantico's 26 ISO 9001 indicators loaded from SharePoint Excel files, with ECharts animated visualizations.

**Architecture:** Next.js 14 App Router with server-side auth via NextAuth (Azure AD). A server-side cache module fetches the Excel from SharePoint via Microsoft Graph (client credentials), parses it with ExcelJS, caches 5 min, and serves JSON via `/api/indicators`. Client components render ECharts charts. Route protection via NextAuth middleware.

**Tech Stack:** Next.js 14 · NextAuth 4 · Microsoft Graph API · ExcelJS 4 · ECharts 5 + echarts-for-react 3 · Tailwind CSS 3 · TypeScript 5 · Jest 29

---

## ⚠️ Prerequisites (do before Task 1)

### Azure AD App Registration — add redirect URI
1. Go to [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations
2. Find app with Client ID `4b24bb04-19b7-4d55-bb9f-260fae17dac3`
3. Click **Authentication** → **Add a platform** → **Web**
4. Set Redirect URI: `http://localhost:3000/api/auth/callback/azure-ad`
5. Under **Implicit grant and hybrid flows**, check ☑ **ID tokens**
6. Click **Save**

---

## File Map

```
C:\Users\danie\Claude\Indicadores\
├── .env.local                               ← env vars (gitignored)
├── .gitignore
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── package.json
├── jest.config.js
├── middleware.ts                            ← protect / and /api/indicators
└── app/
    ├── globals.css
    ├── layout.tsx                           ← SessionProvider wrapper
    ├── page.tsx                             ← Dashboard server component
    ├── api/
    │   ├── auth/[...nextauth]/route.ts      ← NextAuth Azure AD
    │   └── indicators/route.ts             ← GET /api/indicators
    ├── components/
    │   ├── HeroBanner.tsx                  ← Dark banner + particles canvas + count-up
    │   ├── KPICard.tsx                     ← Color-coded floating stat card
    │   ├── QuarterSummary.tsx              ← Q1–Q4 status cards row
    │   ├── IndicatorsTable.tsx             ← Filterable table with badges
    │   └── charts/
    │       ├── ProcessBarChart.tsx         ← ECharts horizontal bars by process
    │       ├── MonthlyTrendChart.tsx       ← ECharts line + gradient area + meta line
    │       ├── ProcessGaugeGrid.tsx        ← 3×3 ECharts circular gauges
    │       └── QualityRadar.tsx            ← ECharts radar OC1–OC5
    └── lib/
        ├── types.ts                        ← All TypeScript interfaces
        ├── excel-parser.ts                 ← Pure functions: ExcelJS buffer → IndicatorsData
        ├── sharepoint.ts                   ← Microsoft Graph API file fetch
        ├── data.ts                         ← Server-side 5-min cache layer
        └── __tests__/
            └── excel-parser.test.ts        ← Unit tests for parser functions
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`, `next.config.js`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `jest.config.js`, `.gitignore`, `.env.local`

- [ ] **Step 1: Initialize project**

Run from `C:\Users\danie\Claude\Indicadores`:
```bash
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*"
```
When prompted: answer **No** to all optional features.

Expected output: `✓ Created a Next.js app`

- [ ] **Step 2: Install dependencies**

```bash
npm install next-auth echarts echarts-for-react exceljs axios
npm install -D jest @types/jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom ts-jest
```

Expected: no errors, `node_modules` created.

- [ ] **Step 3: Write `jest.config.js`**

```js
// jest.config.js
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });
module.exports = createJestConfig({
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/app/$1' },
  testMatch: ['**/__tests__/**/*.test.ts'],
});
```

- [ ] **Step 4: Write `.env.local`**

```bash
# .env.local
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=REPLACE_WITH_OUTPUT_OF_openssl_rand_base64_32

AZURE_AD_CLIENT_ID=4b24bb04-19b7-4d55-bb9f-260fae17dac3
AZURE_AD_CLIENT_SECRET=REPLACE_WITH_AZURE_AD_CLIENT_SECRET
AZURE_AD_TENANT_ID=4ade459a-df74-47ac-8846-7fbd0e6aad1b

SHAREPOINT_TENANT_ID=4ade459a-df74-47ac-8846-7fbd0e6aad1b
SHAREPOINT_CLIENT_ID=4b24bb04-19b7-4d55-bb9f-260fae17dac3
SHAREPOINT_CLIENT_SECRET=REPLACE_WITH_AZURE_AD_CLIENT_SECRET
SHAREPOINT_SITE_URL=cuanticore.sharepoint.com
SHAREPOINT_SITE_NAME=Cuantico
SHAREPOINT_INDICATORS_PATH=0. Compañia/11. Sistema Gestión de Calidad/9. Evaluación de Desempeño/4. Indicadores/2. 2026
SHAREPOINT_INDICATORS_FILE=1. Indicadores de Gestión 2026.xlsx
```

Generate NEXTAUTH_SECRET:
```bash
openssl rand -base64 32
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
.next/
.env.local
.env*.local
```

- [ ] **Step 6: Update `next.config.js`**

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```
Expected: `Ready on http://localhost:3000` with no errors.
Stop server (Ctrl+C).

- [ ] **Step 8: Commit**

```bash
git init
git add .gitignore package.json next.config.js tailwind.config.js postcss.config.js tsconfig.json jest.config.js
git commit -m "feat: initialize Next.js 14 project with dependencies"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `app/lib/types.ts`

- [ ] **Step 1: Write `app/lib/types.ts`**

```typescript
// app/lib/types.ts

export interface IndicatorsSummary {
  avanceGlobal: number;       // 81.4 (percentage, not decimal)
  totalIndicadores: number;   // 26
  medidos: number;            // 17
  enMeta: number;             // 11
  alerta: number;             // 1
  critico: number;            // 2
}

export type IndicatorStatus = 'en_meta' | 'alerta' | 'critico' | 'sin_datos';

export interface Quarter {
  label: string;              // "Q1"
  months: string;             // "Ene-Mar"
  cumplimiento: number | null; // 81.0
  mediciones: number;
  status: IndicatorStatus;
}

export interface Process {
  nombre: string;             // "Gestión Estratégica"
  numIndicadores: number;     // 3
  cumplimiento: number | null; // 44.5
  meta: number;               // 90.0
  status: IndicatorStatus;
}

export interface MonthlyData {
  mes: string;                // "Ene"
  cumplimiento: number | null; // 79.6 or null if no data
}

export interface QualityObjective {
  codigo: string;             // "OC1"
  descripcion: string;        // "Satisfacción del cliente"
  cumplimiento: number | null;
}

export interface Indicator {
  numero: number;
  proceso: string;
  nombre: string;
  lider: string;
  frecuencia: string;
  meta: string;              // kept as string (can be "90%", "≥ 2", "≥ 12 meses")
  resultado: number | null;  // percentage value or null
  status: IndicatorStatus;
  oc: string;                // "OC1", "OC5", etc.
}

export interface IndicatorsData {
  summary: IndicatorsSummary;
  trimestres: Quarter[];
  procesos: Process[];
  mensual: MonthlyData[];
  indicadores: Indicator[];
  objetivosCalidad: QualityObjective[];
  fetchedAt: string;         // ISO timestamp
}
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/types.ts
git commit -m "feat: add TypeScript types for indicators data"
```

---

## Task 3: Excel Parser (TDD)

**Files:**
- Create: `app/lib/excel-parser.ts`
- Create: `app/lib/__tests__/excel-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/lib/__tests__/excel-parser.test.ts
import {
  parseExecutiveSummary,
  parseQuarters,
  parseProcesses,
  parseMonthly,
  parseIndicators,
  parseQualityObjectives,
} from '../excel-parser';

// Mock helpers — simulate ExcelJS Worksheet API
function mockCell(value: unknown) {
  return { value };
}
function mockRow(cells: Record<number, unknown>) {
  return { getCell: (col: number) => mockCell(cells[col] ?? null) };
}
function mockWs(rows: Record<number, Record<number, unknown>>) {
  return { getRow: (row: number) => mockRow(rows[row] ?? {}) };
}

describe('parseExecutiveSummary', () => {
  it('parses avance, evaluados, enMeta, alerta, critico', () => {
    const ws = mockWs({ 7: { 2: 0.814, 4: '17 / 26', 6: 11, 8: 1, 10: 2 } });
    const result = parseExecutiveSummary(ws as any);
    expect(result.avanceGlobal).toBeCloseTo(81.4, 1);
    expect(result.medidos).toBe(17);
    expect(result.totalIndicadores).toBe(26);
    expect(result.enMeta).toBe(11);
    expect(result.alerta).toBe(1);
    expect(result.critico).toBe(2);
  });
});

describe('parseQuarters', () => {
  it('parses Q1–Q4 rows with status', () => {
    const ws = mockWs({
      11: { 2: 'Q1', 3: 'Ene-Mar', 4: 0.81, 5: 38, 6: '🟡 Alerta' },
      12: { 2: 'Q2', 3: 'Abr-Jun', 4: 0.582, 5: 6, 6: '🔴 Crítico' },
      13: { 2: 'Q3', 3: 'Jul-Sep', 4: 0, 5: 0, 6: 'Sin datos' },
      14: { 2: 'Q4', 3: 'Oct-Dic', 4: 0, 5: 0, 6: 'Sin datos' },
    });
    const result = parseQuarters(ws as any);
    expect(result).toHaveLength(4);
    expect(result[0].label).toBe('Q1');
    expect(result[0].cumplimiento).toBeCloseTo(81.0, 1);
    expect(result[0].status).toBe('alerta');
    expect(result[1].status).toBe('critico');
    expect(result[2].status).toBe('sin_datos');
  });
});

describe('parseProcesses', () => {
  it('parses process rows with status', () => {
    const ws = mockWs({
      19: { 2: 'Gestión Estratégica', 3: 3, 4: 0.445, 5: 0.9, 6: '🔴 Crítico' },
      20: { 2: 'Gestión Comercial', 3: 3, 4: 0.702, 5: 0.95, 6: '🔴 Crítico' },
      27: { 2: 'Gestión de Calidad', 3: 4, 4: 1.0, 5: 1.0, 6: '🟢 En meta' },
      28: { 2: null },
    });
    const result = parseProcesses(ws as any);
    expect(result[0].nombre).toBe('Gestión Estratégica');
    expect(result[0].cumplimiento).toBeCloseTo(44.5, 1);
    expect(result[0].meta).toBeCloseTo(90, 0);
    expect(result[0].status).toBe('critico');
    expect(result.find(p => p.nombre === 'Gestión de Calidad')?.status).toBe('en_meta');
  });
});

describe('parseMonthly', () => {
  it('parses monthly cumplimiento values, null for errors', () => {
    const ws = mockWs({
      31: { 3: 0.796, 4: 0.789, 5: 0.848, 6: 0.582, 7: { error: '#N/D' } },
    });
    const result = parseMonthly(ws as any);
    expect(result).toHaveLength(12);
    expect(result[0].mes).toBe('Ene');
    expect(result[0].cumplimiento).toBeCloseTo(79.6, 1);
    expect(result[3].cumplimiento).toBeCloseTo(58.2, 1);
    expect(result[4].cumplimiento).toBeNull();
  });
});

describe('parseQualityObjectives', () => {
  it('parses OC codes and descriptions from cols 8–9', () => {
    const ws = mockWs({
      11: { 8: 'OC1', 9: 'Satisfacción del cliente' },
      12: { 8: 'OC2', 9: 'Mejora continua' },
      15: { 8: 'OC5', 9: 'Eficiencia Operativa' },
    });
    const result = parseQualityObjectives(ws as any);
    expect(result).toHaveLength(5);
    expect(result[0].codigo).toBe('OC1');
    expect(result[0].descripcion).toBe('Satisfacción del cliente');
  });
});

describe('parseIndicators', () => {
  it('parses indicator rows from row 19 until col 1 is empty', () => {
    const ws = mockWs({
      19: { 1: 1, 2: 'Gestión Estratégica', 3: 'Cumplimiento sostenibilidad', 4: 'Daniel Medina', 9: 'OC5', 13: 'Anual', 14: '90%', 20: 0.34 },
      20: { 1: 2, 2: 'Gestión Estratégica', 3: 'Ingresos compañía', 4: 'Daniel Medina', 9: 'OC5', 13: 'Anual', 14: '90%', 20: 0 },
      21: { 1: null },
    });
    const result = parseIndicators(ws as any);
    expect(result).toHaveLength(2);
    expect(result[0].numero).toBe(1);
    expect(result[0].resultado).toBeCloseTo(34, 0);
    expect(result[0].status).toBe('critico');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest app/lib/__tests__/excel-parser.test.ts --no-coverage
```
Expected: 6 test suites FAIL with "Cannot find module '../excel-parser'"

- [ ] **Step 3: Write `app/lib/excel-parser.ts`**

```typescript
// app/lib/excel-parser.ts
import type ExcelJS from 'exceljs';
import {
  IndicatorsSummary, Quarter, Process, MonthlyData,
  QualityObjective, Indicator, IndicatorsData, IndicatorStatus,
} from './types';

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

type AnyWorksheet = Pick<ExcelJS.Worksheet, 'getRow'>;

function cellValue(ws: AnyWorksheet, row: number, col: number): unknown {
  return ws.getRow(row).getCell(col).value;
}

function toPercent(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val !== null && 'error' in val) return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  // ExcelJS returns decimals for percentages (0.814 for 81.4%)
  // Values > 2 are already in percent form (edge case: >200% indicators like Talento Humano 111%)
  return n <= 2 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
}

function statusFromEmoji(text: string): IndicatorStatus {
  if (text.includes('🟢') || text.toLowerCase().includes('en meta')) return 'en_meta';
  if (text.includes('🟡') || text.toLowerCase().includes('alerta')) return 'alerta';
  if (text.includes('🔴') || text.toLowerCase().includes('crítico') || text.toLowerCase().includes('critico')) return 'critico';
  return 'sin_datos';
}

function computeStatus(resultado: number | null, meta: string): IndicatorStatus {
  if (resultado === null) return 'sin_datos';
  const metaNum = parseFloat(meta.replace('%', '').replace('≥', '').trim());
  if (isNaN(metaNum)) return resultado > 0 ? 'en_meta' : 'sin_datos';
  if (resultado >= metaNum) return 'en_meta';
  if (resultado >= metaNum * 0.8) return 'alerta';
  return 'critico';
}

export function parseExecutiveSummary(ws: AnyWorksheet): IndicatorsSummary {
  const avanceRaw = cellValue(ws, 7, 2);
  const evaluadosStr = String(cellValue(ws, 7, 4) ?? '');
  const match = evaluadosStr.match(/(\d+)\s*\/\s*(\d+)/);

  return {
    avanceGlobal: toPercent(avanceRaw) ?? 0,
    medidos: match ? parseInt(match[1]) : 0,
    totalIndicadores: match ? parseInt(match[2]) : 0,
    enMeta: Number(cellValue(ws, 7, 6)),
    alerta: Number(cellValue(ws, 7, 8)),
    critico: Number(cellValue(ws, 7, 10)),
  };
}

export function parseQuarters(ws: AnyWorksheet): Quarter[] {
  return [11, 12, 13, 14].map(rowIdx => {
    const cumplimientoRaw = cellValue(ws, rowIdx, 4);
    const cumplimiento = toPercent(cumplimientoRaw);
    const estadoText = String(cellValue(ws, rowIdx, 6) ?? '');

    return {
      label: String(cellValue(ws, rowIdx, 2) ?? ''),
      months: String(cellValue(ws, rowIdx, 3) ?? ''),
      cumplimiento,
      mediciones: Number(cellValue(ws, rowIdx, 5)) || 0,
      status: statusFromEmoji(estadoText),
    };
  });
}

export function parseProcesses(ws: AnyWorksheet): Process[] {
  const processes: Process[] = [];
  for (let row = 19; row <= 27; row++) {
    const nombre = cellValue(ws, row, 2);
    if (!nombre) break;
    const cumplimiento = toPercent(cellValue(ws, row, 4));
    const meta = toPercent(cellValue(ws, row, 5)) ?? 90;
    const estadoText = String(cellValue(ws, row, 6) ?? '');

    processes.push({
      nombre: String(nombre),
      numIndicadores: Number(cellValue(ws, row, 3)) || 0,
      cumplimiento,
      meta,
      status: statusFromEmoji(estadoText),
    });
  }
  return processes;
}

export function parseMonthly(ws: AnyWorksheet): MonthlyData[] {
  return MONTH_NAMES.map((mes, i) => {
    const col = 3 + i; // cols 3–14
    return { mes, cumplimiento: toPercent(cellValue(ws, 31, col)) };
  });
}

export function parseQualityObjectives(ws: AnyWorksheet): QualityObjective[] {
  return [11, 12, 13, 14, 15].map(row => ({
    codigo: String(cellValue(ws, row, 8) ?? ''),
    descripcion: String(cellValue(ws, row, 9) ?? ''),
    cumplimiento: null, // computed later from indicators if needed
  }));
}

export function parseIndicators(ws: AnyWorksheet): Indicator[] {
  const indicators: Indicator[] = [];
  for (let row = 19; row <= 200; row++) {
    const numero = cellValue(ws, row, 1);
    if (!numero) break;
    const metaStr = String(cellValue(ws, row, 14) ?? '');
    // Result column 20 = Ene V2 result — latest available in Q1
    const resultadoRaw = cellValue(ws, row, 20);
    const resultado = toPercent(resultadoRaw);

    indicators.push({
      numero: Number(numero),
      proceso: String(cellValue(ws, row, 2) ?? ''),
      nombre: String(cellValue(ws, row, 3) ?? ''),
      lider: String(cellValue(ws, row, 4) ?? ''),
      oc: String(cellValue(ws, row, 9) ?? ''),
      frecuencia: String(cellValue(ws, row, 13) ?? ''),
      meta: metaStr,
      resultado,
      status: computeStatus(resultado, metaStr),
    });
  }
  return indicators;
}

export async function parseExcelBuffer(buffer: Buffer): Promise<Omit<IndicatorsData, 'fetchedAt'>> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const cuadro = workbook.getWorksheet('Cuadro de Mando 2026')!;
  const indicadoresWs = workbook.getWorksheet('Indicadores Gestión')!;

  return {
    summary: parseExecutiveSummary(cuadro),
    trimestres: parseQuarters(cuadro),
    procesos: parseProcesses(cuadro),
    mensual: parseMonthly(cuadro),
    indicadores: parseIndicators(indicadoresWs),
    objetivosCalidad: parseQualityObjectives(cuadro),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest app/lib/__tests__/excel-parser.test.ts --no-coverage
```
Expected: 6 tests PASS. If any fail, check the mock row/col indices match the assertions.

- [ ] **Step 5: Commit**

```bash
git add app/lib/excel-parser.ts app/lib/__tests__/excel-parser.test.ts
git commit -m "feat: add Excel parser with full test coverage"
```

---

## Task 4: SharePoint Client

**Files:**
- Create: `app/lib/sharepoint.ts`
- Create: `app/lib/data.ts`

- [ ] **Step 1: Write `app/lib/sharepoint.ts`**

```typescript
// app/lib/sharepoint.ts
import axios from 'axios';

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function getToken(): Promise<string> {
  const res = await axios.post(
    `https://login.microsoftonline.com/${process.env.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHAREPOINT_CLIENT_ID!,
      client_secret: process.env.SHAREPOINT_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data.access_token;
}

async function getSiteId(token: string): Promise<string> {
  const res = await axios.get(
    `${GRAPH}/sites/${process.env.SHAREPOINT_SITE_URL}:/sites/${process.env.SHAREPOINT_SITE_NAME}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.id;
}

async function getDriveId(token: string, siteId: string): Promise<string> {
  const res = await axios.get(
    `${GRAPH}/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const drives: { id: string; name: string }[] = res.data.value;
  // The default library is "Documents" (internal name), shown in UI as "Shared Documents"
  const drive = drives.find(d => d.name === 'Documents' || d.name === 'Shared Documents') ?? drives[0];
  return drive.id;
}

export async function fetchIndicatorsBuffer(): Promise<Buffer> {
  const token = await getToken();
  const siteId = await getSiteId(token);
  const driveId = await getDriveId(token, siteId);
  const filePath = `${process.env.SHAREPOINT_INDICATORS_PATH}/${process.env.SHAREPOINT_INDICATORS_FILE}`;

  const res = await axios.get(
    `${GRAPH}/sites/${siteId}/drives/${driveId}/root:/${encodeURIComponent(filePath).replace(/%2F/g, '/')}:/content`,
    { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}
```

- [ ] **Step 2: Write `app/lib/data.ts`** (5-min server-side cache)

```typescript
// app/lib/data.ts
import { IndicatorsData } from './types';
import { fetchIndicatorsBuffer } from './sharepoint';
import { parseExcelBuffer } from './excel-parser';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cache: { data: IndicatorsData; timestamp: number } | null = null;

export async function getIndicatorsData(): Promise<IndicatorsData> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  const buffer = await fetchIndicatorsBuffer();
  const parsed = await parseExcelBuffer(buffer);
  const data: IndicatorsData = { ...parsed, fetchedAt: new Date().toISOString() };
  cache = { data, timestamp: Date.now() };
  return data;
}

export function invalidateCache(): void {
  cache = null;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/lib/sharepoint.ts app/lib/data.ts
git commit -m "feat: add SharePoint Graph API client and data cache layer"
```

---

## Task 4b: Multi-year Support (2025 + 2026)

**Files:**
- Modify: `app/lib/sharepoint.ts`
- Modify: `app/lib/data.ts`

**Note:** `.env.local` already has `SHAREPOINT_INDICATORS_PATH_2025` and `SHAREPOINT_INDICATORS_FILE_2025` added. Verify with Daniel that `1. 2025` is the correct folder name in SharePoint.

- [ ] **Step 1: Update `app/lib/sharepoint.ts`** — add `year` param

Replace the entire file with:

```typescript
// app/lib/sharepoint.ts
import axios from 'axios';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export type IndicatorYear = '2025' | '2026';

async function getToken(): Promise<string> {
  const res = await axios.post(
    `https://login.microsoftonline.com/${process.env.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHAREPOINT_CLIENT_ID!,
      client_secret: process.env.SHAREPOINT_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data.access_token;
}

async function getSiteId(token: string): Promise<string> {
  const res = await axios.get(
    `${GRAPH}/sites/${process.env.SHAREPOINT_SITE_URL}:/sites/${process.env.SHAREPOINT_SITE_NAME}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.id;
}

async function getDriveId(token: string, siteId: string): Promise<string> {
  const res = await axios.get(
    `${GRAPH}/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const drives: { id: string; name: string }[] = res.data.value;
  const drive = drives.find(d => d.name === 'Documents' || d.name === 'Shared Documents') ?? drives[0];
  return drive.id;
}

const FILE_CONFIG: Record<IndicatorYear, { path: string; file: string }> = {
  '2026': {
    path: process.env.SHAREPOINT_INDICATORS_PATH!,
    file: process.env.SHAREPOINT_INDICATORS_FILE!,
  },
  '2025': {
    path: process.env.SHAREPOINT_INDICATORS_PATH_2025!,
    file: process.env.SHAREPOINT_INDICATORS_FILE_2025!,
  },
};

export async function fetchIndicatorsBuffer(year: IndicatorYear = '2026'): Promise<Buffer> {
  const token = await getToken();
  const siteId = await getSiteId(token);
  const driveId = await getDriveId(token, siteId);
  const { path, file } = FILE_CONFIG[year];
  const filePath = `${path}/${file}`;

  const res = await axios.get(
    `${GRAPH}/sites/${siteId}/drives/${driveId}/root:/${encodeURIComponent(filePath).replace(/%2F/g, '/')}:/content`,
    { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}
```

- [ ] **Step 2: Update `app/lib/data.ts`** — cache per year

Replace the entire file with:

```typescript
// app/lib/data.ts
import { IndicatorsData } from './types';
import { fetchIndicatorsBuffer, IndicatorYear } from './sharepoint';
import { parseExcelBuffer } from './excel-parser';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const caches: Partial<Record<IndicatorYear, { data: IndicatorsData; timestamp: number }>> = {};

export async function getIndicatorsData(year: IndicatorYear = '2026'): Promise<IndicatorsData> {
  const cached = caches[year];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const buffer = await fetchIndicatorsBuffer(year);
  const parsed = await parseExcelBuffer(buffer);
  const data: IndicatorsData = { ...parsed, fetchedAt: new Date().toISOString() };
  caches[year] = { data, timestamp: Date.now() };
  return data;
}

export function invalidateCache(year?: IndicatorYear): void {
  if (year) {
    delete caches[year];
  } else {
    (Object.keys(caches) as IndicatorYear[]).forEach(k => delete caches[k]);
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```powershell
cd C:\Users\danie\Claude\Indicadores; npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 4: Run existing tests to confirm nothing broke**

```powershell
cd C:\Users\danie\Claude\Indicadores; npx jest --no-coverage 2>&1
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```powershell
cd C:\Users\danie\Claude\Indicadores; git add app/lib/sharepoint.ts app/lib/data.ts; git commit -m "feat: add multi-year support (2025/2026) to SharePoint client and cache"
```

---

## Task 5: Indicators API Route

**Files:**
- Create: `app/api/indicators/route.ts`

**Note (updated for multi-year):** The route now accepts an optional `?year=2025|2026` query parameter. Defaults to `2026`.

- [ ] **Step 1: Write the route**

```typescript
// app/api/indicators/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { getIndicatorsData } from '@/app/lib/data';
import type { IndicatorYear } from '@/app/lib/sharepoint';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const year: IndicatorYear = yearParam === '2025' ? '2025' : '2026';

  try {
    const data = await getIndicatorsData(year);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err) {
    console.error('[/api/indicators]', err);
    return NextResponse.json(
      { error: 'Error loading indicators from SharePoint' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/indicators/route.ts
git commit -m "feat: add /api/indicators route with auth guard and year param"
```

---

## Task 6: NextAuth + Middleware

**Files:**
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Create auth directory and route**

```bash
mkdir -p app/api/auth/\[...nextauth\]
```

- [ ] **Step 2: Write `app/api/auth/[...nextauth]/route.ts`**

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth, { AuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';

export const authOptions: AuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.email = (token.email as string) ?? session.user.email;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 3: Write `middleware.ts`**

```typescript
// middleware.ts
export { default } from 'next-auth/middleware';

export const config = {
  matcher: ['/', '/api/indicators'],
};
```

- [ ] **Step 4: Commit**

```bash
git add app/api/auth middleware.ts
git commit -m "feat: add NextAuth Azure AD authentication and route middleware"
```

---

## Task 7: Root Layout + Global Styles

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write `app/globals.css`**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --primary: #1B3A8A;
  --accent: #0EA5E9;
}

body {
  @apply bg-slate-100 text-slate-900 antialiased;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 2: Write `app/layout.tsx`**

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cuantico · Indicadores SGC 2026',
  description: 'Cuadro de Mando de Indicadores ISO 9001',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create `app/providers.tsx`** (client component for NextAuth SessionProvider)

```tsx
// app/providers.tsx
'use client';
import { SessionProvider } from 'next-auth/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css app/providers.tsx
git commit -m "feat: add root layout with SessionProvider and global styles"
```

---

## Task 8: HeroBanner Component

**Files:**
- Create: `app/components/HeroBanner.tsx`

- [ ] **Step 1: Write `app/components/HeroBanner.tsx`**

```tsx
// app/components/HeroBanner.tsx
'use client';
import { useEffect, useRef } from 'react';
import { IndicatorsSummary } from '@/app/lib/types';

interface Props {
  summary: IndicatorsSummary;
  userName?: string;
}

export default function HeroBanner({ summary, userName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const avanceRef = useRef<HTMLSpanElement>(null);
  const medidosRef = useRef<HTMLSpanElement>(null);
  const metaRef = useRef<HTMLSpanElement>(null);
  const criticoRef = useRef<HTMLSpanElement>(null);

  // Canvas particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 45 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.4,
      dx: (Math.random() - 0.5) * 0.35,
      dy: (Math.random() - 0.5) * 0.35,
      alpha: Math.random() * 0.35 + 0.08,
    }));

    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(14,165,233,${p.alpha})`;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Count-up animation
  useEffect(() => {
    function countUp(el: HTMLSpanElement | null, target: number, decimals: number, suffix: string, duration: number) {
      if (!el) return;
      let startTime: number | null = null;
      const step = (ts: number) => {
        if (!startTime) startTime = ts;
        const progress = Math.min((ts - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = (ease * target).toFixed(decimals) + suffix;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    countUp(avanceRef.current, summary.avanceGlobal, 1, '%', 1500);
    countUp(medidosRef.current, summary.medidos, 0, '', 1200);
    countUp(metaRef.current, summary.enMeta, 0, '', 1000);
    countUp(criticoRef.current, summary.critico, 0, '', 800);
  }, [summary]);

  return (
    <div
      className="relative overflow-hidden px-8 pt-10 pb-20"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1B3A8A 55%, #0c2461 100%)' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className="relative z-10">
        <p className="text-slate-400 text-xs tracking-widest uppercase mb-2">
          Sistema de Gestión de Calidad · ISO 9001
        </p>
        <h1 className="text-white text-3xl font-black mb-1">
          Cuadro de Mando de Indicadores
        </h1>
        <p className="text-sky-300 text-sm mb-8">
          Cuantico · {new Date().getFullYear()} · Datos actualizados desde SharePoint
          {userName && <span className="ml-4 text-slate-500">· {userName}</span>}
        </p>

        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="text-cyan-400 text-4xl font-black">
              <span ref={avanceRef}>0.0%</span>
            </div>
            <div className="text-slate-500 text-xs uppercase tracking-wide mt-1">Avance Global</div>
          </div>
          <div className="w-px self-stretch bg-white/10" />
          <div className="text-center">
            <div className="text-white text-4xl font-black">
              <span ref={medidosRef}>0</span>
              <span className="text-slate-500 text-xl">/{summary.totalIndicadores}</span>
            </div>
            <div className="text-slate-500 text-xs uppercase tracking-wide mt-1">Medidos</div>
          </div>
          <div className="w-px self-stretch bg-white/10" />
          <div className="text-center">
            <div className="text-green-400 text-4xl font-black">
              <span ref={metaRef}>0</span>
            </div>
            <div className="text-slate-500 text-xs uppercase tracking-wide mt-1">En Meta 🟢</div>
          </div>
          <div className="w-px self-stretch bg-white/10" />
          <div className="text-center">
            <div className="text-red-400 text-4xl font-black">
              <span ref={criticoRef}>0</span>
            </div>
            <div className="text-slate-500 text-xs uppercase tracking-wide mt-1">Críticos 🔴</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/HeroBanner.tsx
git commit -m "feat: add HeroBanner with canvas particles and count-up animation"
```

---

## Task 9: KPICard Component

**Files:**
- Create: `app/components/KPICard.tsx`

- [ ] **Step 1: Write `app/components/KPICard.tsx`**

```tsx
// app/components/KPICard.tsx
interface Props {
  label: string;
  value: string;
  sub: string;
  progress: number;  // 0–100
  color: 'blue' | 'green' | 'yellow' | 'red';
}

const colorMap = {
  blue:   { border: '#0EA5E9', text: '#0EA5E9', bar: '#0EA5E9' },
  green:  { border: '#22c55e', text: '#22c55e', bar: '#22c55e' },
  yellow: { border: '#f59e0b', text: '#f59e0b', bar: '#f59e0b' },
  red:    { border: '#ef4444', text: '#ef4444', bar: '#ef4444' },
};

export default function KPICard({ label, value, sub, progress, color }: Props) {
  const c = colorMap[color];
  return (
    <div
      className="bg-white rounded-xl p-5 shadow-md border-t-[3px] hover:-translate-y-0.5 transition-transform duration-200"
      style={{ borderTopColor: c.border }}
    >
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-3xl font-black" style={{ color: c.text }}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
      <div className="h-1 bg-slate-100 rounded-full mt-3">
        <div
          className="h-1 rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(progress, 100)}%`, background: c.bar }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/KPICard.tsx
git commit -m "feat: add KPICard component"
```

---

## Task 10: ProcessBarChart (ECharts)

**Files:**
- Create: `app/components/charts/ProcessBarChart.tsx`

- [ ] **Step 1: Create charts directory**

```bash
mkdir -p app/components/charts
```

- [ ] **Step 2: Write `app/components/charts/ProcessBarChart.tsx`**

```tsx
// app/components/charts/ProcessBarChart.tsx
'use client';
import dynamic from 'next/dynamic';
import type { EChartsOption } from 'echarts';
import { Process } from '@/app/lib/types';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

function statusColor(status: Process['status']): string {
  const map = { en_meta: '#22c55e', alerta: '#f59e0b', critico: '#ef4444', sin_datos: '#94a3b8' };
  return map[status];
}

interface Props { procesos: Process[] }

export default function ProcessBarChart({ procesos }: Props) {
  const sorted = [...procesos].sort((a, b) => (b.cumplimiento ?? -1) - (a.cumplimiento ?? -1));

  const option: EChartsOption = {
    animation: true,
    animationDuration: 1200,
    animationEasing: 'cubicOut' as const,
    grid: { left: 130, right: 55, top: 8, bottom: 8 },
    xAxis: { type: 'value', max: 120, show: false },
    yAxis: {
      type: 'category',
      data: sorted.map(p => p.nombre),
      axisLabel: { fontSize: 11, color: '#64748b', width: 120, overflow: 'truncate' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 12,
      borderRadius: [0, 6, 6, 0],
      data: sorted.map(p => ({
        value: p.cumplimiento ?? 0,
        itemStyle: { color: statusColor(p.status) },
      })),
      label: {
        show: true,
        position: 'right',
        formatter: (params: any) =>
          params.value === 0 ? 'S/D' : `${Number(params.value).toFixed(1)}%`,
        fontSize: 11,
        fontWeight: 700,
        color: '#0f172a',
      },
    }],
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0];
        return `<strong>${p.name}</strong><br/>Cumplimiento: ${p.value === 0 ? 'Sin datos' : p.value.toFixed(1) + '%'}`;
      },
    },
  };

  return <ReactECharts option={option} style={{ height: '300px', width: '100%' }} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/charts/ProcessBarChart.tsx
git commit -m "feat: add ProcessBarChart ECharts component"
```

---

## Task 11: MonthlyTrendChart (ECharts)

**Files:**
- Create: `app/components/charts/MonthlyTrendChart.tsx`

- [ ] **Step 1: Write `app/components/charts/MonthlyTrendChart.tsx`**

```tsx
// app/components/charts/MonthlyTrendChart.tsx
'use client';
import dynamic from 'next/dynamic';
import type { EChartsOption } from 'echarts';
import { MonthlyData, Quarter } from '@/app/lib/types';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Props {
  mensual: MonthlyData[];
  trimestres: Quarter[];
}

export default function MonthlyTrendChart({ mensual, trimestres }: Props) {
  // Use Q1 meta as baseline (first trimestre with a meta defined)
  const metaValue = 90; // ISO 9001 standard target

  const option: EChartsOption = {
    animation: true,
    animationDuration: 1800,
    animationEasing: 'cubicOut' as const,
    grid: { left: 44, right: 16, top: 16, bottom: 48 },
    xAxis: {
      type: 'category',
      data: mensual.map(m => m.mes),
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#f1f5f9' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%', fontSize: 9, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f8fafc', width: 1 } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: 'Cumplimiento',
        type: 'line',
        smooth: true,
        connectNulls: false,
        data: mensual.map(m => m.cumplimiento),
        lineStyle: { color: '#0EA5E9', width: 2.5 },
        itemStyle: { color: '#fff', borderColor: '#0EA5E9', borderWidth: 2.5 },
        symbol: 'circle',
        symbolSize: 7,
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(14,165,233,0.28)' },
              { offset: 1, color: 'rgba(14,165,233,0)' },
            ],
          },
        },
      },
      {
        name: 'Meta (90%)',
        type: 'line',
        data: mensual.map(() => metaValue),
        lineStyle: { color: '#22c55e', width: 1.5, type: 'dashed' },
        symbol: 'none',
        itemStyle: { color: '#22c55e' },
      },
    ],
    legend: {
      bottom: 8,
      textStyle: { fontSize: 11, color: '#94a3b8' },
      itemHeight: 8,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) =>
        params
          .filter((p: any) => p.value !== null)
          .map((p: any) => `${p.seriesName}: ${p.value !== null ? p.value.toFixed(1) + '%' : '—'}`)
          .join('<br/>'),
    },
  };

  return (
    <div>
      <ReactECharts option={option} style={{ height: '220px', width: '100%' }} />
      <div className="grid grid-cols-2 gap-2 mt-2">
        {trimestres.slice(0, 2).map(q => {
          const borderColor = q.status === 'en_meta' ? '#22c55e' : q.status === 'alerta' ? '#f59e0b' : q.status === 'critico' ? '#ef4444' : '#94a3b8';
          return (
            <div key={q.label} className="bg-slate-50 rounded-lg p-2 pl-3" style={{ borderLeft: `3px solid ${borderColor}` }}>
              <div className="text-xs text-slate-400">{q.label} {q.months}</div>
              <div className="text-sm font-bold text-slate-800">{q.cumplimiento?.toFixed(1) ?? '—'}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/charts/MonthlyTrendChart.tsx
git commit -m "feat: add MonthlyTrendChart ECharts component"
```

---

## Task 12: ProcessGaugeGrid (ECharts)

**Files:**
- Create: `app/components/charts/ProcessGaugeGrid.tsx`

- [ ] **Step 1: Write `app/components/charts/ProcessGaugeGrid.tsx`**

```tsx
// app/components/charts/ProcessGaugeGrid.tsx
'use client';
import dynamic from 'next/dynamic';
import type { EChartsOption } from 'echarts';
import { Process } from '@/app/lib/types';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

function gaugeColor(status: Process['status']): string {
  const map = { en_meta: '#22c55e', alerta: '#f59e0b', critico: '#ef4444', sin_datos: '#94a3b8' };
  return map[status];
}

function gaugeOption(proceso: Process): EChartsOption {
  const value = proceso.cumplimiento ?? 0;
  const color = gaugeColor(proceso.status);
  return {
    animation: true,
    animationDuration: 1800,
    animationEasing: 'cubicOut' as const,
    series: [{
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 120,
      radius: '88%',
      pointer: { show: false },
      progress: {
        show: true,
        roundCap: true,
        width: 8,
        itemStyle: { color },
      },
      axisLine: { lineStyle: { width: 8, color: [[1, '#f1f5f9']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        formatter: (v: number) => proceso.status === 'sin_datos' ? 'S/D' : `${v.toFixed(0)}%`,
        fontSize: 13,
        fontWeight: 800,
        color,
        offsetCenter: [0, '15%'],
      },
      title: { show: false },
      data: [{ value, name: proceso.nombre }],
    }],
  };
}

interface Props { procesos: Process[] }

export default function ProcessGaugeGrid({ procesos }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {procesos.map(p => (
        <div key={p.nombre} className="bg-white rounded-xl p-3 shadow-sm border border-slate-50">
          <ReactECharts
            option={gaugeOption(p)}
            style={{ height: '110px', width: '100%' }}
          />
          <div className="text-center -mt-1">
            <div className="text-xs font-semibold text-slate-700 leading-tight">{p.nombre}</div>
            <div className="text-xs text-slate-400 mt-0.5">{p.numIndicadores} indicadores</div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/charts/ProcessGaugeGrid.tsx
git commit -m "feat: add ProcessGaugeGrid with animated ECharts gauges"
```

---

## Task 13: QualityRadar (ECharts)

**Files:**
- Create: `app/components/charts/QualityRadar.tsx`

- [ ] **Step 1: Write `app/components/charts/QualityRadar.tsx`**

```tsx
// app/components/charts/QualityRadar.tsx
'use client';
import dynamic from 'next/dynamic';
import type { EChartsOption } from 'echarts';
import { Indicator, QualityObjective } from '@/app/lib/types';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Props {
  objetivos: QualityObjective[];
  indicadores: Indicator[];
}

export default function QualityRadar({ objetivos, indicadores }: Props) {
  // Compute average result per OC from indicators
  const ocValues = objetivos.map(oc => {
    const matching = indicadores.filter(i => i.oc === oc.codigo && i.resultado !== null);
    if (matching.length === 0) return 0;
    const avg = matching.reduce((sum, i) => sum + (i.resultado ?? 0), 0) / matching.length;
    return Math.round(avg * 10) / 10;
  });

  const option: EChartsOption = {
    animation: true,
    animationDuration: 1500,
    radar: {
      indicator: objetivos.map(oc => ({
        name: `${oc.codigo}\n${oc.descripcion.length > 18 ? oc.descripcion.substring(0, 18) + '…' : oc.descripcion}`,
        max: 100,
      })),
      shape: 'polygon',
      splitNumber: 4,
      axisName: { fontSize: 9, color: '#64748b', lineHeight: 14 },
      splitLine: { lineStyle: { color: '#f1f5f9', width: 1 } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    series: [
      {
        type: 'radar',
        data: [{
          value: ocValues,
          name: 'Resultado',
          itemStyle: { color: '#0EA5E9' },
          lineStyle: { color: '#0EA5E9', width: 2 },
          areaStyle: { color: 'rgba(14,165,233,0.18)' },
        }, {
          value: objetivos.map(() => 90),
          name: 'Meta (90%)',
          itemStyle: { color: '#22c55e' },
          lineStyle: { color: '#22c55e', width: 1.5, type: 'dashed' },
          areaStyle: { color: 'rgba(34,197,94,0.05)' },
        }],
      },
    ],
    legend: {
      bottom: 0,
      textStyle: { fontSize: 10, color: '#94a3b8' },
    },
    tooltip: {},
  };

  return <ReactECharts option={option} style={{ height: '280px', width: '100%' }} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/charts/QualityRadar.tsx
git commit -m "feat: add QualityRadar ECharts component"
```

---

## Task 14: QuarterSummary Component

**Files:**
- Create: `app/components/QuarterSummary.tsx`

- [ ] **Step 1: Write `app/components/QuarterSummary.tsx`**

```tsx
// app/components/QuarterSummary.tsx
import { Quarter } from '@/app/lib/types';

const statusConfig = {
  en_meta:   { emoji: '🟢', label: 'En meta',   bg: 'bg-green-50',  border: 'border-green-400', text: 'text-green-700' },
  alerta:    { emoji: '🟡', label: 'Alerta',    bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700' },
  critico:   { emoji: '🔴', label: 'Crítico',   bg: 'bg-red-50',    border: 'border-red-400',   text: 'text-red-700' },
  sin_datos: { emoji: '⚪', label: 'Sin datos', bg: 'bg-slate-50',  border: 'border-slate-300', text: 'text-slate-500' },
};

interface Props { trimestres: Quarter[] }

export default function QuarterSummary({ trimestres }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {trimestres.map(q => {
        const cfg = statusConfig[q.status];
        return (
          <div
            key={q.label}
            className={`rounded-xl p-4 border-l-4 ${cfg.bg} ${cfg.border}`}
          >
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{q.label}</div>
            <div className="text-xs text-slate-400 mb-2">{q.months}</div>
            <div className="text-2xl font-black text-slate-800">
              {q.cumplimiento !== null ? `${q.cumplimiento.toFixed(1)}%` : '—'}
            </div>
            <div className={`text-xs font-semibold mt-1 ${cfg.text}`}>
              {cfg.emoji} {cfg.label}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{q.mediciones} mediciones</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/QuarterSummary.tsx
git commit -m "feat: add QuarterSummary component"
```

---

## Task 15: IndicatorsTable Component

**Files:**
- Create: `app/components/IndicatorsTable.tsx`

- [ ] **Step 1: Write `app/components/IndicatorsTable.tsx`**

```tsx
// app/components/IndicatorsTable.tsx
'use client';
import { useState } from 'react';
import { Indicator, IndicatorStatus } from '@/app/lib/types';

const statusBadge: Record<IndicatorStatus, { label: string; cls: string }> = {
  en_meta:   { label: '🟢 En meta',   cls: 'bg-green-100 text-green-800' },
  alerta:    { label: '🟡 Alerta',    cls: 'bg-yellow-100 text-yellow-800' },
  critico:   { label: '🔴 Crítico',   cls: 'bg-red-100 text-red-800' },
  sin_datos: { label: '⚪ Sin datos', cls: 'bg-slate-100 text-slate-500' },
};

type Filter = 'todos' | IndicatorStatus;

interface Props { indicadores: Indicator[] }

export default function IndicatorsTable({ indicadores }: Props) {
  const [filter, setFilter] = useState<Filter>('todos');
  const [proceso, setProceso] = useState('');

  const procesos = Array.from(new Set(indicadores.map(i => i.proceso))).sort();

  const visible = indicadores.filter(i => {
    if (filter !== 'todos' && i.status !== filter) return false;
    if (proceso && i.proceso !== proceso) return false;
    return true;
  });

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {(['todos', 'en_meta', 'alerta', 'critico', 'sin_datos'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              filter === f
                ? 'bg-[#1B3A8A] text-white border-[#1B3A8A]'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            {f === 'todos' ? 'Todos' : statusBadge[f as IndicatorStatus].label}
          </button>
        ))}
        <select
          value={proceso}
          onChange={e => setProceso(e.target.value)}
          className="ml-auto text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white"
        >
          <option value="">Todos los procesos</option>
          {procesos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {['#', 'Indicador', 'Proceso', 'Líder', 'Frec.', 'Meta', 'Resultado', 'Estado'].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-2 px-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(ind => {
              const badge = statusBadge[ind.status];
              return (
                <tr key={ind.numero} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                  <td className="py-2.5 px-3 text-slate-400 text-xs">{ind.numero}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[200px]">{ind.nombre}</td>
                  <td className="py-2.5 px-3 text-slate-500 text-xs">{ind.proceso}</td>
                  <td className="py-2.5 px-3 text-slate-500 text-xs">{ind.lider}</td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">{ind.frecuencia}</td>
                  <td className="py-2.5 px-3 text-slate-500 text-xs">{ind.meta}</td>
                  <td className="py-2.5 px-3 font-bold" style={{
                    color: ind.status === 'en_meta' ? '#16a34a' : ind.status === 'critico' ? '#dc2626' : ind.status === 'alerta' ? '#b45309' : '#94a3b8'
                  }}>
                    {ind.resultado !== null ? `${ind.resultado.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 text-sm">Sin indicadores para los filtros seleccionados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-400 mt-2">{visible.length} de {indicadores.length} indicadores</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/IndicatorsTable.tsx
git commit -m "feat: add IndicatorsTable with status and process filters"
```

---

## Task 16: Dashboard Page Assembly

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Write `app/page.tsx`**

```tsx
// app/page.tsx
import { getServerSession } from 'next-auth';
import { authOptions } from './api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { getIndicatorsData } from '@/app/lib/data';
import HeroBanner from './components/HeroBanner';
import KPICard from './components/KPICard';
import QuarterSummary from './components/QuarterSummary';
import ProcessBarChart from './components/charts/ProcessBarChart';
import MonthlyTrendChart from './components/charts/MonthlyTrendChart';
import ProcessGaugeGrid from './components/charts/ProcessGaugeGrid';
import QualityRadar from './components/charts/QualityRadar';
import IndicatorsTable from './components/IndicatorsTable';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: { searchParams: { year?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  const year: '2025' | '2026' = searchParams.year === '2025' ? '2025' : '2026';

  let data;
  try {
    data = await getIndicatorsData(year);
  } catch (err) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="bg-white rounded-xl p-8 shadow text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Error cargando indicadores</h2>
          <p className="text-slate-500 text-sm">No se pudo conectar con SharePoint. Verifica las credenciales en .env.local.</p>
        </div>
      </div>
    );
  }

  const { summary, trimestres, procesos, mensual, indicadores, objetivosCalidad, fetchedAt } = data;
  const userName = session.user?.name ?? session.user?.email ?? '';

  return (
    <div className="min-h-screen bg-slate-100">

      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-sm"
              style={{ background: 'linear-gradient(135deg, #1B3A8A, #0EA5E9)' }}
            >
              Q
            </div>
            <span className="font-bold text-slate-800">Cuántico</span>
            <span className="text-slate-300 mx-1">·</span>
            <span className="text-slate-500 text-sm font-medium">SGC ISO 9001</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Year selector */}
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-full p-0.5 border border-slate-200">
              <a
                href="?year=2025"
                className={`text-xs px-3 py-1 rounded-full transition-colors ${year === '2025' ? 'bg-white text-slate-800 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'}`}
              >
                2025
              </a>
              <a
                href="?year=2026"
                className={`text-xs px-3 py-1 rounded-full transition-colors ${year === '2026' ? 'bg-white text-slate-800 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'}`}
              >
                2026
              </a>
            </div>
            <span className="text-xs text-slate-400">
              Actualizado {new Date(fetchedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #1B3A8A, #0EA5E9)' }}
              title={userName}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Banner */}
      <HeroBanner summary={summary} userName={userName} />

      {/* KPI Cards — float over hero */}
      <div className="max-w-7xl mx-auto px-6 -mt-12 relative z-10">
        <div className="grid grid-cols-4 gap-4">
          <KPICard
            label="Avance Global"
            value={`${summary.avanceGlobal.toFixed(1)}%`}
            sub={`${summary.medidos} de ${summary.totalIndicadores} indicadores medidos`}
            progress={summary.avanceGlobal}
            color="blue"
          />
          <KPICard
            label="En Meta 🟢"
            value={String(summary.enMeta)}
            sub="indicadores cumplidos"
            progress={(summary.enMeta / summary.totalIndicadores) * 100}
            color="green"
          />
          <KPICard
            label="En Alerta 🟡"
            value={String(summary.alerta)}
            sub="requieren atención"
            progress={(summary.alerta / summary.totalIndicadores) * 100}
            color="yellow"
          />
          <KPICard
            label="Críticos 🔴"
            value={String(summary.critico)}
            sub="fuera de meta"
            progress={(summary.critico / summary.totalIndicadores) * 100}
            color="red"
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Quarterly Summary */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Cumplimiento por Trimestre
          </h2>
          <QuarterSummary trimestres={trimestres} />
        </section>

        {/* Charts Row */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Análisis de Desempeño
          </h2>
          <div className="grid grid-cols-[1.4fr_1fr] gap-5">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-50">
              <h3 className="text-sm font-bold text-slate-800 mb-1">Cumplimiento por Proceso</h3>
              <p className="text-xs text-slate-400 mb-4">Todos los procesos · {year}</p>
              <ProcessBarChart procesos={procesos} />
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-50">
              <h3 className="text-sm font-bold text-slate-800 mb-1">Evolución Mensual</h3>
              <p className="text-xs text-slate-400 mb-4">Cumplimiento promedio por mes vs meta 90%</p>
              <MonthlyTrendChart mensual={mensual} trimestres={trimestres} />
            </div>
          </div>
        </section>

        {/* Process Gauges */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Indicadores por Proceso
          </h2>
          <ProcessGaugeGrid procesos={procesos} />
        </section>

        {/* Radar */}
        <section>
          <div className="grid grid-cols-[1fr_1.6fr] gap-5">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-50">
              <h3 className="text-sm font-bold text-slate-800 mb-1">Objetivos de Calidad</h3>
              <p className="text-xs text-slate-400 mb-2">OC1–OC5 resultado vs meta</p>
              <QualityRadar objetivos={objetivosCalidad} indicadores={indicadores} />
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Todos los Indicadores</h3>
                  <p className="text-xs text-slate-400">Filtro por estado y proceso</p>
                </div>
              </div>
              <IndicatorsTable indicadores={indicadores} />
            </div>
          </div>
        </section>

      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-8 py-4">
        <div className="max-w-7xl mx-auto px-6 flex justify-between text-xs text-slate-400">
          <span>Cuantico · Sistema de Gestión de Calidad ISO 9001 · {new Date().getFullYear()}</span>
          <span>MAT-CAL-03 v1 · Datos desde SharePoint</span>
        </div>
      </footer>

    </div>
  );
}
```

- [ ] **Step 2: Start the dev server and verify**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Expected flow:
1. Redirected to Azure AD login page
2. Sign in with a `@cuantico.com` account
3. Redirected back to dashboard
4. Hero banner appears with particle animation and count-up
5. KPI cards, charts, and table render with data

If SharePoint returns an error, check:
- `.env.local` values are correct
- The redirect URI is added to the Azure app registration (Prerequisite step)
- Run: `node -e "require('dotenv').config({path:'.env.local'}); const {fetchIndicatorsBuffer} = require('./app/lib/sharepoint'); fetchIndicatorsBuffer().then(b => console.log('OK', b.length, 'bytes')).catch(console.error)"`

- [ ] **Step 3: Final commit**

```bash
git add app/page.tsx
git commit -m "feat: assemble dashboard page with all components"
```

---

## Self-Review Checklist (Run after writing)

- [x] **Spec § Auth:** NextAuth Azure AD — Task 6 ✓
- [x] **Spec § Data / SharePoint path:** `0. Compañia/...` in `sharepoint.ts` + `.env.local` ✓
- [x] **Spec § Animations:** particles canvas (Task 8), count-up (Task 8), gauge sweep (Task 12), bar grow (Task 10), line draw (Task 11), radar expand (Task 13) ✓
- [x] **Spec § 5-min cache:** `data.ts` cache layer ✓
- [x] **Spec § KPI cards:** Task 9 ✓
- [x] **Spec § Process gauges grid:** Task 12 ✓
- [x] **Spec § Quality radar OC1–OC5:** Task 13 ✓
- [x] **Spec § Filterable table:** Task 15 ✓
- [x] **Spec § Footer:** included in page.tsx ✓
- [x] **Type consistency:** `IndicatorStatus` used uniformly across types, components, table ✓
- [x] **No placeholders:** all code blocks are complete ✓
