# Story components

The virgo.ph story site: one wedding crew, told through the app's own screens
in a 3D night sky. The spec is `docs/redesign/02-storyboard.md`. Read §1.13
(the depth system) and §1.10 (the honesty system) before building a stage.

```
story/
  data/             zero-import data: story.ts (A1) and strings/<area>.ts
  frames/           device frames and the depth primitives (B9, §1.13)
  mocks/            app UI mocks (B10) and the shared avatar, plate and notification row
  sky/  svg/        the canvas sky and the static SVGs (other areas)
```

Visual QA lives at `/story-lab` in development. Every area has its own page.

## The mock contract (Phase 4 reads this)

A mock is a picture of an app screen, rendered once on the server. Phase 4
client islands attach to that markup and move it. They never re-render it.

1. **Pure and server-only.** No hooks (except `useId`), no `'use client'`, no
   data fetching. Never import a `'use client'` module. Never import
   `components/ui/*` either: those files pull in Radix and `cn`, and
   `avatar.tsx` is a client module. Re-draw what you need with the classes
   they use. Never import `@/api` at runtime; `import type` is fine. The only app modules a mock may import
   are `lib/calendar.ts`, `lib/media-days.ts`, `lib/workspaces.ts`,
   `lib/notification-categories.ts`, and `@/api/profile-view` by direct path.
   They are pure.
2. **`state` names a key frame.** Each mock takes
   `state?: 'empty' | 'filling' | 'posted' | …`, a union of the beats its
   chapter needs. It renders that state completely, with no JS. The default is
   the final or resting state, which is what crawlers, no-JS readers and
   reduced-motion readers see.
3. **`data-part` marks what moves.** Any element a stage animates gets a
   `data-part="kebab-name"`, unique within the mock. A stage finds parts with
   `figure.querySelector('[data-part=…]')` and writes `transform` and `opacity`
   through refs. Use `data-state` / `data-on` attributes for discrete flips
   that CSS styles. Never change text or layout per frame. Counters are the
   exception: write them into reserved-width `tabular-nums` spans.
4. **Decorative and inert.** Mocks are `aria-hidden` with no interactive
   elements: no `<button>`, `<a>` or `<input>`, only plain elements styled to
   look like controls. The chapter wraps each one in a `<figure>`. The
   figcaption narrates it, and a visible footnote says what is drawn from the
   app, names any generic chrome, and ends with "illustrative".
5. **Platform fills.** Match the app exactly (see
   `research-app-ui.json` in the Phase 2 scratchpad). Use explicit hex values,
   not theme tokens, so a mock never depends on the page's theme class.

   | Frame | Font | Buttons / selected chips | Text accents | Surfaces | Radii |
   |---|---|---|---|---|---|
   | Phone (`PhoneFrame`) | system (`PHONE_FONT`, inherited) | `#A85D35`, white text | `#D18A5A` | bg `#161311`, card `#1E1B18`, hairline `#2A2522` | 12 / 14 / 16 / 21 / 24, pills |
   | Browser, desktop | Geist (`font-sans`) | Badge, selected chip, own bubble, progress: `#D18A5A` on `#161311`. `Button`: `#A85D35`, white | `#D18A5A` | bg `#161311`, card `#1E1B18`, border `#362F2B`, muted `#2A2522` | Button 12, Card/Dialog 16.8, bubble 21.6, Badge pill |
   | Client page | system-ui, serif H1 | its own palette | | paper `#FBF7F2` | |

   Avatars are never solid: use `mocks/avatar.tsx`. Photographs are never
   people: use `mocks/plate.tsx`.
6. **Tailwind as plain strings.** Use class strings or template literals. No
   `cn`, no tailwind-merge, no Radix. Text is never under 11 px. Copy comes
   from your strings file and is never typed inline (see Checks).
7. **Flat faces, deep frames.** A mock draws a flat screen. Depth comes from the
   frames: `Slab` gives an object thickness, a sheen and a contact shadow, and
   `Perspective` gives a scene one eye. A mock never sets `perspective` or
   `preserve-3d` of its own. The one exception is a scene whose pieces are the
   direct children of a `Perspective`, such as Ch1's notification fan. There,
   each piece may carry a **rest-pose** `translate3d`/`rotate` (static, so
   server-rendered and reduced-motion frames keep the depth). Scroll motion
   still only writes `transform` and `opacity` from outside.

## Depth and motion (§1.13, §1.7)

- **Turn a slab** by writing `transform` on its `[data-part=slab-body]` only,
  for example `rotateX(4deg) rotateY(-12deg) translateZ(20px)`, through one
  single-level `useTransform` per element. Stay within `MAX_TILT`: 18° on
  desktop and 10° on phones.
- **Sheen.** As it turns, crossfade `[data-part=slab-sheen-a]` and
  `[data-part=slab-sheen-b]` by opacity. `sheenOpacity(rotateY)` gives the
  rest values; the same maths works per frame.
- **Lift.** As it lifts, scale and fade `[data-part=slab-shadow]`.
  `shadowPose(translateZ)` gives the rest values.
- **Scenes.** CSS `perspective` reaches only direct children. A lone `Slab`
  carries its own, from the same tokens (900 px, or 1200 px from `md`). A
  scene whose pieces share one eye, such as cards fanned back on z or the
  calendar lying back like a desk, puts those pieces directly inside
  `Perspective`.
- **Only transform and opacity animate.** No `filter`, blur, blend mode,
  dash, gradient or layout property is ever animated. `preserve-3d` is one
  level deep (the slab body) and never sits on a text block. Copy lands at 0°,
  facing the reader, before it is read.
- **Reduced motion and no-JS** get the rest pose: the tilt, the thickness and
  the shadow, with nothing moving.
- **Clipping.** Shadows and turned edges spill a little outside a slab's box,
  so wrappers use `overflow-x: clip`, never `hidden`.

## Frames (`frames/`)

| Export | What it is | Parts |
|---|---|---|
| `Perspective` | A stage's shared eye. `PERSPECTIVE`, `MAX_TILT` | perspective |
| `Slab` | Thickness (a back plate one `depth` behind), two sheen layers, a `floor` or `drop` shadow made from radial gradients. Size it with `className`; the child fills it | slab, slab-shadow, slab-body, slab-edge, slab-face, slab-sheen-a/b |
| `PhoneFrame` | OS-neutral phone: time, signal 0–4 (0 prints "No service"), wifi, battery, camera dot, home indicator. No bezel below `md`. `tone` sets the status-bar ink. Use `PHONE_RADIUS` on its slab | phone, screen, status-bar, status-time, signal, signal-bar, no-service, battery, phone-content, home-indicator |
| `BrowserFrame` | Window dots, address bar (`url`), web dark | browser, browser-bar, url-bar, url, viewport |
| `DesktopWindow` | Virgo's Tauri chrome: Windows caption buttons or macOS lights, plus the app shell sidebar (`active`, `badges`) from `md` | desktop-window, title-bar, sidebar, nav-item, nav-badge, window-content |
| `LockScreen`, `LockNotification` | A generic lock screen. Pass `LOCK_WALLPAPER` as the phone's `screen`. `lockDate()` and `lockTime()` format a story instant | lock-screen, lock-date, lock-time, lock-notifications, lock-notification |
| `VirgoMark`, `AppIconTile` | The real `logo.png` | mark, app-icon |

```tsx
<Slab className="w-[min(100%,320px)]" rotateY={-12} rotateX={4} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
  <PhoneFrame width="100%" time="5:00" signal={0} screen={LOCK_WALLPAPER}>
    <LockScreen time={lockTime(WHEN.reminder)} date={lockDate(WHEN.reminder)}>
      <LockNotification title={…} body={…} />
    </LockScreen>
  </PhoneFrame>
</Slab>
```

## Shared mocks (`mocks/`)

- **`Avatar`** takes `surface`: `phone-nearby`, `phone-chat`, `phone-attendee`,
  `web`, `web-muted` or `workspace`. Each draws the tint, letters and default
  size that the app uses on that surface (B8). Give `ring` a colour for
  overlapping stacks.
- **`Plate`** takes `seed`, `aspect` (`1:1`, `4:5`, `3:2`, `16:9` or `fill`) and
  `variant`. Use `lite` (the default: one element, baked grain, no blend) for
  grids and anything that moves. Use `full` (the landing page's plate) for a
  few large stills. `litePlateStyle(seed)` paints one onto any element.
- **`NotificationRow`** takes `platform` (`web` or `phone`), `topic`, `title`,
  `body`, `time`, and `state` (`unread` or `read`). It goes inside
  `NotificationList`, which draws the day heading and the card. The icon and
  tint come from the topic, through the app's own tables.
  `strings/common.ts › NOTICES` holds real notifications filled with story
  values.

## Data and checks

- **Data modules** (`data/**`, `sky/sky-seed.ts`) are zero-import: relative
  imports of other data modules only (extensionless is fine), type
  annotations only, with no enums, React, `@/` aliases or packages. Remotion
  and the check script load them under plain Node.
- **Each area owns `data/strings/<area>.ts`.** Export every string, plus
  `SOURCES` that proves each app string against the app file it came from:

  ```ts
  export const SOURCES = [
    { text: 'Delivered files cleaned up', file: 'api/src/albums/album-retention.service.ts', mode: 'verbatim' },
    { text: BODY, file: '…', mode: 'fragments', fragments: [' removed from “', '” as scheduled.'] },
  ];
  ```

  Matching is exact. A `'` never matches `’`. The check does read through JS
  escapes, HTML entities and JSX line wrapping, and reports near misses
  (quotes, dashes, case) by name.
- **The check script.** Run `node --experimental-strip-types scripts/check-story.mjs`
  from the repo root. It checks:
  - every `SOURCES` entry against its app file;
  - the arithmetic in `story.ts`: 412 photos, 422 files, 6.3 → 9.2 → 3.2 →
    2.8 → 0.3 GB, the sweep days, and the roster's counts, rows and radii;
  - the banned-words lint over every exported string.

  A banned word is allowed only inside an app string proven by `SOURCES`.
  `--verbose` lists every pass, and `--self-test` proves the checker catches
  what it should.

## Lab pages

Each area's lab page is `app/(marketing)/story-lab/<area>/page.web.tsx`. It
calls `notFound()` in production, sets `robots: { index: false }`, and titles
itself `Story lab · <Area>`. The index lists every folder with a page
automatically, and uses the first line of the page's first doc comment as the
blurb. Check every page at 375 × 812 and 1440 × 900.
