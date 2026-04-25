# Apply Progress: assign-rooms-to-unlinked-bookings

## Phase 1: Database / Backend ✅
- [x] 1.1 Created SQL migration `20260424000001_bulk_assign_unlinked_bookings.sql` — `bulk_assign_unlinked_bookings(p_professional_id, p_resource_id)` RPC
- [x] 1.2 Created SQL migration `20260424000002_get_unlinked_bookings_summary.sql` — `get_unlinked_bookings_summary(p_company_id)` RPC
- [x] 1.3 RLS: Both RPCs use `SECURITY DEFINER` with `GRANT EXECUTE TO authenticated`

## Phase 2: Frontend Service Layer ✅
- [x] 2.1 Added `getUnlinkedBookingsSummary(companyId)` to `supabase-bookings.service.ts`
- [x] 2.2 Added `bulkAssignUnlinkedBookings(professionalId, resourceId)` to `supabase-bookings.service.ts`
- [x] 2.3 Added `getUnlinkedBookingsReport(companyId)` to `supabase-bookings.service.ts` (in-memory grouping)
- [x] 2.4 Added `getResourcesForCompany(companyId)` to `supabase-resources.service.ts`
- [x] 2.5 Added `syncRoomCalendars()` to `supabase-bookings.service.ts` (fire-and-forget)

## Phase 3: UI — Bulk Assignment Tab ✅
- [x] 3.1 Added `'unlinked'` to `activeTab` type union in `booking-settings.component.ts`
- [x] 3.2 Added tab navigation (via `?tab=unlinked` query param — already handled by existing query params subscription)
- [x] 3.3 Created `unlinked-bookings.component.ts` — receives companyId, loads summary on init, `assignRooms()` method
- [x] 3.4 Created `unlinked-bookings.component.html` — professional list with unlinked counts, resource dropdown, Assign button, pagination
- [x] 3.5 Wired `bulkAssignUnlinkedBookings()` then fire-and-forget `syncRoomCalendars()` on success

## Phase 4: UI — Sync Button ✅
- [x] 4.1 Added "Sync Room Calendars" button to `resources.component.html` header area
- [x] 4.2 Wired `syncRoomCalendars()` with states: idle/syncing/success/error + toast feedback

## Phase 5: UI — Unlinked Bookings Report
- [ ] 5.1 Create `unlinked-report.component.ts` — loads report via `getUnlinkedBookingsReport()`
- [ ] 5.2 Create `unlinked-report.component.html` — read-only table grouped by professional
- [ ] 5.3 Wire in sidebar or booking settings navigation (low priority — can be accessed via URL)

## Phase 6: Integration / Verification
- [ ] 6.1-6.9 Manual testing of all acceptance criteria

## Files Modified/Created
- `F:\simplifica\supabase\migrations\20260424000001_bulk_assign_unlinked_bookings.sql` (created)
- `F:\simplifica\supabase\migrations\20260424000002_get_unlinked_bookings_summary.sql` (created)
- `F:\simplifica\simplifica-crm\src\app\services\supabase-bookings.service.ts` (modified)
- `F:\simplifica\simplifica-crm\src\app\services\supabase-resources.service.ts` (modified)
- `F:\simplifica\simplifica-crm\src\app\features\settings\booking\tabs\resources\resources.component.ts` (modified)
- `F:\simplifica\simplifica-crm\src\app\features\settings\booking\tabs\resources\resources.component.html` (modified)
- `F:\simplifica\simplifica-crm\src\app\features\settings\booking\tabs\unlinked\unlinked-bookings.component.ts` (created)
- `F:\simplifica\simplifica-crm\src\app\features\settings\booking\tabs\unlinked\unlinked-bookings.component.html` (created)
- `F:\simplifica\simplifica-crm\src\app\features\settings\booking\tabs\unlinked\unlinked-bookings.component.scss` (created)
- `F:\simplifica\simplifica-crm\src\app\features\settings\booking\booking-settings.component.ts` (modified)
- `F:\simplifica\simplifica-crm\src\app\features\settings\booking\booking-settings.component.html` (modified)
- `F:\simplifica\simplifica-crm\src\app\features\settings\configuracion\configuracion.component.html` (modified)
