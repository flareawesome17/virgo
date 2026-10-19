# Virgo marketing redesign — Phase 1 audit

Date: 2026-10-02. Scope: the marketing site at virgo.ph only. The app (web.virgo.ph) is not changed.

> **Baseline warning.** Local `main` (4799f72, #128) is **100 commits behind `origin/main`** (ce24c4f, #129). This audit describes `origin/main`. Two marketing files differ: `pricing.tsx` and `structured-data.tsx`, which carry the "launch free, 3 × 10 albums on 15 GB" copy. Pull before Phase 4. The uncommitted `framer-motion ^13.5.0` in `web/package.json` is treated as the user's intentional change and was not touched.

## 1. Skills read, and where they conflict with the brief

- **UI UX Pro Max** (`~/.claude/skills/ui-ux-pro-max`): read in full. The design-system search was run.
- **Remotion** (plugin, 12 skills): read the create, markup, render, maps, effects and timing references.
- **modern-web-guidance**: installed and consulted.
- **Motion / Framer Motion skill: not installed, and not in the plugin catalog.** The plan relies on Motion's own docs plus modern-web-guidance.

| Conflict | Recommendation |
|---|---|
| UUPM `--design-system` returns purple #7C3AED with Archivo/Space Grotesk | Ignore the palette and fonts. Keep `design/tokens.json`, #161311 and Geist. |
| UUPM/GSAP presets assume JS pinning; Motion entrances usually start at `opacity:0` | Pin with CSS `position: sticky` in tall wrappers and drive it with Motion `useScroll` MotionValues (no React state per frame). Render the hero visible on the server, never opacity 0. |
| UUPM landing patterns include horizontal scroll journeys and scroll-snap | Don't use them. The brief says no scroll-jacking, and UUPM's own UX rule agrees. |
| modern-web-guidance: "don't autoplay large video" | Keep the Remotion hero loop, but make the LCP element a static poster (`remotion still` → AVIF). The loop loads afterwards, is muted, and is skipped under reduced motion or Save-Data. |
| Reduced-motion approaches differ | The server-rendered base is the static, final-state version. Motion is layered on under `prefers-reduced-motion: no-preference`. |
| Remotion maps skill suggests tiles (Mapbox/MapLibre) | Follow the brief: bake one simplified SVG from a real boundary dataset with a script. The reel reuses the same SVG. |
| Remotion grain effects are WebGL | Use one static tiled grain layer on the site (fixed, `pointer-events:none`). WebGL grain only in the videos. |
| UUPM `--persist` writes `design-system/` | Don't persist. The docs live in `docs/redesign/`. |
| `motion` vs `framer-motion` package | Keep the user's `framer-motion 13.5.0` and import from it consistently. |
| Remotion project placement | A separate sibling package, `marketing-assets/` (it also holds the map, constellation and poster scripts), with its own lockfile. Optimised renders are published with hashed names under `web/public/redesign/`; the reel master stays out of git. |

## 2. Repo map

- **Marketing site:** `web/` (Next 16.3, React 19.2, Tailwind v4 CSS-first, Geist + Geist Mono via `next/font`). One container serves both hosts.
  - `web/src/proxy.ts` rewrites apex `/` to `/landing`. The apex serves `/terms`, `/privacy`, `/download` and the OG images. Every other apex path gets a 308 to web.virgo.ph.
  - Page: `web/src/app/(marketing)/landing/page.web.tsx`. It is force-dynamic and fetches `/plans`.
  - Sections: `web/src/components/landing/*`: nav, hero, showcase, pillars, nearby, community, delivery, features, how, pricing, faq, closing, structured-data, reveal, plate, roles, links.
- **Tokens:** `design/tokens.json` is the single source. `scripts/build-tokens.mjs` writes it to web, mobile, dashboard and the client page. Landing components mostly hard-code hex values instead of using the tokens; fix that in the rebuild.
- **Existing animation:**
  - A `Reveal` component (IntersectionObserver plus a CSS opacity/translate transition)
  - The hero bloom keyframes
  - SVG grain
  - The nav scroll-spy
  - No JS animation library
- **Logo:** `web/public/logo.png` is a painterly flame "V" (360 px raster). There is no SVG.
- **Other surfaces:**
  - `api/`: NestJS with raw Postgres; 77 migrations; B2 media.
  - `mobile/`: Expo 54.
  - `dashboard/`: console.
  - `desktop/`: Tauri app, shipped for Windows and macOS.
  - The client delivery page is rendered by the API (`api/src/albums/share/client-gallery.template.ts`).

## 3. Live site review (375 / 768 / 1440)

**Worth keeping**
- **The voice.** It is plain, specific, dry and honest, for example "We would rather find out what a working photographer actually needs than guess at a price and be wrong about it." and "Nobody lands in your network without agreeing to it."
- **The honesty rule.** The footnote reads "Interface shown as rendered by the app. Album contents are illustrative — we do not put client work on a marketing page." Keep it, and extend it to every mock.
- **Mockups drawn as components, not screenshots.** Initials avatars, abstract "plate" thumbnails.
- **Palette and type.** #161311 near-black, copper #C17745, a gold gradient (#E8B189 → #A85F38), Geist with Geist Mono eyebrows.
- **SEO base.** Canonical, OG/Twitter, Organization, SoftwareApplication and FAQPage JSON-LD, robots and sitemap.
- **Engineering care.** Compositor-only reveals and reduced-motion handling.

**Weak**
1. **There is no story.** Ten numbered sections form a feature list, and the same pitch is told four times: pillars, Nearby/Delivery, the bento, and How it works. "…by Saturday?" is used twice. The page is 9,656 px at 1440 and 12,851 px at 375.
2. **The hero is blank until hydration.** The H1 sits in `.reveal` (opacity 0) until JS sets `data-shown`. At every width I tested it stayed blank for 2–3 s, and there is no no-JS fallback. This is the main LCP risk.
3. **Fast flings on a phone show blank screens.** Reveals lag behind a fast scroll.
4. **The hero sells nothing visual above the fold at 1440×900.** The panel underneath is three list rows.
5. **The cream Community section is the only light block.** It reads like a different site. In the new story, the night → golden-hour shift should be the one deliberate light change.
6. **768 px bug:** the "Virgo" wordmark collides with the "Hire" nav link.
7. **Brand drift:** the OG image uses a "V" square badge and the tagline "CREATIVE OS", which appear nowhere else.
8. **The motion is generic.** Everything fades up, and nothing carries meaning.
9. **Mock accuracy.** Distances are shown with decimals (2.2 km), but the app now shows whole kilometres. The Showcase mock puts the app sidebar under a `client.virgo.ph` URL. The hero and Delivery mocks have no "illustrative" footnote.
10. **Broken jobs link.** `virgo.ph/jobs` gets a 308 to `web.virgo.ph/jobs`, which returns a 404. The FAQ promises a job board.
11. **Two contact addresses:** hello@ in Pricing and the FAQ, support@ in the footer.
12. **Incomplete SEO data.** The sitemap omits `/download`, and the JSON-LD `operatingSystem` omits Windows and macOS.
13. **Stale wording.** `/download` still says "Virgo is in beta" (`windows-first-run.tsx:29`). The FAQ says payments go through PayMongo in the present tense, but nothing can be bought.

**web.virgo.ph auth.** Viewed only; nothing was entered. Sign-in is a centred card. Sign-up is a 3-step wizard (You / What you do / Where you are) with an optional invite code. Both follow the system theme: cream #FFF8F4 or dark.

## 4. Copy the story must not say (code contradicts it)

- **"…and get paid."** The Terms say Virgo does not take or hold payment. Keep the line only if "get paid" means "get booked". Otherwise reword it. **Your call.**
- **Ch4 "phone with zero signal still rings".** Only *reminders* become local alarms. Accepting an event does not schedule one. The safe version: Mika sets a 5:00 AM reminder for the 6:00 call time, and it rings offline.
- **Ch5 "thumbnails stream live from three devices".** There is no realtime upload event. Show the album filling and the activity feed afterwards ("Ernie uploaded 248 files"), not a live stream.
- **Ch6 link.** Client links never expire on a timer; they live until revoked or the files are gone. Don't show a countdown on the client's view.
- **Ch7 retention.** The options are fixed: 30, 60, 90, 180 or 365 days, counted per file from upload. Not "whatever the contract says".
- **Nearby distances.**
  - Distances are whole kilometres.
  - Positions are stored to about 1 km.
  - The radius runs from 5 to 200 km.
- **"Book them".** Bookings are created only when a job-board application is accepted. They are not created from a Nearby request.
- **The feed.** It is signed-in only, not public, and not TikTok-style. Don't market it as public.
- **Store availability.** Android installs from `virgo.ph/download`. Don't show store badges until the listings are live.

## 5. Shipped features the marketing site misses or undersells

All verified by an adversarial pass against `origin/main`. Rows marked ✗ were refuted or are only partial; don't market them.

| Feature (verified) | Value | Placement |
|---|---|---|
| Client hearts favourites → downloads just those, or "Send to photographer" | High | Ch6 Handover |
| Album sections (Prep / Ceremony / Reception) shown as chapter tabs on the client link | High | Ch5 → Ch6 |
| Albums ordered by capture time, day by day (camera timestamps) | High | Ch5 |
| Originals kept as shot; client downloads originals | High | Ch5 / Ch6 |
| Films play anywhere (720p H.264 proxy + HLS when shared; HEVC/ProRes OK) | High | Ch6 |
| Job board with per-role peso budgets (≤ ₱500k a role); auto-closes | High | Ch1 (the alternative to group chats) |
| Accept an applicant → connection + chat seeded with terms + booking | High | Ch3 |
| Bookings record agreed terms (role, date, place, rate, inclusions) | High | Ch3 / Ch4 |
| Event-change alerts (call time moves → whole crew notified) | High | Ch4 |
| Nearby around a shoot: search from 71 PH cities or an upcoming event's city | High | Ch2 |
| Showcases feed: post up to 10 of your own works with a "How it was made" note (phone app, signed-in) | High | New short chapter, "The work", before Ch8 (optional) |
| Fast galleries on mobile data (blur preview → WebP thumbnails) | Medium | Ch6 |
| Audio "Recordings" player on the client link | Medium | Ch6 |
| One link per album; rescope or turn off without changing the URL | Medium | Ch6 |
| Download-all zip / single files | Medium | Ch6 |
| Collaborator roles plus per-album view / download / upload / manage | Medium | Ch5 |
| Crew uploads count against the owner's storage | Medium | Ch5 (one meter filling) |
| Workspace activity feed | Medium | Ch5 |
| Resilient background uploads (3 at once, progress, resume) | Medium | Ch5 |
| Hire enquiry from a profile or post | Medium | Ch8 |
| Profile at virgo.ph/@handle (members-only) with roles, city, jobs done | Medium | Ch8 / Finale |
| Location kept to ~1 km; city instead of GPS | Medium | Ch2 |
| Block and report people across every surface | Medium | FAQ: "Is it safe?" |
| Desktop app (Windows and macOS, auto-update) | Medium | Ch9 bento + footer |
| Retention clean-up sends a notice afterwards | Medium | Ch7 |
| Role counts on Nearby chips; presence and typing; event types; notification centre; email notifications; 2FA by email; pause account; EXIF/GPS stripped from public images; client token never tracked; HEIC/GIF/TIFF/FLAC support; workspace archive; in-app support; silent decline | Low | Bento / FAQ / omit |
| ✗ Report stolen work (no admin permission yet), ✗ store apps, ✗ offline cache, ✗ chat search, ✗ connections-gate claim, ✗ "no one left waiting" | — | Don't market |

## 6. Recommendation

- **Weave in** (these strengthen existing chapters and add no length):
  - Job board with role budgets (Ch1)
  - Accept → chat + booking with agreed terms (Ch3)
  - Event-change alerts (Ch4)
  - Album sections, capture-time order, originals and the crew storage meter (Ch5)
  - Client favourites, "Send to photographer", films that play and recordings (Ch6)
  - The clean-up notice (Ch7)
  - City-based / around-a-shoot search and 1 km privacy (Ch2)
- **One optional new beat:** "The work" (showcases), a 1-screen bridge into Ch8. It sells the community without a feature tour. Members-only wording.
- **Bento (Ch9):** desktop app, resilient uploads, 2FA / pause, notification controls, workspace archive.
- **FAQ additions:** "Is it safe?" (block and report), "Can I use a city instead of GPS?"
- **Leave out:** presence and typing, event types, silent decline, rewards and referrals, chat search, store badges, stolen-work reports.
