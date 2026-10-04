import { CH8_COPY } from '../../data/strings/page-ch8';
import { MEDIA } from '../../media.generated';
import { GearArt, ROLE_GEAR } from '../cinema/gear';
import { Ch8Film } from '../islands/ch8';

/**
 * Ch8 · Every Saturday · #community (05-cinema.md §3).
 *
 * Motion: the sky is the stage (`scenes/ch8-scene.tsx`, loaded when near):
 * the shared sky cranes up from Cebu City to the whole archipelago, small
 * constellations light north to south, and four crews' tools twinkle beside
 * their stars, joined by gold lines. It ends wide.
 *
 * Static (reduced motion, no JS, crawlers): the two lines, and one still:
 * the archipelago with the clusters baked in, the crew's tools under it.
 */

/** The shot's scroll, in svh, beyond its 100svh stage. */
const LENGTH = 90;

const TOOLS = Object.values(ROLE_GEAR);

export function Ch8() {
  return (
    <section
      id="community"
      data-tone="night"
      data-chapter="community"
      aria-labelledby="community-title"
      className="relative z-10 text-[#F2EDE8] [overflow-x:clip]"
    >
      <div className="motion-only">
        <h2 className="sr-only">{CH8_COPY.lines[0]}</h2>
        <Ch8Film length={LENGTH} />
      </div>

      <div className="static-only pb-24 md:pb-32">
        <div className="mx-auto max-w-6xl px-5 pt-24 sm:px-8 md:pt-32">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D18A5A]">{CH8_COPY.slate}</p>
          <h2
            id="community-title"
            className="mt-4 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] [text-wrap:balance]"
          >
            {CH8_COPY.lines[0]}
          </h2>
          <p className="mt-6 max-w-[40ch] text-[17px] leading-relaxed text-[#BCADA3] md:text-lg">{CH8_COPY.lines[1]}</p>
        </div>

        <figure className="relative mt-10">
          <picture>
            <source
              media="(min-width: 1024px)"
              type="image/avif"
              srcSet={MEDIA.clustersDesktopAvif.url}
              width={MEDIA.clustersDesktopAvif.width}
              height={MEDIA.clustersDesktopAvif.height}
            />
            <source
              media="(min-width: 1024px)"
              type="image/webp"
              srcSet={MEDIA.clustersDesktopWebp.url}
              width={MEDIA.clustersDesktopWebp.width}
              height={MEDIA.clustersDesktopWebp.height}
            />
            <source type="image/avif" srcSet={MEDIA.clustersMobileAvif.url} />
            <img
              src={MEDIA.clustersMobileWebp.url}
              width={MEDIA.clustersMobileWebp.width}
              height={MEDIA.clustersMobileWebp.height}
              alt={CH8_COPY.mapAlt}
              loading="lazy"
              decoding="async"
              className="mx-auto block h-auto w-full max-w-[1920px]"
            />
          </picture>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-[linear-gradient(to_bottom,rgba(22,19,17,0)_0%,#161311_100%)]"
          />
          <figcaption className="relative mx-auto -mt-6 flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 sm:px-8">
            <span aria-hidden className="flex items-center gap-4">
              {TOOLS.map((kind) => (
                <GearArt key={kind} kind={kind} className="h-8 w-auto" />
              ))}
            </span>
            <span className="text-[15px] leading-relaxed text-[#A08E84]">{CH8_COPY.still}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
