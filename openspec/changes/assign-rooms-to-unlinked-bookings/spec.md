# Delta for Bookings — Assign Rooms to Unlinked Bookings

## Overview

This change introduces a bulk assignment workflow that connects unlinked historical bookings (those with `resource_id` IS NULL) to proper room resources, grouped by professional. It also provides a manual "Sync Room Calendars" trigger for owners/admins to reconcile Google Calendar resource calendars with the assigned rooms. The sync is fire-and-forget — assignment persists even if the sync fails.

---

## User Stories

| Role | Story |
|------|-------|
| Owner | As an owner, I want to see which professionals have bookings without rooms so I can assign the correct room in bulk and ensure all appointments appear in the right Google Calendar resource. |
| Admin | As an admin, I want to assign a professional's default room to all their unlinked bookings in one click so I don't have to edit each booking individually. |
| Admin | As an admin, I want to manually trigger a sync of room calendars after assigning rooms so Google Calendar stays accurate. |

---

## ADDED Requirements

### Requirement: Bulk Assignment UI — Unlinked Bookings Grouped by Professional

The system SHALL provide a bulk assignment interface accessible to owners and admins. The interface displays all professionals who have unlinked historical bookings (bookings where `resource_id` IS NULL), showing the count of such bookings per professional. The system SHALL allow the user to select a professional, choose a resource from that professional's available resources (defaulting to the professional's `default_resource_id`), and assign that resource to ALL unlinked bookings for that professional in a single operation.

The assignment operation SHALL update `resource_id` on all matching bookings in a single database transaction and return the count of updated bookings.

#### Scenario: Assign rooms to all unlinked bookings for one professional

- GIVEN the authenticated user is an owner or admin
- AND there exist bookings with `resource_id` IS NULL associated with professional P
- AND professional P has at least one resource in the `resources` table
- WHEN the user navigates to the bulk assignment interface
- AND selects professional P from the list
- AND selects a resource R from the dropdown (pre-selected to P's `default_resource_id` if set)
- AND clicks "Assign Rooms"
- THEN the system SHALL update `resource_id` to R's ID on all bookings where `professional_id` = P AND `resource_id` IS NULL AND `status` != 'cancelled'
- AND the system SHALL return `{"updated": N}` where N is the count of updated bookings
- AND the system SHALL display a success message: "Room assigned to N bookings"

#### Scenario: No unlinked bookings for a professional

- GIVEN the authenticated user is an owner or admin
- AND a professional P has zero unlinked bookings (all have `resource_id` set)
- WHEN the user navigates to the bulk assignment interface
- THEN professional P SHALL NOT appear in the list of professionals requiring assignment

#### Scenario: Professional has no default resource and no available rooms

- GIVEN the authenticated user is an owner or admin
- AND professional P has unlinked bookings but P's `default_resource_id` IS NULL
- AND professional P has no resources in the `resources` table
- WHEN the user views the assignment interface
- THEN professional P SHALL appear with a visible warning indicator
- AND the "Assign Rooms" button SHALL be disabled for that professional
- AND the system SHALL display: "No rooms available for this professional"

#### Scenario: Large dataset pagination

- GIVEN the authenticated user is an owner or admin
- AND there are more than 50 professionals with unlinked bookings
- WHEN the user loads the bulk assignment interface
- THEN the system SHALL display a paginated list of professionals (max 50 per page)
- AND the system SHALL show the total count of professionals requiring assignment

---

### Requirement: Sync Button — "Sync Room Calendars"

The system SHALL provide a "Sync Room Calendars" button in the Resources tab (or equivalent owner/admin area). When triggered, this button SHALL call the existing `backfill-gcal-bookings` Edge Function with `mode=resources`. The sync operation SHALL be fire-and-forget — the assignment persists even if the sync fails, and the system SHALL display an appropriate status message.

#### Scenario: Manual sync triggered by owner/admin

- GIVEN the authenticated user is an owner or admin
- AND rooms have been assigned to bookings (either via bulk assignment or individually)
- WHEN the user clicks "Sync Room Calendars"
- THEN the system SHALL invoke `backfill-gcal-bookings` with `mode=resources`
- AND the system SHALL display: "Syncing room calendars…"
- AND upon completion, the system SHALL display: "Sync complete — N bookings updated"

#### Scenario: Sync fails but assignment persists

- GIVEN the authenticated user is an owner or admin
- AND the user clicks "Sync Room Calendars"
- WHEN the `backfill-gcal-bookings` call fails or returns an error
- THEN the system SHALL display a non-blocking warning: "Sync failed. Room assignments are saved. You can retry later."
- AND the system SHALL NOT rollback any previously assigned `resource_id` values

---

### Requirement: Unlinked Bookings Report

The system SHALL provide a read-only report listing all unlinked bookings (where `resource_id` IS NULL), grouped by professional, accessible from the bookings management area. The report SHALL display for each booking: customer name, start time, service name (if available), and a "Not assigned" badge in the room column.

#### Scenario: View unlinked bookings report

- GIVEN the authenticated user is an owner or admin
- WHEN the user navigates to Bookings → Unlinked Bookings
- THEN the system SHALL display a table grouped by professional
- AND each row SHALL show: customer name, date/time, service, and a "Not assigned" badge
- AND professionals with no unlinked bookings SHALL NOT appear in the report

---

### Requirement: RPC — Bulk Assignment API

The system SHALL provide a PostgreSQL RPC (or Edge Function) named `bulk_assign_unlinked_bookings` that accepts `professional_id` and `resource_id` as parameters. The RPC SHALL update `resource_id` on all bookings for that professional where `resource_id` IS NULL and `status` != 'cancelled'. The RPC SHALL return `{updated: N}` indicating the number of bookings modified. The RPC SHALL be accessible only to users with owner or admin role.

#### Scenario: RPC updates only eligible bookings

- GIVEN a professional P has 10 bookings with `resource_id` IS NULL and 3 with `resource_id` already set
- AND one booking has `status` = 'cancelled'
- WHEN `bulk_assign_unlinked_bookings(P.id, R.id)` is called
- THEN exactly 9 bookings SHALL have `resource_id` updated to R.id (the 10 unlinked minus the cancelled)
- AND the 3 bookings with existing `resource_id` SHALL remain unchanged
- AND the cancelled booking SHALL remain unchanged

---

## MODIFIED Requirements

*(None — this is a pure ADDITION. No existing requirement is modified.)*

---

## REMOVED Requirements

*(None.)*

---

## UI/UX Specifications

### Layout: Bulk Assignment UI (Unlinked Bookings)

**Location**: New section or tab within Bookings Settings — e.g., `Bookings > Unlinked Bookings`

**Structure**:
```
┌─────────────────────────────────────────────────────────────┐
│  Unlinked Bookings Assignment                    [Sync ↓]  │  ← Header with sync button
├─────────────────────────────────────────────────────────────┤
│  [Search professionals...]                     [Page 1 of 3]│  ← Search + pagination
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Dr. García                              12 unlinked  ▼  │ │  ← Professional row (expandable)
│  │ Default room: Sala A                      [Assign]    │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ⚠ Dr. López                               5 unlinked   │ │  ← Warning state (no rooms)
│  │ No rooms available                         [Disabled]   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Component States**:

| State | Visual |
|-------|--------|
| Loading | Skeleton rows with pulsing animation |
| Empty (all linked) | "All bookings are linked to a room" + checkmark icon |
| Empty (no professionals) | "No professionals found" message |
| Professional row (normal) | Name, unlinked count, resource dropdown (pre-selected default), Assign button |
| Professional row (warning) | Yellow warning icon, "No rooms available" label, Assign button disabled |
| Assigning (in progress) | Spinner on button, "Assigning…" label, button disabled |
| Success | Green toast: "Room assigned to N bookings", row count updates |
| Error | Red toast: "Assignment failed: {reason}", retry available |

**Interactions**:
1. User opens Unlinked Bookings tab
2. System loads professionals with unlinked booking summary (count per professional)
3. User expands a professional row (or sees inline dropdown)
4. User selects/confirm the resource (defaults to `default_resource_id`)
5. User clicks "Assign Rooms"
6. System calls RPC → updates bookings → shows success toast with count
7. System triggers `backfill-gcal-bookings?mode=resources` (fire-and-forget)

### Layout: Sync Button

**Location**: Resources tab header area — e.g., `Resources > [Sync Room Calendars button]`

**Structure**:
```
┌─────────────────────────────────────────────────────────────┐
│  Resources                               [Sync Room Calendars]│
├─────────────────────────────────────────────────────────────┤
│  ...existing resources table...                              │
└─────────────────────────────────────────────────────────────┘
```

**Button States**:

| State | Visual |
|-------|--------|
| Default | Secondary/outline button: "Sync Room Calendars" |
| Hover | Slight darkening of button |
| Syncing | Spinner + "Syncing…" text, button disabled |
| Success | Brief green checkmark flash, then back to default |
| Failed | Red warning icon + "Sync failed — retry" |

---

## Backend/API Specifications

### RPC: `bulk_assign_unlinked_bookings`

```sql
CREATE OR REPLACE FUNCTION bulk_assign_unlinked_bookings(
    p_professional_id UUID,
    p_resource_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE bookings
    SET resource_id = p_resource_id,
        updated_at = NOW()
    WHERE professional_id = p_professional_id
      AND resource_id IS NULL
      AND status != 'cancelled';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object('updated', v_updated_count);
END;
$$;
```

**Security**: Only owners/admins can call this function (enforced via RLS or service role).

### Edge Function: `backfill-gcal-bookings`

**Existing function**, called with `mode=resources`:
- Invoked via: `supabase.functions.invoke('backfill-gcal-bookings', { body: { mode: 'resources' } })`
- Fire-and-forget: client does not wait for completion
- Non-blocking: sync failure does not affect assignment

---

## Data Model

No new tables or columns required for MVP. The change uses existing columns:

| Column | Usage |
|--------|-------|
| `bookings.resource_id` | Updated by bulk assignment |
| `bookings.professional_id` | Filter condition |
| `bookings.status` | Exclude 'cancelled' bookings |
| `professionals.default_resource_id` | Default pre-selection in dropdown |
| `resources.id` | Target of assignment |

---

## Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| No resources exist for the company | Bulk assignment UI shows empty resource dropdown; Assign button disabled for all professionals |
| All bookings already have `resource_id` | Interface shows "All bookings are linked to a room" empty state |
| `backfill-gcal-bookings` quota exceeded | Log warning; assignment persists; user sees "Sync failed" warning with retry option |
| Assignment fails mid-transaction | Full rollback via RPC transaction; no partial updates; user sees error toast |
| Professional has `room_id` but no `resource_id` | Treated as unlinked; eligible for bulk assignment |
| Large number of professionals (>50) | Pagination with 50 per page; loading indicator on fetch |
| Professional has `default_resource_id` that no longer exists | Dropdown defaults to null; user must select manually; warning shown if no resources available |

---

## Acceptance Criteria

1. **AC-1**: Owner/admin can see a list of professionals with unlinked bookings count
2. **AC-2**: Owner/admin can select a resource and bulk-assign to all unlinked bookings of a professional in one click
3. **AC-3**: After assignment, `resource_id` is set on all previously unlinked bookings for that professional (excluding cancelled)
4. **AC-4**: "Sync Room Calendars" button triggers `backfill-gcal-bookings?mode=resources`
5. **AC-5**: Unlinked bookings report shows all bookings without `resource_id`, grouped by professional
6. **AC-6**: Sync failure does NOT rollback the room assignment — assignment persists
7. **AC-7**: Empty state handled gracefully (no unlinked bookings, no resources, no professionals)
8. **AC-8**: Professional with no `default_resource_id` shows warning and requires manual resource selection
9. **AC-9**: Large datasets handled with pagination (50 professionals per page)