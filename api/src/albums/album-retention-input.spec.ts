import { BadRequestException } from '@nestjs/common';
import { manilaToday, normalizeRetention } from './albums.service';

const TODAY = '2026-10-05';

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return ((err as BadRequestException).getResponse() as { code?: string }).code;
  }
  return undefined;
}

describe('normalizeRetention', () => {
  it('leaves an album that says nothing about retention alone', () => {
    expect(normalizeRetention({ name: 'Wedding' }, TODAY)).toEqual({ name: 'Wedding' });
  });

  it('clears the date when days are chosen', () => {
    expect(normalizeRetention({ retention_days: 45 }, TODAY)).toEqual({
      retention_days: 45,
      retention_until: null,
    });
  });

  it('clears the days when a date is chosen', () => {
    expect(normalizeRetention({ retention_until: '2027-03-31' }, TODAY)).toEqual({
      retention_until: '2027-03-31',
      retention_days: null,
    });
  });

  it('reads 0 days as off, as it always has', () => {
    expect(normalizeRetention({ retention_days: 0 }, TODAY)).toEqual({ retention_days: null });
  });

  it('turns both off when both are null', () => {
    expect(
      normalizeRetention({ retention_days: null, retention_until: null }, TODAY),
    ).toEqual({ retention_days: null, retention_until: null });
  });

  it('refuses days and a date together', () => {
    expect(
      code(() => normalizeRetention({ retention_days: 30, retention_until: '2027-01-01' }, TODAY)),
    ).toBe('RETENTION_BOTH');
  });

  it('refuses a day that is not on the calendar', () => {
    expect(code(() => normalizeRetention({ retention_until: '2027-02-30' }, TODAY))).toBe(
      'RETENTION_DATE_INVALID',
    );
  });

  it('refuses today and the past, which would empty the album overnight', () => {
    expect(code(() => normalizeRetention({ retention_until: TODAY }, TODAY))).toBe(
      'RETENTION_DATE_PAST',
    );
    expect(code(() => normalizeRetention({ retention_until: '2026-01-01' }, TODAY))).toBe(
      'RETENTION_DATE_PAST',
    );
  });

  it('accepts tomorrow', () => {
    expect(normalizeRetention({ retention_until: '2026-10-06' }, TODAY).retention_until).toBe(
      '2026-10-06',
    );
  });

  it('refuses a date more than ten years away', () => {
    expect(code(() => normalizeRetention({ retention_until: '2036-12-31' }, TODAY))).toBe(
      'RETENTION_DATE_FAR',
    );
    expect(normalizeRetention({ retention_until: '2036-10-02' }, TODAY).retention_until).toBe(
      '2036-10-02',
    );
  });
});

describe('manilaToday', () => {
  it('is the date in Manila, not the server', () => {
    // 17:00 UTC on the 5th is 01:00 on the 6th in Manila.
    expect(manilaToday(new Date('2026-10-05T17:00:00Z'))).toBe('2026-10-06');
    expect(manilaToday(new Date('2026-10-05T15:59:00Z'))).toBe('2026-10-05');
  });
});
