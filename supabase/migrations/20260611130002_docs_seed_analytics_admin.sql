-- Migration: Docs seed extension — 2 new categories + role/author backfill
-- Description: Adds the 2 remaining categories (analytics, admin) with 5
-- articles each (10 new), backfills author_user_id on the 28 existing seed
-- articles (Fase 2 prior) and extends the role-visibility matrix so that
-- owner, admin and super_admin see every published article.
--
-- All inserts are wrapped in ON CONFLICT (slug) DO NOTHING so the
-- migration is fully idempotent. Re-running it is a no-op.
--
-- Idempotent: yes
-- Author: Roberto (Simplifica)
--
-- Note: docs_categories is the master table (8 rows seeded in
-- 20260611130000). This migration adds 2 more. analytics sits between
-- calendario and cuenta (sort_order 65); admin goes last (80).

BEGIN;

-- =========================================================================
-- 1. NEW CATEGORIES
-- =========================================================================
INSERT INTO public.docs_categories (slug, name, description, icon, sort_order)
VALUES
  ('analytics', 'Analíticas',
   'Entiende los datos de tu negocio: ingresos, ocupación, fidelización, embudo de conversión.',
   'graph-up', 65),
  ('admin', 'Administración',
   'Gestiona usuarios, roles, módulos, planes de suscripción y configuración de plataforma.',
   'gear-wide-connected', 80)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================================
-- 2. NEW ARTICLES (10 total: 5 in analytics, 5 in admin)
-- =========================================================================
-- Each article is its own INSERT with ON CONFLICT (slug) DO NOTHING so the
-- migration is safe to re-run.

-- ----- 2.1 Analytics ----------------------------------------------------

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'entender-el-dashboard-de-analiticas',
  'Cómo entender el dashboard de analíticas',
  'KPIs principales, rangos de fechas y comparativas que ofrece Simplifica.',
  $md$# Cómo entender el dashboard de analíticas

El **dashboard de analíticas** te da una vista rápida de cómo va tu negocio: facturación, reservas, ocupación de agenda y retención de clientes. Lo encuentras en el menú lateral, sección **Analíticas**.

## Qué encontrarás

- **KPIs principales** (parte superior): ingresos del mes, reservas nuevas, clientes nuevos, tasa de ocupación.
- **Gráficos**: evolución de ingresos (línea), distribución por servicio (tarta), asistencia por profesional (barras).
- **Comparativas** (icono ⚖️): comparan el periodo actual con el anterior (mes, trimestre, año).

## Pasos

1. Ve a **Analíticas** desde el menú lateral.
2. Elige el **rango de fechas** en la esquina superior derecha.
3. Pulsa el icono **⚖️ Comparar** si quieres ver la variación frente al periodo anterior.
4. Haz clic en cualquier KPI para abrir el **detalle**.

## Ejemplo

> Estás cerrando el trimestre. Abres Analíticas, rango "Últimos 3 meses", activas "Comparar con trimestre anterior". Ves que los ingresos han subido un 14%, las reservas nuevas un 22%, y la ocupación media está en 78% (antes 71%).

## Consejo

Marca los KPIs que más usas como **favoritos** (icono estrella) para tenerlos siempre en la parte superior del dashboard.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'analytics'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 1, now()
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'analiticas-de-facturacion',
  'Analíticas de facturación: IVA, series y vencimientos',
  'Filtra la facturación por serie, IVA, forma de cobro y detecta facturas vencidas.',
  $md$# Analíticas de facturación

La sección **Analíticas → Facturación** te ayuda a entender el comportamiento de tu facturación: qué IVA genera más, qué series se usan más, cuántas facturas están vencidas.

## Pasos

1. Ve a **Analíticas → Facturación**.
2. Elige el **rango de fechas** y la **serie** (o "Todas").
3. Verás 3 pestañas:
   - **Resumen**: total facturado, total cobrado, total pendiente.
   - **Por IVA**: desglose por tipo de IVA (21%, 10%, 4%, exento).
   - **Vencimientos**: facturas pendientes con fecha de vencimiento pasada o próxima.

## Ejemplo

> Llega el cierre de trimestre. Filtras por "Serie F-2026", rango "Trimestre actual". Ves que has facturado 38.500 € con un 21% de IVA predominante. Tienes 4 facturas vencidas por un total de 1.230 € que deberías reclamar.

## Consejo

Configura **alertas automáticas** en *Ajustes → Notificaciones* para que te avisen cuando una factura lleve más de X días vencida.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'analytics'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 2, now()
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'analiticas-de-agenda-y-ocupacion',
  'Analíticas de agenda y ocupación',
  'Mide la ocupación por profesional, franjas horarias con más demanda y huecos libres.',
  $md$# Analíticas de agenda y ocupación

La sección **Analíticas → Agenda** te muestra cómo de llena está tu agenda: porcentaje de ocupación, franjas más demandadas y huecos sin reservar.

## Pasos

1. Ve a **Analíticas → Agenda**.
2. Elige el **rango de fechas**.
3. Verás:
   - **Ocupación global**: % de horas reservadas vs horas disponibles.
   - **Ocupación por profesional**: ranking de quién tiene la agenda más llena.
   - **Franjas horarias**: mapa de calor con las horas pico (verde oscuro = mucha demanda).
   - **Huecos libres**: lista de huecos sin reservar (útil para campañas de última hora).

## Ejemplo

> Quieres llenar la agenda del próximo mes. Abres Analíticas → Agenda y ves que los **martes de 10 a 12** están al 92% de ocupación (pide precio), mientras que los **jueves de 16 a 18** están al 35% (hueco para promo). Creas una campaña de email ofreciendo un 15% en jueves por la tarde.

## Consejo

Si tu ocupación es inferior al 50%, revisa tu **disponibilidad horaria** y tu **link público de reservas**: a veces los clientes no reservan simplemente porque la franja que ofreces no les encaja.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'analytics'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 3, now()
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'analiticas-de-clientes-fidelizacion',
  'Analíticas de clientes: fidelización, LTV y segmentos',
  'Identifica a tus mejores clientes, los que están en riesgo y los nuevos.',
  $md$# Analíticas de clientes

La sección **Analíticas → Clientes** agrupa todo lo que necesitas saber sobre tu base de clientes: retención, valor de vida (LTV), segmentos y clientes en riesgo.

## Pasos

1. Ve a **Analíticas → Clientes**.
2. Encontrarás:
   - **LTV medio**: cuánto factura de media un cliente durante toda su relación contigo.
   - **Tasa de retención**: % de clientes que repiten en los últimos 90 días.
   - **Segmentos VIP / Frecuentes / Ocasionales / Inactivos**: distribución automática de tu cartera.
   - **Clientes en riesgo**: llevan más de X días sin visitarte (configurable).

## Ejemplo

> Tienes 850 clientes. El segmento VIP son 45 (5% de la cartera) y aportan el 32% de tus ingresos. Identificas a 12 clientes en riesgo (más de 90 días sin venir) y les envías un email personalizado con un 20% de descuento para reactivarles.

## Consejo

Crea una **alerta automática** para que, cada lunes, te llegue un email con la lista de clientes en riesgo de la semana anterior.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'analytics'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 4, now()
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'exportar-informes-a-csv-y-pdf',
  'Cómo exportar informes a CSV o PDF',
  'Comparte los datos con tu gestor, tu socio o tu equipo en formato abierto.',
  $md$# Cómo exportar informes a CSV o PDF

Todos los paneles de analíticas se pueden exportar para enviarlos a tu gestoría, tu socio o analizarlos en otra herramienta.

## Pasos

1. Abre el panel que quieres exportar.
2. Pulsa el icono **⬇ Exportar** (esquina superior derecha).
3. Elige formato:
   - **CSV**: ideal para abrir en Excel, Google Sheets o enviar a tu gestoría.
   - **PDF**: ideal para imprimir o archivar tal cual.
4. Aplica filtros adicionales (rango, profesional, serie) si quieres acotar el informe.
5. Pulsa **Generar**. Se descargará automáticamente.

## Ejemplo

> Tu gestoría te pide mensualmente un informe de IVA desglosado por serie. Abres Analíticas → Facturación, filtras por el mes en cuestión, pulsas Exportar → PDF → "Por IVA". Le mandas el PDF y listo, sin tener que copiar y pegar números a mano.

## Consejo

Las exportaciones **CSV respetan los filtros activos**: si filtras por serie, el CSV solo trae esa serie. Aprovecha esto para enviar informes personalizados.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'analytics'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 5, now()
)
ON CONFLICT (slug) DO NOTHING;

-- ----- 2.2 Admin (Plataforma) ------------------------------------------

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'invitar-y-gestionar-usuarios',
  'Cómo invitar y gestionar usuarios del equipo',
  'Da de alta, reasigna roles, archiva o reactiva miembros del equipo.',
  $md$# Cómo invitar y gestionar usuarios

El módulo **Equipo** es donde se centraliza todo lo relativo a las personas que trabajan contigo en Simplifica.

## Pasos para invitar

1. Ve a **Equipo → Miembros**.
2. Pulsa **+ Invitar miembro**.
3. Escribe el **email** y elige el **rol** adecuado.
4. Pulsa **Enviar invitación**.

## Pasos para gestionar un miembro existente

1. En la lista de miembros, haz clic en el que quieras editar.
2. Desde su ficha puedes:
   - **Cambiar rol** (selector superior).
   - **Cambiar empresa** (si trabajas en varias).
   - **Archivar** (el miembro deja de poder entrar; su trabajo se conserva).
   - **Reactivar** (devuelve el acceso).
   - **Eliminar definitivamente** (solo si nunca tuvo citas/facturas — irreversible).

## Ejemplo

> Contratas a una nueva recepcionista, Sara. La invitas como **member**, completa el onboarding, y a las 2 semanas le subes a **supervisor** porque ha demostrado que puede cubrir ausencias. Si un día se va, la archivas: su historial (citas, clientes) se queda en la empresa por si vuelve o para auditoría.

## Consejo

Revisa la lista de miembros una vez al mes. Los usuarios **archivados** siguen contando para efectos de IVA/facturación, pero no pueden entrar.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'admin'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 1, now()
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'roles-y-permisos-matriz',
  'Roles y permisos: la matriz completa',
  'Qué puede hacer cada rol en cada módulo del CRM.',
  $md$# Roles y permisos: la matriz completa

Esta es la referencia oficial de qué puede hacer cada rol en Simplifica. Útil para diseñar la estructura de tu equipo y para resolver dudas del tipo "¿puede mi recepcionista ver la facturación?".

## Roles de empresa

- **owner**: acceso total, incluido facturación y datos fiscales.
- **admin**: gestiona equipo, configuración, agenda, clientes, presupuestos y facturas. No puede eliminar la empresa.
- **supervisor**: ve todo el equipo, puede editar agenda y clientes, pero no facturación.
- **member**: gestiona los clientes y citas que tiene asignados.
- **professional** / **agent**: gestiona su agenda personal y los clientes que tiene asignados.
- **marketer**: acceso a datos agregados (analíticas) y campañas; no ve fichas individuales.

## Roles de plataforma

- **super_admin**: equipo de Simplifica. Acceso a todas las empresas, métricas globales y configuración de plataforma.

## Matriz resumida

| Rol | Clientes | Agenda | Facturas | Equipo | Analíticas | Admin plataforma |
|---|---|---|---|---|---|---|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| supervisor | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| member | ✓ (asignados) | ✓ (asignada) | ✗ | ✗ | parcial | ✗ |
| professional | ✓ (asignados) | ✓ (propia) | ✗ | ✗ | parcial | ✗ |
| marketer | ✗ | ✗ | ✗ | ✗ | agregados | ✗ |
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Ejemplo

> Tienes dudas sobre qué rol darle a tu nueva community manager. Le das **marketer**: puede ver las analíticas agregadas (cuántas reservas, facturación total) pero NO puede ver las fichas individuales de clientes ni la agenda. Justo lo que necesita para su trabajo.

## Consejo

Menos permisos = más seguridad. Empieza siempre con el rol más bajo y sube si la persona demuestra necesitar más acceso.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'admin'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 2, now()
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'modulos-activos-y-planes',
  'Módulos activos y planes de suscripción',
  'Activa o desactiva módulos según tu plan y tus necesidades.',
  $md$# Módulos activos y planes

Simplifica se organiza en **módulos** (Clientes, Agenda, Reservas, Presupuestos, Facturas, etc.). Tu plan de suscripción determina qué módulos tienes disponibles; además, puedes **desactivar** módulos que no uses para simplificar la interfaz.

## Pasos

1. Ve a **Ajustes → Empresa → Módulos**.
2. Verás el listado completo de módulos con dos estados:
   - **Disponible / No disponible**: según tu plan.
   - **Activo / Inactivo**: los que puedes activar/desactivar.
3. Activa o desactiva lo que necesites. Los cambios se reflejan al guardar.
4. Si quieres cambiar de plan, pulsa **Cambiar plan** (te lleva al portal de facturación).

## Módulos principales

- **Clientes** — base de datos de clientes.
- **Agenda** — calendario y citas.
- **Reservas online** — link público para que los clientes reserven.
- **Presupuestos** — crear y enviar presupuestos.
- **Facturas** — emisión y control de cobros.
- **Productos y servicios** — catálogo.
- **Analíticas** — informes y KPIs.
- **Integraciones** — Google Calendar, Stripe, etc.

## Ejemplo

> Acabas de empezar y todavía no emites facturas. Desactivas el módulo **Facturas** para que no aparezca en el menú lateral. Cuando un cliente te pida una, lo activas, emites la factura, y puedes desactivarlo de nuevo.

## Consejo

Aunque un módulo esté **desactivado en tu empresa**, los datos no se borran. Si lo reactivas, los vuelves a ver.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'admin'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 3, now()
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'configuracion-de-notificaciones',
  'Configuración de notificaciones del equipo',
  'Qué avisos recibe cada miembro, por qué canal y con qué frecuencia.',
  $md$# Configuración de notificaciones

Simplifica envía notificaciones automáticas al equipo y a los clientes. Aquí configuras qué, cuándo y a quién.

## Pasos

1. Ve a **Ajustes → Notificaciones**.
2. Verás dos pestañas:
   - **Internas (equipo)**: avisos que reciben los miembros (nuevo cliente, nueva reserva, cita cancelada…).
   - **Externas (clientes)**: emails/SMS que reciben tus clientes (confirmación de cita, recordatorio 24h antes, factura emitida…).
3. Para cada evento, marca **quién** lo recibe (todos / solo owner / solo admins) y por **qué canal** (in-app, email, push).
4. Activa/desactiva la **digest semanal** si quieres un resumen por email cada lunes.

## Ejemplo

> Quieres que el equipo reciba un email cada vez que entra una reserva nueva, pero no cada vez que un cliente edita su perfil. Vas a Notificaciones → Internas, en "Nueva reserva" activas **email** y desactivas **push**, y en "Cliente editado" desactivas todo.

## Consejo

Demasiadas notificaciones = se ignoran. Empieza con un set conservador (solo lo crítico) y ve añadiendo según la necesidad real del equipo.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'admin'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 4, now()
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES (
  'auditoria-y-logs-de-seguridad',
  'Auditoría y logs de seguridad',
  'Quién hizo qué y cuándo: el registro completo de actividad de tu cuenta.',
  $md$# Auditoría y logs de seguridad

El **log de auditoría** registra toda la actividad relevante de tu cuenta: quién entró, qué modificó, qué exportó, qué facturó. Es tu "caja negra" en caso de disputa o incidencia.

## Pasos

1. Ve a **Ajustes → Auditoría** (solo visible para **owner** y **admin**).
2. Verás el log paginado, filtrable por:
   - **Usuario** (qué miembro hizo la acción).
   - **Tipo de evento** (login, edición, borrado, exportación, etc.).
   - **Rango de fechas**.
3. Pulsa en cualquier fila para ver el **detalle** (datos antiguos vs nuevos en caso de edición).
4. Puedes **exportar a CSV** el resultado del filtro.

## Ejemplo

> Una factura aparece como pagada y tú no la marcaste. Vas a Auditoría, filtras por "factura editada" en la última semana, y ves que la marcó el admin Juan a las 14:32. Abres el detalle y compruebas que todo está correcto — fue un pago registrado correctamente.

## Consejo

El log de auditoría **no se puede borrar desde la app**, solo el equipo de Simplifica puede hacerlo (y solo por motivos legales). Esto garantiza la integridad de la pista de auditoría.
$md$,
  (SELECT id FROM public.docs_categories WHERE slug = 'admin'),
  'published', '896dd72e-4d86-4982-97f6-ca00e1f33b97', 5, now()
)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================================
-- 3. BACKFILL author_user_id ON THE 28 PRIOR SEED ARTICLES
-- =========================================================================
-- The Fase 2 prior migration left author_user_id = NULL on the original 28
-- articles. This task requires author_user_id = Roberto's auth.id so that
-- the docs UI can show "Autor: Roberto" on every article.
--
-- We update unconditionally on published articles that still have NULL.
-- Safe to re-run: a second pass finds 0 rows to update.
UPDATE public.docs_articles
SET author_user_id = '896dd72e-4d86-4982-97f6-ca00e1f33b97'
WHERE author_user_id IS NULL
  AND status = 'published';

-- =========================================================================
-- 4. EXTEND ROLE VISIBILITY
-- =========================================================================
-- The Fase 2 prior matrix used a curated role list per category. The DoD
-- of this phase says: owner and admin see EVERYTHING. super_admin sees
-- everything plus the platform-only "admin" category.
--
-- Strategy: ensure owner, admin and super_admin have a role-row for every
-- published article (idempotent ON CONFLICT). Also add member to the
-- 'all roles' set (primeros-pasos, calendario, cuenta, analytics) and
-- professional/agent to analytics for self-service visibility.

-- 4.1 owner + admin see every published article (regardless of category)
INSERT INTO public.docs_article_roles (article_id, role)
SELECT a.id, r.name
FROM public.docs_articles a
CROSS JOIN (VALUES ('owner'), ('admin')) AS r(name)
WHERE a.status = 'published'
ON CONFLICT DO NOTHING;

-- 4.2 super_admin sees every published article (including admin/plataforma)
INSERT INTO public.docs_article_roles (article_id, role)
SELECT a.id, 'super_admin'
FROM public.docs_articles a
WHERE a.status = 'published'
ON CONFLICT DO NOTHING;

-- 4.3 member gets docs_article_roles on operational + transversal categories
-- (member = empleado regular que necesita hacer onboarding, ver calendario,
--  entender analíticas; NO ve admin ni facturación)
INSERT INTO public.docs_article_roles (article_id, role)
SELECT a.id, 'member'
FROM public.docs_articles a
JOIN public.docs_categories c ON c.id = a.category_id
WHERE c.slug IN ('primeros-pasos', 'calendario', 'cuenta', 'analytics')
  AND a.status = 'published'
ON CONFLICT DO NOTHING;

-- 4.4 professional / agent can read analytics (high-level, no PII)
INSERT INTO public.docs_article_roles (article_id, role)
SELECT a.id, r.name
FROM public.docs_articles a
JOIN public.docs_categories c ON c.id = a.category_id
CROSS JOIN (VALUES ('professional'), ('agent')) AS r(name)
WHERE c.slug = 'analytics'
  AND a.status = 'published'
ON CONFLICT DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
