# Delta for Calendar Booking Source Icons (UI)

## ADDED Requirements

### Requirement: Display source icon on calendar events

The calendar component MUST display the configured source icon on each booking event chip. The system SHOULD fetch the `booking_source_icons` map for the company on component initialization and use it to resolve icons per booking source.

### Requirement: Icon fallback chain

The calendar MUST use custom icons from `booking_source_icons` when available, and fall back to default emoji icons (agenda→📅, admin→👤, professional→💼, docplanner→🔗) otherwise.

---

#### Scenario: Booking with custom icon configured

- GIVEN the current company's `booking_source_icons` contains an entry for source='agenda' with icon='🗓️'
- WHEN the calendar renders a booking event with source='agenda'
- THEN the event chip shows 🗓️ alongside the booking title

#### Scenario: Booking with no custom icon — fallback icon shown

- GIVEN the current company has no `booking_source_icons` entry for source='admin'
- WHEN the calendar renders a booking event with source='admin'
- THEN the event chip shows 👤

#### Scenario: Multiple bookings with different sources

- GIVEN the calendar displays bookings from sources 'agenda', 'professional', and 'admin'
- WHEN the calendar renders
- THEN each booking chip shows the correct icon per source (🗓️ for agenda, 💼 for professional, 👤 for admin)