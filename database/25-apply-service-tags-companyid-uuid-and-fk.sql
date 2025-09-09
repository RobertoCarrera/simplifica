-- 25-apply-service-tags-companyid-uuid-and-fk.sql
-- Aplica el cambio de tipo de company_id a UUID y crea la FK hacia companies(id).
-- DEBE ejecutarse sólo después de verificar los resultados de 23 y 24.

BEGIN;

-- 1) Asegurarse de que company_id_new existe y tiene valores válidos para todas las filas si se quiere migrar todo
DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing FROM service_tags WHERE company_id_new IS NULL AND company_id IS NOT NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Hay % filas con company_id no convertidos; revisar script 23 antes de continuar', missing;
  END IF;
END $$;

-- 2) Renombrar columnas: preservar original por seguridad
ALTER TABLE service_tags RENAME COLUMN company_id TO company_id_old;
ALTER TABLE service_tags RENAME COLUMN company_id_new TO company_id;

-- 3) Ajustar not null si corresponde
ALTER TABLE service_tags ALTER COLUMN company_id SET NOT NULL;

-- 4) Re-crear constraint FK para apuntar a companies(id)
ALTER TABLE service_tags DROP CONSTRAINT IF EXISTS service_tags_company_id_fkey;
ALTER TABLE service_tags ADD CONSTRAINT service_tags_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

COMMIT;

-- NOTAS:
-- - Si prefieres no forzar NOT NULL, omite la línea que establece NOT NULL.
-- - Este script renombra la columna antigua a company_id_old para mantener copia de seguridad local.
-- - Después de confirmar, puedes borrar company_id_old con: ALTER TABLE service_tags DROP COLUMN company_id_old;
