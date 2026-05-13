# Design: Booking Source and Room Assignment

## Technical Approach

Extends the booking system with source tracking (agenda, admin, professional, docplanner) and a new DB RPC `create_booking_with_resource` that performs room assignment atomically before inserting. A `booking_source_icons` table stores per-company custom icons with owner-only CRUD via RLS, and the calendar reads this map on init for icon display per event.

## Architecture Decisions

### Decision: is_active flag for soft-disable

**Choice**: Add `is_active boolean DEFAULT true NOT NULL` to `booking_source_icons`.
**Alternatives considered**: Hard delete only — rejected because it breaks historical booking references and prevents rollback.
**Rationale**: This codebase consistently uses `is_active` flags for soft state (services, resources). Deleting a config row would orphan icon references in existing bookings. Soft-disable lets owners hide a source without losing audit trail.

---

### Decision: CHECK constraint for source values

**Choice**: `CHECK (source IN ('agenda', 'admin', 'professional', 'docplanner'))`
**Alternatives considered**: Enum type — rejected because Postgres enum ALTER is expensive. A text CHECK is sufficient and matches the existing pattern in this codebase.
**Rationale**: Simple, enforces at DB level, no migration cost if values expand.

---

### Decision: RPC reuses assignRoomForBooking vs duplicating logic

**Choice**: Inline the room-assignment SELECT logic directly in the RPC, do NOT call `assignRoomForBooking` from Edge Functions.
**Alternatives considered**: Call the Edge Function's `assignRoomForBooking` — rejected because Edge Functions run in Deno with a Supabase client, not in the DB transaction context. A DB RPC must own its own SQL for atomicity.
**Rationale**: The room assignment is a 3-step SQL query (check default_resource_id, find available room, detect conflict). Putting it inside the RPC keeps the atomicity guarantee. Duplicating ~20 lines of SQL is acceptable for a one-off RPC.

---

### Decision: Calendar reads icons via per-company cache (not per-event join)

**Choice**: Calendar component fetches `booking_source_icons` once on init, stores in a `sourceIcons` signal map `{ [source]: { icon, label } }`.
**Alternatives considered**: JOIN booking_source_icons per event in the bookings query — rejected because it adds N queries to an already-heavy query, and the icons don't change during a session.
**Rationale**: The calendar already has company context on init. Fetch the map once, cache in memory. At render time, look up `sourceIcons[event.source] ?? DEFAULT_ICONS[event.source]`.

---

### Decision: RLS policies for booking_source_icons

**Choice**: Two policies:
1. **SELECT**: Any authenticated user belonging to the company (`company_id` matches their `company_id`).
2. **INSERT/UPDATE/DELETE**: Only the company owner (`role = 'owner'` on the user in `company_members`).
**Alternatives considered**: Reuse existing `is_company_owner()` function — check if one exists first, otherwise create a helper.
**Rationale**: Settings UI is owner-only. Regular staff shouldn't mutate source configs.

---

### Decision: Settings UI shows all 4 sources always

**Choice**: Settings page always shows 4 rows (one per source), with icon/label fields pre-filled from DB (or empty if no custom config).
**Alternatives considered**: Show only sources with existing rows — rejected because it makes the UI confusing (owner doesn't know which sources exist as defaults).
**Rationale**: 4 rows is a small, fixed list. Pre-filling with defaults makes the UI self-documenting. Empty fields = use fallback. Filled fields = custom override.

---

### Decision: Deleted source row → fallback to default emoji

**Choice**: When a `booking_source_icons` row is deleted, existing bookings keep their `source` value. The calendar falls back to the hardcoded default map (agenda→📅, admin→👤, professional→💼, docplanner→🔗).
**Alternatives considered**: Cascade-delete bookings — rejected. Source is a fact about how the booking was created, not a config.
**Rationale**: Booking records are immutable facts. Deleting a config row is an owner action, not a data correction. The fallback chain is explicit in code.

---

## Data Flow

```
[Agenda Form] --source='agenda'--> [bookSlot(source)]
                                           |
                          [source !== 'admin']
                                           |
                    [create_booking_with_resource RPC]
                              |         |
                    [assign room SQL]   [insert booking + source]
                              |                 |
                    [resource_id] --------> [final INSERT]
                                           |
[Calendar Init] --> [fetch booking_source_icons for company]
                              |
                    [sourceIcons signal map]
                              |
                    [render: sourceIcons[event.source] ?? defaultEmoji]
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/{date}_add_source_and_booking_source_icons.sql` | Create | Adds `source` column to bookings, creates `booking_source_icons` table, creates `create_booking_with_resource` RPC |
| `supabase/migrations/{date}_add_booking_source_icons_rpc.sql` | Create | (merged above) |
| `src/app/services/supabase-bookings.service.ts` | Modify | Add optional `source` param to `bookSlot()`, route to new RPC when source != 'admin' |
| `src/app/features/calendar/calendar.component.ts` | Modify | Load `booking_source_icons` on init, store in `sourceIcons` signal, render icons in event chips |
| `src/app/features/bookings/settings/source-icons-settings.component.ts` | Create | New standalone component with CRUD UI for booking source icons |
| `src/app/features/bookings/settings/source-icons-settings.component.html` | Create | Template for the CRUD UI |
| `src/app/features/bookings/settings/settings.routes.ts` | Create | Route for source icons under Reservas settings |
| `src/app/features/bookings/guards/owner-only.guard.ts` | Create | Route guard ensuring only owners access settings |

## Interfaces / Contracts

### DB: booking_source_icons table

```sql
CREATE TABLE booking_source_icons (
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('agenda', 'admin', 'professional', 'docplanner')),
  icon text NOT NULL,           -- emoji or icon class
  label text NOT NULL,          -- human-readable
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (company_id, source)
);
```

### DB: create_booking_with_resource RPC

```sql
CREATE OR REPLACE FUNCTION create_booking_with_resource(
  p_professional_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_booking_data jsonb,
  p_source text
) RETURNS jsonb AS $$
DECLARE
  v_resource_id uuid;
  v_booking_id uuid;
  v_company_id uuid;
BEGIN
  -- Get company_id from professional
  SELECT company_id INTO v_company_id FROM professionals WHERE id = p_professional_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professional not found'; END IF;

  -- Try professional's default_resource_id first
  SELECT resource_id INTO v_resource_id FROM professionals
  WHERE id = p_professional_id AND resource_id IS NOT NULL;

  -- If not set or not available, find any available active room
  IF v_resource_id IS NULL OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.resource_id = v_resource_id
      AND b.status != 'cancelled'
      AND b.start_time < p_end_time
      AND b.end_time > p_start_time
    FOR UPDATE
  ) THEN
    SELECT r.id INTO v_resource_id FROM resources r
    WHERE r.company_id = v_company_id
      AND r.is_active = true
      AND r.type = 'room'
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.resource_id = r.id
          AND b.status != 'cancelled'
          AND b.start_time < p_end_time
          AND b.end_time > p_start_time
      )
    LIMIT 1;

    IF v_resource_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'no_room_available');
    END IF;
  END IF;

  -- Insert booking
  INSERT INTO bookings (
    company_id, professional_id, resource_id,
    start_time, end_time, source,
    customer_name, customer_email, customer_phone,
    service_id, booking_type_id, status
  ) VALUES (
    v_company_id, p_professional_id, v_resource_id,
    p_start_time, p_end_time, p_source,
    (p_booking_data->>'customer_name')::text,
    (p_booking_data->>'customer_email')::text,
    (p_booking_data->>'customer_phone')::text,
    (p_booking_data->>'service_id')::uuid,
    (p_booking_data->>'booking_type_id')::uuid,
    'confirmed'
  ) RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'resource_id', v_resource_id
  );
END;
$$ LANGUAGE plpgsql;
```

### Angular: SourceIconsMap

```typescript
type SourceKey = 'agenda' | 'admin' | 'professional' | 'docplanner';

interface SourceIconConfig {
  icon: string;
  label: string;
}

const DEFAULT_ICONS: Record<SourceKey, SourceIconConfig> = {
  agenda: { icon: '📅', label: 'Agenda' },
  admin: { icon: '👤', label: 'Admin' },
  professional: { icon: '💼', label: 'Professional' },
  docplanner: { icon: '🔗', label: 'Docplanner' },
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| DB | `create_booking_with_resource` with room available | Direct SQL: `SELECT create_booking_with_resource(...)` |
| DB | `create_booking_with_resource` with no room available | Insert conflicting booking first, then call RPC, verify error |
| DB | RLS: owner can CRUD, non-owner cannot | As owner: insert/update/delete. As professional: expect FORBIDDEN |
| Angular | `bookSlot` routes correctly when source != 'admin' | Mock supabase.rpc, verify called with correct RPC name |
| Angular | Settings UI renders all 4 sources with correct defaults | Unit test: verify 4 rows rendered, empty fields show placeholder |
| E2E | Calendar shows custom icon when configured | Create custom icon via settings, verify calendar event shows it |

## Migration / Rollout

1. **Phase 1 — DB migration**: Add `source` column (default 'admin'), create `booking_source_icons` table with RLS, create `create_booking_with_resource` RPC. Existing bookings get `source = 'admin'` via default.
2. **Phase 2 — Angular service**: Update `bookSlot()` to route based on source. No breaking change — admin path unchanged.
3. **Phase 3 — Calendar icons**: Add `sourceIcons` signal and icon rendering. Falls back gracefully to defaults.
4. **Phase 4 — Settings UI**: Owner CRUD for source icons.
5. **No rollback needed for existing bookings** — source column defaults to 'admin', no data migration required.

No feature flags needed. This is additive: new RPC, new table, new UI. Existing bookings unaffected.

## Open Questions

- [ ] Confirm: does `companies` table have a direct `owner_id` column or do we always join `company_members` with `role = 'owner'`? (RLS policy depends on this)
- [ ] Confirm route path for source icons settings: `reservas/configuracion/general` or a new sub-route under `reservas/configuracion/booking-sources`?
- [ ] Should the settings UI use a modal dialog or a dedicated page route? (depends on scope of other "General" settings)