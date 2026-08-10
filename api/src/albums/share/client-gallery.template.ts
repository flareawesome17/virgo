import type { PublicAlbumView } from './album-share.service';

/**
 * Escapes text destined for HTML.
 *
 * The album name and description are user-supplied and land in the markup, so
 * they are escaped rather than interpolated raw — otherwise a photographer
 * could script the page their own client opens.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Palette and base rules, shared so both pages look like the same product. */
const PAGE_STYLE = `
  :root { color-scheme: light dark; --bg:#FFF8F4; --fg:#1E1B18; --muted:#847167; --card:#fff; --line:#F0E8E2; --accent:#B66A40; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#161311; --fg:#F2EDE8; --muted:#948278; --card:#1E1B18; --line:#2A2522; --accent:#C17745; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
`;

/**
 * Shown when a token is unknown, revoked or expired.
 *
 * This route sets Content-Type: text/html, so letting Nest's exception filter
 * handle it served a JSON body under an HTML header — the client saw a raw
 * `{"message":...,"statusCode":403}` blob rendered as a page.
 *
 * Deliberately says nothing about which of the three it was: distinguishing
 * "never existed" from "revoked" would confirm to a stranger which tokens are
 * real.
 */
export function renderLinkUnavailable(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Link unavailable</title>
<style>
${PAGE_STYLE}
  main { min-height:100vh; display:flex; flex-direction:column; align-items:center;
         justify-content:center; text-align:center; padding:32px 24px; }
  .mark { width:56px; height:56px; border-radius:16px; background:var(--line);
          display:flex; align-items:center; justify-content:center; margin-bottom:20px; }
  .mark svg { width:26px; height:26px; stroke:var(--muted); fill:none;
              stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
  h1 { margin:0; font-size:22px; letter-spacing:-0.01em; }
  p { color:var(--muted); font-size:15px; margin:10px 0 0; max-width:38ch; }
  footer { color:var(--muted); font-size:12px; margin-top:28px; }
</style>
</head>
<body>
<main>
  <div class="mark">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z"/>
    </svg>
  </div>
  <h1>This link is no longer available</h1>
  <p>
    It may have been turned off by the person who shared it, or replaced with a
    newer one. Ask them for an up-to-date link.
  </p>
  <footer>Shared with Virgo</footer>
</main>
</body>
</html>`;
}

/**
 * The page a client sees when they open a share link.
 *
 * Self-contained: no external CSS, fonts or scripts, so it renders on a hotel
 * wifi and cannot leak the viewer to a third party. Media is served from the
 * CDN, which is the only outbound request the page makes.
 */
/** "1.4 GB", for the download button to be honest about what it will cost. */
function bytesLabel(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / 1024 ** 2;
  if (mb < 1) return '<1 MB';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** An inline download glyph. No icon font, no request. */
const DL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';

export function renderClientGallery(view: PublicAlbumView, token: string): string {
  // `view.files` is already filtered to the link's scope by the query, so a
  // section can only be non-empty if the link included that kind. Checking
  // `kinds` as well keeps an in-scope but empty section from disappearing
  // silently — the caption below says what the link covers.
  const has = (kind: string) => view.kinds.includes(kind as never);
  const images = has('image')
    ? view.files.filter((f) => f.contentType?.startsWith('image/'))
    : [];
  const videos = has('video')
    ? view.files.filter((f) => f.contentType?.startsWith('video/'))
    : [];
  const audio = has('audio')
    ? view.files.filter((f) => f.contentType?.startsWith('audio/'))
    : [];

  /**
   * A tile renders from the thumbnail and links to the original.
   *
   * The grid used to draw straight from the originals — 160px squares backed
   * by 5 MB photographs, so a 200-image delivery pulled about a gigabyte
   * before the client had looked at anything. `thumbUrl` is null for images
   * uploaded before thumbnails existed, or ones sharp could not decode, so
   * the original stays the fallback rather than the default.
   *
   * No width/height attributes: thumbnails keep their aspect ratio, so any
   * fixed pair would be a lie for every photograph that is not square. The
   * tile's own `aspect-ratio:1` is what reserves the space, so there is no
   * layout shift to prevent.
   */
  const tiles = images
    .filter((f) => f.url)
    .map(
      (f) =>
        `<figure class="tile">` +
        `<a href="${esc(f.url!)}" target="_blank" rel="noopener noreferrer">` +
        `<img src="${esc(f.thumbUrl ?? f.url!)}" alt="" loading="lazy" ` +
        `decoding="async"></a>` +
        (f.downloadUrl
          ? `<a class="tiledl" href="${esc(f.downloadUrl)}" ` +
            `aria-label="Download ${esc(f.downloadName)}">${DL_ICON}</a>`
          : '') +
        `</figure>`,
    )
    .join('');

  /**
   * A video with layered fallbacks.
   *
   * `video/quicktime` (.mov, straight off an iPhone) is the common case and
   * only Safari will play it — Chrome, Firefox and Edge reject the type
   * outright, which showed as a dead player next to working photos.
   *
   * A .mov is usually H.264 in an ISO-BMFF container, which those browsers can
   * decode perfectly well; they simply refuse based on the declared type. So
   * the same URL is offered a second time as video/mp4, which they will
   * attempt. HEVC recordings still cannot be decoded anywhere but Safari, so
   * the element also carries a download link as its final fallback — a client
   * can always get the file even when nothing can play it inline.
   */
  const videoBlock = (f: {
    url: string | null;
    downloadUrl: string | null;
    contentType: string | null;
  }) => {
    const url = esc(f.url!);
    const declared = f.contentType ?? 'video/mp4';
    const alternates =
      declared === 'video/quicktime' ? [declared, 'video/mp4'] : [declared];
    const sources = alternates
      .map((t) => `<source src="${url}" type="${esc(t)}">`)
      .join('');

    return (
      `<div class="videowrap">` +
      `<video class="video" controls playsinline preload="metadata">${sources}` +
      `<p class="fallback">This video cannot be played in this browser.</p>` +
      `</video>` +
      // The signed URL, not the display one. `download` alone does nothing
      // across origins; the disposition is baked into this signature.
      (f.downloadUrl
        ? `<a class="dl" href="${esc(f.downloadUrl)}">${DL_ICON}Download video</a>`
        : '') +
      `</div>`
    );
  };

  const videoBlocks = videos.filter((f) => f.url).map(videoBlock).join('');

  const audioBlocks = audio
    .filter((f) => f.url)
    .map(
      (f) =>
        `<div class="audiowrap">` +
        `<audio class="audio" controls preload="none" src="${esc(f.url!)}"></audio>` +
        (f.downloadUrl
          ? `<a class="dl" href="${esc(f.downloadUrl)}">${DL_ICON}Download audio</a>`
          : '') +
        `</div>`,
    )
    .join('');

  const count = view.files.length;
  const isEmpty = count === 0;

  // Says what the link covers, so a photos-only link does not read as an album
  // that happens to contain no video.
  const KIND_LABEL: Record<string, string> = {
    image: 'photos',
    video: 'videos',
    audio: 'audio',
  };
  const scoped = view.kinds.length < 3;
  const scopeNote = scoped
    ? view.kinds.map((k) => KIND_LABEL[k] ?? k).join(' and ')
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(view.album.name)}</title>
<style>
${PAGE_STYLE}
  header { padding:32px 20px 20px; max-width:1100px; margin:0 auto; }
  h1 { margin:0; font-size:28px; letter-spacing:-0.02em; }
  .meta { color:var(--muted); font-size:14px; margin-top:6px; }
  .desc { color:var(--muted); font-size:15px; margin-top:12px; max-width:60ch; }
  main { max-width:1100px; margin:0 auto; padding:0 20px 64px; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:2px; color:var(--muted); margin:32px 0 12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:6px; }
  .tile { position:relative; margin:0; aspect-ratio:1; overflow:hidden; border-radius:6px; background:var(--line); }
  .tile img { width:100%; height:100%; object-fit:cover; display:block; }
  /* The per-photo download. Always visible on touch, where there is no hover
     to reveal it — a control a phone user cannot discover is not a control. */
  .tiledl { position:absolute; right:6px; bottom:6px; width:34px; height:34px;
            display:flex; align-items:center; justify-content:center;
            border-radius:8px; background:rgba(0,0,0,.55); backdrop-filter:blur(4px);
            opacity:0; transition:opacity .15s; }
  .tiledl svg { width:17px; height:17px; stroke:#fff; fill:none; stroke-width:2;
                stroke-linecap:round; stroke-linejoin:round; }
  .tile:hover .tiledl, .tiledl:focus-visible { opacity:1; }
  @media (hover:none) { .tiledl { opacity:1; } }
  .video, .audio { width:100%; border-radius:8px; background:#000; display:block; }
  .audio { background:var(--card); margin-bottom:10px; }
  .videowrap { margin-bottom:18px; }
  .fallback { color:#fff; text-align:center; padding:28px 16px; margin:0; font-size:14px; }
  .dl { display:inline-flex; align-items:center; gap:6px; margin-top:8px; min-height:44px;
        font-size:13px; color:var(--accent); text-decoration:none; }
  .dl svg { width:15px; height:15px; stroke:currentColor; fill:none; stroke-width:2;
            stroke-linecap:round; stroke-linejoin:round; }
  .audiowrap { margin-bottom:18px; }
  /* Download all. The one control a client is looking for, so it sits in the
     header rather than at the bottom of a gallery they have to scroll past. */
  .grab { display:inline-flex; align-items:center; gap:8px; margin-top:16px;
          min-height:44px; padding:0 18px; border-radius:10px; background:var(--accent);
          color:#fff; font-size:14px; font-weight:600; text-decoration:none; }
  .grab svg { width:17px; height:17px; stroke:currentColor; fill:none; stroke-width:2;
              stroke-linecap:round; stroke-linejoin:round; }
  .grabnote { color:var(--muted); font-size:12px; margin:8px 0 0; }
  .empty { color:var(--muted); text-align:center; padding:64px 20px; }
  footer { text-align:center; color:var(--muted); font-size:12px; padding:0 20px 40px; }
</style>
</head>
<body>
<header>
  <h1>${esc(view.album.name)}</h1>
  <div class="meta">${count} item${count === 1 ? '' : 's'}${
    scoped ? ` &middot; ${esc(scopeNote)} only` : ''
  }</div>
  ${view.album.description ? `<p class="desc">${esc(view.album.description)}</p>` : ''}
  ${
    isEmpty
      ? ''
      : `<a class="grab" href="/s/${esc(token)}/download.zip">${DL_ICON}` +
        `Download all &middot; ${bytesLabel(view.totalBytes)}</a>` +
        `<p class="grabnote">One zip file. Large albums take a while to ` +
        `start — leave the tab open.</p>`
  }
</header>
<main>
  ${isEmpty ? '<div class="empty">Nothing has been shared here yet.</div>' : ''}
  ${images.length ? `<h2>Photos</h2><div class="grid">${tiles}</div>` : ''}
  ${videos.length ? `<h2>Videos</h2>${videoBlocks}` : ''}
  ${audio.length ? `<h2>Audio</h2>${audioBlocks}` : ''}
</main>
<footer>Shared with Virgo</footer>
</body>
</html>`;
}
