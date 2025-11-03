# VeriFactu module (Supabase)

This folder contains SQL migrations and edge function skeletons to enable a GDPR‑compliant, VeriFactu‑ready invoicing flow.

## What’s included

- Schema `verifactu`
  - `invoice_sequence`: per company/series number reservation + `last_hash`.
  - `invoice_meta`: series/number/hash/status per invoice.
  - `events`: queue to dispatch to AEAT (stub until sandbox is public).
- Helpers
  - `public.current_company_id()` reads `company_id` from JWT claims.
  - `verifactu.get_next_invoice_number()` uses advisory locks to avoid races.
  - `public.finalize_invoice()` RPC: assigns number, computes chained hash, enqueues event, sets invoices.state = `final`.
  - `public.cancel_invoice()` RPC: sets `void` and enqueues event.
- View `verifactu.vw_ledger` for “Libro Registro”.
- RLS policies for `auth` based on `current_company_id()`.
- Edge functions (Deno): `invoices-finalize`, `invoices-cancel`, `verifactu-dispatcher`, `ledger-export`, `invoices-pdf` (stub).

## Apply migrations

1. Ensure your access token includes `company_id` in JWT custom claims.
2. Run the SQL file on your Supabase project (CLI or dashboard SQL editor):
   - `supabase/migrations/verifactu/2025-11-02-verifactu-init.sql`

## Configure Edge Functions

Set environment variables in Supabase:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for admin client)
- `ALLOW_ALL_ORIGINS` or `ALLOWED_ORIGINS`

Deploy functions (names suggested):
- `functions/v1/invoices-finalize`
- `functions/v1/invoices-cancel`
- `functions/v1/verifactu-dispatcher`
- `functions/v1/ledger-export`
- `functions/v1/invoices-pdf` (stub)

## Next steps / TODO

- Extend canonical payload and hash (include tax breakdowns by rate; keep field order stable).
- Implement immutability trigger for `public.invoices` allowing only whitelisted updates after `state='final'`.
- Implement AEAT integration in `verifactu-dispatcher` once sandbox is available (signing, mutual TLS if required, retries).
- Generate QR + PDF template server‑side and store in Supabase Storage (signed URLs for access).
- Add automated tests for concurrent numbering and RLS boundaries.
- Ensure CSRF flow is used from your existing `get-csrf-token` when calling mutating endpoints from the browser.
