# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Indicadores dashboard fully usable on mobile phones using Tailwind responsive prefixes and a hamburger nav menu, with no new dependencies.

**Architecture:** Tailwind-first incremental changes — add `sm:`/`md:` prefixes to existing classes, convert `Nav.tsx` to a client component with hamburger state, wrap the indicators table in an `overflow-x-auto` container.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS 3.4, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `app/components/Nav.tsx` | Convert to client component, add hamburger + mobile dropdown |
| `app/components/DashboardShell.tsx` | Responsive grid + mobile padding |
| `app/components/ProcessGrid.tsx` | Responsive card grid |
| `app/components/IndicatorsTable.tsx` | Horizontal scroll wrapper + responsive filter bar |

---

## Task 1: Nav — Hamburger Menu

**Files:**
- Modify: `app/components/Nav.tsx`

### Context
`Nav.tsx` is currently a server component with no state. It renders a fixed-height horizontal bar with logo (left) and controls (right): matrix link, year selector, UserMenu. On mobile screens it overflows. We need to:
1. Make it a client component so we can use `useState`
2. Hide the desktop controls on mobile
3. Show a hamburger button on mobile that toggles a dropdown

### Steps

- [ ] **Step 1: Convert Nav to client component and add hamburger state**

Replace the full contents of `app/components/Nav.tsx` with:

```tsx
'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import UserMenu from './UserMenu';

export default function Nav({
  year,
  initials,
  fetchedAt,
  matrixUrl,
}: {
  year: string;
  initials: string;
  fetchedAt: string;
  matrixUrl: string;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const updated = new Date(fetchedAt).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <nav className="bg-gradient-to-r from-slate-900 via-[#1B3A8A] to-[#0c2461] px-4 md:px-8 h-[60px] flex items-center justify-between sticky top-0 z-[100] shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo.jpeg"
            alt="Cuantico"
            width={44}
            height={44}
            className="object-contain"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-white text-sm font-black tracking-[1px] uppercase">
              Cuantico
            </span>
            <span className="text-sky-300 text-[10px] font-semibold tracking-[2px] uppercase">
              SGC
            </span>
          </div>
        </div>

        {/* Desktop controls — hidden on mobile */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href={matrixUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-sky-400 hover:bg-sky-300 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-[0_0_12px_rgba(56,189,248,0.4)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 opacity-80">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
            </svg>
            Matriz de Indicadores
          </a>
          <div className="flex gap-1">
            {(['2026', '2025'] as const).map(y => (
              <Link
                key={y}
                href={`/?year=${y}`}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  year === y
                    ? 'bg-white text-[#1B3A8A] border-white'
                    : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
          <UserMenu initials={initials} />
        </div>

        {/* Hamburger button — visible on mobile only */}
        <button
          className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-[5px] rounded-lg hover:bg-white/10 transition-colors"
          onClick={() => setIsMenuOpen(prev => !prev)}
          aria-label="Menú"
        >
          <span className={`block w-5 h-[2px] bg-white transition-transform origin-center ${isMenuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
          <span className={`block w-5 h-[2px] bg-white transition-opacity ${isMenuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-[2px] bg-white transition-transform origin-center ${isMenuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
        </button>
      </nav>

      {/* Click-outside backdrop */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-[98] md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Mobile dropdown menu */}
      <div
        className={`${isMenuOpen ? 'flex' : 'hidden'} md:hidden flex-col bg-gradient-to-b from-slate-900 to-[#0c2461] border-t border-white/10 px-4 py-4 gap-4 sticky top-[60px] z-[99] shadow-[0_4px_12px_rgba(0,0,0,0.3)]`}
      >
        <a
          href={matrixUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setIsMenuOpen(false)}
          className="flex items-center gap-2 bg-sky-400 hover:bg-sky-300 text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-[0_0_12px_rgba(56,189,248,0.4)] transition-colors w-fit"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 opacity-80">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
          </svg>
          Matriz de Indicadores
        </a>

        <div className="flex gap-2">
          <span className="text-white/50 text-sm self-center">Año:</span>
          {(['2026', '2025'] as const).map(y => (
            <Link
              key={y}
              href={`/?year=${y}`}
              onClick={() => setIsMenuOpen(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                year === y
                  ? 'bg-white text-[#1B3A8A] border-white'
                  : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>

        <div className="border-t border-white/10 pt-3">
          <UserMenu initials={initials} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build 2>&1 | tail -20`

Expected: No TypeScript errors. The `updated` variable was unused and is now removed — if the build warns about it, that's fine (it was already unused in the original).

- [ ] **Step 3: Start dev server and test Nav on mobile viewport**

Run: `npm run dev`

Open browser at `http://localhost:3000`. In DevTools, toggle device toolbar (Cmd+Shift+M / F12 → device icon) and select iPhone 12 (390px width). Verify:
- Hamburger icon (3 lines) visible in top-right
- Logo visible on the left
- Desktop controls (matrix button, year pills, user) are hidden
- Clicking hamburger opens the dropdown with all controls
- Clicking outside the dropdown closes it
- The lines animate into an X when open
- Switching to desktop width (≥768px): hamburger disappears, controls reappear

- [ ] **Step 4: Commit**

```bash
git add app/components/Nav.tsx
git commit -m "feat: add hamburger menu to Nav for mobile screens"
```

---

## Task 2: DashboardShell — Responsive Main Grid

**Files:**
- Modify: `app/components/DashboardShell.tsx`

### Context
`DashboardShell.tsx` has two layout issues on mobile:
1. `px-8` padding is too wide for phone screens
2. `grid grid-cols-3` makes the main+sidebar layout overflow horizontally

The grid wraps `ProcessGrid` (col-span-2) and the OC sidebar (col-span-1). On mobile these need to stack vertically.

### Steps

- [ ] **Step 1: Fix the wrapper padding**

In `app/components/DashboardShell.tsx`, change line 44:

```tsx
// Before
<div className="px-8 mt-6">

// After
<div className="px-4 md:px-8 mt-6">
```

- [ ] **Step 2: Make the main grid responsive**

Change line 54:

```tsx
// Before
<div className="grid grid-cols-3 gap-4 mb-6">

// After
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
```

- [ ] **Step 3: Make the main content area span correctly**

Change line 55:

```tsx
// Before
<div className="col-span-2">

// After
<div className="col-span-1 md:col-span-2">
```

- [ ] **Step 4: Test on mobile viewport**

With dev server running, verify on iPhone 12 (390px) in DevTools:
- All sections (charts, process grid, OC list, indicators table, comparison section) stack vertically with no horizontal overflow
- On desktop (≥768px): 2-column + 1-column sidebar layout is unchanged

- [ ] **Step 5: Commit**

```bash
git add app/components/DashboardShell.tsx
git commit -m "feat: responsive grid layout in DashboardShell for mobile"
```

---

## Task 3: ProcessGrid — Responsive Card Grid

**Files:**
- Modify: `app/components/ProcessGrid.tsx`

### Context
`ProcessGrid.tsx` renders process cards in `grid grid-cols-3` — always 3 columns, which makes cards tiny on mobile. Needs to be 1 column on phones, 2 on small tablets, 3 on desktop.

### Steps

- [ ] **Step 1: Update the grid class**

In `app/components/ProcessGrid.tsx`, change line 63:

```tsx
// Before
<div className="grid grid-cols-3 gap-3.5">

// After
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
```

- [ ] **Step 2: Test on mobile viewport**

With dev server running, verify on iPhone 12 (390px):
- Process cards display 1 per row, full width
- Gauge SVG and text are readable
- Cards are tappable (click still works as filter)

Verify on iPad (768px):
- Process cards display 2 per row

Verify on desktop (1024px+):
- Process cards display 3 per row (unchanged)

- [ ] **Step 3: Commit**

```bash
git add app/components/ProcessGrid.tsx
git commit -m "feat: responsive 1/2/3 column grid in ProcessGrid"
```

---

## Task 4: IndicatorsTable — Horizontal Scroll + Responsive Filter Bar

**Files:**
- Modify: `app/components/IndicatorsTable.tsx`

### Context
`IndicatorsTable.tsx` has two mobile issues:
1. The `<table>` element has 8 columns — it must scroll horizontally on narrow screens
2. The filter bar header uses `flex justify-between` with status tabs that can overflow on phones — needs to stack vertically on mobile

### Steps

- [ ] **Step 1: Wrap the table in a horizontal scroll container**

In `app/components/IndicatorsTable.tsx`, locate line 141:

```tsx
<table className="w-full border-collapse">
```

Wrap it so the table has a minimum width and its container scrolls:

```tsx
<div className="overflow-x-auto -mx-6 px-6">
  <table className="w-full min-w-[640px] border-collapse">
```

The `-mx-6 px-6` trick lets the scroll container span full-bleed to the card edges so the scrollbar appears at the card edge, not inside.

- [ ] **Step 2: Make the filter bar stack on mobile**

Locate line 77 (the filter bar container):

```tsx
// Before
<div className="flex justify-between items-center mb-4 gap-4">

// After
<div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center mb-4">
```

- [ ] **Step 3: Make the status tabs wrap on mobile**

Locate line 112 (the status tabs container):

```tsx
// Before
<div className="flex gap-1.5 flex-shrink-0">

// After
<div className="flex gap-1.5 flex-wrap">
```

- [ ] **Step 4: Test on mobile viewport**

With dev server running, verify on iPhone 12 (390px):
- Filter dropdowns and "Limpiar" button appear stacked above the status tabs
- Status tabs wrap to a second line if needed — no overflow
- The table scrolls horizontally and all 8 columns are accessible
- Clicking a row still opens the modal (modal is `fixed`, works fine on mobile)
- Filter by process and OC still works

- [ ] **Step 5: Commit**

```bash
git add app/components/IndicatorsTable.tsx
git commit -m "feat: horizontal scroll table and responsive filter bar in IndicatorsTable"
```

---

## Task 5: Final Verification

**Files:** None modified — visual QA pass.

### Steps

- [ ] **Step 1: Full mobile pass on iPhone 12 (390px)**

With dev server running at `http://localhost:3000`, check each section in DevTools mobile viewport (390px):

| Section | Expected |
|---------|----------|
| Nav | Hamburger visible, all controls accessible via dropdown |
| Hero / banner | No overflow |
| ChartsSection | Charts stack 1 per row (already was responsive) |
| ProcessGrid | 1 card per row |
| OC sidebar | Appears below ProcessGrid, full width |
| IndicatorsTable | Filter bar stacked, table scrolls horizontally |
| OcComparisonSection | No horizontal overflow |

- [ ] **Step 2: Desktop regression check (1280px)**

Switch DevTools to "Responsive" at 1280px. Verify:
- Nav: hamburger gone, original desktop controls visible
- DashboardShell: 2-col main + 1-col OC sidebar
- ProcessGrid: 3 columns
- IndicatorsTable: normal full-width layout

- [ ] **Step 3: Run build to confirm no TypeScript errors**

Run: `npm run build 2>&1 | tail -30`

Expected: `✓ Compiled successfully` with no type errors.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete mobile responsiveness — nav hamburger, responsive grids, horizontal scroll table"
```

---

## Success Criteria Checklist

- [ ] Nav shows hamburger on screens < 768px; all controls accessible via dropdown
- [ ] Dashboard sections stack vertically on mobile (no horizontal overflow)
- [ ] ProcessGrid shows 1 column on phones, 2 on small tablets, 3 on desktop
- [ ] IndicatorsTable scrolls horizontally without breaking column layout
- [ ] All existing desktop layouts unchanged
- [ ] No new npm dependencies added
- [ ] `npm run build` completes without errors
