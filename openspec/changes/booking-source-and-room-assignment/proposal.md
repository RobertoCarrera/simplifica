# Proposal: Booking Source and Room Assignment

## Intent

Bookings created from the public Agenda form lack a `resource_id` because the `book_slot()` RPC performs a direct INSERT without invoking `assignRoomForBooking()`. This creates inconsistent room assignment and blocks Google Calendar sync for Agenda-created bookings. Additionally, we need to distinguish booking sources (`docplanner` — existing, `agenda` — public form, `admin` — manual by admin, `professional` — manual by professional) to enable source-based analytics and access control.

## Scope

### In Scope
- New DB RPC `create_booking_with_resource(p_professional_id, p_start_time, p_end_time, p_booking_data, p_source)` that calls room assignment logic before inserting, mirroring `upsertBookingFromDP` in the DocPlanner edge function.
- Update `SupabaseBookingsService.bookSlot()` to accept an optional `source` parameter and route to the new RPC when source is not `admin` (manual admin creations keep the existing `book_slot` path).
- `source` field values: `agenda`, `admin`, `professional` (in addition to existing `docplanner`).
- Backward compatibility: existing `book_slot` RPC remains unchanged for admin-originated manual bookings.

### Out of Scope
- Modifications to DocPlanner flow (already working).
- Changes to the public Agenda form component itself (only how it calls `bookSlot`).
- Automatic Google Calendar sync triggers upon booking creation.

## Capabilities

### New Capabilities
- `booking-source-tracking`: Tracks booking origin via `source` field (`docplanner`, `agenda`, `admin`, `professional`).

### Modified Capabilities
- `booking-room-assignment`: Extends beyond DocPlanner to cover all booking sources via new `create_booking_with_resource` RPC.

## Approach

1. **DB RPC** (`create_booking_with_resource`): 
   - Accept `p_source` param to record origin.
   - Run `assignRoomForBooking()` logic (same pattern as DocPlanner edge function: try professional's `default_resource_id`, fall back to any available active room, skip conflicts).
   - Insert booking with resolved `resource_id`.
   - Returns `{ success, booking_id, resource_id, had_conflict }`.

2. **Angular Service Update** (`SupabaseBookingsService.bookSlot()`):
   - Add optional `source?: 'agenda' | 'admin' | 'professional' | 'docplanner'` param.
   - When `source === 'admin' || !source`: call existing `book_slot` RPC (admin manual bookings skip room assignment for backward compat).
   - Otherwise: call new `create_booking_with_resource` RPC.

3. **Agenda Form Call Site** (`event-form.component.ts`):
   - Pass `source: 'agenda'` to `bookSlot()`.

4. **DB Migration**: Add `source` column to `bookings` table if not exists.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | Migration adding `source` column to `bookings` |
| `supabase/migrations/` | New | Migration creating `create_booking_with_resource` RPC |
| `src/app/services/supabase-bookings.service.ts` | Modified | `bookSlot()` now accepts `source` param and routes to appropriate RPC |
| `src/app/shared/components/event-form/event-form.component.ts` | Modified | Pass `source: 'agenda'` to `bookSlot()` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing bookings without `source` | Low | Existing `book_slot` RPC untouched; admin path preserves backward compat |
| Room assignment race conditions | Low | Conflict check in `assignRoomForBooking` logic mirrors existing DocPlanner implementation |
| Edge case: no rooms available | Low | RPC returns `resource_id: null` with `had_conflict: true`; booking still proceeds |

## Rollback Plan

1. Revert DB migration (drop `create_booking_with_resource` RPC).
2. Revert Angular service changes — restore `bookSlot()` signature.
3. Reset any bookings that had `source` set incorrectly via targeted UPDATE.

## Dependencies

- `assignRoomForBooking()` pattern from `docplanner-api/index.ts` (reference implementation).
- Existing `bookings` table schema with `resource_id`, `company_id` columns.

## Success Criteria

- [ ] Bookings created from Agenda form have `resource_id` populated.
- [ ] Bookings have `source` field set correctly per origin.
- [ ] Existing admin bookings (via `book_slot`) are unaffected.
- [ ] No regression in DocPlanner booking flow.