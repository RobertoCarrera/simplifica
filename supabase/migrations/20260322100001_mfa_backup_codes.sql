-- MFA backup codes for account recovery when TOTP device is lost.
-- Codes are stored hashed (pgcrypto) and can only be used once.

CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS: users can only see their own backup codes
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backup codes"
  ON public.mfa_backup_codes FOR SELECT
  USING (
    user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Users can update own backup codes"
  ON public.mfa_backup_codes FOR UPDATE
  USING (
    user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Function to generate backup codes (returns plaintext codes, stores hashes)
CREATE OR REPLACE FUNCTION public.generate_mfa_backup_codes(p_count int DEFAULT 8)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_codes text[] := '{}';
  v_code text;
  i int;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Delete existing unused codes
  DELETE FROM public.mfa_backup_codes WHERE user_id = v_user_id AND used_at IS NULL;

  FOR i IN 1..p_count LOOP
    -- Generate 8-char alphanumeric code
    v_code := upper(substring(encode(gen_random_bytes(5), 'hex') from 1 for 8));
    v_codes := v_codes || v_code;

    INSERT INTO public.mfa_backup_codes (user_id, code_hash)
    VALUES (v_user_id, crypt(v_code, gen_salt('bf')));
  END LOOP;

  RETURN v_codes;
END;
$$;

-- Function to verify a backup code (marks as used if valid)
CREATE OR REPLACE FUNCTION public.verify_mfa_backup_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_backup_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v_user_id IS NULL THEN RETURN false; END IF;

  SELECT id INTO v_backup_id
  FROM public.mfa_backup_codes
  WHERE user_id = v_user_id
    AND used_at IS NULL
    AND code_hash = crypt(upper(p_code), code_hash)
  LIMIT 1;

  IF v_backup_id IS NULL THEN RETURN false; END IF;

  UPDATE public.mfa_backup_codes SET used_at = now() WHERE id = v_backup_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_mfa_backup_codes(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_mfa_backup_codes(int) TO authenticated;

REVOKE ALL ON FUNCTION public.verify_mfa_backup_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_mfa_backup_code(text) TO authenticated;
