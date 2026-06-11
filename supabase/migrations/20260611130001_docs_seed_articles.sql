-- Migration: Seed initial docs_articles
-- Description: Inserts ~28 "Cómo..." articles covering every core module
-- of the CRM, plus the transversal "Primeros pasos" and "Mi cuenta" sections.
-- All articles are created with status='published' and published_at=now() so
-- they show up immediately. content_html is left NULL — the frontend
-- renders markdown on the client with marked + DOMPurify.
--
-- Visibility is set via docs_article_roles; one row per (article, role).
-- Roles: super_admin, owner, admin, supervisor, member, professional,
-- agent, marketer. (The schema in 20260611120000_docs_schema.sql accepts
-- any text in the role column; we use the role names from app_roles.)
--
-- Idempotent: ON CONFLICT (slug) DO NOTHING. Re-seeding requires manual
-- truncate or update.
--
-- Author: Roberto (Simplifica)

BEGIN;

-- Helper CTE values so we can reference the same role-list inline.
-- Using a single WITH ... INSERT statement keeps it readable.

-- =========================================================================
-- 1. PRIMEROS PASOS (visible to: super_admin, owner, admin, supervisor,
--    member, professional, agent, marketer — i.e. everyone authenticated)
-- =========================================================================
INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES
  (
    'crear-tu-cuenta',
    'Cómo crear tu cuenta en Simplifica',
    'Da de alta tu cuenta personal y tu empresa en menos de 2 minutos.',
    $md$# Cómo crear tu cuenta en Simplifica

Crear tu cuenta es el primer paso para empezar a trabajar con Simplifica. Solo necesitas un email y una contraseña.

## Pasos

1. Ve a la página de registro desde la landing principal.
2. Introduce tu **nombre**, **email** y una **contraseña** segura (mínimo 8 caracteres).
3. Confirma el email haciendo clic en el enlace que te enviaremos.
4. Al volver, el sistema te pedirá el **nombre de tu empresa** — esto crea tu primer *workspace*.

## Ejemplo

> Si tu peluquería se llama *La Tijera de Oro*, escribe exactamente ese nombre. Luego podrás cambiarlo desde **Ajustes → Empresa**.

## Siguiente paso

Una vez dentro, el asistente te guiará para **invitar a tu equipo** y **configurar tu disponibilidad horaria**.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'primeros-pasos'),
    'published', NULL, 1, now()
  ),
  (
    'configurar-tu-empresa',
    'Cómo configurar los datos de tu empresa',
    'Logo, dirección fiscal, moneda, IVA y datos de contacto.',
    $md$# Cómo configurar los datos de tu empresa

Antes de emitir tu primera factura conviene tener los datos fiscales bien configurados. Aparecerán automáticamente en presupuestos y facturas.

## Pasos

1. Ve a **Ajustes → Empresa**.
2. Rellena los campos obligatorios: *Razón social*, *NIF/CIF*, *dirección fiscal* y *código postal*.
3. Sube tu **logo** (PNG o JPG, máx. 2 MB). Se mostrará en la cabecera de las facturas.
4. Selecciona tu **moneda por defecto** (EUR por defecto) y el **IVA general**.

## Ejemplo

> Empresa: *Estética Ana S.L.* · NIF: *B12345678* · IVA: *21%*. Tras guardar, ve a **Ajustes → Series de facturación** para crear tu primera serie.

## Consejo

Si trabajas con **varias empresas**, repite el proceso desde el selector de empresa en la esquina superior derecha.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'primeros-pasos'),
    'published', NULL, 2, now()
  ),
  (
    'invitar-a-tu-equipo',
    'Cómo invitar a un nuevo miembro al equipo',
    'Añade compañeros y asígnales un rol con los permisos adecuados.',
    $md$# Cómo invitar a un nuevo miembro al equipo

Trabajar en equipo en Simplifica es sencillo: cada persona invita con su email y elige su rol.

## Pasos

1. Ve a **Equipo → Miembros**.
2. Pulsa el botón **+ Invitar miembro**.
3. Escribe el email y elige el rol adecuado.
4. Pulsa **Enviar invitación**. El nuevo miembro recibirá un email para crear su contraseña.

## Roles disponibles

- **owner**: acceso total, gestión de facturación.
- **admin**: gestiona equipo, agenda y configuración.
- **supervisor**: ve todo el equipo, pero no edita la empresa.
- **professional** / **agent**: gestiona su agenda y sus clientes.
- **member** / **marketer**: solo lectura o acceso parcial según configuración.

## Ejemplo

> Invitas a *maria@esteticaana.com* como **professional**. María verá solo su agenda y los clientes que tenga asignados, nunca la facturación global.

## Consejo

Puedes **re-asignar el rol** en cualquier momento desde la ficha del miembro.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'primeros-pasos'),
    'published', NULL, 3, now()
  ),
  (
    'tour-por-el-dashboard',
    'Tour por el dashboard: lo primero que verás al entrar',
    'Conoce las secciones principales y dónde encontrar cada cosa.',
    $md$# Tour por el dashboard

Cuando entras a Simplifica, lo primero que ves es el **dashboard**. Es tu centro de control diario.

## Secciones principales

- **Agenda de hoy**: tus citas de hoy, con acceso directo a cada ficha de cliente.
- **Tareas pendientes**: seguimientos y recordatorios que has programado.
- **Resumen mensual**: ingresos, reservas y nuevos clientes del mes en curso.
- **Accesos rápidos**: atajos a *Crear cliente*, *Nueva cita*, *Nuevo presupuesto*.

## Ejemplo

> Son las 9 de la mañana. Abres Simplifica y, sin buscar, ves: "3 citas hoy, 1 presupuesto pendiente de firmar, 2 nuevas reservas online esta semana".

## Consejo

Puedes **reorganizar los widgets** arrastrándolos desde el icono de la esquina superior derecha de cada uno.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'primeros-pasos'),
    'published', NULL, 4, now()
  ),
  (
    'atajos-de-teclado',
    'Atajos de teclado para trabajar más rápido',
    'Combina teclas para crear clientes, citas y presupuestos sin tocar el ratón.',
    $md$# Atajos de teclado

Simplifica incluye atajos de teclado en las pantallas principales. Funcionan en cualquier parte de la app.

## Atajos globales

- `c` — Abrir el buscador de **c**lientes.
- `n` — Crear un evento en la age**n**da.
- `p` — Crear un nuevo **p**resupuesto.
- `?` — Mostrar todos los atajos disponibles.

## Dentro de la agenda

- `j` / `k` — Moverse al evento siguiente / anterior.
- `Enter` — Abrir el evento seleccionado.
- `Esc` — Cerrar el panel de detalle.

## Ejemplo

> Quieres crear un presupuesto rápido: pulsa `p` desde cualquier pantalla, escribe el nombre del cliente y los productos, y `Cmd + Enter` para enviarlo al cliente.

## Consejo

Los atajos son **case-insensitive**: `N` y `n` funcionan igual.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'primeros-pasos'),
    'published', NULL, 5, now()
  );


-- =========================================================================
-- 2. CLIENTES (visible to: super_admin, owner, admin, supervisor, member)
-- =========================================================================
INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES
  (
    'crear-un-cliente-nuevo',
    'Cómo crear un cliente nuevo',
    'Da de alta un cliente manualmente con sus datos de contacto.',
    $md$# Cómo crear un cliente nuevo

Puedes dar de alta un cliente desde cualquier pantalla con el atajo `c` o desde el menú **Clientes → Nuevo cliente**.

## Pasos

1. Pulsa **+ Nuevo cliente** (o `c`).
2. Rellena al menos **nombre** y **teléfono o email** (al menos uno de los dos es obligatorio).
3. Opcional: añade dirección, etiquetas y notas internas.
4. Pulsa **Guardar**. El cliente aparece en la lista general.

## Ejemplo

> Estás al teléfono con Laura y quieres apuntarla rápido: pulsas `c`, escribes "Laura Pérez · 600 123 456" y `Enter`. Listo, ya puedes crear una cita para ella.

## Consejo

Las **etiquetas** (color) te permiten segmentar: *VIP*, *Nuevo*, *Moroso*, etc. Luego podrás filtrar la lista por etiqueta.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'clientes'),
    'published', NULL, 1, now()
  ),
  (
    'importar-clientes-desde-csv',
    'Cómo importar clientes desde un CSV',
    'Migración masiva desde otra herramienta en un solo paso.',
    $md$# Cómo importar clientes desde un CSV

Si vienes de otra herramienta (Excel, hoja de cálculo, otro CRM) puedes traer todos tus clientes de golpe mediante un CSV.

## Pasos

1. Ve a **Clientes → Importar CSV**.
2. Descarga la **plantilla** para ver el formato esperado.
3. Sube tu CSV respetando las columnas: *nombre*, *email*, *teléfono*, *etiquetas* (separadas por `;`).
4. Pulsa **Previsualizar** para revisar los datos antes de confirmar.
5. Pulsa **Importar**. Recibirás un email con el resumen.

## Ejemplo

> Tienes 1.200 clientes en un Excel. Exportas a CSV, lo subes y en 30 segundos tienes los 1.200 dados de alta. Los duplicados (mismo email) se omiten automáticamente.

## Consejo

La primera fila de tu CSV debe ser la **cabecera**. Si no la pones, la importación fallará.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'clientes'),
    'published', NULL, 2, now()
  ),
  (
    'editar-o-archivar-un-cliente',
    'Cómo editar o archivar un cliente',
    'Mantén tu base de datos limpia: corrige datos y archiva los inactivos.',
    $md$# Cómo editar o archivar un cliente

La ficha de un cliente se puede editar en cualquier momento. Y cuando alguien deja de venir, **archívalo** en vez de borrarlo: mantienes el histórico de citas y facturas.

## Pasos

1. Busca al cliente desde el buscador (`c`).
2. Pulsa en su ficha y luego en **Editar** (icono lápiz).
3. Cambia lo que necesites y **Guardar**.
4. Para archivar: pulsa el menú `⋮` y elige **Archivar cliente**.

## Ejemplo

> María se cambió de ciudad. La editas, le pones la etiqueta *Inactivo* y la archivas. Si vuelve en 2 años, la recuperas desde **Clientes → Archivados**.

## Consejo

**Nunca borres** un cliente con facturas emitidas: perderías el histórico fiscal. Mejor archiva.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'clientes'),
    'published', NULL, 3, now()
  ),
  (
    'segmentar-clientes-con-etiquetas',
    'Cómo segmentar clientes con etiquetas',
    'Filtra tu lista por etiqueta para campañas, seguimientos o análisis.',
    $md$# Cómo segmentar clientes con etiquetas

Las **etiquetas** son la forma más rápida de agrupar clientes. Una etiqueta es un nombre corto con un color (por ejemplo *VIP* en rojo, *Nuevo* en verde).

## Pasos

1. Abre la ficha de un cliente.
2. En el campo **Etiquetas**, escribe el nombre y pulsa `Enter` (o elige una existente).
3. Asigna varias etiquetas si tiene sentido.
4. Para filtrar la lista: ve a **Clientes** y pulsa una etiqueta en la barra lateral.

## Ejemplo

> Quieres enviar un mensaje de "Feliz Navidad" solo a tus clientes VIP. Filtra por *VIP*, selecciona todos (`Cmd+A`) y exporta a CSV con sus emails. Ya tienes la lista para tu herramienta de email marketing.

## Consejo

Crea una **convención de nombres** (empezar por mayúscula, sin espacios) para que la lista de etiquetas se mantenga ordenada.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'clientes'),
    'published', NULL, 4, now()
  );


-- =========================================================================
-- 3. AGENDA (visible to: super_admin, owner, admin, supervisor, member,
--    professional, agent)
-- =========================================================================
INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES
  (
    'crear-un-evento-en-la-agenda',
    'Cómo crear un evento en la agenda',
    'Añade una cita manual con cliente, duración, servicio y notas.',
    $md$# Cómo crear un evento en la agenda

Un *evento* es cualquier bloque con hora de inicio y fin en tu agenda: una cita, un bloqueo, un recordatorio.

## Pasos

1. Ve a **Agenda** y haz clic en el hueco donde quieres el evento, o pulsa `n`.
2. Elige el **tipo**: *Cita con cliente* / *Bloqueo* / *Recordatorio*.
3. Selecciona el **cliente** (obligatorio solo para citas).
4. Define **hora inicio**, **duración** y opcionalmente **servicio**.
5. Añade **notas internas** si necesitas (solo las ve tu equipo).
6. Pulsa **Guardar**.

## Ejemplo

> Quieres apuntar una coloración de 90 minutos con Laura mañana a las 11:00. Clic en la cuadícula de las 11:00, eliges *Cita con cliente*, escribes "Laura", eliges *Coloración*, y guardar. Aparece en tu agenda y en la de Laura.

## Consejo

Arrastra el evento en la agenda para **cambiar la hora** sin abrirlo.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'agenda'),
    'published', NULL, 1, now()
  ),
  (
    'configurar-tu-disponibilidad-horaria',
    'Cómo configurar tu disponibilidad horaria',
    'Define los días y horas en que aceptas citas, y cuándo no.',
    $md$# Cómo configurar tu disponibilidad horaria

Tu *disponibilidad* es el horario en que la agenda permite crear citas. Por defecto, tu horario de trabajo es de lunes a viernes de 9:00 a 18:00, pero puedes personalizarlo.

## Pasos

1. Ve a **Agenda → Ajustes → Disponibilidad**.
2. Para cada día de la semana, marca los **tramos horarios** en que atiendes.
3. Añade **bloqueos recurrentes** (por ejemplo, comida de 14:00 a 15:00).
4. Pulsa **Guardar**.

## Ejemplo

> Eres autónomo y atiendes solo los martes y jueves de 16:00 a 20:00, y los sábados de 10:00 a 14:00. Configuras esos tramos y dejas el resto vacío. Tu link público de reservas solo mostrará huecos en esos horarios.

## Consejo

Si tienes **varias ubicaciones**, define una disponibilidad distinta por ubicación.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'agenda'),
    'published', NULL, 2, now()
  ),
  (
    'sincronizar-con-google-calendar',
    'Cómo sincronizar tu agenda con Google Calendar',
    'Visualiza tus citas de Simplifica en Google Calendar y viceversa.',
    $md$# Cómo sincronizar con Google Calendar

La sincronización bidireccional con Google Calendar evita duplicidades: cualquier cambio en Simplifica se refleja en Google, y al revés.

## Pasos

1. Ve a **Ajustes → Integraciones → Google Calendar**.
2. Pulsa **Conectar con Google** y autoriza la cuenta.
3. Elige si quieres sincronizar **solo lectura** (enviamos a Google) o **bidireccional**.
4. Selecciona los **calendarios** de Google con los que sincronizar.
5. Pulsa **Guardar**.

## Ejemplo

> Conectas tu *Google Calendar personal*. Tus citas de Simplifica aparecen como eventos en tu Google, y si añadís algo a tu Google (una comida, por ejemplo), Simplifica lo respeta y no lo cuenta como hueco disponible.

## Consejo

La sincronización se actualiza cada 5 minutos. Si necesitas refrescar manualmente, pulsa el icono ⟳ en la esquina superior derecha de la agenda.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'agenda'),
    'published', NULL, 3, now()
  ),
  (
    'gestionar-citas-reprogramar-y-cancelar',
    'Cómo reprogramar o cancelar una cita',
    'Mueve citas a otra hora o cancélalas avisando al cliente automáticamente.',
    $md$# Cómo reprogramar o cancelar una cita

Las citas cambian. Aquí verás cómo moverlas o cancelarlas sin perder el contexto ni dejar al cliente sin aviso.

## Pasos para reprogramar

1. Abre la cita.
2. Cambia la **fecha u hora** desde los selectores.
3. Pulsa **Guardar**. Si tenías activado el envío de notificaciones, el cliente recibe un email con la nueva hora.

## Pasos para cancelar

1. Abre la cita.
2. Pulsa **Cancelar cita** (icono papelera).
3. Elige el **motivo** (se incluirá en el email al cliente).
4. Confirma. La cita queda registrada como cancelada, no se borra.

## Ejemplo

> Laura avisa que no puede venir a las 18:00. Abres su cita, la mueves a mañana a la misma hora, y le llega un email: *"Tu cita se ha movido al jueves 12 a las 18:00"*.

## Consejo

Activa la **política de cancelación** en *Ajustes → Agenda* para recordar al cliente las condiciones al cancelar.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'agenda'),
    'published', NULL, 4, now()
  );


-- =========================================================================
-- 4. RESERVAS (visible to: super_admin, owner, admin, supervisor, member,
--    professional, agent)
-- =========================================================================
INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES
  (
    'crear-un-tipo-de-reserva',
    'Cómo crear un tipo de reserva para tu web',
    'Define los servicios que tus clientes pueden reservar online.',
    $md$# Cómo crear un tipo de reserva

Un *tipo de reserva* es un servicio que ofreces online (por ejemplo: "Corte de pelo - 30 min"). Tus clientes lo eligen desde tu página pública y eligen un hueco libre.

## Pasos

1. Ve a **Reservas → Tipos de reserva**.
2. Pulsa **+ Nuevo tipo de reserva**.
3. Define **nombre**, **duración**, **precio** (opcional) y **color** identificativo.
4. Elige a qué **profesionales** se puede asignar.
5. Pulsa **Guardar y publicar**.

## Ejemplo

> Creas "Corte caballero - 30 min - 15 €" y "Coloración - 90 min - 60 €". Ambos son públicos en tu link. Cuando alguien reserva, aparece directamente en la agenda del profesional elegido.

## Consejo

Si un servicio requiere **señal**, marca la opción *Pedir señal al reservar*. El cliente paga una parte al reservar y el resto al llegar.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'reservas'),
    'published', NULL, 1, now()
  ),
  (
    'compartir-tu-link-de-reservas',
    'Cómo compartir tu link público de reservas',
    'URL única que puedes pegar en tu web, Instagram o WhatsApp.',
    $md$# Cómo compartir tu link público de reservas

Cada empresa tiene un **link público** donde los clientes ven tus tipos de reserva y eligen hueco, sin necesidad de登录.

## Pasos

1. Ve a **Reservas → Mi link público**.
2. Copia el link generado.
3. Personaliza el **slug** si quieres algo más memorable (por ejemplo: *tu-peluqueria*).
4. Comparte el link donde quieras: web, Instagram bio, WhatsApp Business, Google Business Profile.

## Ejemplo

> Tu link es `https://reservas.simplificacrm.es/tu-peluqueria`. Lo pegas en la bio de Instagram con el texto "Reserva tu cita aquí 👇". Las reservas llegan solas, sin que tengas que contestar mensajes.

## Consejo

Activa las **preguntas previas** (por ejemplo, "¿Es la primera vez?") para que el cliente llegue con la información que necesitas.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'reservas'),
    'published', NULL, 2, now()
  ),
  (
    'gestionar-reservas-recibidas',
    'Cómo gestionar las reservas que recibes',
    'Aprueba, rechaza o reasigna reservas desde un solo panel.',
    $md$# Cómo gestionar las reservas recibidas

Todas las reservas online caen en un panel unificado. Aquí ves su estado y las gestionas en bloque.

## Pasos

1. Ve a **Reservas → Bandeja de entrada**.
2. Verás las reservas con tres estados: *Pendientes* / *Confirmadas* / *Canceladas*.
3. Para cada reserva puedes: **Confirmar**, **Reasignar profesional**, **Cancelar** o **Marcar como no-show**.
4. Las acciones masivas te dejan confirmar o cancelar varias a la vez.

## Ejemplo

> El lunes por la mañana tienes 8 reservas pendientes del fin de semana. Las confirmas todas de golpe, reasignas una a otra profesional porque la titular está de baja, y queda todo en un minuto.

## Consejo

Configura la **confirmación automática** en *Ajustes → Reservas* si no necesitas validar cada reserva manualmente.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'reservas'),
    'published', NULL, 3, now()
  );


-- =========================================================================
-- 5. PRESUPUESTOS (visible to: super_admin, owner, admin, supervisor, member)
-- =========================================================================
INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES
  (
    'crear-un-presupuesto-paso-a-paso',
    'Cómo crear un presupuesto paso a paso',
    'Cliente, líneas, totales, IVA y envío por email en menos de 2 minutos.',
    $md$# Cómo crear un presupuesto paso a paso

Un **presupuesto** es un documento que envías a un cliente con el detalle de servicios/productos y su precio. Cuando el cliente lo acepta, lo conviertes en factura con un clic.

## Pasos

1. Pulsa `p` o ve a **Presupuestos → + Nuevo**.
2. Elige el **cliente** (o créalo nuevo en el momento).
3. Añade **líneas**: busca un producto/servicio existente o escribe uno nuevo con cantidad y precio.
4. Verifica el **IVA** aplicado (por defecto el de tu empresa).
5. Añade **notas para el cliente** si quieres (vencimiento, condiciones, etc.).
6. Pulsa **Guardar y enviar** para mandarlo por email, o **Solo guardar** si lo entregas en mano.

## Ejemplo

> Presupuesto para la boda de María: 5 líneas (peluquería + maquillaje + 2 pruebas + desplazamiento), IVA 21%, total 850 €. Lo guardas y le llega un email con un PDF adjunto y un botón *Aceptar presupuesto*.

## Consejo

Activa las **plantillas de presupuesto** para los servicios más habituales. Ahorras tecleo y reduces errores.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'presupuestos'),
    'published', NULL, 1, now()
  ),
  (
    'estados-de-un-presupuesto',
    'Los estados de un presupuesto y qué significan',
    'Borrador, enviado, aceptado, rechazado, facturado: el ciclo de vida completo.',
    $md$# Los estados de un presupuesto

Un presupuesto pasa por varios estados a lo largo de su vida. Conocerlos te ayuda a saber en qué punto está cada oportunidad.

## Estados

- **Borrador**: lo estás escribiendo, no se ha enviado.
- **Enviado**: ya está en el email del cliente, esperando respuesta.
- **Aceptado**: el cliente ha pulsado el botón *Aceptar* desde su email. Listo para facturar.
- **Rechazado**: el cliente lo ha rechazado (puede incluir motivo).
- **Vencido**: ha pasado la fecha de validez sin respuesta.
- **Facturado**: ya lo has convertido en factura. Se mantiene el enlace.

## Ejemplo

> Tienes 12 presupuestos *Enviados* sin responder. Decides llamar a los 12. Dos aceptan, uno rechaza, y los 9 restantes quedan como *Vencidos* automáticamente al pasar la fecha de validez.

## Consejo

Configura una **fecha de validez** por defecto (por ejemplo 30 días) en *Ajustes → Presupuestos*.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'presupuestos'),
    'published', NULL, 2, now()
  ),
  (
    'convertir-un-presupuesto-en-factura',
    'Cómo convertir un presupuesto aceptado en factura',
    'Un clic para pasar de "oferta" a "factura emitida" sin reescribir nada.',
    $md$# Cómo convertir un presupuesto en factura

Cuando un cliente acepta un presupuesto, solo tienes que convertirlo en factura. Las líneas, cantidades e IVA se copian automáticamente.

## Pasos

1. Abre el presupuesto en estado *Aceptado*.
2. Pulsa **Convertir en factura**.
3. Elige la **serie de facturación** y la **fecha de emisión**.
4. Revisa que los datos del cliente son correctos (especialmente la razón social y el NIF).
5. Pulsa **Generar factura**. La factura queda emitida y el presupuesto pasa a estado *Facturado*.

## Ejemplo

> María ha aceptado el presupuesto de la boda. Pulsas *Convertir en factura*, eliges la serie *F-2026*, fecha de hoy, y la factura se genera con el mismo importe (850 €). Le llega a María por email con su PDF.

## Consejo

Si la factura se paga al contado, márcala como **Pagada** en el mismo paso para que quede registrada en caja.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'presupuestos'),
    'published', NULL, 3, now()
  ),
  (
    'duplicar-un-presupuesto-para-reutilizar',
    'Cómo duplicar un presupuesto para reutilizarlo',
    'Reutiliza la estructura cuando el mismo tipo de trabajo se repite.',
    $md$# Cómo duplicar un presupuesto

Muchos presupuestos se parecen entre sí. En vez de empezar de cero, **duplica** uno que ya tengas y modifica solo lo que cambie.

## Pasos

1. Abre el presupuesto que quieres reutilizar.
2. Pulsa el menú `⋮` y elige **Duplicar**.
3. Aparece un borrador nuevo con todas las líneas copiadas, pero como *Borrador*.
4. Cambia el cliente, las cantidades o lo que necesites.
5. Guarda y envía.

## Ejemplo

> Tienes un presupuesto de "Corte + color" que envías todos los meses a clientas recurrentes. Lo duplicas, cambias el nombre del cliente, ajustas la fecha, y lo envías. 30 segundos en vez de 5 minutos.

## Consejo

Marca los presupuestos que más duplicas como **favoritos** (icono estrella) para tenerlos siempre a mano.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'presupuestos'),
    'published', NULL, 4, now()
  );


-- =========================================================================
-- 6. FACTURAS (visible to: super_admin, owner, admin, supervisor, member)
-- =========================================================================
INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES
  (
    'crear-una-factura-directa',
    'Cómo crear una factura directa sin presupuesto previo',
    'Para trabajos pequeños o clientes de paso: emite y cobra en el momento.',
    $md$# Cómo crear una factura directa

A veces no necesitas un presupuesto previo (un cliente de paso, un trabajo pequeño, etc.). En esos casos, emite la **factura directa** en el momento.

## Pasos

1. Ve a **Facturas → + Nueva factura**.
2. Selecciona el cliente (o *Cliente de contado* si no quieres guardar datos).
3. Añade las **líneas** con descripción, cantidad y precio.
4. Verifica el **IVA** y el **total**.
5. Pulsa **Emitir factura**. Se genera el PDF con número de factura correlativo.

## Ejemplo

> Un cliente entra a comprar un producto de 50 €. Creas factura directa, introduces la línea, emites, y le entregas el PDF por WhatsApp. Número de factura: *F-2026-000123*.

## Consejo

Si cobras en el momento, pulsa **Emitir y cobrar** en el mismo paso y elige el método de pago (efectivo, tarjeta, bizum).
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'facturas'),
    'published', NULL, 1, now()
  ),
  (
    'registrar-un-cobro',
    'Cómo registrar el cobro de una factura',
    'Marca la factura como pagada y registra el método y la fecha.',
    $md$# Cómo registrar el cobro de una factura

Mantener al día los cobros es esencial: te dice exactamente cuánto dinero tienes pendiente y cuándo.

## Pasos

1. Abre la factura.
2. Pulsa **Registrar cobro**.
3. Elige el **método de pago** (transferencia, tarjeta, efectivo, bizum, domiciliación).
4. Introduce la **fecha del cobro** (si es hoy, déjalo en blanco).
5. Opcional: añade el **número de operación** (útil para conciliaciones bancarias).
6. Pulsa **Guardar**. La factura pasa a estado *Pagada*.

## Ejemplo

> El viernes cobras por transferencia 3 facturas pendientes. Abres cada una, registras el cobro con fecha de hoy y método *Transferencia*. Tu listado de pendientes baja a cero en 2 minutos.

## Consejo

Activa la **conciliación bancaria** en *Ajustes → Integraciones* para que Simplifica cruce los movimientos del banco con tus facturas automáticamente.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'facturas'),
    'published', NULL, 2, now()
  ),
  (
    'series-de-facturacion',
    'Cómo crear y usar series de facturación',
    'Separa tus facturas por tipo (general, rectificativas, simplificadas).',
    $md$# Cómo crear y usar series de facturación

Una **serie de facturación** es un prefijo en el número de factura. Te permite separar, por ejemplo, facturas generales de facturas simplificadas (tickets) o de facturas rectificativas.

## Pasos

1. Ve a **Ajustes → Facturación → Series**.
2. Pulsa **+ Nueva serie**.
3. Define el **código** (ej: *F-*, *S-*, *R-* para rectificativas), el **nombre** y el **número inicial**.
4. Marca la serie como **por defecto** si quieres que se use al emitir facturas nuevas.
5. Pulsa **Guardar**.

## Ejemplo

> Tienes dos series: *F-2026* para facturas generales y *S-2026* para tickets simplificados. Al emitir una factura, eliges la serie. La numeración es independiente y correlativa dentro de cada serie.

## Consejo

Usa siempre series **separadas por año** (F-2025, F-2026) para que las búsquedas y la declaración de IVA sean más cómodas.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'facturas'),
    'published', NULL, 3, now()
  );


-- =========================================================================
-- 7. CALENDARIO (visible to: ALL roles)
-- =========================================================================
INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES
  (
    'ver-el-calendario-de-todo-el-equipo',
    'Cómo ver el calendario de todo tu equipo',
    'Visualiza en una sola pantalla las citas de todos los profesionales.',
    $md$# Cómo ver el calendario de todo el equipo

La vista **Calendario del equipo** (icono de cuadrícula en la parte superior de la agenda) te muestra, día a día, qué tiene cita cada miembro de tu equipo.

## Pasos

1. Ve a **Agenda**.
2. En el selector superior, cambia de *Mi agenda* a **Calendario del equipo**.
3. Elige el **rango de fechas** (día, semana, mes).
4. Cada profesional aparece como una **columna** con sus citas.

## Ejemplo

> El lunes a las 9:00 miras el calendario del equipo y ves: Ana tiene 5 citas, María 3, tú 4. Decides mover una de Ana a María porque la primera termina tarde y se solapa con su pausa de comida.

## Consejo

Pasa el ratón por encima de una cita para ver el **detalle rápido** sin abrir la ficha completa.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'calendario'),
    'published', NULL, 1, now()
  ),
  (
    'filtrar-el-calendario-por-profesional-o-servicio',
    'Cómo filtrar el calendario por profesional o servicio',
    'Filtros laterales para ver solo lo que te interesa.',
    $md$# Cómo filtrar el calendario

En la vista del calendario del equipo tienes **filtros laterales** que te dejan ver solo lo que necesitas.

## Pasos

1. Abre la vista **Calendario del equipo**.
2. En la barra lateral izquierda, marca/desmarca los **profesionales** que quieres ver.
3. Marca/desmarca los **tipos de servicio** (corte, color, manicura, etc.).
4. Filtra por **estado de cita** (confirmada, pendiente, cancelada).
5. Los filtros se guardan automáticamente para la próxima vez que entres.

## Ejemplo

> Quieres ver solo las citas de *Coloración* de Ana esta semana. Filtras por *Ana* y por servicio *Coloración*, y el calendario se queda con solo esas citas. Mucho más fácil de revisar.

## Consejo

Usa el **filtro rápido por día**: haz clic en un día de la mini-calendario superior y el calendario principal salta a esa fecha.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'calendario'),
    'published', NULL, 2, now()
  );


-- =========================================================================
-- 8. MI CUENTA Y PERMISOS (visible to: ALL roles)
-- =========================================================================
INSERT INTO public.docs_articles
  (slug, title, summary, content_markdown, category_id, status, author_user_id, sort_in_category, published_at)
VALUES
  (
    'cambiar-tu-contrasena',
    'Cómo cambiar tu contraseña',
    'Actualiza tu contraseña desde tu perfil o resetea si la has olvidado.',
    $md$# Cómo cambiar tu contraseña

Mantener tu contraseña actualizada es importante para la seguridad de tu cuenta.

## Cambiar contraseña (estás dentro de la app)

1. Haz clic en tu **avatar** (esquina superior derecha).
2. Elige **Mi perfil → Seguridad**.
3. Pulsa **Cambiar contraseña**.
4. Escribe tu contraseña actual y la nueva dos veces.
5. Pulsa **Guardar**.

## Resetear contraseña (no puedes entrar)

1. En la pantalla de login, pulsa **¿Olvidaste tu contraseña?**.
2. Escribe tu email. Te enviaremos un enlace.
3. Abre el email y pulsa el enlace. Te llevará a una pantalla para crear la nueva contraseña.

## Ejemplo

> Cada 90 días te llega un recordatorio para cambiar la contraseña. Sigues los pasos, escribes una nueva (mínimo 8 caracteres con números y símbolos), y la app te mantiene la sesión iniciada.

## Consejo

Usa un **gestor de contraseñas** (1Password, Bitwarden, etc.) para no tener que recordar contraseñas complejas.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'cuenta'),
    'published', NULL, 1, now()
  ),
  (
    'activar-la-autenticacion-en-dos-pasos',
    'Cómo activar la autenticación en dos pasos (2FA)',
    'Añade una segunda capa de seguridad con una app autenticadora.',
    $md$# Cómo activar la autenticación en dos pasos (2FA)

El **2FA** añade un segundo factor de seguridad: además de la contraseña, necesitarás un código de 6 dígitos que cambia cada 30 segundos. Aunque alguien robe tu contraseña, no podrá entrar sin tu móvil.

## Pasos

1. Ve a **Mi perfil → Seguridad**.
2. Pulsa **Activar 2FA**.
3. Escanea el **código QR** con tu app autenticadora (Google Authenticator, Authy, 1Password, etc.).
4. Introduce el **código de 6 dígitos** que muestra la app.
5. **Guarda los códigos de recuperación** que te mostramos: te servirán si pierdes el móvil.
6. Pulsa **Activar**.

## Ejemplo

> Activas 2FA con Google Authenticator. A partir de ahora, al iniciar sesión, además de tu contraseña te pide el código de la app. Son 10 segundos más que te ahorran un disgusto enorme.

## Consejo

**Imprime o guarda en un sitio seguro** los códigos de recuperación. Si pierdes el móvil, son la única forma de entrar.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'cuenta'),
    'published', NULL, 2, now()
  ),
  (
    'que-puede-hacer-cada-rol',
    'Qué puede hacer cada rol del equipo',
    'Tabla resumen de permisos: owner, admin, supervisor, professional, etc.',
    $md$# Permisos por rol

Aquí tienes el resumen de qué puede hacer cada rol en Simplifica. Útil para decidir a quién das qué permisos al invitar a un miembro.

## Tabla de permisos

- **super_admin**: acceso global al sistema, gestiona todas las empresas. Reservado al equipo de Simplifica.
- **owner**: dueño de la empresa. Acceso total excepto gestión multi-empresa.
- **admin**: gestiona equipo, configuración, agenda y facturación. No puede borrar la empresa.
- **supervisor**: ve todo el equipo (modo lectura + edición de agenda), pero no toca facturación.
- **member**: gestiona clientes y agenda según su asignación.
- **professional** / **agent**: gestiona su agenda personal y los clientes que tiene asignados.
- **marketer**: acceso a datos agregados y campañas, sin ver fichas individuales de clientes.

## Ejemplo

> Contratas a una recepcionista. Le das rol **member**: puede dar de alta clientes y crear citas, pero no ve la facturación ni puede invitar a más gente al equipo.

## Consejo

Menos permisos = más seguridad. Empieza con el rol más bajo y sube si la persona necesita más.
$md$,
    (SELECT id FROM public.docs_categories WHERE slug = 'cuenta'),
    'published', NULL, 3, now()
  );


-- =========================================================================
-- 9. ROLES PER ARTICLE (docs_article_roles)
-- =========================================================================
-- One row per (article, role) it should be visible to. Articles with no
-- rows in this table are effectively invisible (draft).

-- "Primeros pasos" + "Calendario" + "Mi cuenta" → all authenticated roles
INSERT INTO public.docs_article_roles (article_id, role)
SELECT a.id, r.name
FROM public.docs_articles a
CROSS JOIN (VALUES
    ('super_admin'), ('owner'), ('admin'), ('supervisor'),
    ('member'), ('professional'), ('agent'), ('marketer')
) AS r(name)
WHERE a.slug IN (
    'crear-tu-cuenta',
    'configurar-tu-empresa',
    'invitar-a-tu-equipo',
    'tour-por-el-dashboard',
    'atajos-de-teclado',
    'ver-el-calendario-de-todo-el-equipo',
    'filtrar-el-calendario-por-profesional-o-servicio',
    'cambiar-tu-contrasena',
    'activar-la-autenticacion-en-dos-pasos',
    'que-puede-hacer-cada-rol'
)
ON CONFLICT DO NOTHING;

-- Clientes: super_admin, owner, admin, supervisor, member
INSERT INTO public.docs_article_roles (article_id, role)
SELECT a.id, r.name
FROM public.docs_articles a
CROSS JOIN (VALUES
    ('super_admin'), ('owner'), ('admin'), ('supervisor'), ('member')
) AS r(name)
WHERE a.slug IN (
    'crear-un-cliente-nuevo',
    'importar-clientes-desde-csv',
    'editar-o-archivar-un-cliente',
    'segmentar-clientes-con-etiquetas'
)
ON CONFLICT DO NOTHING;

-- Agenda + Reservas: super_admin, owner, admin, supervisor, member, professional, agent
INSERT INTO public.docs_article_roles (article_id, role)
SELECT a.id, r.name
FROM public.docs_articles a
CROSS JOIN (VALUES
    ('super_admin'), ('owner'), ('admin'), ('supervisor'),
    ('member'), ('professional'), ('agent')
) AS r(name)
WHERE a.slug IN (
    'crear-un-evento-en-la-agenda',
    'configurar-tu-disponibilidad-horaria',
    'sincronizar-con-google-calendar',
    'gestionar-citas-reprogramar-y-cancelar',
    'crear-un-tipo-de-reserva',
    'compartir-tu-link-de-reservas',
    'gestionar-reservas-recibidas'
)
ON CONFLICT DO NOTHING;

-- Presupuestos + Facturas: super_admin, owner, admin, supervisor, member
INSERT INTO public.docs_article_roles (article_id, role)
SELECT a.id, r.name
FROM public.docs_articles a
CROSS JOIN (VALUES
    ('super_admin'), ('owner'), ('admin'), ('supervisor'), ('member')
) AS r(name)
WHERE a.slug IN (
    'crear-un-presupuesto-paso-a-paso',
    'estados-de-un-presupuesto',
    'convertir-un-presupuesto-en-factura',
    'duplicar-un-presupuesto-para-reutilizar',
    'crear-una-factura-directa',
    'registrar-un-cobro',
    'series-de-facturacion'
)
ON CONFLICT DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
