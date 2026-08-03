'use client';

import { Check, Link2, Timer } from 'lucide-react';
import { Reveal } from './reveal';

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
    <section id="delivery" className="relative py-24 sm:py-32">
      <div className="rule-fade mx-auto mb-24 w-full max-w-6xl" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <Reveal from="left">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c17745]">
            Delivery
          </span>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">
            Hand it over. Then forget about it.
          </h2>
          <p className="mt-5 text-pretty text-[15px] leading-relaxed text-white/55">
            Share an album as a link. The client opens it in a browser — no
            account, no app, no password to talk them through. You choose
            whether they get photos, video, audio, or everything.
          </p>

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

        <Reveal from="right" delay={120}>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1e1b18]/80 shadow-2xl shadow-black/40 backdrop-blur-xl">
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

              <div className="mt-4 grid grid-cols-4 gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <span
                    key={i}
                    className="aspect-square rounded-md"
                    style={{
                      background: `linear-gradient(135deg, rgba(193,119,69,${0.28 - i * 0.02}), rgba(91,123,154,${0.16 + i * 0.01}))`,
                    }}
                  />
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
