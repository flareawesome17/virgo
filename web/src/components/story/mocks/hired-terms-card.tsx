import { Briefcase, BriefcaseBusiness, Check, Loader2 } from 'lucide-react';
import { APPLICANT, BOOKING, TERMS, type Hire } from '../data/strings/ch3';
import { webButton } from './booking-badge';

/**
 * The first thing in a job's chat: the job, the role, the terms, and the one
 * action that matters (storyboard Ch3, B10 HiredTermsCard). "On Ernie's
 * phone, the chat opens with the HIRED AS VIDEOGRAPHER card… Confirm presses.
 * Cut to Mika's side: 'They confirmed these terms.'"
 *
 * - `platform="phone"` is `mobile/components/JobAcceptedCard.tsx`: a 16 px
 *   card on `#1E1B18` with a `#362F2B` border, the eyebrow uppercase with
 *   tracking, the terms as label/value rows, the state line, the full-width
 *   buttons and the footnote.
 * - `platform="web"` is `web/src/components/chat/job-accepted-card.tsx`:
 *   the same content as a max-w-md card, Geist, with small buttons.
 *
 * Sides are never mixed in one state. The person hired (`side="creative"`)
 * sees "They set these terms…" and the only Confirm button; the poster
 * (`side="poster"`) sees "They have not confirmed these terms yet." and
 * "Change the terms". The date is the booking's, as `toLocaleDateString()`
 * prints it ("12/12/2026"); the rate opens at the top of the role's budget.
 *
 * Deviations, all for legibility or AA: the eyebrow and footnote are 11 px
 * (the phone app draws 10 px); the phone's Confirm button is `#A85D35` rather
 * than the card's `#B66A40`, which is under 4.5:1 with white at 13 px (§1.5).
 *
 * Parts: terms-card (data-side, data-state), terms-eyebrow, terms-title,
 * terms-rows, terms-date, terms-location, terms-rate, terms-state,
 * confirm-button, view-button, terms-foot.
 */

export type HiredTermsCardProps = (
  | {
      side?: 'creative';
      /** needs-you: unconfirmed. confirming: Confirm pressed, in flight. confirmed: agreed. */
      state?: 'needs-you' | 'confirming' | 'confirmed';
    }
  | {
      side: 'poster';
      /** waiting: not confirmed yet. agreed: they confirmed. */
      state?: 'waiting' | 'agreed';
    }
) & {
  platform?: 'phone' | 'web';
  hire?: Hire;
  className?: string;
};

export function HiredTermsCard(props: HiredTermsCardProps) {
  const { platform = 'phone', hire = 'ernie', className = '' } = props;
  const side = props.side ?? 'creative';
  const state = props.state ?? (side === 'creative' ? 'confirmed' : 'agreed');
  const agreed = state === 'confirmed' || state === 'agreed';
  const confirming = state === 'confirming';
  const showConfirm = side === 'creative' && !agreed;

  const line =
    side === 'creative'
      ? agreed
        ? BOOKING.detail.creative.agreed
        : BOOKING.detail.creative['needs-you']
      : agreed
        ? BOOKING.detail.poster.agreed
        : BOOKING.detail.poster.waiting;
  const second = side === 'poster' ? TERMS.changeTerms : TERMS.viewBooking;
  const foot = `${TERMS.foot} ${side === 'poster' ? TERMS.footPoster : TERMS.footCreative}`;
  const a = APPLICANT[hire];
  const rows = [
    { part: 'terms-date', label: TERMS.date, value: TERMS.dateValue, strong: false },
    { part: 'terms-location', label: TERMS.location, value: TERMS.locationValue, strong: false },
    { part: 'terms-rate', label: TERMS.rate, value: a.rate, strong: true },
  ];

  if (platform === 'web') {
    return (
      <div
        data-part="terms-card"
        data-side={side}
        data-state={state}
        className={`w-full max-w-md rounded-[16.8px] border border-[#362F2B] bg-[#1E1B18] p-4 font-sans text-[#F2EDE8] shadow-sm ${className}`}
      >
        <div
          data-part="terms-eyebrow"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#A08E84]"
        >
          <BriefcaseBusiness aria-hidden className="size-3.5" />
          {TERMS.hiredAs(hire)}
        </div>
        <p data-part="terms-title" className="mt-1.5 text-[15px] font-bold leading-snug">
          {TERMS.postTitle}
        </p>
        <dl data-part="terms-rows" className="mt-3 space-y-1.5 border-t border-[#362F2B] pt-3 text-sm">
          {rows.map((r) => (
            <div key={r.part} data-part={r.part} className="flex items-baseline justify-between gap-4">
              <dt className="text-[#A08E84]">{r.label}</dt>
              <dd className={`text-right ${r.strong ? 'font-semibold' : ''}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
        <p data-part="terms-state" className="mt-3 text-xs leading-relaxed text-[#A08E84]">
          {line}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {showConfirm && (
            <span data-part="confirm-button" className={webButton('default', confirming)}>
              {confirming ? <Loader2 aria-hidden className="size-4" /> : <Check aria-hidden className="size-4" />}
              {TERMS.confirm}
            </span>
          )}
          <span data-part="view-button" className={webButton('outline')}>
            {second}
          </span>
        </div>
        <p data-part="terms-foot" className="mt-3 text-[11px] leading-relaxed text-[#A08E84]">
          {foot}
        </p>
      </div>
    );
  }

  return (
    <div
      data-part="terms-card"
      data-side={side}
      data-state={state}
      className={`flex flex-col gap-2 rounded-[16px] border border-[#362F2B] bg-[#1E1B18] p-4 text-[#F2EDE8] ${className}`}
    >
      <div data-part="terms-eyebrow" className="flex items-center gap-1.5">
        <Briefcase aria-hidden size={12} color="#9ca3af" />
        <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#A08E84]">{TERMS.hiredAs(hire)}</span>
      </div>
      <p data-part="terms-title" className="text-[15px] font-bold leading-snug">
        {TERMS.postTitle}
      </p>
      <div data-part="terms-rows" className="flex flex-col gap-1.5 border-t border-[#362F2B] pt-2.5">
        {rows.map((r) => (
          <div key={r.part} data-part={r.part} className="flex items-baseline justify-between gap-4">
            <span className="text-[12px] text-[#A08E84]">{r.label}</span>
            <span className={`flex-1 text-right text-[12px] ${r.strong ? 'font-bold' : ''}`}>{r.value}</span>
          </div>
        ))}
      </div>
      <p data-part="terms-state" className="text-[11px] leading-5 text-[#A08E84]">
        {line}
      </p>
      {showConfirm && (
        <span
          data-part="confirm-button"
          className="flex items-center justify-center rounded-[12px] bg-[#A85D35] py-3"
          style={{ opacity: confirming ? 0.5 : 1 }}
        >
          <span className="text-[13px] font-bold text-white">{TERMS.confirm}</span>
        </span>
      )}
      <span
        data-part="view-button"
        className="flex items-center justify-center rounded-[12px] border border-[#362F2B] py-3"
      >
        <span className="text-[13px] font-bold">{second}</span>
      </span>
      <p data-part="terms-foot" className="text-[11px] leading-4 text-[#A08E84]">
        {foot}
      </p>
    </div>
  );
}
