import { Download, Mail } from 'lucide-react';
import { APP_URL, DOWNLOAD_PATH, SIGN_IN_URL, SIGN_UP_URL } from '@/components/landing/links';
import { CONTACT_EMAIL, FINALE_COPY as T } from '../../data/strings/page-finale';

/**
 * The closing screen's parts (05-cinema.md §3, Finale): every way in, as
 * buttons, and the page's credits. There is no footer; these are it. Server-
 * safe, so the static finale, the film's last frame and the download page all
 * render the same links (crawlers find them in the HTML either way).
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

/** Join, Download and Sign in: the three ways in. */
export function PrimaryCtas({ download = true }: { download?: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:gap-4">
      <a
        href={SIGN_UP_URL}
        className={`inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#D18A5A] px-8 text-base font-semibold text-[#161311] shadow-[0_14px_44px_-14px_rgba(209,138,90,0.75)] transition-colors hover:bg-[#E09A69] sm:w-auto ${FOCUS}`}
      >
        {T.join}
      </a>
      <div className="flex w-full gap-3 sm:contents">
        {download && (
          <a
            href={DOWNLOAD_PATH}
            className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#F2EDE8] px-6 text-base font-semibold text-[#161311] transition-colors hover:bg-white sm:flex-none ${FOCUS}`}
          >
            <Download aria-hidden className="size-4" />
            {T.download}
          </a>
        )}
        <a
          href={SIGN_IN_URL}
          className={`inline-flex min-h-12 shrink-0 items-center justify-center rounded-full border border-white/15 px-5 text-base font-semibold text-[#F2EDE8] transition-colors hover:border-white/35 sm:px-6 ${FOCUS}`}
        >
          {T.signIn}
        </a>
      </div>
    </div>
  );
}

/** What the footer used to hold, as quieter buttons: the app, the documents, the inbox. */
export function MoreLinks({ download = false }: { download?: boolean }) {
  const pill = `inline-flex min-h-11 items-center gap-2 rounded-full border border-[#2A2522] bg-[#1A1614]/80 px-4 text-[14px] font-medium text-[#BCADA3] transition-colors hover:border-[#D18A5A]/50 hover:text-[#F2EDE8] ${FOCUS}`;
  return (
    <nav aria-label={T.more} className="flex flex-wrap justify-center gap-2">
      {download && (
        <a href={DOWNLOAD_PATH} className={pill}>
          <Download aria-hidden className="size-4" />
          {T.download}
        </a>
      )}
      <a href={APP_URL} className={pill}>
        {T.links.app}
      </a>
      <a href="/terms" className={pill}>
        {T.links.terms}
      </a>
      <a href="/privacy" className={pill}>
        {T.links.privacy}
      </a>
      <a href={`mailto:${CONTACT_EMAIL}`} className={pill}>
        <Mail aria-hidden className="size-4" />
        {CONTACT_EMAIL}
      </a>
    </nav>
  );
}

/**
 * The fine print: © and where it is made, the honesty line, and (on the
 * story, which draws the map and the stars) the data credits the licences ask
 * for.
 */
export function Credits({ data = true, honesty = true }: { data?: boolean; honesty?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <div className="flex max-w-[78ch] flex-col items-center gap-2 text-center text-[12px] leading-relaxed text-[#A08E84] sm:text-[13px]">
      {honesty && <p>{T.honesty}</p>}
      {data && (
        <p>
          <span className="font-mono uppercase tracking-[0.14em]">{T.creditsLabel}</span>
          <span aria-hidden> · </span>
          {T.mapCredit} {T.starCredit}
        </p>
      )}
      <p className="text-[#BCADA3]">
        © {year} {T.name} · {T.made}
      </p>
    </div>
  );
}
