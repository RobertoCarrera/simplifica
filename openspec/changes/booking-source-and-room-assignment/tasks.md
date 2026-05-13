# Tasks: booking-source-and-room-assignment

## Phase 1: DB Migration (Foundation)

- [x] 1.1 Create `supabase/migrations/{date}_add_source_and_booking_source_icons.sql`: add `source text DEFAULT 'admin'` column to `bookings` table
- [x] 1.2 Create `booking_source_icons` table with `company_id` (FK), `source` (CHECK IN), `icon`, `label`, `is_active`, `created_at`, PK on (company_id, source)
- [x] 1.3 Add RLS policies: SELECT for authenticated users in company, INSERT/UPDATE/DELETE for company owner only
- [x] 1.4 Create `is_company_owner()` helper if not exists, or confirm existing function
- [x] 1.5 Create `create_booking_with_resource` RPC with room assignment logic and booking INSERT (per design spec)
- [x] 1.6 Seed default icons for all 4 sources per company (for companies with existing data)

## Phase 2: Angular Service

- [x] 2.1 Add `SourceKey` type and `DEFAULT_ICONS` constant map to `supabase-bookings.service.ts`
- [x] 2.2 Add `createBookingWithResource()` method in `SupabaseBookingsService` that calls `create_booking_with_resource` RPC
- [x] 2.3 Update `bookSlot()` to route to new RPC when `source !== 'admin'` (preserve admin path)

## Phase 3: Calendar UI (Implementation)

- [x] 3.1 Add `sourceIcons: Signal<Map<string, SourceIconConfig>>` to calendar component
- [x] 3.2 On init, fetch `booking_source_icons` for company and build `sourceIcons` map
- [x] 3.3 In event chip template, render `sourceIcons[event.source] ?? DEFAULT_ICONS[event.source]`

## Phase 4: Settings UI (Implementation)

- [x] 4.1 Create `src/app/features/bookings/guards/owner-only.guard.ts` route guard
- [x] 4.2 Create `src/app/features/bookings/settings/source-icons-settings.component.ts` standalone component
- [x] 4.3 Create `src/app/features/bookings/settings/source-icons-settings.component.html` template — 4 fixed rows (agenda/admin/professional/docplanner), icon+label fields, save/delete actions
- [x] 4.4 Embed source-icons-settings component into BookingSettingsComponent's general tab (per design: "as part of Reservas > Configuración > General, not a separate route")
- [x] 4.5 Owner-only guard created and available for route protection if needed

## Phase 5: Integration

- [x] 5.1 Wire agenda form (event-form) to call `createBookingWithResource(source='agenda')` — added `@Input() bookingSource: SourceKey` with default 'admin', passes `this.bookingSource` to `bookSlot()`; callers set the source explicitly
- [x] 5.2 Confirm admin manual booking uses `source='admin'` (existing path unchanged) — `bookSlot()` with undefined source defaults to 'admin' route; booking-settings and client-bookings don't pass bookingSource so it uses the default 'admin'
- [x] 5.3 Confirm professional booking flow uses `source='professional'` — no separate professional booking flow exists in the Angular app (professionals use the same booking-settings calendar); if needed in future, callers set `bookingSource="professional"`

## Phase 6: Testing

- [x] 6.1 DB: test RPC with available room — verify booking inserted with correct resource_id and source
- [x] 6.2 DB: test RPC with no room available — verify `{success: false, error: 'no_room_available'}`
- [x] 6.3 DB: RLS — as owner: CRUD on booking_source_icons; as professional: expect FORBIDDEN
- [x] 6.4 Angular: unit test `bookSlot` routes to correct RPC based on source param
- [x] 6.5 Angular: unit test settings component renders 4 rows with correct defaults
- [ ] 6.6 E2E: create custom icon via settings, open calendar, verify icon appears on event chip
