import { isResourceOccupied, filterFreeResources, OccupancyEvent } from './resource-availability.util';

/**
 * Spec for resource-availability.util.ts
 *
 * Reproduces the bug found on 2026-06-17 where cancelled bookings were
 * still blocking resources in the event-form dropdown (Sala 4 was marked
 * "(ocupado)" even though its only bookings in that window were cancelled).
 *
 * Times use Europe/Madrid DST offset (+02:00) to stay realistic for the CRM.
 */

const SALA_4 = 'sala-4';
const SALA_1 = 'sala-1';

const newBookingStart = '2026-06-17T17:00:00+02:00';
const newBookingEnd = '2026-06-17T18:00:00+02:00';
const newBookingStartMs = new Date(newBookingStart).getTime();
const newBookingEndMs = new Date(newBookingEnd).getTime();

const buildEvent = (overrides: Partial<OccupancyEvent> = {}): OccupancyEvent => ({
  id: 'evt-1',
  start: newBookingStart,
  end: newBookingEnd,
  extendedProps: { shared: { resourceId: SALA_4, status: 'confirmed' } },
  ...overrides,
});

describe('resource-availability.util', () => {
  describe('isResourceOccupied', () => {
    it('does NOT occupy when status is cancelled (the bug we are fixing)', () => {
      const cancelledInSala4 = buildEvent({
        extendedProps: { shared: { resourceId: SALA_4, status: 'cancelled' } },
      });
      expect(
        isResourceOccupied(
          cancelledInSala4,
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
        ),
      ).toBe(false);
    });

    it('DOES occupy when status is confirmed', () => {
      const confirmedInSala4 = buildEvent();
      expect(
        isResourceOccupied(
          confirmedInSala4,
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
        ),
      ).toBe(true);
    });

    it('DOES occupy when status is no_show (client came, room was used)', () => {
      const noShowInSala4 = buildEvent({
        extendedProps: { shared: { resourceId: SALA_4, status: 'no_show' } },
      });
      expect(
        isResourceOccupied(
          noShowInSala4,
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
        ),
      ).toBe(true);
    });

    it('DOES occupy when status is undefined (defensive default)', () => {
      const noStatus = buildEvent({
        extendedProps: { shared: { resourceId: SALA_4 } },
      });
      expect(
        isResourceOccupied(
          noStatus,
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
        ),
      ).toBe(true);
    });

    it('does NOT occupy a different resource (resourceId mismatch)', () => {
      const confirmedInSala1 = buildEvent({
        extendedProps: { shared: { resourceId: SALA_1, status: 'confirmed' } },
      });
      expect(
        isResourceOccupied(
          confirmedInSala1,
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
        ),
      ).toBe(false);
    });

    it('does NOT occupy when event has no resourceId at all', () => {
      const noResource = buildEvent({ extendedProps: { shared: {} } });
      expect(
        isResourceOccupied(
          noResource,
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
        ),
      ).toBe(false);
    });

    it('does NOT occupy when event is missing start or end', () => {
      expect(
        isResourceOccupied(
          buildEvent({ start: null }),
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
        ),
      ).toBe(false);
      expect(
        isResourceOccupied(
          buildEvent({ end: null }),
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
        ),
      ).toBe(false);
    });

    it('allows back-to-back reservations (strict < overlap)', () => {
      // existing: 17:00–17:45 in Sala 4 confirmed
      const backToBackPrev = buildEvent({
        start: '2026-06-17T17:00:00+02:00',
        end: '2026-06-17T17:45:00+02:00',
      });
      // candidate: 17:45–18:30
      const candidateStart = new Date('2026-06-17T17:45:00+02:00').getTime();
      const candidateEnd = new Date('2026-06-17T18:30:00+02:00').getTime();
      expect(
        isResourceOccupied(
          backToBackPrev,
          SALA_4,
          candidateStart,
          candidateEnd,
        ),
      ).toBe(false);
    });

    it('flags real overlap (candidate ends after existing starts)', () => {
      // existing: 16:45–17:30 in Sala 4
      const existing = buildEvent({
        start: '2026-06-17T16:45:00+02:00',
        end: '2026-06-17T17:30:00+02:00',
      });
      // candidate: 16:00–17:00
      const candidateStart = new Date('2026-06-17T16:00:00+02:00').getTime();
      const candidateEnd = new Date('2026-06-17T17:00:00+02:00').getTime();
      expect(isResourceOccupied(existing, SALA_4, candidateStart, candidateEnd)).toBe(true);
    });

    it('does NOT occupy the event being edited (self-conflict allowed)', () => {
      const sameEvent = buildEvent({ id: 'self-id-123' });
      expect(
        isResourceOccupied(
          sameEvent,
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
          'self-id-123',
        ),
      ).toBe(false);
    });

    it('recognises self-id when stored under localBooking.id', () => {
      const sameEvent = buildEvent({
        id: 'top-level',
        localBooking: { id: 'nested-self-id' },
      });
      expect(
        isResourceOccupied(
          sameEvent,
          SALA_4,
          newBookingStartMs,
          newBookingEndMs,
          'nested-self-id',
        ),
      ).toBe(false);
    });
  });

  describe('filterFreeResources', () => {
    const resources = [
      { id: SALA_1, name: 'Sala 1' },
      { id: SALA_4, name: 'Sala 4' },
      { id: 'sala-2', name: 'Sala 2' },
      { id: 'sala-3', name: 'Sala 3' },
    ];

    it('includes Sala 4 when its only conflict is cancelled (the bug fix)', () => {
      const bookings = [
        buildEvent({
          extendedProps: { shared: { resourceId: SALA_4, status: 'cancelled' } },
        }),
      ];
      const result = filterFreeResources(
        resources,
        bookings,
        newBookingStartMs,
        newBookingEndMs,
      );
      expect(result.map((r) => r.id)).toEqual(['sala-1', 'sala-4', 'sala-2', 'sala-3']);
    });

    it('excludes Sala 4 when it has a confirmed conflict', () => {
      const bookings = [
        buildEvent({
          extendedProps: { shared: { resourceId: SALA_4, status: 'confirmed' } },
        }),
      ];
      const result = filterFreeResources(
        resources,
        bookings,
        newBookingStartMs,
        newBookingEndMs,
      );
      expect(result.map((r) => r.id)).toEqual(['sala-1', 'sala-2', 'sala-3']);
    });

    it('still excludes Sala 4 when conflict is no_show', () => {
      const bookings = [
        buildEvent({
          extendedProps: { shared: { resourceId: SALA_4, status: 'no_show' } },
        }),
      ];
      const result = filterFreeResources(
        resources,
        bookings,
        newBookingStartMs,
        newBookingEndMs,
      );
      expect(result.map((r) => r.id)).toEqual(['sala-1', 'sala-2', 'sala-3']);
    });

    it('respects self-conflict exclusion (editing own event)', () => {
      const ownEventId = 'my-event-id';
      const bookings = [
        buildEvent({
          id: ownEventId,
          // Same Sala 4, same interval, but it IS the event being edited
          extendedProps: { shared: { resourceId: SALA_4, status: 'confirmed' } },
        }),
      ];
      const result = filterFreeResources(
        resources,
        bookings,
        newBookingStartMs,
        newBookingEndMs,
        ownEventId,
      );
      expect(result.map((r) => r.id)).toEqual(['sala-1', 'sala-4', 'sala-2', 'sala-3']);
    });

    it('returns all resources when no bookings exist', () => {
      const result = filterFreeResources(
        resources,
        [],
        newBookingStartMs,
        newBookingEndMs,
      );
      expect(result).toEqual(resources);
    });
  });
});