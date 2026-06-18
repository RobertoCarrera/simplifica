import { QuoteListComponent } from './quote-list.component';
import { Quote, QuoteStatus } from '../../../models/quote.model';

/**
 * Pure-logic specs for getActionDate() and isOverdue(). These don't
 * need TestBed because they don't depend on any Angular service.
 */
describe('QuoteListComponent — getActionDate / isOverdue (pure logic)', () => {
  // Create a minimal instance bypassing the constructor and DI entirely
  const component: Pick<QuoteListComponent,
    'getActionDate' | 'isOverdue'
  > = Object.create(QuoteListComponent.prototype);

  const make = (overrides: Partial<Quote>): Quote => ({
    id: 'Q',
    company_id: 'C',
    status: QuoteStatus.DRAFT,
    quote_date: '2026-01-01',
    valid_until: '2026-12-31',
    accepted_at: null,
    rejected_at: null,
    ...overrides,
  } as Quote);

  describe('getActionDate', () => {
    it('returns valid_until for draft quotes', () => {
      expect(component.getActionDate(make({ status: QuoteStatus.DRAFT, valid_until: '2026-12-31' }))).toBe('2026-12-31');
    });

    it('returns valid_until for sent quotes', () => {
      expect(component.getActionDate(make({ status: QuoteStatus.SENT }))).toBe('2026-12-31');
    });

    it('returns valid_until for viewed quotes', () => {
      expect(component.getActionDate(make({ status: QuoteStatus.VIEWED }))).toBe('2026-12-31');
    });

    it('returns valid_until for expired quotes', () => {
      expect(component.getActionDate(make({ status: QuoteStatus.EXPIRED }))).toBe('2026-12-31');
    });

    it('returns accepted_at for accepted quotes', () => {
      const result = component.getActionDate(make({ status: QuoteStatus.ACCEPTED, accepted_at: '2026-06-01T10:00:00Z' }));
      expect(result).toBe('2026-06-01T10:00:00Z');
    });

    it('returns rejected_at for rejected quotes', () => {
      const result = component.getActionDate(make({ status: QuoteStatus.REJECTED, rejected_at: '2026-06-15T14:00:00Z' }));
      expect(result).toBe('2026-06-15T14:00:00Z');
    });

    it('falls back to quote_date when accepted_at is missing on an accepted quote', () => {
      const result = component.getActionDate(make({ status: QuoteStatus.ACCEPTED, accepted_at: null, quote_date: '2026-05-01' }));
      expect(result).toBe('2026-05-01');
    });

    it('falls back to quote_date when valid_until is missing on a draft', () => {
      const result = component.getActionDate(make({ status: QuoteStatus.DRAFT, valid_until: undefined, quote_date: '2026-04-01' }));
      expect(result).toBe('2026-04-01');
    });

    it('returns undefined when both valid_until and quote_date are missing', () => {
      const result = component.getActionDate(make({ status: QuoteStatus.DRAFT, valid_until: undefined, quote_date: undefined }));
      expect(result).toBeUndefined();
    });
  });

  describe('isOverdue', () => {
    it('true for a draft whose valid_until is in the past', () => {
      expect(component.isOverdue(make({ status: QuoteStatus.DRAFT, valid_until: '2020-01-01' }))).toBeTrue();
    });

    it('true for a sent whose valid_until is yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(component.isOverdue(make({ status: QuoteStatus.SENT, valid_until: yesterday.toISOString().slice(0, 10) }))).toBeTrue();
    });

    it('false for a draft whose valid_until is in the future', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(component.isOverdue(make({ status: QuoteStatus.DRAFT, valid_until: tomorrow.toISOString().slice(0, 10) }))).toBeFalse();
    });

    it('false for an accepted quote regardless of valid_until', () => {
      expect(component.isOverdue(make({ status: QuoteStatus.ACCEPTED, valid_until: '2020-01-01' }))).toBeFalse();
    });

    it('false for a rejected quote regardless of valid_until', () => {
      expect(component.isOverdue(make({ status: QuoteStatus.REJECTED, valid_until: '2020-01-01' }))).toBeFalse();
    });

    it('false for a cancelled quote regardless of valid_until', () => {
      expect(component.isOverdue(make({ status: QuoteStatus.CANCELLED, valid_until: '2020-01-01' }))).toBeFalse();
    });

    it('false for an expired quote regardless of valid_until', () => {
      expect(component.isOverdue(make({ status: QuoteStatus.EXPIRED, valid_until: '2020-01-01' }))).toBeFalse();
    });

    it('false when valid_until is missing', () => {
      expect(component.isOverdue(make({ status: QuoteStatus.DRAFT, valid_until: undefined }))).toBeFalse();
    });
  });
});
