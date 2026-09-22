import { Reveal } from './reveal';
import { Plate } from './plate';

/**
 * What the product actually looks like.
 *
 * The page sold a workspace to visual professionals using nothing but prose,
 * which is the one audience that will not take your word for it.
 *
 * Rendered in markup rather than pasted in as PNGs, for three reasons that
 * all matter more than the half-hour it saved:
 *
 *  - A screenshot of the real app would be a screenshot of somebody's wedding
 *    photographs. There is no version of this page that should publish a
 *    client's delivery, and a marketing asset is exactly the kind of file
 *    nobody remembers to re-check for that.
 *  - Binary screenshots go stale silently. This shares the site's own tokens,
 *    so a palette change moves it too, and it can never drift into showing a
 *    control that no longer exists without somebody deleting it here.
 *  - It stays sharp on any display and weighs nothing, on a landing page whose
 *    audience is largely on Philippine mobile data.
 *
 * The two surfaces chosen are the ones that are actually unusual: a client
 * link that opens with no account, and finding people near you. The album
 * grid is deliberately abstract — coloured tiles, not stock photography —
 * because pretending to be real work is how a mock starts lying.
 */

const NAV = [
  { label: 'Dashboard', d: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5' },
  { label: 'Workspaces', d: 'M3 7h6l2 2h10v11H3z' },
  { label: 'Schedule', d: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4' },
];

const NEARBY = [
  { name: 'Second shooter', role: 'Photographer', km: '2.4 km' },
  { name: 'Same-day edit', role: 'SDE Editor Video', km: '5.1 km' },
  { name: 'Hair & make-up', role: 'HMUA', km: '7.8 km' },
];

export function LandingShowcase() {
  return (
    <section
      id="showcase"
      // The one section that is its own surface. Every other section sits on
      // the same flat #161311, so nothing on the page ever read as a change
      // of chapter. Edge-to-edge because a section already spans the
      // viewport - this needs no 100vw trick and so cannot cause the
      // sideways drift that one would risk on a phone.
      className="relative overflow-hidden border-y border-white/[0.06] bg-white/[0.015] py-24 sm:py-28"
    >
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <Reveal className="text-center">
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            The delivery your client sees. The people you need.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/50">
            No account, no app, no download-all zip that expires in a week —
            just a link that opens.
          </p>
        </Reveal>

        <Reveal delay={90} className="relative mt-14">
          {/* Browser chrome, so the address bar can carry the point: this is
              what the client gets, and it is not behind a login. */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#161311] shadow-2xl shadow-black/40">
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
              <div className="flex gap-1.5" aria-hidden>
                {['#ef4444', '#eab308', '#22c55e'].map((c) => (
                  <span
                    key={c}
                    className="size-2.5 rounded-full opacity-70"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="ml-2 flex-1 truncate rounded-md bg-white/[0.06] px-3 py-1 text-[11px] text-white/40">
                client.virgo.ph/s/8f2a…
              </div>
              <span className="hidden text-[11px] text-white/30 sm:block">
                no sign-in
              </span>
            </div>

            <div className="flex">
              {/* Sidebar, matching the app's own. Hidden on small screens —
                  a 320px-wide reproduction of a sidebar is illegible. */}
              <aside className="hidden w-44 shrink-0 border-r border-white/[0.07] p-3 md:block">
                <div className="flex items-center gap-2 px-2 pb-4">
                  <span className="grid size-6 place-items-center rounded-md bg-[#c17745] text-[11px] font-bold text-white">
                    V
                  </span>
                  <span className="text-[13px] font-bold text-white/90">Virgo</span>
                </div>
                {NAV.map((item, i) => (
                  <div
                    key={item.label}
                    className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px] ${
                      i === 1 ? 'bg-white/[0.06] text-white' : 'text-white/45'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none"
                      stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <path d={item.d} />
                    </svg>
                    {item.label}
                  </div>
                ))}
              </aside>

              <div className="min-w-0 flex-1 p-4 sm:p-6">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-bold text-white">
                      Reyes &amp; Santos — Wedding
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40">
                      248 photos · delivered · deletes itself in 30 days
                    </p>
                  </div>
                  <span className="hidden shrink-0 rounded-full bg-[#6b8e4e]/20 px-2.5 py-1 text-[10px] font-bold text-[#8fb36a] sm:block">
                    Delivered
                  </span>
                </div>

                {/* Plates. These were eight flat two-stop gradients, which on
                    a page selling to photographers read as eight images that
                    failed to load rather than as a deliberate abstraction. */}
                <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Plate
                      key={i}
                      seed={i}
                      aria-hidden
                      className="aspect-[4/3] rounded-lg"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* The phone sits over the corner on wide screens and stacks
              underneath on narrow ones, rather than shrinking to a sliver. */}
          <div className="mx-auto mt-8 w-56 lg:absolute lg:-bottom-10 lg:-right-4 lg:mt-0">
            <div className="overflow-hidden rounded-[2rem] border-4 border-[#0d0b0a] bg-[#1c1917] shadow-2xl shadow-black/50">
              <div className="px-4 pb-5 pt-4">
                <p className="text-[13px] font-bold text-white">Nearby</p>
                <p className="mt-0.5 text-[10px] text-white/35">
                  Within 10 km · Cebu City
                </p>

                <div className="mt-3 space-y-2">
                  {NEARBY.map((person) => (
                    <div
                      key={person.role}
                      className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] p-2.5"
                    >
                      <span className="size-7 shrink-0 rounded-full bg-gradient-to-br from-[#c17745]/70 to-[#8b5e3c]/70" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-white/90">
                          {person.name}
                        </span>
                        <span className="block truncate text-[9px] text-white/40">
                          {person.role}
                        </span>
                      </span>
                      <span className="shrink-0 text-[9px] text-[#c17745]">
                        {person.km}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-16 text-center text-[12px] text-white/25 lg:mt-24">
            Interface shown as rendered by the app. Album contents are
            illustrative — we do not put client work on a marketing page.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
