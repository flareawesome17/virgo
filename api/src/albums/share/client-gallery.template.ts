import type { PublicAlbumView } from './album-share.service';
import { DELIVERY_PALETTE as P } from './client-palette';

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * The page's colours, from design/tokens.json by way of client-palette.ts.
 *
 * Every piece of secondary text on the dark header panel was white at 40–52%
 * — 3.2 to 4.0 : 1 — and the "Download all" button put white on a terracotta
 * it met at 4.1 : 1. These all clear 4.5 : 1 now.
 */
const PAGE_STYLE = `
  :root { color-scheme:light dark; --paper:${P.light.paper}; --ink:${P.light.ink}; --muted:${P.light.muted}; --line:${P.light.line}; --accent:${P.light.accent}; --accent-ink:${P.light.accentInk}; --panel:${P.panel}; --panel-ink:${P.panelInk}; --panel-muted:${P.panelMuted}; --panel-accent:${P.panelAccent}; }
  @media (prefers-color-scheme:dark) { :root { --paper:${P.dark.paper}; --ink:${P.dark.ink}; --muted:${P.dark.muted}; --line:${P.dark.line}; --accent:${P.dark.accent}; --accent-ink:${P.dark.accentInk}; } }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 ui-sans-serif,system-ui,sans-serif; }
  button,input,select { font:inherit; }
  button,a { -webkit-tap-highlight-color:transparent; }
  button:focus-visible,a:focus-visible,input:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  .sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
  /* The page's own display rules (.round is a grid, .more a block) outrank the
     browser's rule for [hidden], so without this nothing the script hides —
     the viewer's download button on a portfolio link, the pick heart, Load
     more — would actually disappear. */
  [hidden] { display:none !important; }
  @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation:none!important; transition:none!important; } }
`;

const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';

export function renderLinkUnavailable(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Link unavailable</title><style>${PAGE_STYLE}
  main{min-height:100dvh;display:grid;place-items:center;padding:32px}.empty{text-align:center;max-width:34rem}.mark{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 22px;border-radius:22px;background:color-mix(in srgb,var(--line) 72%,transparent)}.mark svg{width:27px;fill:none;stroke:var(--muted);stroke-width:1.5}h1{margin:0;font-size:25px;letter-spacing:-.035em}p{margin:12px auto 0;color:var(--muted);max-width:42ch}footer{margin-top:30px;color:var(--muted);font-size:12px}
  </style></head><body><main><div class="empty"><div class="mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z"/></svg></div><h1>This link is no longer available</h1><p>It may have been turned off or replaced. Ask the person who shared it for an up-to-date link.</p><footer>Shared with Virgo</footer></div></main></body></html>`;
}

function bytesLabel(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / 1024 ** 2;
  if (mb < 1) return '<1 MB';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/**
 * What a client opens.
 *
 * Chapters when the album has sections, the album under the days it was
 * taken — in the order the day went, first frame first — and a heart on every
 * photograph and film so the client can say which ones they want. Picks are
 * saved as they are made; "Send" tells the photographer they are done, and
 * the picks can be downloaded on their own rather than as the whole album.
 */
export function renderClientGallery(view: PublicAlbumView, token: string, nonce: string): string {
  const hasSections = view.sections.length > 0;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(view.album.name)}</title><style>
${PAGE_STYLE}
  .shell{max-width:1440px;margin:0 auto;padding:16px 16px 120px}
  .hero{padding:6px;border-radius:30px;background:var(--panel);box-shadow:0 28px 80px -48px rgba(62,39,26,.72)}
  .hero-in{padding:28px 22px;border:1px solid rgba(255,255,255,.08);border-radius:25px;background:radial-gradient(circle at 78% 20%,rgba(193,119,69,.16),transparent 34%),var(--panel);color:var(--panel-ink)}
  .eyebrow{margin:0;color:var(--panel-accent);font:10px/1.2 ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase}
  .hero h1{max-width:880px;margin:12px 0 0;font:400 clamp(36px,6.4vw,68px)/.98 ui-serif,Georgia,serif;letter-spacing:-.03em}
  .desc{max-width:62ch;margin:16px 0 0;color:var(--panel-muted)}
  .summary{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;margin-top:24px;color:var(--panel-muted);font:12px ui-monospace,monospace}
  .actions{display:flex;flex-wrap:wrap;gap:8px}
  .grab{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.22);color:var(--panel-ink);text-decoration:none;font:600 13px ui-sans-serif,system-ui,sans-serif}
  .grab.primary{border-color:transparent;background:var(--panel-accent);color:${P.panel}}
  .grab:hover{background:rgba(255,255,255,.08)}.grab.primary:hover{filter:brightness(1.06);background:var(--panel-accent)}
  .grab svg,.icon svg{width:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
  .chapters{display:flex;gap:4px;margin-top:22px;border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none}
  .chapter{position:relative;display:flex;align-items:center;gap:8px;min-height:50px;padding:0 16px;border:0;background:none;color:var(--muted);font-weight:500;white-space:nowrap;cursor:pointer}
  .chapter b{font:500 11px ui-monospace,monospace;color:var(--muted)}
  .chapter[aria-current="true"]{color:var(--ink);font-weight:650}
  .chapter[aria-current="true"]::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;border-radius:2px;background:var(--accent)}
  .bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px}
  .seg{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:color-mix(in srgb,var(--line) 55%,transparent)}
  .seg button{display:flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border:0;border-radius:9px;background:none;color:var(--muted);cursor:pointer}
  .seg button b{font:500 11px ui-monospace,monospace}
  .seg button[aria-selected="true"]{background:var(--paper);color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.12)}
  .spacer{flex:1}
  .toggle{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:none;color:var(--ink);cursor:pointer}
  .toggle[aria-pressed="true"]{border-color:transparent;background:var(--accent);color:var(--accent-ink)}
  .toggle svg{width:15px}
  .room{padding-top:8px}
  .day{margin-top:26px}.day h2{margin:0;font-size:17px;letter-spacing:-.02em}.day p{margin:2px 0 12px;color:var(--muted);font:12px ui-monospace,monospace}
  .grid{columns:2;column-gap:8px}
  .tile{position:relative;margin:0 0 8px;break-inside:avoid;border-radius:14px;overflow:hidden;background:var(--line) center/cover}
  .open{display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in}
  .open img{display:block;width:100%;height:auto;min-height:90px;object-fit:cover}
  .tile.film .open{cursor:pointer}
  .badge{position:absolute;left:10px;bottom:10px;display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;background:rgba(20,18,16,.74);color:#fff;font:11px ui-monospace,monospace;pointer-events:none}
  .heart{position:absolute;top:8px;right:8px;display:grid;width:38px;height:38px;place-items:center;border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#3b322c;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2)}
  .heart svg{width:18px;fill:none;stroke:currentColor;stroke-width:1.9}
  .heart[aria-pressed="true"]{background:#fff;color:${P.light.accent}}.heart[aria-pressed="true"] svg{fill:currentColor}
  .tile.picked{outline:3px solid var(--accent);outline-offset:-3px}
  .tracks{margin:8px 0 0;padding:0;list-style:none}
  .track{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:14px;width:100%;padding:14px 2px;border:0;border-top:1px solid var(--line);background:none;color:var(--ink);text-align:left;cursor:pointer}
  .track .play{display:grid;width:40px;height:40px;place-items:center;border-radius:50%;background:color-mix(in srgb,var(--line) 78%,transparent);color:var(--ink)}
  .track strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.track small{color:var(--muted)}.track time{color:var(--muted);font:12px ui-monospace,monospace}
  .note{padding:70px 20px;text-align:center;color:var(--muted)}
  .note button{margin-top:14px}
  .more{display:block;min-height:44px;margin:30px auto 0;padding:0 20px;border:1px solid var(--line);border-radius:999px;background:none;color:var(--ink);cursor:pointer}
  .overlay{position:fixed;z-index:60;inset:0;display:none;min-height:100dvh;background:#141210;color:#fff}.overlay.open{display:flex;flex-direction:column}
  .vbar{display:flex;align-items:center;gap:8px;padding:12px}.vtitle{min-width:0;flex:1}.vtitle strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.vtitle small{color:rgba(255,255,255,.74);font:11px ui-monospace,monospace}
  .round{display:grid;width:44px;height:44px;padding:0;place-items:center;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;text-decoration:none}
  .round svg{width:18px;fill:none;stroke:currentColor;stroke-width:1.8}
  .round[aria-pressed="true"]{background:#fff;color:${P.light.accent}}.round[aria-pressed="true"] svg{fill:currentColor}
  .stage{position:relative;display:grid;min-height:0;flex:1;place-items:center;overflow:hidden}
  .stage img{max-width:100%;max-height:100%;object-fit:contain;transform:translate3d(var(--x,0),var(--y,0),0) scale(var(--scale,1));transition:transform .36s cubic-bezier(.16,1,.3,1)}
  .stage.drag img{transition:none}.nav{position:absolute;top:50%;transform:translateY(-50%)}.prev{left:14px}.next{right:14px}
  .video{max-width:100%;max-height:100%;background:#141210}
  .dock{position:fixed;z-index:45;right:12px;bottom:12px;left:12px;display:none;max-width:920px;margin:auto;padding:6px;border-radius:24px;background:rgba(27,24,22,.97);color:#fff;box-shadow:0 24px 70px -28px rgba(58,38,27,.8)}
  .dock.open{display:block}.has-picks .dock{bottom:88px}
  .dock-in{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:19px}
  .dock-meta{min-width:0}.dock-meta strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dock-meta small{color:rgba(255,255,255,.74)}
  .range{width:100%;accent-color:${P.panelAccent}}
  .picks{position:fixed;z-index:50;left:50%;bottom:16px;display:none;align-items:center;gap:12px;max-width:calc(100vw - 24px);padding:9px 10px 9px 18px;border-radius:999px;background:var(--panel);color:#fff;box-shadow:0 22px 60px -24px rgba(40,24,16,.7);transform:translateX(-50%)}
  .picks.show{display:flex}
  .picks .count{display:flex;align-items:center;gap:8px;font-weight:600;white-space:nowrap}
  .picks .count b{display:grid;min-width:26px;height:26px;padding:0 7px;place-items:center;border-radius:999px;background:var(--panel-accent);color:${P.panel};font:600 12px ui-monospace,monospace}
  .picks a,.picks button{display:inline-flex;align-items:center;min-height:38px;padding:0 15px;border:0;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font:500 13px ui-sans-serif,system-ui,sans-serif;text-decoration:none;white-space:nowrap;cursor:pointer}
  .picks .send{background:var(--panel-accent);color:${P.panel};font-weight:650}
  .picks .sent{color:var(--panel-muted);font-size:12px;white-space:nowrap}
  @media(min-width:640px){.shell{padding:26px 26px 120px}.hero-in{padding:40px}.grid{columns:3;column-gap:10px}.tile{margin-bottom:10px}}
  @media(min-width:1000px){.grid{columns:4}.hero-in{padding:52px}}
  @media(min-width:1300px){.grid{columns:5}}
  @media(max-width:520px){.picks{gap:8px;padding-left:12px}.picks .dl-label{display:none}.picks .sent{display:none}}
</style></head><body>
<div class="shell">
  <header class="hero"><div class="hero-in">
    <p class="eyebrow">${view.downloads ? 'Private delivery' : 'Portfolio'}</p>
    <h1>${esc(view.album.name)}</h1>
    ${view.album.description ? `<p class="desc">${esc(view.album.description)}</p>` : ''}
    <div class="summary">
      <span>${view.total} item${view.total === 1 ? '' : 's'}${view.downloads ? ` · ${bytesLabel(view.totalBytes)}` : ''}</span>
      <span class="actions">${view.downloads && view.total > 0 ? `<a class="grab" href="/s/${esc(token)}/download.zip">${DOWNLOAD_ICON}Download all</a>` : ''}</span>
    </div>
  </div></header>
  ${hasSections ? '<nav id="chapters" class="chapters" aria-label="Chapters"></nav>' : ''}
  <div class="bar"><div id="kinds" class="seg" role="tablist" aria-label="Show"></div><span class="spacer"></span><button id="mine" class="toggle" type="button" aria-pressed="false" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6C19 15.4 12 20 12 20z"/></svg><span id="mineLabel">My picks</span></button></div>
  <main id="room" class="room" aria-live="polite" aria-busy="false"></main>
  <div id="sentinel" aria-hidden="true"></div>
  <button id="more" class="more" type="button" hidden>Load more</button>
</div>
<p id="live" class="sr" aria-live="polite"></p>
<div id="picks" class="picks" role="region" aria-label="Your picks"><span class="count"><b id="pickCount">0</b><span>picked</span></span><a id="pickZip" href="/s/${esc(token)}/picks.zip">${DOWNLOAD_ICON.replace('<svg', '<svg width="16"')}<span class="dl-label">&nbsp;Download</span></a><button id="send" class="send" type="button">Send to photographer</button><span id="sent" class="sent"></span></div>
<div id="viewer" class="overlay" role="dialog" aria-modal="true" aria-label="Photo viewer"><div class="vbar"><button id="viewerClose" class="round" aria-label="Close">&#10005;</button><div class="vtitle"><strong id="viewerName"></strong><small id="viewerCount"></small></div><button id="zoomOut" class="round" aria-label="Zoom out">&#8722;</button><button id="zoomIn" class="round" aria-label="Zoom in">+</button><button id="viewerPick" class="round" aria-pressed="false" aria-label="Pick this photo" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6C19 15.4 12 20 12 20z"/></svg></button><a id="viewerDownload" class="round" aria-label="Download">${DOWNLOAD_ICON}</a></div><div id="photoStage" class="stage"><button id="photoPrev" class="round nav prev" aria-label="Previous">&#8592;</button><img id="viewerImage" alt=""><button id="photoNext" class="round nav next" aria-label="Next">&#8594;</button></div></div>
<div id="videoViewer" class="overlay" role="dialog" aria-modal="true" aria-label="Video player"><div class="vbar"><button id="videoClose" class="round" aria-label="Close">&#10005;</button><div class="vtitle"><strong id="videoName"></strong><small id="videoMeta"></small></div><a id="videoDownload" class="round" aria-label="Download">${DOWNLOAD_ICON}</a></div><div class="stage"><video id="video" class="video" controls playsinline></video></div></div>
<div id="dock" class="dock"><div class="dock-in"><button id="audioToggle" class="round" aria-label="Play">&#9654;</button><div class="dock-meta"><strong id="audioName"></strong><small id="audioClock">0:00 / 0:00</small><input id="audioRange" class="range" type="range" min="0" max="0" step=".1" value="0" aria-label="Audio position"></div><button id="audioNext" class="round" aria-label="Next track">&#9197;</button></div><audio id="audio"></audio></div>
<script nonce="${esc(nonce)}">
(() => {
  'use strict';
  const initial = ${safeJson(view)};
  const token = ${safeJson(token)};
  const base = '/s/' + encodeURIComponent(token);
  const HEART = 'M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6C19 15.4 12 20 12 20z';
  const el = (id) => document.getElementById(id);
  const room = el('room');
  const state = { section: null, kind: 'all', picked: false, files: initial.files, cursor: initial.nextCursor, counts: initial.counts, loading: false, failed: false, seq: 0 };
  const picks = { enabled: !!initial.picks.enabled, count: initial.picks.count || 0, sentAt: initial.picks.sentAt, keys: new Set() };
  initial.files.forEach((file) => { if (file.picked) picks.keys.add(file.id); });
  let photoList = [], photoIndex = 0, scale = 1, offsetX = 0, offsetY = 0, drag = null, audioList = [], audioIndex = -1;

  const kindOf = (file) => (file.contentType || '').split('/')[0];
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (seconds) => { seconds = Number.isFinite(seconds) ? Math.floor(seconds) : 0; const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = pad(seconds % 60); return h ? h + ':' + pad(m) + ':' + s : m + ':' + s; };
  const duration = (ms) => (ms ? clock(ms / 1000) : '');
  const say = (text) => { el('live').textContent = ''; setTimeout(() => { el('live').textContent = text; }, 30); };

  // The same days the app shows — mirrors lib/media-days.ts. A capture time is
  // the camera's wall clock and is read as written, never through a Date.
  const WALL = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})/;
  function dayKey(file) {
    const m = file.takenAt ? WALL.exec(file.takenAt) : null;
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    const d = new Date(file.createdAt);
    if (Number.isNaN(d.getTime())) return 'undated';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function dayTitle(key) {
    const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(key);
    if (!m) return 'Undated';
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const now = new Date();
    const opts = { weekday: 'long', day: 'numeric', month: 'long' };
    if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return date.toLocaleDateString('en-GB', opts);
  }
  function span(files) {
    const times = files.map((f) => { const m = f.takenAt ? WALL.exec(f.takenAt) : null; return m ? m[4] + ':' + m[5] : null; }).filter(Boolean).sort();
    return times.length > 1 && times[0] !== times[times.length - 1] ? times[0] + ' – ' + times[times.length - 1] : null;
  }

  function node(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; }
  function svgHeart() { const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); const path = document.createElementNS(ns, 'path'); path.setAttribute('d', HEART); svg.append(path); return svg; }

  // ── Chapters, kinds and "my picks" ──────────────────────────────────────
  function renderChapters() {
    const nav = el('chapters');
    if (!nav) return;
    nav.replaceChildren();
    const all = [{ id: null, name: 'Everything', count: initial.total }].concat(initial.sections);
    all.forEach((chapter) => {
      const b = node('button', 'chapter'); b.type = 'button';
      b.append(node('span', '', chapter.name), node('b', '', String(chapter.count)));
      if (state.section === chapter.id) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => { if (state.section === chapter.id) return; state.section = chapter.id; renderChapters(); load(true); });
      nav.append(b);
    });
  }
  function renderKinds() {
    const bar = el('kinds'); bar.replaceChildren();
    const kinds = initial.kinds.filter((k) => (initial.counts[k] || 0) > 0);
    const options = (kinds.length > 1 ? ['all'] : []).concat(kinds);
    bar.hidden = options.length < 2;
    const labels = { all: 'All', image: 'Photos', video: 'Films', audio: 'Audio' };
    options.forEach((kind) => {
      const b = node('button'); b.type = 'button'; b.setAttribute('role', 'tab');
      const n = kind === 'all' ? (state.counts.image || 0) + (state.counts.video || 0) + (state.counts.audio || 0) : state.counts[kind] || 0;
      b.append(node('span', '', labels[kind]), node('b', '', String(n)));
      b.setAttribute('aria-selected', String(state.kind === kind));
      b.addEventListener('click', () => { if (state.kind === kind) return; state.kind = kind; load(true); });
      bar.append(b);
    });
    if (options.length === 1) state.kind = options[0];
  }
  const mine = el('mine');
  if (picks.enabled) {
    mine.hidden = false;
    mine.addEventListener('click', () => { state.picked = !state.picked; mine.setAttribute('aria-pressed', String(state.picked)); load(true); });
  }

  // ── Loading ────────────────────────────────────────────────────────────
  function query(cursor) {
    const p = new URLSearchParams();
    if (state.section) p.set('section', state.section);
    if (state.kind !== 'all') p.set('kind', state.kind);
    if (state.picked) p.set('picked', 'true');
    p.set('limit', '60');
    if (cursor) p.set('cursor', cursor);
    return base + '/data?' + p.toString();
  }
  // Every change of chapter, kind or picks asks the server for exactly that,
  // so the Films tab of a long album shows its films instead of "none yet"
  // while they sit on later pages of photographs.
  async function load(reset) {
    const seq = ++state.seq;
    if (reset) { state.files = []; state.cursor = null; }
    state.loading = true; state.failed = false; render();
    try {
      const response = await fetch(query(reset ? null : state.cursor), { credentials: 'omit' });
      if (!response.ok) throw new Error('load');
      const page = await response.json();
      if (seq !== state.seq) return;
      state.files = reset ? page.files : state.files.concat(page.files);
      state.cursor = page.nextCursor;
      state.counts = page.counts;
      page.files.forEach((file) => { if (file.picked) picks.keys.add(file.id); });
      picks.count = page.picks.count;
    } catch (error) {
      if (seq === state.seq) state.failed = true;
    } finally {
      if (seq === state.seq) { state.loading = false; renderKinds(); render(); renderPicks(); }
    }
  }
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && state.cursor && !state.loading && !state.failed) load(false);
  }, { rootMargin: '900px 0px' }).observe(el('sentinel'));
  el('more').addEventListener('click', () => load(false));

  // ── The room ───────────────────────────────────────────────────────────
  function heartButton(file) {
    const b = node('button', 'heart'); b.type = 'button';
    const on = picks.keys.has(file.id);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', (on ? 'Remove from picks: ' : 'Pick: ') + file.originalName);
    b.append(svgHeart());
    b.addEventListener('click', (event) => { event.stopPropagation(); togglePick(file); });
    return b;
  }
  function tile(file, list) {
    const film = kindOf(file) === 'video';
    const t = node('div', 'tile' + (film ? ' film' : '') + (picks.keys.has(file.id) ? ' picked' : ''));
    if (file.blurDataUrl) t.style.backgroundImage = 'url("' + file.blurDataUrl + '")';
    const open = node('button', 'open'); open.type = 'button';
    open.setAttribute('aria-label', (film ? 'Play ' : 'View ') + file.originalName);
    const img = document.createElement('img');
    img.src = (film ? file.posterUrl : file.thumbUrl || file.url) || '';
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    if (file.width && file.height) img.style.aspectRatio = file.width + '/' + file.height; else if (film) img.style.aspectRatio = '16/9';
    open.append(img);
    open.addEventListener('click', () => (film ? openVideo(file) : openPhoto(list.filter((f) => kindOf(f) === 'image'), file)));
    t.append(open);
    if (film) { const badge = node('span', 'badge', '▶ ' + (file.processingStatus === 'pending' ? 'Preparing' : duration(file.durationMs))); t.append(badge); }
    if (picks.enabled) t.append(heartButton(file));
    return t;
  }
  function render() {
    room.replaceChildren();
    room.setAttribute('aria-busy', String(state.loading));
    const visual = state.files.filter((f) => ['image', 'video'].includes(kindOf(f)));
    const sound = state.files.filter((f) => kindOf(f) === 'audio');
    if (!state.files.length) {
      const note = node('div', 'note');
      if (state.loading) note.textContent = 'Loading…';
      else if (state.failed) { note.textContent = 'This could not be loaded. Your connection may have dropped.'; const retry = node('button', 'more', 'Try again'); retry.type = 'button'; retry.addEventListener('click', () => load(true)); note.append(retry); }
      else if (state.picked) note.textContent = 'Nothing picked yet. Tap the heart on any photo or film you want.';
      else if (state.section) note.textContent = 'Nothing in this chapter' + (state.kind === 'all' ? '.' : ' of that kind.');
      else note.textContent = 'Nothing has been shared here yet.';
      room.append(note);
    }
    // Consecutive days, in the order the server sent them: the story order.
    const days = [];
    visual.forEach((file) => { const key = dayKey(file); const last = days[days.length - 1]; if (last && last.key === key) last.files.push(file); else days.push({ key: key, files: [file] }); });
    days.forEach((day) => {
      const section = node('section', 'day');
      const heading = node('h2', '', dayTitle(day.key));
      const s = span(day.files);
      section.append(heading, node('p', '', day.files.length + ' item' + (day.files.length === 1 ? '' : 's') + (s ? ' · ' + s : '')));
      const grid = node('div', 'grid');
      day.files.forEach((file) => grid.append(tile(file, visual)));
      section.append(grid);
      room.append(section);
    });
    if (sound.length) {
      audioList = sound;
      const section = node('section', 'day');
      section.append(node('h2', '', 'Recordings'), node('p', '', sound.length + ' file' + (sound.length === 1 ? '' : 's')));
      const list = node('ol', 'tracks');
      sound.forEach((file, index) => {
        const li = document.createElement('li');
        const b = node('button', 'track'); b.type = 'button'; b.setAttribute('aria-label', 'Play ' + (file.mediaTitle || file.originalName));
        const play = node('span', 'play', audioIndex === index && !el('audio').paused ? 'Ⅱ' : '▶');
        const text = document.createElement('span');
        text.append(node('strong', '', file.mediaTitle || file.originalName), node('small', '', file.mediaArtist || dayTitle(dayKey(file))));
        b.append(play, text, node('time', '', duration(file.durationMs)));
        b.addEventListener('click', () => playAudio(index));
        li.append(b); list.append(li);
      });
      section.append(list);
      room.append(section);
    }
    el('more').hidden = !state.cursor || state.loading;
  }

  // ── Picks ──────────────────────────────────────────────────────────────
  async function togglePick(file) {
    const was = picks.keys.has(file.id);
    const next = !was;
    // Shown at once, taken back if the server says no: a tap that waits a
    // round trip for its heart to fill feels broken on mobile data.
    if (next) picks.keys.add(file.id); else picks.keys.delete(file.id);
    picks.count += next ? 1 : -1;
    render(); renderPicks(); syncViewerPick();
    try {
      const response = await fetch(base + '/picks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ id: file.id, picked: next }) });
      if (!response.ok) throw new Error('pick');
      const result = await response.json();
      picks.count = result.count;
      say(next ? 'Picked. ' + result.count + ' picked in all.' : 'Removed. ' + result.count + ' picked in all.');
    } catch (error) {
      if (was) picks.keys.add(file.id); else picks.keys.delete(file.id);
      picks.count += next ? -1 : 1;
      say('That did not save. Check your connection and try again.');
    }
    if (state.picked && !next) state.files = state.files.filter((f) => f.id !== file.id);
    render(); renderPicks(); syncViewerPick();
  }
  function renderPicks() {
    const bar = el('picks');
    const show = picks.enabled && picks.count > 0;
    bar.classList.toggle('show', show);
    document.body.classList.toggle('has-picks', show);
    el('pickCount').textContent = String(picks.count);
    el('mineLabel').textContent = picks.count > 0 ? 'My picks · ' + picks.count : 'My picks';
    el('sent').textContent = picks.sentAt ? 'Sent ' + new Date(picks.sentAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
    el('send').textContent = picks.sentAt ? 'Send again' : 'Send to photographer';
  }
  el('send').addEventListener('click', async () => {
    const button = el('send'); button.disabled = true;
    try {
      const response = await fetch(base + '/picks/send', { method: 'POST', credentials: 'omit' });
      if (!response.ok) throw new Error('send');
      const result = await response.json();
      picks.sentAt = result.sentAt;
      say('Sent. Your photographer has your ' + result.count + ' picks.');
    } catch (error) {
      say('That did not send. Your picks are saved — try again in a moment.');
    } finally { button.disabled = false; renderPicks(); }
  });

  // ── Viewer ─────────────────────────────────────────────────────────────
  function applyPhoto() { const image = el('viewerImage'); image.style.setProperty('--scale', String(scale)); image.style.setProperty('--x', offsetX + 'px'); image.style.setProperty('--y', offsetY + 'px'); }
  function resetPhoto() { scale = 1; offsetX = 0; offsetY = 0; applyPhoto(); }
  function syncViewerPick() { const b = el('viewerPick'); const file = photoList[photoIndex]; if (!picks.enabled || !file) { b.hidden = true; return; } b.hidden = false; const on = picks.keys.has(file.id); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Remove from picks' : 'Pick this photo'); }
  function showPhoto() {
    const file = photoList[photoIndex]; if (!file) return;
    resetPhoto();
    const shown = el('viewerImage');
    const sources = file.displaySources || [];
    if (sources.length) { shown.srcset = sources.map((s) => s.url + ' ' + s.width + 'w').join(', '); shown.sizes = '100vw'; shown.src = sources[sources.length - 1].url; }
    else { shown.removeAttribute('srcset'); shown.removeAttribute('sizes'); shown.src = file.url || ''; }
    shown.alt = file.originalName;
    el('viewerName').textContent = file.originalName;
    el('viewerCount').textContent = (photoIndex + 1) + ' / ' + photoList.length;
    // No download on a link that offers none, rather than one that opens the rendition.
    el('viewerDownload').hidden = !file.downloadUrl;
    el('viewerDownload').href = file.downloadUrl || file.url || '';
    syncViewerPick();
  }
  function openPhoto(list, file) { photoList = list; photoIndex = Math.max(0, list.indexOf(file)); showPhoto(); el('viewer').classList.add('open'); document.body.style.overflow = 'hidden'; el('viewerClose').focus(); }
  function closePhoto() { el('viewer').classList.remove('open'); document.body.style.overflow = ''; }
  function stepPhoto(by) { if (scale > 1 || !photoList.length) return; photoIndex = (photoIndex + by + photoList.length) % photoList.length; showPhoto(); }
  el('viewerClose').addEventListener('click', closePhoto);
  el('photoPrev').addEventListener('click', () => stepPhoto(-1));
  el('photoNext').addEventListener('click', () => stepPhoto(1));
  el('viewerPick').addEventListener('click', () => { const file = photoList[photoIndex]; if (file) togglePick(file); });
  el('zoomIn').addEventListener('click', () => { scale = Math.min(4, scale + 0.5); applyPhoto(); });
  el('zoomOut').addEventListener('click', () => { scale = Math.max(1, scale - 0.5); if (scale === 1) { offsetX = 0; offsetY = 0; } applyPhoto(); });
  el('viewerImage').addEventListener('dblclick', () => { scale = scale > 1 ? 1 : 2; if (scale === 1) { offsetX = 0; offsetY = 0; } applyPhoto(); });
  el('photoStage').addEventListener('wheel', (event) => { event.preventDefault(); scale = Math.max(1, Math.min(4, scale + (event.deltaY < 0 ? 0.25 : -0.25))); if (scale === 1) { offsetX = 0; offsetY = 0; } applyPhoto(); }, { passive: false });
  el('photoStage').addEventListener('pointerdown', (event) => { if (scale <= 1) return; drag = { x: event.clientX, y: event.clientY, ox: offsetX, oy: offsetY }; el('photoStage').setPointerCapture(event.pointerId); el('photoStage').classList.add('drag'); });
  el('photoStage').addEventListener('pointermove', (event) => { if (!drag) return; offsetX = drag.ox + event.clientX - drag.x; offsetY = drag.oy + event.clientY - drag.y; applyPhoto(); });
  el('photoStage').addEventListener('pointerup', () => { drag = null; el('photoStage').classList.remove('drag'); });

  function openVideo(file) {
    const video = el('video'); video.replaceChildren();
    if (file.hlsUrl) { const s = document.createElement('source'); s.src = file.hlsUrl; s.type = 'application/vnd.apple.mpegurl'; video.append(s); }
    if (file.proxyUrl) { const s = document.createElement('source'); s.src = file.proxyUrl; s.type = 'video/mp4'; video.append(s); }
    else { const s = document.createElement('source'); s.src = file.url || ''; s.type = file.contentType || 'video/mp4'; video.append(s); if (file.contentType === 'video/quicktime') { const f = document.createElement('source'); f.src = file.url || ''; f.type = 'video/mp4'; video.append(f); } }
    video.poster = file.posterUrl || '';
    el('videoName').textContent = file.originalName;
    el('videoMeta').textContent = duration(file.durationMs);
    el('videoDownload').hidden = !file.downloadUrl;
    el('videoDownload').href = file.downloadUrl || file.url || '';
    el('videoViewer').classList.add('open'); document.body.style.overflow = 'hidden';
    video.load(); video.play().catch(() => {});
  }
  function closeVideo() { el('video').pause(); el('videoViewer').classList.remove('open'); document.body.style.overflow = ''; }
  el('videoClose').addEventListener('click', closeVideo);

  // ── Audio ──────────────────────────────────────────────────────────────
  const audio = el('audio');
  function playAudio(index) {
    const file = audioList[index]; if (!file) return;
    if (audioIndex !== index) { audioIndex = index; audio.src = file.url || ''; el('audioName').textContent = file.mediaTitle || file.originalName; el('dock').classList.add('open'); }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: file.mediaTitle || file.originalName, artist: file.mediaArtist || undefined, album: initial.album.name });
  }
  el('audioToggle').addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  el('audioNext').addEventListener('click', () => { if (audioList.length) playAudio((audioIndex + 1) % audioList.length); });
  audio.addEventListener('play', () => { el('audioToggle').textContent = 'Ⅱ'; el('audioToggle').setAttribute('aria-label', 'Pause'); render(); });
  audio.addEventListener('pause', () => { el('audioToggle').textContent = '▶'; el('audioToggle').setAttribute('aria-label', 'Play'); render(); });
  audio.addEventListener('ended', () => { if (audioList.length > 1) playAudio((audioIndex + 1) % audioList.length); });
  audio.addEventListener('durationchange', () => { el('audioRange').max = String(audio.duration || 0); });
  audio.addEventListener('timeupdate', () => { el('audioRange').value = String(audio.currentTime); el('audioClock').textContent = clock(audio.currentTime) + ' / ' + clock(audio.duration); });
  el('audioRange').addEventListener('input', (event) => { audio.currentTime = Number(event.target.value); });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closePhoto(); closeVideo(); }
    if (!el('viewer').classList.contains('open')) return;
    if (event.key === 'ArrowLeft') stepPhoto(-1);
    if (event.key === 'ArrowRight') stepPhoto(1);
    if (event.key === '+') { scale = Math.min(4, scale + 0.5); applyPhoto(); }
    if (event.key === '-') { scale = Math.max(1, scale - 0.5); applyPhoto(); }
    if (event.key === '0') resetPhoto();
    if ((event.key === 'p' || event.key === 'P') && picks.enabled) { const file = photoList[photoIndex]; if (file) togglePick(file); }
  });

  renderChapters(); renderKinds(); render(); renderPicks();
})();
</script></body></html>`;
}
