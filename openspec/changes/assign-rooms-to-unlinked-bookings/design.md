# Technical Design: Assign Rooms to Unlinked Bookings

## 1. Architecture Overview
This change introduces a bulk assignment workflow for historical bookings without a designated resource (`resource_id IS NULL`). The architecture is strictly decoupled into three layers:
- **UI Components:** A new `UnlinkedBookingsComponent` within the Booking Settings, and a new "Sync Room Calendars" action inside the `ResourcesComponent`.
- **Services:** Extensions to `SupabaseBookingsService` to support querying the summary, executing the assignment, and triggering the calendar sync.
- **Database (Supabase RPCs):** Two new PostgreSQL RPC functions using `SECURITY INVOKER` to maintain RLS validation based on the user's current session and company context.
- **Edge Functions:** Reusing the existing `backfill-gcal-bookings` with `mode: 'resources'` in a fire-and-forget pattern.

## 2. API Design

### RPC: `get_unlinked_bookings_summary`
Fetches all professionals with unlinked bookings for the current company.
- **Parameters:** `p_company_id UUID`
- **Returns:** `TABLE (professional_id UUID, display_name TEXT, default_resource_id UUID, unlinked_count BIGINT)`
- **Security:** `SECURITY INVOKER` (RLS handles tenant isolation).

### RPC: `bulk_assign_unlinked_bookings`
Performs the atomic assignment of a specific resource to all unlinked bookings of a professional.
- **Parameters:** `p_professional_id UUID, p_resource_id UUID`
- **Returns:** `jsonb` (e.g., `{"updated": N}`)
- **Security:** `SECURITY INVOKER` (RLS handles tenant isolation).

### Frontend Service Methods (`SupabaseBookingsService`)
```typescript
interface UnlinkedSummary {
  professional_id: string;
  display_name: string;
  default_resource_id: string | null;
  unlinked_count: number;
}

getUnlinkedBookingsSummary(companyId: string): Observable<UnlinkedSummary[]>
bulkAssignUnlinkedBookings(professionalId: string, resourceId: string): Observable<{ updated: number }>
syncRoomCalendars(): Observable<void>
```

## 3. Database Changes (Migrations)
A new migration file (e.g. `20260424000003_assign_rooms_unlinked_bookings.sql`) will be created to define the two RPC functions. No new tables or columns are required.

```sql
CREATE OR REPLACE FUNCTION get_unlinked_bookings_summary(p_company_id UUID)
RETURNS TABLE (
    professional_id UUID,
    display_name TEXT,
    default_resource_id UUID,
    unlinked_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT 
        p.id AS professional_id,
        p.display_name,
        p.default_resource_id,
        COUNT(b.id) AS unlinked_count
    FROM professionals p
    JOIN bookings b ON b.professional_id = p.id
    WHERE p.company_id = p_company_id
      AND b.resource_id IS NULL
      AND b.status != 'cancelled'
    GROUP BY p.id, p.display_name, p.default_resource_id
    HAVING COUNT(b.id) > 0
    ORDER BY p.display_name ASC;
$$;

CREATE OR REPLACE FUNCTION bulk_assign_unlinked_bookings(
    p_professional_id UUID,
    p_resource_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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

## 4. Component Inventory
- `src/app/features/settings/booking/tabs/unlinked-bookings/unlinked-bookings.component.ts` (NEW)
- `src/app/features/settings/booking/tabs/unlinked-bookings/unlinked-bookings.component.html` (NEW)
- `src/app/features/settings/booking/booking-settings.component.ts` (MODIFIED: Add `'unlinked'` to allowed tabs)
- `src/app/features/settings/booking/booking-settings.component.html` (MODIFIED: Add tab navigation button and component switch)
- `src/app/features/settings/booking/tabs/resources/resources.component.ts` (MODIFIED: Add syncRoomCalendars trigger and loading state)
- `src/app/features/settings/booking/tabs/resources/resources.component.html` (MODIFIED: Add "Sync Room Calendars" button next to "Añadir Recurso")
- `src/app/services/supabase-bookings.service.ts` (MODIFIED: Add new methods for RPCs and Edge Function invocation)

## 5. Data Flow
1. **View:** Admin navigates to Booking Settings > Unlinked Bookings.
2. **Fetch:** Frontend calls `get_unlinked_bookings_summary(companyId)` RPC to retrieve grouped unlinked bookings.
3. **Select:** Admin selects a resource (dropdown defaults to professional's `default_resource_id` if present).
4. **Assign:** Click "Assign Rooms", invoking `bulk_assign_unlinked_bookings(profId, resId)`.
5. **Update:** The RPC updates `resource_id` in a single transaction and returns the count.
6. **Trigger Sync:** Frontend shows success toast, refreshes the unlinked bookings list, and automatically triggers `this.supabase.functions.invoke('backfill-gcal-bookings', { body: { mode: 'resources' } })` as a fire-and-forget operation without awaiting.
7. **Manual Sync:** Alternatively, an Admin can click "Sync Room Calendars" in the Resources tab to trigger the same edge function manually.

## 6. Security
- Both new RPCs are created using `SECURITY INVOKER` ensuring they run with the RLS policies of the currently authenticated user.
- The `bookings` and `professionals` tables already have `company_id` tenant isolation RLS policies enforced. Using `SECURITY INVOKER` prevents privilege escalation bypasses.
- The UI navigation guard (`allowedTabs` in `BookingSettingsComponent`) prevents client-level users from seeing or accessing these tabs.
- The Edge Function `backfill-gcal-bookings` natively validates the Supabase session JWT and automatically reads the `company_id` from the token's associated user membership.