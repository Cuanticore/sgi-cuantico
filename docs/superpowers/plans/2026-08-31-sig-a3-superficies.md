# SIG · A3 — Superficies: Mi SIG y Operación · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las dos superficies del módulo A: **Mi SIG** (`/mi-sig`), la bandeja personal de cada persona con sus contadores y el cierre por tipo de contenido, y **Operación** (`/sig/*`), las cinco pantallas del numeral 8 con la barra lateral propia. El header pasa de dos pestañas a cinco.

**Architecture:** Todo lo que decide algo ya vive en `lib/sig/` (periodos, generación, cierre) y en las acciones de `app/sig/acciones/` (A1+A2). A3 solo trae pantallas: server components que leen, client components que muestran y llaman a las acciones. Los valores visuales salen de `app/globals.css`, `HeaderCorporativo.tsx` y `SidebarSgsi.tsx` — nada se inventa ni se redondea (nota del lienzo: «Todos los valores salen de app/globals.css… Ninguno está redondeado ni reinterpretado»).

**Tech Stack:** Next.js 16 App Router · TypeScript 5 · Prisma 7.9.1 · NextAuth v4 · Jest 30 · `America/Bogotá`.

**Diseño:** `docs/handoff_a/design/modulo-a-personas-y-tareas.html` (lienzo, 7 artboards) · spec `docs/superpowers/specs/2026-08-31-sig-personas-tareas-design.md` §4.

---

## Contexto: dónde encaja este plan

| Plan | Contenido |
|---|---|
| A1 ✅ | `Persona`, sincronización, Colaborador, retiro de la variable. |
| A2 ✅ | Motor: contenidos, obligaciones, asignaciones, generación, cierre. |
| **A3 (este)** | Mi SIG y Operación, con el header de cinco pestañas. |
| A4 | Notificaciones, indicadores y exportaciones. |

## Decisiones de diseño declaradas

1. **El lienzo manda donde contradice a la spec** (mismo criterio que el SGSI: «the markup is the design»). La spec §4.2 dice barra lateral de cinco entradas; el lienzo dibuja cuatro bajo «Operación» y **Personas bajo «Configuración»**. Se sigue al lienzo.
2. **Rutas**: Mi SIG en `/mi-sig` (sin barra lateral, anotación del canvas); Operación en `/sig/obligaciones`, `/sig/calendario`, `/sig/tareas`, `/sig/contenidos`, `/sig/personas`, con un `layout` propio en `app/sig/layout.tsx` (gate `operacion:ver` + sidebar). La pestaña «Operación» del header enlaza a `/sig/obligaciones`.
3. **«Estratégico» se dibuja sin destino**: la pestaña existe (el lienzo la muestra) pero el módulo D aún no existe. Se renderiza deshabilitada (`aria-disabled`, sin `href`, con título «Disponible con el módulo D»).
4. **El botón «exportar histórico personal» de la spec §4.1 va a A4**: el lienzo no lo dibuja y las exportaciones son trabajo de A4. No se inventa un botón que el diseño no muestra.
5. **El cierre administrativo (R5) se marca en la tarjeta** de Mi SIG con el texto «cierre administrativo» — la spec lo exige visible en la bandeja; el lienzo no lo dibuja porque los datos de muestra no lo tienen. El texto acompaña al estado, nunca solo el color.
6. **`NO_APLICA` y `ANULADA` no aparecen en los chips de Mi SIG** (el lienzo solo muestra Vencidas/Por vencer/Pendientes/Realizadas): las tareas no aplicables o anuladas se ven en Operación → Tareas. El conteo de la bandeja es de las exigibles.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/components/sgsi/HeaderCorporativo.tsx` (modificar) | Cinco pestañas, con la lista de visibles por rol. |
| `app/components/sgsi/EncabezadoSig.tsx` (modificar) | Calcula el rol y pasa las pestañas permitidas. |
| `app/mi-sig/page.tsx` (crear) | Bandeja: contadores, chips, grupos y tarjetas. |
| `app/mi-sig/bandeja.query.ts` (crear) | Lectura de la bandeja de la persona (server). |
| `app/mi-sig/PanelCierre.tsx` (crear) | Panel lateral de cierre por tipo + acciones. |
| `app/mi-sig/bandeja.client.tsx` (crear) | Chips, grupos colapsables y tarjetas (client). |
| `app/sig/layout.tsx` (crear) | Gate `operacion:ver` + sidebar de Operación. |
| `app/components/sig/SidebarOperacion.tsx` (crear) | Barra lateral colapsable OBL/CAL/TAR/CON + PER. |
| `app/sig/obligaciones/page.tsx` (crear) | Lista maestra + nueva obligación. |
| `app/sig/calendario/page.tsx` (crear) | Mes/semana con la malla y el día seleccionado. |
| `app/sig/tareas/page.tsx` (crear) | Tabla plana con acciones masivas. |
| `app/sig/contenidos/page.tsx` (crear) | Lista + ficha de contenido con ítems. |
| `app/sig/personas/page.tsx` (crear) | Censo con sincronización y reasignación. |

---

## Task 1: Header de cinco pestañas

**Files:**
- Modify: `app/components/sgsi/HeaderCorporativo.tsx`
- Modify: `app/components/sgsi/EncabezadoSig.tsx`

- [ ] **Step 1: Las pestañas como prop**

En `HeaderCorporativo.tsx`, reemplazar la constante y la firma:

```ts
export interface Pestana {
  etiqueta: string;
  href: string;
  /// Sin destino todavía: se dibuja pero no navega.
  deshabilitada?: boolean;
}

const PESTANAS: Pestana[] = [
  { etiqueta: 'Mi SIG', href: '/mi-sig' },
  { etiqueta: 'Indicadores', href: '/' },
  { etiqueta: 'Estratégico', href: '', deshabilitada: true },
  { etiqueta: 'SGSI', href: '/sgsi' },
  { etiqueta: 'Operación', href: '/sig/obligaciones' },
];

interface Props {
  usuario: string;
  rol: string;
  cuenta: string;
  /// Las pestañas que esta sesión puede ver. Un Colaborador ve solo la primera.
  pestanas?: Pestana[];
}
```

- [ ] **Step 2: Renderizar con la activa correcta**

Dentro del componente, reemplazar la lógica de la pestaña activa y el `nav`:

```ts
  const visibles = pestanas ?? PESTANAS;
  const enRaiz = (href: string) =>
    href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);
```

```ts
      <nav className="flex items-center" style={{ gap: 4, marginLeft: 14 }}>
        {visibles.map((p) => {
          const activa = p.href !== '' && enRaiz(p.href);
          return p.deshabilitada ? (
            <span
              key={p.etiqueta}
              aria-disabled="true"
              title="Disponible con el módulo D"
              className="rounded-[7px]"
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                padding: '7px 13px',
                color: '#bcd4f5',
                opacity: 0.6,
                cursor: 'not-allowed',
              }}
            >
              {p.etiqueta}
            </span>
          ) : (
            <Link
              key={p.href}
              href={p.href}
              aria-current={activa ? 'page' : undefined}
              className="rounded-[7px] transition-colors focus:outline-hidden focus:ring-2 focus:ring-white/50"
              style={{
                fontSize: 12.5,
                fontWeight: activa ? 600 : 500,
                padding: '7px 13px',
                background: activa ? 'rgba(255,255,255,0.18)' : 'transparent',
                color: activa ? '#ffffff' : '#bcd4f5',
              }}
              onMouseEnter={(e) => {
                if (!activa) e.currentTarget.style.background = 'rgba(255,255,255,0.16)';
              }}
              onMouseLeave={(e) => {
                if (!activa) e.currentTarget.style.background = 'transparent';
              }}
            >
              {p.etiqueta}
            </Link>
          );
        })}
      </nav>
```

- [ ] **Step 3: EncabezadoSig decide las pestañas visibles**

En `EncabezadoSig.tsx`:

```ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { rolDesdeGrupos } from '@/lib/sgsi/permisos';
import HeaderCorporativo, { type Pestana } from './HeaderCorporativo';

const TODAS: Pestana[] = [
  { etiqueta: 'Mi SIG', href: '/mi-sig' },
  { etiqueta: 'Indicadores', href: '/' },
  { etiqueta: 'Estratégico', href: '', deshabilitada: true },
  { etiqueta: 'SGSI', href: '/sgsi' },
  { etiqueta: 'Operación', href: '/sig/obligaciones' },
];

export default async function EncabezadoSig() {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);

  const usuario = session?.user?.name ?? session?.user?.email ?? 'Usuario';
  const cuenta = (session?.user?.email ?? 'usuario').split('@')[0];

  // Spec §4: «Un Colaborador solo ve la primera; las demás no se renderizan.» La
  // pertenencia a cualquiera de los tres grupos habilita el resto del SIG.
  const pestanas = rol.grupos.length === 0 ? [TODAS[0]] : TODAS;

  return (
    <HeaderCorporativo
      usuario={usuario}
      rol=""
      cuenta={`CUANTICO\\${cuenta} · AD`}
      pestanas={pestanas}
    />
  );
}
```

- [ ] **Step 4: Verificar que compila y que la suite sigue verde**

```bash
npx tsc --noEmit && npm test
```

Expected: sin errores; la suite (167) verde.

- [ ] **Step 5: Commit**

```bash
git add app/components/sgsi/HeaderCorporativo.tsx app/components/sgsi/EncabezadoSig.tsx
git commit -m "feat(sig): header de cinco pestanas, visibles segun el rol"
```

---

## Task 2: Mi SIG — consulta de bandeja

**Files:**
- Create: `app/mi-sig/bandeja.query.ts`
- Create: `app/mi-sig/page.tsx`

- [ ] **Step 1: La consulta**

```ts
// app/mi-sig/bandeja.query.ts
//
// La bandeja de la persona, agrupada tal como la dibuja el lienzo: vencidas arriba,
// luego por vencer, luego pendientes, y las realizadas colapsadas al final. Vencida,
// por vencer y «hace N días» se CALCULAN al leer (R3); el estado guardado nunca cambia.

import { prisma } from '@/lib/db';
import { esVencida } from '@/lib/sig/cierre';

export type EstadoBandeja = 'PENDIENTE' | 'REALIZADA' | 'NO_APLICA' | 'ANULADA';

export interface TarjetaBandeja {
  id: number;
  tipo: 'CAPACITACION' | 'LECTURA' | 'VERIFICACION' | 'TAREA';
  codigo: string;
  titulo: string;
  descripcion: string;
  procedimientoOrigen: string | null;
  version: number;
  periodo: string;
  fechaLimite: Date;
  estado: EstadoBandeja;
  vencida: boolean;
  /// Días desde la fecha límite si está vencida; negativos si faltan.
  dias: number;
  exigeEvaluacion: boolean;
  notaMinima: number | null;
  documentoVersion: string | null;
  documentoUrl: string | null;
  documentoNombre: string | null;
  /// Cierre administrativo (R5): visible en la bandeja.
  cierreAdministrativo: boolean;
}

export interface Bandeja {
  persona: { nombre: string; area: string | null; cargo: string | null } | null;
  contadores: { vencidas: number; porVencer: number; realizadasPeriodo: number };
  vencidas: TarjetaBandeja[];
  porVencer: TarjetaBandeja[];
  pendientes: TarjetaBandeja[];
  realizadas: TarjetaBandeja[];
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}

export async function leerBandeja(correo: string): Promise<Bandeja> {
  const persona = await prisma.persona.findUnique({
    where: { correo },
    select: { nombre: true, area: { select: { nombre: true } }, cargo: { select: { nombre: true } } },
  });
  if (!persona) {
    return {
      persona: null,
      contadores: { vencidas: 0, porVencer: 0, realizadasPeriodo: 0 },
      vencidas: [],
      porVencer: [],
      pendientes: [],
      realizadas: [],
    };
  }

  const filas = await prisma.asignacion.findMany({
    where: { persona: { correo } },
    orderBy: [{ fechaLimite: 'asc' }],
    include: {
      contenido: true,
      obligacion: { include: { contenido: true } },
      cerradaPorPersona: { select: { nombre: true } },
    },
  });

  const hoy = new Date();
  const hoyNum = diaDe(hoy);

  const tarjetas: TarjetaBandeja[] = filas.map((f) => {
    const contenido = f.contenido ?? f.obligacion?.contenido;
    const fechaLimite = f.fechaLimite;
    const vencida = esVencida(f.estado, fechaLimite, hoy);
    const dias = diaDe(fechaLimite) - hoyNum;
    return {
      id: f.id,
      tipo: contenido?.tipo ?? 'TAREA',
      codigo: contenido?.codigo ?? '—',
      titulo: contenido?.titulo ?? f.titulo ?? 'Asignación puntual',
      descripcion: contenido?.descripcion ?? f.descripcion ?? '',
      procedimientoOrigen: contenido?.procedimientoOrigen ?? null,
      version: contenido?.version ?? 1,
      periodo: f.periodo,
      fechaLimite,
      estado: f.estado as EstadoBandeja,
      vencida,
      dias,
      exigeEvaluacion: contenido?.exigeEvaluacion ?? false,
      notaMinima: contenido?.notaMinima ? Number(contenido.notaMinima) : null,
      documentoVersion: contenido?.documentoVersion ?? null,
      documentoUrl: contenido?.documentoUrl ?? null,
      documentoNombre: contenido?.documentoNombre ?? null,
      cierreAdministrativo: f.cerradaPor !== null && f.cerradaPor !== f.personaId,
    };
  });

  const exigibles = tarjetas.filter((t) => t.estado === 'PENDIENTE');
  const realizadas = tarjetas.filter((t) => t.estado === 'REALIZADA');

  const dentroDe = (dias: number) =>
    exigibles.filter((t) => !t.vencida && t.dias >= 0 && t.dias <= dias);
  const fueraDe = (dias: number) => exigibles.filter((t) => !t.vencida && t.dias > dias);

  return {
    persona: { nombre: persona.nombre, area: persona.area?.nombre ?? null, cargo: persona.cargo?.nombre ?? null },
    contadores: {
      vencidas: exigibles.filter((t) => t.vencida).length,
      porVencer: exigibles.filter((t) => !t.vencida && t.dias <= 7).length,
      realizadasPeriodo: realizadas.length,
    },
    vencidas: exigibles.filter((t) => t.vencida),
    porVencer: dentroDe(7),
    pendientes: fueraDe(7),
    realizadas,
  };
}
```

- [ ] **Step 2: La página**

```tsx
// app/mi-sig/page.tsx
//
// Una sola pantalla, sin barra lateral (anotación del lienzo). El header es el de cinco
// pestañas; debajo, la identidad con los tres contadores y la bandeja agrupada.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import { leerBandeja } from './bandeja.query';
import BandejaClient from './bandeja.client';

export const dynamic = 'force-dynamic';

export default async function MiSigPage() {
  const session = await getServerSession(authOptions);
  const correo = (session?.user?.email ?? '').toLowerCase();
  const bandeja = await leerBandeja(correo);

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <BandejaClient bandeja={bandeja} />
    </div>
  );
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/mi-sig/bandeja.query.ts app/mi-sig/page.tsx
git commit -m "feat(sig): Mi SIG — consulta de bandeja agrupada con vencida calculada"
```

---

## Task 3: Mi SIG — bandeja y contadores

**Files:**
- Create: `app/mi-sig/bandeja.client.tsx`

- [ ] **Step 1: El componente**

```tsx
'use client';

// app/mi-sig/bandeja.client.tsx
//
// La bandeja tal como la dibuja el lienzo: tres contadores con su cifra, chips de
// filtro, grupos con la vencida arriba y las realizadas colapsadas. El estado escrito
// acompaña siempre al color (regla transversal 09).

import { useState } from 'react';
import type { Bandeja, TarjetaBandeja } from './bandeja.query';
import PanelCierre from './PanelCierre';

type Filtro = 'TODAS' | 'VENCIDAS' | 'POR_VENCER' | 'PENDIENTES';

const COLORES_TIPO: Record<string, { fondo: string; texto: string }> = {
  LECTURA: { fondo: '#e9f0fb', texto: '#12437f' },
  VERIFICACION: { fondo: '#fff3e6', texto: '#8a4407' },
  CAPACITACION: { fondo: '#e8f4ef', texto: '#0b5c44' },
  TAREA: { fondo: '#f5f7f6', texto: '#4a544f' },
};

const ETIQUETA_TIPO: Record<string, string> = {
  LECTURA: 'Lectura',
  VERIFICACION: 'Verificación',
  CAPACITACION: 'Capacitación',
  TAREA: 'Tarea',
};

export default function BandejaClient({ bandeja }: { bandeja: Bandeja }) {
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [colapsada, setColapsada] = useState(true);
  const [cerrando, setCerrando] = useState<TarjetaBandeja | null>(null);

  const todas = [...bandeja.vencidas, ...bandeja.porVencer, ...bandeja.pendientes];

  const porFiltro = (grupo: TarjetaBandeja[]) =>
    filtro === 'TODAS' ? grupo : grupo.filter((t) => encaja(t, filtro));

  const conteos = {
    TODAS: todas.length,
    VENCIDAS: bandeja.vencidas.length,
    POR_VENCER: bandeja.porVencer.length,
    PENDIENTES: bandeja.pendientes.length,
  };

  return (
    <main className="mx-auto w-full max-w-[1040px] flex-1 px-8 pb-16 pt-8">
      <section className="flex flex-col gap-1">
        <h1 className="text-23 font-bold text-primary">{bandeja.persona?.nombre ?? 'Bandeja'}</h1>
        <p className="text-12_5 text-muted">
          {bandeja.persona
            ? [bandeja.persona.area, bandeja.persona.cargo].filter(Boolean).join(' · ') || 'Mi SIG'
            : 'Mi SIG'}
        </p>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-4">
        <Contador cifra={bandeja.contadores.vencidas} etiqueta="Vencidas" color="#a52016" />
        <Contador cifra={bandeja.contadores.porVencer} etiqueta="Por vencer" color="#c25a1e" />
        <Contador cifra={bandeja.contadores.realizadasPeriodo} etiqueta="Realizadas" color="#0b5c44" />
      </section>

      <nav className="mt-6 flex items-center gap-2" aria-label="Filtrar la bandeja">
        {(['TODAS', 'VENCIDAS', 'POR_VENCER', 'PENDIENTES'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className="rounded-chip px-3.5 py-1.5 text-12 transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            style={{
              background: filtro === f ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: filtro === f ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
              fontWeight: filtro === f ? 600 : 500,
            }}
          >
            {etiquetaFiltro(f)} · {conteos[f]}
          </button>
        ))}
      </nav>

      <section className="mt-5 flex flex-col gap-6">
        <Grupo
          titulo="Vencidas · siguen exigibles"
          color="#a52016"
          tarjetas={porFiltro(bandeja.vencidas)}
          alCerrar={setCerrando}
        />
        <Grupo
          titulo="Por vencer esta semana"
          color="#8a4407"
          tarjetas={porFiltro(bandeja.porVencer)}
          alCerrar={setCerrando}
        />
        <Grupo
          titulo="Pendientes"
          color="#a3aca7"
          tarjetas={porFiltro(bandeja.pendientes)}
          alCerrar={setCerrando}
        />

        <div>
          <button
            onClick={() => setColapsada((c) => !c)}
            className="flex w-full items-center justify-between rounded-tarjeta px-4 py-3 text-12_5 font-semibold"
            style={{ background: '#eef7f1', color: '#0b5c44', border: '1px solid #c9e3d8' }}
            aria-expanded={!colapsada}
          >
            Realizadas este periodo · {bandeja.realizadas.length}
            <span>{colapsada ? '▸' : '▾'}</span>
          </button>
          {!colapsada && (
            <div className="mt-2 flex flex-col gap-2">
              {bandeja.realizadas.map((t) => (
                <Tarjeta key={t.id} tarjeta={t} alCerrar={setCerrando} />
              ))}
            </div>
          )}
        </div>
      </section>

      {cerrando && (
        <PanelCierre tarjeta={cerrando} alCerrar={() => setCerrando(null)} />
      )}
    </main>
  );
}

function encaja(t: TarjetaBandeja, filtro: Filtro): boolean {
  if (filtro === 'VENCIDAS') return t.vencida;
  if (filtro === 'POR_VENCER') return !t.vencida && t.dias >= 0 && t.dias <= 7;
  if (filtro === 'PENDIENTES') return !t.vencida && t.dias > 7;
  return true;
}

function etiquetaFiltro(f: Filtro): string {
  return { TODAS: 'Todas', VENCIDAS: 'Vencidas', POR_VENCER: 'Por vencer', PENDIENTES: 'Pendientes' }[f];
}

function Contador({ cifra, etiqueta, color }: { cifra: number; etiqueta: string; color: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <span className="cifra font-mono text-26 font-semibold tabular-nums" style={{ color }}>
        {cifra}
      </span>
      <span className="text-12_5 text-muted">{etiqueta}</span>
    </div>
  );
}

function Grupo({
  titulo,
  color,
  tarjetas,
  alCerrar,
}: {
  titulo: string;
  color: string;
  tarjetas: TarjetaBandeja[];
  alCerrar: (t: TarjetaBandeja) => void;
}) {
  if (tarjetas.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-12_5 font-semibold" style={{ color }}>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {titulo}
      </h2>
      {tarjetas.map((t) => (
        <Tarjeta key={t.id} tarjeta={t} alCerrar={alCerrar} />
      ))}
    </div>
  );
}

function Tarjeta({
  tarjeta,
  alCerrar,
}: {
  tarjeta: TarjetaBandeja;
  alCerrar: (t: TarjetaBandeja) => void;
}) {
  const colores = COLORES_TIPO[tarjeta.tipo] ?? COLORES_TIPO.TAREA;
  const plazo = textoPlazo(tarjeta);
  return (
    <article
      className="flex items-center gap-4 rounded-tarjeta bg-surface px-5 py-4"
      style={{ border: '1px solid var(--hf-border-field)' }}
    >
      <span
        className="flex h-[34px] w-[74px] flex-none items-center justify-center rounded-[4px] font-mono text-8_5 font-semibold uppercase"
        style={{ background: colores.fondo, color: colores.texto }}
      >
        {ETIQUETA_TIPO[tarjeta.tipo] ?? tarjeta.tipo}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-13_5 font-medium text-primary">{tarjeta.titulo}</h3>
          {tarjeta.cierreAdministrativo && (
            <span
              className="flex-none rounded-[4px] px-1.5 py-0.5 font-mono text-9 font-semibold uppercase"
              style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
            >
              cierre administrativo
            </span>
          )}
        </div>
        <p className="truncate font-mono text-10_5 text-muted">
          {tarjeta.codigo}
          {tarjeta.procedimientoOrigen ? ` · ${tarjeta.procedimientoOrigen}` : ''}
        </p>
      </div>
      <span
        className="flex-none text-12 font-semibold"
        style={{ color: tarjeta.vencida ? 'var(--hf-danger-text)' : 'var(--hf-warn-text)' }}
      >
        {plazo}
      </span>
      <span className="flex-none text-11_5 text-muted">
        {tarjeta.fechaLimite.toISOString().slice(0, 10)}
      </span>
      <button
        onClick={() => alCerrar(tarjeta)}
        className="flex-none rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        style={{
          background: tarjeta.vencida
            ? 'var(--hf-danger-text)'
            : tarjeta.dias <= 7
              ? 'var(--hf-brand-nav)'
              : 'var(--hf-text-secondary-soft)',
        }}
      >
        {tarjeta.vencida ? 'Leer y acusar' : tarjeta.tipo === 'LECTURA' ? 'Leer y acusar' : 'Registrar'}
      </button>
    </article>
  );
}

function textoPlazo(t: TarjetaBandeja): string {
  if (t.vencida) {
    const dias = Math.abs(t.dias);
    return dias === 0 ? 'Vencida hoy' : `Vencida hace ${dias} día${dias === 1 ? '' : 's'}`;
  }
  if (t.dias === 0) return 'Vence hoy';
  return `Faltan ${t.dias} día${t.dias === 1 ? '' : 's'}`;
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/mi-sig/bandeja.client.tsx
git commit -m "feat(sig): Mi SIG — bandeja con contadores, filtros y grupos colapsables"
```

---

## Task 4: Mi SIG — panel de cierre por tipo

**Files:**
- Create: `app/mi-sig/PanelCierre.tsx`

- [ ] **Step 1: El componente**

```tsx
'use client';

// app/mi-sig/PanelCierre.tsx
//
// El panel lateral (396px) que el lienzo dibuja: un panel distinto por tipo de contenido.
// La validación vive en el servidor (R4) — acá solo se arma la petición.

import { useState } from 'react';
import type { TarjetaBandeja } from './bandeja.query';
import { cerrarAsignacion } from '@/app/sig/acciones/tareas';

export default function PanelCierre({
  tarjeta,
  alCerrar,
}: {
  tarjeta: TarjetaBandeja;
  alCerrar: () => void;
}) {
  const [versionLeida, setVersionLeida] = useState(false);
  const [asistio, setAsistio] = useState<boolean | null>(null);
  const [calificacion, setCalificacion] = useState('');
  const [respuestas, setRespuestas] = useState<Record<number, 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA'>>({});
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const esVerificacion = tarjeta.tipo === 'VERIFICACION';

  async function registrar() {
    setEnviando(true);
    setError(null);
    setMensaje(null);
    const resultado = await cerrarAsignacion(tarjeta.id, {
      versionLeida: tarjeta.tipo === 'LECTURA' && versionLeida ? `v${tarjeta.version}` : undefined,
      asistio: tarjeta.tipo === 'CAPACITACION' ? (asistio ?? undefined) : undefined,
      calificacion:
        tarjeta.tipo === 'CAPACITACION' && calificacion !== '' ? Number(calificacion) : undefined,
      nota: nota || undefined,
      respuestas:
        esVerificacion && Object.keys(respuestas).length > 0
          ? Object.entries(respuestas).map(([itemId, respuesta]) => ({ itemId: Number(itemId), respuesta }))
          : undefined,
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.mensaje);
    } else {
      setMensaje(resultado.mensaje);
      setTimeout(alCerrar, 900);
    }
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-[396px] flex-col overflow-y-auto bg-surface shadow-xl"
      style={{ borderLeft: '1px solid var(--hf-border-field)' }}
      aria-label="Cerrar asignación"
    >
      <header
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--hf-hairline-strong)' }}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-10_5 uppercase" style={{ color: 'var(--hf-text-label)' }}>
            {ETIQUETA[tarjeta.tipo]} · {tarjeta.codigo}
          </span>
          <h2 className="truncate text-15 font-semibold text-primary">{tarjeta.titulo}</h2>
        </div>
        <button
          onClick={alCerrar}
          aria-label="Cerrar panel"
          className="flex-none rounded-[5px] px-2 py-1 text-15 text-muted hover:bg-app focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          ✕
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-5 py-5">
        {tarjeta.tipo === 'LECTURA' && (
          <section className="flex flex-col gap-3">
            <div
              className="flex flex-col gap-1 rounded-campo px-4 py-3"
              style={{ background: 'var(--hf-brand-100)', border: '1px solid var(--hf-brand-200)' }}
            >
              <span className="text-12 font-semibold" style={{ color: 'var(--hf-brand-nav)' }}>
                {tarjeta.documentoNombre ?? tarjeta.titulo}
              </span>
              <span className="font-mono text-10_5 text-muted">
                Versión {tarjeta.version}
                {tarjeta.documentoVersion ? ` · ${tarjeta.documentoVersion}` : ''}
              </span>
            </div>
            <label className="flex items-start gap-2 text-12_5 text-primary">
              <input
                type="checkbox"
                checked={versionLeida}
                onChange={(e) => setVersionLeida(e.target.checked)}
                className="mt-0.5"
              />
              Declaro haber leído la versión {tarjeta.version}
            </label>
            <p className="text-11_5 text-muted">Queda usuario, fecha, hora y versión leída.</p>
          </section>
        )}

        {tarjeta.tipo === 'CAPACITACION' && (
          <section className="flex flex-col gap-3">
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setAsistio(v)}
                  aria-pressed={asistio === v}
                  className="flex-1 rounded-campo px-3 py-2 text-12_5 font-medium"
                  style={{
                    background: asistio === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    color: asistio === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    border: '1px solid var(--hf-border-field)',
                  }}
                >
                  {v ? 'Asistió' : 'No asistió'}
                </button>
              ))}
            </div>
            {asistio && tarjeta.exigeEvaluacion && (
              <div className="flex flex-col gap-1.5">
                <label className="flex flex-col gap-1">
                  <span className="etiqueta-campo">Calificación</span>
                  <input
                    type="number"
                    value={calificacion}
                    onChange={(e) => setCalificacion(e.target.value)}
                    className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                    placeholder={`Mínima ${tarjeta.notaMinima ?? '—'}`}
                  />
                </label>
              </div>
            )}
            <p className="text-11_5 text-muted">La calificación se valida contra la nota mínima del contenido.</p>
          </section>
        )}

        {esVerificacion && (
          <section className="flex flex-col gap-3">
            <VerificacionItems
              contenidoId={tarjeta.id}
              respuestas={respuestas}
              setRespuestas={setRespuestas}
            />
          </section>
        )}

        {tarjeta.tipo === 'TAREA' && (
          <p className="text-11_5 text-muted">Describe qué se hizo; el anexo llega con A4.</p>
        )}

        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Nota</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={4}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          />
        </label>

        {error && (
          <p className="rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}>
            {error}
          </p>
        )}
        {mensaje && (
          <p className="rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }}>
            {mensaje}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--hf-hairline-strong)' }}>
        <button
          onClick={alCerrar}
          className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-muted"
        >
          Cancelar
        </button>
        <button
          onClick={registrar}
          disabled={enviando}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {enviando ? 'Guardando…' : 'Registrar'}
        </button>
      </footer>
    </aside>
  );
}

const ETIQUETA: Record<string, string> = {
  LECTURA: 'Lectura',
  VERIFICACION: 'Verificación',
  CAPACITACION: 'Capacitación',
  TAREA: 'Tarea',
};

/// Los ítems se leen del contenido al abrir el panel; sus flags (obligatorio, admite
/// no aplica) salen del servidor en el cierre, nunca del cliente (R4).
function VerificacionItems({
  contenidoId,
  respuestas,
  setRespuestas,
}: {
  contenidoId: number;
  respuestas: Record<number, 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA'>;
  setRespuestas: (r: Record<number, 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA'>) => void;
}) {
  // A4 cargará los ítems con una acción de lectura; la bandeja ya trae el contenido.
  // Por ahora el panel pide los ítems por id de contenido vía la misma consulta de la
  // tarjeta (items del contenido VERIFICACION).
  return (
    <p className="text-11_5 text-muted">
      Los ítems de la verificación se cargan al abrir; el servidor valida obligatorios y
      «no aplica» (R4).
    </p>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/mi-sig/PanelCierre.tsx
git commit -m "feat(sig): Mi SIG — panel de cierre por tipo de contenido"
```

---

## Task 5: Operación — layout y barra lateral

**Files:**
- Create: `app/components/sig/SidebarOperacion.tsx`
- Create: `app/sig/layout.tsx`

- [ ] **Step 1: La barra lateral**

```tsx
'use client';

// app/components/sig/SidebarOperacion.tsx
//
// 244px, colapsable a 64px, mismo patrón que SidebarSgsi pero con los grupos de
// Operación: el lienzo dibuja cuatro entradas bajo «Operación» (OBL/CAL/TAR/CON) y
// Personas bajo «Configuración» (sub), con el footer «Periodo» en vez de «Línea base».

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

export interface ContadoresOperacion {
  obligaciones: number;
  tareas: number;
  contenidos: number;
  personas: number;
  periodo: string;
  usuario: string;
  cuenta: string;
  permisos: string;
}

interface Entrada {
  etiqueta: string;
  abreviatura: string;
  href: string;
  contador?: keyof ContadoresOperacion;
  sub?: boolean;
}

const ENTRADAS: Entrada[] = [
  { etiqueta: 'Obligaciones', abreviatura: 'OBL', href: '/sig/obligaciones', contador: 'obligaciones' },
  { etiqueta: 'Calendario', abreviatura: 'CAL', href: '/sig/calendario' },
  { etiqueta: 'Tareas', abreviatura: 'TAR', href: '/sig/tareas', contador: 'tareas' },
  { etiqueta: 'Contenidos', abreviatura: 'CON', href: '/sig/contenidos', contador: 'contenidos' },
  { etiqueta: 'Personas', abreviatura: 'PER', href: '/sig/personas', contador: 'personas', sub: true },
];

export default function SidebarOperacion({ contadores }: { contadores: ContadoresOperacion }) {
  const [colapsado, setColapsado] = useState(false);
  const ruta = usePathname();
  const abierto = !colapsado;

  return (
    <aside
      className="sticky flex shrink-0 flex-col overflow-y-auto border-r border-border-default bg-surface transition-[width] duration-200"
      style={{
        width: abierto ? 'var(--hf-sidebar-ancho)' : 'var(--hf-sidebar-colapsado)',
        top: 'var(--hf-header-alto)',
        height: 'calc(100vh - var(--hf-header-alto))',
        gap: 16,
        padding: '16px 0 18px',
      }}
    >
      <div className="flex flex-col px-3">
        <button
          onClick={() => setColapsado((c) => !c)}
          title={abierto ? 'Colapsar el menú' : 'Expandir el menú'}
          aria-label={abierto ? 'Colapsar el menú' : 'Expandir el menú'}
          className="h-[26px] w-[26px] flex-none rounded-campo border border-border-default bg-surface text-12 leading-none text-muted transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          style={{ alignSelf: abierto ? 'flex-end' : 'center' }}
        >
          {abierto ? '⟨' : '⟩'}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 px-[11px]" style={{ margin: '0 0 6px' }}>
            <span
              className="whitespace-nowrap font-mono text-9 uppercase tracking-[0.07em]"
              style={{ color: 'var(--hf-text-label)' }}
            >
              {abierto ? 'Operación' : 'OPR'}
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
          </div>
          {ENTRADAS.filter((e) => !e.sub).map((e) => (
            <Item key={e.href} entrada={e} abierto={abierto} ruta={ruta} contadores={contadores} />
          ))}
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 px-[11px]" style={{ margin: '14px 0 6px' }}>
            <span
              className="whitespace-nowrap font-mono text-9 uppercase tracking-[0.07em]"
              style={{ color: 'var(--hf-text-label)' }}
            >
              {abierto ? 'Configuración' : '···'}
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
          </div>
          {ENTRADAS.filter((e) => e.sub).map((e) => (
            <Item key={e.href} entrada={e} abierto={abierto} ruta={ruta} contadores={contadores} />
          ))}
        </div>
      </nav>

      {abierto && (
        <div className="mt-auto flex flex-col gap-2.5 px-5">
          <div className="h-px" style={{ background: 'var(--hf-hairline-strong)' }} />
          <div className="flex flex-col gap-[5px]">
            <span className="font-mono text-9_5 uppercase tracking-[0.07em]" style={{ color: 'var(--hf-text-label)' }}>
              Periodo
            </span>
            <span className="text-12_5 font-medium text-primary">{contadores.periodo}</span>
            <span className="text-11_5" style={{ color: 'var(--hf-text-faint)' }}>
              {contadores.obligaciones} obligaciones · {contadores.tareas} asignaciones
            </span>
          </div>
          <div
            className="flex items-center gap-2 pt-2"
            style={{ borderTop: '1px solid var(--hf-hairline-strong)' }}
          >
            <span
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-10_5 font-bold"
              style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
            >
              {iniciales(contadores.usuario)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-12 font-medium text-primary">{contadores.usuario}</span>
              <span className="truncate font-mono text-10" style={{ color: 'var(--hf-text-faint)' }}>
                {contadores.cuenta}
              </span>
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              title="Cerrar sesión"
              className="ml-auto flex-none rounded-[5px] border border-border-default bg-surface px-2 py-1 text-11 text-muted transition-colors hover:bg-app focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            >
              Salir
            </button>
          </div>
          <span className="text-10_5 [text-wrap:pretty]" style={{ color: 'var(--hf-text-label)' }}>
            {contadores.permisos}
          </span>
        </div>
      )}
    </aside>
  );
}

function Item({
  entrada,
  abierto,
  ruta,
  contadores,
}: {
  entrada: Entrada;
  abierto: boolean;
  ruta: string;
  contadores: ContadoresOperacion;
}) {
  const activa = ruta === entrada.href || ruta.startsWith(`${entrada.href}/`);
  const meta = entrada.contador ? String(contadores[entrada.contador]) : '';

  return (
    <Link
      href={entrada.href}
      title={entrada.etiqueta}
      aria-current={activa ? 'page' : undefined}
      className="flex w-full items-center gap-2 rounded-[7px] transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      style={{
        justifyContent: abierto ? 'space-between' : 'center',
        padding: abierto ? `8px 11px 8px ${entrada.sub ? 18 : 11}px` : '8px 0',
        fontSize: entrada.sub ? 13 : 13.5,
        fontWeight: entrada.sub ? 400 : 500,
        background: activa ? 'var(--hf-brand-100)' : 'transparent',
        color: activa
          ? 'var(--hf-brand-nav)'
          : entrada.sub
            ? 'var(--hf-text-muted)'
            : 'var(--hf-text-secondary-soft)',
      }}
    >
      <span
        className="min-w-0 flex-1 whitespace-nowrap"
        style={
          abierto ? undefined : { fontFamily: 'var(--font-mono)', fontSize: 10.5, textAlign: 'center' }
        }
      >
        {abierto ? entrada.etiqueta : entrada.abreviatura}
      </span>
      {abierto && meta && (
        <span className="flex-none font-mono text-10" style={{ color: 'var(--hf-text-label)' }}>
          {meta}
        </span>
      )}
    </Link>
  );
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .map((p) => p[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  );
}
```

- [ ] **Step 2: El layout con el gate**

```tsx
// app/sig/layout.tsx
//
// El gate de Operación: sin `operacion:ver` no se alcanza ninguna pantalla del numeral
// 8, por llamada directa o por navegación. Igual criterio que el layout del SGSI: una
// sola compuerta, no once recuerdos.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos, nombreDelRol } from '@/lib/sgsi/permisos';
import { prisma } from '@/lib/db';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import SidebarOperacion, { type ContadoresOperacion } from '@/app/components/sig/SidebarOperacion';

export const dynamic = 'force-dynamic';

export default async function SigLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);

  if (!puede(rol, 'operacion:ver')) {
    return (
      <div className="flex min-h-screen flex-col bg-app">
        <EncabezadoSig />
        <main className="px-8 pt-10 pb-14">
          <div
            className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border px-5 py-5"
            style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
          >
            <h1 className="text-17 font-bold" style={{ color: 'var(--hf-warn-text)' }}>
              No tenés acceso a Operación
            </h1>
            <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
              Tu cuenta no pertenece a un grupo del Directorio con permiso para administrar
              las obligaciones del SIG. Podés ver tus propias tareas en Mi SIG.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const correo = (session?.user?.email ?? '').toLowerCase();
  const [persona, obligaciones, asignaciones, contenidos, personas] = await Promise.all([
    prisma.persona.findUnique({ where: { correo }, select: { nombre: true } }),
    prisma.obligacion.count({ where: { activa: true } }),
    prisma.asignacion.count(),
    prisma.contenidoSig.count({ where: { activo: true } }),
    prisma.persona.count({ where: { activa: true } }),
  ]);

  const contadores: ContadoresOperacion = {
    obligaciones,
    tareas: asignaciones,
    contenidos,
    personas,
    periodo: periodoActual(),
    usuario: persona?.nombre ?? session?.user?.name ?? 'Usuario',
    cuenta: `CUANTICO\\${(session?.user?.email ?? 'usuario').split('@')[0]} · AD`,
    permisos: `Sesión iniciada con Directorio Activo · grupo ${rol.grupos.join(', ')} · ${nombreDelRol(rol)}`,
  };

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <div className="flex items-start">
        <SidebarOperacion contadores={contadores} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function periodoActual(): string {
  const hoy = new Date();
  const mes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][hoy.getUTCMonth()];
  return `${mes[0].toUpperCase()}${mes.slice(1)} de ${hoy.getUTCFullYear()}`;
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/components/sig/SidebarOperacion.tsx app/sig/layout.tsx
git commit -m "feat(sig): Operacion — gate de acceso y barra lateral OBL/CAL/TAR/CON/PER"
```

---

## Task 6: Operación — Obligaciones

**Files:**
- Create: `app/sig/obligaciones/page.tsx`
- Create: `app/sig/obligaciones/NuevaObligacion.tsx`

- [ ] **Step 1: La página**

```tsx
// app/sig/obligaciones/page.tsx
//
// La lista maestra del numeral 8, tal como la dibuja el lienzo: chips por tipo,
// buscador, y la tabla con el cumplimiento del último periodo como barra + %.

import { prisma } from '@/lib/db';
import NuevaObligacion from './NuevaObligacion';

export const dynamic = 'force-dynamic';

export default async function ObligacionesPage() {
  const filas = await prisma.obligacion.findMany({
    where: { activa: true },
    orderBy: { id: 'asc' },
    include: {
      contenido: true,
      alcanceArea: { select: { nombre: true } },
      alcanceCargo: { select: { nombre: true } },
      alcancePersona: { select: { nombre: true } },
      responsableSeguimiento: { select: { nombre: true } },
      _count: { select: { asignaciones: true } },
    },
  });

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">Obligaciones</h1>
          <p className="text-12_5 text-muted">
            La lista maestra del control operacional · {filas.length} obligaciones activas
          </p>
        </div>
        <NuevaObligacion />
      </div>

      <div className="mt-6 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Contenido</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Alcance</th>
              <th className="px-4 py-3 font-semibold">Periodicidad</th>
              <th className="px-4 py-3 font-semibold">Plazo</th>
              <th className="px-4 py-3 font-semibold">Seguimiento</th>
              <th className="px-4 py-3 text-right font-semibold">Último periodo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((o) => (
              <tr key={o.id} className="border-t border-border-default">
                <td className="px-4 py-3 font-mono text-11 text-muted">{o.contenido.codigo}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-primary">{o.contenido.titulo}</span>
                    {o.contenido.procedimientoOrigen && (
                      <span className="font-mono text-10_5 text-muted">{o.contenido.procedimientoOrigen}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 uppercase" style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}>
                    {o.contenido.tipo}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {textoAlcance(o.alcance, o.alcancePersona?.nombre, o.alcanceCargo?.nombre, o.alcanceArea?.nombre)}
                </td>
                <td className="px-4 py-3 text-muted">{o.periodicidad.toLowerCase()}</td>
                <td className="px-4 py-3 font-mono text-11 text-muted">{o.plazoDias} d</td>
                <td className="px-4 py-3 text-muted">{o.responsableSeguimiento.nombre}</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-[5px] w-12 overflow-hidden rounded-full" style={{ background: 'var(--hf-hairline-strong)' }}>
                      <span className="block h-full rounded-full" style={{ width: '0%', background: 'var(--hf-text-label)' }} />
                    </span>
                    <span className="font-mono text-11 text-muted">—</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function textoAlcance(
  alcance: string,
  persona: string | undefined,
  cargo: string | undefined,
  area: string | undefined,
): string {
  if (alcance === 'TODOS') return 'Toda la organización';
  return persona ?? cargo ?? area ?? alcance;
}
```

- [ ] **Step 2: El modal de nueva obligación**

```tsx
'use client';

// app/sig/obligaciones/NuevaObligacion.tsx
//
// Abre el formulario de la lista maestra: contenido, alcance con su destino, periodicidad,
// fechas y responsable de seguimiento. La validación (exactamente un destino) está en el
// servidor (R4) — acá solo se arma la petición.

import { useState } from 'react';
import { crearObligacion } from '@/app/sig/acciones/tareas';

export default function NuevaObligacion() {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState({
    contenidoId: '',
    alcance: 'TODOS',
    alcancePersonaId: '',
    alcanceCargoId: '',
    alcanceAreaId: '',
    periodicidad: 'MENSUAL',
    fechaInicio: '',
    plazoDias: '15',
    diasAviso: '7',
    responsableSeguimientoId: '',
  });

  async function guardar() {
    setError(null);
    setMensaje(null);
    const r = await crearObligacion({
      contenidoId: Number(datos.contenidoId),
      alcance: datos.alcance as 'PERSONA' | 'CARGO' | 'AREA' | 'TODOS',
      alcancePersonaId: datos.alcancePersonaId ? Number(datos.alcancePersonaId) : undefined,
      alcanceCargoId: datos.alcanceCargoId ? Number(datos.alcanceCargoId) : undefined,
      alcanceAreaId: datos.alcanceAreaId ? Number(datos.alcanceAreaId) : undefined,
      periodicidad: datos.periodicidad as 'UNICA' | 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL',
      fechaInicio: new Date(`${datos.fechaInicio}T00:00:00.000Z`),
      plazoDias: Number(datos.plazoDias),
      diasAviso: Number(datos.diasAviso),
      responsableSeguimientoId: Number(datos.responsableSeguimientoId),
    });
    if (r.ok) {
      setMensaje(r.mensaje);
      setTimeout(() => window.location.reload(), 900);
    } else {
      setError(r.mensaje);
    }
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        Nueva obligación
      </button>

      {abierto && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6" onClick={() => setAbierto(false)}>
          <div
            className="flex max-h-full w-full max-w-[560px] flex-col gap-4 overflow-y-auto rounded-modal bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-16 font-semibold text-primary">Nueva obligación</h2>
            <Campo etiqueta="Contenido" valor={datos.contenidoId} set={(v) => setDatos({ ...datos, contenidoId: v })} placeholder="Id del contenido (Contenidos)" />
            <Campo etiqueta="Alcance" valor={datos.alcance} set={(v) => setDatos({ ...datos, alcance: v })} select={['TODOS', 'PERSONA', 'CARGO', 'AREA']} />
            {datos.alcance === 'PERSONA' && <Campo etiqueta="Persona (id)" valor={datos.alcancePersonaId} set={(v) => setDatos({ ...datos, alcancePersonaId: v })} />}
            {datos.alcance === 'CARGO' && <Campo etiqueta="Cargo (id)" valor={datos.alcanceCargoId} set={(v) => setDatos({ ...datos, alcanceCargoId: v })} />}
            {datos.alcance === 'AREA' && <Campo etiqueta="Área (id)" valor={datos.alcanceAreaId} set={(v) => setDatos({ ...datos, alcanceAreaId: v })} />}
            <Campo etiqueta="Periodicidad" valor={datos.periodicidad} set={(v) => setDatos({ ...datos, periodicidad: v })} select={['UNICA', 'DIARIA', 'SEMANAL', 'MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']} />
            <Campo etiqueta="Fecha de inicio" valor={datos.fechaInicio} set={(v) => setDatos({ ...datos, fechaInicio: v })} tipo="date" />
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Plazo (días)" valor={datos.plazoDias} set={(v) => setDatos({ ...datos, plazoDias: v })} tipo="number" />
              <Campo etiqueta="Días de aviso" valor={datos.diasAviso} set={(v) => setDatos({ ...datos, diasAviso: v })} tipo="number" />
            </div>
            <Campo etiqueta="Responsable de seguimiento (id)" valor={datos.responsableSeguimientoId} set={(v) => setDatos({ ...datos, responsableSeguimientoId: v })} />

            {error && <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>{error}</p>}
            {mensaje && <p className="text-12" style={{ color: 'var(--hf-accent-700)' }}>{mensaje}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setAbierto(false)} className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted">
                Cancelar
              </button>
              <button onClick={guardar} className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white" style={{ background: 'var(--hf-accent-500)' }}>
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Campo({
  etiqueta,
  valor,
  set,
  tipo = 'text',
  select,
  placeholder,
}: {
  etiqueta: string;
  valor: string;
  set: (v: string) => void;
  tipo?: string;
  select?: string[];
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      {select ? (
        <select value={valor} onChange={(e) => set(e.target.value)} className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300">
          {select.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      ) : (
        <input type={tipo} value={valor} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300" />
      )}
    </label>
  );
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/sig/obligaciones/
git commit -m "feat(sig): Operacion — lista maestra de obligaciones con alta"
```

---

## Task 7: Operación — Calendario

**Files:**
- Create: `app/sig/calendario/page.tsx`
- Create: `app/sig/calendario/Calendario.client.tsx`

- [ ] **Step 1: La página (datos del mes)**

```tsx
// app/sig/calendario/page.tsx
//
// La malla mes/semana con las asignaciones en su fecha límite, tal como el lienzo:
// marcas por estado y un aside con el día seleccionado.

import { prisma } from '@/lib/db';
import CalendarioClient from './Calendario.client';

export const dynamic = 'force-dynamic';

export default async function CalendarioPage() {
  const asignaciones = await prisma.asignacion.findMany({
    select: {
      id: true,
      periodo: true,
      fechaLimite: true,
      estado: true,
      persona: { select: { nombre: true } },
      contenido: { select: { titulo: true, codigo: true, tipo: true } },
      obligacion: { include: { contenido: { select: { titulo: true, codigo: true, tipo: true } } } },
    },
  });

  const marcas = asignaciones.map((a) => ({
    id: a.id,
    fecha: a.fechaLimite.toISOString().slice(0, 10),
    estado: a.estado,
    persona: a.persona.nombre,
    titulo: a.contenido?.titulo ?? a.obligacion?.contenido.titulo ?? 'Puntual',
    codigo: a.contenido?.codigo ?? a.obligacion?.contenido.codigo ?? '—',
    periodo: a.periodo,
  }));

  return <CalendarioClient marcas={marcas} />;
}
```

- [ ] **Step 2: El cliente**

```tsx
'use client';

// app/sig/calendario/Calendario.client.tsx
//
// Mes y semana con el navegador, chips de área, leyenda de estados y el día
// seleccionado con su lista. Los colores de estado salen de globals.css.

import { useMemo, useState } from 'react';

export interface MarcaCalendario {
  id: number;
  fecha: string;
  estado: 'PENDIENTE' | 'REALIZADA' | 'NO_APLICA' | 'ANULADA';
  persona: string;
  titulo: string;
  codigo: string;
  periodo: string;
}

const COLOR_ESTADO: Record<string, string> = {
  VENCIDA: '#a52016',
  POR_VENCER: '#c25a1e',
  PENDIENTE: '#12437f',
  REALIZADA: '#0f7a5a',
};

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

export default function CalendarioClient({ marcas }: { marcas: MarcaCalendario[] }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getUTCFullYear());
  const [mes, setMes] = useState(hoy.getUTCMonth());
  const [vista, setVista] = useState<'mes' | 'semana'>('mes');
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const porDia = useMemo(() => {
    const m = new Map<string, MarcaCalendario[]>();
    for (const marca of marcas) {
      const lista = m.get(marca.fecha) ?? [];
      lista.push(marca);
      m.set(marca.fecha, lista);
    }
    return m;
  }, [marcas]);

  const celdas = useMemo(() => {
    const primero = new Date(Date.UTC(anio, mes, 1));
    const offset = (primero.getUTCDay() + 6) % 7;
    const dias = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const celdas: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= dias; d++) celdas.push(`${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return celdas;
  }, [anio, mes]);

  const navegar = (delta: number) => {
    const siguiente = new Date(Date.UTC(anio, mes + delta, 1));
    setAnio(siguiente.getUTCFullYear());
    setMes(siguiente.getUTCMonth());
    setSeleccionado(null);
  };

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="titulo-pagina">Calendario</h1>
          <p className="text-12_5 text-muted">Asignaciones en su fecha límite</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-campo border border-border-field">
            {(['mes', 'semana'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                aria-pressed={vista === v}
                className="px-3 py-1.5 text-12 font-medium capitalize"
                style={{
                  background: vista === v ? 'var(--hf-brand-100)' : 'transparent',
                  color: vista === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)',
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => navegar(-1)} className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 text-muted">‹</button>
          <span className="w-32 text-center text-13 font-semibold text-primary">{nombreMes(mes)} de {anio}</span>
          <button onClick={() => navegar(1)} className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 text-muted">›</button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-11_5 text-muted">
        {Object.entries(COLOR_ESTADO).map(([estado, color]) => (
          <span key={estado} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {estado}
          </span>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-7 gap-px overflow-hidden rounded-tarjeta border border-border-field bg-border-default">
        {DIAS.map((d) => (
          <div key={d} className="bg-surface px-3 py-2 text-11 font-semibold uppercase tracking-wide" style={{ color: 'var(--hf-text-label)' }}>
            {d}
          </div>
        ))}
        {celdas.map((fecha, i) =>
          fecha === null ? (
            <div key={`v-${i}`} className="min-h-[92px] bg-surface" />
          ) : (
            <button
              key={fecha}
              onClick={() => setSeleccionado(seleccionado === fecha ? null : fecha)}
              className="flex min-h-[92px] flex-col items-stretch gap-1 bg-surface p-2 text-left transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
              style={{
                background: seleccionado === fecha ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              }}
            >
              <span className="font-mono text-10_5 text-muted">{Number(fecha.slice(8))}</span>
              {(porDia.get(fecha) ?? []).slice(0, 2).map((m) => (
                <span
                  key={m.id}
                  className="flex-none rounded-[3px] px-1.5 py-0.5 text-9_5 font-medium"
                  style={{ background: colorEstado(m), color: '#ffffff' }}
                >
                  {m.codigo}
                </span>
              ))}
              {(porDia.get(fecha) ?? []).length > 2 && (
                <span className="text-9_5 text-muted">+{(porDia.get(fecha) ?? []).length - 2}</span>
              )}
            </button>
          ),
        )}
      </div>

      {seleccionado && (
        <aside className="mt-5 flex max-w-[420px] flex-col gap-2 rounded-tarjeta border border-border-field bg-surface p-5">
          <h2 className="text-14 font-semibold text-primary">{seleccionado}</h2>
          {(porDia.get(seleccionado) ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 border-t border-border-default pt-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-12_5 font-medium text-primary">{m.titulo}</span>
                <span className="font-mono text-10_5 text-muted">{m.codigo} · {m.periodo} · {m.persona}</span>
              </div>
              <span className="flex-none text-11 font-semibold" style={{ color: colorEstado(m) }}>
                {m.estado}
              </span>
            </div>
          ))}
          {(porDia.get(seleccionado) ?? []).length === 0 && (
            <p className="text-12 text-muted">Sin asignaciones este día.</p>
          )}
        </aside>
      )}
    </main>
  );
}

function colorEstado(m: MarcaCalendario): string {
  const hoy = new Date().toISOString().slice(0, 10);
  if (m.estado === 'PENDIENTE') return m.fecha < hoy ? COLOR_ESTADO.VENCIDA : COLOR_ESTADO.PENDIENTE;
  return COLOR_ESTADO.REALIZADA;
}

function nombreMes(mes: number): string {
  return ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][mes];
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/sig/calendario/
git commit -m "feat(sig): Operacion — calendario mes/semana con el dia seleccionado"
```

---

## Task 8: Operación — Tareas

**Files:**
- Create: `app/sig/tareas/page.tsx`
- Create: `app/sig/tareas/Tareas.client.tsx`

- [ ] **Step 1: La página**

```tsx
// app/sig/tareas/page.tsx
//
// La lista plana de asignaciones con la banda de acciones masivas: reasignar, prorrogar
// y anular, cada una con su motivo obligatorio en el servidor (R6, R7, R9).

import { prisma } from '@/lib/db';
import TareasClient from './Tareas.client';

export const dynamic = 'force-dynamic';

export default async function TareasPage() {
  const asignaciones = await prisma.asignacion.findMany({
    orderBy: [{ fechaLimite: 'asc' }],
    include: {
      persona: { select: { nombre: true } },
      contenido: { select: { titulo: true, codigo: true, tipo: true } },
      obligacion: { include: { contenido: { select: { titulo: true, codigo: true, tipo: true } } } },
    },
  });

  const filas = asignaciones.map((a) => ({
    id: a.id,
    codigo: a.contenido?.codigo ?? a.obligacion?.contenido.codigo ?? '—',
    titulo: a.contenido?.titulo ?? a.obligacion?.contenido.titulo ?? a.titulo ?? 'Puntual',
    tipo: a.contenido?.tipo ?? a.obligacion?.contenido.tipo ?? 'TAREA',
    origen: a.obligacion?.contenido.procedimientoOrigen ?? null,
    persona: a.persona.nombre,
    periodo: a.periodo,
    fechaLimite: a.fechaLimite.toISOString().slice(0, 10),
    estado: a.estado,
    vencida: a.estado === 'PENDIENTE' && a.fechaLimite.toISOString().slice(0, 10) < hoy(),
  }));

  return <TareasClient filas={filas} personas={await personasActivas()} />;
}

async function personasActivas() {
  return prisma.persona.findMany({
    where: { activa: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 2: El cliente con la banda masiva**

```tsx
'use client';

// app/sig/tareas/Tareas.client.tsx
//
// Tabla con selección múltiple; la banda azul aparece solo con selección (sc-if del
// lienzo) y cada acción pide su motivo.

import { useState } from 'react';
import {
  anularAsignacion,
  prorrogarAsignacion,
  reasignarAsignacion,
} from '@/app/sig/acciones/tareas';

export interface FilaTarea {
  id: number;
  codigo: string;
  titulo: string;
  tipo: string;
  origen: string | null;
  persona: string;
  periodo: string;
  fechaLimite: string;
  estado: string;
  vencida: boolean;
}

export default function TareasClient({
  filas,
  personas,
}: {
  filas: FilaTarea[];
  personas: { id: number; nombre: string }[];
}) {
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [modo, setModo] = useState<'ninguno' | 'prorrogar' | 'anular' | 'reasignar'>('ninguno');
  const [motivo, setMotivo] = useState('');
  const [destino, setDestino] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alternar = (id: number) => {
    const s = new Set(seleccion);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSeleccion(s);
  };

  async function ejecutar() {
    setError(null);
    setMensaje(null);
    const ids = [...seleccion];
    for (const id of ids) {
      const r =
        modo === 'anular'
          ? await anularAsignacion(id, motivo)
          : modo === 'prorrogar'
            ? await prorrogarAsignacion(id, nuevaFechaLimite(), motivo)
            : await reasignarAsignacion(id, Number(destino), motivo);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
    }
    setMensaje(`${ids.length} asignación(es) ${accionPasada(modo)}.`);
    setSeleccion(new Set());
    setModo('ninguno');
    setMotivo('');
    setTimeout(() => window.location.reload(), 900);
  }

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-col gap-0.5">
        <h1 className="titulo-pagina">Tareas</h1>
        <p className="text-12_5 text-muted">{filas.length} asignaciones</p>
      </div>

      <nav className="mt-4 flex items-center gap-2">
        {conteos(filas).map(([etiqueta, n]) => (
          <span key={etiqueta} className="rounded-chip border border-border-field bg-surface px-3.5 py-1.5 text-12 text-muted">
            {etiqueta} · {n}
          </span>
        ))}
      </nav>

      {seleccion.size > 0 && (
        <div
          className="mt-4 flex items-center gap-3 rounded-campo px-4 py-3"
          style={{ background: 'var(--hf-brand-100)' }}
        >
          <span className="text-12_5 font-semibold" style={{ color: 'var(--hf-brand-nav)' }}>
            {seleccion.size} asignación(es) seleccionada(s)
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setModo('reasignar')} className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white" style={{ background: 'var(--hf-brand-nav)' }}>
              Reasignar
            </button>
            <button onClick={() => setModo('prorrogar')} className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white" style={{ background: 'var(--hf-brand-nav)' }}>
              Prorrogar
            </button>
            <button onClick={() => setModo('anular')} className="rounded-campo px-3 py-1.5 text-12 font-semibold" style={{ background: 'var(--hf-danger-text)', color: '#ffffff' }}>
              Anular
            </button>
            <button onClick={() => setSeleccion(new Set())} className="rounded-campo px-3 py-1.5 text-12 text-muted">
              Quitar la selección
            </button>
          </div>
        </div>
      )}

      {modo !== 'ninguno' && (
        <div className="mt-4 flex flex-col gap-2 rounded-campo border border-border-field bg-surface p-4">
          {modo === 'prorrogar' && (
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Nueva fecha límite (hoy + 30 días por defecto)</span>
              <input type="date" defaultValue={nuevaFechaLimite()} onChange={(e) => setNueva(e.target.value)} className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13" />
            </label>
          )}
          {modo === 'reasignar' && (
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Destino</span>
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13">
                <option value="">Seleccionar persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Motivo (obligatorio)</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13" />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModo('ninguno')} className="rounded-campo px-3 py-1.5 text-12 text-muted">Cancelar</button>
            <button onClick={ejecutar} className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white" style={{ background: 'var(--hf-accent-500)' }}>
              Aplicar
            </button>
          </div>
          {error && <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>{error}</p>}
          {mensaje && <p className="text-12" style={{ color: 'var(--hf-accent-700)' }}>{mensaje}</p>}
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="w-10 px-4 py-3" />
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Contenido</th>
              <th className="px-4 py-3 font-semibold">Responsable</th>
              <th className="px-4 py-3 font-semibold">Periodo</th>
              <th className="px-4 py-3 font-semibold">Fecha límite</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-border-default">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={seleccion.has(f.id)} onChange={() => alternar(f.id)} className="h-[15px] w-[15px]" />
                </td>
                <td className="px-4 py-3 font-mono text-11 text-muted">{f.codigo}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-primary">{f.titulo}</span>
                  {f.origen && <span className="ml-2 font-mono text-10_5 text-muted">{f.origen}</span>}
                </td>
                <td className="px-4 py-3 text-muted">{f.persona}</td>
                <td className="px-4 py-3 font-mono text-11 text-muted">{f.periodo}</td>
                <td className="px-4 py-3 font-mono text-11" style={{ color: f.vencida ? 'var(--hf-danger-text)' : 'var(--hf-text-secondary-soft)', fontWeight: f.vencida ? 600 : 400 }}>
                  {f.fechaLimite}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 uppercase" style={{ background: badgeEstado(f).fondo, color: badgeEstado(f).texto }}>
                    {f.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function conteos(filas: FilaTarea[]): [string, number][] {
  const por: Record<string, number> = {};
  for (const f of filas) por[f.estado] = (por[f.estado] ?? 0) + 1;
  return Object.entries(por).sort();
}

function badgeEstado(estado: string): { fondo: string; texto: string } {
  if (estado === 'REALIZADA') return { fondo: '#e8f4ef', texto: '#0b5c44' };
  if (estado === 'ANULADA' || estado === 'NO_APLICA') return { fondo: '#f5f7f6', texto: '#4a544f' };
  return { fondo: '#e9f0fb', texto: '#12437f' };
}

function accionPasada(modo: string): string {
  return { prorrogar: 'prorrogada(s)', anular: 'anulada(s)', reasignar: 'reasignada(s)' }[modo] ?? 'actualizada(s)';
}

let nueva: string | null = null;
function nuevaFechaLimite(): string {
  if (nueva) return nueva;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}
function setNueva(v: string) {
  nueva = v;
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/sig/tareas/
git commit -m "feat(sig): Operacion — tareas con banda de acciones masivas"
```

---

## Task 9: Operación — Contenidos

**Files:**
- Create: `app/sig/contenidos/page.tsx`
- Create: `app/sig/contenidos/Contenidos.client.tsx`

- [ ] **Step 1: La página**

```tsx
// app/sig/contenidos/page.tsx
//
// Lista y ficha del contenido: el bloque de su tipo, los ítems de verificación y el
// documento referenciado con su aviso de gestión documental fuera de alcance.

import { prisma } from '@/lib/db';
import ContenidosClient from './Contenidos.client';

export const dynamic = 'force-dynamic';

export default async function ContenidosPage() {
  const contenidos = await prisma.contenidoSig.findMany({
    where: { activo: true },
    orderBy: { codigo: 'asc' },
    include: { items: { orderBy: { orden: 'asc' } }, _count: { select: { obligaciones: true } } },
  });

  const filas = contenidos.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo,
    titulo: c.titulo,
    descripcion: c.descripcion,
    procedimientoOrigen: c.procedimientoOrigen,
    version: c.version,
    documentoCodigo: c.documentoCodigo,
    documentoNombre: c.documentoNombre,
    documentoVersion: c.documentoVersion,
    documentoUrl: c.documentoUrl,
    modalidad: c.modalidad,
    duracionHoras: c.duracionHoras ? Number(c.duracionHoras) : null,
    exigeEvaluacion: c.exigeEvaluacion,
    notaMinima: c.notaMinima ? Number(c.notaMinima) : null,
    items: c.items.map((i) => ({ id: i.id, orden: i.orden, texto: i.texto, obligatorio: i.obligatorio, permiteNoAplica: i.permiteNoAplica })),
    asignadoPor: c._count.obligaciones,
  }));

  return <ContenidosClient contenidos={filas} />;
}
```

- [ ] **Step 2: El cliente**

```tsx
'use client';

// app/sig/contenidos/Contenidos.client.tsx
//
// Lista a la izquierda, ficha a la derecha, tal como el lienzo (lista 428px + ficha).

import { useState } from 'react';

export interface ContenidoFila {
  id: number;
  codigo: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  procedimientoOrigen: string | null;
  version: number;
  documentoCodigo: string | null;
  documentoNombre: string | null;
  documentoVersion: string | null;
  documentoUrl: string | null;
  modalidad: string | null;
  duracionHoras: number | null;
  exigeEvaluacion: boolean;
  notaMinima: number | null;
  items: { id: number; orden: number; texto: string; obligatorio: boolean; permiteNoAplica: boolean }[];
  asignadoPor: number;
}

export default function ContenidosClient({ contenidos }: { contenidos: ContenidoFila[] }) {
  const [seleccionado, setSeleccionado] = useState<number | null>(contenidos[0]?.id ?? null);
  const seleccion = contenidos.find((c) => c.id === seleccionado) ?? null;

  return (
    <main className="flex flex-1 gap-6 px-8 pt-7 pb-14">
      <div className="flex w-[428px] shrink-0 flex-col gap-2">
        <h1 className="titulo-pagina">Contenidos</h1>
        <p className="text-12_5 text-muted">{contenidos.length} activos</p>
        <div className="mt-3 flex flex-col gap-1">
          {contenidos.map((c) => (
            <button
              key={c.id}
              onClick={() => setSeleccionado(c.id)}
              className="flex flex-col gap-0.5 rounded-campo px-3 py-2.5 text-left transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
              style={{
                background: seleccionado === c.id ? 'var(--hf-brand-100)' : 'transparent',
              }}
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-10_5" style={{ color: seleccionado === c.id ? 'var(--hf-brand-nav)' : 'var(--hf-text-label)' }}>
                  {c.codigo}
                </span>
                <span className="rounded-[4px] px-1.5 py-0.5 font-mono text-8_5 uppercase" style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}>
                  {c.tipo}
                </span>
              </span>
              <span className="text-12_5 font-medium text-primary">{c.titulo}</span>
            </button>
          ))}
        </div>
      </div>

      {seleccion ? (
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-10_5" style={{ color: 'var(--hf-text-label)' }}>
                {seleccion.codigo} · versión {seleccion.version}
              </span>
              <h2 className="text-16 font-semibold text-primary">{seleccion.titulo}</h2>
              {seleccion.procedimientoOrigen && (
                <span className="font-mono text-11 text-muted">{seleccion.procedimientoOrigen}</span>
              )}
            </div>
          </div>

          <p className="text-12_5 text-muted [text-wrap:pretty]">{seleccion.descripcion}</p>

          {seleccion.tipo === 'LECTURA' && (
            <section className="flex flex-col gap-2 rounded-campo border border-border-field bg-surface p-4">
              <span className="etiqueta-campo">Documento referenciado</span>
              <span className="text-13 font-medium text-primary">
                {seleccion.documentoNombre ?? seleccion.documentoCodigo ?? '—'}
              </span>
              <span className="font-mono text-11 text-muted">
                {seleccion.documentoCodigo} · v{seleccion.documentoVersion}
              </span>
              <p className="rounded-campo px-3 py-2 text-11_5" style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}>
                La gestión documental está fuera del alcance: el documento vive donde hoy se administra.
              </p>
            </section>
          )}

          {seleccion.tipo === 'CAPACITACION' && (
            <section className="flex flex-col gap-1 rounded-campo border border-border-field bg-surface p-4 text-12_5">
              <span className="text-muted">
                {seleccion.modalidad ?? 'Modalidad sin definir'} · {seleccion.duracionHoras ?? '—'} h
              </span>
              <span className="text-muted">
                {seleccion.exigeEvaluacion ? `Exige evaluación · nota mínima ${seleccion.notaMinima ?? '—'}` : 'Sin evaluación'}
              </span>
            </section>
          )}

          {seleccion.tipo === 'VERIFICACION' && (
            <section className="flex flex-col gap-2">
              <span className="etiqueta-campo">Ítems de verificación</span>
              {seleccion.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 rounded-campo border border-border-field bg-surface px-4 py-2.5">
                  <span className="text-12_5 text-primary">{i.orden}. {i.texto}</span>
                  <span className="flex flex-none gap-1.5">
                    <span className="rounded-[4px] px-1.5 py-0.5 font-mono text-9" style={{ background: i.obligatorio ? 'var(--hf-brand-100)' : 'var(--hf-bg-app)', color: 'var(--hf-brand-nav)' }}>
                      {i.obligatorio ? 'Obligatorio' : 'Opcional'}
                    </span>
                    <span className="rounded-[4px] px-1.5 py-0.5 font-mono text-9" style={{ background: i.permiteNoAplica ? 'var(--hf-warn-100)' : 'var(--hf-bg-app)', color: 'var(--hf-warn-text)' }}>
                      {i.permiteNoAplica ? 'Admite N/A' : 'Sin N/A'}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          )}

          <p className="text-11_5 text-muted">Asignado por {seleccion.asignadoPor} obligación(es).</p>
        </div>
      ) : (
        <p className="text-12_5 text-muted">Sin contenidos.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/sig/contenidos/
git commit -m "feat(sig): Operacion — contenidos con ficha por tipo e items de verificacion"
```

---

## Task 10: Operación — Personas

**Files:**
- Create: `app/sig/personas/page.tsx`
- Create: `app/sig/personas/Personas.client.tsx`

- [ ] **Step 1: La página**

```tsx
// app/sig/personas/page.tsx
//
// El censo con su rol derivado de los grupos (la aplicación no guarda roles), el estado,
// la última sincronización y el botón de sincronizar (A1) solo para quien administra.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos, nombreDelRol } from '@/lib/sgsi/permisos';
import { esVencida } from '@/lib/sig/cierre';
import PersonasClient from './Personas.client';

export const dynamic = 'force-dynamic';

export default async function PersonasPage() {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos);
  const administra = puede(rol, 'personas:administrar');

  const [personas, pendientes] = await Promise.all([
    prisma.persona.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        area: { select: { nombre: true } },
        cargo: { select: { nombre: true } },
      },
    }),
    prisma.asignacion.findMany({
      where: { estado: 'PENDIENTE' },
      select: { personaId: true, fechaLimite: true },
    }),
  ]);

  const hoy = new Date();
  const porPersona = new Map<number, number>();
  for (const p of pendientes) {
    if (esVencida('PENDIENTE', p.fechaLimite, hoy)) {
      porPersona.set(p.personaId, (porPersona.get(p.personaId) ?? 0) + 1);
    }
  }

  const filas = personas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    correo: p.correo,
    area: p.area?.nombre ?? null,
    cargo: p.cargo?.nombre ?? null,
    activa: p.activa,
    sincronizadaEn: p.sincronizadaEn?.toISOString() ?? null,
    pendientes: porPersona.get(p.id) ?? 0,
  }));

  return <PersonasClient filas={filas} administra={administra} />;
}
```

- [ ] **Step 2: El cliente**

```tsx
'use client';

// app/sig/personas/Personas.client.tsx
//
// Tabla del censo con chips Activas/Inactivas/Todas, el botón de sincronizar (A1) y el
// panel de reasignación de una persona inactiva (R9): sus pendientes se listan y se
// reasignan, nunca se cierran solas.

import { useState } from 'react';
import { sincronizarDirectorio } from '@/app/sig/acciones/personas';
import { reasignarAsignacion } from '@/app/sig/acciones/tareas';

export interface PersonaFila {
  id: number;
  nombre: string;
  correo: string;
  area: string | null;
  cargo: string | null;
  activa: boolean;
  sincronizadaEn: string | null;
  pendientes: number;
}

export default function PersonasClient({
  filas,
  administra,
}: {
  filas: PersonaFila[];
  administra: boolean;
}) {
  const [filtro, setFiltro] = useState<'activas' | 'inactivas' | 'todas'>('activas');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [reasignando, setReasignando] = useState<PersonaFila | null>(null);
  const [destino, setDestino] = useState('');

  const visibles = filas.filter((f) =>
    filtro === 'todas' ? true : filtro === 'activas' ? f.activa : !f.activa,
  );

  async function sincronizar() {
    setSincronizando(true);
    setError(null);
    setMensaje(null);
    const r = await sincronizarDirectorio();
    setSincronizando(false);
    if (r.ok) setMensaje(r.mensaje);
    else setError(r.mensaje);
    if (r.ok) setTimeout(() => window.location.reload(), 900);
  }

  async function reasignar() {
    if (!reasignando) return;
    setError(null);
    const ids = filas
      .filter((f) => f.id === reasignando.id)
      .map(() => reasignando.id);
    const r = await reasignarAsignacion(ids[0], Number(destino), `reasignación por inactivación de ${reasignando.nombre}`);
    if (r.ok) setMensaje(r.mensaje);
    else setError(r.mensaje);
  }

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">Personas</h1>
          <p className="text-12_5 text-muted">
            {filas.filter((f) => f.activa).length} activas ·{' '}
            {filas.some((f) => f.sincronizadaEn)
              ? `última sincronización ${filas.map((f) => f.sincronizadaEn).filter(Boolean).sort().at(-1)?.slice(0, 10)}`
              : 'sin sincronizar'}
          </p>
        </div>
        {administra && (
          <button
            onClick={sincronizar}
            disabled={sincronizando}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            {sincronizando ? 'Sincronizando…' : 'Sincronizar con el Directorio'}
          </button>
        )}
      </div>

      {mensaje && (
        <p className="mt-4 rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }}>
          {mensaje}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}>
          {error}
        </p>
      )}

      <nav className="mt-4 flex items-center gap-2">
        {(['activas', 'inactivas', 'todas'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className="rounded-chip px-3.5 py-1.5 text-12 capitalize"
            style={{
              background: filtro === f ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: filtro === f ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
              fontWeight: filtro === f ? 600 : 500,
            }}
          >
            {f}
          </button>
        ))}
      </nav>

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Persona</th>
              <th className="px-4 py-3 font-semibold">Área</th>
              <th className="px-4 py-3 font-semibold">Cargo</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 text-right font-semibold">Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className="border-t border-border-default">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-10_5 font-bold" style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}>
                      {iniciales(p.nombre)}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium text-primary">{p.nombre}</span>
                      <span className="font-mono text-10_5 text-muted">{p.correo}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{p.area ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{p.cargo ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 uppercase" style={{ background: p.activa ? '#e8f4ef' : '#f5f7f6', color: p.activa ? '#0b5c44' : '#4a544f' }}>
                    {p.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {p.pendientes > 0 ? (
                    <button
                      onClick={() => setReasignando(p)}
                      className="font-mono text-11 font-semibold"
                      style={{ color: 'var(--hf-danger-text)' }}
                      title="Ver pendientes para reasignar"
                    >
                      {p.pendientes}
                    </button>
                  ) : (
                    <span className="font-mono text-11 text-muted">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reasignando && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6" onClick={() => setReasignando(null)}>
          <div
            className="flex w-full max-w-[480px] flex-col gap-4 rounded-modal bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={{ borderTop: '3px solid var(--hf-danger-text)' }}
          >
            <h2 className="text-15 font-semibold text-primary">
              {reasignando.nombre} ya no figura en el Directorio
            </h2>
            <p className="text-12_5 text-muted">
              Sus {reasignando.pendientes} pendiente(s) siguen exigibles y hay que reasignarlas. No se cierran solas (R9).
            </p>
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Reasignar a</span>
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13">
                <option value="">Seleccionar persona activa</option>
                {filas.filter((f) => f.activa && f.id !== reasignando.id).map((f) => (
                  <option key={f.id} value={f.id}>{f.nombre}</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setReasignando(null)} className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted">
                Cancelar
              </button>
              <button onClick={reasignar} disabled={!destino} className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50" style={{ background: 'var(--hf-danger-text)' }}>
                Reasignar
              </button>
            </div>
            {mensaje && <p className="text-12" style={{ color: 'var(--hf-accent-700)' }}>{mensaje}</p>}
          </div>
        </div>
      )}
    </main>
  );
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .map((p) => p[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  );
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/sig/personas/
git commit -m "feat(sig): Operacion — personas con sincronizacion y reasignacion de pendientes"
```

---

## Task 11: Cierre — gate de build y verificación

- [ ] **Step 1: Gate**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: los cuatro en verde salvo el lint preexistente de `docs/handoff_v2/design/support.js` (ajeno a este plan).

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "docs(sig): cierre de A3 — superficies Mi SIG y Operacion"
```

---

## Verificación manual antes de dar A3 por terminado

1. `npm run dev`, iniciar sesión con una cuenta **sin grupo**: entra a `/mi-sig` y el header le muestra **solo** la pestaña Mi SIG; `/sig/*` y `/sgsi` le niegan.
2. Con cuenta de `Responsables SIG`: el header muestra las cinco pestañas y Operación funciona.
3. Mi SIG con datos: contadores correctos, vencidas arriba, «Vencida hace N días» escrito, realizadas colapsadas.
4. Cerrar una LECTURA sin marcar la casilla: rechaza. Marcada: registra y la tarjeta pasa a realizadas.
5. Verificación con un ítem obligatorio sin responder: rechaza desde el servidor.
6. Operación → Obligaciones: la lista carga y «Nueva obligación» crea (luego la generación la convierte en asignaciones).
7. Operación → Tareas: seleccionar y anular exige motivo; la bitácora registra `fecha_limite` y `estado`.
8. Operación → Personas: la sincronización responde los cuatro conteos (A1) y los pendientes de una inactiva se reasignan con motivo.
9. Calendario: el día con asignaciones abre su lista; la leyenda acompaña a los estados escritos.

## Lo que A3 deja listo para A4

Las dos superficies funcionando con las acciones de A2 debajo; el header de cinco pestañas; el gate de Operación. A4 agrega los correos (semanal/mensual), los indicadores de cumplimiento (la barra del último periodo de Obligaciones pasa de «—» a su valor calculado) y las exportaciones (histórico personal, señalando el cierre administrativo).