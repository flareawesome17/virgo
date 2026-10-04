'use client';

import { m, useTransform } from 'framer-motion';
import { MIKA_CARD } from '../../data/strings/page-prologue';
import { CAST } from '../../data/story';
import { Avatar } from '../../mocks/avatar';
import { Plate } from '../../mocks/plate';
import { camera, enter, r2, seg, window4 } from '../cinema/ease';
import { GEAR_ASPECT, GearArt } from '../cinema/gear';
import { prologueClock } from './prologue-clock';

/**
 * "This star is Mika." (05-cinema.md §1.11): as the camera lands on her star,
 * the star opens into the person. A spark of its light runs out along a gold
 * leader and becomes the ring round her avatar, and her card unfolds: name,
 * what she does and where, her camera, and three frames of her work.
 *
 * The sky engine places the root on her star (label `mika-card`) and fades
 * it with the descent; the unfolding runs on the Prologue's own clock.
 * Desktop: the card stands right of the star. Phones: above it, clear of the
 * subtitle in the lower third. Transform and opacity only.
 *
 * Illustrative, like her: the avatar is the app's initials fallback (the story
 * shows no photographs of people) and her work is abstract plates.
 */

/** The unfolding, on the Prologue's clock. */
const AT = { spark: [0.84, 0.895], lead: [0.845, 0.89], card: [0.875, 0.93], ring: [0.885, 0.9, 0.93, 0.99], work: 0.905 } as const;

export function MikaCard() {
  const q = prologueClock;
  const lead = useTransform(q, (p) => r2(camera(seg(p, AT.lead[0], AT.lead[1]))));
  const leadX = useTransform(lead, (v) => `scaleX(${v})`);
  const leadY = useTransform(lead, (v) => `scaleY(${v})`);
  // The spark rides the leader from the star to the avatar, and goes out as the ring lights.
  const run = useTransform(q, (p) => camera(seg(p, AT.spark[0], AT.spark[1])));
  const sparkX = useTransform(run, (t) => `translate3d(${r2(t * 118)}px,0,0)`);
  const sparkY = useTransform(run, (t) => `translate3d(0,${r2(-t * 84)}px,0)`);
  const spark = useTransform(q, (p) => r2(window4(p, AT.spark[0], AT.spark[0] + 0.008, AT.spark[1] - 0.01, AT.spark[1] + 0.004)));
  const shown = useTransform(q, (p) => enter(seg(p, AT.card[0], AT.card[1])));
  const cardX = useTransform(shown, (e) => `translate3d(${r2((1 - e) * -14)}px,-50%,0) scale(${r2(0.94 + 0.06 * e)})`);
  const cardY = useTransform(shown, (e) => `translate3d(-50%,calc(-100% + ${r2((1 - e) * 14)}px),0) scale(${r2(0.94 + 0.06 * e)})`);
  const ring = useTransform(q, (p) => r2(window4(p, ...AT.ring)));

  const card = (
    <div className="w-[min(260px,72vw)] rounded-2xl border border-[#F0C88E]/25 bg-[#161311]/[0.92] p-3.5 text-left shadow-[0_24px_60px_-24px_rgba(0,0,0,0.95),0_0_40px_-12px_rgba(240,200,142,0.35)]">
      <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          {/* Her star's light, become the ring round her avatar. */}
          <span className="absolute -inset-[3px] rounded-full border border-[#F0C88E]/70 shadow-[0_0_14px_2px_rgba(240,200,142,0.45)]" />
          <m.span style={{ opacity: ring }} className="absolute -inset-3 rounded-full bg-[radial-gradient(closest-side,rgba(255,236,206,0.7),rgba(240,200,142,0))]" />
          <Avatar surface="web" name={CAST.mika.name} size={44} className="relative" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight text-[#F2EDE8]">{MIKA_CARD.name}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-[#BCADA3]">{MIKA_CARD.role}</span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#D18A5A]">{MIKA_CARD.city}</span>
        </span>
        <span className="block h-7 shrink-0 opacity-90" style={{ aspectRatio: GEAR_ASPECT.camera }}>
          <GearArt kind="camera" className="size-full" />
        </span>
      </div>
      <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#A08E84]">{MIKA_CARD.work}</p>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {[7, 19, 33].map((seed, i) => (
          <Work key={seed} seed={seed} at={AT.work + i * 0.012} />
        ))}
      </div>
    </div>
  );

  return (
    <div aria-hidden>
      {/* The spark at the star, and the leader it runs along. */}
      <span className="absolute left-0 top-0 hidden lg:block">
        <span className="absolute left-[46px] top-0 h-px w-[72px] origin-left">
          <m.span style={{ transform: leadX }} className="absolute inset-0 origin-left bg-gradient-to-r from-[#F0C88E]/20 via-[#F0C88E]/80 to-[#F0C88E]" />
        </span>
        <m.span style={{ transform: sparkX, opacity: spark }} className="absolute -left-2 -top-2 size-4 rounded-full bg-[radial-gradient(closest-side,#FFF8EC,rgba(255,231,194,0.6)_45%,rgba(240,200,142,0))]" />
        <m.div style={{ transform: cardX, opacity: shown }} className="absolute left-[118px] top-0 origin-left">
          {card}
        </m.div>
      </span>
      <span className="absolute left-0 top-0 lg:hidden">
        <span className="absolute -top-[84px] left-0 h-[54px] w-px">
          <m.span style={{ transform: leadY }} className="absolute inset-0 origin-bottom bg-gradient-to-t from-[#F0C88E]/20 via-[#F0C88E]/80 to-[#F0C88E]" />
        </span>
        <m.span style={{ transform: sparkY, opacity: spark }} className="absolute -left-2 -top-2 size-4 rounded-full bg-[radial-gradient(closest-side,#FFF8EC,rgba(255,231,194,0.6)_45%,rgba(240,200,142,0))]" />
        <m.div style={{ transform: cardY, opacity: shown }} className="absolute -top-[84px] left-0 origin-bottom">
          {card}
        </m.div>
      </span>
    </div>
  );
}

/** One frame of her work: rises into place after the card. */
function Work({ seed, at }: { seed: number; at: number }) {
  const e = useTransform(prologueClock, (p) => enter(seg(p, at, at + 0.03)));
  const transform = useTransform(e, (v) => `translate3d(0,${r2((1 - v) * 8)}px,0)`);
  return (
    <m.div style={{ opacity: e, transform }}>
      <Plate seed={seed} aspect="1:1" variant="lite" className="rounded-md" />
    </m.div>
  );
}
