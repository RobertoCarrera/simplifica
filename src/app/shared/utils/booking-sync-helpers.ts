/**
 * =============================================================================
 * BOOKING SYNC HELPERS
 * =============================================================================
 * Pure utility functions extracted from booking-settings and event-form
 * to make them testable in isolation. Each helper has a unit test in
 * booking-sync-helpers.spec.ts.
 *
 * Why these are helpers and not component methods:
 *   - `buildCleanExtendedProperties` was duplicated between the
 *     `forceFullSync` flow and the new-booking event-form flow. Both
 *     copies had the same bug: passing `null` values inside
 *     `extendedProperties.shared` caused Google Calendar API to
 *     return 400 "Required". Extracting + testing prevents future
 *     divergence.
 *   - `buildForceSkipEmailFlag` carries the operator's per-cancellation
 *     email preference from the dialog into the deleteEvent flow.
 *     Tested in isolation so a future refactor of
 *     `onDeleteEventConfirm` doesn't silently drop the flag.
 * =============================================================================
 */

/**
 * Strip null / undefined / empty-string values from a flat object.
 * Returns a new object containing only the keys whose value is a
 * non-empty string.
 *
 * Use case: building the body of `extendedProperties.shared` for a
 * Google Calendar event. PostgreSQL's JSON serializer treats `null`
 * differently from `undefined` (the latter is omitted, the former
 * serialises as the literal `null`). Google Calendar API's create-
 * event endpoint rejects the literal `null` with 400 "Required", so
 * we drop these keys entirely.
 */
export function stripNullishValues(
  source: Record<string, string | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined && value !== '') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Build the `extendedProperties.shared` payload for a Google Calendar
 * event. Wraps `stripNullishValues` with the canonical 10-key shape
 * used by the booking → Google sync flow. Centralising this here
 * prevents the two call sites (forceFullSync and event-form) from
 * drifting apart again.
 */
export function buildCleanExtendedProperties(input: {
  localBookingId: string;
  serviceId: string | null | undefined;
  clientId: string | null | undefined;
  professionalId: string | null | undefined;
  resourceId: string | null | undefined;
  sessionType: string | null | undefined;
  clientName: string | null | undefined;
  serviceName: string | null | undefined;
  professionalName: string | null | undefined;
  resourceName: string | null | undefined;
}): Record<string, string> {
  return stripNullishValues({
    localBookingId: input.localBookingId,
    serviceId: input.serviceId,
    clientId: input.clientId,
    professionalId: input.professionalId,
    resourceId: input.resourceId,
    sessionType: input.sessionType,
    clientName: input.clientName,
    serviceName: input.serviceName,
    professionalName: input.professionalName,
    resourceName: input.resourceName,
  });
}

/**
 * Compute the `__forceSkipCancellationEmail` flag for a delete event.
 * True when the operator unchecked the "send cancellation email"
 * box in the dialog. False when the default (send) is in effect.
 *
 * This flag is attached to the event object by the dialog handler
 * (`onDeleteEventConfirm`) and read by `deleteEvent` to decide
 * whether to skip the SES fallback email. The flag lives on the
 * event object as a private property (prefixed `__`) to avoid
 * polluting the public event type.
 */
export function buildForceSkipEmailFlag(
  sendCancellationEmail: boolean,
): boolean {
  return !sendCancellationEmail;
}

/**
 * Compute the `skipCancellationEmail` argument passed to
 * `SupabaseBookingsService.deleteBooking`. Combines the operator's
 * per-cancellation choice with the Google Calendar PATCH result
 * (the calendar-side notification, if it succeeded, also makes
 * the SES email redundant). Returns true when EITHER the
 * calendar notified OR the operator opted out.
 */
export function shouldSkipCancellationEmail(args: {
  gcalNotified: boolean;
  forceSkip: boolean;
}): boolean {
  return args.gcalNotified || args.forceSkip;
}
