import { renderClientGallery } from './client-gallery.template';
import type { PublicAlbumView } from './album-share.service';

const view: PublicAlbumView = {
  album: { name: 'Reyes <script>alert(1)</script>', description: 'Private & ready' },
  kinds: ['image', 'video', 'audio'],
  sections: [{ id: 'sec-1', name: 'Ceremony <b>', count: 1 }],
  picks: { enabled: true, count: 0, sentAt: null },
  downloads: true,
  total: 1,
  totalBytes: 250 * 1024 * 1024,
  nextCursor: null,
  counts: { image: 1, video: 0, audio: 0 },
  files: [{
    id: '5b3c1c1e-6a2b-4c8e-9a51-2f6f0d0c7e11',
    url: 'https://media.example/photo.jpg',
    thumbUrl: 'https://media.example/photo-thumb.webp',
    posterUrl: null,
    proxyUrl: null,
    displaySources: [],
    hlsUrl: null,
    blurDataUrl: null,
    downloadUrl: 'https://media.example/download',
    downloadName: 'Album - 001.jpg',
    takenAt: '2026-03-14T16:42:05',
    createdAt: '2026-03-19T13:08:00.000Z',
    contentType: 'image/jpeg',
    sizeBytes: 1024,
    originalName: 'IMG_1042.jpg',
    width: 2000,
    height: 3000,
    durationMs: null,
    mediaTitle: null,
    mediaArtist: null,
    processingStatus: 'ready',
    sectionId: 'sec-1',
    picked: false,
  }],
};

describe('client gallery template', () => {
  it('uses only the supplied nonce and safely serializes user text', () => {
    const html = renderClientGallery(view, 'token-value', 'nonce-value');
    expect(html).toContain('<script nonce="nonce-value">');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Reyes &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('\\u003cscript\\u003ealert(1)\\u003c/script\\u003e');
  });

  it('does not add third-party scripts or unsafe DOM HTML writes', () => {
    const html = renderClientGallery(view, 'token-value', 'nonce-value');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toContain('innerHTML');
    expect(html).not.toContain('eval(');
  });

  it('never puts a section name into the markup, only into escaped data', () => {
    const html = renderClientGallery(view, 'token-value', 'nonce-value');
    const bs = String.fromCharCode(92);
    expect(html).not.toContain('Ceremony <b>');
    expect(html).toContain('Ceremony ' + bs + 'u003cb' + bs + 'u003e');
    expect(html).toContain('id="chapters"');
  });

  it('offers chapters only when the album has sections', () => {
    const html = renderClientGallery({ ...view, sections: [] }, 'token-value', 'nonce-value');
    expect(html).not.toContain('id="chapters"');
  });

  it('never exposes an object key, which would name the owner', () => {
    const html = renderClientGallery(view, 'token-value', 'nonce-value');
    expect(html).not.toContain('"key"');
    expect(html).not.toContain('users/');
  });

  it('wires picking to the picks endpoints, relative to the page', () => {
    const html = renderClientGallery(view, 'token-value', 'nonce-value');
    expect(html).toContain("base + '/picks'");
    expect(html).toContain("base + '/picks/send'");
    expect(html).toContain('href="/s/token-value/picks.zip"');
  });

  it('offers the whole delivery, and says how big it is, on a client link', () => {
    const html = renderClientGallery(view, 'token-value', 'nonce-value');
    expect(html).toContain('Private delivery');
    expect(html).toContain('href="/s/token-value/download.zip"');
    expect(html).toContain('250 MB');
  });

  it('offers nothing to download on a portfolio link, and no sizes', () => {
    // The gallery a public profile's album card opens: a stranger looking at
    // renditions, not a client taking delivery of files.
    const portfolio: PublicAlbumView = {
      ...view,
      picks: { enabled: false, count: 0, sentAt: null },
      downloads: false,
      totalBytes: 0,
      files: view.files.map((file) => ({ ...file, downloadUrl: null, sizeBytes: 0 })),
    };
    const html = renderClientGallery(portfolio, 'token-value', 'nonce-value');
    expect(html).toContain('<p class="eyebrow">Portfolio</p>');
    expect(html).not.toContain('Private delivery');
    expect(html).not.toContain('download.zip');
    expect(html).not.toMatch(/\d+ MB|<1 MB|\d+\.\d GB/);
    // The viewers hide their download buttons for a file with no download
    // link, and the page makes `hidden` win over the buttons' own display.
    expect(html).toContain("el('viewerDownload').hidden = !file.downloadUrl;");
    expect(html).toContain("el('videoDownload').hidden = !file.downloadUrl;");
    expect(html).toContain('[hidden] { display:none !important; }');
  });

  it('keeps secondary text on the dark panel at a readable contrast', () => {
    const html = renderClientGallery(view, 'token-value', 'nonce-value');
    // The old page drew these at 40–52% white: 3.2–4.0 : 1 on the panel.
    expect(html).not.toMatch(/rgba\(255,255,255,\.(4\d|5[0-9])\)/);
    expect(html).toContain('--panel-muted:rgba(255,255,255,0.74)');
  });
});
