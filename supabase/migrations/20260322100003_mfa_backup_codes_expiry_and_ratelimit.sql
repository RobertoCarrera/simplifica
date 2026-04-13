-- Fix #13: Add expiry support and brute-force protection to MFA backup codes.
-- Backup codes now expire after 1 year (regeneration resets expiry).
-- A per-user attempt counter (max 10 within 15 minutes) prevents brute force.

-- 1. Add expires_at column (backfill existing codes with 1-year expiry)
ALTER TABLE public.mfa_backup_codes
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + INTERVAL '1 year');

UPDATE public.mfa_backup_codes
  SET expires_at = created_at + INTERVAL '1 year'
  WHERE expires_at IS NULL;

-- 2. Attempt counter table for backup code verification rate limiting
CREATE TABLE IF NOT EXISTS public.mfa_backup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  attempted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_backup_attempts_user_time
  ON public.mfa_backup_attempts (user_id, attempted_at);

ALTER TABLE public.mfa_backup_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own attempts"
  ON public.mfa_backup_attempts FOR INSERT
  WITH CHECK (
    user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Users can view own attempts"
  ON public.mfa_backup_attempts FOR SELECT
  USING (
    user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- 3. Replace generate function to include expiry
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
    v_code := upper(substring(encode(gen_random_bytes(5), 'hex') FROM 1 FOR 8));
    v_codes := v_codes || v_code;
    INSERT INTO public.mfa_backup_codes (user_id, code_hash, expires_at)
    VALUES (v_user_id, crypt(v_code, gen_salt('bf')), now() + INTERVAL '1 year');
  END LOOP;

  RETURN v_codes;
END;
$$;

-- 4. Replace verify function with expiry check + rate limiting (max 10 attempts per 15 min)
CREATE OR REPLACE FUNCTION public.verify_mfa_backup_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_backup_id uuid;
  v_attempt_count int;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v_user_id IS NULL THEN RETURN false; END IF;

  -- Rate limit: max 10 attempts in the last 15 minutes
  SELECT COUNT(*) INTO v_attempt_count
  FROM public.mfa_backup_attempts
  WHERE user_id = v_user_id
    AND attempted_at > now() - INTERVAL '15 minutes';

  IF v_attempt_count >= 10 THEN
    RAISE EXCEPTION 'Too many backup code attempts. Please wait before trying again.';
  END IF;

  -- Record this attempt
  INSERT INTO public.mfa_backup_attempts (user_id) VALUES (v_user_id);

  -- Find valid, unused, non-expired code matching the hash
  SELECT id INTO v_backup_id
  FROM public.mfa_backup_codes
  WHERE user_id = v_user_id
    AND used_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
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
