import { Check, ChevronDown, Ellipsis, Eye, Loader2, MessageCircle, Star, Trash, Trash2, X } from 'lucide-react';
import { APPLICANT, APPLICANT_ROW, HIRES, JOB_ROW, JOB_ROW_PHONE, newPill, type Hire } from '../data/strings/ch3';
import { Avatar } from './avatar';
import { BookingBadge, Faces, webBadge, webButton } from './booking-badge';

/**
 * The poster's side of an application (storyboard Ch3, B10 ApplicantRow):
 * "On the poster's applicant row, Accept presses."
 *
 * `platform="web"` follows `web/src/app/(app)/jobs/mine/page-client.tsx`:
 *
 * - `ApplicantRow` is one entry of `Applicants`: a bordered 12 px box with a
 *   32 px muted avatar (two letters), the name, their roles, an outline badge
 *   with the role applied for, "See their work", and Accept / Shortlist /
 *   Decline. Once answered it prints the raw status in a default badge,
 *   lowercase ("accepted": the capitalised "Accepted" belongs to the
 *   applicant's own view in application-state.tsx), then the booking the
 *   acceptance created (`BookingBadge`) and "Open chat".
 * - `ApplicantsCard` is the `JobRow` card the rows live in, open: the post's
 *   title, its meta line, a badge per role that turns from "open" to
 *   "filled" as each person is accepted, the Open badge, the applicant count
 *   with its "N new" pill, and the rows. Web dark: Geist, primary `#D18A5A`
 *   on `#161311` for badges, the action fill `#A85D35` for Accept.
 *
 * `platform="phone"` follows the same screen on the phone,
 * `mobile/components/JobsTabs.tsx` (the Posted tab's JobRow and Applicants),
 * for mobile Ch3's phone-styled sheet: a 16 px card, role pills, the
 * applicant count as a primary link, Edit / Mark filled / Close, then each
 * applicant on the background colour with a 30 px face, the status in
 * uppercase emerald, Accept as a 44 px pill, and the booking as a bordered
 * line. The app shows a photo or a flat placeholder for the face; the story
 * draws tinted initials, as it does for every face.
 *
 * Deviations: text is never under 11 px (the app's pills and status are
 * 10 px), and the phone's small `#B66A40` text is `#D18A5A`, its `#B66A40`
 * fills `#A85D35`, so both clear AA (§1.5). Where a row is too narrow for
 * its one line, the badges wrap below the name rather than collide (the app
 * squeezes the name instead); at the app's usual widths the line is the same.
 *
 * Parts (suffixed with the hire, so three rows in one card stay unique):
 * applicant-<hire> (data-state), accept-<hire>, applicant-status-<hire>,
 * open-chat-<hire>; and the booking's parts inside, suffixed the same way
 * (booking-badge-<hire>…). The card adds job-row (data-state, data-platform),
 * role-<role> (faces open/filled), new-pill (faces 3/2/1).
 */

export type ApplicantState = 'new' | 'accepting' | 'accepted' | 'agreed';
export type Platform = 'web' | 'phone';

const PHONE_INK = '#D18A5A';

/**
 * The name and roles column. The app lets it shrink to nothing; here it keeps
 * room for a first name, and when the line is too narrow for that (text here
 * is never under 11 px, so the pills run wider than the app's), the badges
 * move as one to a second line instead of running into the name. Wherever
 * the app's single line fits, this draws exactly that line.
 */
const NAME_COLUMN = 'min-w-[2.75rem] flex-1 basis-0';

function PhoneApplicantRow({ hire, state, className }: { hire: Hire; state: ApplicantState; className: string }) {
  const a = APPLICANT[hire];
  const answered = state === 'accepted' || state === 'agreed';
  const busy = state === 'accepting';

  return (
    <div
      data-part={`applicant-${hire}`}
      data-state={state}
      className={`flex flex-col gap-2 rounded-[12px] bg-[#161311] p-3 text-[#F2EDE8] ${className}`}
    >
      <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1.5">
        <Avatar surface="phone-nearby" name={a.name} size={30} />
        <div className={NAME_COLUMN}>
          <p className="text-[13px] font-semibold leading-[18px]" style={{ color: PHONE_INK }}>
            {a.name}
          </p>
          <p className="text-[11px] leading-4 text-[#A08E84]">{a.roles}</p>
        </div>
        <span className="ml-auto flex shrink-0 items-start gap-2.5">
          <span className="rounded-full border border-[rgba(136,136,136,0.27)] px-2 py-0.5 text-[11px] font-bold leading-4 text-[#A08E84]">
            {a.role}
          </span>
          {answered && (
            <span
              data-part={`applicant-status-${hire}`}
              className="text-[11px] font-bold uppercase leading-[22px] text-[#10b981]"
            >
              {APPLICANT_ROW.accepted}
            </span>
          )}
          <Ellipsis aria-hidden size={16} className="mt-[3px] text-[#A08E84]" />
        </span>
      </div>

      <p className="text-[12px] font-semibold leading-4" style={{ color: PHONE_INK }}>
        {APPLICANT_ROW.seeWork}
      </p>

      {answered ? (
        <>
          <BookingBadge platform="phone" hire={hire} suffix={hire} side="poster" state={state === 'agreed' ? 'agreed' : 'waiting'} />
          <span data-part={`open-chat-${hire}`} className="flex items-center gap-1.5" style={{ color: PHONE_INK }}>
            <MessageCircle aria-hidden size={13} />
            <span className="text-[12px] font-semibold">{APPLICANT_ROW.openChat}</span>
          </span>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span
            data-part={`accept-${hire}`}
            // The phone's rounded-lg: the theme's radius × 1.5.
            className="flex min-h-11 items-center gap-1.5 rounded-[21px] bg-[#A85D35] px-3 text-white"
          >
            {busy ? <Loader2 aria-hidden size={13} /> : <Check aria-hidden size={13} />}
            <span className="text-[12px] font-bold">{APPLICANT_ROW.accept}</span>
          </span>
          <span className="flex min-h-11 items-center gap-1.5 px-2.5 text-[#A08E84]">
            <Star aria-hidden size={13} />
            <span className="text-[12px] font-semibold">{APPLICANT_ROW.shortlist}</span>
          </span>
          <span className="ml-auto flex min-h-11 items-center gap-1.5 px-2.5 text-[#A08E84]">
            <X aria-hidden size={13} />
            <span className="text-[12px]">{APPLICANT_ROW.decline}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export function ApplicantRow({
  hire = 'ernie',
  state = 'agreed',
  platform = 'web',
  className = '',
}: {
  hire?: Hire;
  /**
   * new: waiting on Mika. accepting: Accept pressed, the request in flight
   * (spinner; on the web the buttons dim). accepted: hired, the booking
   * waiting on them. agreed: they confirmed the terms (the end of Ch3).
   */
  state?: ApplicantState;
  platform?: Platform;
  className?: string;
}) {
  if (platform === 'phone') return <PhoneApplicantRow hire={hire} state={state} className={className} />;

  const a = APPLICANT[hire];
  const answered = state === 'accepted' || state === 'agreed';
  const busy = state === 'accepting';

  return (
    <div
      data-part={`applicant-${hire}`}
      data-state={state}
      className={`rounded-[12px] border border-[#362F2B] p-3 font-sans text-[#F2EDE8] ${className}`}
    >
      <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1.5">
        <Avatar surface="web-muted" name={a.name} />
        <div className={NAME_COLUMN}>
          <p className="text-sm font-semibold">{a.name}</p>
          <p className="text-xs text-[#A08E84]">{a.roles}</p>
        </div>
        <span className="ml-auto flex shrink-0 items-start gap-2.5">
          <span className={webBadge('outline')}>{a.role}</span>
          {answered && (
            <span data-part={`applicant-status-${hire}`} className={webBadge('default')}>
              {APPLICANT_ROW.accepted}
            </span>
          )}
        </span>
      </div>

      <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#D18A5A]">
        <Eye aria-hidden className="size-3.5" />
        {APPLICANT_ROW.seeWork}
      </span>

      {answered ? (
        <div className="mt-2.5 space-y-2.5">
          <BookingBadge hire={hire} suffix={hire} side="poster" state={state === 'agreed' ? 'agreed' : 'waiting'} />
          <span data-part={`open-chat-${hire}`} className={webButton('outline')}>
            <MessageCircle aria-hidden className="size-4" />
            {APPLICANT_ROW.openChat}
          </span>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5">
          <span data-part={`accept-${hire}`} className={webButton('default', busy)}>
            {busy ? <Loader2 aria-hidden className="size-4" /> : <Check aria-hidden className="size-4" />}
            {APPLICANT_ROW.accept}
          </span>
          <span className={webButton('outline', busy)}>
            <Star aria-hidden className="size-4" />
            {APPLICANT_ROW.shortlist}
          </span>
          <span className={webButton('ghost', busy)}>
            <X aria-hidden className="size-4" />
            {APPLICANT_ROW.decline}
          </span>
        </div>
      )}
    </div>
  );
}

/** Who has been accepted at each beat of Ch3's "Accept ×3". */
export type ApplicantsBeat = 'new' | 'ernie' | 'kenn' | 'filled' | 'agreed';

const ROWS: Record<ApplicantsBeat, Record<Hire, ApplicantState>> = {
  new: { ernie: 'new', kenn: 'new', bea: 'new' },
  ernie: { ernie: 'accepted', kenn: 'new', bea: 'new' },
  kenn: { ernie: 'accepted', kenn: 'accepted', bea: 'new' },
  filled: { ernie: 'accepted', kenn: 'accepted', bea: 'accepted' },
  agreed: { ernie: 'agreed', kenn: 'accepted', bea: 'accepted' },
};

const ROLE_OF: Record<Hire, string> = {
  ernie: APPLICANT.ernie.role,
  kenn: APPLICANT.kenn.role,
  bea: APPLICANT.bea.role,
};

const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** The "N new" pill, every count drawn in place so a stage can count it down. */
function NewPill({ waiting, platform }: { waiting: number; platform: Platform }) {
  const look =
    platform === 'web'
      ? 'ml-1 bg-[#D18A5A] text-[#161311]'
      : 'bg-[#A85D35] text-white';
  return (
    <Faces
      part="new-pill"
      on={String(waiting)}
      faces={Object.fromEntries(
        [3, 2, 1].map((n) => [
          String(n),
          <span key={n} className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums ${look}`}>
            {newPill(n)}
          </span>,
        ]),
      )}
    />
  );
}

export function ApplicantsCard({
  state = 'agreed',
  accepting,
  platform = 'web',
  className = '',
}: {
  /**
   * new: three applications, none answered. ernie / kenn: accepted so far.
   * filled: all three accepted, every booking waiting on them. agreed: Ernie
   * has confirmed his terms (the end of Ch3).
   */
  state?: ApplicantsBeat;
  /** Draw this person's row mid-press (only while their row is still new). */
  accepting?: Hire;
  platform?: Platform;
  className?: string;
}) {
  const rows = ROWS[state];
  const stateOf = (h: Hire): ApplicantState => (h === accepting && rows[h] === 'new' ? 'accepting' : rows[h]);
  const waiting = HIRES.filter((h) => rows[h] === 'new').length;
  const isFilled = (h: Hire) => rows[h] === 'accepted' || rows[h] === 'agreed';

  if (platform === 'phone') {
    return (
      <div
        data-part="job-row"
        data-state={state}
        data-platform={platform}
        className={`flex flex-col gap-2.5 rounded-[16px] bg-[#1E1B18] p-4 text-[#F2EDE8] ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold leading-snug">{JOB_ROW.title}</p>
            <p className="mt-0.5 text-[11px] text-[#A08E84]">{JOB_ROW.meta}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {HIRES.map((h) => (
                <Faces
                  key={h}
                  part={`role-${kebab(ROLE_OF[h])}`}
                  on={isFilled(h) ? 'filled' : 'open'}
                  faces={{
                    open: (
                      <span className="block rounded-full border border-[#B66A4060] px-2 py-0.5 text-[11px] font-bold leading-4 text-[#D18A5A]">
                        {ROLE_OF[h]} · {JOB_ROW.open}
                      </span>
                    ),
                    filled: (
                      <span className="block rounded-full border border-[rgba(136,136,136,0.2)] px-2 py-0.5 text-[11px] font-bold leading-4 text-[#9ca3af]">
                        {ROLE_OF[h]} · {JOB_ROW.filled}
                      </span>
                    ),
                  }}
                />
              ))}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[#B66A4020] px-2.5 py-1 text-[11px] font-bold leading-4 text-[#D18A5A]">
            {JOB_ROW.status}
          </span>
        </div>

        {/* One line, as the app draws it. Where that line is too narrow (a
            small phone with the "N new" pill showing), the controls move as one
            to the next line instead of running off the card. */}
        <div className="flex flex-wrap items-center gap-x-3">
          <span className="flex shrink-0 items-center gap-1.5" style={{ color: PHONE_INK }}>
            <ChevronDown aria-hidden size={14} className="rotate-180" />
            <span className="whitespace-nowrap text-[12px] font-semibold">{JOB_ROW.applicants}</span>
            {waiting > 0 && <NewPill waiting={waiting} platform="phone" />}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="flex min-h-11 items-center whitespace-nowrap px-2.5 text-[12px] font-semibold" style={{ color: PHONE_INK }}>
                {JOB_ROW_PHONE.edit}
              </span>
              <span className="flex min-h-11 items-center whitespace-nowrap px-2.5 text-[12px] font-semibold text-[#A08E84]">
                {JOB_ROW.markFilled}
              </span>
              <span className="flex min-h-11 items-center whitespace-nowrap px-2.5 text-[12px] font-semibold text-[#A08E84]">
                {JOB_ROW.close}
              </span>
            </span>
            <Trash aria-hidden size={15} color="#ef4444" />
          </span>
        </div>

        <div className="flex flex-col gap-2 border-t border-[#362F2B] pt-3">
          {HIRES.map((h) => (
            <ApplicantRow key={h} hire={h} platform="phone" state={stateOf(h)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-part="job-row"
      data-state={state}
      data-platform={platform}
      className={`flex flex-col gap-4 overflow-hidden rounded-[16.8px] bg-[#1E1B18] py-4 font-sans text-sm text-[#F2EDE8] ring-1 ring-[rgba(242,237,232,0.1)] ${className}`}
    >
      <div className="space-y-3 px-4 pt-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-snug">{JOB_ROW.title}</p>
            <p className="mt-0.5 text-xs text-[#A08E84]">{JOB_ROW.meta}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {HIRES.map((h) => (
                <Faces
                  key={h}
                  part={`role-${kebab(ROLE_OF[h])}`}
                  on={isFilled(h) ? 'filled' : 'open'}
                  faces={{
                    open: (
                      <span className={`${webBadge('outline')} text-[11px] font-normal`}>
                        {ROLE_OF[h]} · {JOB_ROW.open}
                      </span>
                    ),
                    filled: (
                      <span className={`${webBadge('secondary')} text-[11px] font-normal opacity-60`}>
                        {ROLE_OF[h]} · {JOB_ROW.filled}
                      </span>
                    ),
                  }}
                />
              ))}
            </p>
          </div>
          <span className={webBadge('default')}>{JOB_ROW.status}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={webButton('outline')}>
            <ChevronDown aria-hidden className="size-4 rotate-180" />
            {JOB_ROW.applicants}
            {waiting > 0 && <NewPill waiting={waiting} platform="web" />}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D18A5A]">
            <Eye aria-hidden className="size-3.5" />
            {JOB_ROW.viewPost}
          </span>
          <span className={`${webButton('ghost')} ml-auto`}>{JOB_ROW.markFilled}</span>
          <span className={`${webButton('ghost')} text-[#A08E84]`}>{JOB_ROW.close}</span>
          <span className={`${webButton('ghost')} text-[#A08E84]`}>
            <Trash2 aria-hidden className="size-4" />
          </span>
        </div>

        <div className="space-y-2 border-t border-[#362F2B] pt-3">
          {HIRES.map((h) => (
            <ApplicantRow key={h} hire={h} state={stateOf(h)} />
          ))}
        </div>
      </div>
    </div>
  );
}
