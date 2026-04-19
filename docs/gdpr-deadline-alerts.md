# GDPR Deadline Alert System

## Overview

GDPR Article 12 requires controllers to respond to access requests within **ONE MONTH (30 days)**. This system provides proactive notifications when deadlines are approaching or have passed.

## Components

### 1. Edge Function: `check-gdpr-deadlines`

**Location:** `supabase/functions/check-gdpr-deadlines/index.ts`

Runs every 12 hours (via pg_cron). For each GDPR access request where:
- `processing_status != 'completed'`
- `verification_status != 'rejected'`
- `deadline_date` is within the next 5 days OR already passed

The function:
1. Creates an **in-app notification** for company owner/super_admin
2. Updates `deadline_warning_sent_at` or `overdue_notification_sent_at` to prevent duplicates
3. Returns count of notifications sent

**Notification rules:**
| Status | Title | Priority | Condition |
|--------|-------|----------|-----------|
| Warning | ⚠️ Solicitud GDPR vence en días | HIGH | Deadline within 5 days |
| Overdue | 🔴 Solicitud GDPR VENCIDA | CRITICAL | Deadline passed |

### 2. Database Migration

**File:** `supabase/migrations/20260419000004_gdpr_deadline_alerts.sql`

Adds tracking columns:
```sql
ALTER TABLE public.gdpr_access_requests
  ADD COLUMN IF NOT EXISTS deadline_warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS overdue_notification_sent_at TIMESTAMPTZ;
```

### 3. Frontend Enhancements

**`gdpr-request-detail.component`** (GDPR request detail panel):
- Deadline status badge with color coding:
  - 🟢 Green: > 15 days remaining
  - 🟡 Yellow: 5-15 days remaining
  - 🟠 Orange: 2-5 days remaining
  - 🔴 Red: ≤ 1 day or overdue
- Countdown display: "Vence en X días" or "Vencida hace X días"
- "Escalar" button for overdue requests (with animation)

**`gdpr-customer-manager.component`** (Request list):
- Compact deadline indicator per request in the recent activity feed
- Color-coded badge: "🟢 20d", "🟡 10d", "🟠 3d", "🔴 VENCIDA"

## pg_cron Setup (Manual — Run Once)

Execute this SQL in the Supabase SQL editor to enable the cron job:

```sql
-- Enable pg_cron extension (run once if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule: check GDPR deadlines every 12 hours
SELECT cron.schedule(
  'check-gdpr-deadlines',
  '0 */12 * * *',  -- every 12 hours (at midnight, 12:00, etc.)
  $$
  SELECT net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/check-gdpr-deadlines',
    headers := '{"Authorization": "Bearer <YOUR_SERVICE_ROLE_KEY>"}'
  );
  $$
);
```

**To verify the schedule is active:**
```sql
SELECT * FROM cron.job WHERE jobname = 'check-gdpr-deadlines';
```

**To unschedule:**
```sql
SELECT cron.unschedule('check-gdpr-deadlines');
```

## Notes

- Email notifications are **NOT implemented** — they require templates, consent checks, and are more complex
- Notifications go to **owner/super_admin**, not the professional who created the request
- The system is idempotent: once a warning/overdue notification is sent, the field is stamped to prevent duplicates
- The cron runs via `net.http_post` — ensure the Supabase project has outbound HTTP access
