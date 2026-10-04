import { CH8_COPY } from '../../data/strings/page-ch8';
import { MARQUEE_ROLES } from '../../data/strings/ch8';
import { MEDIA } from '../../media.generated';
import { ProfileTag } from '../../mocks/profile-tag';
import { RoleMarquee } from '../../mocks/role-marquee';
import { Ch8Stage } from '../islands/ch8';

/**
 * Ch8 — Zoom Out · #community (storyboard §2 Ch8).
 *
 * Motion: the sky is the stage. A sticky, transparent stage holds the role
 * words and the horizon while the sky cranes up from Cebu City to the whole
 * archipelago and the small constellations light north to south; the copy
 * then scrolls up over it on a scrim, Bea's tag rises, the horizon lands the
 * page on ground for Ch9.
 *
 * Static (reduced motion, no JS): the archipelago with the clusters baked in
 * (B3b), the roles as chips, and the profile tag, all in their final state.
 */

const ON = "[html[data-motion='on']_&]";

const SCRIM =
  'relative isolate before:pointer-events-none before:absolute before:-inset-x-6 before:-inset-y-8 before:-z-10 before:rounded-[40px] before:bg-[#161311]/95 before:shadow-[0_0_90px_50px_rgba(22,19,17,0.95)]';

export function Ch8() {
  return (
    <section
      id="community"
      data-tone="night"
      data-chapter="community"
      aria-labelledby="community-title"
      className="relative z-10 [overflow-x:clip]"
    >
      <Ch8Stage className="relative">
        {/* The stage: pinned and see-through in motion (the sky draws the scene); the still archipelago otherwise. */}
        <figure className={`relative ${ON}:sticky ${ON}:top-0 ${ON}:h-svh ${ON}:overflow-x-clip`}>
          <div className="static-only relative">
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
            {/* The page lands on ground under the still map too. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-[linear-gradient(to_bottom,rgba(22,19,17,0)_0%,rgba(22,19,17,0.9)_60%,#161311_100%)]"
            />
          </div>

          {/* The role words, drifting with scroll: one row on phones, two from md. Lying back a little in the sky. */}
          <div
            aria-hidden
            data-part="ch8-marquee"
            className="motion-only pointer-events-none absolute inset-x-[-12%] top-[30%] [perspective:900px] md:top-[34%]"
            style={{ opacity: 0 }}
          >
            <div className="[transform:rotateX(14deg)_rotateZ(-4deg)]">
              <RoleMarquee />
            </div>
          </div>

          {/* The horizon the page lands on at the end. */}
          <div
            aria-hidden
            data-part="ch8-horizon"
            className="motion-only pointer-events-none absolute inset-x-0 bottom-0 h-[46svh]"
            style={{ opacity: 0, transform: 'translate3d(0, 100%, 0)' }}
          >
            <div className="absolute inset-x-0 top-[22%] h-[40%] bg-[radial-gradient(60%_100%_at_50%_100%,rgba(217,138,85,0.22),rgba(217,138,85,0)_70%)]" />
            <div className="absolute inset-x-0 top-[62%] h-px bg-[linear-gradient(90deg,rgba(209,138,90,0)_0%,rgba(209,138,90,0.6)_50%,rgba(209,138,90,0)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 top-[62%] bg-[linear-gradient(to_bottom,#1E1A17_0%,#161311_100%)]" />
          </div>

          <figcaption className="sr-only">{CH8_COPY.caption}</figcaption>
        </figure>

        {/* Motion only: a held beat of sky before the copy arrives. */}
        <div aria-hidden className="motion-only h-[24svh] md:h-[34svh]" />

        <div
          className={`relative mx-auto max-w-6xl px-5 pb-20 sm:px-8 md:pb-[12svh] [html:not([data-motion='on'])_&]:-mt-28 md:[html:not([data-motion='on'])_&]:-mt-56`}
        >
          <div className="grid items-end gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
            <div className={`${SCRIM} max-w-[40rem]`}>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#D18A5A]">{CH8_COPY.eyebrow}</p>
              <h2
                id="community-title"
                className="mt-4 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] text-[#F2EDE8] [text-wrap:balance]"
              >
                {CH8_COPY.title}
              </h2>
              <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-[#F2EDE8]/90 md:text-[17px]">{CH8_COPY.body}</p>
              <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-[#BCADA3]">{CH8_COPY.small}</p>

              <h3 className="sr-only">{CH8_COPY.rolesLabel}</h3>
              <ul className="sr-only">
                {MARQUEE_ROLES.map((role) => (
                  <li key={role}>{role}</li>
                ))}
              </ul>
              <RoleMarquee variant="chips" className="static-only mt-7" />

              <p className="mt-8 text-[13px] leading-relaxed text-[#A08E84]">{CH8_COPY.footnote}</p>
            </div>

            {/* Bea's tag, beside her star. */}
            <div data-part="ch8-tag" className="flex items-center pl-1 md:mb-24 md:pl-0">
              <span
                aria-hidden
                className="mr-6 size-[7px] shrink-0 rounded-full bg-[#F7E7CF] shadow-[0_0_14px_4px_rgba(247,231,207,0.45),0_0_40px_10px_rgba(209,138,90,0.25)]"
              />
              <ProfileTag leader />
            </div>
          </div>
        </div>
      </Ch8Stage>
    </section>
  );
}
