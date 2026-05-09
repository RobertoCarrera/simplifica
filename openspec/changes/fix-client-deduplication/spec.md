# Delta for Client Deduplication

## MODIFIED Requirements

### Requirement: upsert-client deduplication cascade

The `upsert_client` function MUST implement a 4-step cascade deduplication BEFORE any insert:

**Step 1 — by `patient_id` / `docplanner_patient_id`:**
If payload contains `patient_id` or `docplanner_patient_id` and a client with matching `docplanner_patient_id` exists (within same company, active, not deleted), return that existing client.

**Step 2 — by email (case-insensitive):**
If payload contains a non-empty email and a client with matching email exists (within same company, active, not deleted), return that existing client.

**Step 3 — by phone (last 9 digits, normalized):**
If payload contains a non-empty phone and a client with matching normalized phone exists (within same company, active, not deleted), return that existing client. Normalization: remove spaces, dashes, plus signs, and parentheses.

**Step 4 — by name + surname (case-insensitive, normalized):**
If payload contains non-empty name and surname and a client with matching normalized name and surname exists (within same company, active, not deleted), return that existing client. Normalization: uppercase, trim whitespace.

**When no duplicate found in any step:**
Insert a new active client with `is_active = true` and return the newly created record.

**When duplicate found in steps 1-4:**
Return the existing client record WITHOUT modifying it.

(Previously: upsert_client only deduplicated by email via auth.users lookup; no cascade)

#### Scenario: New client with unique phone+name → insert OK

- GIVEN a company with an active client "Ana García" +349123456789 but no client with phone 612345678
- WHEN upsert_client is called with payload: { name: "María", surname: "López", phone: "612345678", email: "maria@test.com" }
- THEN a NEW client record SHALL be inserted with is_active=true
- AND the function SHALL return the newly created client

#### Scenario: New client with phone matching existing → return existing

- GIVEN a company with an active client "Ana García" +349123456789
- WHEN upsert_client is called with payload: { name: "Ana", surname: "García", phone: "912345678", email: "new@test.com" }
- THEN NO new client SHALL be inserted
- AND the function SHALL return the existing "Ana García" client

#### Scenario: New client with name+surname matching existing but different phone → return existing

- GIVEN a company with an active client "Juan Pérez" +349123456789
- WHEN upsert_client is called with payload: { name: "Juan", surname: "Pérez", phone: "999999999", email: "different@test.com" }
- THEN NO new client SHALL be inserted
- AND the function SHALL return the existing "Juan Pérez" client

#### Scenario: Docplanner patient_id match → return existing

- GIVEN a company with a client having docplanner_patient_id = "dp_12345"
- WHEN upsert_client is called with payload: { docplanner_patient_id: "dp_12345", name: "Updated", surname: "Name" }
- THEN NO new client SHALL be inserted
- AND the function SHALL return the existing client with docplanner_patient_id = "dp_12345"

#### Scenario: Inactive clients not considered for dedup

- GIVEN a company with an INACTIVE client "Carlos Ruiz" with phone 912345678 (is_active=false)
- WHEN upsert_client is called with payload: { name: "Carlos", surname: "Ruiz", phone: "912345678" }
- THEN a NEW active client SHALL be inserted
- AND the function SHALL return the newly created active client

#### Scenario: Deleted clients not considered for dedup

- GIVEN a company with a DELETED client "Laura Masa" with phone 912345678 (deleted_at IS NOT NULL)
- WHEN upsert_client is called with payload: { name: "Laura", surname: "Masa", phone: "912345678" }
- THEN a NEW active client SHALL be inserted
- AND the function SHALL return the newly created active client

---

## ADDED Requirements

### Requirement: dedup_cleanup_migration

A migration function `clean_duplicate_clients()` MUST be provided that:

1. Finds groups of active, non-deleted clients within the same company sharing:
   - normalized name+surname AND (matching normalized phone OR matching lowercase email)
2. For each group, keeps the client with oldest `created_at` as active
3. Marks all others as inactive (`is_active = false, deleted_at = NOW()`)
4. Sets `duplicate_of` on marked records to the kept record's id
5. Sets `metadata -> 'marked_duplicate_at'` to current ISO timestamp
6. Sets `metadata -> 'dedup_reason'` to the match type: 'phone', 'email', or 'name'

The migration MUST:
- Process in batches of 500 to avoid table locks
- Be reversible via a `dedup_cleanup_log` table that records all changes (old_id, new_id, reason, restored_at)
- Respect is_active flag (only consider active clients as potential duplicates)
- Skip clients with no name or surname set

### Requirement: dedup_cleanup_log table

A `dedup_cleanup_log` table MUST be created to support migration reversibility:

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| original_id | uuid | Client that was marked duplicate |
| kept_id | uuid | Client that was kept |
| reason | text | 'phone', 'email', or 'name' |
| created_at | timestamptz | When the dedup occurred |
| reversed_at | timestamptz | Nullable — when restoration occurred |

Reversal: Reactivate original client, clear duplicate_of, set reversed_at.

---

## Scenarios

### Scenario: Migration batch processing

- GIVEN 1500 duplicate clients across 50 companies
- WHEN clean_duplicate_clients() is executed
- THEN it SHALL process in batches of 500
- AND no single batch SHALL hold locks longer than 5 seconds

### Scenario: Migration logs all changes

- GIVEN clean_duplicate_clients() marks client A as duplicate of client B
- THEN a row SHALL be inserted into dedup_cleanup_log with original_id=A, kept_id=B, reason, created_at
- AND the change is reversible by calling restore_duplicates(since_iso_timestamp)

### Scenario: Reversal restores marked duplicates

- GIVEN client A was marked duplicate of client B on 2026-05-07 at 10:00 UTC
- WHEN restore_duplicates('2026-05-07T10:00:00Z') is called
- THEN client A SHALL be reactivated (is_active=true, deleted_at=null, duplicate_of=null)
- AND dedup_cleanup_log.reversed_at for that entry SHALL be set to NOW()

---

## Data Model Changes

### Column: clients.duplicate_of

| Column | Type | Constraints |
|--------|------|-------------|
| `duplicate_of` | uuid | nullable, foreign key to clients(id) |

Set when this client is a duplicate kept for historical reference.

### Column: clients.docplanner_patient_id

Existing column — used for Step 1 dedup matching.

---

## Acceptance Criteria

- [ ] upsert_client returns existing client when phone matches (Step 3)
- [ ] upsert_client returns existing client when name+surname matches (Step 4)
- [ ] upsert_client returns existing client when docplanner_patient_id matches (Step 1)
- [ ] upsert_client inserts new client when all dedup steps find no match
- [ ] Inactive/deleted clients excluded from dedup search
- [ ] Migration processes in batches of 500
- [ ] Migration logs all changes to dedup_cleanup_log
- [ ] Reversal restores marked duplicates to active state
- [ ] dedup_cleanup_log.reversed_at set on reversal