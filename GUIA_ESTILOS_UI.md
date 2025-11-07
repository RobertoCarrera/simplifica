# Guía de Estilos UI — Presupuestos y componentes comunes

Esta guía documenta patrones de estilos y animaciones aplicados en el módulo de Presupuestos y componentes comunes, para facilitar la unificación visual del resto de la app.

## Principios

- Consistencia entre escritorio y móvil, con variantes `dark:` siempre presentes.
- Preferencia por utilidades Tailwind para layout/spacing y SCSS solo cuando sea necesario (animaciones/interacciones complejas).
- Animaciones suaves y respetuosas con accesibilidad (`prefers-reduced-motion`).
- Contenedores claros: tarjetas con borde, shadow leve y radios sutiles.

## Botón de Acción Flotante (FAB)

Clase global: `.fab-button` (definida en `src/styles.scss`).

Características:
- Posición fija (inferior derecha) con z-index alto.
- Gradiente azul, sombra pronunciada, animación de entrada `fabSlideIn`.
- Hover: escala + rotación del icono (`<i>` o `<svg>`), color de fondo más intenso.
- Estados: `:active` con micro-escala; `:disabled` con opacidad y sin transform.
- Responsive: en móvil sube sobre la bottom-nav (`bottom: 70px`, tamaño 52px).
- Modo oscuro y `prefers-reduced-motion` soportados.

Uso recomendado:
- Para acciones primarias de creación: "Nuevo Cliente", "Nuevo Presupuesto", etc.
- Marcup sugerido (icono puede ser `<i>` o `<svg>`):
  ```html
  <button class="fab-button" title="Nueva acción">
    <svg viewBox="0 0 24 24" ...>...</svg>
  </button>
  ```

Adopción realizada:
- Presupuestos (Listado): se reemplazó el botón flotante por `.fab-button`.
- Clientes: ya lo utilizaba (original del que se basó la versión global).

## Contenedores y cabeceras

- Contenedor de página (wrapper interior): `flex-1 flex flex-col p-0 md:p-6 overflow-hidden`.
  - Razonamiento: sin padding lateral en móvil (p-0) y con paddings amplios en desktop (md:p-6), como en Presupuestos.
  - El root suele llevar `h-full flex flex-col overflow-hidden` y, si hay bottom nav o FAB, `pb-20 md:pb-8` para no solapar en móvil.
- Tarjetas/headers: `bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700` con padding `p-4 md:p-6` y separación `mb-4 md:mb-6`.
- Tipografía de título: `text-2xl font-bold text-gray-900 dark:text-gray-100`.
- Subtítulo/ayuda: `text-gray-600 dark:text-gray-300`.

## Controles de búsqueda y filtros (Presupuestos > Listado)

- Input búsqueda: `w-full px-3 md:px-4 py-2 pl-9 md:pl-10 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 text-sm`.
- Select filtros: `px-3 md:px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 text-sm`.

## Estado vacío (Presupuestos > Listado)

- Contenedor: `bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 md:p-12 text-center`.
- Icono dentro de círculo: `w-20 h-20 md:w-24 md:h-24 bg-blue-100 dark:bg-blue-900/30 rounded-full`.
- CTA primaria (actual): `bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 inline-flex items-center gap-2 shadow-md hover:shadow-lg`.
  - Alternativa: usar `.btn-primary` (definida en `styles.scss`) si se prefiere uniformar los botones primarios.

## Alertas de error y estados de carga

- Error (alerta unificada):
  - Contenedor: `bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6 flex items-start gap-3`.
  - Icono: SVG 20×20 con `fill="currentColor"`.
  - Cuerpo: `font-semibold` para el título y `text-sm` para el detalle.
  - Acción: botón `.btn-primary` para reintentos (o utilidades Tailwind equivalentes).

- Carga (centrado):
  - Wrapper: `flex justify-center items-center py-12`.
  - Spinner: `animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600`.
  - Texto: `text-gray-600 dark:text-gray-300 mt-4`.

## Listado de Presupuestos — Escritorio

- Tabla con encabezado sticky: `thead` con `bg-gray-50 dark:bg-gray-700` y `border-b`.
- Filas: `tbody` con `divide-y` y hover sutil `hover:bg-gray-50 dark:hover:bg-gray-700/50`.
- Badges de estado (mapping por clase):
  - draft: `bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`
  - sent: `bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300`
  - accepted: `bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`
  - rejected: `bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300`
  - expired: `bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
- Acciones por fila: botones icono con color de énfasis y hover con fondo sutil (`hover:bg-<color>-50 dark:hover:bg-<color>-900/30`).

## Listado de Presupuestos — Móvil (Cards)

Estructura de card:
- Contenedor: `bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden`.
- Header de card: avatar degradado `from-blue-500 to-purple-600`, nombre/folio con `truncate`, badge de estado como en escritorio.
- Cuerpo: bloques con `text-sm` y separadores `border-t`.
- Footer de card: total con `font-bold` y botones de acción compactos.

## Detalle de Presupuesto — Pautas clave

- Altura móvil del header: ~120px; header sticky en móvil.
- Evitar `min-h-screen` en vistas internas para no forzar scroll fantasma; usar `overflow-auto` en el contenedor scrollable del layout.
- Espaciado inferior del contenido: `pb-20 md:pb-8` para que no quede oculto por la bottom-nav en móvil.
- Resumen financiero (móvil): tarjeta sticky inferior con totales.
- Cliente: card específica en móvil y reubicación en desktop según layout.
- Ítems: doble representación — tabla (desktop) y cards (móvil), con visibilidad mutua `hidden md:block` vs `md:hidden`.
- Historial: bloque colapsable con animación (expand/contraer) y control por signal `historyExpanded` en el componente.

## Comportamiento de scroll y layout

- El layout principal gestiona el área de scroll con `<main class="flex-1 overflow-auto">`.
- Los hijos no deben fijar 100% de alto; se eliminó `:host { height: 100% }` en detalle para evitar conflictos.

## Temas y tokens

- Variables definidas en `:root` y `.dark` (`src/styles.scss`) gobiernan colores base y `--color-primary-*`.
- Clase `.btn-primary` disponible como patrón de botón primario basado en tokens.

## Accesibilidad y movimiento reducido

- Todas las animaciones relevantes (FAB, collapsibles) contemplan `@media (prefers-reduced-motion: reduce)` para desactivar transformaciones.
- Los botones tienen tamaño mínimo táctil adecuado; en móvil, el FAB no compite con la bottom nav por el ajuste `bottom: 70px`.

## Checklist de adopción (para otros módulos)

- [ ] Usar tarjetas con `bg-*/dark:bg-* + rounded-lg + shadow-sm + border` como contenedor base.
- [ ] Para acciones de creación primarias, reutilizar `.fab-button`.
- [ ] Mantener el patrón de inputs/selects con `bg-gray-50 dark:bg-gray-700` y `focus:ring-2 focus:ring-blue-500`.
- [ ] En móviles, preferir cards en lugar de tablas y mantener mapping de badges de estado.
- [ ] Respetar `overflow-auto` del layout y evitar alturas forzadas.
- [ ] Añadir variantes `dark:` y `prefers-reduced-motion` donde aplique.

## Referencias

- Estilos globales: `src/styles.scss` (tokens, `.btn-primary`, `.fab-button`).
- Presupuestos — listado: `src/app/modules/quotes/quote-list/quote-list.component.html`.
- Presupuestos — detalle: `src/app/modules/quotes/quote-detail/` (HTML, TS, SCSS).
