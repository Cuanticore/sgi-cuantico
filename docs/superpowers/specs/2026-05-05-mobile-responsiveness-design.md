# Mobile Responsiveness Design

**Date:** 2026-05-05  
**Project:** Indicadores Dashboard (Next.js 14 + Tailwind CSS)  
**Approach:** Tailwind-first, incremental — responsive prefixes + hamburger menu component

---

## Goals

Make the dashboard fully usable on mobile devices (phones in portrait and landscape). All features — filters, modals, year selector, OC panel — must be accessible and functional. No new dependencies.

## Breakpoints

Uses Tailwind defaults:
- `sm`: 640px (small tablet / large phone landscape)
- `md`: 768px (tablet / small desktop) — primary breakpoint for desktop vs. mobile

---

## Components to Change

### 1. `Nav.tsx` — Hamburger Menu

**Mobile (`< md`):**
- Show: logo (left) + hamburger icon button (right)
- Hide: year selector row and user avatar from the normal header flow
- Hamburger toggles a dropdown panel via `useState<boolean>(false)`
- Dropdown panel contains: year selector + user avatar/name
- Clicking outside the panel (or selecting an option) closes it
- Use `md:hidden` / `hidden md:flex` to switch between layouts

**Desktop (`md+`):** No changes to existing layout.

**Implementation notes:**
- Add `isMenuOpen` state to `Nav.tsx`
- Wrap existing controls in `<div className="hidden md:flex ...">` 
- Add `<button className="md:hidden ...">` for hamburger icon (3-line SVG or Heroicons)
- Add `<div className={isMenuOpen ? 'block' : 'hidden'} ...>` for the mobile dropdown

---

### 2. `DashboardShell.tsx` — Main Layout Grid

**Current:** `grid grid-cols-3 gap-4` with `col-span-2` (main) + `col-span-1` (OC sidebar)

**Change:**
- Outer grid: `grid grid-cols-1 md:grid-cols-3 gap-4`
- Main content area: `col-span-1 md:col-span-2`
- OC sidebar: `col-span-1` (already correct, stacks below on mobile naturally)

**Mobile stacking order (top to bottom):**
1. Hero banner
2. ChartsSection
3. ProcessGrid
4. IndicatorsTable
5. OC panel (comparison section)

**Padding:** Replace `px-8` → `px-4 md:px-8` globally in this component.

---

### 3. `ProcessGrid.tsx` — Card Grid

**Current:** `grid grid-cols-3`

**Change:** `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3`

No other changes needed — cards are self-contained and scale well.

---

### 4. `ChartsSection.tsx` — Charts Grid

**Already responsive:** `grid-cols-1 md:grid-cols-3` is already in place.

**Only change:** Audit padding — replace any `px-8` → `px-4 md:px-8` if present.

---

### 5. `IndicatorsTable.tsx` — Data Table

**Change:** Wrap the `<table>` element in:
```html
<div class="overflow-x-auto">
  <table class="min-w-[640px] ...">
```

This allows the table to maintain all its columns while enabling horizontal scroll on narrow screens. Modals are already `fixed` positioned and work on mobile without changes.

---

## Out of Scope

- No changes to chart internals (ECharts handles its own responsiveness)
- No changes to modal content layout (already works on mobile)
- No changes to color scheme, typography, or desktop layout
- No new npm dependencies

---

## Success Criteria

- [ ] Nav shows hamburger on screens < 768px; all controls accessible via dropdown
- [ ] Dashboard sections stack vertically on mobile (no horizontal overflow)
- [ ] ProcessGrid shows 1 column on phones, 2 on small tablets
- [ ] IndicatorsTable scrolls horizontally without breaking column layout
- [ ] All existing desktop layouts unchanged
- [ ] No new npm dependencies added
