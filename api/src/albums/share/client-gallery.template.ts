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

/**
 * The page a client sees when they open a share link.
 *
 * Self-contained: no external CSS, fonts or scripts, so it renders on a hotel
 * wifi and cannot leak the viewer to a third party. Media is served from the
 * CDN, which is the only outbound request the page makes.
 */
export function renderClientGallery(view: PublicAlbumView): string {
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

  const tiles = images
    .filter((f) => f.url)
    .map(
      (f) =>
        `<a class="tile" href="${esc(f.url!)}" target="_blank" rel="noopener noreferrer">` +
        `<img src="${esc(f.url!)}" alt="" loading="lazy"></a>`,
    )
    .join('');

  const videoBlocks = videos
    .filter((f) => f.url)
    .map(
      (f) =>
        `<video class="video" controls preload="metadata" src="${esc(f.url!)}"></video>`,
    )
    .join('');

  const audioBlocks = audio
    .filter((f) => f.url)
    .map(
      (f) => `<audio class="audio" controls preload="none" src="${esc(f.url!)}"></audio>`,
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
  :root { color-scheme: light dark; --bg:#FFF8F4; --fg:#1E1B18; --muted:#847167; --card:#fff; --line:#F0E8E2; --accent:#B66A40; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#161311; --fg:#F2EDE8; --muted:#948278; --card:#1E1B18; --line:#2A2522; --accent:#C17745; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  header { padding:32px 20px 20px; max-width:1100px; margin:0 auto; }
  h1 { margin:0; font-size:28px; letter-spacing:-0.02em; }
  .meta { color:var(--muted); font-size:14px; margin-top:6px; }
  .desc { color:var(--muted); font-size:15px; margin-top:12px; max-width:60ch; }
  main { max-width:1100px; margin:0 auto; padding:0 20px 64px; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:2px; color:var(--muted); margin:32px 0 12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:6px; }
  .tile { display:block; aspect-ratio:1; overflow:hidden; border-radius:6px; background:var(--line); }
  .tile img { width:100%; height:100%; object-fit:cover; display:block; }
  .video, .audio { width:100%; margin-bottom:10px; border-radius:8px; background:#000; }
  .audio { background:var(--card); }
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
