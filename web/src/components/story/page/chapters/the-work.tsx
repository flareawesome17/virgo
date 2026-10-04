import { WORK_COPY } from '../../data/strings/page-work';
import { Slab } from '../../frames/slab';
import { litePlateStyle } from '../../mocks/plate';
import { ShowcaseCard } from '../../mocks/showcase-card';
import { TheWorkStage } from '../islands/the-work';

/**
 * The work · #the-work (storyboard §2, the optional interlude, cut-ready).
 *
 * A breath between the job and the industry: one of Mika's own pieces, as a
 * showcase card in the phone feed, with the post's other two pieces fanned
 * behind it on desktop. Normal flow, no pin. The server render is the final
 * frame (note shown, tags on, the card at its rest tilt); the island lifts
 * and turns what is already here.
 *
 * The cover seeds are new ones, never Ch5–7's album plates, and the card is
 * never tied to the Reyes & Santos album (the clean-up would take it).
 */

/** The post's other pieces: fresh seeds, never reused from the album. */
const PIECES = [
  {
    seed: 141,
    className: 'left-[-34%] top-[7%] lg:left-[-44%]',
    rotate: { x: 6, y: 14 },
  },
  {
    seed: 158,
    className: 'right-[-34%] top-[13%] lg:right-[-44%]',
    rotate: { x: 6, y: -14 },
  },
] as const;

const SCRIM =
  'relative isolate before:pointer-events-none before:absolute before:-inset-x-6 before:-inset-y-8 before:-z-10 before:rounded-[40px] before:bg-[#161311]/95 before:shadow-[0_0_90px_50px_rgba(22,19,17,0.95)]';

export function TheWork() {
  return (
    <section
      id="the-work"
      data-tone="night"
      data-chapter="the-work"
      aria-labelledby="the-work-title"
      className="relative z-10 [overflow-x:clip]"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10 md:py-36 lg:gap-24">
        <div className={`${SCRIM} max-w-[34rem]`}>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#D18A5A]">{WORK_COPY.eyebrow}</p>
          <h2
            id="the-work-title"
            className="mt-4 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] text-[#F2EDE8] [text-wrap:balance]"
          >
            {WORK_COPY.title}
          </h2>
          <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-[#BCADA3] md:text-[17px]">{WORK_COPY.body}</p>
          <dl className="mt-8 grid grid-cols-3 gap-3 border-t border-[#2A2522] pt-6">
            {WORK_COPY.facts.map((f) => (
              <div key={f.k} className="min-w-0">
                <dt className="text-lg font-semibold tracking-tight text-[#F2EDE8] md:text-xl">{f.k}</dt>
                <dd className="mt-1 text-[13px] leading-snug text-[#A08E84] md:text-sm">{f.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <TheWorkStage className="relative mx-auto w-full max-w-[375px] md:max-w-[340px] lg:max-w-[360px]">
          <figure>
            <div aria-hidden className="relative">
              {/* The post's other pieces, behind the card in depth (desktop only: one card on a phone). */}
              {PIECES.map((piece) => (
                <div key={piece.seed} data-part="work-piece-wrap" className={`absolute hidden w-[72%] md:block ${piece.className}`}>
                  <div data-part="work-piece" className="will-change-transform">
                    <Slab
                      rotateX={piece.rotate.x}
                      rotateY={piece.rotate.y}
                      translateZ={-140}
                      depth={6}
                      radius="rounded-[14px]"
                      edge="card"
                      shadow="drop"
                    >
                      <div
                        className="w-full"
                        style={{
                          ...litePlateStyle(piece.seed),
                          aspectRatio: '1 / 1.15',
                        }}
                      />
                    </Slab>
                  </div>
                </div>
              ))}
              <div data-part="work-card" className="relative">
                <Slab rotateX={5} rotateY={-8} depth={9} radius="rounded-[22px]" edge="card" shadow="drop">
                  <ShowcaseCard pieces={3} />
                </Slab>
              </div>
            </div>
            <div className="relative mt-10 rounded-2xl bg-[#161311]/95 px-4 py-3 shadow-[0_0_40px_24px_rgba(22,19,17,0.9)]">
              <figcaption className="text-sm leading-relaxed text-[#BCADA3] [html[data-motion='on']_&]:sr-only">
                {WORK_COPY.caption}
              </figcaption>
              <p className="mt-3 text-[13px] leading-relaxed text-[#A08E84] [html[data-motion='on']_&]:mt-0">{WORK_COPY.footnote}</p>
            </div>
          </figure>
        </TheWorkStage>
      </div>
    </section>
  );
}
