'use client';

import { Check, Link2, Timer } from 'lucide-react';
import { Reveal } from './reveal';
import { Plate } from './plate';
import { SectionHeader } from './section-header';

/**
 * Delivery and automatic cleanup.
 *
 * The cleanup half is the differentiator and the one most likely to be read as
 * marketing, so it is described precisely: the window is per album, counted
 * from each file's upload, and a daily sweep deletes from the bucket. That is
 * exactly what AlbumRetentionService does.
 *
 * **This is the page's typographic peak.** Nothing here was ever allowed to be
 * big — below the hero the ceiling was 41.6px on every one of ten sections —
 * so the page read as flat from any distance however carefully the details
 * were tuned. One section gets a headline that fills the width with nothing
 * beside it, and this is the one to give it to: the shortest, best line in the
 * copy, attached to the claim that actually distinguishes the product.
 */
export function LandingDelivery() {
  return (
    <section id="delivery" className="relative py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHeader
          index="06"
          eyebrow="Delivery"
          size="xl"
          title={
            <>
              Hand it over.
              <br />
              Then forget about it.
            </>
          }
          lead="Share an album as a link. The client opens it in a browser — no account, no app, no password to talk them through. You choose whether they get photos, video, audio, or everything."
        />

        {/* Mock first, callout second — the reverse of Nearby above it. Four
            sections ran copy-left/mock-right in a row, which is what made the
            middle of the page feel like one repeating slide. */}
        <div className="mt-16 grid items-start gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          {/* Lifted above the other mocks on the page. Every surface carried
              the same shadow, so nothing was ever the focal object. */}
          <Reveal from="left" duration={900}>
            <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#1e1b18]/80 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl">
              <div className="flex items-center gap-2.5 border-b border-white/8 px-4 py-3.5">
                <Link2 className="size-3.5 text-white/30" />
                <span className="truncate text-[12px] text-white/35">
                  client.virgo.ph/s/a4f2…
                </span>
              </div>

              <div className="p-5">
                <p className="text-[13px] font-bold text-white">
                  Reyes Wedding — Final
                </p>
                <p className="mt-1 text-[11px] text-white/35">
                  412 photos · 8 videos · shared with the couple
                </p>

                {/* Plates, not flat gradient squares. Same abstraction, but
                    grained, vignetted and varied per tile so it reads as a
                    designed stand-in rather than eight images that failed. */}
                <div className="mt-4 grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Plate key={i} seed={i + 2} className="aspect-square rounded-md" />
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-2 border-t border-white/8 pt-4">
                  {[
                    'No account needed to view',
                    'Photos, video and audio — you choose',
                    'Auto-deletes 90 days after delivery',
                  ].map((line) => (
                    <span key={line} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[#c17745]" />
                      <span className="text-[12px] text-white/50">{line}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal from="right" delay={120}>
            <div className="rounded-2xl border border-[#c17745]/25 bg-[#c17745]/[0.06] p-6">
              <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#e0a274]">
                <Timer className="size-4" />
                And it cleans up after itself
              </span>
              <p className="mt-2.5 text-[13px] leading-relaxed text-white/55">
                Set a retention window on the album and Virgo deletes the files
                when it expires — counted per file from when it was uploaded, so
                an album you added to over three weeks does not lose its last
                upload on the same day as its first. You stop paying to store
                finished work, and you never have to remember to clear it out.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
