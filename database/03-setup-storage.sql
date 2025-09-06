-- ==== STORAGE SIMPLE SIN POLICIES COMPLEJAS ====
-- Estrategia: usar file paths con prefijo de company_id
-- y controlar acceso desde el backend/aplicación

-- 1) Función para generar rutas de archivo seguras
CREATE OR REPLACE FUNCTION public.generate_file_path(
  company_uuid uuid,
  file_name text,
  subfolder text DEFAULT 'general'
)
RETURNS text AS $$
BEGIN
  -- Genera: company_id/subfolder/timestamp_filename
  RETURN company_uuid::text || '/' || subfolder || '/' || 
         extract(epoch from now())::bigint || '_' || file_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2) Función para validar que una ruta pertenece a una company
CREATE OR REPLACE FUNCTION public.validate_file_path(
  file_path text,
  company_uuid uuid
)
RETURNS boolean AS $$
BEGIN
  RETURN file_path LIKE (company_uuid::text || '/%');
END;
$$ LANGUAGE plpgsql STABLE;

-- 3) Función para crear registro de attachment de forma segura
CREATE OR REPLACE FUNCTION public.create_attachment(
  p_company_id uuid,
  p_job_id uuid,
  p_file_name text,
  p_file_size integer DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  p_subfolder text DEFAULT 'attachments'
)
RETURNS uuid AS $$
DECLARE
  attachment_id uuid;
  file_path text;
BEGIN
  -- Validar que el job pertenece a la company
  IF NOT EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE id = p_job_id 
    AND company_id = p_company_id 
    AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Job does not belong to company or does not exist';
  END IF;
  
  -- Generar ruta segura
  file_path := public.generate_file_path(p_company_id, p_file_name, p_subfolder);
  
  -- Crear registro
  INSERT INTO public.attachments (
    company_id, job_id, file_name, file_path, file_size, mime_type
  ) VALUES (
    p_company_id, p_job_id, p_file_name, file_path, p_file_size, p_mime_type
  ) RETURNING id INTO attachment_id;
  
  RETURN attachment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Función para obtener attachments de un job (con validación)
CREATE OR REPLACE FUNCTION public.get_job_attachments(
  p_job_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  file_name text,
  file_path text,
  file_size integer,
  mime_type text,
  created_at timestamptz
) AS $$
BEGIN
  -- Si no se especifica company_id, intentar obtenerlo del contexto
  IF p_company_id IS NULL THEN
    p_company_id := public.get_current_company_id();
  END IF;
  
  RETURN QUERY
  SELECT a.id, a.file_name, a.file_path, a.file_size, a.mime_type, a.created_at
  FROM public.attachments a
  JOIN public.jobs j ON j.id = a.job_id
  WHERE a.job_id = p_job_id 
    AND a.deleted_at IS NULL
    AND j.deleted_at IS NULL
    AND (p_company_id IS NULL OR j.company_id = p_company_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5) View para acceso fácil a attachments con validación
CREATE OR REPLACE VIEW public.v_attachments AS
SELECT 
  a.id,
  a.company_id,
  a.job_id,
  a.file_name,
  a.file_path,
  a.file_size,
  a.mime_type,
  a.created_at,
  j.title as job_title,
  c.name as client_name
FROM public.attachments a
JOIN public.jobs j ON j.id = a.job_id AND j.deleted_at IS NULL
JOIN public.clients c ON c.id = j.client_id AND c.deleted_at IS NULL
WHERE a.deleted_at IS NULL
  AND (
    public.get_current_company_id() IS NULL OR 
    a.company_id = public.get_current_company_id()
  );

-- 6) Instrucciones para Storage Bucket
/*
INSTRUCCIONES PARA CONFIGURAR STORAGE:

1. Crear bucket 'attachments' en Supabase Dashboard:
   - Ir a Storage → Create Bucket
   - Name: attachments
   - Public: NO (no marcar como público)
   - Allowed MIME types: dejar vacío (permite todos)

2. NO crear policies complejas en el bucket.
   En su lugar, usar estas estrategias:

   a) UPLOADS: desde tu aplicación Angular:
      - Usar la función generate_file_path() para obtener la ruta
      - Subir archivo a esa ruta usando supabase.storage.from('attachments').upload()
      - Llamar a create_attachment() para crear el registro en BD

   b) DOWNLOADS: desde tu aplicación:
      - Usar supabase.storage.from('attachments').createSignedUrl() para generar URLs temporales
      - O implementar un endpoint que valide permisos y devuelva el archivo

3. Código de ejemplo para Angular (usar en tu servicio):

```typescript
// Upload example
async uploadAttachment(companyId: string, jobId: string, file: File) {
  // 1. Generar ruta segura
  const { data: pathData } = await this.supabase
    .rpc('generate_file_path', {
      company_uuid: companyId,
      file_name: file.name,
      subfolder: 'attachments'
    });

  // 2. Subir archivo
  const { data: uploadData, error: uploadError } = await this.supabase.storage
    .from('attachments')
    .upload(pathData, file);

  if (uploadError) throw uploadError;

  // 3. Crear registro en BD
  const { data: attachmentData } = await this.supabase
    .rpc('create_attachment', {
      p_company_id: companyId,
      p_job_id: jobId,
      p_file_name: file.name,
      p_file_size: file.size,
      p_mime_type: file.type
    });

  return attachmentData;
}

// Download example
async getAttachmentUrl(filePath: string) {
  const { data } = await this.supabase.storage
    .from('attachments')
    .createSignedUrl(filePath, 60 * 5); // 5 minutos

  return data?.signedUrl;
}
```

Esta estrategia es más simple y confiable que las policies complejas.
*/

-- 7) Testing del sistema de attachments
DO $$
DECLARE
  company1_id uuid := '00000000-0000-4000-8000-000000000001';
  job_id uuid;
  attachment_id uuid;
  test_path text;
BEGIN
  -- Establecer contexto
  PERFORM public.set_current_company_context(company1_id);
  
  -- Crear un job de ejemplo
  INSERT INTO public.jobs (company_id, client_id, title, type)
  SELECT company1_id, c.id, 'Test Job', 'service'
  FROM public.clients c 
  WHERE c.company_id = company1_id 
  LIMIT 1
  RETURNING id INTO job_id;
  
  -- Test generar ruta
  test_path := public.generate_file_path(company1_id, 'test-file.pdf');
  
  IF NOT public.validate_file_path(test_path, company1_id) THEN
    RAISE EXCEPTION 'File path validation failed';
  END IF;
  
  -- Test crear attachment
  attachment_id := public.create_attachment(
    company1_id, 
    job_id, 
    'test-document.pdf',
    1024,
    'application/pdf'
  );
  
  IF attachment_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create attachment';
  END IF;
  
  RAISE NOTICE 'Storage system test PASSED! Attachment ID: %', attachment_id;
  
  -- Limpiar
  DELETE FROM public.attachments WHERE id = attachment_id;
  DELETE FROM public.jobs WHERE id = job_id;
END $$;
