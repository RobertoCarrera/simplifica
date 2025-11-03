# Client Quote Response - Deployment Guide

## Edge Function: client-quote-respond

### Purpose
Allows authenticated client users to accept or reject quotes sent to them.

### Security
- Verifies user authentication via Supabase Auth
- Validates client portal access via `client_portal_users` mapping
- Ensures quote belongs to the authenticated client
- Only allows responses on quotes with status `sent` or `viewed`

### Deployment

#### Prerequisites
- Supabase CLI installed: `npm install -g supabase`
- Logged in: `supabase login`

#### Deploy Command
```bash
cd f:\simplifica
supabase functions deploy client-quote-respond --no-verify-jwt
```

Or use the project reference:
```bash
supabase functions deploy client-quote-respond --project-ref ufutyjbqfjrlzkprvyvs --no-verify-jwt
```

### API

**Endpoint**: `https://<project>.supabase.co/functions/v1/client-quote-respond`

**Method**: POST

**Headers**:
- `Authorization: Bearer <user-jwt-token>`
- `Content-Type: application/json`

**Body**:
```json
{
  "id": "quote-uuid",
  "action": "accept" // or "reject"
}
```

**Response Success (200)**:
```json
{
  "success": true,
  "data": {
    "id": "quote-uuid",
    "full_quote_number": "Q-2024-001",
    "title": "Presupuesto para...",
    "status": "accepted", // or "rejected"
    "quote_date": "2024-11-03",
    "valid_until": "2024-11-17",
    "total_amount": 1500.00,
    "items": [...]
  },
  "message": "Presupuesto aceptado correctamente"
}
```

**Response Error (400/401/403/404/500)**:
```json
{
  "error": "Error message"
}
```

### Frontend Integration

The Edge Function is already integrated in:
- **Service**: `src/app/services/client-portal.service.ts` → `respondToQuote(id, action)`
- **Component**: `src/app/components/portal-quote-detail/portal-quote-detail.component.ts`
- **UI**: Accept/Reject buttons with confirmation modal

### Testing

1. **Deploy the function** (see command above)

2. **Create a test quote** in Supabase Dashboard:
   - Go to Table Editor → `quotes`
   - Create a quote with `status = 'sent'`
   - Set `client_id` to a valid client

3. **Create client portal mapping**:
   - Go to Table Editor → `client_portal_users`
   - Insert: `{ company_id, client_id, email, is_active: true }`

4. **Test in app**:
   - Login as client user
   - Navigate to `/portal/presupuestos`
   - Click on the quote
   - Verify Accept/Reject buttons appear
   - Click Accept → should update status to `accepted`

5. **Verify logs** in Supabase Dashboard:
   - Edge Functions → client-quote-respond → Logs
   - Should see successful responses

### Troubleshooting

**Error: "No client portal access found for user"**
- Verify `client_portal_users` mapping exists for the email
- Check `is_active = true`

**Error: "Quote not found or access denied"**
- Verify quote exists with matching `client_id` and `company_id`
- Check RLS policies on `quotes` table

**Error: "Quote cannot be accepted in current status"**
- Quote must be in `sent` or `viewed` status
- Already responded quotes cannot be changed

### Files Created/Modified

1. **Edge Function**: `supabase/edge-functions/client-quote-respond/index.ts`
2. **Deployment copy**: `supabase/functions/client-quote-respond/index.ts`
3. **Service**: `src/app/services/client-portal.service.ts` (added `respondToQuote`)
4. **Component**: Enhanced `portal-quote-detail.component.ts` with Accept/Reject UI

### Next Steps

After deployment:
1. Test the complete flow: Email → Login → Quote Detail → Accept
2. Verify quote status updates in database
3. Test rejection flow
4. Verify UI feedback and error handling
