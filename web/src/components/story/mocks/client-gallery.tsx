import type { CSSProperties } from 'react';
import { Lock, Play } from 'lucide-react';
import {
  CLIENT_ALBUM,
  CLIENT_CHAPTERS,
  CLIENT_DOCK,
  CLIENT_FILMS,
  CLIENT_FONTS,
  CLIENT_GLYPHS,
  CLIENT_KIND_TABS,
  CLIENT_PAGE,
  CLIENT_PALETTE,
  CLIENT_PICKS,
  CLIENT_PLAYER,
  CLIENT_RECORDINGS,
  CLIENT_SUMMARY,
  filmBadge,
  LINK_URL,
  type KindKey,
} from '../data/strings/ch6';
import { FILM_SEEDS } from '../data/strings/ch5';
import { FilmTile } from './film-tile';
import { litePlateStyle, Plate, plateLook } from './plate';

/**
 * The client's delivery page (Ch6, and its empty end in Ch7): the page
 * `api/src/albums/share/client-gallery.template.ts` renders at
 * client.virgo.ph/s/…, redrawn as React with its own palette
 * (`client-palette.ts`), the system font, a serif H1 and mono counts. Never
 * Geist, and no Virgo branding: the real page carries none.
 *
 * Light by default, as the couple's phone shows it in the afternoon; `dark`
 * draws the page's dark scheme. The hero panel is dark in both, as there.
 *
 * Responsive the way the page is, but to its own width rather than the
 * window's: the root is a size container, so the same mock is a phone page
 * inside `PhoneFrame` and a desktop page inside `BrowserFrame`. 2 columns,
 * then 3 from 640 px, 4 from 1000, 5 from 1300; at 520 px and under, the
 * picks bar's Download shows as its icon alone and the "Sent" note goes.
 *
 * What is drawn, top to bottom: the hero (PRIVATE DELIVERY, the album's name,
 * "412 items · 5.6 GB", Download all); the chapters; the kind tabs (only once
 * the link shows more than one kind, as the page hides them otherwise) and
 * the "My picks" toggle; the grid of Plates with their hearts; the Recordings;
 * then the fixed layers, the audio dock and the picks bar. Films are posters
 * with the page's "▶ 3:48" badge; Kenn's same-day edit is Ch5's `FilmTile`
 * (look "client"), so the film the album held on Saturday is the same frame
 * here. It shows in the Films tab (`kind="video"`), first, as the page orders
 * films by capture time; at the end of "All" come Ernie's six. A film plays in
 * the page's own full-screen player, never in its tile: `player` opens it over
 * the page on the same-day edit (Ch6's "a film plays" beat, told truthfully).
 *
 * Deliberate departures, each from the storyboard:
 * - **No day headings.** The page heads each day with its name and a count of
 *   the files loaded so far (60 a page), so on first paint it would say "60
 *   items" under a hero that says 412. Ch6 keeps it out of frame; here the
 *   room is one grid.
 * - **The picks bar's Download icon is drawn stroked.** On the real page no
 *   rule reaches that SVG, so it paints as an unstroked black shape that is
 *   all but invisible on the dark pill (reported as an app bug).
 * - **No live region.** "Sent. Your photographer has your 12 picks." is
 *   screen-reader text on the real page, so it is never drawn; Ch6's
 *   figcaption carries it (`CLIENT_ANNOUNCE`).
 *
 * States:
 *   previews   just opened; blurred previews, hearts on every tile
 *   opened     the previews have sharpened
 *   picked     12 picked: hearts filled, the picks bar up, "Send to photographer"
 *   sent       "Send again"
 *   rescoped   three weeks later, the same link showing all three kinds: kind
 *              tabs, films in the grid, the Recordings, the dock playing "Vows"
 *              (default: the end of Ch6)
 *   empty      after the last sweep (Ch7): "Nothing has been shared here yet."
 *
 * Parts: client-page (data-state, data-theme), browser-bar, client-viewport,
 * client-scroll (translate it to scroll the page), client-hero, client-title,
 * client-summary, download-all, chapters, chapter (data-active),
 * chapter-underline, kind-tabs, kind-tab (data-key, data-selected), my-picks
 * (data-state: none | some), room, tile (data-index, data-kind, data-picked),
 * tile-blur, tile-sharp, film-badge, heart (data-on), recordings, track
 * (data-playing), client-empty, dock, dock-fill, dock-thumb, picks-bar
 * (data-on), picks-count, picks-download, send (data-state: unsent | sent),
 * sent-note (data-on); inside the same-day edit's tile, FilmTile's own
 * (film-tile, film-frame, film-badge, film-pulse, film-progress); and the
 * player, in `rescoped`: film-player (data-on, data-state: poster | playing),
 * player-bar, player-close, player-title, player-meta, player-download,
 * player-stage, player-frame (data-frame), player-play, player-controls,
 * player-time, player-progress-fill, player-thumb.
 */

export type ClientGalleryState = 'previews' | 'opened' | 'picked' | 'sent' | 'rescoped' | 'empty';

type Moment = 'sunday' | 'later' | 'empty';

export const CLIENT_GALLERY_STATES: Record<
  ClientGalleryState,
  { moment: Moment; sharp: boolean; picks: boolean; sent: boolean; dock: boolean }
> = {
  previews: { moment: 'sunday', sharp: false, picks: false, sent: false, dock: false },
  opened: { moment: 'sunday', sharp: true, picks: false, sent: false, dock: false },
  picked: { moment: 'sunday', sharp: true, picks: true, sent: false, dock: false },
  sent: { moment: 'sunday', sharp: true, picks: true, sent: true, dock: false },
  rescoped: { moment: 'later', sharp: true, picks: true, sent: true, dock: true },
  empty: { moment: 'empty', sharp: true, picks: false, sent: false, dock: false },
};

// ─── The files on screen ─────────────────────────────────────────────────

type Tile = {
  seed: number;
  ratio: number;
  kind: 'image' | 'video';
  duration?: string;
  /** Which film (`CLIENT_FILMS` id). */
  film?: string;
  picked?: boolean;
};

/** Kenn's same-day edit: drawn with Ch5's FilmTile, so it is the same film there and here. */
const SAME_DAY_EDIT = CLIENT_FILMS[0].id;

/**
 * The first photos of the day, in capture order, at their own shapes (the
 * page lays each tile at its natural aspect ratio). Four of the twelve picks
 * are among them; the rest are further down.
 */
const PHOTOS: readonly Omit<Tile, 'seed'>[] = [
  { ratio: 3 / 2, kind: 'image' },
  { ratio: 2 / 3, kind: 'image', picked: true },
  { ratio: 4 / 5, kind: 'image' },
  { ratio: 3 / 2, kind: 'image', picked: true },
  { ratio: 2 / 3, kind: 'image' },
  { ratio: 3 / 2, kind: 'image' },
  { ratio: 2 / 3, kind: 'image', picked: true },
  { ratio: 3 / 2, kind: 'image' },
  { ratio: 4 / 5, kind: 'image', picked: true },
  { ratio: 2 / 3, kind: 'image' },
];

const FILM_TILES: readonly Omit<Tile, 'seed'>[] = CLIENT_FILMS.map((f) => ({
  ratio: 16 / 9,
  kind: 'video' as const,
  duration: f.duration,
  film: f.id,
}));

/** Which tiles a room holds: the kind tab decides, as the page asks the server for exactly that kind. */
function roomTiles(moment: Moment, kind: KindKey, seed: number): Tile[] {
  if (moment === 'empty' || (moment === 'later' && kind === 'audio')) return [];
  const photos = PHOTOS.map((t, i) => ({ ...t, seed: seed + i }));
  const films = FILM_TILES.map((t, i) => ({ ...t, seed: seed + 40 + i }));
  if (moment === 'sunday' || kind === 'image') return photos;
  if (kind === 'video') return films;
  // All: oldest first, so Saturday's photos lead and the films Ernie
  // finished three weeks later come last.
  return [...photos.slice(0, 6), ...films.slice(-4)];
}

// ─── Glyphs ──────────────────────────────────────────────────────────────

/** The page's heart, a 24-unit path, stroked 1.9 and filled once picked. */
const HEART = 'M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6C19 15.4 12 20 12 20z';
/** DOWNLOAD_ICON: a down arrow into a tray. */
const DOWNLOAD = 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2';

function DownloadGlyph({ size, stroke }: { size: number; stroke: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d={DOWNLOAD} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ▶, Ⅱ and ⏭ as text, never as colour emoji: the page writes them as characters. */
const GLYPH: CSSProperties = { fontVariantEmoji: 'text' } as CSSProperties;

/**
 * The tiny blurred preview the page paints under each tile before the
 * thumbnail arrives, as a Plate: the same tones and bloom, soft and wide, no
 * grain. Pre-baked, never a filter, so "sharpening" is an opacity crossfade.
 */
export function blurPlateStyle(seed: number): CSSProperties {
  const { a, b, x, y, angle } = plateLook(seed);
  return {
    backgroundColor: '#3a3029',
    backgroundImage: [
      `radial-gradient(140% 120% at ${x}% ${y}%, ${a}cc, ${a}00 78%)`,
      `linear-gradient(${angle}deg, ${a}66, ${b}5c)`,
    ].join(', '),
  };
}

// ─── Pieces ──────────────────────────────────────────────────────────────

const on = (yes: boolean) => (yes ? '' : undefined);

const MONO: CSSProperties = { fontFamily: CLIENT_FONTS.mono };

function TileView({ tile, index, sharp, picks }: { tile: Tile; index: number; sharp: boolean; picks: boolean }) {
  const picked = picks && !!tile.picked;
  return (
    <div
      data-part="tile"
      data-index={index}
      data-kind={tile.kind}
      data-picked={on(picked)}
      className="group/tile relative mb-2 overflow-hidden rounded-[14px] bg-[var(--line)] [break-inside:avoid] @min-[640px]:mb-2.5"
      style={{ aspectRatio: tile.ratio, minHeight: 90 }}
    >
      {tile.film === SAME_DAY_EDIT ? (
        // Its poster, with the page's "▶ 3:48" badge. The frames and bar
        // FilmTile also carries stay hidden: the page never plays a film in
        // its tile, a tap opens a full-screen player. `isolate` keeps
        // FilmTile's layers under the heart and the ring.
        <span className="absolute inset-0 isolate">
          <FilmTile look="client" aspect="fill" />
        </span>
      ) : (
        <>
          <span data-part="tile-blur" className="absolute inset-0" style={blurPlateStyle(tile.seed)} />
          <span
            data-part="tile-sharp"
            className="absolute inset-0"
            style={{ ...litePlateStyle(tile.seed), opacity: sharp ? 1 : 0, boxShadow: undefined }}
          />
        </>
      )}
      {/* The page's `outline: 3px solid var(--accent); outline-offset: -3px`
          on a picked tile, as a layer of its own: an outline would paint under
          the positioned plates, and a layer can fade in. */}
      <span
        data-part="tile-ring"
        className="pointer-events-none absolute inset-0 rounded-[14px] opacity-0 shadow-[inset_0_0_0_3px_var(--accent)] group-data-[picked]/tile:opacity-100"
      />
      {tile.kind === 'video' && tile.duration && tile.film !== SAME_DAY_EDIT && (
        <span
          data-part="film-badge"
          className="pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-[rgba(20,18,16,0.74)] px-[9px] py-1 text-[11px] leading-[1.2] text-white"
          style={{ ...MONO, ...GLYPH }}
        >
          {filmBadge(tile.duration)}
        </span>
      )}
      {/* Every photo and film carries a heart on a client link. Picked: white,
          the light accent, filled — in both schemes, as the page has it. */}
      <span
        data-part="heart"
        data-on={on(picked)}
        className="group/heart absolute right-2 top-2 grid size-[38px] place-items-center rounded-full bg-[rgba(255,255,255,0.9)] text-[#3B322C] shadow-[0_1px_4px_rgba(0,0,0,0.2)] data-[on]:bg-white data-[on]:text-[#A85D35]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path
            d={HEART}
            className="fill-none group-data-[on]/heart:fill-current"
            stroke="currentColor"
            strokeWidth={1.9}
          />
        </svg>
      </span>
    </div>
  );
}

/**
 * A phone browser's address bar over the page: generic chrome, neither
 * Chrome's nor Safari's, showing the host and the link's illustrative tail.
 */
export function PhoneBrowserBar({ dark = false }: { dark?: boolean }) {
  return (
    <div
      data-part="browser-bar"
      className="relative z-10 flex h-[46px] shrink-0 items-center px-3"
      style={{ background: dark ? '#1C1916' : '#F1EAE3' }}
    >
      <span
        className="flex h-[34px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px]"
        style={{ background: dark ? '#2A2522' : '#E4DBD3', color: dark ? '#D8CFC8' : '#3B322C' }}
      >
        <Lock aria-hidden className="size-3 shrink-0 opacity-70" strokeWidth={2.25} />
        <span className="truncate">{LINK_URL.replace(/^https:\/\//, '')}</span>
      </span>
    </div>
  );
}

// ─── The film player ─────────────────────────────────────────────────────

/**
 * The page's film player: `none` leaves it out; `closed` draws it unseen, for
 * a stage that opens it; `poster` and `playing` show it.
 */
export type ClientPlayerState = 'none' | 'closed' | 'poster' | 'playing';

/** Which of the three frames shows: the first while it waits, the second while it plays. */
const PLAYER_FRAME = [
  'opacity-100 group-data-[state=playing]/player:opacity-0',
  'opacity-0 group-data-[state=playing]/player:opacity-100',
  'opacity-0',
] as const;

/**
 * The player the page opens over itself when a film is tapped (`#videoViewer`
 * in the template). Films never play inside their tile. An opaque `#141210`
 * layer over the whole page; a bar with the round ✕, the file's name (14 px
 * bold) and length (11 px mono, 74% white) and the round download; then the
 * video, the screen's width at 16:9, with the browser's own controls. Those
 * belong to the browser, not Virgo, so they are drawn generic: a play disc
 * while it waits, then the time and a scrubber.
 *
 * Kenn's same-day edit, on the frames Ch5's FilmTile shows. `poster`: the
 * first frame at 0:00. `playing`: the second, 1:36 of 3:48. The same markup
 * either way, so a stage can open it (fade `film-player`) and play it (flip
 * `data-state`, crossfade `player-frame`, scale `player-progress-fill`).
 */
function FilmPlayer({ state }: { state: ClientPlayerState }) {
  const progress = state === 'playing' ? CLIENT_PLAYER.progress : 0;
  return (
    <div
      data-part="film-player"
      data-on={on(state === 'poster' || state === 'playing')}
      data-state={state === 'playing' ? 'playing' : 'poster'}
      className="group/player absolute inset-0 z-[60] flex flex-col bg-[#141210] text-white opacity-0 data-[on]:opacity-100"
    >
      <div data-part="player-bar" className="flex items-center gap-2 p-3">
        <span
          data-part="player-close"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[rgba(255,255,255,0.1)]"
          style={GLYPH}
        >
          {CLIENT_GLYPHS.close}
        </span>
        <span className="min-w-0 flex-1">
          <strong data-part="player-title" className="block truncate text-[14px] font-bold">
            {CLIENT_PLAYER.name}
          </strong>
          <small data-part="player-meta" className="text-[11px] text-[rgba(255,255,255,0.74)]" style={MONO}>
            {CLIENT_PLAYER.meta}
          </small>
        </span>
        <span
          data-part="player-download"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[rgba(255,255,255,0.1)]"
        >
          <DownloadGlyph size={18} stroke={1.8} />
        </span>
      </div>

      <div data-part="player-stage" className="relative grid min-h-0 flex-1 place-items-center overflow-hidden">
        <div className="relative aspect-video max-h-full w-full overflow-hidden bg-[#141210]">
          {FILM_SEEDS.map((seed, i) => (
            <span key={seed} data-part="player-frame" data-frame={i} className={`absolute inset-0 ${PLAYER_FRAME[i]}`}>
              <Plate seed={seed} aspect="fill" />
            </span>
          ))}
          {/* The browser's controls, generic. */}
          <span
            data-part="player-play"
            className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[rgba(0,0,0,0.45)] group-data-[state=playing]/player:opacity-0"
          >
            <Play aria-hidden className="ml-0.5 size-6 fill-current" />
          </span>
          <span
            data-part="player-controls"
            className="absolute inset-x-0 bottom-0 block bg-[linear-gradient(to_top,rgba(0,0,0,0.62),rgba(0,0,0,0))] px-3 pb-2.5 pt-7"
          >
            <span data-part="player-time" className="block text-[11px] leading-none tabular-nums">
              <span className="group-data-[state=playing]/player:hidden">{CLIENT_PLAYER.start}</span>
              <span className="hidden group-data-[state=playing]/player:inline">{CLIENT_PLAYER.playing}</span>
            </span>
            <span className="relative mt-2 block h-[3px] rounded-full bg-[rgba(255,255,255,0.35)]">
              <span
                data-part="player-progress-fill"
                className="absolute inset-0 origin-left rounded-full bg-white"
                style={{ transform: `scaleX(${progress})` }}
              />
              {/* Moves as one, like the dock's: (progress − 1) of its own width. */}
              <span
                data-part="player-thumb"
                className="absolute inset-0"
                style={{ transform: `translateX(${Math.round((progress - 1) * 1000) / 10}%)` }}
              >
                <span className="absolute right-0 top-1/2 size-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-white" />
              </span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

export function ClientGalleryPage({
  state = 'rescoped',
  dark = false,
  kind = 'all',
  scroll = 'top',
  player = 'none',
  tiles: tileCap,
  browserBar = false,
  seed = 0,
  className = '',
}: {
  state?: ClientGalleryState;
  /** The page's dark scheme (it follows the device). The story's phone is light. */
  dark?: boolean;
  /** Which kind tab is chosen, once there are tabs (`rescoped`). */
  kind?: KindKey;
  /**
   * Where the page is scrolled: its top, or its end (the last tiles and the
   * Recordings, above the fixed bars). Pure layout: the page is aligned to
   * the viewport's top or bottom, and a stage may translate `client-scroll`
   * between the two.
   */
  scroll?: 'top' | 'end';
  /**
   * The film player over the page (`rescoped` only, where there are films).
   * Left out by default; `closed` puts it in the markup unseen, for a stage
   * that opens it.
   */
  player?: ClientPlayerState;
  /**
   * At most this many tiles, to keep a stage near its DOM budget: the first
   * ones, or the last when `scroll="end"`. About 6 fill a phone's screen.
   */
  tiles?: number;
  /** Draw a generic phone browser's address bar above the page. */
  browserBar?: boolean;
  /** The first Plate seed, so the grid can show the same frames as the album in Ch5. */
  seed?: number;
  /** Size it here, or fill a positioned parent (`absolute inset-0`). */
  className?: string;
}) {
  const s = CLIENT_GALLERY_STATES[state];
  const p = dark ? CLIENT_PALETTE.dark : CLIENT_PALETTE.light;
  const later = s.moment === 'later';
  const empty = s.moment === 'empty';
  const chosen: KindKey = later ? kind : 'all';
  const room = roomTiles(s.moment, chosen, seed);
  // Capped from whichever end is in view.
  const tiles = !tileCap ? room : scroll === 'end' ? room.slice(-tileCap) : room.slice(0, tileCap);
  const recordings = later && (chosen === 'all' || chosen === 'audio');
  const chapters = empty ? null : later ? CLIENT_CHAPTERS.later : CLIENT_CHAPTERS.sunday;
  const summary = empty ? CLIENT_SUMMARY.empty : later ? CLIENT_SUMMARY.later : CLIENT_SUMMARY.sunday;

  const vars = {
    '--paper': p.paper,
    '--ink': p.ink,
    '--muted': p.muted,
    '--line': p.line,
    '--accent': p.accent,
    '--accent-ink': p.accentInk,
    '--panel': CLIENT_PALETTE.panel,
    '--panel-muted': CLIENT_PALETTE.panelMuted,
    '--panel-accent': CLIENT_PALETTE.panelAccent,
    colorScheme: dark ? 'dark' : 'light',
    background: p.paper,
    color: p.ink,
    fontFamily: CLIENT_FONTS.sans,
    fontSize: 15,
    lineHeight: 1.5,
  } as CSSProperties;

  return (
    <div
      aria-hidden
      data-part="client-page"
      data-state={state}
      data-theme={dark ? 'dark' : 'light'}
      className={`flex flex-col overflow-hidden ${className}`}
      style={vars}
    >
      {browserBar && <PhoneBrowserBar dark={dark} />}

      <div
        data-part="client-viewport"
        className={`@container relative flex min-h-0 flex-1 flex-col overflow-hidden ${scroll === 'end' ? 'justify-end' : 'justify-start'}`}
      >
        <div data-part="client-scroll" className="mx-auto w-full max-w-[1440px] shrink-0 px-4 pb-[120px] pt-4 @min-[640px]:px-[26px] @min-[640px]:pt-[26px]">
          {/* The hero: always the dark panel. */}
          <div
            data-part="client-hero"
            className="rounded-[30px] p-1.5 shadow-[0_28px_80px_-48px_rgba(62,39,26,0.72)]"
            style={{ background: CLIENT_PALETTE.panel }}
          >
            <div
              className="rounded-[25px] border border-[rgba(255,255,255,0.08)] px-[22px] py-7 text-white @min-[640px]:p-10 @min-[1000px]:p-[52px]"
              style={{
                background: `radial-gradient(circle at 78% 20%, rgba(193,119,69,0.16), transparent 34%), ${CLIENT_PALETTE.panel}`,
              }}
            >
              {/* 10 px on the page; 11 here, the story's floor for mock text. */}
              <p className="m-0 text-[11px] uppercase leading-[1.2] tracking-[0.22em] text-[var(--panel-accent)]" style={MONO}>
                {CLIENT_PAGE.eyebrow}
              </p>
              <p
                data-part="client-title"
                className="mb-0 mt-3 max-w-[880px] font-normal leading-[0.98] tracking-[-0.03em]"
                style={{ fontFamily: CLIENT_FONTS.serif, fontSize: 'clamp(36px, 6.4cqw, 68px)' }}
              >
                {CLIENT_ALBUM}
              </p>
              <div
                data-part="client-summary"
                className="mt-6 flex flex-wrap items-center gap-x-[18px] gap-y-2.5 text-[12px] text-[var(--panel-muted)]"
                style={MONO}
              >
                <span>{summary}</span>
                {!empty && (
                  <span className="flex flex-wrap gap-2">
                    <span
                      data-part="download-all"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(255,255,255,0.22)] px-[18px] text-[13px] font-semibold text-white"
                      style={{ fontFamily: CLIENT_FONTS.sans }}
                    >
                      <DownloadGlyph size={17} stroke={1.7} />
                      {CLIENT_PAGE.downloadAll}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Chapters: only sections that hold something the link shows. It
              scrolls sideways on the page; here it is cut at the edge. */}
          {chapters && (
            <div data-part="chapters" className="mt-[22px] flex gap-1 overflow-hidden border-b border-[var(--line)]">
              {chapters.map((c, i) => (
                <span
                  key={c.name}
                  data-part="chapter"
                  data-active={on(i === 0)}
                  className="relative flex min-h-[50px] shrink-0 items-center gap-2 whitespace-nowrap px-4 font-medium text-[var(--muted)] data-[active]:font-[650] data-[active]:text-[var(--ink)]"
                >
                  <span>{c.name}</span>
                  <b className="text-[11px] font-medium text-[var(--muted)]" style={MONO}>
                    {c.count}
                  </b>
                  {i === 0 && (
                    <span data-part="chapter-underline" className="absolute inset-x-3 -bottom-px h-0.5 rounded-[2px] bg-[var(--accent)]" />
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {later && (
              <div
                data-part="kind-tabs"
                className="inline-flex shrink-0 gap-0.5 rounded-[12px] p-[3px]"
                style={{ background: `color-mix(in srgb, ${p.line} 55%, transparent)` }}
              >
                {CLIENT_KIND_TABS.map((t) => (
                  <span
                    key={t.key}
                    data-part="kind-tab"
                    data-key={t.key}
                    data-selected={on(t.key === chosen)}
                    className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-[13px] text-[var(--muted)] data-[selected]:bg-[var(--paper)] data-[selected]:font-semibold data-[selected]:text-[var(--ink)] data-[selected]:shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                  >
                    <span>{t.label}</span>
                    <b className="text-[11px] font-medium" style={MONO}>
                      {t.count}
                    </b>
                  </span>
                ))}
              </div>
            )}
            <span className="flex-1" />
            <span
              data-part="my-picks"
              data-state={s.picks ? 'some' : 'none'}
              className="group/mine inline-flex min-h-[38px] items-center gap-[7px] whitespace-nowrap rounded-full border border-[var(--line)] px-3.5 text-[var(--ink)]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden className="shrink-0">
                <path fill="currentColor" d={HEART} />
              </svg>
              <span className="group-data-[state=some]/mine:hidden">{CLIENT_PAGE.myPicks}</span>
              <span className="hidden group-data-[state=some]/mine:inline">{CLIENT_PICKS.mine}</span>
            </span>
          </div>

          <div data-part="room" className="pt-2">
            {tiles.length > 0 && (
              <div className="mt-[26px] columns-2 gap-x-2 @min-[640px]:columns-3 @min-[640px]:gap-x-2.5 @min-[1000px]:columns-4 @min-[1300px]:columns-5">
                {tiles.map((t, i) => (
                  <TileView key={`${t.kind}-${t.seed}`} tile={t} index={i} sharp={s.sharp} picks={s.picks} />
                ))}
              </div>
            )}

            {recordings && (
              <div data-part="recordings" className="mt-[26px]">
                <p className="m-0 text-[17px] font-bold leading-normal tracking-[-0.02em]">{CLIENT_RECORDINGS.heading}</p>
                <p className="mb-3 mt-0.5 text-[12px] text-[var(--muted)]" style={MONO}>
                  {CLIENT_RECORDINGS.count}
                </p>
                <div>
                  {CLIENT_RECORDINGS.tracks.map((t, i) => {
                    const playing = s.dock && i === 0;
                    return (
                      <div key={t.title}>
                        <div
                          data-part="track"
                          data-playing={on(playing)}
                          className="grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-[var(--line)] px-0.5 py-3.5 text-left"
                        >
                          <span
                            className="grid size-10 place-items-center rounded-full text-[var(--ink)]"
                            style={{ ...GLYPH, background: `color-mix(in srgb, ${p.line} 78%, transparent)` }}
                          >
                            {playing ? CLIENT_GLYPHS.pause : CLIENT_GLYPHS.play}
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate font-bold">{t.title}</strong>
                            <small className="text-[12.5px] text-[var(--muted)]">{t.sub}</small>
                          </span>
                          <span className="text-[12px] text-[var(--muted)]" style={MONO}>
                            {t.duration}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {empty && (
              <div data-part="client-empty" className="px-5 py-[70px] text-center text-[var(--muted)]">
                {CLIENT_PAGE.empty}
              </div>
            )}
          </div>
        </div>

        {/* The fixed layers: the dock rides above the picks bar while there are picks. */}
        {s.dock && (
          <div
            data-part="dock"
            className={`absolute inset-x-3 z-20 mx-auto max-w-[920px] rounded-[24px] p-1.5 text-white shadow-[0_24px_70px_-28px_rgba(58,38,27,0.8)] ${s.picks ? 'bottom-[88px]' : 'bottom-3'}`}
            style={{ background: 'rgba(27,24,22,0.97)' }}
          >
            <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2.5 rounded-[19px] border border-[rgba(255,255,255,0.08)] px-3 py-2.5">
              <span className="grid size-11 place-items-center rounded-full bg-[rgba(255,255,255,0.1)]" style={GLYPH}>
                {CLIENT_GLYPHS.pause}
              </span>
              <span className="min-w-0">
                <strong className="block truncate font-bold">{CLIENT_DOCK.title}</strong>
                <small className="text-[12.5px] text-[rgba(255,255,255,0.74)]">{CLIENT_DOCK.clock}</small>
                {/* The range input, accent-color #E0A97C, at 0:42 of 3:12. */}
                <span className="relative mt-1 block h-4 w-full">
                  <span className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-[rgba(255,255,255,0.3)]" />
                  <span
                    data-part="dock-fill"
                    className="absolute inset-x-0 top-1.5 h-1 origin-left rounded-full"
                    style={{ background: CLIENT_PALETTE.panelAccent, transform: `scaleX(${CLIENT_DOCK.progress})` }}
                  />
                  {/* Moves as one: translate it by (progress − 1) of its own width. */}
                  <span
                    data-part="dock-thumb"
                    className="absolute inset-0"
                    style={{ transform: `translateX(${Math.round((CLIENT_DOCK.progress - 1) * 1000) / 10}%)` }}
                  >
                    <span
                      className="absolute right-0 top-0 size-4 translate-x-1/2 rounded-full"
                      style={{ background: CLIENT_PALETTE.panelAccent }}
                    />
                  </span>
                </span>
              </span>
              <span className="grid size-11 place-items-center rounded-full bg-[rgba(255,255,255,0.1)]" style={GLYPH}>
                {CLIENT_GLYPHS.next}
              </span>
            </div>
          </div>
        )}

        {!empty && (
          <div
            data-part="picks-bar"
            data-on={on(s.picks)}
            className="absolute inset-x-0 bottom-4 z-30 mx-auto flex w-max max-w-[calc(100%-24px)] items-center gap-2 rounded-full py-[9px] pl-3 pr-2.5 text-white opacity-0 shadow-[0_22px_60px_-24px_rgba(40,24,16,0.7)] data-[on]:opacity-100 @min-[521px]:gap-3 @min-[521px]:pl-[18px]"
            style={{ background: CLIENT_PALETTE.panel }}
          >
            <span className="flex items-center gap-2 whitespace-nowrap font-semibold">
              <b
                data-part="picks-count"
                className="grid h-[26px] min-w-[26px] place-items-center rounded-full px-[7px] text-[12px] font-semibold tabular-nums"
                style={{ ...MONO, background: CLIENT_PALETTE.panelAccent, color: CLIENT_PALETTE.panel }}
              >
                {CLIENT_PICKS.count}
              </b>
              <span>{CLIENT_PAGE.picked}</span>
            </span>
            <span
              data-part="picks-download"
              className="inline-flex min-h-[38px] items-center whitespace-nowrap rounded-full bg-[rgba(255,255,255,0.12)] px-[15px] text-[13px] font-medium"
            >
              <DownloadGlyph size={16} stroke={1.7} />
              {/* "&nbsp;Download" on the page. */}
              <span className="hidden @min-[521px]:inline">{` ${CLIENT_PAGE.download}`}</span>
            </span>
            <span
              data-part="send"
              data-state={s.sent ? 'sent' : 'unsent'}
              className="group/send inline-flex min-h-[38px] items-center whitespace-nowrap rounded-full px-[15px] text-[13px] font-[650]"
              style={{ background: CLIENT_PALETTE.panelAccent, color: CLIENT_PALETTE.panel }}
            >
              <span className="group-data-[state=sent]/send:hidden">{CLIENT_PAGE.send}</span>
              <span className="hidden group-data-[state=sent]/send:inline">{CLIENT_PAGE.sendAgain}</span>
            </span>
            <span
              data-part="sent-note"
              data-on={on(s.sent)}
              className="hidden whitespace-nowrap text-[12px] text-[var(--panel-muted)] @min-[521px]:data-[on]:inline"
            >
              {CLIENT_PICKS.sentNote}
            </span>
          </div>
        )}

        {/* Over everything, the dock and the picks bar included, as on the page. */}
        {later && player !== 'none' && <FilmPlayer state={player} />}
      </div>
    </div>
  );
}
