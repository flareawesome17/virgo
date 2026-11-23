/**
 * An application that holds its role: accepted, with a booking that has not
 * been cancelled.
 *
 * Accepted alone was the rule, and a cancelled booking left its application
 * accepted — so the role read filled for ever, the poster could never hire
 * anyone else for it, and a post whose only booking fell through dropped off
 * the board. An accepted application from before bookings existed has none,
 * and still holds its role.
 */
export const HOLDS_ROLE = (a: string): string => `(${a}.status = 'accepted'
  and not exists (select 1 from job_bookings jb
                   where jb.application_id = ${a}.id
                     and jb.cancelled_at is not null))`;
