# Virgo story site — the cinema pass

Date: 2026-10-04 · Owner's direction after reviewing the first build:
- Make it feel like a 5D cinema, an explainer film. Every scroll tells the story.
- Cut the words.
- No navigation while scrolling; the only thing that matters is **Download**, placed smartly.
- Improve the hero.
- Smooth.

This document overrides the storyboard's motion, navigation and copy wherever they conflict. Product truth, the honesty rule, accessibility and performance rules still hold.

## 1. The film grammar
1. **The scroll is the playhead.** Every chapter is a *scene* of 1–3 *shots*. A shot is a full-bleed, pinned 100svh stage, and the camera is always moving: dolly, push, crane, orbit. There are no static frames.
2. **Subtitles, not paragraphs.**
   - One subtitle line on screen at a time: ≤ 10 words, large, centred in the lower third, with a soft dark scrim under it.
   - At most one small supporting line (≤ 12 words).
   - A **scene slate** in mono, top-left of the frame (e.g. `SATURDAY · 5:00 AM`), changes with the scene, like a film's time card.
3. **Depth planes per shot, for the "5D" feel:**
   - (a) the far sky: the shared canvas, or the scene's own background;
   - (b) light: glow, rays and a horizon;
   - (c) the hero object: a phone, card or album as a 3D slab, rotating and dollying;
   - (d) foreground particles: bokeh and dust sprites streaming toward the camera on pushes, faster than everything else.

   Each plane has its own parallax rate.
4. **Physical beats (the "5D"):**
   - **Light sweeps:** a diagonal gradient band crossing the frame on key beats.
   - **Flares:** pre-rendered radial sprites.
   - **Rumble:** ≤ 2 px translate jitter for 300 ms, on the shutter, the 5:00 AM alarm and Send. It is off under reduced motion and Pause.
   - **Focus pulls:** crossfade a sharp and a soft (pre-blurred) copy of a layer by opacity.
   - **Wind:** particles stream toward the camera during camera pushes.
5. **Motivated transitions between scenes:**
   - push *through* a phone screen into the next scene;
   - a star becomes a notification dot;
   - light dissolves (a gold leak);
   - pull back to the sky.

   No hard cuts to a blank screen.
6. **Smooth:**
   - compositor-only (transform and opacity), no filters or blur animation;
   - one useScroll per scene, with eased mapping (cubic-bezier(0.16,1,0.3,1) for entrances; camera cubic-bezier(0.65,0,0.35,1));
   - no React state per frame;
   - scenes load as you approach them (lazy client chunks).

7. **The gear.** The owner asked for the tools of the trade on screen, so a visitor sees at a glance who this is for. A set of generic, unbranded objects drawn in code (`page/cinema/gear.tsx`), lit like night product shots (dark bodies, a warm gold rim light):
   - **camera body** (photographer), **lens**, **cinema rig** (videographer), **gimbal**, **light** (strobe with a softbox), **mic**, **makeup brush** (HMUA), **edit timeline** (editor).
   - **Hero:** the gear floats in depth around the title as a constellation, joined by faint gold lines. It bobs gently (autoplay, stops under Pause). The first scroll pushes the camera *through* it, and the pieces stream past the viewer into the sky.
   - **Scenes:** each role carries its tool wherever the crew appears: the job's role rows, the nearby filter, the accepted crew, Saturday's shoot (a shutter beat on the camera, the rig's red tally light), the credits.
   - No brand names or logos; no real products.

8. **Zoom in, ease in and out, geometry** (the owner's reference, 2026-10-04):
   - **Cuts between chapters** are drawn centrally (`page/cinema/cuts.tsx`) as fixed overlays keyed to where the next chapter's top edge is on screen, so the seam is never seen:
     - an aperture **iris** that turns as it closes and opens (into #hire, #calendar, #delivery and #features);
     - a **tunnel** of hexagons zooming past (into #nearby and #forget);
     - a gold **light leak** (into #saturday).
     Chapters that share the sky flow on uncut.
   - Every scene **opens as a zoom in** onto its hero object.
   - Every item **eases in and out** (`useReveal`), staggered; nothing pops.
   - **Viewfinder** moments (`viewfinder.tsx`): corner brackets, a thirds grid, and a focus box that hunts and locks. Used on Mika's star, Post it, Saturday's shoot and The work.
   - **Geometry** from the story's own shapes sits behind each scene in gold hairlines: constellation lines, radius rings, the calendar and album grids, hexagonal apertures.
9. **Morphs** (`morph.tsx`): every shape is resampled once onto the same polar grid, so any shape melts into any other.
   - At the centre of every cut, the outgoing scene's symbol morphs into the incoming one's: star → chat bubble, job → pin, constellation → calendar, alarm → sun, shutter → heart, heart → hourglass, stars → aperture.
   - Inside the scenes:
     - the chat bubble becomes the job card;
     - a dot becomes a map pin;
     - an applicant's light becomes a star;
     - the calendar tile becomes the alarm;
     - the aperture becomes an album tile;
     - the client's heart becomes Mika's notification;
     - each leaving file becomes a fading star;
     - the crews' pins become stars;
     - the credits' star becomes a heart.

## 2. The frame (chrome)
- **No header.**
  - The hero shows only the Virgo mark (top-left) and **Sign in** (top-right, text). Both fade out as the film starts.
  - A visually hidden **"Skip the film"** link is first in the tab order, and becomes visible on focus.
- **Download pill.** One floating pill, the only persistent control: "Download Virgo" with an icon, → `/download`.
  - Desktop: bottom-right. Mobile: bottom-centre, above the safe area.
  - It appears after the hero (once the film has started), hides while the visitor scrolls down quickly, and returns when they pause (~600 ms) or scroll up.
  - It never covers a subtitle; subtitles sit above its zone.
  - It hides during the credits, where the Download CTA is inline.
- **Film scrubber.** A 2 px progress line along the bottom edge, with faint scene ticks (aria-hidden), like a video timeline.
- **Letterbox (desktop ≥ 1024 px).** The page opens in 2.39:1 bars that retract as the first scroll starts, and return for the Finale ("the credits").
- **Grain and vignette** are always on (static images, never animated).

## 3. The script (final copy)
**Prologue: opening title (`#top`)**
- Small mono line: `A VIRGO STORY`
- H1: **Where creatives find each other, and get paid.**
- One line: Photographers, videographers, editors and HMUAs — and the workspace they run the job from.
- CTA **Join the community** · text link **Sign in** · cue **Scroll to play** ↓

Shots:
- *descent:* "Every star is a creative." → "This is Mika. Wedding photographer, Cebu City."

**Ch1 · `WEDNESDAY · 11:42 PM` (`#hire`)**
- "Saturday's wedding is booked. The crew isn't."
- "Three group chats. Seen by 14. Answered by nobody."
- "Or post the job once. A rate for every role."

**Ch2 · `THURSDAY · 12:04 AM` (`#nearby`)**
- "Who's working near the shoot?"
- "Pick the roles. Pick the distance."
- "The only thing anyone learns is how far away you are."
- *(the erase)* "Turn it off, and you're gone. Not hidden. Erased."

**Ch3 · `THURSDAY · 12:31 AM` (`#connect`)**
- "They applied. She accepted."
- "The rate, written down. The money stays between you."
- *(Virgo forms)* "Nobody joins your network without agreeing to it."

**Ch4 · `FRIDAY · 9:20 PM` → `SATURDAY · 5:00 AM` (`#calendar`)**
- "The call time moved. Everyone heard."
- "No signal. It rings anyway."

**Ch5 · `SATURDAY` (`#saturday`)**
- *(golden hour)* "Saturday."
- "Everyone shot it."
- "One album holds it, in order."
- "Kept exactly as shot."

**Ch6 · `SUNDAY · 4:50 PM` (`#delivery`)**
- "One link. No account. Nothing to explain."
- "They pick. You get told."
- `THREE WEEKS LATER`: "Same link. Now with the films."

**Ch7 · `DAY 91` (`#forget`)**
- "Hand it over."
- "Then forget about it."
- "Each file leaves on its own schedule. The storage comes back."

**The work (`#the-work`)**
- "Show the work. Say how you made it."

**Ch8 · `EVERY SATURDAY` (`#community`)**
- "Somewhere tonight, a crew like this one."
- "A creative industry is a people business."

**Ch9 · `#features`, "Everything around the shoot"**
- Tiles with an H3 and ≤ 8 words each.

**Ch10 · `#pricing`, "Free for now."**
- "15 GB. No card. No trial clock."
- Free bright; Freelancer ₱399 / Studio ₱999 / Business ₱2,499 dimmed, "Soon".

**Finale, the closing screen (`#start`): the end of the page.** There is no FAQ and no footer after it (owner, 2026-10-04).
- The credits roll: the crew by role, each with its tool.
- The logo sting: a gold star gathers in the dark, the frame flashes warm white (a 2 px rumble), and the Virgo logo is there with "VIRGO" under it.
- The letterbox bars open as the film ends.
- "Start your journey now."
  - **Join the community** · **Download Virgo** · Sign in.
  - The links the footer used to carry, as buttons: Open the web app · Terms · Privacy · support@virgo.ph.
- The credits:
  - the honesty line;
  - the map and star data credits (the licences ask for them);
  - © Virgo · Made in the Philippines.
- The FAQPage structured data goes with the FAQ. Google only allows it for questions the page shows.

**Honesty:**
- one small mono tag, **"ILLUSTRATIVE"**, in a corner of every app shot;
- the full line once in the credits/footer: "Interfaces drawn from the app. People, places and numbers are illustrative; no client work appears here."

## 4. Static / reduced motion
- The same short script, as a calm editorial page.
- Each scene shows its key still (mock or still image) with its subtitle lines as headings and short text.
- It's server-rendered (SEO, no-JS, reduced motion), with no letterbox, no particles and no rumble.

## 5. Architecture changes
- **Each chapter is two renders:**
  - (1) the server-rendered static scene: `static-only`, short copy, one still;
  - (2) a client **Scene** component loaded with `next/dynamic` (`ssr: false`) when the chapter is within ~150% of the viewport, rendered only when the motion gate is on.

  The Scene owns its own markup (mocks imported client-side), so the HTML no longer carries two copies of every figure.
- The H1 and every subtitle line also exist as real text in the static render (SEO, a11y).
- **The shared kit** (`page/cinema/`):
  - `Shot` (pinned stage plus progress);
  - `Subtitle` / `Slate`;
  - `Particles` (seeded sprite field, ≤ 40 sprites on mobile);
  - `LightSweep`, `Flare`, `Rumble`, `Letterbox`;
  - `DownloadPill`, `Scrubber`;
  - easing helpers.
- **Scene lengths:**
  - each shot ≈ 100–140 svh of scroll;
  - total motion page ≈ 18–22k px on mobile (down from 31k).
