# Copilot Instructions – Simplifica UI Design Canon

## Canonical Full-Page Component Layout

Every routed feature component (Configuración, Servicios, Clientes, Reservas, etc.) **must** follow this layout structure. `Configuración` (`configuracion.component.html`) is the reference implementation.

### Structure

```
Host element (:host / root div)
└── sticky top bar          ← flush to the top edge, full width, no wrapper padding
└── scrollable content area ← fills remaining height, handles its own overflow
```

### Root element

```html
<div class="h-full bg-slate-50 dark:bg-slate-900/40 flex flex-col">
```

- `h-full` – fills the parent (which the layout sets to `h-full`)
- `bg-slate-50 dark:bg-slate-900/40` – use the **slate** scale, NOT `gray`
- `flex flex-col` – children stack vertically
- **No** `overflow-hidden` on the root (the layout wrapper already handles this)
- **No** custom SCSS class that re-declares `height` or `background`

### Sticky top bar

```html
<div class="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm">
```

- **Direct child** of the root element – no intermediate wrapper with padding
- `sticky top-0` makes it flush to the top edge of the scroll container
- **No** `flex-shrink-0` (not needed; `sticky` already keeps it in place)
- Inner nav/actions row: `flex items-center gap-4 px-4 md:px-6 py-3`

### Scrollable content area

```html
<div class="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-20 md:pb-6 no-scrollbar">
```

- `flex-1` – takes all remaining vertical space
- `overflow-y-auto` + `overflow-x-hidden` – only vertical scrolling
- Padding: `p-4 md:p-6`, plus extra `pb-20` on mobile for the bottom nav
- **No** `max-w-*` wrapper inside – content fills the full available width

---

## Layout wiring (`responsive-layout.component.ts`)

Routes that own their top bar and internal scrolling **must** be added to the
`isCustomScrollRoute` checks in `getMainContentPadding()` and `getOverflowClass()`.
This ensures the layout injects:

- `p-0` (no outer padding that would push the top bar away from the screen edge)
- `overflow-hidden flex flex-col` (so the component controls its own scroll)

Currently registered custom-scroll routes: `/webmail`, `/clientes`, `/reservas`,
`/configuracion`, `/servicios`.

When adding a new feature component that follows this pattern, add its route
segment to both `isCustomScrollRoute` variables in that file.

---

## Colors

| Token           | Tailwind class (light)     | Tailwind class (dark)        |
|-----------------|----------------------------|------------------------------|
| Page background | `bg-slate-50`              | `dark:bg-slate-900/40`       |
| Top bar bg      | `bg-white`                 | `dark:bg-slate-800`          |
| Top bar border  | `border-gray-200`          | `dark:border-slate-700`      |
| Card bg         | `bg-white`                 | `dark:bg-slate-800`          |
| Body text       | `text-gray-900`            | `dark:text-white`            |
| Muted text      | `text-gray-500`            | `dark:text-gray-400`         |

Use the **slate** scale for backgrounds; **gray** is acceptable for text and borders.

---

## Anti-patterns to avoid

- ❌ `max-w-5xl mx-auto` or any max-width wrapper inside a full-page component
- ❌ Custom SCSS class on the root element that sets `height` or `background`
- ❌ `overflow-hidden` on the root div (breaks sticky positioning)
- ❌ `flex-shrink-0` on the sticky top bar div
- ❌ Adding outer padding in the layout (`p-6`) for components that manage their own layout — register them in `responsive-layout.component.ts` instead
- ❌ Using `bg-gray-50 dark:bg-gray-900` for the page background (use `slate`, not `gray`)
