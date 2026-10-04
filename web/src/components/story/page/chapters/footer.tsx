import Image from 'next/image';
import { DOWNLOAD_PATH, SIGN_IN_URL } from '@/components/landing/links';
import { FOOTER_COPY as T } from '../../data/strings/page-footer';
import { CONTACT_EMAIL } from '../../data/strings/page-faq';

/**
 * The story's footer (storyboard §2 Footer): the mark, the links, the
 * honesty line (§1.10) and the data credits. Server-rendered and identical in
 * every motion mode.
 *
 * `sectionBase="/"` on pages other than the story (the download page), so the
 * mark goes back to the story's top instead of a fragment that is not there.
 * `credits` is the story's own: the map and star credits only mean something
 * under the page that draws them.
 */
export function StoryFooter({ sectionBase = '', credits = true }: { sectionBase?: string; credits?: boolean }) {
  const year = new Date().getFullYear();
  const link =
    'inline-flex min-h-11 items-center rounded-lg px-2 text-[15px] text-[#BCADA3] transition-colors hover:text-[#F2EDE8] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F2EDE8]';

  return (
    <footer
      className="relative z-10 border-t border-white/[0.06] bg-[#120F0E] px-5 pt-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-sm text-[#A08E84] [contain-intrinsic-block-size:auto_22rem] [content-visibility:auto] sm:px-8"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <a
            href={`${sectionBase}#top`}
            aria-label={T.home}
            className="inline-flex min-h-11 items-center gap-2.5 self-start rounded-lg focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F2EDE8]"
          >
            <Image src="/logo.png" alt="" width={22} height={22} className="size-[22px]" />
            <span className="text-[15px] font-semibold tracking-tight text-[#F2EDE8]">{T.name}</span>
          </a>
          <nav aria-label={T.nav} className="-mx-2 flex flex-wrap gap-x-2 gap-y-0">
            <a href="/terms" className={link}>
              {T.links.terms}
            </a>
            <a href="/privacy" className={link}>
              {T.links.privacy}
            </a>
            <a href={DOWNLOAD_PATH} className={link}>
              {T.links.download}
            </a>
            <a href={SIGN_IN_URL} className={link}>
              {T.links.signIn}
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
              {CONTACT_EMAIL}
            </a>
          </nav>
        </div>

        <div className="grid gap-4 border-t border-white/[0.06] pt-6 lg:grid-cols-[1fr_1.4fr] lg:gap-12">
          <p className="text-[#BCADA3]">
            © {year} {T.name} · {T.built}
          </p>
          <p className="max-w-[68ch] leading-relaxed">{T.honesty}</p>
        </div>

        {credits && (
          <p className="max-w-[90ch] text-xs leading-relaxed text-[#A08E84]">
            <span className="font-mono tracking-[0.14em] uppercase">{T.creditsLabel}</span>
            <span aria-hidden> · </span>
            {T.mapCredit} {T.starCredit}
          </p>
        )}
      </div>
    </footer>
  );
}
