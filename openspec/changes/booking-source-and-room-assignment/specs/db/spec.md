# Delta for Booking Source Icons (DB)

## ADDED Requirements

### Requirement: booking_source_icons table

The system MUST store custom icon configurations per booking source per company in the `booking_source_icons` table with columns: `company_id` (uuid, FK), `source` (text, CHECK IN ('agenda','admin','professional','docplanner')), `icon` (text, emoji or class), `label` (text). PK is (company_id, source).

### Requirement: create_booking_with_resource RPC

The system MUST provide a PostgreSQL RPC named `create_booking_with_resource(p_professional_id uuid, p_start_time timestamptz, p_end_time timestamptz, p_booking_data jsonb, p_source text)` that:
1. Calls `assignRoomForBooking(p_professional_id, p_start_time, p_end_time)` to acquire a room resource.
2. Returns an error if no room is available.
3. Inserts a booking record with the returned `resource_id` and the `p_source` value.

### Requirement: bookings.source column

The `bookings` table MUST have a `source` column of type text with default 'admin', visible in the public schema, allowing null values.

### Requirement: Default source icons

The system MUST use these fallback icons when no custom icon is configured: agenda→📅, admin→👤, professional→💼, docplanner→🔗.

---

#### Scenario: Custom icon configured for a source

- GIVEN a company has a `booking_source_icons` row with source='agenda' and icon='🗓️'
- WHEN a booking with source='agenda' is queried
- THEN the calendar UI displays 🗓️ for that event

#### Scenario: No custom icon configured — fallback

- GIVEN a company has no `booking_source_icons` row for source='docplanner'
- WHEN a booking with source='docplanner' is displayed
- THEN the calendar UI displays 🔗

#### Scenario: RPC acquires room and inserts booking

- GIVEN a professional with id p_professional_id exists and a room is available for the time range [p_start_time, p_end_time]
- WHEN `create_booking_with_resource` is called with p_source='professional'
- THEN a booking is inserted with resource_id pointing to the assigned room and source='professional'

#### Scenario: RPC errors when no room available

- GIVEN no room is available for the requested time range
- WHEN `create_booking_with_resource` is called
- THEN the RPC returns an error and no booking is created