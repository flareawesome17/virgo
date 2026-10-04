import Image from 'next/image';
import { SIGN_IN_URL } from '@/components/landing/links';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

/**
 * The title card's corners (05-cinema.md §2): the mark and Sign in, sitting
 * inside the top letterbox bar on desktop. It scrolls away with the page;
 * nothing follows. `home` is where the mark goes: the top of the story on the
 * story itself, the story from anywhere else.
 */
export function TitleBar({ home = '#top', homeLabel = 'Virgo, back to the top' }: { home?: string; homeLabel?: string }) {
  return (
    <div className="absolute inset-x-0 top-0 z-50 flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7 lg:pt-[max(1.25rem,calc(min(11vh,max(0px,calc((100vh_-_100vw/2.39)/2)))/2_-_1.375rem))]">
      <a href={home} aria-label={homeLabel} className={`inline-flex min-h-11 items-center gap-2.5 rounded-lg text-[17px] font-semibold tracking-[-0.01em] text-[#F2EDE8] ${FOCUS}`}>
        <Image src="/logo.png" alt="" width={28} height={28} className="size-7" priority />
        Virgo
      </a>
      <a href={SIGN_IN_URL} className={`inline-flex min-h-11 items-center rounded-lg px-1 text-[15px] font-medium text-[#BCADA3] transition-colors hover:text-[#F2EDE8] ${FOCUS}`}>
        Sign in
      </a>
    </div>
  );
}
