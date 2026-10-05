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
   - A **scene slate** in mono (e.g. `SATURDAY · 5:00 AM`) changes with the scene, like a film's time card. It sits on the frame, bottom-left (§2), not on the stage.
3. **Depth planes per shot, for the "5D" feel:**
   - (a) the far sky: the shared canvas, or the scene's own background;
   - (b) light: glow, rays and a horizon;
   - (c) the hero object: a phone, card or album as a 3D slab, rotating and dollying;
   - (d) foreground particles: bokeh and dust sprites streaming toward the camera on pushes, faster than everything else.

   Each plane has its own parallax rate.
4. **Physical beats (the "5D"):**
   - **Light sweeps:** a diagonal gradient band crossing the frame on key beats.
   - **Flares:** pre-rendered radial sprites.
   - ~~**Rumble**~~: removed (owner, 2026-10-04: the shake made people dizzy). Floats are translate-only.
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
   - **Hero:** see §1.10, the hero film. (The drawn gear constellation that first stood here read as flat clip-art; the owner asked for real depth.)
   - **Scenes:** each role carries its tool wherever the crew appears: the job's role rows, the nearby filter, the accepted crew, Saturday's shoot (a shutter beat on the camera, the rig's red tally light), the credits.
   - No brand names or logos; no real products.

8. **Zoom in, ease in and out, geometry** (the owner's reference, 2026-10-04):
   - **Cuts between chapters** are drawn centrally (`page/cinema/cuts.tsx`) as fixed overlays keyed to where the next chapter's top edge is on screen, so the seam is never seen. Each is a camera's own mechanism, never a symbol (owner, 2026-10-05: "remove the shapes… enhance the shutters"):
     - the **aperture** (into #hire, #delivery and #features): curved metal blades turn shut, the barrel darkens round them, and they fire open in a flash of light with an anamorphic streak;
     - the **focal-plane curtain** (into #calendar and #forget): slatted metal rises over the seam with the scroll and lifts off the new scene from below, which comes in a warm exposure;
     - the **light leak** (into #saturday): a warm wash with a rose fringe, a burned edge and a streak;
     - the **warp** (into #nearby): the frame falls into the dark of space and the stars stream past.
     Chapters that share the sky flow on uncut.
   - Every scene **opens as a zoom in** onto its hero object.
   - Every item **eases in and out** (`useReveal`), staggered; nothing pops.
   - **Viewfinder** moments (`viewfinder.tsx`): a focus box that hunts and locks (and a REC dot for video). Used on Mika's star, Post it, Saturday's shoot and The work. The frame carries the corner marks, so there are no brackets or thirds grid.
   - **Pattern, not shapes** (owner, 2026-10-05: the hearts, hexagons and grids behind the scenes were noise). The scenes carry no decorative geometry. The page's one texture is a fine gold dot matrix on the frame (§2), drifting at a twentieth of the scroll. Shapes appear only when they mean something: the morphs (§1.9) and the sky's stars and constellations.
9. **Morphs** (`morph.tsx`): every shape is resampled once onto the same polar grid, so any shape melts into any other. Since 2026-10-05 they are kept only where a star is involved: Ch3's last point of light becoming a star, Ch7's files leaving as stars, Ch8's pins becoming stars, and the credits' gathering star. The decorative glyphs are gone: the cuts' centre symbols, Ch1's chat bubble, Ch4's square, Ch5's hexagons (each frame now flies in as a spark of light), and Ch6's heart (now a spark that carries the picks to Mika's phone). Ch2's map pin stays: it marks the shoot the distances are measured from.

10. **The hero film** (owner, 2026-10-04: "too flat… make it feel like a video", modern kit). A photoreal render, not a drawing:
    - **The scene:** a dark studio with a cine camera as the hero piece, large and close at three-quarters. It has a geared cine prime with coated glass, a key light, and a gold rim. A mirrorless camera sits soft behind it and a spare prime lies out of focus in front. There is a dark satin floor, warm bokeh far back, and dust near the lens.
    - **How it is made:** the gear is built in code (`marketing-assets/blender/gear_models.py`), so it is generic and needs no licences. The scene and its motion are in `marketing-assets/blender/hero_film.py`, rendered with Blender Cycles on the CPU.
      - The opening (2.5 s): the lights flicker on and the camera dollies in.
      - The loop (5 s): seamless. A slow orbit, the light breathing, motes on closed paths, and a glint crossing the lens.
      - `scripts/encode-film.mjs` makes VP9 and H.264 files plus a lit still; `publish.mjs` hashes them in.
    - **On the page** (`scenes/hero-plate.tsx`):
      - The opening plays once and hands over to the loop with no black frame.
      - Live haze drifts over it, and the mouse adds a little parallax.
      - The first scroll pushes the camera into the lens glass and through it into the sky.
      - The still stands in for reduced motion, no JS, and phones that will not autoplay. The film pauses with Pause and off screen.
      - Desktop: title left, film right. Phones: film on top, title below.

11. **The sky is space, and Virgo is the thread** (owner, 2026-10-05: "enhance the sky to feel like space… the Virgo constellation should be seen from the hero, somewhere midway and at the ending… stars are not emphasized").
    - **Deep space** (`sky/space.ts`, a lazy chunk): a seeded Milky Way band with a dark rift, two faint nebulae, a far star field at two depths, twinkling far stars, and a rare shooting star (one every 8–12 s at most, only while a chapter shows the sky). All of it is drawn into the engine's one canvas from textures built at idle, turning at about half the camera's rate. It is off in lite mode and under Pause, and reduced motion never mounts the sky. Its textures count against the map layers' pixel budget, not on top of it.
    - **"This star is Mika."** (owner: the landing was flat, and unclear whether the line meant the star or a person). While "Every star is a creative." plays, stars around Cebu light with what each creative does (Photographer, Videographer, Photo Editor, HMUA; Coordinator and Video Editor on desktop). As the camera locks on Mika's star, a spark runs out of it along a gold leader and becomes the ring round her avatar, and her card unfolds (`page/sky/mika-card.tsx`, driven by the Prologue's clock): her name, "Wedding photographer · Cebu City", her camera, three frames of her work. The subtitle names the star as her: "This star is Mika, a wedding photographer in Cebu City." The frame says "Illustrative" while the card is up.
    - **Stars are people:** Mika and the crew carry a four-point diffraction spike, a halo and a slow breath (`featured`). The city stars draw warmer than the scattered field, the neighbours a Nearby search finds light up warm, and Ch8's crews are clear points that flare as they light. Labels: on desktop Ch3, each of the cast by their star (Mika · Spica, Ernie · Porrima, Kenn · Vindemiatrix, Bea · Heze).
    - **Virgo in four places** (`cinema/virgo-constellation.tsx` for the HTML figure; the sky engine for Ch3 and Ch8):
      - **Hero:** gold hairlines over the dark above the camera. The stars come up with the film's lights, the lines draw out from Spica from about 3 s, and the first scroll lifts it away. Syrma is an empty socket.
      - **Ch3 (midway):** the real figure forms in the sky once the terms card leaves, with a spark on each growing line and a pulse when it completes; it holds to the end of the chapter. Ch3's own morph star hands over to it as the lines start.
      - **Ch8:** Mika's crew hangs over Cebu City as a small Virgo, large as the crane rises past it.
      - **Ending:** the lines draw out of the logo's flash, Syrma ignites last ("you"), and the figure rests faint behind "Start your journey now." The static closing shows it drawn, Syrma lit.

## 2. The frame (chrome)
Owner, 2026-10-05: "a frame on the sides… the Virgo logo as a watermark… the sign in button arranged, same with the other buttons", for a thousand-dollar feel. The film plays inside a frame, like a camera's viewfinder or a broadcast (`page/cinema/frame.tsx`):
- **The matte.** A thin dark border (`--frame`: 10 px, 22 px from 1024 px) with a hairline and gold corner marks. It is fixed, so every scene plays inside it.
- **Everything the visitor can press lives on the frame,** in the same four places for the whole page:
  - **top-left:** the Virgo mark as a watermark (a broadcast "bug" at 55%; the word from 640 px), → `#top`;
  - **top-right:** **Sign in** (a dark chip, legible on day scenes) and **Join** (gold pill);
  - **bottom-left:** the scene's time card and, over app screens, **"Illustrative"**. Scenes publish both to `cinema/hud.ts` instead of drawing them; over a daylight scene they are set in ink, not gold;
  - **bottom-right:** **Pause** (motion only) and **Download** (→ `/download`).
- **The rails (desktop).** The tagline runs up the left rail ("Every shoot is a constellation"); the chapter in view runs down the right (`01 · Wednesday night`…).
- **The progress line** runs along the frame's foot, like a video timeline.
- **The texture:** the dot matrix (§1.8), under the matte.
- A visually hidden **"Skip the film"** link is first in the tab order, and becomes visible on focus.
- **Retired:** the floating Download pill, the scrubber and the letterbox (the frame does their jobs).
- **Grain and vignette** are always on (static images, never animated).

## 2a. Pacing and type
Owner, 2026-10-05: the transitions felt rushed.
- **One beat per subtitle.** Every line gets about 60 svh of scroll, so the chapters keep the same tempo: Ch2 240, Ch5 240, Ch6 180, Ch7 220, The work 90 and Ch8 130 svh (up from 200, 150, 140, 100, 60 and 90).
- **Smooth scroll on desktop** (`cinema/smooth-scroll.tsx`, Lenis): the wheel's steps become one glide. It is on only for a mouse or trackpad (`pointer: fine`) with motion on; phones keep native touch scrolling. The pre-paint script marks it (`data-lenis`), and the chapters then follow the scroll directly instead of through their own spring, so the page is not smoothed twice.
- **Settle on held frames:** if the visitor stops partway through a cut (between 6% and 94%), the page eases to the nearer whole scene after 240 ms, instead of resting on a half-closed aperture.
- **The display type is a serif** (Instrument Serif, `--font-display`, marketing layout only): the headings and every subtitle, set at weight 400, like a film's titles. Body and UI stay in Geist.

## 2b. A steady film on phones
Owner, 2026-10-05, after an iPhone audit: "those frames are shaky… it makes my brain busy", from Connect down to Everything around the shoot, and in the closing. On phones and touch screens (`motion.tsx` `steady()`: under 1024 px or no hover) the film keeps its dollies and pushes but moves flat:
- **No 3D turns.** The camera rig and every card's turn are translate and scale only (`useCamera`, `place3d`, `turn` in `cinema/fx.tsx`); depth becomes the scale it would show. The device frames sit flat (story.css). A turning, tilted plane re-renders its text every frame on a phone and shimmers.
- **No idle float, and no rotating light.** The rays at Saturday's sunrise and behind the closing logo never turn: fine stripes turning with the scroll strobe. The dot matrix holds still.
- **Progress against the small viewport.** Scroll progress is computed against 100svh, not innerHeight: on an iPhone innerHeight changes by the address bar every time it slides, and every scene lurched a few per cent at each change of direction. The sky and the cuts ignore those height-only resizes too.
- **The credits move one way.** On phones the names only fade; the roll is the one movement.
- **Still, not springy** (a second iPhone audit, the same day: the cards still bounced as the page scrolled). On phones:
  - the progress follows the finger exactly, with no spring: the pinned stage moves with the finger, and sprung cards trailed it and seemed to bounce against it;
  - the camera only dollies (scale), with no drift up and down between keys;
  - items and subtitles fade in place instead of rising;
  - no dust, no light sweeps, no drifting haze, and no ambient loops, which is also fewer layers in memory;
  - a push through glass stops at 2× (`PHONE_PUSH`), where desktop goes to 4–8×.
- **Removed on every screen** (bounces by design): Ch3's tools wobbling on a sine of the scroll and popping on Accept; Ch5's frames arcing in and overshooting their size. Ch1's Post it press stays on desktop only.
- **One logo at the close.** The flash's logo glides up and shrinks into its place above "Start your journey now." The last screen keeps an empty slot for it, so there are never two.

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
  - `LightSweep`, `Flare`;
  - `Frame` (with the `hud` store), `SmoothScroll`;
  - easing helpers.
- **Scene lengths:**
  - each shot ≈ 100–140 svh of scroll;
  - total motion page ≈ 18–22k px on mobile (down from 31k).
