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
 */
export function LandingDelivery() {
  return (
    // Tighter than its neighbours on purpose. Nine of eleven sections shared
    // one padding value, so the page had no pacing — nothing was ever allowed
    // to feel brisk.
    <section id="delivery" className="relative py-20 sm:py-24">
      {/* Mock first, copy second — the reverse of Nearby above it. Four
          sections ran copy-left/mock-right in a row, which is what made the
          middle of the page feel like one repeating slide. */}
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Reveal from="left" className="lg:order-2">
          <SectionHeader
            index="06"
            eyebrow="Delivery"
            title="Hand it over. Then forget about it."
            lead="Share an album as a link. The client opens it in a browser — no account, no app, no password to talk them through. You choose whether they get photos, video, audio, or everything."
          />

          <div className="mt-7 rounded-2xl border border-[#c17745]/25 bg-[#c17745]/[0.06] p-5">
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

        {/* Lifted above the other mocks on the page. Every surface carried the
            same shadow, so nothing was ever the focal object in its section. */}
        <Reveal from="right" delay={120} className="lg:order-1">
          <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#1e1b18]/80 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl">
            <div className="flex items-center gap-2.5 border-b border-white/8 px-4 py-3.5">
              <Link2 className="size-3.5 text-white/30" />
              <span className="truncate text-[12px] text-white/35">
                client.virgo.ph/s/a4f2…
              </span>
            </div>

            <div className="p-5">
              <p className="text-[13px] font-bold text-white">Reyes Wedding — Final</p>
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
      </div>
    </section>
  );
}
