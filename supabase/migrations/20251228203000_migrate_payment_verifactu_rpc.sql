-- Migration to move Payment Integrations and Verifactu Cert History logic to RPCs
-- Replaces unreliable Edge Functions

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Payment Integrations Table
CREATE TABLE IF NOT EXISTS public.payment_integrations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('paypal', 'stripe')),
    credentials_encrypted text,
    webhook_secret_encrypted text,
    webhook_url text,
    is_active boolean DEFAULT true,
    is_sandbox boolean DEFAULT false,
    verification_status text DEFAULT 'pending', -- pending, verified, failed
    last_verified_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(company_id, provider)
);

-- RLS
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can manage payment integrations"
    ON public.payment_integrations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_user_id = auth.uid()
            AND users.company_id = payment_integrations.company_id
            AND users.role IN ('owner', 'admin')
        )
    );

-- RPC: Get Payment Integrations (with masking)
CREATE OR REPLACE FUNCTION public.get_payment_integrations(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_integrations json;
    v_access_allowed boolean;
    v_encryption_key text := 'default-dev-key-change-in-prod'; -- Should ideally be in Vault
BEGIN
    -- Check permissions
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = auth.uid()
        AND company_id = p_company_id
        AND role IN ('owner', 'admin')
    ) INTO v_access_allowed;

    IF NOT v_access_allowed THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Fetch and process
    SELECT json_agg(row_to_json(t))
    INTO v_integrations
    FROM (
        SELECT
            id,
            company_id,
            provider,
            is_active,
            is_sandbox,
            webhook_url,
            last_verified_at,
            verification_status,
            created_at,
            updated_at,
            -- Mask credentials logic
            CASE
                WHEN credentials_encrypted IS NOT NULL THEN
                    (
                        -- Try to decrypt
                        CASE
                            WHEN provider = 'paypal' THEN
                                json_build_object(
                                    'clientId',
                                    CASE 
                                        -- Simple masking: first 4 chars + **** + last 4 chars
                                        WHEN length(
                                            (pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'clientId')
                                        ) > 8 THEN
                                            left((pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'clientId'), 4) || '••••' || right((pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'clientId'), 4)
                                        ELSE '••••••••'
                                    END
                                )
                            WHEN provider = 'stripe' THEN
                                json_build_object(
                                    'publishableKey',
                                    CASE 
                                        WHEN length(
                                            (pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'publishableKey')
                                        ) > 8 THEN
                                            left((pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'publishableKey'), 4) || '••••' || right((pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'publishableKey'), 4)
                                        ELSE '••••••••'
                                    END
                                )
                            ELSE '{}'::json
                        END
                    )
                ELSE '{}'::json
            END as credentials_masked
        FROM public.payment_integrations
        WHERE company_id = p_company_id
    ) t;

    RETURN COALESCE(v_integrations, '[]'::json);
EXCEPTION
    WHEN OTHERS THEN
        -- If decryption fails (old key/format), return empty credentials
        RETURN (
            SELECT json_agg(
                json_build_object(
                    'id', id,
                    'company_id', company_id,
                    'provider', provider,
                    'is_active', is_active,
                    'is_sandbox', is_sandbox,
                    'webhook_url', webhook_url,
                    'last_verified_at', last_verified_at,
                    'verification_status', verification_status,
                    'created_at', created_at,
                    'updated_at', updated_at,
                    'credentials_masked', '{}'::json
                )
            )
            FROM public.payment_integrations
            WHERE company_id = p_company_id
        );
END;
$$;

-- RPC: Save Payment Integration
CREATE OR REPLACE FUNCTION public.save_payment_integration(
    p_company_id uuid,
    p_provider text,
    p_credentials jsonb,
    p_webhook_secret text,
    p_is_sandbox boolean,
    p_is_active boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_integration json;
    v_existing_id uuid;
    v_existing_creds_enc text;
    v_new_creds_enc text;
    v_new_secret_enc text;
    v_encryption_key text := 'default-dev-key-change-in-prod';
    v_access_allowed boolean;
    v_merged_creds jsonb;
BEGIN
    -- Check permissions
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = auth.uid()
        AND company_id = p_company_id
        AND role IN ('owner', 'admin')
    ) INTO v_access_allowed;

    IF NOT v_access_allowed THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Validate provider
    IF p_provider NOT IN ('paypal', 'stripe') THEN
        RAISE EXCEPTION 'Invalid provider';
    END IF;

    -- Get existing
    SELECT id, credentials_encrypted INTO v_existing_id, v_existing_creds_enc
    FROM public.payment_integrations
    WHERE company_id = p_company_id AND provider = p_provider;

    -- Handle credentials merging
    IF p_credentials IS NOT NULL AND p_credentials != '{}'::jsonb THEN
        v_merged_creds := p_credentials;
        -- If partial update logic needed, implement here. For now, we assume full credential set or overwrite
        -- Encrypt
        v_new_creds_enc := encode(pgp_sym_encrypt(v_merged_creds::text, v_encryption_key), 'base64');
    ELSE
        v_new_creds_enc := v_existing_creds_enc;
    END IF;

    -- Encrypt webhook secret if provided
    IF p_webhook_secret IS NOT NULL THEN
        v_new_secret_enc := encode(pgp_sym_encrypt(p_webhook_secret, v_encryption_key), 'base64');
    END IF;

    -- Upsert
    INSERT INTO public.payment_integrations (
        company_id, provider, credentials_encrypted, webhook_secret_encrypted, 
        is_sandbox, is_active, updated_at
    )
    VALUES (
        p_company_id, p_provider, v_new_creds_enc, 
        COALESCE(v_new_secret_enc, (SELECT webhook_secret_encrypted FROM public.payment_integrations WHERE company_id = p_company_id AND provider = p_provider)),
        COALESCE(p_is_sandbox, false), COALESCE(p_is_active, true), now()
    )
    ON CONFLICT (company_id, provider) DO UPDATE
    SET
        credentials_encrypted = EXCLUDED.credentials_encrypted,
        webhook_secret_encrypted = COALESCE(EXCLUDED.webhook_secret_encrypted, payment_integrations.webhook_secret_encrypted),
        is_sandbox = COALESCE(p_is_sandbox, payment_integrations.is_sandbox),
        is_active = COALESCE(p_is_active, payment_integrations.is_active),
        updated_at = now()
    RETURNING row_to_json(payment_integrations.*) INTO v_integration;

    -- Return masked version (reuse get logic implicitly via simple construction)
    -- Actually, just return the id and basic fields to avoid decryption complexity here
    RETURN json_build_object(
        'id', v_integration->>'id',
        'company_id', v_integration->>'company_id',
        'provider', v_integration->>'provider',
        'is_active', (v_integration->>'is_active')::boolean,
        'is_sandbox', (v_integration->>'is_sandbox')::boolean,
        'updated_at', v_integration->>'updated_at'
    );
END;
$$;

-- RPC: Delete Payment Integration
CREATE OR REPLACE FUNCTION public.delete_payment_integration(p_company_id uuid, p_provider text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_access_allowed boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = auth.uid()
        AND company_id = p_company_id
        AND role IN ('owner', 'admin')
    ) INTO v_access_allowed;

    IF NOT v_access_allowed THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    DELETE FROM public.payment_integrations
    WHERE company_id = p_company_id AND provider = p_provider;

    RETURN FOUND;
END;
$$;


-- Verifactu Cert History RPC
-- Combines settings and history into one call
CREATE OR REPLACE FUNCTION public.get_verifactu_cert_status(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settings jsonb;
    v_history jsonb;
    v_access_allowed boolean;
BEGIN
    -- Permission check
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = auth.uid()
        AND company_id = p_company_id
        AND role IN ('owner', 'admin')
    ) INTO v_access_allowed;

    IF NOT v_access_allowed THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Fetch Settings
    SELECT jsonb_build_object(
        'software_code', COALESCE(software_code, ''),
        'issuer_nif', COALESCE(issuer_nif, ''),
        'environment', COALESCE(environment, 'pre'),
        'configured', (cert_pem_enc IS NOT NULL AND key_pem_enc IS NOT NULL),
        'mode', CASE WHEN (cert_pem_enc IS NOT NULL AND key_pem_enc IS NOT NULL) THEN 'encrypted' ELSE 'none' END
    )
    INTO v_settings
    FROM public.verifactu_settings
    WHERE company_id = p_company_id;

    IF v_settings IS NULL THEN
        v_settings := jsonb_build_object(
            'software_code', '',
            'issuer_nif', '',
            'environment', 'pre',
            'configured', false,
            'mode', 'none'
        );
    END IF;

    -- Fetch History
    SELECT jsonb_agg(
        jsonb_build_object(
            'version', version,
            'stored_at', stored_at,
            'rotated_by', rotated_by,
            'integrity_hash', integrity_hash,
            'notes', notes,
            'cert_len', CASE WHEN cert_pem_enc IS NOT NULL THEN length(cert_pem_enc) ELSE NULL END,
            'key_len', CASE WHEN key_pem_enc IS NOT NULL THEN length(key_pem_enc) ELSE NULL END,
            'pass_present', (key_pass_enc IS NOT NULL)
        ) ORDER BY version DESC
    )
    INTO v_history
    FROM public.verifactu_cert_history
    WHERE company_id = p_company_id;

    RETURN json_build_object(
        'ok', true,
        'settings', v_settings,
        'history', COALESCE(v_history, '[]'::jsonb)
    );
END;
$$;
