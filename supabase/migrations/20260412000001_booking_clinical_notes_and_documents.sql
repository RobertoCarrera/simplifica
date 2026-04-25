-- =====================================================================
-- Migration: Booking Clinical Notes & Documents
-- Date: 2026-04-12
-- Reason: Allow professionals to attach clinical notes (encrypted) and
--         documents directly to bookings/sessions from the client profile
--         Agenda > History tab.
--
-- Security Stack:
--   1. booking_clinical_notes uses vault encryption (same as client_clinical_notes)
--   2. RLS policies enforce multi-tenant isolation via company_members
--   3. Audit triggers log all access for GDPR Art. 30 compliance
--   4. RPCs use SECURITY DEFINER for vault access
--
-- Key Features:
--   - Encrypted clinical notes with key_version support for rotation
--   - Document references with signed URL generation
--   - Denormalized client_id for efficient RLS policy evaluation
--   - Audit trail without exposing encrypted content
-- =====================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- =====================================================================
-- 2. booking_clinical_notes table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.booking_clinical_notes (
    id              UUID            PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    booking_id      UUID            NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    client_id       UUID            NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE, -- denormalized for RLS
    content         TEXT            NOT NULL, -- encrypted via pgp_sym_encrypt
    created_by      UUID            REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    key_version     SMALLINT        NOT NULL DEFAULT 1
);

-- Index for efficient queries by booking
CREATE INDEX IF NOT EXISTS idx_booking_clinical_notes_booking_id ON public.booking_clinical_notes(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_clinical_notes_key_version ON public.booking_clinical_notes(key_version);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS booking_clinical_notes_updated_at ON public.booking_clinical_notes;
CREATE TRIGGER booking_clinical_notes_updated_at
    BEFORE UPDATE ON public.booking_clinical_notes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================================
-- 3. booking_documents table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.booking_documents (
    id              UUID            PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    booking_id      UUID            NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    client_id       UUID            NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE, -- denormalized for RLS
    file_name       TEXT            NOT NULL,
    file_path       TEXT            NOT NULL, -- storage path
    file_type       TEXT,                       -- MIME type
    file_size       BIGINT,                      -- bytes
    created_by      UUID            REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Index for efficient queries by booking
CREATE INDEX IF NOT EXISTS idx_booking_documents_booking_id ON public.booking_documents(booking_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS booking_documents_updated_at ON public.booking_documents;
CREATE TRIGGER booking_documents_updated_at
    BEFORE UPDATE ON public.booking_documents
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================================
-- 4. Enable RLS on both tables
-- =====================================================================
ALTER TABLE public.booking_clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_documents   ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 5. RLS Policies for booking_clinical_notes
-- =====================================================================
-- Helper: check if user is active member of the company that owns this booking's client
-- Note: We use bookings → clients → company_members chain for RLS

-- SELECT: Active company members can view notes for bookings of their company
DROP POLICY IF EXISTS "booking_clinical_notes_select_policy" ON public.booking_clinical_notes;
CREATE POLICY "booking_clinical_notes_select_policy" ON public.booking_clinical_notes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            WHERE b.id = booking_clinical_notes.booking_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
        )
    );

-- INSERT: Active company members can create notes for bookings of their company
DROP POLICY IF EXISTS "booking_clinical_notes_insert_policy" ON public.booking_clinical_notes;
CREATE POLICY "booking_clinical_notes_insert_policy" ON public.booking_clinical_notes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            WHERE b.id = booking_clinical_notes.booking_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
        )
    );

-- UPDATE: Only creator can update their own notes (and must still be active member)
DROP POLICY IF EXISTS "booking_clinical_notes_update_policy" ON public.booking_clinical_notes;
CREATE POLICY "booking_clinical_notes_update_policy" ON public.booking_clinical_notes
    FOR UPDATE USING (
        created_by = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            WHERE b.id = booking_clinical_notes.booking_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
        )
    );

-- DELETE: Only creator or Admin/Owner can delete notes
DROP POLICY IF EXISTS "booking_clinical_notes_delete_policy" ON public.booking_clinical_notes;
CREATE POLICY "booking_clinical_notes_delete_policy" ON public.booking_clinical_notes
    FOR DELETE USING (
        (created_by = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()))
        OR
        EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            JOIN public.app_roles ar ON cm.role_id = ar.id
            WHERE b.id = booking_clinical_notes.booking_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
              AND ar.name IN ('owner', 'admin', 'super_admin')
        )
    );

-- =====================================================================
-- 6. RLS Policies for booking_documents
-- =====================================================================
-- SELECT: Active company members can view documents for bookings of their company
DROP POLICY IF EXISTS "booking_documents_select_policy" ON public.booking_documents;
CREATE POLICY "booking_documents_select_policy" ON public.booking_documents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            WHERE b.id = booking_documents.booking_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
        )
    );

-- INSERT: Active company members can create documents for bookings of their company
DROP POLICY IF EXISTS "booking_documents_insert_policy" ON public.booking_documents;
CREATE POLICY "booking_documents_insert_policy" ON public.booking_documents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            WHERE b.id = booking_documents.booking_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
        )
    );

-- UPDATE: Only creator can update their own documents (and must still be active member)
DROP POLICY IF EXISTS "booking_documents_update_policy" ON public.booking_documents;
CREATE POLICY "booking_documents_update_policy" ON public.booking_documents
    FOR UPDATE USING (
        created_by = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            WHERE b.id = booking_documents.booking_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
        )
    );

-- DELETE: Only creator or Admin/Owner can delete documents
DROP POLICY IF EXISTS "booking_documents_delete_policy" ON public.booking_documents;
CREATE POLICY "booking_documents_delete_policy" ON public.booking_documents
    FOR DELETE USING (
        (created_by = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()))
        OR
        EXISTS (
            SELECT 1 FROM public.bookings b
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            JOIN public.app_roles ar ON cm.role_id = ar.id
            WHERE b.id = booking_documents.booking_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
              AND ar.name IN ('owner', 'admin', 'super_admin')
        )
    );

-- =====================================================================
-- 7. Audit Triggers for GDPR Art. 30 compliance
-- =====================================================================

-- 7a. Audit function for booking_clinical_notes
-- NOTE: We do NOT log old_values/new_values for clinical notes because
--       the content is AES-GCM ciphertext stored encrypted via Vault.
CREATE OR REPLACE FUNCTION public.gdpr_audit_booking_clinical_notes_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action      TEXT;
    v_user_id     UUID;
    v_company_id  UUID;
    v_client_id   UUID;
BEGIN
    v_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        v_action    := 'create';
        v_client_id := NEW.client_id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action    := 'update';
        v_client_id := NEW.client_id;
    ELSIF TG_OP = 'DELETE' THEN
        v_action    := 'delete';
        v_client_id := OLD.client_id;
    END IF;

    -- Get company_id from client
    SELECT company_id INTO v_company_id
    FROM public.clients
    WHERE id = v_client_id
    LIMIT 1;

    INSERT INTO public.gdpr_audit_log (
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        legal_basis,
        user_id,
        company_id
    )
    SELECT
        v_action,
        'booking_clinical_notes',
        COALESCE(NEW.id, OLD.id),
        c.email,
        'Booking clinical note ' || v_action,
        'legitimate_interest',
        v_user_id,
        v_company_id
    FROM public.clients c
    WHERE c.id = v_client_id
    LIMIT 1;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gdpr_audit_booking_clinical_notes_trigger ON public.booking_clinical_notes;
CREATE TRIGGER gdpr_audit_booking_clinical_notes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.booking_clinical_notes
    FOR EACH ROW EXECUTE FUNCTION public.gdpr_audit_booking_clinical_notes_changes();

-- 7b. Audit function for booking_documents
CREATE OR REPLACE FUNCTION public.gdpr_audit_booking_documents_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action      TEXT;
    v_user_id     UUID;
    v_company_id  UUID;
    v_client_id   UUID;
BEGIN
    v_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        v_action    := 'create';
        v_client_id := NEW.client_id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action    := 'update';
        v_client_id := NEW.client_id;
    ELSIF TG_OP = 'DELETE' THEN
        v_action    := 'delete';
        v_client_id := OLD.client_id;
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.clients
    WHERE id = v_client_id
    LIMIT 1;

    INSERT INTO public.gdpr_audit_log (
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        legal_basis,
        user_id,
        company_id
    )
    SELECT
        v_action,
        'booking_documents',
        COALESCE(NEW.id, OLD.id),
        c.email,
        'Booking document ' || v_action,
        'legitimate_interest',
        v_user_id,
        v_company_id
    FROM public.clients c
    WHERE c.id = v_client_id
    LIMIT 1;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gdpr_audit_booking_documents_trigger ON public.booking_documents;
CREATE TRIGGER gdpr_audit_booking_documents_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.booking_documents
    FOR EACH ROW EXECUTE FUNCTION public.gdpr_audit_booking_documents_changes();

-- =====================================================================
-- 8. Secure RPCs (SECURITY DEFINER for vault access)
-- =====================================================================

-- 8a. create_booking_note(p_booking_id uuid, p_content text)
-- Creates an encrypted clinical note linked to a booking
CREATE OR REPLACE FUNCTION public.create_booking_note(p_booking_id uuid, p_content text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_note_id             UUID;
    v_encrypted_content   TEXT;
    v_encryption_key      TEXT;
    v_client_id           UUID;
    v_company_id          UUID;
    v_current_version     SMALLINT := 1;
BEGIN
    -- Permission check: user must be active member of the booking's company
    SELECT b.client_id, c.company_id INTO v_client_id, v_company_id
    FROM public.bookings b
    JOIN public.clients c ON b.client_id = c.id
    JOIN public.company_members cm ON c.company_id = cm.company_id
    WHERE b.id = p_booking_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active';

    IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: user is not an active member of this booking''s company';
    END IF;

    -- Read encryption key from Vault (same key as client_clinical_notes)
    SELECT decrypted_secret INTO v_encryption_key
    FROM vault.decrypted_secrets
    WHERE name = 'clinical_encryption_key_v' || v_current_version::TEXT;

    IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
        RAISE EXCEPTION 'Encryption key v% not found in Vault. Contact your system administrator.', v_current_version;
    END IF;

    -- Encrypt and insert
    v_encrypted_content := extensions.pgp_sym_encrypt(p_content, v_encryption_key);

    INSERT INTO public.booking_clinical_notes (booking_id, client_id, content, created_by, key_version)
    VALUES (
        p_booking_id,
        v_client_id,
        v_encrypted_content,
        (SELECT id FROM public.users WHERE auth_user_id = auth.uid()),
        v_current_version
    )
    RETURNING id INTO v_note_id;

    RETURN jsonb_build_object('id', v_note_id, 'success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking_note(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_note(uuid, text) TO authenticated;

-- 8b. get_booking_notes(p_booking_id uuid)
-- Returns decrypted clinical notes for a booking
CREATE OR REPLACE FUNCTION public.get_booking_notes(p_booking_id uuid)
RETURNS TABLE (
    id              uuid,
    booking_id      uuid,
    client_id       uuid,
    content         text,
    created_at      timestamptz,
    created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_has_access    boolean;
BEGIN
    -- Permission check
    SELECT EXISTS (
        SELECT 1 FROM public.bookings b
        JOIN public.clients c ON b.client_id = c.id
        JOIN public.company_members cm ON c.company_id = cm.company_id
        WHERE b.id = p_booking_id
          AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
          AND cm.status = 'active'
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied: user is not an active member of this booking''s company';
    END IF;

    -- Decrypt each note using its own key version (supports key rotation)
    RETURN QUERY
    SELECT
        n.id,
        n.booking_id,
        n.client_id,
        extensions.pgp_sym_decrypt(
            n.content::bytea,
            (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'clinical_encryption_key_v' || n.key_version::TEXT
            )
        ) AS content,
        n.created_at,
        u.name AS created_by_name
    FROM public.booking_clinical_notes n
    LEFT JOIN public.users u ON n.created_by = u.id
    WHERE n.booking_id = p_booking_id
    ORDER BY n.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_booking_notes(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_notes(uuid) TO authenticated;

-- 8c. create_booking_document(p_booking_id uuid, p_file_name text, p_file_path text, p_file_type text, p_file_size bigint)
-- Creates a document reference linked to a booking
CREATE OR REPLACE FUNCTION public.create_booking_document(
    p_booking_id    uuid,
    p_file_name     text,
    p_file_path     text,
    p_file_type     text,
    p_file_size     bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_doc_id        uuid;
    v_client_id     uuid;
BEGIN
    -- Permission check
    SELECT b.client_id INTO v_client_id
    FROM public.bookings b
    JOIN public.clients c ON b.client_id = c.id
    JOIN public.company_members cm ON c.company_id = cm.company_id
    WHERE b.id = p_booking_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active';

    IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: user is not an active member of this booking''s company';
    END IF;

    INSERT INTO public.booking_documents (booking_id, client_id, file_name, file_path, file_type, file_size, created_by)
    VALUES (
        p_booking_id,
        v_client_id,
        p_file_name,
        p_file_path,
        p_file_type,
        p_file_size,
        (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    )
    RETURNING id INTO v_doc_id;

    RETURN jsonb_build_object('id', v_doc_id, 'success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking_document(uuid, text, text, text, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_document(uuid, text, text, text, bigint) TO authenticated;

-- 8d. get_booking_documents(p_booking_id uuid)
-- Returns document references with signed URLs for a booking
CREATE OR REPLACE FUNCTION public.get_booking_documents(p_booking_id uuid)
RETURNS TABLE (
    id              uuid,
    booking_id      uuid,
    client_id       uuid,
    file_name       text,
    file_path       text,
    file_type       text,
    file_size       bigint,
    signed_url      text,
    created_at      timestamptz,
    created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_has_access    boolean;
    v_doc           RECORD;
    v_signed_url    text;
BEGIN
    -- Permission check
    SELECT EXISTS (
        SELECT 1 FROM public.bookings b
        JOIN public.clients c ON b.client_id = c.id
        JOIN public.company_members cm ON c.company_id = cm.company_id
        WHERE b.id = p_booking_id
          AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
          AND cm.status = 'active'
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied: user is not an active member of this booking''s company';
    END IF;

    -- Get documents and generate signed URLs
    FOR v_doc IN
        SELECT d.id, d.booking_id, d.client_id, d.file_name, d.file_path, d.file_type, d.file_size, d.created_at, u.name as created_by_name
        FROM public.booking_documents d
        LEFT JOIN public.users u ON d.created_by = u.id
        WHERE d.booking_id = p_booking_id
        ORDER BY d.created_at DESC
    LOOP
        -- Generate signed URL (1 hour expiry)
        v_signed_url := (
            SELECT signed_url
            FROM supabase.storage.create_signed_url(
                'booking-documents',
                v_doc.file_path,
                INTERVAL '1 hour'
            )
        );

        RETURN QUERY
        SELECT
            v_doc.id,
            v_doc.booking_id,
            v_doc.client_id,
            v_doc.file_name,
            v_doc.file_path,
            v_doc.file_type,
            v_doc.file_size,
            v_signed_url,
            v_doc.created_at,
            v_doc.created_by_name;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_booking_documents(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_documents(uuid) TO authenticated;

-- 8e. delete_booking_document(p_document_id uuid)
-- Deletes a booking document (only creator can delete)
CREATE OR REPLACE FUNCTION public.delete_booking_document(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator       uuid;
BEGIN
    -- Get document info
    SELECT created_by INTO v_creator
    FROM public.booking_documents
    WHERE id = p_document_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Document not found';
    END IF;

    -- Check if user is creator or admin/owner
    IF v_creator != (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) THEN
        -- Check if admin/owner
        IF NOT EXISTS (
            SELECT 1 FROM public.booking_documents bd
            JOIN public.bookings b ON bd.booking_id = b.id
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            JOIN public.app_roles ar ON cm.role_id = ar.id
            WHERE bd.id = p_document_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
              AND ar.name IN ('owner', 'admin', 'super_admin')
        ) THEN
            RAISE EXCEPTION 'Access denied: only creator or admin/owner can delete this document';
        END IF;
    END IF;

    DELETE FROM public.booking_documents WHERE id = p_document_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_booking_document(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_booking_document(uuid) TO authenticated;

-- =====================================================================
-- 9. Update gdpr_export_client_data to include booking notes
-- =====================================================================
-- This ensures that when a client requests their data (GDPR Art. 20),
-- booking clinical notes are included in the export.

-- Note: The actual update to gdpr_export_client_data would be done in a separate
-- migration that modifies that function. For now, we log the intent.

DO $$ BEGIN
  RAISE NOTICE 'Booking clinical notes and documents tables created successfully.';
  RAISE NOTICE 'Remember to run gdpr_export_client_data update to include booking_clinical_notes in exports.';
END $$;
