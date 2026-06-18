/**
 * Pure helpers for resource-availability checks in the event-form modal.
 *
 * These functions exist to consolidate the "is this resource occupied at
 * [startMs, endMs)?" question in ONE place. Without them, the same overlap
 * test was duplicated in `freeResources`, `nextAvailableSuggestion`, and
 * `hasResourceConflict` — and one of the duplicates forgot to exclude
 * cancelled bookings, causing cancelled reservations to keep blocking
 * resources in the dropdown and the submit-time conflict toast.
 *
 * Rules (deliberate, see simplify-crm #bookings-bug-2026-06-17):
 *   - status === 'cancelled'  → does NOT occupy (room is free again)
 *   - status === 'no_show'    → DOES occupy     (client came, room was used,
 *                                                often charged)
 *   - any other status        → DOES occupy     (confirmed / pending / scheduled / undefined)
 *
 * These functions are pure (no Angular deps) so they can be unit-tested
 * directly with Jest without a TestBed.
 */

export interface OccupancyEvent {
  id?: string;
  localBooking?: { id?: string };
  start?: string | null;
  end?: string | null;
  extendedProps?: {
    shared?: {
      resourceId?: string;
      status?: string;
    };
  };
}

/**
 * Returns true if `event` occupies `resourceId` for the candidate
 * `[candidateStartMs, candidateEndMs)` interval.
 *
 * Strict interval overlap test: `start < eEnd && end > eStart` —
 * back-to-back reservations (17:00–17:45 and 17:45–18:30) DO NOT overlap.
 *
 * If `currentEventId` is provided, the event with that id is excluded
 * (used when editing — the event being edited should never conflict with itself).
 */
export function isResourceOccupied(
  event: OccupancyEvent,
  resourceId: string,
  candidateStartMs: number,
  candidateEndMs: number,
  currentEventId?: string,
): boolean {
  // 1. Must target this resource
  if (event.extendedProps?.shared?.resourceId !== resourceId) return false;

  // 2. Cancelled events never occupy the resource
  if (event.extendedProps?.shared?.status === 'cancelled') return false;

  // 3. Exclude the event currently being edited (self-conflict allowed)
  if (currentEventId) {
    const eventId = event.localBooking?.id || event.id;
    if (eventId === currentEventId) return false;
  }

  // 4. Must have valid start/end timestamps
  if (!event.start || !event.end) return false;

  // 5. Strict interval overlap: [start, end)
  const eStartMs = new Date(event.start).getTime();
  const eEndMs = new Date(event.end).getTime();
  return candidateStartMs < eEndMs && candidateEndMs > eStartMs;
}

/**
 * Filter a list of resources to only those that are FREE in the
 * `[candidateStartMs, candidateEndMs)` interval (no occupying event in
 * `allBookings`). Optional `resourceIdOf` lets callers map each resource
 * to the id used in `event.extendedProps.shared.resourceId` (defaults
 * to `r.id`).
 */
export function filterFreeResources<R extends { id: string }>(
  resources: R[],
  allBookings: OccupancyEvent[],
  candidateStartMs: number,
  candidateEndMs: number,
  currentEventId?: string,
  resourceIdOf: (r: R) => string = (r) => r.id,
): R[] {
  return resources.filter((r) =>
    !allBookings.some((event) =>
      isResourceOccupied(
        event,
        resourceIdOf(r),
        candidateStartMs,
        candidateEndMs,
        currentEventId,
      ),
    ),
  );
}