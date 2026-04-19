# GDPR Data Duplicates Audit

**Date:** 2026-04-19  
**Project:** Simplifica CRM  
**Status:** CRÍTICO — Intervención requerida  

---

## Summary

After investigating all GDPR-related tables and interfaces, Roberto's suspicion is **confirmed**. Consent data is stored in **multiple locations** with inconsistent synchronization, creating both data redundancy risk and potential compliance gaps.

### Fields existing across tables

| Field | `clients` table | `gdpr_consent_records` table | Notes |
|---|---|---|---|
| `marketing_consent` | ✅ boolean + date + method | ✅ consent_given (per type) | **DUPLICATED** |
| `data_processing_consent` | ✅ boolean + date | ✅ consent_given (type=`data_processing`) | **DUPLICATED** |
| `consent_status` | ✅ enum: pending/accepted/rejected/revoked | N/A (derived) | **SOURCES CONFLICT** |
| `consent_date` | ✅ timestamp | N/A (use created_at) | **DUPLICATED** |
| `health_data_consent` | ✅ boolean (client level) | ✅ consent_given (type=`health_data`) | **DUPLICATED** |
| `privacy_policy_consent` | ❌ No column | ✅ consent_given (type=`privacy_policy`) | Client uses `consent_status='accepted'` as proxy |
| `parental_consent_verified` | ✅ boolean | N/A | Isolated — no record in consent table |
| `parental_consent_date` | ✅ date | N/A | Isolated — no record in consent table |
| `is_minor` | ✅ boolean | N/A | Isolated — should gate parental_consent |
| `has_left_google_review` | ✅ boolean | N/A | Isolated — not GDPR-relevant |
| `google_review_date` | ✅ date | N/A | Isolated — not GDPR-relevant |
| `invitation_status` | ✅ enum: not_sent/sent/opened/completed | N/A | Workflow-only |
| `invitation_sent_at` | ✅ timestamp | N/A | Workflow-only |

---

## Canonical Sources of Truth

### Decision Matrix

| Data Type | Canonical Source | Reasoning |
|---|---|---|
| **Marketing Consent** | `gdpr_consent_records` (type=`marketing`) | Immutable audit trail, timestamped, method-tracked |
| **Health Data Consent** | `gdpr_consent_records` (type=`health_data`) | Sensitive data Art.9 — requires granular record |
| **Privacy Policy Consent** | `gdpr_consent_records` (type=`privacy_policy`) | New granular type — clients.consent_status is a proxy only |
| **Data Processing Consent** | `gdpr_consent_records` (type=`data_processing`) | Legacy; prefer granular `privacy_policy` |
| **Consent Status (summary)** | `clients.consent_status` | UI shows status badge — must reflect latest consent state |
| **Parental Consent** | `clients` (parental_consent_verified/date) | **No canonical record in consent table** — needs new record type |
| **Minor Flag** | `clients.is_minor` | Only stored on clients — should gate health_data consent |
| **Google Review** | `clients` (has_left_google_review/google_review_date) | Non-GDPR operational field — acceptable |

### Key Finding

The `clients` table fields are used as **fast-read cache** for the UI. The authoritative source is `gdpr_consent_records`. However:

- `clients.consent_status` is **not automatically derived** from `gdpr_consent_records` — it can drift
- `clients.marketing_consent` / `clients.data_processing_consent` are **written directly** by some code paths instead of going through `gdpr_consent_records` first
- `clients.privacy_policy_consent` has **no column** — the UI falls back to `consent_status === 'accepted'` as proxy

---

## Duplicates Found

### 🔴 CRITICAL

#### 1. Marketing Consent — Three-Write Problem

**Problem:** Marketing consent can be written in 3 places:

```
A. clients.marketing_consent + marketing_consent_date + marketing_consent_method
   Written by: ClientGdprPanelComponent.recordConsent() → customersService.updateCustomer()
   Written by: FormNewCustomerComponent.saveConsents() → customerData payload
   
B. gdpr_consent_records (type='marketing')
   Written by: ClientGdprPanelComponent.recordConsent() → gdprService.recordConsent()
   Written by: FormNewCustomerComponent.saveConsents() → gdprService.recordConsent()

C. gdpr_audit_log (action_type='consent')
   Written by: GdprComplianceService.logGdprEvent() (auto-triggered by recordConsent)
```

**Risk:** A is written immediately to clients table. B is written to consent_records. If the recordConsent RPC fails but clients update succeeds, the cache (`clients`) is ahead of the canonical record. The audit log may reflect partial state.

**Evidence:**
- `client-gdpr-panel.component.ts:855` — `updatePayload.marketing_consent = given`
- `form-new-customer.component.ts:1017` — `marketing_consent: this.formData.marketing_consent` (payload to upsert_client)
- `gdpr-compliance.service.ts:recordConsent()` — inserts into `gdpr_consent_records` + logs audit

**Recommendation:**
1. Remove direct writes to `clients.marketing_consent` from components
2. Create an RPC or trigger that derives `clients.marketing_consent` from the latest `gdpr_consent_records` entry
3. Keep `marketing_consent_date` on `clients` as a cached "last updated at" for UI performance

#### 2. Privacy Policy Consent — Missing Column with Inconsistent Mapping

**Problem:** `clients` table has **no `privacy_policy_consent` column**. The component at `client-gdpr-panel.component.ts:714-715` maps:
```typescript
this.privacyPolicyConsent = status.consent_status === 'accepted';
```

This is a **fragile heuristic**: `consent_status='accepted'` could have been set for other reasons (e.g., manual admin action, invitation completed) and does not track revocation.

**Recommendation:**
1. Add `privacy_policy_consent boolean` column to `clients` table (with `_date` suffix)
2. Use same pattern as marketing: canonical in `gdpr_consent_records`, sync to `clients.privacy_policy_consent` via trigger or RPC
3. Remove the `consent_status === 'accepted'` heuristic from `loadConsentStatus()`

#### 3. Consent Status — Not Derived from Consent Records

**Problem:** `clients.consent_status` (enum: pending/accepted/rejected/revoked) is set manually in some code paths and is **not automatically derived** from the latest `gdpr_consent_records`. This means:

- If a client grants health data consent via `gdpr_consent_records` but the admin never updates `clients.consent_status`, the client's summary status badge shows wrong state
- `consent_status='accepted'` is used to derive `privacyPolicyConsent` in the GDPR panel

**Evidence:**
- `client-gdpr-panel.component.ts:707-715` — loads from `clients` table only, derives `privacyPolicyConsent` via fragile heuristic
- `supabase-customers.service.ts:toCustomerFromClient()` — maps `consent_status` directly without cross-checking records

**Recommendation:**
1. Create a PostgreSQL trigger on `gdpr_consent_records` that updates `clients.consent_status` based on latest record
2. Or create an RPC `sync_client_consent_status(p_client_id)` called after each `recordConsent`

---

### 🟡 WARNING

#### 4. Parental Consent — No Record in Consent Table

**Problem:** `clients.parental_consent_verified` and `parental_consent_date` are stored only on the `clients` table. There is **no corresponding record in `gdpr_consent_records`** for parental consent.

This is problematic for Art.8 compliance (children's data):
- No immutable audit trail of who verified parental consent, when, and how
- If the client record is soft-deleted, parental consent evidence is lost

**Recommendation:**
1. Add new `consent_type = 'parental_consent'` to the enum
2. When `parental_consent_verified` is set on `clients`, also create a `gdpr_consent_records` entry with `consent_type='parental_consent'`
3. The `is_minor` field should gate health data consent (if is_minor=true, health_data_consent requires parental_consent verified)

#### 5. Data Processing Consent — Legacy Column Still Active

**Problem:** `clients.data_processing_consent` (bool) and `data_processing_consent_date` are marked as deprecated in the Customer model comment (`customer.ts:90`) but are:
- Still mapped in `toCustomerFromClient()` (supabase-customers.service.ts:510)
- Written in `client-gdpr-panel.component.ts:856` via `updatePayload.data_processing_consent = given`
- Present in the `clients` table schema (supabase-db.types.ts:1408)

**Recommendation:**
1. Deprecate `clients.data_processing_consent` column (keep for data, don't write new)
2. Map it to `gdpr_consent_records` (type=`data_processing`) as canonical
3. Add comment in DB: `-- Deprecated 2026-04: use gdpr_consent_records type=data_processing`
4. Update `client-gdpr-panel.component.ts` to write `gdpr_consent_records` type=`data_processing` instead

---

## Code Issues Found

### Issue #1: `clients.marketing_consent` written directly by components

**Files:**
- `src/app/features/customers/components/client-gdpr-panel/client-gdpr-panel.component.ts:855`
- `src/app/features/customers/form-new-customer/form-new-customer.component.ts:1017`

**Current flow:**
```
User updates marketing consent
  → GdprComplianceService.recordConsent() [canonical write]
  → SupabaseCustomersService.updateCustomer() [cache write]
```

**Should be:**
```
User updates marketing consent
  → GdprComplianceService.recordConsent() [canonical write]
  → [auto-trigger] Update clients.marketing_consent via DB trigger or RPC
```

### Issue #2: `consent_status` not derived from consent records

**Files:**
- `src/app/services/supabase-customers.service.ts` (toCustomerFromClient)
- `src/app/features/customers/profile/client-profile.component.ts:575-597` (uses consent_status for badge)

**Current:** `consent_status` is a free-form column that can drift from actual consent state

**Should be:** Derived from latest `gdpr_consent_records` entry per client

### Issue #3: Privacy policy uses `consent_status` as proxy

**File:** `src/app/features/customers/components/client-gdpr-panel/client-gdpr-panel.component.ts:714-715`

```typescript
// Fragile — consent_status could be 'accepted' from invitation, not privacy policy
this.privacyPolicyConsent = status.consent_status === 'accepted';
```

**Should be:** `gdpr_consent_records` (type=`privacy_policy`) is the canonical source

---

## Recommended Actions

### Priority 1: Fix Marketing Consent Triple-Write (CRITICAL)

1. **Create migration** to add trigger on `gdpr_consent_records`:
   - On INSERT of type=`marketing`: update `clients.marketing_consent` and `clients.marketing_consent_date`
   - On UPDATE of `withdrawn_at`: set `clients.marketing_consent = false`

2. **Create migration** to add trigger on `gdpr_consent_records`:
   - On INSERT of type=`privacy_policy`: update `clients.privacy_policy_consent` (new column)
   - On INSERT of type=`health_data`: update `clients.health_data_consent`

3. **Update code** to stop direct writes to `clients.marketing_consent` from components

### Priority 2: Add Privacy Policy Column to Clients (HIGH)

1. **Create migration** to add `privacy_policy_consent boolean` to `clients` table
2. **Add migration** to backfill from `gdpr_consent_records` where type=`privacy_policy` and consent_given=true
3. **Update code** in `client-gdpr-panel.component.ts` to read from new column instead of `consent_status` heuristic

### Priority 3: Derive `consent_status` from Consent Records (HIGH)

1. **Create migration** to add PostgreSQL function `sync_client_consent_status()` 
2. **Add trigger** on `gdpr_consent_records` to call this function after INSERT/UPDATE
3. **Remove** manual setting of `consent_status` from any component code

### Priority 4: Add Parental Consent Record (MEDIUM)

1. **Create migration** to add `consent_type = 'parental_consent'` to enum
2. **Update code** in form-new-customer to also call `gdprService.recordConsent(type='parental_consent')` when `parental_consent_verified` is set
3. **Add validation** that if `clients.is_minor=true`, `health_data_consent` requires a `parental_consent` record

### Priority 5: Deprecate `data_processing_consent` column (MEDIUM)

1. Add DB comment: `-- Deprecated: use gdpr_consent_records type=data_processing`
2. Stop writing to `clients.data_processing_consent` from component code
3. Map it to `gdpr_consent_records` (type=`data_processing`) instead

---

## Migration Scripts Needed

| # | Filename | Purpose |
|---|---|---|
| 1 | `20260422000001_add_privacy_policy_consent_to_clients.sql` | Add `privacy_policy_consent` column + backfill |
| 2 | `20260422000002_add_consent_sync_triggers.sql` | Triggers to sync `clients.*_consent` from `gdpr_consent_records` |
| 3 | `20260422000003_sync_consent_status_from_records.sql` | Backfill `consent_status` from latest consent record |
| 4 | `20260422000004_add_parental_consent_type.sql` | Add 'parental_consent' to consent_type enum + new records |
| 5 | `20260422000005_deprecate_data_processing_consent.sql` | Add DB comment deprecation |

---

## Files Affected

### Services (read/consent-write)
- `src/app/services/gdpr-compliance.service.ts` — recordConsent, getConsentRecords, getClientGdprStatus
- `src/app/services/supabase-customers.service.ts` — toCustomerFromClient, updateCustomer

### Components (read from cache, write to cache)
- `src/app/features/customers/components/client-gdpr-panel/client-gdpr-panel.component.ts` — main UI for GDPR panel
- `src/app/features/customers/form-new-customer/form-new-customer.component.ts` — consent capture on save
- `src/app/features/customers/profile/client-profile.component.ts` — consent status badge display
- `src/app/features/customers/gdpr-customer-manager/gdpr-customer-manager.component.ts` — filtering by consent_status

### Models
- `src/app/models/customer.ts` — consent-related fields (needs cleanup comments)
- `src/app/services/supabase-db.types.ts` — clients table types (stable)

---

## Audit Conclusion

**Roberto tenía razón — hay duplicación de consentimientos.** El problema principal es:

1. Los componentes escriben **en paralelo** en `clients` (cache rápido) y `gdpr_consent_records` (fuente canónica)
2. No hay mecanismo automático para mantenerlas sincronizadas
3. `consent_status` es una columna libre que no se deriva de los registros de consentimiento
4. `privacy_policy_consent` no existe como columna en `clients` y se usa un heurístico frágil
5. `parental_consent` no tiene registro en la tabla de consentimientos

**Impacto GDPR:** Si un regulador pide evidencia del consentimiento de un cliente, currently hay que consultar DOS tablas y cruzar fechas para determinar el estado real. La fuente canónica (`gdpr_consent_records`) es la correcta, pero los sistemas internos pueden mostrar estado outdated por el cache en `clients`.

**Acciones inmediatas:** Las migraciones propuestas (especialmente #1 y #2 de la tabla de arriba) resolverán la mayoría de los problemas de inconsistencia. Hasta que se ejecuten, cualquier cambio de consentimiento debe hacerse SOLO a través de `gdprComplianceService.recordConsent()` y nunca escribiendo directamente a `clients.marketing_consent` u otras columnas de consentimiento.