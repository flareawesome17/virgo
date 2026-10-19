import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * A real calendar day written YYYY-MM-DD.
 *
 * The format alone was checked, so 2026-02-30 passed validation and reached
 * Postgres, whose `::date` cast refused it — a 500, "The server had a problem",
 * for a typo in a date field.
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d;
}

/**
 * Before yesterday, in UTC.
 *
 * A day's grace rather than "before today": the people typing these are in
 * Manila, eight hours ahead of the server's clock, and their today is not
 * always the server's.
 */
export function isPastCalendarDate(value: string): boolean {
  const now = new Date();
  const yesterday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 86_400_000;
  const [y, m, d] = value.split('-').map(Number);
  return Date.UTC(y, m - 1, d) < yesterday;
}

/**
 * Validates a YYYY-MM-DD field as a real day, and with `notPast` as one that
 * has not gone by — for dates a job or an enquiry is about to be made for.
 */
export function IsCalendarDate(options: { notPast?: boolean } & ValidationOptions = {}) {
  const { notPast, ...validation } = options;
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: {
        message: (args) =>
          isCalendarDate(args.value)
            ? 'That date has already passed'
            : 'Use a real date, like 2026-11-14',
        ...validation,
      },
      validator: {
        validate: (value: unknown) =>
          isCalendarDate(value) && !(notPast && isPastCalendarDate(value)),
      },
    });
}
