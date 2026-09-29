import { isCalendarDate, isPastCalendarDate } from './calendar-date';

describe('calendar dates', () => {
  it('accepts real days and refuses the rest', () => {
    expect(isCalendarDate('2026-11-14')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    // Reached Postgres before and came back as a 500.
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2027-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('14/11/2026')).toBe(false);
    expect(isCalendarDate(20261114)).toBe(false);
  });

  it('calls a day past only once it is before yesterday', () => {
    const day = (offset: number) => {
      const d = new Date(Date.now() + offset * 86_400_000);
      return d.toISOString().slice(0, 10);
    };
    expect(isPastCalendarDate(day(-3))).toBe(true);
    // A day's grace for the eight hours between Manila and the server.
    expect(isPastCalendarDate(day(-1))).toBe(false);
    expect(isPastCalendarDate(day(0))).toBe(false);
    expect(isPastCalendarDate(day(30))).toBe(false);
  });
});
