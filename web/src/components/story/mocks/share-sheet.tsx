import { Check, Image as ImageIcon, Music, Video, type LucideIcon } from 'lucide-react';
import { ALERT, LINK_URL, SHEET, SHEET_COUNTS, SHEET_ROWS, type ShareKind } from '../data/strings/ch6';

/**
 * The phone app's "Client link" sheet and the alert that follows it (Ch6,
 * mobile), drawn from `mobile/app/(app)/albums/[albumId]/index.tsx` (the
 * link sheet, LINK_SCOPE_ROWS, createLink) and `components/BottomSheet.tsx`,
 * in the phone's dark palette.
 *
 * Sizes are the device's. NativeWind inlines `rem` at 14 pt on the phone
 * (nativewind 4.2.1's `withNativeWind` defaults `inlineRem` to 14 and the
 * app's metro config keeps it), so every rem class renders at 7/8 of its web
 * size: `text-sm` is 12.25 on 17.5, `px-4` 14, `rounded-2xl` 14. Explicit
 * pixels (`w-[22px]`, icon sizes, the ScrollView's padding) are as written.
 * One phone point is one CSS pixel here.
 *
 * - BottomSheet: the shade is `#161311` at 72% (B8); the sheet is the card
 *   colour `#1E1B18` with 21 px top corners (`rounded-t-3xl`) and a
 *   31.5 × 3.5 handle in the border colour; 20 px sides and 8 px top (the
 *   ScrollView's own numbers), and the home indicator's 34 px below.
 * - The title 15.75 px bold; the intro 12.25 px muted.
 * - Three rows, 7 px apart: 14 px radius, 1 px border, 14 × 12.25 px padding.
 *   Ticked: primary/10 fill and primary/30 border. The box is 22 px with the
 *   app's `rounded-md` (its 14 pt radius, so it draws round): `#A85D35` with a
 *   white 14 px tick, or a 2 px border when clear. Then a 17 px icon
 *   (`#D18A5A` when ticked), the label 12.25 px semibold and the album's count
 *   (10.5 px in the app; 11 here, the story's floor).
 * - "Make link": 14 px radius, `#A85D35`, 14 px bold white; while it works,
 *   a spinner and "Making the link…".
 *
 * Both are overlays: they fill the nearest positioned box (`PhoneFrame`'s
 * content) and sit over whatever screen is drawn behind them.
 *
 * Parts (sheet): share-sheet (data-state), sheet-shade, sheet, sheet-handle,
 * sheet-title, sheet-intro, row-image / row-video / row-audio (data-on),
 * box-image / box-video / box-audio, make-link (data-state: ready | making),
 * make-spinner.
 */

export type ShareSheetState = 'fresh' | 'scoped' | 'making' | 'reopened' | 'rescoped';

/**
 * In story order. Sunday: the sheet opens with everything ticked (no link
 * yet), Films and Audio are unticked, and the link is made. Three weeks
 * later it reopens on what the link shows, Photos, and Films and Audio are
 * ticked. The counts are the album's own at each moment.
 */
export const SHARE_SHEET_STATES: Record<
  ShareSheetState,
  { kinds: readonly ShareKind[]; day: keyof typeof SHEET_COUNTS; making: boolean }
> = {
  fresh: { kinds: ['image', 'video', 'audio'], day: 'sunday', making: false },
  scoped: { kinds: ['image'], day: 'sunday', making: false },
  making: { kinds: ['image'], day: 'sunday', making: true },
  reopened: { kinds: ['image'], day: 'later', making: false },
  rescoped: { kinds: ['image', 'video', 'audio'], day: 'later', making: false },
};

const ICONS: Record<ShareKind, LucideIcon> = { image: ImageIcon, video: Video, audio: Music };

/** BottomSheet's shade in dark: the background at B8. */
export const SHEET_SHADE = '#161311B8';

const on = (yes: boolean) => (yes ? '' : undefined);

/** ActivityIndicator, small, in the action foreground: a ring with one bright arc. */
function Spinner() {
  return (
    <svg data-part="make-spinner" width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="2.25" />
      <path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" fill="none" stroke="#FFFFFF" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

export function ShareSheet({
  state = 'rescoped',
  shade = true,
  className = '',
}: {
  state?: ShareSheetState;
  /** The dim over the screen behind. Off when a stage fades it on its own. */
  shade?: boolean;
  className?: string;
}) {
  const s = SHARE_SHEET_STATES[state];
  const counts = SHEET_COUNTS[s.day];

  return (
    <div
      aria-hidden
      data-part="share-sheet"
      data-state={state}
      className={`absolute inset-0 z-10 flex flex-col justify-end ${className}`}
    >
      {shade && <div data-part="sheet-shade" className="absolute inset-0" style={{ background: SHEET_SHADE }} />}
      <div data-part="sheet" className="relative rounded-t-[21px] bg-[#1E1B18] pb-[34px] text-[#F2EDE8]">
        <div className="flex justify-center pb-[3.5px] pt-[8.75px]">
          <span data-part="sheet-handle" className="h-[3.5px] w-[31.5px] rounded-full bg-[#362F2B]" />
        </div>
        <div className="px-5 pb-4 pt-2">
          <p data-part="sheet-title" className="mb-[14px] text-[15.75px] font-bold leading-[24.5px]">
            {SHEET.title}
          </p>
          <p data-part="sheet-intro" className="-mt-[7px] mb-[14px] text-[12.25px] leading-[17.5px] text-[#A08E84]">
            {SHEET.intro}
          </p>
          <div className="flex flex-col gap-[7px]">
            {SHEET_ROWS.map((row) => {
              const Icon = ICONS[row.kind];
              return (
                <div
                  key={row.kind}
                  data-part={`row-${row.kind}`}
                  data-on={on(s.kinds.includes(row.kind))}
                  className="group/row flex items-center gap-[10.5px] rounded-[14px] border border-[#362F2B] px-[14px] py-[12.25px] data-[on]:border-[rgba(209,138,90,0.3)] data-[on]:bg-[rgba(209,138,90,0.1)]"
                >
                  <span
                    data-part={`box-${row.kind}`}
                    className="flex size-[22px] shrink-0 items-center justify-center rounded-[14px] border-2 border-[#362F2B] group-data-[on]/row:border-0 group-data-[on]/row:bg-[#A85D35]"
                  >
                    <Check aria-hidden size={14} className="text-white opacity-0 group-data-[on]/row:opacity-100" />
                  </span>
                  <Icon aria-hidden size={17} className="shrink-0 text-[#A08E84] group-data-[on]/row:text-[#D18A5A]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.25px] font-semibold leading-[17.5px]">{row.label}</span>
                    <span className="mt-[1.75px] block text-[11px] leading-[14px] text-[#A08E84]">{counts[row.kind]}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div
            data-part="make-link"
            data-state={s.making ? 'making' : 'ready'}
            className="group/make mt-[17.5px] flex items-center justify-center gap-[7px] rounded-[14px] bg-[#A85D35] py-[12.25px]"
          >
            <span className="hidden group-data-[state=making]/make:inline-flex">
              <Spinner />
            </span>
            <span className="text-[14px] font-bold leading-[21px] text-white">
              <span className="group-data-[state=making]/make:hidden">{SHEET.make}</span>
              <span className="hidden group-data-[state=making]/make:inline">{SHEET.making}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "Client link ready": the native alert `createLink` raises once the link
 * exists, with the URL as its message and Copy link, Share… and Done. This is
 * the operating system's alert, not Virgo's, so it is drawn neutral, like
 * the generic lock screen: neither iOS's nor Android's, with its buttons in
 * the app's order. One key frame; the URL is the same on Sunday and three
 * weeks later.
 *
 * Parts: link-alert, alert-dim, alert, alert-title, alert-url, alert-copy,
 * alert-share, alert-done.
 */
export function LinkReadyAlert({ dim = true, className = '' }: { dim?: boolean; className?: string }) {
  return (
    <div
      aria-hidden
      data-part="link-alert"
      className={`absolute inset-0 z-20 flex items-center justify-center px-9 ${className}`}
    >
      {dim && <div data-part="alert-dim" className="absolute inset-0 bg-[rgba(0,0,0,0.5)]" />}
      <div
        data-part="alert"
        className="relative w-full max-w-[272px] overflow-hidden rounded-[18px] bg-[#2B2724] text-center text-[#F2EDE8] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8),inset_0_0_0_1px_rgba(255,255,255,0.06)]"
      >
        <div className="px-4 pb-4 pt-[18px]">
          <p data-part="alert-title" className="text-[17px] font-semibold leading-snug">
            {ALERT.title}
          </p>
          <p data-part="alert-url" className="mt-1 break-all text-[13px] leading-snug text-[#BCADA3]">
            {LINK_URL}
          </p>
        </div>
        {[
          { part: 'alert-copy', label: ALERT.copy, strong: false },
          { part: 'alert-share', label: ALERT.share, strong: false },
          { part: 'alert-done', label: ALERT.done, strong: true },
        ].map((b) => (
          <p
            key={b.part}
            data-part={b.part}
            className={`border-t border-[rgba(255,255,255,0.1)] py-[11px] text-[17px] text-[#F2EDE8]/90 ${b.strong ? 'font-semibold' : ''}`}
          >
            {b.label}
          </p>
        ))}
      </div>
    </div>
  );
}
