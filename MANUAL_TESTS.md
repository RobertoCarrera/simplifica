# Manual Security Verification

## 1. Verify RLS Fixes (`payment_integrations` & `item_tags`)

### Prerequisite
Ensure migration `supabase/migrations/20260228100000_fix_critical_rls.sql` is applied.

### Test Case A: `payment_integrations` Isolation
1. **Login as Admin Company A** (e.g., `admin_a@companya.com`).
2. **Fetch Integrations**:
   ```javascript
   const { data } = await supabase.from('payment_integrations').select('*');
   console.log(data);
   ```
3. **Verify**: You should ONLY see integrations where `company_id` matches Company A.
4. **Login as Admin Company B**.
5. **Fetch Integrations**:
   ```javascript
   const { data } = await supabase.from('payment_integrations').select('*');
   ```
6. **Verify**: You should see Company B's integrations, and definitely NOT Company A's.

### Test Case B: `item_tags` Security
1. **Login as Admin Company A**.
2. **Create a Tag**:
   ```javascript
   // Assuming a client with ID 'client_id_a' exists for Company A
   await supabase.from('item_tags').insert({
     tag_id: 'some_global_tag_id',
     record_id: 'client_id_a',
     record_type: 'client',
     company_id: 'company_id_a' // Ensure this matches user's company
   });
   ```
3. **Login as Admin Company B**.
4. **Try to Read Tags**:
   ```javascript
   const { data } = await supabase.from('item_tags').select('*');
   ```
5. **Verify**: The tag created in step 2 must NOT be visible.

## 2. Verify Edge Function Security (`verifactu-dispatcher`)

### Test Case C: IDOR on `retry`
1. **Obtain a JWT** for a user in Company A.
2. **Identify an Invoice ID** belonging to Company B (let's say `invoice_b_123`).
3. **Invoke Function**:
   ```bash
   curl -X POST https://<project>.functions.supabase.co/verifactu-dispatcher \
     -H "Authorization: Bearer <USER_A_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"action": "retry", "invoice_id": "invoice_b_123"}'
   ```
4. **Verify**: The response should be `403 Forbidden` or `404 Invoice not found` (because RLS filters it out for User A). It must NOT return `ok: true`.

### Test Case D: Debug Endpoints Removed
1. **Invoke Debug Action**:
   ```bash
   curl -X POST https://<project>.functions.supabase.co/verifactu-dispatcher \
     -H "Authorization: Bearer <VALID_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"action": "debug-env"}'
   ```
2. **Verify**: The response should NOT contain environment variables. It should likely return nothing interesting or `ok: true` (if it falls through) but without sensitive data, or an error/ignore. (In the code, it falls through to the end if not matched, returning nothing or processing events if pending).
