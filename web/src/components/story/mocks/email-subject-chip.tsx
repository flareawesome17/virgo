import type { ReactNode } from 'react';
import { Mail } from 'lucide-react';
import { EMAIL } from '../data/strings/ch4';

/**
 * The email the crew gets when the call time moves, as one line in an inbox
 * (storyboard Ch4, B10 EmailSubjectChip): "Desktop: below them, an email
 * subject chip: 'Moved: Reyes & Santos wedding is now 2026-12-12 at 06:00'."
 *
 * The subject and the sender are the app's: `eventChanged` in
 * `api/src/mail/mail.templates.ts` writes "Moved: <title> is now <when>",
 * with `when` in the API's own format (the ISO date, "at", and 24-hour time),
 * and mail goes out from MAIL_FROM_NAME, "Virgo". The chip around them is
 * generic inbox chrome — an envelope, the sender, the time it arrived and an
 * unread dot, in no mail client's style — and the chapter's footnote says so.
 * Desktop only, so it is drawn in the web palette with Geist.
 *
 * Parts: email-chip (data-state), email-from, email-subject, email-unread.
 */

export type EmailSubjectChipState = 'unread' | 'read';

/** The text unchanged, with each ISO date held on one line (it would break at a hyphen). */
function keepDates(text: string): ReactNode[] {
  return text.split(/(\d{4}-\d{2}-\d{2})/).map((piece, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap">
        {piece}
      </span>
    ) : (
      piece
    ),
  );
}

export function EmailSubjectChip({
  state = 'unread',
  className = '',
}: {
  /** unread: just arrived (bold, with the dot). read: opened. */
  state?: EmailSubjectChipState;
  className?: string;
}) {
  const unread = state === 'unread';
  return (
    <div
      data-part="email-chip"
      data-state={state}
      className={`flex w-full max-w-[460px] items-start gap-3 rounded-2xl border border-[#362F2B] bg-[#1E1B18] px-3.5 py-3 font-sans text-[#F2EDE8] ${className}`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[rgba(209,138,90,0.12)] text-[#D18A5A]">
        <Mail aria-hidden className="size-[17px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span data-part="email-from" className={`min-w-0 flex-1 text-[13px] ${unread ? 'font-semibold' : 'font-medium'}`}>
            {EMAIL.from}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-[#A08E84]">{EMAIL.time}</span>
        </span>
        <span
          data-part="email-subject"
          className={`mt-0.5 block text-[13px] leading-snug ${unread ? 'font-semibold text-[#F2EDE8]' : 'text-[#BCADA3]'}`}
        >
          {keepDates(EMAIL.subject)}
        </span>
      </span>
      <span
        data-part="email-unread"
        className="mt-1.5 size-2 shrink-0 rounded-full bg-[#D18A5A]"
        style={{ opacity: unread ? 1 : 0 }}
      />
    </div>
  );
}
