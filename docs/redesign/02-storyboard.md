# Virgo story site — Phase 2 storyboard

Date: 2026-10-02 · Builds on [01-audit.md](01-audit.md) · Status: **draft for approval**. Nothing has been built yet.

Working title: **"Every shoot is a constellation."** The page follows one job, the Reyes & Santos wedding, from Mika's 11:42 PM panic to the nights the files dissolve back into stars.

How this draft was made:
- Three independent drafts, each from one angle: cinematic, mobile-first performance, and product truth with accessibility.
- A review panel merged them chapter by chapter.
- Four reviewers critiqued the result: product truth against `origin/main`, compliance with your brief, technical feasibility, and voice with accessibility. Each of their findings was then checked by someone trying to disprove it. The 51 that held up are fixed below.

---

## 0. What I changed in your story, and why

As design lead, these are deliberate departures. Each keeps the beat you asked for and avoids drawing UI or behaviour the product doesn't have.

| Your beat | Storyboard | Why |
|---|---|---|
| Radar readout 10 / 20 / 30 km | Rings at **5 km → 25 km**. The real options are 5 / 25 / 50 / 100 / 200. | The app never offers 10, 20 or 30. A wrong radius is the first thing a photographer would spot. |
| Mika sends a request to Ernie; he accepts | **Applications travel to Mika; she accepts.** The thread turns solid when she does. | This keeps one hiring path, the job board from Ch1, which is the only one that creates a booking with agreed terms. Both sides still agree: they applied, she accepted. |
| A phone with zero bars rings for the 6:00 call time | **Mika's 5:00 AM reminder** for the 6:00 call rings with zero bars. | Only reminders with the alarm on become local alarms. Accepting an event schedules nothing. |
| Thumbnails stream live from three devices | Abstract tiles fly along gold threads, each stamped with **when it was uploaded that night** ("Sat 10:48 PM"). Then the album, and the activity line. | There is no live upload stream. As a metaphor the flight is fine; the UI it lands in is true. |
| "Ernie uploaded 248 files" / 412 photos and 8 videos on Saturday | **Mika uploads 248, Ernie 164, Kenn the same-day edit.** Saturday shows **412 photos · 1 film**. Ernie's six films and the recordings are shared three weeks later **through the same link**. | The lead shoots most of the stills; the hired videographer's films come later. The app calls them films. The later share lets Ch6 sell "same link" with no extra screens. |
| A sign-in screen tries to appear and is skipped | **Cut.** Replaced by the line "No app. No sign-up. No password." | The client page never shows a sign-in. Drawing one, even to dismiss it, puts false UI on the client's surface. |
| Toggles for photos / video / audio | **Checkboxes**: Photos / Videos / Audio on the web, Photos / Films / Audio in the phone app. | Those are the real controls. |
| Day 0 → 90; files dissolve | **Three nightly sweeps:** Day 91 (413 files), Day 92 (3), Day 112 (6 films). | Clean-up runs nightly at 3 AM and removes files *more than* 90 days old, counted from each upload. Showing that is the strongest proof of per-file retention. |
| The constellation forms in Ch3 | **13 of its 14 stars** form in Ch3. **Syrma** stays unlit until the Finale lights it as "you". | It turns the finale into the payoff of the whole page. |
| Golden hour peak | **5:05 PM** | Sunset in Cebu on 12 December is about 5:24 PM, and Cebu wedding photographers will know it. |
| Notifications jitter | **No jitter.** Speed comes from cards arriving closer and closer together. | Vestibular safety, and paint cost on a mid-range Android. It still reads as panic. |
| Role labels on hover | One star at a time is labelled for 2.6 s, going **once through the nine roles, then stopping**. Pause motion stops it sooner. | Phones have no hover. |
| Slow role marquee | **Scroll-linked** marquee | It stops when you stop. |
| Hero background loop | **Desktop only** (≥ 1024 px, 4G, no Save-Data). Phones get the seeded star canvas over an AVIF poster. | On phones the loop costs data and doubles the animated layers for little visible gain. |
| — | The cream "Community" block is gone. | The only change of light on the page is now the story's own: night → golden hour → day → night. |

**Story calendar (fixed, illustrative):**

| When | What happens |
|---|---|
| Wed 9 Dec, 11:42 PM | Mika needs a crew |
| Sat 12 Dec | The wedding |
| Sun 13 Dec, 4:50 PM | The link is sent |
| Day 21 (Sat 2 Jan), late morning | The films are shared |
| Days 91 / 92 / 112, 3:00 AM | The clean-up sweeps |

- **Years.** Visible strings show the year only where the real UI prints one: the job form's date, the hired-terms card, and the ISO dates in move notices and email subjects. Album day headings omit the current year, so the chapters before Ch6 step 4 use a fixed `now` in 2026, and Ch6 step 4 keeps the day heading out of frame.
- **One source.** Every date, `now`, count and string lives in one module (A1).

**Cast (illustrative):**
- **Mika Dizon**: photographer, Cebu City.
- **Ernie**: photographer and videographer, 2 km away; hired as the videographer, and also shoots stills on the day.
- **Kenn**: video editor and SDE editor, 2 km away.
- **Bea**: HMUA, 8 km away.
- **Client**: the Reyes & Santos wedding.

Distances are whole kilometres, because that's what the app shows. Other people in Nearby come from the illustrative roster in A1 (Appendix A).

---

## 1. Global systems

### 1.1 Rendering model: the static page comes first
- **The server render is the base.** Server Components render every chapter in its final, static state:
  - real H1/H2/H3 headings, all copy, links and the FAQ;
  - a static key-frame figure for each scene.
  - That one render serves crawlers, no-JS visitors and reduced-motion visitors.
- **The hero is never hidden.** The hero headline is never in an opacity-0 reveal, so today's blank-hero problem cannot come back.
- **The motion gate.** Scroll motion mounts only when all of these hold:
  - `(prefers-reduced-motion: no-preference) and (min-height: 520px)`;
  - no Save-Data;
  - not the load-time static mode (`data-motion="off"`).
  - A tiny inline pre-paint script sets the attributes. Storage reads are wrapped in try/catch.
- **Lazy stages.**
  - Each chapter's animated stage is a lazy client chunk.
  - Chunks prefetch at idle, but only when the gate passes. Lite mode and Save-Data fetch nothing.
  - A stage attaches when an IntersectionObserver with a 150% root margin fires, **whether or not the chapter is already in view**. That covers anchor jumps, the Chapters menu and back/forward restore.
  - **Stages enhance in place.** The client island attaches to the server-rendered figure and drives its existing elements: `data-beat` attributes, CSS, and transform/opacity through refs. Counters are written through refs too. Mock markup is rendered once, on the server, and mock code never ships to the client. The canvas sky is the only separately mounted live layer.
  - If the chapter is in view when its stage attaches, progress is seeded from `getBoundingClientRect()` in a layout effect. The figure dips to opacity 0 over 120 ms, takes the current state, and fades back over 200 ms. It never waits for a scroll event.
- **Lifecycle.**
  - One page-level observer tracks the current chapter.
  - `useScroll` lives only in the current chapter ± 1, so at most 3 subscriptions are live, counting the page.
  - Stages more than 3 viewports away unmount.
- **When the static/motion state flips at runtime** (the OS reduced-motion setting changes, or a rotation crosses the 520 px height):
  1. Record the topmost visible copy element that exists in both layouts, and its offset from the top of the viewport.
  2. Unmount the stages and the sky.
  3. Flip the attribute.
  4. Restore that element to the same offset with an instant `scrollTo`. Focus doesn't move.

### 1.2 Pins: few, short, never trapping copy
| Pattern | Used by | Behaviour |
|---|---|---|
| **Sky is the pin** | Prologue (mobile); Ch2 (mobile); Ch3 (mobile, with a bottom sheet); Ch8 (mobile); Finale | One fixed sky canvas plays the scene while the copy scrolls over it, on scrims. |
| **Sticky figure** | Ch1, Ch4, Ch6, Ch7; Ch2 and Ch3 on desktop | The figure is `position: sticky`: a right-hand column at 100 svh on desktop, the top 52–56 svh on mobile. Step cards stay in normal flow. |
| **Full-stage pin** | Ch5 at every size; the Prologue and Ch8 on desktop only | Ch5 is the page's one long hold. Mobile pins only Ch5 (60 svh held). |

These rules apply everywhere:
- No scroll-snap, no wheel or touch interception, no smooth-scroll library.
- Wrappers use `overflow-x: clip`, never `hidden`.
- Tracks use `svh`. Fixed layers use `lvh`.
- Mobile sky anchors are written as offsets from the top in `svh`.
- Pinning is off below 520 px of viewport height.
- **At every scroll position, the figure is complete and at least one copy block is legible.**

**Scroll offsets, per pattern.** One offset can't serve every track.

| Pattern | Offset | Effect |
|---|---|---|
| Full-stage pins, and desktop sticky figures (figure height = viewport) | `['start start', 'end end']` | Range H − V; matches the pin exactly |
| Mobile Prologue (unpinned, in view at scroll 0) | `['start start', 'end start']` | Range H |
| Mobile sky-is-the-pin chapters (Ch2, Ch3, Ch8) | `['start end', 'end start']` | Range H + V. Each p-table is re-timed against where its copy blocks sit in that window. |
| Mobile sticky figures 52–56 svh tall | `useScroll` points at an aria-hidden sentinel `calc(100% + 46svh)` tall | Progress ends exactly when the figure releases, and stays eligible for the native ScrollTimeline |
| Entry-triggered scenes (The work, Finale, Ch9 tiles) | IntersectionObserver | Not scroll-linked |

A development assertion checks, for each mounted chapter, that the range is at least 0.5 V and that p reaches 1 within ± 2 svh of the release.

### 1.3 Camera and the sky
**SkyStage.** It is fixed, and a sibling of the chapters (never inside a transformed, filtered or contained ancestor). It has these layers, back to front:
1. The AVIF poster.
2. The **map**: four static SVG detail levels, each an `<img>` (or an inline SVG that is never changed) inside an HTML wrapper. The camera writes the wrapper's transform; a crossfade between levels is opacity only.
3. **One 2D canvas**: star sprites, plus the animated rings, threads of light, constellation edges, Ch8 cluster lines and Ch7 particles, all drawn with the same camera matrix so they stay locked to the stars.
4. **HTML labels and chips**, placed by projecting world coordinates to the screen (translate only, so they never grow with zoom).

Nothing animated is an SVG stroke-dash, and nothing is a CSS filter. A "strokes on" beat is a partial arc or line drawn in canvas, or a plain opacity fade.

**The camera** is the one exception to the transform-string rule in §1.7:
- One JS camera runs in SkyStage's rAF, driven by the active chapter's progress through context.
- `zoom = exp(lerp(ln z0, ln z1, ease(t)))`. The centre interpolates in world coordinates. Easing is `cubic-bezier(0.65, 0, 0.35, 1)`.
- One tick draws the canvas and updates the map wrapper and labels. Nothing that has to line up with the stars runs on ScrollTimeline.
- Budget: about 1 ms, inside the canvas budget.

**Coordinate frames.** Every cast star carries coordinates in both frames.
- **Geo:** Transverse Mercator, `+proj=tmerc +lat_0=12 +lon_0=122`. Viewbox `0 0 579.5 1000`; 1 unit ≈ 1.879 km.
- **Sky:** a gnomonic projection of the real Virgo figure, centred at RA 199.0135°, Dec −0.1011°, with east on the left.
- A morph value moves stars between the two frames in Ch3.

**Map detail levels.** A level is shown only while its tolerance stays at or under about 2 px on screen (screen px/km × tolerance).

| Level | Tolerance | Zoom | Notes |
|---|---|---|---|
| Archipelago | 1 km | 1–4× | Rings under 8 km² dropped |
| Visayas | 0.25 km | 4–16× | |
| Cebu | 0.1 km | 16–60× | Mactan, Olango, Bohol and Bantayan visible |
| Radar crop | ~0.03 km | ~100–250× | About 60 km around Cebu City, for Ch2's ring framing |

- Each crop's clip box is larger than the largest frame it appears in, with margin.
- The Prologue ends at an exact frame width (stated in px/km in A1), not "about 24×". Ch8 runs the same levels in reverse.

**Star field.**
- **Seed:** mulberry32, seed `0x56495247` ("VIRG").
- **Placement:** 60% scattered around the 71 Nearby cities (σ ≈ 12 km), 40% uniform. Davao City is drawn at its downtown point.
- **Counts:** 320 on mobile, 700 on desktop, 160 in lite mode.
  - Lite mode triggers on Save-Data, 2g/3g, or deviceMemory ≤ 2.
- **Sprite budget:** total sprites per frame, including particles and file-stars, stay ≤ 600 on mobile and ≤ 1,200 on desktop. A file-star "joining the sky" brightens an existing seeded star instead of adding one.
- **Drawing:** pre-rendered sprites through `drawImage` only. No shadowBlur, no filters.
  - The static star layer is cached to an OffscreenCanvas or ImageBitmap whenever the camera moves.
  - Each frame blits that cache, then redraws only the twinkling stars and live particles on top.
- **DPR:** 1.5 on phones. Desktop uses `min(devicePixelRatio, 2, sqrt(8M / (cssW × cssH)))`.
- **Twinkle:** 8% of stars, ≤ 30 fps. Off in lite mode and under Pause.
- **When it draws:** only on change.
- **When it stops:** when `document.hidden`, when no sky chapter intersects, or under Pause.
- **Auto-degrade** measures work, never a fixed frame interval (30 Hz caps on iOS Low Power Mode and in Chrome's Energy Saver are normal):
  1. **Draw cost.** If the median canvas draw cost over 45 draws is above about 6 ms, skipping the first 10 draws after mount or resize, halve the stars and stop the twinkle.
  2. **Dropped frames.** During continuous camera moves, if more than 25% of 45 frames come in at over 1.5× the device's own base interval, do the same.
  3. **Freeze.** If either signal still fires after halving, freeze to the poster.

**The quiet reveal.** The stars mark *places*, not members, and the page never shows a member count. Because they cluster on real cities, the sky has had the shape of the Philippines from the first frame. Ch8 shows the coastline under it.

### 1.4 Time of day: the page's only change of light
**How it works.** Pre-baked full-viewport layers; only their **opacity** animates. Each chapter declares `data-tone="night|gold|day"`. Ink, accent and nav glass switch at a threshold inside a copy-free window.

| Tone | Colours | Where |
|---|---|---|
| Night | `#161311`, horizon `#1E1A17` | Prologue → Ch4 |
| Pre-dawn band | `#6B3E25` | End of Ch4 |
| Golden | `#F7E7CF → #F0C88E → #E8A86E → #D98A55`, sun disc `#FFE7C2` | Ch5. After the 5:05 PM peak the sun disc sinks below the horizon line (transform); the warm ground stays for the reception. |
| Day / paper | `#FBF7F2` (the client page's paper) | Ch6 |
| Dusk breath | 30–40 svh with no copy | After Ch6 |
| Night | | Ch7 → end, with a faint warm horizon in the Finale |

- **Contrast rule.** No copy ever sits over the mid-blend (`#836E50`) or the pre-dawn band.
- **Static version.** No-JS and reduced-motion visitors get the same arc as static section seams with a drawn horizon line.

### 1.5 Colour and contrast (WCAG AA)
**Night (`#161311`).**

| Use | Colour | Ratio |
|---|---|---|
| Ink | `#F2EDE8` | 15.9:1 |
| Secondary | `#BCADA3` | 8.5:1 |
| Muted | `#A08E84` | 5.9:1 |
| Accent text | `#D18A5A` | 6.6:1 |

Never use `#C17745`, `#B66A40` or `#A85F38` for small text.

**Copy over the sky.** Every scrim or card over the canvas, the map or the poster is `#161311`:
- at **≥ 0.92** under any glyph box carrying secondary, muted, accent or meta text;
- at **≥ 0.65** where it carries only ink `#F2EDE8`.
- Radial scrims fade only outside the text block, never under a glyph. Ratios are measured against the brightest sprite plus its glow.

**Gold and paper.**
- Ink `#1E1B18` (≥ 6.3:1 on every stop). Accent text `#7A3E1E`.
- Muted `#6F5C52` only on `#F4DDBB` or lighter.
- Nothing under 24 px over `#E8A86E` or `#D98A55`.

**CTAs** (from `design/tokens.json`):
- Night: `#D18A5A` with `#161311` text (≈ 6.5:1).
- Gold and day: `#A85D35` with white (≈ 4.9:1).
- This fixes today's 3.5:1 white on `#C17745`.

**Focus.** A 2 px solid ring at a 3 px offset: `#F2EDE8` on night, `#1E1B18` on light grounds.

**Mock fills follow their platform.**
- Buttons and selected chips: phone frames use `#A85D35` with white; browser frames use `#D18A5A` with `#161311`.
- **Avatars are never solid.** They are tinted circles with coloured initials, drawn per surface as the app draws them (see B8). The one deliberate deviation: phone initials use `#D18A5A` (≈ 5.3:1) instead of the app's `#B66A40` (≈ 3.8:1), so the mock text clears AA.
- The client page uses its own palette: system-ui with a serif H1, never Geist.

**Tokens.** The story colours move into `design/tokens.json` under `story`, so landing components stop hard-coding hex values.

### 1.6 Type
Geist variable is preloaded. Geist Mono is not.

| Style | Size / leading | Use |
|---|---|---|
| display-xxl | `clamp(3.5rem, 19vw, 14rem)` / 0.86, −0.05em, weight 600 | aria-hidden words: "11:42", "Saturday.", "5:00" |
| H1 | `clamp(2.75rem, 1.6rem + 5.6vw, 7rem)` / 0.95, −0.035em | Hero only |
| H2 | `clamp(2rem, 1.3rem + 3.4vw, 4.25rem)` / 1.0, −0.03em, max 18ch | One per chapter |
| H3 | `clamp(1.25rem, 1.1rem + 0.8vw, 1.625rem)` / 1.2 | Sub-beats, bento, pricing, FAQ |
| Lead | 1.0625–1.25rem / 1.55, max 34ch mobile / 52ch desktop | |
| Body | 16 px mobile / 17 px desktop, leading 1.6 | Never under 16 px on mobile |
| Slate / eyebrow | Geist Mono 0.75rem, uppercase, 0.14em, tabular, slashed zero | Times sit in `<time>` |
| Mock UI | Never under 11 px | |

**Signature.** The H1's final full stop, and later the Finale's, is a small warm star: an aria-hidden glyph 0.3 em wide, with a real "." in an sr-only span.

### 1.7 Motion tokens and wiring
- **Durations:** micro 120 ms · UI 200 · base 320 · entrance 600 · scene 900 · ignite 1200.
- **Easings:**
  - enter `cubic-bezier(0.16, 1, 0.3, 1)` (today's curve, kept);
  - camera `(0.65, 0, 0.35, 1)`;
  - UI `(0.2, 0, 0, 1)`;
  - exit `(0.7, 0, 0.84, 0)`.
- **Springs:** taps and state flips only, never scroll values. Flip `{stiffness 420, damping 32}`; card `{260, 28}`.
- **Stagger:** 40 ms on mobile, 60 ms on desktop. At most 6 items on mobile and 12 on desktop.
- **Travel:** copy moves ≤ 12 px on mobile, ≤ 24 px on desktop.
- **Holds:** ≥ 10% at the start and end of each pinned chapter, and ≥ 8% per copy beat.
- **Ch5 bloom:** one soft bloom. Opacity ≤ 0.25, never full white, never more than 3 a second. Removed under reduced motion.
- **Wiring (DOM stages):**
  - Animate **transform and opacity only**. No animated `filter`, blend mode, dash or layout property anywhere.
  - Use one single-level `useTransform(chapterProgress, stops, values)` per HTML element, written as a transform string so Motion can hand it to the native ScrollTimeline.
  - No React state per frame. Beats flip `data-beat` from `useMotionValueEvent`.
  - The camera (§1.3) is the documented exception.
- **Verification:**
  - Paint flashing and layer borders on a mid-range Android.
  - A Performance trace showing no full-layer repaint per scroll frame.
  - The Animations panel for the HTML effects that should be accelerated.

### 1.8 Chapter hand-offs (one object carries across each seam)
| Seam | Hand-off |
|---|---|
| Prologue → Ch1 | Mika's star glow becomes the lit phone screen |
| Ch1 → Ch2 | The posted job becomes a rising star, then the radar centre |
| Ch2 → Ch3 | The rings condense back into stars |
| Ch3 → Ch4 | The constellation's stars drop into calendar cells |
| Ch4 → Ch5 | The copper horizon becomes the day |
| Ch5 → Ch6 | The album card folds into the link (golden → paper seam) |
| Ch6 → Ch7 | A copy-free dusk breath; tiles shrink to points of light |
| Ch7 → The work / Ch8 | One star lingers |
| Ch8 → Ch9 | A horizon rises and the page lands on ground; the sky stops drawing |
| Ch10 → Finale | The unrisen stars lead up to the Syrma patch |

- Star-to-phone and star-to-calendar hand-offs measure the target's DOM rect at the seam.
- On mobile, any flight longer than 40% of the viewport becomes a 280 ms crossfade.
- No white cuts anywhere.

### 1.9 Navigation, progress and Pause
- **Links.** Every app link comes from `web/src/components/landing/links.ts`: `SIGN_IN_URL`, `SIGN_UP_URL`, `APP_URL` and `DOWNLOAD_PATH`. Nothing hard-codes `web.virgo.ph`.
- **Header.**
  - 56 px on mobile, 64 px on desktop.
  - Transparent over the hero, then glass following `data-tone`: night `#161311` at 90%, day `#FFF8F4` at 90%. No backdrop blur on mobile.
  - Links: Hire → `#hire` · Community → `#community` · Deliver → `#delivery` · Features → `#features` · Pricing → `#pricing` · Download → `DOWNLOAD_PATH` · Sign in · Get started. The sr-only "Open the Virgo app" link → `APP_URL` is kept.
  - The mobile bar is used below 1024 px, which fixes the wordmark colliding with "Hire" at 768.
- **Chapters menu.** A disclosure button holding the chapter list (labels in Appendix B) plus the FAQ.
  - Choosing a link closes the panel and lets the browser's fragment navigation set focus.
  - Esc closes it and returns focus to the button.
  - Focus leaving the panel closes it.
- **Focus and anchors (WCAG 2.4.11).**
  - The fixed header must never hide focus or an anchor target. The marketing page sets `scroll-padding-top: 4.5rem` on the scroll container (`html:has(.landing-scroll)`, or the marketing root layout once §5.5 lands), never on the shared `html`.
  - Today's `section[id] { scroll-margin-top: 5.5rem }` drops to about 1rem, because the two add together.
  - Alias ids sit on the chapter `<section>`.
  - No focusable element sits under a sticky mobile figure.
  - QA: Tab and Shift+Tab through every chapter at desktop and mobile sizes, with the Chapters panel open and closed.
- **Target sizes.** Pause (header and hero), the hero text links, the header links, the Chapters menu items and the Ch2 radio labels are all ≥ 44 px tall.
- **Desktop progress.**
  - An aria-hidden mini Virgo figure (bottom right) lights one star per chapter. Syrma stays dark until the Finale.
  - A story-clock slate beside it, 12-hour, with a fixed `min-width` so it never changes width: `WED 11:42 PM · THU 12:04 AM · THU 12:31 AM · FRI 9:20 PM · SAT 5:00 AM · SAT 5:05 PM → 9:30 PM → 10:48 PM · SUN 4:50 PM · DAY 91 → 92 → 112`. It hides from Ch8 onward.
- **Mobile progress.** A 2 px hairline plus the current chapter's label in mono.
- **Skip the story.** The first focusable item after the header, and also in the hero. It goes to `#features`.
- **Pause motion** (`aria-pressed`, in the hero and the header) **freezes self-running motion.** It takes effect at once, with no reload:
  - **What stops:** the twinkle and canvas loop, the ambient role tour (its label fades out), the C1 hero video (paused, swapped to its poster, source released), the Ch4 sound rings, any Ch9 tile animation still playing, and the Finale pulses.
  - **What doesn't change:** layout, pins and scroll-linked transforms. They move only when the reader scrolls, so pressing Pause never moves the page under them.
  - **Persistence:** saved, and re-applied before first paint as `data-paused`. Pressing it again resumes only what its own load conditions still allow.
  - Visitors who want no scroll motion at all get the static page via the OS reduced-motion setting.
- **On `/download`.** The shared header keeps `sectionBase="/"`: section links become `/#hire` and so on, and the logo goes to `/#top`. It hides Pause, the mini figure, the slate and the progress hairline. Its tone is fixed to night. The page's top offset follows the new header height (`pt-14 lg:pt-16`).
- **Anchors.**
  - Kept: `#top #nearby #community #delivery #features #pricing #faq #start`.
  - New: `#hire #connect #calendar #saturday #forget #the-work`.
  - Old ids kept as aliases: `#how #pillars #showcase`.

### 1.10 The honesty system (your rule, made structural)
- **Every mock is a `<figure>`:**
  - an inert, aria-hidden stage;
  - a figcaption that narrates it, visually hidden in motion mode and visible in reduced mode;
  - a visible footnote that says what is drawn from the app, names any generic chrome (an OS lock screen, unbranded chats), and **ends with "illustrative"**.
- **Imports, without touching the app.** Mocks import only modules with no `'use client'` and no runtime import from `@/api`:
  - `lib/calendar.ts`, `lib/media-days.ts`, `lib/workspaces.ts` (`describeActivity`, `relativeTime`), `lib/notification-categories.ts`;
  - `profileStatsLine` (by direct path);
  - `ROLES`.
  - A lint rule enforces this. Server-rendered mocks never import from a `'use client'` file.
- **Copies.** Values the app keeps private are copied into `story.ts`:
  - the Nearby radii;
  - the web retention options;
  - the `bookingState` labels and a local `rateLabel`;
  - APPLICATION_STATE labels;
  - attendee labels.
- **A string test** (a Node script run in CI and in the build) reads the real sources as text and fails on any drift:
  - `nearby/page-client.tsx`, `new-album-dialog.tsx`, `booking-card.tsx`, `application-state.tsx`;
  - both `event-invites` files and `jobs/new`;
  - the share dialog and sheet, `client-gallery.template.ts`;
  - `mail.templates.ts`, `event-attendees.service.ts`, `album-retention.service.ts`;
  - `api/src/auth/roles.ts`.
  - Exported pure functions such as `eventChanged` and `profileStatsLine` are called directly.
  - For inline service templates, the test checks the static fragments and the shape.
  - It also covers the reel's on-screen strings.
- **A number test** checks that A1's counts reconcile: cohorts sum to the meter readings, roster counts match the chips, and the demo totals match.
- **A banned-words lint.**
  - It checks page-authored copy only: text nodes, alt and aria-label text, footnotes, captions and the reel's captions. It does not check code or attribute names.
  - Words are whole-word and case-insensitive: live, real-time, stream, countdown, expires, public feed, TikTok, App Store, Google Play, payments, payouts, PayMongo, "update themselves", resumable.
  - App strings proven verbatim by the string test are allowlisted by source path (for example the Nearby card's "live position").
- **Footer line:** "Interfaces are drawn from the app. People, places, distances, amounts and album contents are illustrative; we do not put client work on a marketing page. The sky is illustrative; the constellation is real."
- **Optional prerequisite, needing your OK.** Move those private values into shared `lib/` modules that both the app and the mocks import. The string test is enough without it.

### 1.11 Scroll budget (svh)
| | Prologue | Ch1 | Ch2 (+demo) | Ch3 | Ch4 | Ch5 | Ch6 (+demo) + breath | Ch7 | The work | Ch8 | Ch9 | Ch10 | Finale | FAQ | Footer | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Mobile | 120 | 150 | 170 (+50) | 170 | 140 | 180 (60 held) | 190 (+40) + 30 | 140 | 70 | 100 | 250 | 100 | 90 | 110 | 30 | **≈2,130** |
| Desktop | 160 (60 held) | 170 | 190 (+30) | 190 | 160 | 260 (120 held) | 210 (+30) + 40 | 160 | 80 | 140 (40 held) | 160 | 90 | 100 | 100 | 25 | **≈2,335** |

- **Mobile length.** About 15,000 px at a 700 px small viewport. Today's page is 12,851 px at 375 wide, and it says the same thing four times; the story says each thing once.
- **Measured in Phase 3.** Ch9, the FAQ and the reduced-motion total (estimated at about 1,600 svh) are measured with Playwright at 360×640, 375×812 and 390×844. The table is corrected from those runs, and `contain-intrinsic-block-size` uses the measured heights.

**Cut path, if QA says it reads long:**
1. The work (−70 svh).
2. The two in-flow demos (−90).
3. The Finale role picker.
4. Merge Ch2's last two steps.
5. Merge Ch6's steps 1 and 2.
6. Never merge Ch4 into Ch3. That loses 5:00 AM.

Reduced motion is estimated at about 1,600 svh on mobile; Phase 3 measures it.

### 1.12 Performance budgets
- **Core Web Vitals.** LCP ≤ 2.0 s on mobile slow 4G (the H1 text is the LCP); CLS ≤ 0.02; INP ≤ 150 ms; no task over 50 ms after LCP.
- **JS on the critical path. Two cases, depending on §5.5:**
  - **With the root-layout split: ≤ 165 KB gzip.**
    - Framework: 127 KB.
    - Marketing providers: ≤ 10 KB.
    - Story root: ≤ 25 KB.
    - Motion `domMin` (about 20 KB) loads async.
    - Each chapter stage: ≤ 12 KB.
    - A shared story UI chunk: ≤ 15 KB. Mocks use plain class strings and plain-span avatars, not `cn`/tailwind-merge or Radix, so that chunk stays small.
    - Everything loaded by the end of the page: ≤ 320 KB.
  - **Without it: about 300 KB** (127 + 148 + 25). LCP still holds, because it's server-rendered text, but the INP ≤ 150 ms and 60 fps targets are not claimed in that case. That's why §6 Q6 has to be answered before the story PRs start.
  - **Measured, not assumed.** In Phase 3, a two-chapter prototype is measured on the Turbopack production build (`next experimental-analyze`). One of the two chapters is mock-heavy (Ch5 or Ch6), because Motion's tree-shaking under Turbopack is unverified. Any line that runs over is raised to the measured value. After that, a CI size check guards the landing route.
- **CSS:** ≤ 30 KB gzip.
- **HTML and DOM:**
  - HTML ≤ 60 KB gzip including the RSC payload, with < 1 MB raw as a hard cap (iMessage).
  - DOM ≤ 1,500 elements at load for the whole static render, and ≤ 150 per live stage with at most 2 mounted.
  - Phase 3 measures a two-chapter prototype before these numbers are frozen. If it runs over, the budget is raised to the measured value, not ignored.
  - Static map figures (the Prologue's Cebu lens, Ch8's static archipelago) are hashed external images in `<img alt>`, never inline paths.
  - Static grids cap at 6–9 tiles.
  - The live Ch7 ruler is one path or canvas, not 422 nodes.
- **Frame budget:** the canvas ≤ 2.5 ms per frame; total JS ≤ 4 ms per 16.7 ms frame; no full-layer repaint per scroll frame.
- **Deferred rendering:** `content-visibility: auto` with `contain-intrinsic-size` on Ch9, the FAQ and the footer only. Never on an ancestor of the sky.
- **No layout shift:** counters use tabular figures with reserved widths, meters use `scaleX`, and chat bubbles are laid out before they animate.

---

## 2. Chapters

Each chapter lists: purpose · scroll · pin · timeline (chapter progress `p`, 0 → 1) · final copy · interactive · mobile · reduced motion · assets (IDs refer to §4) · truth notes.

---

### Prologue — The Sky · `#top`
**Purpose.** Say what Virgo is in one line. Then let the visitor *feel* the premise, that every creative is a star, and land on one person: Mika.

**Scroll.** Mobile 120 svh, unpinned · desktop 160 svh with a 100 svh stage, 60 svh held · reduced ≈ 100 svh.

**Timeline**
| p | Beat |
|---|---|
| Load | Eyebrow, H1, lead, CTAs and "Skip the story" paint at full opacity over the AVIF sky poster. The poster is a CSS background, so the H1 is the LCP. After idle, the canvas crossfades over the poster in 400 ms and the 8% twinkle starts. |
| Ambient | One star at a time brightens with a mono label for 2.6 s, for example "a videographer, somewhere near Iloilo City". It goes once through the nine roles (≤ 25 s), then stops. Pause stops it at once. Stars are not focusable. |
| 0.00–0.20 | Hold. |
| 0.20–0.45 | The camera starts its push. *Desktop:* the copy lifts 24 px and fades, and the H1's star full stop detaches and stays fixed on screen (the signature beat). *Mobile:* the copy just scrolls away. |
| 0.45–0.80 | The push runs archipelago → Visayas → Cebu City (10.3157 N, 123.8854 E), crossing the map levels. Outer stars drop to 15%. *Mobile starts already framed on the Visayas.* |
| 0.80–1.00 | Mika's star centres, gains a halo, and resolves a chip: "Mika · Photographer · Cebu City". *Desktop slate:* WED 11:42 PM. Hand-off: her glow becomes Ch1's lit phone screen. |

**Copy**
- Eyebrow: Built in the Philippines, for Filipino creatives
- **H1:** Where creatives find each other, and get paid.
  - Line 1 is weight 500 in `#BCADA3`.
  - Line 2 uses today's gold gradient.
  - The full stop is a star.
- Lead: Virgo is a network of photographers, videographers, editors and HMUAs, and the workspace they run the job from.
- CTAs: **Join the community** → `SIGN_UP_URL` · **Sign in** → `SIGN_IN_URL`
- Micro: Free plan with 15 GB. No card needed.
- Text links: Follow one job ↓ (`#hire`) · Skip the story (`#features`) · Pause motion
- sr-only figure caption: A night sky over the Philippines. Each star stands for a creative somewhere in the country. Illustrative; the stars are not members.

**Interactive.** The CTAs, the skip link and Pause motion. Nothing in the sky is interactive.

**Mobile.** Normal flow, checked at 375 × 548 (iPhone SE Safari):
- eyebrow, H1, lead and CTAs stack 16–24 px apart;
- the H1 stays on 3 lines at its 375 px clamp value; if it wraps to 4, the eyebrow shortens;
- both 48 px CTAs end at or above 85% of svh;
- the micro line and text links may fall below the fold (the header keeps Pause and the skip link);
- copy sits on a radial scrim per §1.5;
- the archipelago fills the portrait frame, with 320 stars, DPR 1.5, no video.

**Reduced motion / no JS.**
- The static poster sky with three labelled stars, and the full hero.
- Below it, a static circular "lens" image of Cebu with Mika's chip, which implies the zoom.
- No twinkle, push, role tour or video.

**Assets.** A1, A3, A4, A5, B1, B2, B3, B3c, B4, B5, B11, B13, and C1 on desktop (rules in §4).

---

### Ch1 — Wednesday, 11:42 PM · `#hire` (alias `#how`)
**Purpose.** Name the real problem, finding a crew by Saturday through group chats, then show the first way out: post the job once, with a rate for every role.

**Scroll.** Mobile 150 svh · desktop 170 svh · sticky figure. The phone sits in the right column on desktop. On mobile it fills the top 54 svh without a bezel, so the reader's own phone becomes Mika's.

**Timeline**
| p | Beat |
|---|---|
| 0.00–0.10 | Step 1 enters. The lock screen reads 11:42 PM. *Desktop:* a giant mono "11:42" sits behind at 14% opacity (aria-hidden). |
| 0.10–0.50 | **The mess, mapped to scroll.** Unbranded chat and notification cards stack: "anyone free sat? vid + SDE + HMUA" · "Seen by 14" · a story reply left on Seen · a contacts search for "kenn" returning *Kenn SDE?* and *Kenn (Dumaguete wedding)*. The gap between arrivals tightens from 8% to 2% of progress. **No jitter.** Older cards scale 0.98× per depth. The unread count climbs, and the clock reaches 11:57. *Mobile shows 5 cards, desktop 7.* Step 1's three time lines highlight in turn. |
| 0.50–0.58 | **Freeze.** A `#161311` overlay settles to 60% over the pile. Nothing moves. |
| 0.58–0.88 | Step 2, "Or post the job once." The same phone wipes to the real **Post a job** form, filling as you scroll. Role badges switch on: Videographer, SDE Editor Video, HMUA. Budgets type in, in tabular figures: 18,000–25,000 · 12,000–15,000 · 8,000–12,000. Then the brief types in, and its hint becomes the counter "84 / 4000". |
| 0.88–1.00 | **Post it** presses (scale 0.97, 120 ms). A stamp reads "Posted · 11:58 PM". The post becomes a small star that rises into the sky (hand-off). |

**Copy**
- Eyebrow: 01 · Wednesday, 11:42 PM · Cebu City
- **H2:** Saturday's wedding is booked. The crew isn't.
- Body: Mika needs a videographer, a same-day-edit editor and an HMUA for the Reyes & Santos wedding on Saturday. She knows people. They're somewhere in her phone.
- Steps (`<ol>`):
  - **11:42 PM.** Three group chats, one question.
  - **11:51 PM.** Seen by 14. Answered by nobody.
  - **11:57 PM.** "Kenn SDE." Which Kenn?
- Pull line: Most of the work in this trade comes from someone you know. Finding them by Saturday is the hard part.
- **H3:** Or post the job once.
- Body: Put it on the Jobs board with what each role pays, up to ₱500,000 a role.
- Mock form (aria-hidden; phone layout and the app's own labels, in this order):
  - "What do you need?": Wedding crew for Saturday in Cebu City
  - "Which roles are you hiring for?"
  - "Date of the job": Sat, Dec 12, 2026
  - "Where": Cebu City
  - "What each role pays (₱)"
  - "The brief": Church at 3, reception at the hotel. The SDE plays at 9:30 PM. Need files by Sunday.
  - [Post it]
  - "Posts run for 30 days, or until the job date passes."
- Footnote: The chats and lock screen are generic; the Post a job form is drawn from the app. People, places and amounts are illustrative.

**Interactive.** None in the stage.

**Mobile.**
- Step cards sit on `#1E1B18` at 96% over the lower 46 svh.
- Each time line is its own short card, so a fling can't skip the joke.
- Budget rows stack as label / from / to.
- One animated group at a time; the canvas holds at 10%.

**Reduced motion.** "11:42 PM" set in display mono, then two static figures:
- **Before:** a frozen pile of 5 cards at 11:57.
- **After:** the finished form, brief included, stamped "Posted · 11:58 PM".

**Assets.** A1, B8, B9 (phone, lock screen), B10: ChatCardStack, JobPostForm.

**Truth notes.**
- The job board and per-role budgets up to ₱500k are verified.
- "Post it", the brief (minimum 30 characters) and the helper line are the app's own.
- The helper shows only once the form is complete, which is why the brief is filled in.
- No link to `virgo.ph/jobs` (a 404 today).

---

### Ch2 — Nearby · `#nearby`
**Purpose.** Show that the people are already around her, and that the only thing Virgo reveals is distance.

**Scroll.** Mobile 170 svh + a 50 svh demo in normal flow · desktop 190 + 30.
- *Mobile:* sky is the pin. The radar centre sits at 32 svh, and step cards scroll over the lower half, at least 55 svh apart.
- *Desktop:* the radar fills the left 55%, with a sticky Nearby panel on the right.

**Timeline** (mobile re-timed to the cover offset in §1.2)
| p | Beat |
|---|---|
| 0.00–0.12 | The camera eases from the job star to Mika at radar framing. Step 1 enters. *Desktop slate:* THU 12:04 AM. In the panel, the event chip "Reyes & Santos wedding / Cebu City" under NEAR becomes selected. The helper reads "Measuring from Cebu City. This does not move you — you are still findable where you are." The selected roles are Videographer, SDE Editor Video and HMUA. |
| 0.12–0.32 | The **5 km** ring opens (canvas arc). The stars inside brighten. Rows for the selected roles appear in distance order: "Ernie · 2 km away · Photographer, Videographer", "Kenn · 2 km away · Video Editor, SDE Editor Video", "Rhea · 4 km away · HMUA", each with **Add**. Distances count up in whole numbers only. Every role chip shows its count, zeros included (Appendix A). |
| 0.32–0.52 | The camera zooms out 5×, so the ring reads **25 km** at the same size. Bea lights up: "Bea · 8 km away · HMUA". The list grows to 10 rows, cropped with a visible scroll edge, and the chip counts update from the roster. |
| 0.52–0.68 | *Beat name, not shown on the page:* distance, not direction. *Desktop:* each lit star smears into a thin ring at its distance, and the map dims. *Mobile:* one star only. The H3 arrives on a scrim. |
| 0.68–0.82 | *Beat name, not shown:* erased, not hidden. An unnamed star 3 km out, tagged "a coordinator", turns sharing off and is **removed in one frame**: no fade, no ghost. The Coordinator chip goes 1 → 0. |
| 0.82–1.00 | In normal flow, outside the panel, a standalone two-frame card. (1) Off: "Share my location" · "You are not discoverable", the helper "Would rather not share a live position? Name your city instead — it makes you findable to the same kilometre.", and the field filled "Cebu City". (2) On: "Discoverable · Cebu City". Hand-off: the rings condense back into stars. |

**Copy**
- Eyebrow: 02 · Thursday, 12:04 AM · Nearby
- **H2:** Then see who is working near the shoot.
- Body: Pick the roles and a distance, from 5 km out to 200. Nearby lists the people inside it who do that work, how many there are, and how far away each one is, in whole kilometres. Someone who shoots and edits turns up under either search.
- **H3:** The only thing anyone learns is how far away you are.
- Body: Only people sharing their location can see each other. Positions are kept to about a kilometre and never shown as a pin. Turn sharing off and the position is erased, not hidden.
- Closing: Shooting out of town? While you're sharing, you can search from any of 71 Philippine cities, or from the city of an upcoming shoot.
- Mock strings (aria-hidden):
  - NEAR / WITHIN 5 km · 25 km · 50 km · 100 km · 200 km
  - LOOKING FOR (with counts)
  - SUGGESTED COLLABORATORS
  - "Others see only how far away you are, never where you are. Turning this off erases your stored location straight away."
- Footnote: Interface drawn from the app. People, counts and distances are illustrative.

**Interactive.** "Try the distance", after the steps, in normal flow:
- a fieldset "Within" with radios for 5 / 25 / 50 / 100 / 200 km (arrow keys work);
- it redraws a static radar illustration;
- a polite live region reads the roster-derived count, for example "Within 25 km: 11 people in this illustration."

Nothing inside the fixed or sticky stage is focusable.

**Mobile.** Cards are 343 px wide on `rgba(22,19,17,.92)`. During the zoom, only the canvas and the map wrapper's transform move. Phone fills: `#A85D35` buttons and chips, tinted avatars.

**Reduced motion.**
- A static radar at the 25 km scale with the 5 km and 25 km rings and the rows.
- A before/after pair: "Distance only" and "Sharing off: erased (Coordinator 1 → 0)".
- The two-frame city card.
- The radio demo still works, instantly.

**Assets.** A1, A3, A5, B1, B5 (Cebu and radar levels), B6 (static radar for reduced motion and the demo), B8, B10: NearbyPhone / NearbyPanel, LocationCard.

**Truth notes.**
- Verified: radii 5–200 km, the ~1 km grid, whole-km rounding, the 71 cities, the event-city chip, city instead of GPS, and erase-on-off.
- Rows show only the selected roles; chips count every role.
- The privacy beat uses a non-cast coordinator.
- The city card is the viewer's own card, shown in its two real states, outside the panel (the panel's sections only render while sharing).

---

### Ch3 — Connect · `#connect`
**Purpose.** Turn strangers into a crew with mutual consent, and show that the job's terms get written down.

**Scroll.** Mobile 170 svh · desktop 190 svh.
- *Mobile:* sky is the pin. The constellation sits in the top 45%, and a phone-styled bottom sheet rises to 70% and drops to a 64 px peek.
- *Desktop:* a sticky right-hand panel holds the UI.
- No card covers the sky while the figure forms (p 0.72–0.92).

**Timeline**
| p | Beat |
|---|---|
| 0.00–0.15 | Thin threads of light (canvas) travel **from** Ernie's, Kenn's and Bea's stars **to** Mika's: applications arriving. *Mobile one at a time; desktop overlapping.* Each pops an in-app card: "New application · Ernie applied as Videographer for 'Wedding crew for Saturday in Cebu City'". |
| 0.15–0.35 | Accept ×3. On the poster's applicant row, **Accept** presses. The thread turns solid gold and a pulse runs back. Kenn and Bea follow faster. The H2 lands on the first solid line. |
| 0.35–0.60 | **The terms.** On Ernie's phone, the chat opens with the **HIRED AS VIDEOGRAPHER** card in its hired-creative state: Date 12/12/2026 · Location Cebu City · Rate ₱25,000 · "They set these terms. Confirm them, or say so in the chat." [Confirm these terms]. Confirm presses. Cut to Mika's side: "They confirmed these terms." The booking badge flips from *Waiting on them* to **Agreed**. Then the group thread "Reyes & Santos crew", text only: Mika, "@Kenn SDE by 9 PM?"; Kenn, replying, "Sure."; the read ticks fill. |
| 0.60–0.72 | The H3 card on a scrim (§1.5). Everything else holds. |
| 0.72–0.92 | **The constellation resolves.** The four cast stars glide to their true sky positions: Mika → Spica, Ernie → Porrima, Kenn → Vindemiatrix, Bea → Heze. Nine more stars of the IAU figure fade in, sized by magnitude. **Syrma stays an unlit socket, and its two edges stay undrawn.** The crew lines fade as the figure's edges draw (canvas lines growing from their start points), so the sky stays astronomically honest. *Mobile:* each cast star gets a mono label as it settles ("Mika · Spica"…), plus one line, "Virgo, from real star positions". Fallback if crowded: one line, "Virgo · Spica, Porrima, Vindemiatrix, Heze". |
| 0.92–1.00 | "Every role is filled · 'Wedding crew for Saturday in Cebu City' is fully staffed and has left the board." Hold. |

**Copy**
- Eyebrow: 03 · Thursday, 12:31 AM
- **H2:** Nobody lands in your network without agreeing to it.
- Lead: Ernie applies at 12:31. Kenn and Bea before one.
- Body: They applied; Mika accepted. Each acceptance connects them and opens a chat that starts with the job and its terms. The person hired confirms them, and if Mika changes anything, they're asked again.
- **H3:** Virgo writes down the rate. The money is between you.
- Body: A booking records the role, the date, the place, the peso rate and what's included. Virgo doesn't take or hold payment. You pay each other the way you already do.
- Card footer (verbatim): A record of what you agreed, not a legal contract.
- Desktop caption (mono): Virgo, from real star positions: Spica, Porrima, Vindemiatrix, Heze.
- Footnote: Interface drawn from the app. People, amounts and messages are illustrative.

**Interactive.** None. It is scroll-only, so the mock and the app never blur.

**Mobile.** The thread is capped at 2 messages. The star labels are aria-hidden; the figcaption carries the full cast-to-star mapping.

**Reduced motion.** A 2×2 static set, stacked on mobile:
- the applicant rows reading "Accepted";
- the terms card, confirmed, with the Agreed booking;
- the thread;
- a static 13-star chart with the cast names beside the star names, and Syrma hollow.

Then the "Every role is filled" card.

**Assets.** A1, A2, B1, B6 (static chart), B8, B10: ApplicantRow, HiredTermsCard (both sides, never mixed in one frame), BookingBadge, GroupThread + Bubble, NotificationRow.

**Truth notes.**
- Verified: accept → connection + chat seeded with terms + booking.
- Star positions are SIMBAD/Hipparcos J2000; the figure is the IAU / Sky & Telescope one.
- Syrma is held back until the Finale.
- Kenn's reply is plain English. A Cebuano line goes in only after a native speaker reviews it.

---

### Ch4 — The Calendar · `#calendar`
**Purpose.** Show that the crew is actually coming, that a change reaches everyone, and that the reminder rings with no signal.

**Scroll.** Mobile 140 svh · desktop 160 svh · sticky figure. The figure is **Mika's phone throughout**, so mobile strings apply.

**Timeline**
| p | Beat |
|---|---|
| 0.00–0.20 | The canvas dims to 30% and stops; Ch4's opaque night surface takes over. The constellation's 13 stars drop into a December month grid (Sunday first). Sat 12 is selected and glows gold, with one event dot. Event detail: "Reyes & Santos wedding · Sat 12 Dec · 6:30 AM · Cebu City". |
| 0.20–0.40 | Under **"Who’s coming"**, Ernie, Kenn and Bea flip from *Invited* to **Going** (flip spring; status colour `#A89489 → #6B8E4E`). A notification row reads "Ernie accepted your invitation · Reyes & Santos wedding". |
| 0.40–0.62 | The time digits roll 6:30 → **6:00**. Three in-app notification cards fan out to the crew's avatars: "Mika Dizon moved an event / Reyes & Santos wedding — now 2026-12-12 at 06:00". *Desktop:* below them, an email subject chip: "Moved: Reyes & Santos wedding is now 2026-12-12 at 06:00". |
| 0.62–0.78 | Mika's phone shows **New reminder**: "for Reyes & Santos wedding" · Leave for the hotel · Call time 6:00. Cards, batteries, the second flash. · 5:00 AM · Alarm: "Play a sound at the reminder time". |
| 0.78–1.00 | **Signature moment.** The phone dims to a generic lock screen: zero bars, "No service", a large **5:00**. A plain notification arrives: Virgo · Leave for the hotel. Two sound rings expand (≤ 2 cycles, opacity and scale; stopped by Pause). *Desktop slate:* SAT 5:00 AM. A thin copper horizon rises, the first light on the page. |

**Copy**
- Eyebrow: 04 · Friday, 9:20 PM · Schedule
- **H2:** The call time moved. Everyone heard.
- Body: Invite the crew to the shoot and each of them accepts or declines. It goes on their calendar only when they say yes, so the schedule shows who is actually coming. Move the call time and everyone going gets a notification in Virgo and an email saying who changed it, with the old time and the new one.
- **H3:** 5:00 AM. No signal. It rings anyway.
- Body: Set a reminder in the Virgo phone app with the alarm on and it's scheduled on the phone itself, so it goes off on time with no signal at all.
- Micro (muted): On Android 14 and later, allow Alarms & reminders for Virgo so it rings on the minute.
- Footnote: The lock screen and its banner are generic; the calendar, notifications, email subject and reminder are drawn from the app. Illustrative.

**Interactive.** None.

**Mobile.**
- The calendar shrinks to the week row containing Sat 12, plus the event detail.
- One notification card; the email chip is hidden.
- The lock screen fills the 54 svh figure, with "5:00" behind it at 20 vw.

**Reduced motion.** Three static keyframes plus a still copper horizon band:
1. the event with Going ×3;
2. the notification card;
3. the zero-bar lock screen with the reminder, without rings.

**Assets.** A1, B8, B9 (phone, lock screen), B10: MonthGrid (`calendar.ts`), EventDetail + Attendees, NotificationRow, ReminderSheet, EmailSubjectChip.

**Truth notes.**
- Verified: accept/decline, calendar on accept, change alerts (in-app + email), and offline reminder alarms.
- "Who’s coming" and "Invited" are the phone's strings ("Who is coming" and "Awaiting reply" are the web's).
- Change alerts are drawn as in-app cards, because Android remote push is unverified.
- The email subject uses the template's real ISO format.

---

### Ch5 — Saturday (the emotional peak) · `#saturday`
**Purpose.** The shoot itself, and the day the page turns golden. Everyone's work lands in one album, in the order it happened.

**Scroll.** Mobile 180 svh, **60 svh held** · desktop 260 svh, 120 held · **full-stage pin**. It is the page's one long pin, because the light change and the converging album need one held frame. Reduced: unpinned, about 160 svh.

**Timeline**
| p | Beat |
|---|---|
| 0.00–0.08 | Night. Only the time chip, on its own solid surface: "Saturday · 6:00 AM · Call time". Mika's star sits on the horizon. |
| 0.08–0.30 | **The light changes. No copy on screen.** The night layer fades out and the pre-dawn and golden layers fade in (opacity only). The stars fade. Mika's star becomes the low sun. The chip steps: 9:30 AM · Prep → 3:00 PM · Ceremony → **5:05 PM · Golden hour**. Its surface flips to paper at p 0.20. Viewfinder corners and "1/250 · f/2.8 · ISO 200" appear. **One soft bloom at p 0.27** (*mobile: corner marks only*). The aria-hidden display word **"Saturday."** lands with the sun as its full stop. |
| 0.30–0.40 | **The crest.** The sun sinks below the horizon line, and the chip steps to "9:30 PM · Reception". Kenn's film tile pulses at his laptop chip and shows "3:48". Mono line: "9:30 PM — the same-day edit plays at the reception." *Desktop slate:* SAT 9:30 PM. |
| 0.40–0.55 | The H2 and lead arrive. **Three gold threads** (canvas paths) run from three device chips, Mika's camera, Ernie's camera and Kenn's laptop, to one album card. Abstract tiles fly along them, each stamped with its upload time ("Sat 10:48 PM"), so the flight reads as *later that night*, not live. *Mobile 6 tiles, ≤ 3 moving; desktop 12; lite: none.* *Slate:* SAT 10:48 PM. |
| 0.55–0.72 | The album resolves: "Reyes & Santos — Wedding" with a DRAFT pill, the section chips Prep · Ceremony · Reception, and the day heading "Saturday 12 December · 413 items · 05:52 – 22:41". Tiles from the three sources interleave into capture order against a time ruler (vertical on mobile). Counter: **412 photos · 1 film**. *Mobile:* one H3 at a time, each held ≥ 8% of p. |
| 0.72–0.92 | The activity card: "You uploaded 248 files to Reyes & Santos — Wedding" (Owner) · "Ernie uploaded 164 files to Reyes & Santos — Wedding" (Photographer) · "Kenn uploaded a file to Reyes & Santos — Wedding" (Editor). **One** storage meter fills from 0.3 GB to 6.3 GB with `scaleX`: on the web "6.3 GB / of 15.0 GB on the free plan"; the phone ring reads "6.3 GB used · 8.7 GB left". *Mobile:* only a mono label on the meter, "Crew uploads count against Mika's 15 GB". |
| 0.92–1.00 | The grid compresses into one album card at the centre (the object Ch6 turns into a link). The pin releases. |

**Copy**
- Eyebrow: 05 · Saturday
- **H2:** Everyone shot it. One album holds it, in order.
- Lead: That night, the crew uploads into Mika's album. Virgo files every frame by when it was taken, not when it arrived.
- Aside (mono, small): Set the camera clocks to match first. Virgo reads them as written.
- **H3:** Split it the way the day went.
  - Prep, Ceremony, Reception.
- **H3:** Kept as shot.
  - The files you upload are the files Virgo keeps.
- **H3:** One meter. *(Desktop in the pin; on mobile, in normal flow after the pin releases.)*
  - Give the crew upload access and what they add counts against your storage, not theirs. Virgo checks there's room before an upload starts.
- Footnote: We do not put client work on a marketing page. Interface drawn from the app; album contents are illustrative.

**Interactive.** None (a held moment).

**Mobile.**
- "Saturday." at 22 vw, left-aligned, during the light change only.
- From p 0.30, a paper sheet (`#FBF7F2` at 94%, ink), capped at about 40% of svh, shows one copy beat at a time:
  - (A) eyebrow, H2, lead and aside;
  - (B) one H3 at a time;
  - (C) the meter label only.
- No sheet during the light change.
- A 3-column grid of light Plates (baked grain, no blend modes). At most 3 animated layers.

**Reduced motion.** No pin. A static golden band starts at a drawn horizon line, with:
- "Saturday." and a still sun;
- the finished album (chips, day heading, tiles in order);
- a legend of the three sources and their counts;
- the activity card and the meter at 6.3 GB.

No bloom.

**Assets.** A1, B1 (time-of-day layers, gold threads), B7, B10: DeviceChip, AlbumHeader / SectionChips / DayHeading / Grid (`media-days.ts`), FilmTile, ActivityFeed (`describeActivity`), StorageMeter (bar + ring), Viewfinder, B11.

**Truth notes.**
- Verified: capture-time ordering with day headings, sections as client chapters, originals kept, crew uploads counted against the owner's storage, and the room check.
- There is no live upload stream; tiles carry upload times.
- The activity line names the album, not a section.
- The numbers reconcile: 248 + 164 = 412 photos; plus the SDE film = 413 items, the first cohort in Ch7; 0.3 + 6.0 = 6.3 GB.
- Ernie also shot stills; his films arrive on Day 21.

---

### Ch6 — The Handover · `#delivery`
**Purpose.** Delivery that needs nothing from the client. Then the two things photographers didn't know they'd get: the picks come back to them, and the same link grows when the films are done.

**Scroll.** Mobile 190 svh + a 40 svh demo + a 30 svh breath · desktop 210 + 30 + 40 · sticky figure (the owner's dialog or sheet, and the couple's phone).
- **Ground:** the client page's paper, `#FBF7F2`, entered through a golden → paper seam. `data-tone="day"`, and the nav switches to light glass.
- The client mock is in light mode, which is real: the client page follows the device's setting.

**Timeline**
| p | Beat |
|---|---|
| 0.00–0.20 | The album card folds into one line of large mono type: `client.virgo.ph/s/a4f2…`. *Desktop:* a title card, "Sunday, 4:50 PM", then the web **Client link** dialog, "What the link shows": Photos ticked; Videos and Audio unticked; "Anything unticked is not served at all, not merely hidden." [Generate link]. *Mobile:* the phone's **Client link** sheet, "Choose what the client sees. Anything unticked is not served by the link at all.", with three checkbox rows: Photos / 412 photos (ticked) · Films / 2 films · Audio / 2 files. Then [Make link] and the alert "Client link ready" showing the URL (Copy link · Share… · Done). |
| 0.20–0.30 | The link leaves as a streak of light (the star motif) toward the couple's phone. *Mobile: a translate of ≤ 40%, or a 280 ms crossfade.* |
| 0.30–0.50 | The client page opens: PRIVATE DELIVERY · the serif H1 "Reyes & Santos — Wedding" · "412 items · 5.6 GB" · Download all · chapters **Everything 412 · Prep 96 · Ceremony 151 · Reception 165**. The day heading is kept out of frame, because it counts only the files loaded so far. Tiles paint as pre-blurred Plates, then sharpen in a stagger (opacity crossfade, no live blur). There are no kind tabs yet: the real page hides them when only one kind is shared. |
| 0.50–0.68 | Hearts fill on tiles and the picks bar rises: "12 picked · Send to photographer" (at ≤ 520 px the Download label shows as an icon only). Send presses, and the button becomes **"Send again"**. Mika's in-app card: "Your client sent their picks · 12 files chosen from “Reyes & Santos — Wedding”." |
| 0.68–0.92 | **Three weeks later** (eyebrow inside the beat). *Desktop:* the dialog returns, Videos and Audio get ticked, then [Update link]. *Mobile:* the sheet reopens with only Photos ticked; Films / 8 films and Audio / 2 files get ticked; [Make link]; the **same URL** shows in the "Client link ready" alert. A "Same link" bracket marks the unchanged address. The phone now shows kind tabs **All 422 · Photos 412 · Films 8 · Audio 2**. A film tile plays (poster → frames → progress bar). Then "Recordings · 2 files" and the dock "Vows · 0:42 / 3:12". |
| 0.92–1.00 → breath | The paper fades through dusk to night with no copy on screen. Tiles shrink to points of light (hand-off to Ch7). |

**Copy**
- Eyebrow: 06 · Sunday, 4:50 PM · The couple's phone
- **H2:** One link. No account. Nothing to explain over the phone.
- Body: Send the album as a link. It opens in any browser, in chapters (Prep, Ceremony, Reception) in the order you set, with blurred previews that sharpen on mobile data. Every download is the original file.
- Line: No app. No sign-up. No password.
- **H3:** They pick. You get told.
  - The couple taps the heart on the ones they love, then downloads just those or presses Send to photographer. You get a notification, and the album opens on their picks.
- Eyebrow: Three weeks later
- **H3:** Same link when the films are ready.
  - Tick films and audio when the edit is done. The address doesn't change. Films play in any browser, HEVC and ProRes uploads included, and recordings get a small player of their own. Turn the link off and it stops opening straight away.
- Dialog note (desktop only, verbatim): Unguessable, but public to anyone holding it. Treat it like a key, and revoke it once the shoot is signed off.
- Footnote: Interface drawn from Virgo and the client page. People and album contents are illustrative.
- Figcaption narration includes what a screen reader hears on the real page after Send: "Sent. Your photographer has your 12 picks."

**Interactive.** "Try the hearts", after the figure, in normal flow:
- six Plate tiles with `aria-pressed` heart buttons ("Pick: illustrative photo 3"), 44 px targets;
- the picks count is announced in a polite live region;
- "Send to photographer" announces "Sent. Your photographer has your 12 picks." (with the real count) and becomes "Send again";
- no network calls, and it works under reduced motion.

**Mobile.**
- The couple's phone *is* the figure: full width, no bezel, the client page at its real mobile proportions.
- The owner's sheet appears only in steps 1 and 4.
- At most 2 animated groups.

**Reduced motion.** Three static panels with visible captions:
1. the sheet (or dialog) with Photos ticked, and the URL;
2. the client page with hearts and the picks bar showing "Send again";
3. the sheet with Films and Audio ticked, the identical URL, and the phone with kind tabs and the Recordings dock.

The hearts demo still works.

**Assets.** A1, B6 (LinkStreak, static), B7, B10: ShareDialog (web), ShareSheet + LinkReadyAlert (phone), ClientGalleryPage (light, picks bar, chapter tabs, kind tabs, FilmTile, Recordings dock), NotificationRow, B12.

**Truth notes.**
- Verified:
  - client hearts → Download or Send to photographer;
  - sections as chapters;
  - blur → WebP previews and originals;
  - one link per album with a changeable scope, and turning it off;
  - HLS/720p film playback and the Recordings player.
- The "Sent…" sentence is screen-reader-only on the real page, so the mock never shows it.
- No countdown, no expiry, no sign-in screen.
- The numbers reconcile: at Sun 4:50 PM the album holds 412 photos + 2 films (the SDE and the teaser) + 2 recordings. By Day 21 it is 412 + 8 + 2 = 422.

---

### Ch7 — Forget · `#forget`
**Purpose.** The feature nobody else sells: the job cleans up after itself, file by file, and tells you when it has.

**Scroll.** Mobile 140 svh · desktop 160 svh · sticky figure. The day ruler holds still while a playhead moves; the dissolving tiles are canvas particles.

**Timeline**
| p | Beat |
|---|---|
| 0.00–0.12 | Night is back. A flashback chip shows the **New album** field "Keep files for · 90 days after upload", with the helper "Each file is deleted 90 days after it is uploaded. This cannot be undone." A ruler (one path) runs from Day 0 to Day 112 and marks three upload cohorts as density marks: Day 0 (413), Day 1 (3), Day 21 (6). Below it is the visible tile grid. Meter: 9.2 GB. |
| 0.12–0.50 | A mono day counter (tabular) scrubs forward. **Day 91, 3:00 AM:** the Day 0 marks fade, and the **visible tiles** dissolve into particles that rise and brighten existing stars (*mobile 6 tiles, ≤ 36 particles in total; desktop 12 tiles, ≤ 72*). Notice: "Delivered files cleaned up · 413 files removed from “Reyes & Santos — Wedding” as scheduled." The meter drains to 3.2 GB. |
| 0.50–0.80 | **Day 92:** "3 files removed from “Reyes & Santos — Wedding” as scheduled." (*mobile: a single line, not a card*). The meter reads 2.8 GB. **Day 112:** "6 files removed from “Reyes & Santos — Wedding” as scheduled." The meter settles at 0.3 GB. |
| 0.80–1.00 | The album card stays, with its DELIVERED pill and "Empty". A small client-page mock reads "Nothing has been shared here yet." Hold. |

**Copy**
- Eyebrow: 07 · Keep files for: 90 days after upload
- **H2:** Hand it over. Then forget about it.
- Body: When Mika made the album she chose how long to keep its files: 90 days, counted from each file's upload. When the day comes, Virgo deletes the originals and every preview copy, then tells her how many went. Nobody has to remember to tidy up, and the storage comes back.
- Step: Clean-up runs every night, so a file goes in the first sweep after its 90 days are up. Day 91, Saturday's 413. Day 92, the teaser and the two recordings. Day 112, the six films Ernie finished three weeks later.
- Small: The album and its link stay. The link just has nothing left to show, so tell your client the date. Or leave the setting at "Until I delete them" and keep everything.
- Footnote: Interface drawn from the app. Illustrative.

**Interactive.** None. A "Try a different window" select was considered and cut: the phone app offers different retention choices from the web, and a demo would invite that question.

**Mobile.** The counter in mono at 3 rem. A 6-tile grid. A full-width scrubber. Two notice cards plus the one-line Day 92 note. Canvas particles plus one DOM group.

**Reduced motion.**
- An annotated timeline (vertical on mobile) with markers at Day 0 / 91 / 92 / 112, each carrying its notice.
- A before/after meter: 9.2 GB → 0.3 GB of 15.0 GB.
- The empty album card.

**Assets.** A1, B1 (particles), B7, B10: RetentionField, DayRuler, NotificationRow, StorageMeter, AlbumCard, ClientGalleryEmpty.

**Truth notes.**
- Verified:
  - per-file retention counted from upload, with a nightly 3 AM sweep of files older than 90 days;
  - originals and preview copies deleted;
  - the clean-up notice.
- Retention is chosen when the album is made; nothing implies it can be changed later.
- Clients aren't warned, hence "tell your client the date". Archiving and pausing don't pause retention, so the page never claims they do.
- The numbers reconcile: 0.3 GB of other albums + 6.0 + 0.4 + 2.5 = 9.2 GB; then → 3.2 → 2.8 → 0.3.
- Upload times are pinned after 3 AM for each cohort so the three sweeps stay separate: Sat 9:00–11:48 PM; Sun 2:10 PM; Day 21 late morning.

---

### The work (optional interlude, cut-ready) · `#the-work`
**Purpose.** A breath between the job and the industry: the craft itself. Members show work and say how they made it.

**Scroll.** Mobile 70 svh · desktop 80 svh · no pin, normal flow.

**Timeline.**
- On entry (once): one showcase card rises 12 px on mobile; three rise on desktop with a 60 ms stagger. Text is visible from the first paint.
- At 25–75% of the section: the "HOW IT WAS MADE" note reveals with an opacity mask (CSS view-timeline where supported; the full text is always in the DOM).
- At 70–85%: the craft tags tick on.
- *Desktop exit:* the card fades as one star brightens in Ch8's sky.

**Copy**
- Eyebrow: Showcases · for members
- **H2:** Show the work. Say how you made it.
- Body: Post up to ten of your own photos or films as a showcase, with a note on how you made them and up to six craft tags. Other members can like it, keep it on a shelf, or tap Hire. Posting is in the Virgo phone app; members can view on the web too.
- Card mock (aria-hidden; a non-wedding piece by Mika):
  - Ten minutes before the rain
  - HOW IT WAS MADE: Backlit into the storm front so the rain read as light, not weather.
  - 35mm · Backlight · Natural light
  - Like · Keep · Hire
- Footnote: Showcases are seen by signed-in members only. Interface drawn from the app; the work shown is illustrative.

**Interactive.** None.

**Mobile.** One full-width card with a 4:5 Plate cover; the tags wrap.

**Reduced motion.** Static cards with the note and tags shown.

**Assets.** B7 (new seeds, never reused from Ch5–7), B10: ShowcaseCard.

**Truth notes.**
- Verified: showcases (≤ 10 items, a "How it was made" note, ≤ 6 tags, like, keep on a shelf, Hire), members only.
- Never "public", never "TikTok".
- The card is never tied to the Reyes & Santos album, because the retention sweep would delete it.

---

### Ch8 — Zoom Out · `#community`
**Purpose.** Widen from one crew to the whole industry, and reveal that the sky was the Philippines all along.

**Scroll.** Mobile 100 svh, sky is the pin, cover offset · desktop 140 svh, 40 svh held.

**Timeline**
| p | Beat |
|---|---|
| 0.00–0.40 | The camera pulls back **from Cebu City** to the whole archipelago (log zoom; the map levels in reverse). **The coastline appears under the stars at 14%**, from geoBoundaries data. The stars brightened in Ch7 are part of this field. *Mobile ends with the archipelago at 90% of the width, in portrait.* |
| 0.30–0.70 | Small seeded constellations (3–5 stars, thin canvas lines) light up in a scroll-driven wave from north to south, near real cities. Mobile shows 12: Vigan, Baguio, Quezon City, Naga, Legazpi, Iloilo City, Bacolod, Dumaguete, Tagbilaran, Tacloban, Cagayan de Oro and Davao City. Desktop adds Puerto Princesa, Zamboanga City, General Santos, Batangas City, Laoag and Butuan, for 18. All are among the 71 Nearby cities. Every cluster star passes a land test. *Mobile has no labels; desktop has a few mono labels.* |
| 0.40–1.00 | Role words drift in opposite directions, driven by scroll through one `useTransform`, so they stop when you stop. *Mobile: one row; desktop: two.* |
| 0.60–0.85 | The H2 and body arrive on a scrim (§1.5), placed near the bottom of the section so they read in the lower half of the screen. |
| 0.80–1.00 | A profile tag rises beside Bea's star: "Bea · HMUA · Cebu City", and under it the app's stats line, "3 connections · 1 job done". A horizon rises, the page lands on solid ground, and **the sky stops drawing**. |

**Copy**
- Eyebrow: 08 · Every Saturday
- **H2:** A creative industry is a people business.
- Body: Somewhere tonight there is a crew like this one in Davao City, in Iloilo City, in Baguio: someone shooting, someone cutting, someone on hair and make-up, someone keeping the timeline. Every job leaves a small constellation behind, and Virgo keeps it somewhere you can search it, message it and hire from it.
- Small: You pick your roles when you join, more than one if you do more than one. Members can publish a profile at virgo.ph/@yourname, visible to other members, with their roles, city and the jobs they've done through Virgo.
- Roles: a visually hidden `<ul>` of the nine roles; the marquee is aria-hidden.
- Footnote: These are not real crews. The profile tag is drawn from the app; the constellations and people are illustrative.

**Interactive.** None.

**Mobile.** The copy and tag sit in the lower half on scrims. Only the canvas, the map wrapper and the marquee move. The tag moves only after the zoom ends.

**Reduced motion.** A static archipelago image with the clusters baked in (B3b), the roles as a wrapped chip list, and the profile tag.

**Assets.** A3, A4 (cluster seeds), A5, B1, B3b, B5 (levels in reverse), B10: ProfileTag (`profileStatsLine`), RoleMarquee.

**Truth notes.**
- Verified: profiles at `/@handle`, visible to members (not public), and the jobs-done count.
- No member counts and no "live".
- The handle is `@yourname`, so it can't collide with a real member.

---

### Ch9 — Everything Around the Shoot · `#features` (aliases `#pillars`, `#showcase`)
**Purpose.** The scannable recap for people who skipped the story, plus the practical features that don't need a scene.

**Scroll.** Mobile about 250 svh (compact rows) · desktop 160 svh · no pin. Solid ground: `#161311` with grain, cards `#1E1B18`. `content-visibility: auto`, with measured intrinsic sizes.

**Timeline.**
- On entry: the H2 and lead. *Desktop:* tiles rise 8 px with a 60 ms stagger, ≤ 4 at once. *Mobile:* no entrance animation.
- Each story tile plays its **micro-animation from the story once** when 60% visible (900 ms), then rests on its final frame. *Mobile queues them one at a time.*
- *Desktop:* hover or focus replays. There are no replay buttons, so no extra tab stops. Pause stops any tile mid-play on its final frame.

**Copy**
- Eyebrow: 09 · What you get
- **H2:** Everything around the shoot
- Lead: Shooting is the part you love. Virgo handles what is wrapped around it: the crew, the calendar, the files, the client, and the tidying up afterwards.

Story tiles. Each H3 links to its chapter; the micro-animation it replays is in brackets.
1. **Find who's near** (→ `#nearby`) [ring 5 → 25 km]: Pick the roles and a distance from 5 km to 200, from where you are, a city or an upcoming shoot. Only how far away you are is ever shared.
2. **Post the job once** (→ `#hire`) [budget rows type in]: A budget for each role, up to ₱500,000. The post comes down after 30 days or once the job date passes.
3. **Hire, and it's written down** (→ `#connect`) [Waiting on them → Agreed]: Accept an applicant and get a chat and a booking: role, date, place, rate, what's included. They confirm; change anything and they confirm again. A record, not a contract.
4. **A calendar people answered** (→ `#calendar`) [Invited → Going, zero bars]: Invites wait for a yes. Move the time and everyone going hears who changed what. Reminders with the alarm on ring with no signal.
5. **One album, in the order it happened** (→ `#saturday`) [tiles sort]: Sorted by when each frame was taken, in sections your client sees as chapters. Originals kept as shot. Crew uploads count against your storage.
6. **Client links that just open** (→ `#delivery`) [heart → "1 picked"]: No account. Photos, films and recordings. Clients heart their favourites and download them or send them to you.
7. **Files that clear themselves out** (→ `#forget`) [tiles → outlines]: Choose a retention window when you make the album. Each file goes in the first nightly clean-up after its time is up, and you get a notice.
8. **Talk to the crew** [ticks fill]: One-to-one and group threads with read receipts, replies, @mentions and mute.

Practical tiles (H3 + line):

9. **On your desktop**: Virgo for Windows 10 and 11, and macOS 10.15 or later on Apple Silicon or Intel. It checks for updates and installs them when you click Update. [Download → `DOWNLOAD_PATH`]
10. **Uploads that keep going**: Three at a time on the web, with speed and time left, or drop a whole folder. On the phone, an upload cut off when the app closed is checked and sent again next time you open Virgo.
11. **Your account, your call**: Two-step sign-in with a six-digit code by email, plus ten recovery codes. Need a break? Pause for 7, 14, 30 or 90 days; it lifts on its own.
12. **Notifications on your terms**: Choose which kinds reach your phone, your inbox or your desktop.
13. **Archive a finished job**: Fold a finished workspace out of everyone's list, and bring it back whenever.

- Footnote: Interface details drawn from the app. Illustrative.

**Interactive.** The tile H3 links. On desktop, hover or focus replays a tile.

**Mobile.**
- **Story tiles become compact rows:** a 48 px micro-animation beside the H3, one short line, and a native `<details>` ("More") holding the full sentence. The short lines (≤ 80 characters, in A1):
  1. Roles and a distance, 5 to 200 km. Only how far away you are is shared.
  2. A budget for each role, up to ₱500,000.
  3. A chat and a booking with the agreed terms. A record, not a contract.
  4. Invites wait for a yes. Reminders ring with no signal.
  5. Sorted by when each frame was taken, in your client's chapters.
  6. No account. Clients heart favourites and send them to you.
  7. Each file goes after its retention window, and you get a notice.
  8. Group threads with read receipts, replies and @mentions.
- **Practical tiles** are a compact 2-column list of H3 + one line, each opening a `<details>`.
- **Desktop** shows every full sentence; nothing is collapsed there.

**Reduced motion.** Every tile shows its final frame. Nothing replays.

**Assets.** B10 mini variants (the chapter mocks at tile scale), B12.

**Truth notes.** Not claimed:
- "update themselves", "resumable" or "signed installer";
- that archive or pause keeps files from the retention sweep;
- that email covers every notification kind.

---

### Ch10 — Pricing · `#pricing`
**Purpose.** Say it straight: free for now, and where the prices are heading.

**Scroll.** Mobile 100 svh · desktop 90 svh · no pin, no scroll-linked motion.

**Timeline.**
- On entry, once: the Free card's star ignites in 300 ms above a thin horizon line.
- The paid tiers' stars sit **below the horizon** at 25–30%, and their borders at 40%. Only decoration dims; **text keeps full AA**: titles `#F2EDE8`, meta `#9C8B81` (≥ 5.2:1).
- *Desktop:* hovering or focusing a paid tier lifts its star 4 px.

**Copy**
- Eyebrow: 10 · Pricing
- **H2:** Free for now.
- Lead: No card, no trial clock. We would rather find out what a working photographer actually needs than guess at a price and be wrong about it.
- Free card, from `GET /plans` on the server:
  - **H3** Free · "Available now"
  - 15 GB cloud storage · 3 workspaces · 10 albums per workspace · Client share links (15 GB listed once)
  - [Start free] → `SIGN_UP_URL`
- Upcoming: Where pricing is heading once paid plans arrive. Nothing here is charged yet. If a number looks wrong, [tell us].
- Soon rows (an H3 each, from `/plans`):
  - Freelancer · ₱399/mo · 100 GB · Soon
  - Studio · ₱999/mo · 500 GB · Soon
  - Business · ₱2,499/mo · 2 TB · Soon
- "See plans in the app" (→ `SIGN_UP_URL`) appears only if `/plans` succeeds but returns no free plan.

**Interactive.** Start free, and "tell us" (mailto to the single contact address).

**Mobile.** The Free card first, full width, with a 48 px button. The Soon tiers become a compact 3-row list with no buttons.

**Reduced motion.** Static: the Free star lit, the others dim.

**Assets.** B11, B12.

**Truth notes.**
- No PayMongo, no monthly/yearly toggle, no "pre-release".
- **Caching:**
  - At build, the plans come from a launch-truth constant.
  - At runtime, a failed `/plans` throws, so ISR keeps serving the last good page instead of caching a fallback for an hour.
  - In `next dev` without the API, the constant is used.

---

### Finale — "This one's you." · `#start`
**Purpose.** Close the loop: an empty patch of sky, and a new star.

**Scroll.** Mobile 90 svh · desktop 100 svh · no pin. The sky resumes for this section only. The CTAs are in the DOM and visible from the start.

**Timeline.**
- On entry (40% visible), once:
  - The camera pans 800 ms to the Virgo figure drawn faint (20%), with its one unlit socket at **Syrma (ι Vir)**.
  - A new star grows there: scale 0.4 → 1, two slow pulses within ≤ 3 s, then still (Pause stops it).
  - The ζ–ι and ι–μ edges draw in, completing the 14-star figure.
- The desktop mini figure lights its last point, and the H2's full-stop star echoes it.

**Copy**
- **H2:** This one's you. (The full stop is a star.)
- Body: Free to start, 15 GB included, and nothing for your clients to install. Add your roles, see who is working near you, and take it from there.
- CTAs: **Join the community** → `SIGN_UP_URL` · **Sign in** → `SIGN_IN_URL`
- Micro: Runs in any browser, on Windows and macOS, and on Android from the download page (→ `DOWNLOAD_PATH`).

**Interactive.**
- Join the community and Sign in (48 px), plus the download link.
- *Optional, cut-ready:* a role picker after the CTAs.
  - A fieldset "What do you do?" holding nine `aria-pressed` toggle buttons. Keyboard operable; works under reduced motion.
  - Each chosen role adds a ray to the star, and an `aria-live="polite"` label updates ("you · Photographer, HMUA").
  - Nothing is sent, and the sign-up URL never changes.
- Nothing in the sky is focusable.

**Mobile.**
- The star at 35 svh, above the H2. The H2 at 16 vw on two lines.
- CTAs stacked, 48 px, with safe-area padding.
- Role chips in a 3-column grid of 44 px targets.

**Reduced motion.** The full 14-star figure drawn lit and steady. Rays toggle instantly.

**Assets.** A2, B1, B6 (static figure for reduced motion), B11.

---

### FAQ · `#faq`
**Purpose.** Answer the questions: your FAQ content, corrected where the code says otherwise, plus three new ones. One array feeds both the list and the FAQPage JSON-LD.

**Scroll.** About 110 svh on mobile with every item closed, about 100 on desktop · no pin. A solid surface, so the canvas pauses. `content-visibility: auto`.

**Interactive.**
- Native `<details>/<summary>`, so it works without JS, each with a ≥ 48 px hit area.
- Each summary holds an H3. This is to be tested with VoiceOver (iOS and macOS) and TalkBack. If a pairing flattens the heading, the questions stay reachable as buttons under the H2.
- The "+" (a text glyph) rotates 45° in 160 ms, not under reduced motion. Height is never animated.

**Mobile.** Full-width rows. **Reduced motion:** identical, without the rotation. **Assets:** none.

**Copy**
- Eyebrow: FAQ · **H2:** Questions people ask · Lead: The short answers. If yours is not here, [email us].

1. **Is Virgo free?** Yes. Virgo is free for everyone for now: 15 GB of storage and three workspaces of up to ten albums each, with no card required. Paid tiers arrive later; nothing is charged today.
2. **Do my clients need an account to see their photos?** No. You send a client link that opens in any browser. They can view and download without signing up for anything.
3. **What happens to delivered files?** You choose when you make an album. Set how long to keep its files and each one is deleted that long after it was uploaded, along with its preview copies, and you get a notice saying how many went. The album and its link stay, so tell your client the date. Leave it unset and files stay until you delete them.
4. **Who can see my work?** Nobody, unless you share it. Albums are private to you until you give a collaborator access or send a client link. Showcases you post are seen only by signed-in members. Your location is only used for discovery if you turn it on.
5. **How do I find other creatives to work with?** Nearby shows photographers, videographers, editors, HMUAs and coordinators around you who have opted into discovery. You can also post a job to the board, with a budget for each role, and take applications.
6. **Can I use a city instead of GPS?** *(new)* Yes. Name your city and you're findable in Nearby from its centre. Other people only ever see how far away you are, in whole kilometres, and turning sharing off erases it.
7. **Is it safe?** *(new)* In the Virgo phone app you can block or report someone from their profile, a chat, Nearby, a request, an enquiry, an application or a job post. Blocking declines anything pending between you, hides you from each other in search, Nearby and the job board, and freezes your direct chat with its history kept. Reports go to the Virgo team. Client links use a long random address and tell search engines not to index them.
8. **Is Virgo only for the Philippines?** It is built for Filipino creatives first, and pricing will be in pesos when paid plans arrive, but nothing stops you using it elsewhere. *(Today's answer says "payments go through PayMongo" in the present tense; nothing can be bought.)*
9. **Does Virgo take payment for jobs?** *(new; needs your OK)* No. When you hire through the job board, Virgo writes down the role, date, place, rate and what's included, and the person you hired confirms it. The money goes between the two of you, the way it does now.

---

### Footer
- **Scroll.** About 30 svh on mobile, 25 on desktop · no pin.
- **Content.**
  - The logo (next/image, 22 px) + "Virgo", linking to `#top` with aria-label "Virgo home".
  - Links: Terms (`/terms`) · Privacy (`/privacy`) · Download (`DOWNLOAD_PATH`, new) · Sign in (`SIGN_IN_URL`) · **one** contact address (mailto).
  - © {year} Virgo · Built in the Philippines, for Filipino creatives.
  - The honesty line (§1.10).
  - Credits (small): Philippine boundaries: NAMRIA and PSA, via OCHA (HDX) and geoBoundaries (Runfola et al. 2020), CC BY 3.0 IGO, simplified. Star positions: SIMBAD / Hipparcos.
- **Mobile.** Two rows of wrapped links, 44 px targets. **Reduced motion:** identical. **Assets:** B13.

---

## 3. Page outline, metadata and SEO

```
<header> nav · Chapters disclosure · Pause motion
<main>
  H1  Where creatives find each other, and get paid.
  H2  Saturday's wedding is booked. The crew isn't.          #hire
      H3 Or post the job once.
  H2  Then see who is working near the shoot.                #nearby
      H3 The only thing anyone learns is how far away you are.
  H2  Nobody lands in your network without agreeing to it.   #connect
      H3 Virgo writes down the rate. The money is between you.
  H2  The call time moved. Everyone heard.                   #calendar
      H3 5:00 AM. No signal. It rings anyway.
  H2  Everyone shot it. One album holds it, in order.        #saturday
      H3 Split it the way the day went. · Kept as shot. · One meter.
  H2  One link. No account. Nothing to explain over the phone.  #delivery
      H3 They pick. You get told. · Same link when the films are ready.
  H2  Hand it over. Then forget about it.                    #forget
  H2  Show the work. Say how you made it.                    #the-work (optional)
  H2  A creative industry is a people business.              #community
  H2  Everything around the shoot                            #features   (13 × H3)
  H2  Free for now.                                          #pricing    (H3 per plan)
  H2  This one's you.                                        #start
  H2  Questions people ask                                   #faq        (H3 per question)
<footer>
```
- **Copy order.** In every chapter the DOM order is eyebrow → H2 → lead/body. Visual order matches.
- **Kept unchanged:** title, description, canonical, robots, the OG and Twitter text, `og:type` and `twitter:card summary_large_image`.
- **OG image and video.**
  - Delete `(marketing)/opengraph-image.tsx`. Next collects every `opengraph-image.*` in a segment, so leaving it would emit a second, old card.
  - Add `opengraph-image.jpg` (Remotion OgVideo frame 0, 1200×630, ≤ 200 KB) and `opengraph-image.alt.txt` with today's alt text verbatim.
  - Add `openGraph.videos` to the marketing layout metadata: the hashed MP4, `video/mp4`, 1200×630. MP4 only; the WebM stays out of the tags.
  - iMessage plays it; everything else shows the image.
  - Verify there is exactly one og:image, plus og:image:alt and og:video, in the Facebook Sharing Debugger and in iMessage.
- **JSON-LD.** Organization, SoftwareApplication and FAQPage (from the single FAQ array). SoftwareApplication's `operatingSystem` becomes `"Web, iOS, Android, Windows, macOS"`; iOS stays pending your answer to §6 Q10.
- **Sitemap.** Add `/download`.
- **Caching.** The landing page moves from `force-dynamic` to ISR (`revalidate = 3600`), with the `/plans` behaviour in Ch10.

---

## 4. Asset list

Every asset is made by me from code, data or Remotion. None is a screenshot or stock image, and none shows a person or client work. Phase 3 documents each one in `docs/redesign/03-assets.md`: its source, licence, script, sizes and how to regenerate it.

### A — Data modules
These are "zero-import" TypeScript: no `@/` aliases, React, Motion, Tailwind or npm packages. Relative imports between A modules are allowed. The same modules feed web and Remotion.

| ID | Asset | Made by | Lives in |
|---|---|---|---|
| A1 | `story.ts`: cast; one fixed `now` per chapter; the story calendar; the Nearby roster (Appendix A); copies of the app's private values (§1.10); every mock string, the brief included; the storage inputs (baseline 0.3 GB; cohorts 6.0 / 0.4 / 2.5 GB), with each meter reading computed from them; reel captions | Hand-written; checked by the string and number tests | `web/src/components/story/data/story.ts` |
| A2 | `constellation.ts`: 14 stars (J2000 RA/Dec, V mag), gnomonic x/y, 14 IAU / Sky & Telescope segments, cast ↔ star map, Syrma flagged as held back | `build-constellation.mjs` from committed SIMBAD/Hipparcos constants (no network at build) | `web/src/components/story/data/constellation.ts` |
| A3 | `ph-map.generated.ts`: four detail levels (§1.3) as projected paths, plus `KM_PER_UNIT` | `build-ph-map.mjs`: geoBoundaries PHL ADM0 at a pinned commit with a sha256 check, then mapshaper, then TM projection. Kalayaan cropped (§6). | `web/src/components/story/data/` (dynamic-imported, client-only) |
| A4 | `sky-seed.ts`: mulberry32, star placement (imports A5 and the projection constant), lite counts, Ch8 cluster seeds | Code. A test asserts identical output (count plus a hash of positions) whether called from web or from Remotion, so the poster and frame 0 of the canvas match by construction. A land test checks every cluster star against the A3 overview. | `web/src/components/story/sky/sky-seed.ts` |
| A5 | `cities.generated.ts`: the 71 Nearby cities in map coordinates, with the Davao City display fix and `KM_PER_UNIT` | `build-cities.mjs`, which reads `api/src/hiring/locations.ts` as text (it isn't exported, and api/ isn't edited) | `web/src/components/story/data/cities.generated.ts` |

### B — Code-drawn visuals
| ID | Asset | Made by | Lives in |
|---|---|---|---|
| B1 | **SkyStage**: fixed canvas, camera, sprites, twinkle, radar rings, threads, constellation edges, cluster lines, gold threads, particles, time-of-day layers, pausing, auto-degrade | Canvas 2D + React | `web/src/components/story/sky/` |
| B2 | Star sprites: 3 sizes × 2 tints, plus a glow | Drawn once at runtime on an OffscreenCanvas; no files | `sky/sprites.ts` |
| B3 | **Sky posters**: mobile 720×1560 and desktop 1920×1080, with the archipelago outline baked in | A Remotion still of a `SkyPoster` composition (same seed), then sharp → AVIF + WebP. ≤ 25 KB mobile, ≤ 45 KB desktop. | `web/public/redesign/sky/poster-{m,d}.<hash>.{avif,webp}` |
| B3b | Static archipelago with the baked Ch8 clusters (reduced motion) | Remotion still → AVIF/WebP | `web/public/redesign/sky/clusters.<hash>.{avif,webp}` |
| B3c | Static Cebu "lens" (Prologue, reduced motion) | Remotion still → AVIF/WebP | `web/public/redesign/sky/cebu-lens.<hash>.{avif,webp}` |
| B4 | Grain tile, 160×160 | Seeded noise script → PNG, ≈ 6 KB | `web/public/redesign/grain.<hash>.png` |
| B5 | Map layers, rendered: four levels as static SVG `<img>`s in camera-driven wrappers | From A3 | `story/sky/map-layer.tsx` + `web/public/redesign/map/*.<hash>.svg` |
| B6 | Static SVGs for reduced motion and the demos: the radar (one path per ring set), the constellation chart (one path for the figure, Syrma hollow), the LinkStreak | SVG components from A2 | `story/svg/` |
| B7 | **Plates** (abstract "photo" tiles) plus a light variant with baked grain; FilmTile = 3 Plates crossfaded by opacity + a progress bar (no video file) | Today's `plate.tsx`, extended; seeded gradients, no people | `story/mocks/plate.tsx` |
| B8 | Initials avatars: tinted, never solid, drawn as each surface draws them (see the table below) | Browser frames reuse `components/ui/avatar` / `PersonAvatar`; phone frames use a plain span | `story/mocks/avatar.tsx` |
| B9 | Device frames: phone (no bezel on mobile), browser, desktop window, generic OS lock screen | Code | `story/frames/` |
| B10 | **App UI mocks**: presentational components matching the app's own styling (specs gathered in this phase), reusing `components/ui` Button, Badge and Card and the pure helpers in §1.10. Full list below. | Code | `web/src/components/story/mocks/` |
| B11 | Star full-stop glyph and the mini-constellation progress figure | Inline SVG | `story/svg/` |
| B12 | Icons | lucide-react (already installed) | — |
| B13 | Logo | The existing `logo.png` via next/image. The painterly mark isn't redrawn, because a code tracing would degrade the brand. | `web/public/logo.png` |

**B10 mocks:**
- Ch1: ChatCardStack, JobPostForm
- Ch2: NearbyPhone, NearbyPanel, LocationCard
- Ch3: ApplicantRow, HiredTermsCard, BookingBadge, GroupThread / Bubble
- Ch4: MonthGrid, EventDetail / Attendees, ReminderSheet, EmailSubjectChip
- Ch5: DeviceChip, AlbumHeader / SectionChips / DayHeading / Grid, FilmTile, ActivityFeed, StorageMeter (bar + ring), Viewfinder
- Ch6: ShareDialog, ShareSheet / LinkReadyAlert, ClientGalleryPage (+ Empty)
- Ch7: RetentionField, DayRuler, AlbumCard
- Later chapters: ShowcaseCard, ProfileTag, RoleMarquee
- Shared: NotificationRow

**B8 avatar rules, by surface:**
| Surface | Fill | Letters |
|---|---|---|
| Phone Nearby, mention picker | `#B66A40` at 9% | 1 letter, `#D18A5A` (§1.5) |
| Phone chat list | primary at 9% | 1 letter |
| Phone attendees | `#B66A40` at 13% | first 2 letters |
| Web Nearby, chat | `primary/15` | first 2 letters |
| Web applicants | muted | first 2 letters |
| Workspace faces | — | first + last initial |

### C — Video (Remotion, in `marketing-assets/`)
| ID | Asset | Spec | Lives in |
|---|---|---|---|
| C1 | **HeroLoop-Wide**: a seamless atmospheric loop (haze, dust, far stars) behind the Prologue | 1280×720 @ 24 fps, 12 s. Every motion is an integer harmonic of the loop, so frame 288 = frame 0, with one GOP per loop. **WebM VP9 ≤ 450 KB, MP4 H.264 ≤ 750 KB**, poster AVIF/WebP/JPG. No grain baked in (the site's grain layer dithers it). | `web/public/redesign/hero/hero-wide.<hash>.*` |
| C2 | **OgVideo**: animated Open Graph card; frame 0 is the new `og:image` | 1200×630 @ 24 fps, 10 s, seamless. MP4 ≤ 1 MB (the `og:video`), WebM ≈ 300 KB. Layout in §4.1. | `(marketing)/opengraph-image.jpg` + `web/public/redesign/og/virgo-og.<hash>.{mp4,webm}` |
| C3 | **Social reel**: the story in 28 s, vertical, sound-off, captions burned in (headline ≥ 84 px, support ≥ 44 px at 1080 wide) | 1080×1920 @ 30 fps, 840 frames, 9 scenes (§4.1). Upload master H.264 CRF 16. Optimised MP4 ≤ 8 MB + WebM + poster. | `marketing-assets/out/reel/` only (gitignored), shared outside git. It is copied into `web/public` only if the page ever embeds it. |
| C4 | SkyPoster, clusters and lens stills | Remotion `still` | → B3, B3b, B3c |

**C1 runtime rules.**
- Desktop ≥ 1024 px only, 4G, no Save-Data, the motion gate passing, not paused.
- Attached after load and idle, with `preload="none"`. It is muted in JS before `play()`, and has `playsinline loop aria-hidden tabindex="-1"`.
- The poster shows first.
- It pauses offscreen (IntersectionObserver) and on `visibilitychange`.
- Pause motion stops it and swaps back to the poster.
- It is the first thing cut if LCP or INP misses.

**The `marketing-assets/` package.**
- A new sibling package with its own `package.json` and lockfile. It's renamed from the audit's `video/` because it also holds the map, constellation, cities, grain, poster and publish scripts.
- Every Remotion package is pinned to one exact version. Geist comes via `@remotion/google-fonts`.
- It imports A1–A5 by relative path, so the videos and the page tell the same numbers.
- The string test and banned-words lint cover the reel's captions.
- Encodes use Remotion's bundled ffmpeg, because ffmpeg isn't on this machine's PATH. AVIF goes through sharp, because Remotion stills only output PNG, JPEG or WebP.
- `scripts/publish.mjs` writes content-hashed filenames into `web/public/redesign/` and generates `web/src/components/story/media.generated.ts` (url, width, height, bytes, type, codecs). The page and the `og:video` metadata import that manifest and never hard-code paths.

### 4.1 Reel and OG storyboards
**C3: the reel, 840 frames at 30 fps (28.0 s).**

Captions are either the page's own lines (**[page]**) or **[proposed, for your OK]**. Scenes have no overlapping transitions, so the frame maths is exact.

| Scene | Frames | Visual | On-screen text | Mirrors |
|---|---|---|---|---|
| S1 | 0–75 | Night sky over the Philippines; the push into Cebu; Mika's star | "Wednesday, 11:42 PM." [page] | Prologue |
| S2 | 75–165 | A phone; unbranded chat cards stack faster (no jitter); "Seen by 14" | "Saturday's wedding is booked. The crew isn't." [page] | Ch1 |
| S3 | 165–255 | The Post a job form fills: three roles and budgets; Post it | "Or post the job once." [page] | Ch1 |
| S4 | 255–345 | Radar 5 → 25 km; whole-km rows; a non-cast star blinks out | "The only thing anyone learns is how far away you are." [page] | Ch2 |
| S5 | 345–450 | Threads arrive at Mika; Accept; 13 stars form, with Syrma dark | "Nobody lands in your network without agreeing to it." [page] | Ch3 |
| S6 | 450–525 | Zero bars, 5:00, the reminder rings | "5:00 AM. No signal. It rings anyway." [page] | Ch4 |
| S7 | 525–630 | Golden hour; "Saturday."; the threads fill one album; "412 photos · 1 film" | "Everyone shot it. One album holds it, in order." [page] | Ch5 |
| S8 | 630–720 | The link flies to the couple's phone; the client page; hearts; "Send again" | "One link. No account." [proposed] | Ch6 |
| S9 | 720–840 | Day 91: the tiles dissolve into stars (30 frames). End card for 90 frames (≥ 3 s): Syrma lights; logo; "Every shoot is a constellation." [proposed]; "virgo.ph · Free to start, 15 GB" [proposed] | | Ch7 + Finale |

- Every UI string comes from A1, so the string test covers the reel.
- The post caption won't list retention options.
- The reel ends on night sky with a star, and S1 opens on night sky, so a platform's auto-replay reads as the story starting again.

**C2: the OG card, 1200×630.**
- **Left:** the logo (64 px) and "Virgo"; the headline "Where creatives find each other, and get paid." (pending §6 Q1), with "virgo.ph" small. Text stays inside the centre-safe area.
- **Right:** the full 14-star Virgo figure, at rest.
- **Motion:**
  - one pulse travels the figure's edges from Spica, plus a soft twinkle;
  - every motion starts and returns to baseline inside frames 36–150;
  - frame 0 = frame 240 = the static `og:image`.
- No UI, no people, no claims beyond the headline.

---

## 5. Build prerequisites (separate small PRs, before the story)
1. **Branch from `origin/main`** (ce24c4f). Your local `main` is 100 commits behind.
2. **Commit `framer-motion` 13.5.0 to `web/`.** It's your uncommitted change. The same addition is now in `dashboard/` too; I'll leave that alone unless you say so.
3. **Landing page `force-dynamic` → ISR,** with `fetchPlans` in its own module and the build/runtime behaviour in Ch10. Tests get a small runner (vitest), shared with the string and number tests.
4. **Cache headers and the desktop build** (no app screen changes):
   - `web/next.config.ts` gets `/redesign/:path*` → `Cache-Control: public, max-age=31536000, immutable`. All files there have hashed names.
   - `desktop/scripts/stage-web.mjs` skips `public/redesign` when copying `web/public`, so the marketing media doesn't ship inside the Windows and macOS apps.
5. **⚠ Marketing gets its own root layout (needs your OK).**
   - **Why:** today the root layout loads the app's Providers on the landing page: PostHog, React Query, realtime and auth, about 148 KB gzip, half the page's JS.
   - **What it touches:** moving them into the app's own layout means moving app shell files (`layout.tsx`, `error.tsx`, `global-error.tsx`, `not-found`). It changes no app screen, and navigation between the two hosts is already a full page load.
   - **Without it:** LCP still passes (it's server-rendered text), but the INP and 60 fps targets on a mid-range Android are at risk.
   - **Also in this PR:** `components/visit-beacon.tsx` imports `API_BASE_URL` from `@/api/config` instead of the `@/api` barrel, so the marketing layout can't pull in the API client through it. There is no behaviour change.
6. *Optional, needs your OK:* move the app's private constants into shared `lib/` modules (§1.10).

---

## 6. Open questions for you
1. **"…and get paid."** Keep the H1, with Ch3's "The money is between you" and the new FAQ 9? *Default: keep.*
2. **Cast names.** Today's mocks use real creatives' names (Ernie Saavedra, Kenn Francis). Do "Ernie" and "Kenn" stay, with their consent, or should every name be invented? *Default: first names only, pending your answer.*
3. **Paid prices on the site.** Keep the dimmed "Soon" rows, as you asked, knowing the phone builds hide prices? *Default: keep.*
4. **One contact address.** support@ (already on the legal pages) or hello@? *Default: support@.*
5. **Remotion licence.** Free for individuals and companies of up to 3 people; otherwise a Company Licence. Please confirm before I render.
6. **The root-layout split** (§5.5). OK to touch the app shell files? **This one gates the build:** it decides whether the JS budget is 165 KB or about 300 KB (§1.12).
7. **Kalayaan Island Group.** Crop it (proposed), or show it as an inset?
8. **Optional pieces.** "The work", the two in-flow demos, the Finale role picker. *Default: build them all as cut-ready, and judge in QA.*
9. **Reel captions** marked [proposed] in §4.1. OK as written?
10. **iOS.** Is the App Store listing public? If it is, the JSON-LD keeps iOS (and a store link could be considered); if not, iOS comes out of the JSON-LD.
11. **Product gaps** the page now works around (yours to fix or accept):
    - clients get no warning before clean-up;
    - archiving a workspace and pausing an account don't pause retention, and the app's pause copy says "Nothing is deleted";
    - showcases built from album files lose them at clean-up;
    - `virgo.ph/jobs` is a 404;
    - the Davao City coordinate is about 22 km inland;
    - the web and phone retention options differ.

---

## Appendix A — Illustrative Nearby roster (defined in A1; every count is derived from it)
| Name | km | Roles |
|---|---|---|
| Ernie | 2 | Photographer, Videographer |
| Kenn | 2 | Video Editor, SDE Editor Video |
| *a coordinator* | 3 | Coordinator (erased in the privacy beat) |
| Paolo | 4 | Photographer |
| Rhea | 4 | HMUA |
| Bea | 8 | HMUA |
| Joy | 9 | Videographer, Photo Editor |
| Carlo | 12 | Videographer |
| Dana | 15 | Video Editor, SDE Editor Video |
| Migs | 18 | Photographer, Videographer |
| Jessa | 21 | HMUA |
| Lito | 24 | Videographer, Host |
| *(A1 adds more people out to 200 km for the demo)* | | |

At 25 km, after the erase, there are 11 people:

| Role | Count | Role | Count | Role | Count |
|---|---|---|---|---|---|
| Photographer | 3 | Videographer | 5 | Photo Editor | 1 |
| Video Editor | 2 | SDE Editor Photo | 0 | SDE Editor Video | 2 |
| Coordinator | 0 | Host | 1 | HMUA | 3 |

With the selected roles (Videographer, SDE Editor Video, HMUA), the panel lists 10 rows. Mika never appears, because Nearby excludes the viewer. All names are invented, first names only.

## Appendix B — Chapter labels (Chapters menu, mobile progress, mini-figure index)
| # | Label | Anchor | Star (desktop mini figure) |
|---|---|---|---|
| — | The sky | `#top` | — |
| 1 | Wednesday night | `#hire` | η Zaniah |
| 2 | Nearby | `#nearby` | β Zavijava |
| 3 | Connect | `#connect` | γ Porrima |
| 4 | The calendar | `#calendar` | δ Minelauva |
| 5 | Saturday | `#saturday` | α Spica |
| 6 | The handover | `#delivery` | ε Vindemiatrix |
| 7 | Forget | `#forget` | θ |
| — | The work | `#the-work` | — |
| 8 | Every Saturday | `#community` | ζ Heze |
| 9 | Everything around the shoot | `#features` | τ |
| 10 | Pricing | `#pricing` | 109 Vir |
| — | This one's you | `#start` | ι **Syrma** |
| — | FAQ | `#faq` | — |
