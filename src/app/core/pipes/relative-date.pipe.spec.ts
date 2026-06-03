import { formatRelativeDate, formatExactDate } from './relative-date.pipe';

describe('RelativeDatePipe / formatRelativeDate', () => {
  let today: Date;

  /** Helper: build an ISO string N days before `today` */
  function daysAgo(n: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    // Keep time at noon to avoid DST edge cases
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }

  beforeEach(() => {
    // Freeze "now" to a known date for deterministic tests
    today = new Date(2026, 5, 15, 14, 30, 0); // 15 June 2026
    jasmine.clock().install();
    jasmine.clock().mockDate(today);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  // ── Edge cases ────────────────────────────────────────────────
  it('should return empty string for null/undefined/empty', () => {
    expect(formatRelativeDate(null)).toBe('');
    expect(formatRelativeDate(undefined)).toBe('');
    expect(formatRelativeDate('')).toBe('');
  });

  it('should return empty string for invalid date', () => {
    expect(formatRelativeDate('not-a-date')).toBe('');
    expect(formatRelativeDate('2026-13-45')).toBe('');
  });

  // ── Spec ranges ───────────────────────────────────────────────
  it('should return "Hoy" for same day (0 days)', () => {
    expect(formatRelativeDate(daysAgo(0))).toBe('Hoy');
  });

  it('should return "Ayer" for 1 day ago', () => {
    expect(formatRelativeDate(daysAgo(1))).toBe('Ayer');
  });

  it('should return "Hace 2 días" for 2 days ago', () => {
    expect(formatRelativeDate(daysAgo(2))).toBe('Hace 2 días');
  });

  it('should return "Hace 3 días" for 3 days ago', () => {
    expect(formatRelativeDate(daysAgo(3))).toBe('Hace 3 días');
  });

  it('should return "Hace 6 días" for 6 days ago', () => {
    expect(formatRelativeDate(daysAgo(6))).toBe('Hace 6 días');
  });

  it('should return "Hace 1 semana" for 7 days ago', () => {
    expect(formatRelativeDate(daysAgo(7))).toBe('Hace 1 semana');
  });

  it('should return "Hace 8 días" for 8 days ago', () => {
    expect(formatRelativeDate(daysAgo(8))).toBe('Hace 8 días');
  });

  it('should return "Hace 13 días" for 13 days ago', () => {
    expect(formatRelativeDate(daysAgo(13))).toBe('Hace 13 días');
  });

  it('should return "Hace 2 semanas" for 14 days ago', () => {
    expect(formatRelativeDate(daysAgo(14))).toBe('Hace 2 semanas');
  });

  it('should return "Hace 15 días" for 15 days ago', () => {
    expect(formatRelativeDate(daysAgo(15))).toBe('Hace 15 días');
  });

  it('should return "Hace 20 días" for 20 days ago', () => {
    expect(formatRelativeDate(daysAgo(20))).toBe('Hace 20 días');
  });

  it('should return "Hace más de 3 semanas" for 21 days ago', () => {
    expect(formatRelativeDate(daysAgo(21))).toBe('Hace más de 3 semanas');
  });

  it('should return "Hace más de 3 semanas" for 30 days ago', () => {
    expect(formatRelativeDate(daysAgo(30))).toBe('Hace más de 3 semanas');
  });

  it('should return "Hace 1 mes" for 31 days ago', () => {
    expect(formatRelativeDate(daysAgo(31))).toBe('Hace 1 mes');
  });

  it('should return "Hace 1 mes" for 60 days ago', () => {
    expect(formatRelativeDate(daysAgo(60))).toBe('Hace 1 mes');
  });

  it('should return exact date (dd/MM/yy) for >60 days ago', () => {
    expect(formatRelativeDate(daysAgo(61))).toBe('15/04/26');
  });

  it('should return exact date for far past (1 year)', () => {
    expect(formatRelativeDate(daysAgo(365))).toBe('15/06/25');
  });

  // ── Future dates ──────────────────────────────────────────────
  it('should return exact date for future dates', () => {
    const future = new Date(today);
    future.setDate(future.getDate() + 5);
    future.setHours(12, 0, 0, 0);
    expect(formatRelativeDate(future.toISOString())).toBe('20/06/26');
  });
});

describe('formatExactDate', () => {
  it('should format as dd/MM/yy', () => {
    const d = new Date(2026, 0, 5); // 5 Jan 2026
    expect(formatExactDate(d)).toBe('05/01/26');
  });

  it('should pad single digits', () => {
    const d = new Date(2026, 8, 3); // 3 Sep 2026
    expect(formatExactDate(d)).toBe('03/09/26');
  });
});
