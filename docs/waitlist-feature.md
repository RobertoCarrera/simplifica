# Waitlist Feature — Rollout & Testing Guide

> **Version**: 1.0 · **Status**: Implemented (18/18 tasks complete)  
> **Architecture**: RPC-first (PostgreSQL RPCs + minimal Edge Function for SES)  
> **Date**: 2026-03-23

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Database Migrations](#database-migrations)
4. [Rollout Phases](#rollout-phases)
5. [Feature Flags](#feature-flags)
6. [Manual Testing Checklist](#manual-testing-checklist)
7. [E2E Test Scenarios](#e2e-test-scenarios)
8. [Rollback Procedures](#rollback-procedures)
9. [Monitoring & Observability](#monitoring--observability)
10. [Known Limitations & Open Questions](#known-limitations--open-questions)

---

## Overview

The waitlist feature allows businesses to manage overflow demand for fully-booked services with two modes:

| Mode        | Description                                                                                                                              | Client Action                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Active**  | Slot-specific waitlist. When a booking is cancelled, the first waiting client is auto-promoted (or notified to claim).                   | Joins for a specific date/time slot               |
| **Passive** | Service-interest subscription. Client subscribes for any availability. All pending passive subscribers are notified when any slot opens. | Subscribes to a service; claims from notification |

Both modes work together: when a booking is cancelled, active promotion runs first, then passive notifications are sent.

---

## Architecture Summary

```
Booking cancelled
  └→ Angular calls supabase.rpc('promote_waitlist', {...})
       ├→ IF promoted=true: Angular calls send-waitlist-email Edge Function
       ├→ IF notify_instead=true: Angular calls supabase.rpc('notify_waitlist', {...})
       │    └→ Angular calls send-waitlist-email for each email payload
       └→ Angular always calls supabase.rpc('notify_waitlist', { mode: 'passive' })
            └→ Angular calls send-waitlist-email for each email payload
```

**RPCs (PostgreSQL SECURITY DEFINER):**

- `promote_waitlist(p_service_id, p_start_time, p_end_time)` — active mode auto-promotion
- `notify_waitlist(p_service_id, p_start_time, p_end_time, p_mode)` — notification + rate limiting
- `claim_waitlist_spot(p_waitlist_entry_id)` — atomic spot claim with concurrency control

**Edge Functions:**

- `send-waitlist-email` — only SES dispatch, no DB access (new)
- `notify-waitlist` — deprecated thin adapter (calls `notify_waitlist` RPC internally)

**Angular Services:**

- `SupabaseWaitlistService` — all RPC orchestration + email dispatch
- `SupabaseBookingsService` — `deleteBooking()` calls `handleCancellationWaitlist()` on success

---

## Database Migrations

| Migration File                                      | What It Does                                                                                                                                                                      | Phase              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `supabase/migrations/20260324_waitlist_feature.sql` | Base schema: `waitlist` table, `waitlist_status` enum extensions, `waitlist.mode` column, `services`/`company_settings` waitlist columns, `claim_waitlist_spot` RPC, RLS policies | Phase 1 (deployed) |
| `supabase/migrations/20260325_waitlist_rpcs.sql`    | `waitlist_rate_limits` table, `promote_waitlist()` RPC, `notify_waitlist()` RPC                                                                                                   | Phase 2            |

### Applying migrations

```bash
# Local development
supabase db reset

# Production (requires Supabase CLI)
supabase db push

# Manual (psql)
psql $DATABASE_URL < supabase/migrations/20260324_waitlist_feature.sql
psql $DATABASE_URL < supabase/migrations/20260325_waitlist_rpcs.sql
```

---

## Rollout Phases

### Phase 1 — Schema Foundation ✅ (Complete)

- Deployed `20260324_waitlist_feature.sql`
- Angular TypeScript types updated
- `claim_waitlist_spot` RPC available

### Phase 2 — RPCs + Email Adapter ✅ (Ready to deploy)

1. Deploy `20260325_waitlist_rpcs.sql` to production
2. Deploy `send-waitlist-email` Edge Function
3. Deploy updated `notify-waitlist` Edge Function (thin adapter)
4. Update Angular frontend (deploy build)

**Deploy order is important**: DB migration must be applied BEFORE deploying the Angular frontend that calls the new RPCs.

### Phase 3 — Gradual Enablement

1. Enable waitlist per tenant (set `company_settings.waitlist_active_mode = true`)
2. Enable per service (set `services.enable_waitlist = true`)
3. Monitor via Supabase logs and dashboard
4. Escalate to all tenants once stable

### Phase 4 — Cleanup (Future)

- Remove `promote-waitlist` Edge Function (replaced by RPC)
- Remove `claim-waitlist-spot` Edge Function (Angular calls RPC directly)
- Deprecate and eventually remove `notify-waitlist` Edge Function

---

## Feature Flags

The waitlist feature is controlled at two levels:

### Tenant level (company_settings)

| Setting                        | Default | Description                                                |
| ------------------------------ | ------- | ---------------------------------------------------------- |
| `waitlist_active_mode`         | `true`  | Enable active waitlist for the tenant                      |
| `waitlist_passive_mode`        | `true`  | Enable passive waitlist for the tenant                     |
| `waitlist_auto_promote`        | `true`  | Auto-convert active entries to bookings on cancellation    |
| `waitlist_notification_window` | `15`    | Minutes for client to claim a spot (when auto-promote=off) |

### Service level (services)

| Setting                | Default | Description                               |
| ---------------------- | ------- | ----------------------------------------- |
| `enable_waitlist`      | `false` | Enable waitlist for this specific service |
| `active_mode_enabled`  | `true`  | Allow active mode for this service        |
| `passive_mode_enabled` | `true`  | Allow passive mode for this service       |

**Enabling for a new tenant:**

```sql
UPDATE company_settings
SET waitlist_active_mode = true,
    waitlist_passive_mode = true,
    waitlist_auto_promote = true
WHERE company_id = '<tenant_id>';
```

**Enabling for a specific service:**

```sql
UPDATE services
SET enable_waitlist = true,
    active_mode_enabled = true,
    passive_mode_enabled = true
WHERE id = '<service_id>';
```

---

## Manual Testing Checklist

### Pre-flight

- [ ] Migration `20260325_waitlist_rpcs.sql` applied to target environment
- [ ] `send-waitlist-email` Edge Function deployed
- [ ] `notify-waitlist` Edge Function deployed (thin adapter version)
- [ ] AWS SES credentials configured (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_ADDRESS`)
- [ ] Test company settings: `waitlist_active_mode = true`, `waitlist_passive_mode = true`
- [ ] Test service: `enable_waitlist = true`, `active_mode_enabled = true`, `passive_mode_enabled = true`

### Active Mode Flow

- [ ] **Admin UI**: Open Booking Settings → "Lista de Espera" tab. Verify all 4 settings render (active mode, auto-promote, passive mode, notification window).
- [ ] **Service Editor**: Open a service → verify "Lista de Espera" toggle is visible. Toggle it on/off and save.
- [ ] **Client**: Book a fully-booked slot → verify "Apuntarse a lista de espera" button appears.
- [ ] **Client**: Click "Apuntarse a lista de espera" → verify entry appears in `/waitlist` sidebar section "Mis turnos activos".
- [ ] **Admin cancels booking**: Cancel the booking → verify:
  - [ ] `promote_waitlist` RPC called (check Supabase logs)
  - [ ] Waitlist entry status changes from `pending` → `converting`
  - [ ] In-app notification created for the client (`type = 'waitlist_promoted'`)
  - [ ] Email received by client (check SES dashboard or test inbox)
- [ ] **Auto-promote disabled**: Disable `waitlist_auto_promote` in settings. Cancel a booking → verify:
  - [ ] `promote_waitlist` returns `notify_instead: true`
  - [ ] `notify_waitlist` (active mode) is called instead
  - [ ] Entry status changes `pending` → `notified`
  - [ ] Client receives notification with a claim window

### Passive Mode Flow

- [ ] **Client sidebar**: Navigate to `/waitlist` → verify "Notifícame" section shows services with `passive_mode_enabled = true`.
- [ ] **Subscribe**: Click "Notificarme" for a service → verify entry with `mode=passive` appears.
- [ ] **Admin cancels booking**: Cancel any booking for that service → verify:
  - [ ] `notify_waitlist(mode='passive')` called
  - [ ] Passive entry status changes `pending` → `notified`
  - [ ] In-app notification of type `waitlist_passive_notified` created
  - [ ] Email received by passive subscriber
- [ ] **Rate limit**: Within 24h, cancel another booking → verify passive subscriber does NOT receive a second notification.
- [ ] **Rate limit bypass**: Manually set `last_notified_at = NOW() - INTERVAL '25 hours'` in `waitlist_rate_limits` → cancel a booking → verify notification is sent again.

### Claim Flow

- [ ] **Notified state**: Client receives notification → navigate to `/waitlist` → verify entry appears in "Plazas disponibles para ti" section.
- [ ] **Successful claim**: Click "Confirmar reserva" → verify booking is created and entry is removed from the list.
- [ ] **spot_taken error**: Simulate two clients claiming simultaneously → second client sees "Alguien reclamó la plaza justo antes que tú" message.
- [ ] **window_expired error**: Set `notified_at = NOW() - INTERVAL '2 days'` for an entry → client tries to claim → verify "Tu ventana de reclamación ha caducado" message and entry auto-removes after 3s.
- [ ] **already_booked error**: Client already has a booking for the same service/slot → trying to claim shows "Ya tienes una reserva para este servicio en ese horario".

### Backward Compatibility

- [ ] **notify-waitlist adapter**: Call `supabase.functions.invoke('notify-waitlist', body)` directly → verify it returns `{ success: true, notified: boolean, notified_count: number, waitlist_id: string|null }`.
- [ ] **Legacy response shape**: `notified` is a boolean (original format), `notified_count` is the integer count.

### Settings UI

- [ ] Booking settings "Lista de Espera" tab loads without errors.
- [ ] Toggling "Modo Activo" OFF → auto-promote sub-toggle disappears.
- [ ] Toggling "Auto-promoción" OFF → "Ventana de reclamación" selector appears.
- [ ] Changing notification window to 30 min → saves to DB and reloads correctly.
- [ ] Network error on save → toast error shown + settings reverted to previous values.

---

## E2E Test Scenarios

### Scenario 1: Full active mode flow (Playwright)

```
Given a fully-booked service with waitlist enabled and active_mode_enabled=true
When a client joins the active waitlist
And an admin cancels the booked appointment
Then the first waiting client receives an in-app notification (type: waitlist_promoted)
And the client receives an email with subject "¡Tu plaza está lista!"
And the waitlist entry status is "converting"
And no other clients are notified
```

### Scenario 2: Passive subscription + notification (Playwright)

```
Given a service with passive_mode_enabled=true
When a client subscribes to the passive waitlist
And an admin cancels a booking for that service
Then the passive subscriber receives an in-app notification (type: waitlist_passive_notified)
And the subscriber receives an email with subject "¡Plaza disponible!"
And no second notification is sent within 24 hours
```

### Scenario 3: Rate limiting validation (Playwright)

```
Given a passive subscriber for Service A
And the subscriber was notified < 24 hours ago
When an admin cancels another booking for Service A
Then no new notification is sent
And the waitlist_rate_limits record is not updated
```

### Scenario 4: Concurrent claim protection (k6 load test)

```
Given 100 clients subscribed to the same active waitlist entry
When all 100 call claim_waitlist_spot simultaneously
Then exactly 1 booking is created
And 99 clients receive spot_taken error
And no duplicate bookings are created
```

Running the load test:

```bash
# k6 script (see scripts/k6-waitlist-concurrency.js for full script)
k6 run scripts/k6-waitlist-concurrency.js
```

### Scenario 5: Deprecated adapter backward compatibility (Postman/curl)

```
POST /functions/v1/notify-waitlist
Authorization: Bearer <admin_jwt>
{
  "service_id": "<uuid>",
  "start_time": "2026-04-01T10:00:00Z",
  "end_time": "2026-04-01T11:00:00Z",
  "mode": "passive"
}

Expected response:
{
  "success": true,
  "notified": true,
  "notified_count": N,
  "waitlist_id": "<uuid-or-null>"
}
```

---

## Rollback Procedures

### Phase 2 Rollback (RPCs + Rate Limiting)

If `20260325_waitlist_rpcs.sql` needs to be rolled back:

```sql
-- Step 1: Remove RPCs
DROP FUNCTION IF EXISTS public.promote_waitlist(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.notify_waitlist(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

-- Step 2: Remove rate limits table (NO data loss — waitlist entries are unaffected)
DROP TABLE IF EXISTS public.waitlist_rate_limits;

-- Step 3: Redeploy the original notify-waitlist Edge Function
-- (restore from git tag: git checkout <pre-rpc-tag> supabase/functions/notify-waitlist/index.ts)
-- supabase functions deploy notify-waitlist

-- NOTE: The Angular frontend will fail gracefully if RPCs are missing.
-- handleCancellationWaitlist() uses try/catch for each step.
-- Booking cancellations still work — waitlist handling just silently fails.
```

### Phase 1 Rollback (Full schema rollback)

See rollback section in `supabase/migrations/20260324_waitlist_feature.sql` (bottom of file).

> ⚠️ WARNING: Phase 1 rollback removes all waitlist data. Only use if absolutely necessary.

### Angular-only Rollback

If the Angular build needs to be rolled back without touching the DB:

1. Redeploy the previous Angular build artifact
2. The RPCs and DB schema remain in place (no data impact)
3. Waitlist entries already in the DB are preserved for when the feature is re-enabled

---

## Monitoring & Observability

### Supabase Logs

Monitor these patterns in the Supabase Edge Function logs:

| Pattern                                                       | What it means                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `promote_waitlist: RPC error:`                                | RPC call failed — check DB connectivity                       |
| `notifyWaitlist: RPC returned error field: permission_denied` | Non-admin user triggered cancellation flow                    |
| `dispatchWaitlistEmail: Edge Function error:`                 | SES dispatch failed (non-fatal, booking flow continues)       |
| `send-waitlist-email: SES error:`                             | AWS SES rejection — check credentials and sender verification |

### Key Metrics to Watch

- Rate of `spot_taken` errors → indicates concurrency pressure
- `send-waitlist-email` error rate → indicates SES delivery issues
- `waitlist_rate_limits` table size → cleanup indexes prevent unbounded growth

### SQL Queries for Monitoring

```sql
-- Active waitlist entries by service
SELECT service_id, COUNT(*) as pending_count
FROM public.waitlist
WHERE status = 'pending' AND mode = 'active'
GROUP BY service_id
ORDER BY pending_count DESC;

-- Recent promotions (last 24h)
SELECT COUNT(*) as promotions
FROM public.waitlist
WHERE status = 'converting' AND updated_at > NOW() - INTERVAL '24 hours';

-- Rate limit table: clients notified in last 24h
SELECT COUNT(DISTINCT user_id) as notified_clients
FROM public.waitlist_rate_limits
WHERE last_notified_at > NOW() - INTERVAL '24 hours';

-- Failed claims by error type (from notifications or custom logging)
SELECT data->>'error_code' as error_code, COUNT(*) as count
FROM public.notifications
WHERE type = 'waitlist_claim_failed'
GROUP BY 1;
```

---

## Known Limitations & Open Questions

### Open Questions

1. **Passive mode scope**: Should `notify_waitlist(mode='passive')` notify ALL pending passive entries or only the first N? Current implementation notifies ALL (unbounded). For high-traffic services, this could generate many emails per cancellation.

2. **Notification window display**: When `waitlist_auto_promote=false`, the `waitlist_notification_window` value is stored in minutes. The client's `/waitlist` page currently does not display the countdown timer — clients must act quickly before the window expires.

3. **`users.full_name` vs `users.name`**: Verified to be `full_name` via `supabase-db.types.ts`. If the schema ever changes, update the RPCs.

### Known Limitations

- **Email-only for external notifications**: In-app notifications are always created. External email is only sent via `send-waitlist-email` Edge Function. If the Edge Function is down, in-app notifications still work.
- **No SMS/push notifications**: Only email + in-app supported in this phase.
- **Passive entries use epoch sentinel**: `start_time/end_time = 1970-01-01T00:00:00Z` for passive entries (no specific slot). This may look odd in some views.
- **T11 (WaitlistToggleComponent)**: Already integrated into `SupabaseServicesComponent.onWaitlistToggle()`. The component is fully wired. Active/passive sub-toggles are propagated to `formData` on change.

### Spec Deviations

| Spec                                       | Deviation                                  | Reason                                                                                        |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| EF-1, EF-2, EF-3 (original Edge Functions) | Replaced by PostgreSQL RPCs (Design Rev 3) | DB-only operations belong in DB; RPCs are consistent with project's 147-RPC migration pattern |
| `notify-waitlist` Edge Function            | Kept as deprecated thin adapter            | Backward compat for existing callers; planned removal in Phase 4                              |
| `claim-waitlist-spot` Edge Function        | Not needed — Angular calls RPC directly    | `claim_waitlist_spot` RPC was already implemented in Phase 1 migration                        |
