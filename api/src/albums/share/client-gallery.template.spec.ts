import { renderClientGallery } from './client-gallery.template';
import type { PublicAlbumView } from './album-share.service';

const view: PublicAlbumView = {
  album: { name: 'Reyes <script>alert(1)</script>', description: 'Private & ready' },
  kinds: ['image', 'video', 'audio'],
  total: 1,
  totalBytes: 1024,
  nextCursor: null,
  counts: { image: 1, video: 0, audio: 0 },
  files: [{
    url: 'https://media.example/photo.jpg',
    thumbUrl: 'https://media.example/photo-thumb.webp',
    posterUrl: null,
    proxyUrl: null,
    downloadUrl: 'https://media.example/download',
    downloadName: 'Album - 001.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 1024,
    originalName: 'IMG_1042.jpg',
    width: 2000,
    height: 3000,
    durationMs: null,
    mediaTitle: null,
    mediaArtist: null,
    processingStatus: 'ready',
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
});
