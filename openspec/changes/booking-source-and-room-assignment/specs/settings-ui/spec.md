# Delta for Booking Source Icons Settings (UI)

## ADDED Requirements

### Requirement: Source icons configuration UI

The Settings section under Reservas > Configuración > General MUST allow the company owner to view, create, edit, and delete icon configurations for each booking source (agenda, admin, professional, docplanner). Each configuration consists of an icon (text field, accepts emoji or icon class) and a label (text field, human-readable).

### Requirement: CRUD operations for source icons

The settings UI MUST support creating a new source icon entry, updating an existing entry's icon and/or label, and deleting an entry. Changes MUST be persisted to the `booking_source_icons` table and reflected immediately in the calendar view.

---

#### Scenario: Owner opens settings and sees existing icon configurations

- GIVEN the company owner navigates to Reservas > Configuración > General
- WHEN the page loads
- THEN the UI displays a list of all existing `booking_source_icons` entries with their source, icon, and label

#### Scenario: Owner adds a new source icon configuration

- GIVEN the owner is on the settings page
- WHEN they fill in the source ('docplanner'), icon ('🔗'), and label ('Docplanner') fields and save
- THEN a new row is inserted into `booking_source_icons` and appears in the list

#### Scenario: Owner edits an existing configuration

- GIVEN the owner is on the settings page and a row for source='agenda' exists
- WHEN they change the icon to '🗓️' and the label to 'Agenda bookings' and save
- THEN the row is updated and the calendar now shows 🗓️ for agenda bookings

#### Scenario: Owner deletes a configuration

- GIVEN the owner is on the settings page and a row for source='professional' exists
- WHEN they delete that row
- THEN the row is removed and professional bookings revert to displaying the default 💼 icon