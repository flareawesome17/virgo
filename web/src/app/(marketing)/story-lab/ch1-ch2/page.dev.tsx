import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { roleCounts, rows, SEARCH_ROLES, within } from '@/components/story/data/story';
import {
  BROWSER_RADIUS,
  BrowserFrame,
  DesktopWindow,
  desktopRadius,
  LOCK_WALLPAPER,
  PHONE_RADIUS,
  PhoneFrame,
  Slab,
} from '@/components/story/frames';
import {
  CHAT_PILE,
  ChatCardStack,
  chatCardPose,
  chatDeck,
  chatStackClock,
  type ChatDeck,
  type ChatStackState,
} from '@/components/story/mocks/chat-card-stack';
import { JOB_FORM_SCROLL, JOB_FORM_STATES, JobPostForm, type JobPostFormState } from '@/components/story/mocks/job-post-form';
import { LocationCard } from '@/components/story/mocks/location-card';
import { NearbyPanel } from '@/components/story/mocks/nearby-panel';
import {
  NEARBY_BEAT,
  NEARBY_STATES,
  NearbyPhone,
  type NearbyFrom,
  type NearbyPhoneScroll,
  type NearbyState,
} from '@/components/story/mocks/nearby-phone';

/**
 * Ch1 and Ch2's app mocks — the chat pile, Post a job, Nearby on phone and web, the location card — in every state.
 */
export const metadata: Metadata = {
  title: 'Story lab · Ch1–Ch2 mocks',
  robots: { index: false, follow: false },
};

// ─── The lab's own motion ────────────────────────────────────────────────
//
// Proof that a Phase 4 island can play these mocks with transform and
// opacity alone, through their data-part hooks, on top of the slab's turn.
// Every keyframe below is generated from the mocks' own exports
// (chatCardPose, JOB_FORM_SCROLL), so the motion lands exactly on the rest
// poses the server renders. Reduced motion keeps the rest pose, still 3D.

const LOOP = 16; // s
const ENTER = 'cubic-bezier(0.16, 1, 0.3, 1)';
const CAMERA = 'cubic-bezier(0.65, 0, 0.35, 1)';
const pc = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** The pile building up: arrivals come closer together (8% → 2% gaps in the chapter; here 11% → 6%). */
function pileKeyframes(): string {
  const deck = chatDeck(7);
  const arrive = [0.05, 0.16, 0.26, 0.35, 0.43, 0.5, 0.56];
  const d = 0.045;
  const out: string[] = [];
  const frame = (at: number, depth: number | null, opacity?: number) => {
    const p = chatCardPose(depth);
    return `${pc(at)} { transform: ${p.transform}; opacity: ${opacity ?? p.opacity}; animation-timing-function: ${ENTER} }`;
  };
  const fog = (at: number, depth: number | null) =>
    `${pc(at)} { opacity: ${chatCardPose(depth).fog}; animation-timing-function: ${ENTER} }`;
  deck.forEach((_, i) => {
    const steps = [frame(0, null), frame(arrive[i], null), frame(arrive[i] + d, 0)];
    const haze = [fog(0, 0), fog(arrive[i] + d, 0)];
    for (let j = i + 1; j < deck.length; j++) {
      steps.push(frame(arrive[j], j - 1 - i), frame(arrive[j] + d, j - i));
      haze.push(fog(arrive[j], j - 1 - i), fog(arrive[j] + d, j - i));
    }
    const last = deck.length - 1 - i;
    steps.push(frame(0.92, last), frame(0.97, last, 0), frame(1, null));
    haze.push(fog(0.97, last), fog(1, 0));
    out.push(`@keyframes m1-card-${i + 1} { ${steps.join(' ')} }`);
    out.push(`@keyframes m1-fog-${i + 1} { ${haze.join(' ')} }`);
    out.push(`.m1-pile [data-part="chat-card-${i + 1}"] { animation: m1-card-${i + 1} ${LOOP}s infinite }`);
    out.push(`.m1-pile [data-part="chat-card-${i + 1}-fog"] { animation: m1-fog-${i + 1} ${LOOP}s infinite }`);
  });
  out.push(
    `@keyframes m1-freeze { 0%, 62% { opacity: 0 } 70%, 90% { opacity: .6; animation-timing-function: ${CAMERA} } 97%, 100% { opacity: 0 } }`,
    `.m1-pile [data-part="freeze"] { animation: m1-freeze ${LOOP}s ${CAMERA} infinite }`,
  );
  return out.join('\n');
}

/**
 * The form filling from the "roles" beat on (the chips are state, not
 * motion): it scrolls to the budgets, they type in, it scrolls to the brief,
 * the brief types in, the button readies, presses, and the stamp lands.
 * Scrolling is two transforms (t × viewport down, t × column up), never
 * layout. The `hidden` flips (the brief's hint → counter) are Phase 4's; here
 * the counter simply fades in.
 */
function formKeyframes(): string {
  const t = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const scroll: [number, number][] = [
    [0, JOB_FORM_SCROLL.roles],
    [0.1, JOB_FORM_SCROLL.roles],
    [0.2, JOB_FORM_SCROLL.budgets],
    [0.44, JOB_FORM_SCROLL.budgets],
    [0.52, JOB_FORM_SCROLL.brief],
    [0.92, JOB_FORM_SCROLL.posted],
    [0.99, JOB_FORM_SCROLL.roles],
    [1, JOB_FORM_SCROLL.roles],
  ];
  const fade = (part: string, on: number, off = 0.93) =>
    `@keyframes m1-in-${part} { 0%, ${pc(on)} { opacity: 0 } ${pc(on + 0.035)}, ${pc(off)} { opacity: 1 } 98%, 100% { opacity: 0 } }
     @keyframes m1-out-${part} { 0%, ${pc(on)} { opacity: 1 } ${pc(on + 0.035)}, ${pc(off)} { opacity: 0 } 98%, 100% { opacity: 1 } }
     .m1-form [data-part="${part}-value"] { animation: m1-in-${part} ${LOOP}s ${ENTER} infinite }
     .m1-form [data-part="${part}-placeholder"] { animation: m1-out-${part} ${LOOP}s ${ENTER} infinite }`;
  const at = (s: number, e: number) => `0%, ${pc(s)} { opacity: 0 } ${pc(s + 0.025)}, ${pc(e)} { opacity: 1 } 98%, 100% { opacity: 0 }`;
  return [
    `@keyframes m1-scroll { ${scroll.map(([p, v]) => `${pc(p)} { transform: translateY(${t(v)}); animation-timing-function: ${CAMERA} }`).join(' ')} }`,
    `@keyframes m1-scroll-col { ${scroll.map(([p, v]) => `${pc(p)} { transform: translateY(-${t(v)}); animation-timing-function: ${CAMERA} }`).join(' ')} }`,
    `.m1-form [data-part="job-scroll"] { animation: m1-scroll ${LOOP}s infinite }`,
    `.m1-form [data-part="job-column"] { animation: m1-scroll-col ${LOOP}s infinite }`,
    fade('budget-videographer-min', 0.24),
    fade('budget-videographer-max', 0.27),
    fade('budget-sde-editor-video-min', 0.3),
    fade('budget-sde-editor-video-max', 0.33),
    fade('budget-hmua-min', 0.36),
    fade('budget-hmua-max', 0.39),
    fade('brief', 0.56),
    `@keyframes m1-count { ${at(0.6, 0.93)} }`,
    `.m1-form [data-part="brief-count"] { animation: m1-count ${LOOP}s infinite }`,
    `@keyframes m1-ready { 0%, 60% { opacity: .4 } 62.5%, 93% { opacity: 1 } 98%, 100% { opacity: .4 } }`,
    `@keyframes m1-press { 0%, 70% { transform: scale(1) } 71% { transform: scale(.97) } 72.5%, 100% { transform: scale(1) } }`,
    `.m1-form [data-part="post-button"] { animation: m1-ready ${LOOP}s ${CAMERA} infinite, m1-press ${LOOP}s ${ENTER} infinite }`,
    `@keyframes m1-stamp { 0%, 72% { opacity: 0; transform: scale(1.5) } 74.5% { opacity: 1; transform: scale(1); animation-timing-function: ${ENTER} } 93% { opacity: 1; transform: scale(1) } 98%, 100% { opacity: 0; transform: scale(1) } }`,
    `.m1-form [data-part="posted-stamp"] { animation: m1-stamp ${LOOP}s ${ENTER} infinite }`,
    `@keyframes m1-helper-b { 0%, 60% { opacity: 1 } 62%, 96% { opacity: 0 } 98%, 100% { opacity: 1 } }`,
    `@keyframes m1-helper-c { ${at(0.6, 0.93)} }`,
    `.m1-form [data-part="helper-needs-brief"] { animation: m1-helper-b ${LOOP}s infinite }`,
    `.m1-form [data-part="helper-ready"] { animation: m1-helper-c ${LOOP}s infinite }`,
  ].join('\n');
}

/** The slabs' turn: within ±10° on phones, ±16° (of 18) on desktop, sheens crossfading. */
const TURN_CSS = `
@keyframes m1-turn-m { 0%, 100% { transform: rotateX(4deg) rotateY(-9deg) } 50% { transform: rotateX(2deg) rotateY(9deg) translateZ(18px) } }
@keyframes m1-turn-d { 0%, 100% { transform: rotateX(5deg) rotateY(-15deg) } 50% { transform: rotateX(2deg) rotateY(15deg) translateZ(36px) } }
@keyframes m1-sheen-a { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
@keyframes m1-sheen-b { 0%, 100% { opacity: 0 } 50% { opacity: 1 } }
@keyframes m1-lift { 0%, 100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.06); opacity: .82 } }
.m1-turn [data-part="slab-body"] { animation: m1-turn-m 12s ${CAMERA} infinite; animation-delay: var(--phase, 0s) }
.m1-turn [data-part="slab-sheen-a"] { animation: m1-sheen-a 12s ${CAMERA} infinite; animation-delay: var(--phase, 0s) }
.m1-turn [data-part="slab-sheen-b"] { animation: m1-sheen-b 12s ${CAMERA} infinite; animation-delay: var(--phase, 0s) }
.m1-turn [data-part="slab-shadow"] { animation: m1-lift 12s ${CAMERA} infinite; animation-delay: var(--phase, 0s) }
@media (min-width: 768px) { .m1-turn [data-part="slab-body"] { animation-name: m1-turn-d } }
.m1-phase-b { --phase: -6s }
`;

const LAB_CSS = [
  TURN_CSS,
  pileKeyframes(),
  formKeyframes(),
  `@media (prefers-reduced-motion: reduce) { .m1-turn *, .m1-pile *, .m1-form * { animation: none !important } }`,
].join('\n');

// ─── Layout ──────────────────────────────────────────────────────────────

function Section({ n, title, note, children }: { n: string; title: string; note: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-24 first:mt-14">
      <p className="figure text-[11px] uppercase tracking-[0.14em] text-[#D18A5A]">{n}</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="mt-2 max-w-[72ch] text-[14px] leading-relaxed text-[#BCADA3]">{note}</div>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Specimen({ caption, sub, children }: { caption: string; sub?: string; children: ReactNode }) {
  return (
    <figure className="flex min-w-0 flex-col items-center">
      <div className="flex w-full justify-center">{children}</div>
      <figcaption className="mt-7 w-full max-w-[400px] text-center">
        <span className="figure block text-[12px] text-[#F2EDE8]">{caption}</span>
        {sub && <span className="figure mt-1 block text-[11px] leading-relaxed text-[#A08E84]">{sub}</span>}
      </figcaption>
    </figure>
  );
}

/** A phone at its §1.13 rest pose: a slab with a device edge and a floor shadow, turned a little. */
function Phone({
  children,
  time,
  screen,
  turn = -8,
  className = '',
}: {
  children: ReactNode;
  time: string;
  screen?: string;
  turn?: number;
  className?: string;
}) {
  return (
    <Slab
      className={`w-[min(100%,380px)] ${className}`}
      rotateY={turn}
      rotateX={4}
      depth={14}
      radius={PHONE_RADIUS}
      edge="device"
      shadow="floor"
    >
      <PhoneFrame width="100%" time={time} screen={screen}>
        {children}
      </PhoneFrame>
    </Slab>
  );
}

const PHONE_GRID = 'grid gap-x-8 gap-y-20 lg:grid-cols-2 xl:grid-cols-3';
const turnFor = (i: number) => (i % 2 === 0 ? -8 : 8);

const STACK_STATES: ChatStackState[] = [0, 1, 2, 3, 4, 5, 6, 7, 'frozen'];
const MOBILE_STACK_STATES: ChatStackState[] = [1, 2, 3, 4, 5, 'frozen'];

function stackSub(state: ChatStackState, cards: ChatDeck) {
  const deck = chatDeck(cards);
  const n = state === 'frozen' ? deck.length : Math.min(state, deck.length);
  const newest = n === 0 ? 'lock screen only' : `newest: ${deck[n - 1].kind}`;
  return `${chatStackClock(state, cards)} PM · ${newest}${state === 'frozen' ? ' · #161311 at 60%' : ''}`;
}

const FORM_SUB: Record<JobPostFormState, string> = {
  empty: 'nothing typed · Still needs a title, at least one role and a brief.',
  roles: 'title, three roles, date, place · budgets appear',
  budgets: 'budgets typed, tabular · Still needs a brief.',
  brief: 'brief typed · 84 / 4000 · ready',
  posted: 'Post it pressed · the page’s stamp',
};

function nearbySub(state: NearbyState) {
  const { radius, erased } = NEARBY_BEAT[state];
  const c = roleCounts(radius, erased);
  return `${within(radius, erased).length} people within ${radius} km · ${rows(radius, SEARCH_ROLES, erased).length} rows · Coordinator ${c.Coordinator}`;
}

const SCROLL_NOTE: Record<NearbyPhoneScroll, string> = {
  top: 'scroll top: header and sharing card',
  near: 'scroll near: the shoot picked',
  within: 'scroll within (default)',
};

/** The NEAR beat on its own: the moment before the shoot's chip is picked, then picked. */
const NEAR_BEAT: { near: NearbyFrom; caption: string; sub: string }[] = [
  {
    near: 'home',
    caption: 'r5 · near home · before the chip',
    sub: 'chip unpicked · her city as the placeholder · “Searching from where you are…”',
  },
  {
    near: 'event',
    caption: 'r5 · near event (default) · the chip picked',
    sub: 'Back to my location · the city typed in · “Measuring from Cebu City…”',
  },
];

/** A browser window around the web page, at its §1.13 rest pose. */
function Browser({ children, i = 0 }: { children: ReactNode; i?: number }) {
  return (
    <Slab className="w-[min(100%,620px)]" rotateX={4} rotateY={i % 2 === 0 ? -6 : 6} depth={10} radius={BROWSER_RADIUS} edge="card">
      <BrowserFrame url="web.virgo.ph/nearby" viewportClassName="h-[780px]">
        {children}
      </BrowserFrame>
    </Slab>
  );
}

export default function Ch1Ch2Lab() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#161311] px-4 pb-40 pt-12 text-[#F2EDE8] sm:px-8">
      <style>{LAB_CSS}</style>
      <div className="mx-auto max-w-[1240px]">
        <a href="/story-lab" className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84] hover:text-[#F2EDE8]">
          ← Story lab
        </a>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Ch1–Ch2 mocks</h1>
        <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-[#BCADA3]">
          Wednesday 11:42 PM to Thursday 12:04 AM: the chat pile, the phone’s Post a job form, Nearby on the phone and
          the web, and the location card. Every state, in its frame, at its 3D rest pose. Counts and rows come from{' '}
          <code className="figure text-[13px] text-[#F2EDE8]">story.ts</code>; words from{' '}
          <code className="figure text-[13px] text-[#F2EDE8]">strings/ch1.ts</code> and{' '}
          <code className="figure text-[13px] text-[#F2EDE8]">ch2.ts</code>, each proven against the app. Check at 375
          and 1440.
        </p>

        <Section
          n="01 · Ch1 · B10"
          title="ChatCardStack"
          note={
            <p>
              Generic, unbranded chats on a generic lock screen, fanning back in depth: the newest card faces the reader
              at z = 0, each older one a step back ({CHAT_PILE.depth} px), up ({CHAT_PILE.peek} px) and twisted, so the
              pile reads as a pile. Every card is in the DOM in every state; unlanded cards wait at the entry pose. The
              desktop deck has 7 cards, phones get 5 that still carry 11:42, 11:51 and 11:57.
            </p>
          }
        >
          <p className="figure mb-8 text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">desktop deck · 7</p>
          <div className={PHONE_GRID}>
            {STACK_STATES.map((s, i) => (
              <Specimen key={String(s)} caption={`state ${s}`} sub={stackSub(s, 7)}>
                <Phone time={chatStackClock(s, 7)} screen={LOCK_WALLPAPER} turn={turnFor(i)}>
                  <ChatCardStack state={s} cards={7} />
                </Phone>
              </Specimen>
            ))}
          </div>
          <p className="figure mb-8 mt-24 text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">phone deck · 5</p>
          <div className={PHONE_GRID}>
            {MOBILE_STACK_STATES.map((s, i) => (
              <Specimen key={String(s)} caption={`state ${s} · cards 5`} sub={stackSub(s, 5)}>
                <Phone time={chatStackClock(s, 5)} screen={LOCK_WALLPAPER} turn={turnFor(i)}>
                  <ChatCardStack state={s} cards={5} />
                </Phone>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="02 · Ch1 · B10"
          title="JobPostForm"
          note={
            <p>
              The phone’s Post a job, word for word and in its order: … budgets, The brief, Post it, then the helper. The
              helper is the app’s own “Still needs …” until the form is ready, and “Posts run for 30 days…” only then;
              the brief’s hint becomes “84 / 4000” at 30 characters. The screen scrolls by two transforms, so each
              state rests where its beat is.
            </p>
          }
        >
          <div className={PHONE_GRID}>
            {JOB_FORM_STATES.map((s, i) => (
              <Specimen key={s} caption={`${s} · scroll ${JOB_FORM_SCROLL[s]}`} sub={FORM_SUB[s]}>
                <Phone time={s === 'posted' ? '11:58' : '11:57'} turn={turnFor(i)}>
                  <JobPostForm state={s} />
                </Phone>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="03 · Ch2 · B10"
          title="NearbyPhone"
          note={
            <p>
              The phone’s Nearby, searching from the shoot: the event chip picked under NEAR, three roles picked, rows
              for the radius with whole-km distances and Add. 5 km, then 25 km, then the coordinator turns sharing off
              and is gone. The screen is one scrolled column; <code className="figure text-[13px]">scroll</code> picks
              the section at the top. NEAR flips on its own (<code className="figure text-[13px]">near</code>, one{' '}
              <code className="figure text-[13px]">data-on</code>): the moment before the shoot’s chip is picked, then
              picked. Her city is the shoot’s, so the rows don’t change.
            </p>
          }
        >
          <div className={PHONE_GRID}>
            {NEARBY_STATES.map((s, i) => (
              <Specimen key={s} caption={`${s} · ${SCROLL_NOTE.within}`} sub={nearbySub(s)}>
                <Phone time="12:04" turn={turnFor(i)}>
                  <NearbyPhone state={s} />
                </Phone>
              </Specimen>
            ))}
            {NEAR_BEAT.map((b, i) => (
              <Specimen key={b.near} caption={b.caption} sub={b.sub}>
                <Phone time="12:04" turn={turnFor(i + 1)}>
                  <NearbyPhone state="r5" scroll="near" near={b.near} />
                </Phone>
              </Specimen>
            ))}
            <Specimen caption={`r5 · ${SCROLL_NOTE.top}`} sub={nearbySub('r5')}>
              <Phone time="12:04" turn={turnFor(1)}>
                <NearbyPhone state="r5" scroll="top" />
              </Phone>
            </Specimen>
          </div>
        </Section>

        <Section
          n="04 · Ch2 · B10"
          title="NearbyPanel"
          note={
            <p>
              The web page’s column, in the web dark theme: Buttons are #A85D35 with white, picked roles and matched
              badges are primary #D18A5A on #161311. Shown in the desktop app’s window with Nearby lit, then in a
              browser window the width of the chapter’s panel, where the web draws its own bar instead of the sidebar
              (<code className="figure text-[13px]">shell=&quot;narrow&quot;</code>). The list runs off the bottom under
              a soft edge.
            </p>
          }
        >
          <div className="grid gap-y-20">
            {NEARBY_STATES.map((s, i) => (
              <Specimen key={s} caption={`${s} · scroll near`} sub={nearbySub(s)}>
                <Slab
                  className="w-full"
                  rotateX={4}
                  rotateY={i % 2 === 0 ? -5 : 5}
                  depth={10}
                  radius={desktopRadius('windows')}
                  edge="card"
                >
                  <DesktopWindow os="windows" active="nearby" contentClassName="h-[720px]">
                    <NearbyPanel state={s} />
                  </DesktopWindow>
                </Slab>
              </Specimen>
            ))}
            <Specimen caption="r25-erased · scroll top · the panel alone" sub="the chapter’s crop: the column without the window">
              <Slab className="w-[min(100%,620px)]" rotateX={4} rotateY={-7} depth={10} radius="rounded-xl" edge="card">
                <div className="h-[760px] overflow-hidden rounded-xl border border-[#362F2B]">
                  <NearbyPanel state="r25-erased" scroll="top" />
                </div>
              </Slab>
            </Specimen>
          </div>
          <p className="figure mb-8 mt-24 text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">
            in a browser · web.virgo.ph/nearby · under 1024 px · shell narrow
          </p>
          <div className="grid justify-items-center gap-x-8 gap-y-20 lg:grid-cols-2">
            <Specimen caption="r5 · near home · before the chip" sub="outline chip · placeholder · “Searching from where you are…”">
              <Browser>
                <NearbyPanel state="r5" shell="narrow" near="home" />
              </Browser>
            </Specimen>
            {NEARBY_STATES.map((s, i) => (
              <Specimen key={s} caption={`${s} · shell narrow`} sub={nearbySub(s)}>
                <Browser i={i + 1}>
                  <NearbyPanel state={s} shell="narrow" />
                </Browser>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="05 · Ch2 · B10"
          title="LocationCard"
          note={
            <p>
              The card’s two real states, phone and web: off, with the city helper and “Cebu City” typed in; on,
              “Discoverable · Cebu City”. One attribute on the root flips every difference, so it can also change in
              place.
            </p>
          }
        >
          <div className="grid items-start gap-x-10 gap-y-16 lg:grid-cols-2">
            {(['off', 'on'] as const).map((s, i) => (
              <Specimen key={`phone-${s}`} caption={`phone · ${s}`}>
                <Slab className="w-[min(100%,380px)]" rotateX={6} rotateY={turnFor(i)} depth={8} radius="rounded-[16px]" edge="card">
                  <LocationCard platform="phone" state={s} />
                </Slab>
              </Specimen>
            ))}
            {(['off', 'on'] as const).map((s, i) => (
              <Specimen key={`web-${s}`} caption={`web · ${s}`}>
                <Slab className="w-[min(100%,560px)]" rotateX={6} rotateY={turnFor(i)} depth={8} radius="rounded-[16.8px]" edge="card">
                  <LocationCard platform="web" state={s} />
                </Slab>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section
          n="06 · §1.13"
          title="Depth, in motion"
          note={
            <p>
              The slabs turn on the compositor alone (rotateX/rotateY/translateZ, sheens and shadow by opacity), while
              the mocks play their beats through their own data-part hooks: the pile lands card by card and recedes in
              depth, then freezes; the form scrolls, fills, readies and is stamped. Transform and opacity only, from the
              mocks’ exported poses. Reduced motion keeps this still, and still 3D.
            </p>
          }
        >
          <div className="grid gap-x-8 gap-y-20 lg:grid-cols-2">
            <Specimen caption="the pile, landing and receding" sub="chatCardPose(depth) · 7 cards · freeze">
              <Phone time="11:57" screen={LOCK_WALLPAPER} className="m1-turn m1-pile">
                <ChatCardStack state={7} />
              </Phone>
            </Specimen>
            <Specimen caption="the form, filling" sub="job-scroll + job-column · crossfades · stamp">
              <Phone time="11:58" turn={8} className="m1-turn m1-form m1-phase-b">
                <JobPostForm state="posted" />
              </Phone>
            </Specimen>
          </div>
        </Section>
      </div>
    </main>
  );
}
