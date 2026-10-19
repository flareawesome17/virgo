import { SIGN_UP_URL } from '@/components/landing/links';
import { SITE } from './share-data';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

/**
 * A shared link to a post that is not there to show.
 *
 * One wording for every reason — made private, taken down, shown to
 * connections only, deleted, or never a post at all — because the page cannot
 * tell them apart and must not seem to.
 */
export default function SharedShowcaseNotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-[#161311] px-6 text-center text-[#F2EDE8]">
      <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[#D18A5A]">Virgo</p>
      <h1 className="mt-4 text-balance text-[clamp(1.7rem,1.3rem+1.6vw,2.4rem)] leading-[1.1] [font-family:var(--font-display),ui-serif,Georgia,serif]">
        This post isn’t available
      </h1>
      <p className="mt-3 max-w-[42ch] text-pretty text-[15px] leading-relaxed text-[#BCADA3]">
        Its maker may have made it private or taken it down, or the link may be incomplete.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <a
          href={SIGN_UP_URL}
          className={`inline-flex min-h-12 items-center justify-center rounded-full bg-[#D18A5A] px-7 text-base font-semibold text-[#161311] transition-colors hover:bg-[#E09A69] ${FOCUS}`}
        >
          Join Virgo
        </a>
        <a
          href={SITE}
          className={`inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-7 text-base font-semibold text-[#F2EDE8] transition-colors hover:border-white/35 ${FOCUS}`}
        >
          What is Virgo?
        </a>
      </div>
    </div>
  );
}
