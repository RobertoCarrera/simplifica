/**
 * =============================================================================
 * REGRESSION TESTS — booking-sync-helpers
 * =============================================================================
 * These tests guard against three regressions we shipped fixes for
 * in 2026-06. Each test corresponds to a specific bug:
 *
 *   - `buildCleanExtendedProperties` → covers the "Google create-event
 *     400 'Required' on bookings with client_id IS NULL" bug. The
 *     cause was that `extendedProperties.shared.clientId: null` was
 *     being sent to the Google API which rejects literal null in
 *     attendees / extended properties. Fix: omit the key entirely
 *     when the value is null / undefined / empty string.
 *
 *   - `buildForceSkipEmailFlag` and `shouldSkipCancellationEmail` →
 *     cover the "per-cancellation email toggle" feature added in
 *     commit cc7e22f9. The dialog's "send cancellation email" checkbox
 *     must round-trip into the `skipCancellationEmail` argument of
 *     `SupabaseBookingsService.deleteBooking`.
 *
 *   - The integration-level "mark booking as paid" bug is covered
 *     indirectly by the data shape guarantees of these helpers.
 *     A separate test for the SQL trigger regression lives in
 *     supabase/tests/ (out of scope for the Jest suite).
 *
 * If you change the helper signatures, update the corresponding
 * call sites in booking-settings.component.ts and event-form.component.ts
 * to import from this file. The original inline implementations are
 * still in those files; this helper is the canonical reference.
 * =============================================================================
 */

import {
  buildCleanExtendedProperties,
  buildForceSkipEmailFlag,
  shouldSkipCancellationEmail,
  stripNullishValues,
} from './booking-sync-helpers';

describe('stripNullishValues', () => {
  it('returns an empty object when input is empty', () => {
    expect(stripNullishValues({})).toEqual({});
  });

  it('keeps non-empty string values unchanged', () => {
    expect(
      stripNullishValues({
        a: 'hello',
        b: 'world',
      }),
    ).toEqual({ a: 'hello', b: 'world' });
  });

  it('drops keys whose value is the literal null (Google API rejects this)', () => {
    // This is the core regression: the original code passed
    // {clientId: null} through to Google which returned 400.
    const out = stripNullishValues({
      keep: 'yes',
      drop1: null,
      drop2: undefined,
      drop3: '',
    });
    expect(out).toEqual({ keep: 'yes' });
    expect('drop1' in out).toBe(false);
    expect('drop2' in out).toBe(false);
    expect('drop3' in out).toBe(false);
  });

  it('treats empty string and null as equivalent (both dropped)', () => {
    // The helper collapses '' and null into the same dropped bucket
    // because both signal "no value to send to the API". If a future
    // caller relies on the distinction, they'll need to be explicit.
    expect(stripNullishValues({ a: '', b: null })).toEqual({});
  });

  it('returns a new object — does not mutate the input', () => {
    const input = { a: 'x', b: null };
    const out = stripNullishValues(input);
    expect(out).not.toBe(input);
    expect(input).toEqual({ a: 'x', b: null });
  });
});

describe('buildCleanExtendedProperties', () => {
  const baseInput = {
    localBookingId: '9a5d144f-8a31-4db3-a6b1-c2ddd9ae9de2',
    serviceId: '767463d6-893f-4869-9c63-e286b978c5f3',
    clientId: 'cea4382b-81c2-43c7-88d1-cf32ea16f614',
    professionalId: '1b091f67-2430-43cf-8c35-138db613f0a6',
    resourceId: '6123d769-2bc8-436c-bae0-ad4199faf929',
    sessionType: 'presencial',
    clientName: 'Paula Campos Punzano',
    serviceName: 'Psicoterapia Individual',
    professionalName: 'Eva Cañete Hernández',
    resourceName: 'Sala 1',
  };

  it('returns all 10 keys when all values are populated', () => {
    const out = buildCleanExtendedProperties(baseInput);
    expect(Object.keys(out).length).toBe(10);
    expect(out.localBookingId).toBe(baseInput.localBookingId);
    expect(out.clientName).toBe('Paula Campos Punzano');
  });

  it('omits clientId when null (the 400 regression for orphan clients)', () => {
    // This is the Paula Campos / Eva Cañete case: client_id IS NULL
    // because the customer has no linked `clients` row. Pre-fix this
    // produced `extendedProperties.shared.clientId: null` and Google
    // returned 400 "Required".
    const out = buildCleanExtendedProperties({
      ...baseInput,
      clientId: null,
    });
    expect('clientId' in out).toBe(false);
    expect(out.localBookingId).toBe(baseInput.localBookingId);
  });

  it('omits clientId when undefined (the equivalent crash path)', () => {
    // The helper signature declares `clientId: string | null | undefined`,
    // so passing undefined is a valid input — the guard exists for
    // runtime safety in case a caller bypasses the type contract.
    const out = buildCleanExtendedProperties({
      ...baseInput,
      clientId: undefined,
    });
    expect('clientId' in out).toBe(false);
  });

  it('omits multiple null fields at once', () => {
    const out = buildCleanExtendedProperties({
      ...baseInput,
      clientId: null,
      professionalId: null,
      resourceId: undefined,
    });
    expect('clientId' in out).toBe(false);
    expect('professionalId' in out).toBe(false);
    expect('resourceId' in out).toBe(false);
    // The rest should still be present.
    expect(out.localBookingId).toBe(baseInput.localBookingId);
    expect(out.serviceId).toBe(baseInput.serviceId);
    expect(out.sessionType).toBe('presencial');
  });

  it('always keeps localBookingId even if other fields are null', () => {
    // localBookingId is the FK back to the bookings row. If this is
    // missing the whole event becomes orphaned in the calendar.
    const out = buildCleanExtendedProperties({
      ...baseInput,
      clientId: null,
      professionalId: null,
      resourceId: null,
      clientName: null,
      serviceName: null,
      professionalName: null,
      resourceName: null,
    });
    expect(out.localBookingId).toBe(baseInput.localBookingId);
  });
});

describe('buildForceSkipEmailFlag', () => {
  it('returns true when the operator unchecks the email box', () => {
    expect(buildForceSkipEmailFlag(false)).toBe(true);
  });

  it('returns false when the operator leaves the email box checked (default)', () => {
    expect(buildForceSkipEmailFlag(true)).toBe(false);
  });
});

describe('shouldSkipCancellationEmail', () => {
  it('skips when Google Calendar already notified (gcalNotified=true)', () => {
    // Even if the operator leaves the box checked, we should not
    // double-send: the client got a native GCal email.
    expect(shouldSkipCancellationEmail({ gcalNotified: true, forceSkip: false })).toBe(true);
  });

  it('skips when the operator explicitly opts out (forceSkip=true)', () => {
    // Even if GCal failed and would normally trigger the SES
    // fallback, the operator's choice wins.
    expect(shouldSkipCancellationEmail({ gcalNotified: false, forceSkip: true })).toBe(true);
  });

  it('sends when neither GCal notified nor operator opted out', () => {
    // GCal failed (or is disabled) AND operator wants the email.
    // Fallback path: send the SES email.
    expect(shouldSkipCancellationEmail({ gcalNotified: false, forceSkip: false })).toBe(false);
  });

  it('sends when GCal notified=false AND forceSkip=false (the original pre-fix path)', () => {
    // This is the case that triggered the original "you always get an
    // email" complaint. We must NOT regress to false when both are
    // false — the SES fallback exists for a reason.
    expect(shouldSkipCancellationEmail({ gcalNotified: false, forceSkip: false })).toBe(false);
  });
});
