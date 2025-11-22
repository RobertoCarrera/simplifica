# VeriFactu Dispatcher: Deployment & Scheduling

This guide covers deploying the `verifactu-dispatcher` Edge Function, configuring secrets, and scheduling periodic execution (cron) so invoices are automatically dispatched to AEAT.

---

## Prerequisites

- Supabase CLI installed and authenticated: `supabase login`
- Project ref known (replace YOUR_PROJECT_REF below) or set via `--project-ref`
- `supabase/edge-functions/verifactu-dispatcher/index.ts` exists in this repo

---

## 1) Deploy the function

```bash
cd /f/simplifica
supabase functions deploy verifactu-dispatcher --project-ref YOUR_PROJECT_REF
```

Expected output: `Function deployed successfully`

---

## 2) Configure required secrets

In Supabase Dashboard > Project Settings > API copy the values for URL and service_role key.

Set the following secrets for the function (Dashboard > Edge Functions > verifactu-dispatcher > Settings):

- SUPABASE_URL = https://YOUR_PROJECT_REF.supabase.co
- SUPABASE_SERVICE_ROLE_KEY = your_service_role_key
- ALLOW_ALL_ORIGINS = true
- ALLOWED_ORIGINS = http://localhost:4200,https://YOUR_DOMAIN (optional if ALLOW_ALL_ORIGINS=false)
- VERIFACTU_MAX_ATTEMPTS = 7
- VERIFACTU_BACKOFF = 0,1,5,15,60,180,720  # minutes for attempts 0..n
- VERIFACTU_REJECT_RATE = 0                 # set >0 only for sandbox simulations
- VERIFACTU_MODE = mock                     # 'mock' (default) or 'live'
- VERIFACTU_ENABLE_FALLBACK = false         # set 'true' to use mock if live fails

Alternatively via CLI:

```bash
supabase functions secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  ALLOW_ALL_ORIGINS=true \
  VERIFACTU_MAX_ATTEMPTS=7 \
  VERIFACTU_BACKOFF="0,1,5,15,60,180,720" \
  VERIFACTU_REJECT_RATE=0 \
  VERIFACTU_MODE=mock \
  VERIFACTU_ENABLE_FALLBACK=false \
  --project-ref YOUR_PROJECT_REF --confirm
```

---

## 3) Schedule periodic execution (cron)

Create a schedule to run the dispatcher every 2 minutes:

```bash
supabase functions schedule create verifactu-dispatcher \
  --cron "*/2 * * * *" \
  --project-ref YOUR_PROJECT_REF
```

- Adjust frequency as needed (e.g., every minute: `* * * * *`).
- To list schedules: `supabase functions schedule list --project-ref YOUR_PROJECT_REF`
- To update the schedule, delete and recreate or use the dashboard.

---

## 4) Manual retry endpoint

The dispatcher exposes a safe manual retry action:

- Endpoint: `POST /functions/v1/verifactu-dispatcher`
- Body: `{ "action": "retry", "invoice_id": "<uuid>" }`
- Behavior: Finds the latest rejected event for the invoice and resets it to `pending` without bumping attempts. The scheduled dispatcher will pick it up on the next run.

Example curl (for local check; CORS applies in browser):

```bash
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/verifactu-dispatcher \
  -H "Content-Type: application/json" \
  -d '{"action":"retry","invoice_id":"00000000-0000-0000-0000-000000000000"}'
```

---

## 5) Logs and troubleshooting

Follow logs in real time:

```bash
supabase functions logs verifactu-dispatcher --project-ref YOUR_PROJECT_REF --follow
```

Common gotchas:
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set (dispatcher uses admin client internally)
- CORS: set `ALLOW_ALL_ORIGINS=true` for development, or enumerate domains in `ALLOWED_ORIGINS`
- If events don’t process: verify `verifactu.events` rows with status `pending` and check `attempts`/`sent_at`

---

## 6) Frontend wiring (already included)

- Invoice detail now shows VeriFactu status and latest events
- Actions available:
  - “Actualizar” → refreshes meta and events
  - “Ejecutar dispatcher” → triggers a one-off run
  - “Reintentar envío” → resets the last rejected event to pending

No additional frontend configuration is required beyond setting `edgeFunctionsBaseUrl` in runtime config.

---

Last updated: 2025-11-02
