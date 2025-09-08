-- Migración: mover tags desde la columna `tickets.tags` a la relación `ticket_tag_relations`
-- Requisitos:
--  - Soporta tickets.tags como text[] o JSON/JSONB array of strings
--  - Maneja esquemas con o sin ticket_tags.company_id (multi-tenant)
--  - Crea ticket_tag_relations si falta, y un índice único (ticket_id, tag_id)
--  - Inserta tags faltantes en ticket_tags respetando company_id si existe
--  - Inserta relaciones ticket -> tag sin duplicados
--  - Borra la columna tickets.tags al final

BEGIN;

-- Asegurar que exista la tabla de relaciones (no hace nada si ya existe)
CREATE TABLE IF NOT EXISTS public.ticket_tag_relations (
  ticket_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_tag_relations_unique ON public.ticket_tag_relations(ticket_id, tag_id);

DO $$
DECLARE
  has_tags_col boolean;
  has_tag_company boolean;
  tags_udt text;
  sql_cmd text;
BEGIN
  -- existe columna tickets.tags ?
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'tags'
  ) INTO has_tags_col;

  IF NOT has_tags_col THEN
    RAISE NOTICE 'No existe la columna tickets.tags, nada que migrar.';
    RETURN;
  END IF;

  -- detectar tipo declarado de la columna tags (udt_name: e.g. _text, jsonb)
  SELECT udt_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'tags'
  INTO tags_udt;

  -- existe ticket_tags.company_id ?
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_tags' AND column_name = 'company_id'
  ) INTO has_tag_company;

  IF has_tag_company THEN
    RAISE NOTICE 'Migrando tags considerando company_id en ticket_tags... (tags column udt: %)', tags_udt;

    IF tags_udt = '_text' OR tags_udt = 'text[]' THEN
      sql_cmd := $sql$
      WITH extracted AS (
        SELECT id AS ticket_id, company_id, unnest(tags) AS tag
        FROM public.tickets
        WHERE tags IS NOT NULL
      ),
      ensure_tags AS (
        SELECT DISTINCT tag AS name, company_id FROM extracted
      ),
      inserted AS (
        INSERT INTO public.ticket_tags (name, color, description, created_at, updated_at, company_id)
        SELECT name, '#cccccc', NULL, now(), now(), company_id
        FROM ensure_tags et
        WHERE NOT EXISTS (
          SELECT 1 FROM public.ticket_tags tt
          WHERE tt.name = et.name AND (
            (et.company_id IS NULL AND tt.company_id IS NULL) OR (et.company_id IS NOT NULL AND tt.company_id = et.company_id)
          )
        )
        RETURNING id, name, company_id
      ),
      all_tags AS (
        SELECT id, name, company_id FROM public.ticket_tags
        WHERE name IN (SELECT name FROM ensure_tags)
      )
      INSERT INTO public.ticket_tag_relations (ticket_id, tag_id, created_at)
      SELECT e.ticket_id, at.id, now()
      FROM extracted e
      JOIN all_tags at ON at.name = e.tag AND ((at.company_id IS NULL AND e.company_id IS NULL) OR at.company_id = e.company_id)
      ON CONFLICT DO NOTHING;
      $sql$;
    ELSE
      -- asumir JSON / JSONB u otro formato textual que pueda parsearse a jsonb
      sql_cmd := $sql$
      WITH extracted AS (
        SELECT id AS ticket_id, company_id, jsonb_array_elements_text(tags::jsonb) AS tag
        FROM public.tickets
        WHERE tags IS NOT NULL
      ),
      ensure_tags AS (
        SELECT DISTINCT tag AS name, company_id FROM extracted
      ),
      inserted AS (
        INSERT INTO public.ticket_tags (name, color, description, created_at, updated_at, company_id)
        SELECT name, '#cccccc', NULL, now(), now(), company_id
        FROM ensure_tags et
        WHERE NOT EXISTS (
          SELECT 1 FROM public.ticket_tags tt
          WHERE tt.name = et.name AND (
            (et.company_id IS NULL AND tt.company_id IS NULL) OR (et.company_id IS NOT NULL AND tt.company_id = et.company_id)
          )
        )
        RETURNING id, name, company_id
      ),
      all_tags AS (
        SELECT id, name, company_id FROM public.ticket_tags
        WHERE name IN (SELECT name FROM ensure_tags)
      )
      INSERT INTO public.ticket_tag_relations (ticket_id, tag_id, created_at)
      SELECT e.ticket_id, at.id, now()
      FROM extracted e
      JOIN all_tags at ON at.name = e.tag AND ((at.company_id IS NULL AND e.company_id IS NULL) OR at.company_id = e.company_id)
      ON CONFLICT DO NOTHING;
      $sql$;
    END IF;

    EXECUTE sql_cmd;

  ELSE
    RAISE NOTICE 'Migrando tags sin company_id en ticket_tags (esquema global)... (tags column udt: %)', tags_udt;

    IF tags_udt = '_text' OR tags_udt = 'text[]' THEN
      sql_cmd := $sql$
      WITH extracted AS (
        SELECT id AS ticket_id, unnest(tags) AS tag
        FROM public.tickets
        WHERE tags IS NOT NULL
      ),
      ensure_tags AS (
        SELECT DISTINCT tag AS name FROM extracted
      ),
      inserted AS (
        INSERT INTO public.ticket_tags (name, color, description, created_at, updated_at)
        SELECT name, '#cccccc', NULL, now(), now()
        FROM ensure_tags et
        WHERE NOT EXISTS (
          SELECT 1 FROM public.ticket_tags tt WHERE tt.name = et.name
        )
        RETURNING id, name
      ),
      all_tags AS (
        SELECT id, name FROM public.ticket_tags
        WHERE name IN (SELECT name FROM ensure_tags)
      )
      INSERT INTO public.ticket_tag_relations (ticket_id, tag_id, created_at)
      SELECT e.ticket_id, at.id, now()
      FROM extracted e
      JOIN all_tags at ON at.name = e.tag
      ON CONFLICT DO NOTHING;
      $sql$;
    ELSE
      sql_cmd := $sql$
      WITH extracted AS (
        SELECT id AS ticket_id, jsonb_array_elements_text(tags::jsonb) AS tag
        FROM public.tickets
        WHERE tags IS NOT NULL
      ),
      ensure_tags AS (
        SELECT DISTINCT tag AS name FROM extracted
      ),
      inserted AS (
        INSERT INTO public.ticket_tags (name, color, description, created_at, updated_at)
        SELECT name, '#cccccc', NULL, now(), now()
        FROM ensure_tags et
        WHERE NOT EXISTS (
          SELECT 1 FROM public.ticket_tags tt WHERE tt.name = et.name
        )
        RETURNING id, name
      ),
      all_tags AS (
        SELECT id, name FROM public.ticket_tags
        WHERE name IN (SELECT name FROM ensure_tags)
      )
      INSERT INTO public.ticket_tag_relations (ticket_id, tag_id, created_at)
      SELECT e.ticket_id, at.id, now()
      FROM extracted e
      JOIN all_tags at ON at.name = e.tag
      ON CONFLICT DO NOTHING;
      $sql$;
    END IF;

    EXECUTE sql_cmd;

  END IF;

  -- Finalmente borrar la columna tags (si sigue existiendo)
  IF EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'tags'
  ) THEN
    ALTER TABLE public.tickets DROP COLUMN tags;
    RAISE NOTICE 'Columna tickets.tags eliminada.';
  ELSE
    RAISE NOTICE 'Columna tickets.tags ya fue eliminada por otra operación.';
  END IF;

END$$;

COMMIT;

-- Nota: ejecute este script con un rol con permisos de escritura (admin) en la base.
-- Es idempotente: si no existe la columna tags no hace nada; si ya existen relaciones, evita duplicados.
