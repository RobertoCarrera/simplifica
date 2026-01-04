-- FIX: Allow users to create mail accounts
-- The previous "FOR ALL" policy might be tricky for INSERT checks depending on when the subquery runs.
-- We explicitly define an INSERT policy.

CREATE POLICY "Users can create mail accounts"
ON public.mail_accounts
FOR INSERT
WITH CHECK (
    -- The user_id being inserted must match the public user linked to the current auth user
    user_id IN (
        SELECT id FROM public.users 
        WHERE auth_user_id = auth.uid()
    )
);

-- Note: The existing "FOR ALL" policy covers UPDATE/DELETE if it works, 
-- but sometimes Postgres separates INSERT WITH CHECK from USING.
