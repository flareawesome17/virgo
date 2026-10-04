import { Fragment, type CSSProperties } from 'react';
import { MARQUEE_ROLES, MARQUEE_ROLES_B } from '../data/strings/ch8';

/**
 * The nine roles drifting across Ch8's sky. Static rows here; the motion is
 * Phase 4's, scroll-linked through one transform per row, so the words stop
 * when the reader stops. Not app UI, page type: Geist at the H2 scale, the
 * roles in the app's order, a small warm star between them.
 *
 * Each row holds the nine twice. One set is far wider than any screen at this
 * size (about 4,500 px on desktop, 1,800 on a phone), so a row can travel a
 * whole set, half of itself, in either direction without showing an end. Row
 * a runs left from 0; row b starts half along and runs right. The wrapper
 * clips sideways with `overflow-x: clip`, never `hidden`.
 *
 * Kept light for Ch8's stage budget (§1.12): two nodes a word, the star a
 * background painted from one `--role-star` variable rather than an SVG each,
 * about 75 nodes in all.
 *
 * `variant="chips"` is the reduced-motion form: the same nine as a wrapped
 * list, styled as the web profile's role badges (secondary: `#26221F`,
 * `#BCADA3`, pill), a step larger for a page.
 *
 * The marquee is aria-hidden; the chapter carries the roles as a visually
 * hidden list.
 *
 * Parts: role-marquee, marquee-row (data-row: a | b, data-direction),
 * role-word, role-chip.
 */

const SETS = 2;

/** The page's four-pointed star, warm, as a data URI: no request, one copy in the HTML. */
const STAR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 0c.5 4.2 3.8 7.5 8 8-4.2.5-7.5 3.8-8 8-.5-4.2-3.8-7.5-8-8 4.2-.5 7.5-3.8 8-8Z' fill='%23D18A5A'/%3E%3C/svg%3E\")";

function Row({ row, roles }: { row: 'a' | 'b'; roles: readonly string[] }) {
  const words = Array.from({ length: SETS }, () => roles).flat();
  return (
    <div
      data-part="marquee-row"
      data-row={row}
      data-direction={row === 'a' ? 'left' : 'right'}
      className={`flex w-max items-center whitespace-nowrap ${row === 'b' ? 'hidden md:flex' : ''}`}
      style={{ transform: row === 'b' ? `translateX(${-100 / SETS}%)` : undefined }}
    >
      {words.map((role, i) => (
        <Fragment key={`${role}-${i}`}>
          <span
            data-part="role-word"
            className={
              row === 'a'
                ? 'text-[#F2EDE8]/90'
                : 'text-transparent [-webkit-text-stroke:1px_rgba(188,173,163,0.6)]'
            }
          >
            {role}
          </span>
          <span
            aria-hidden
            className="mx-[0.42em] inline-block size-[0.32em] shrink-0 self-center bg-[image:var(--role-star)] bg-contain bg-center bg-no-repeat"
          />
        </Fragment>
      ))}
    </div>
  );
}

export function RoleMarquee({
  variant = 'marquee',
  className = '',
}: {
  /** `marquee`: one row on phones, two from md. `chips`: the reduced-motion list. */
  variant?: 'marquee' | 'chips';
  className?: string;
}) {
  if (variant === 'chips') {
    return (
      <div aria-hidden data-part="role-marquee" className={`flex flex-wrap gap-2 font-sans ${className}`}>
        {MARQUEE_ROLES.map((role) => (
          <span
            key={role}
            data-part="role-chip"
            className="inline-flex h-7 items-center rounded-full bg-[#26221F] px-3 text-[13px] font-medium text-[#BCADA3]"
          >
            {role}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-part="role-marquee"
      className={`flex flex-col gap-[0.14em] overflow-x-clip font-sans text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] ${className}`}
      style={{ '--role-star': STAR } as CSSProperties}
    >
      <Row row="a" roles={MARQUEE_ROLES} />
      <Row row="b" roles={MARQUEE_ROLES_B} />
    </div>
  );
}
