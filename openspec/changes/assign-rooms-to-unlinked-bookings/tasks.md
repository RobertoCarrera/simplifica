# Tasks: Assign Rooms to Unlinked Bookings

## Phase 1: Database / Backend

- [ ] 1.1 Create SQL migration `supabase/migrations/{timestamp}_bulk_assign_unlinked_bookings.sql` — adds `bulk_assign_unlinked_bookings(p_professional_id UUID, p_resource_id UUID) RETURNS jsonb` RPC; updates `resource_id` where `professional_id` = param AND `resource_id` IS NULL AND `status != 'cancelled'`; returns `{"updated": N}`; use `SECURITY DEFINER` with admin-only invocation
- [ ] 1.2 Create SQL migration `supabase/migrations/{timestamp}_get_unlinked_bookings_summary.sql` — adds view or RPC `get_unlinked_bookings_summary(company_id UUID)` returning professionals with unlinked booking count, their `default_resource_id`, and whether they have any resources
- [ ] 1.3 Verify RLS on `bookings` table allows owner/admin to call the RPCs (service role bypass acceptable for MVP)

## Phase 2: Frontend Service Layer

- [ ] 2.1 Add `getUnlinkedBookingsSummary(companyId: string)` to `supabase-bookings.service.ts` — calls RPC/view; returns array of `{ professionalId, professionalName, unlinkedCount, defaultResourceId, hasResources }` with pagination support
- [ ] 2.2 Add `bulkAssignUnlinkedBookings(professionalId: string, resourceId: string): Promise<{updated: number}>` to `supabase-bookings.service.ts` — calls RPC `bulk_assign_unlinked_bookings`
- [ ] 2.3 Add `getUnlinkedBookingsReport(companyId: string)` to `supabase-bookings.service.ts` — returns all unlinked bookings grouped by professional: `{ professionalId, professionalName, bookings: [{id, customerName, startTime, serviceName, status}] }`
- [ ] 2.4 Add `getProfessionalResources(professionalId: string)` to `supabase-resources.service.ts` — returns resources owned by or assigned to the professional
- [ ] 2.5 Add `syncRoomCalendars(): Promise<void>` to bookings or resources service — invokes `backfill-gcal-bookings` edge function with `mode: 'resources'`; fire-and-forget, non-blocking

## Phase 3: UI — BookingSettings Tab (Unlinked Bookings)

- [ ] 3.1 Add `'unlinked'` to the allowed tabs array in `booking-settings.component.ts`
- [ ] 3.2 Add "Unlinked Bookings" tab button to `booking-settings.component.html` tab navigation bar
- [ ] 3.3 Create `booking/tabs/unlinked/unlinked-bookings.component.ts` — receives `companyId` input; loads summary on init; exposes `assignRooms(professional)` method
- [ ] 3.4 Create `booking/tabs/unlinked/unlinked-bookings.component.html` — professional list with unlinked counts; resource dropdown per professional (pre-selected to `default_resource_id`); "Assign Rooms" button per row; expandable rows; pagination (50/page); loading skeleton; empty state "All bookings are linked to a room"
- [ ] 3.5 Wire `unlinked-bookings.component.ts` to call `bulkAssignUnlinkedBookings()` then fire `syncRoomCalendars()`; display toast: "Room assigned to N bookings" on success, error toast on failure

## Phase 4: UI — Sync Button (Resources Tab)

- [ ] 4.1 Locate Resources tab component (`booking/tabs/resources/` or equivalent); add "Sync Room Calendars" button to the tab header area
- [ ] 4.2 Wire button to call `syncRoomCalendars()`; show spinner + "Syncing…" while in progress; on success show brief green checkmark + "Sync complete — N bookings updated"; on failure show red warning: "Sync failed. Room assignments are saved. You can retry later." — button reverts to default state after 3s

## Phase 5: UI — Unlinked Bookings Report (Read-Only)

- [ ] 5.1 Create `booking/tabs/unlinked-report/unlinked-report.component.ts` — loads report via `getUnlinkedBookingsReport()` on init
- [ ] 5.2 Create `booking/tabs/unlinked-report/unlinked-report.component.html` — read-only table grouped by professional; columns: customer name, date/time, service name, "Not assigned" badge; expandable professional sections; empty state for professionals with no unlinked bookings
- [ ] 5.3 Wire "Unlinked Bookings" nav item in sidebar or booking settings to route to the new tab

## Phase 6: Integration / Verification

- [ ] 6.1 SQL test: call `bulk_assign_unlinked_bookings` directly — verify only unlinked + non-cancelled bookings are updated
- [ ] 6.2 SQL test: verify RPC is accessible only to owner/admin (test with regular professional auth)
- [ ] 6.3 Manual test (AC-1/2/3): navigate to Unlinked Bookings tab; select a professional; click Assign Rooms; verify `resource_id` updated on all eligible bookings
- [ ] 6.4 Manual test (AC-4): click "Sync Room Calendars" in Resources tab; verify `backfill-gcal-bookings?mode=resources` is invoked
- [ ] 6.5 Manual test (AC-5): navigate to Unlinked Bookings report; verify all unlinked bookings are listed grouped by professional
- [ ] 6.6 Manual test (AC-6): trigger a sync that fails; verify assignment persisted (reload page, check `resource_id` still set)
- [ ] 6.7 Manual test (AC-7): with no unlinked bookings; verify empty state displayed correctly
- [ ] 6.8 Manual test (AC-8): create a professional with no `default_resource_id` and no resources; verify warning indicator and disabled Assign button
- [ ] 6.9 Manual test (AC-9): create >50 professionals with unlinked bookings; verify pagination at 50/page
