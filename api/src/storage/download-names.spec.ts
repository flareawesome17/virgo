import { contentDisposition, safeFileStem, uniqueNames } from './download-names';

describe('uniqueNames', () => {
  it('leaves distinct names alone', () => {
    expect(uniqueNames(['a.jpg', 'b.jpg'])).toEqual(['a.jpg', 'b.jpg']);
  });

  it('numbers repeats before the extension, ignoring case', () => {
    // Two cameras both counting from DSC_0001 into one album.
    expect(uniqueNames(['DSC_0001.JPG', 'dsc_0001.jpg', 'DSC_0001.JPG'])).toEqual([
      'DSC_0001.JPG',
      'dsc_0001 (2).jpg',
      'DSC_0001 (3).JPG',
    ]);
  });

  it('steps past a real file that already has the numbered name', () => {
    expect(uniqueNames(['a.jpg', 'a (2).jpg', 'a.jpg'])).toEqual([
      'a.jpg',
      'a (2).jpg',
      'a (3).jpg',
    ]);
  });

  it('copes with names that have no extension', () => {
    expect(uniqueNames(['README', 'README'])).toEqual(['README', 'README (2)']);
  });
});

describe('safeFileStem', () => {
  it('turns path separators into dashes so a zip entry stays a file', () => {
    expect(safeFileStem('Reyes/Santos \\ Wedding')).toBe('Reyes-Santos - Wedding');
    expect(safeFileStem('   ')).toBe('Album');
  });
});

describe('contentDisposition', () => {
  it('carries accented names in filename* and a safe ASCII fallback', () => {
    const header = contentDisposition('Niño "Best" Day.zip');
    expect(header).toContain('filename="Ni_o _Best_ Day.zip"');
    expect(header).toContain("filename*=UTF-8''Ni%C3%B1o%20%22Best%22%20Day.zip");
  });

  // The grammar Backblaze enforces on the signed header: RFC 5987 value-chars.
  const EXT_VALUE = /^UTF-8''[A-Za-z0-9%!#$&+\-.^_`|~]*$/;
  const extOf = (h: string) => h.split('; filename*=')[1];

  it('percent-encodes ! \' ( ) * — the characters B2 rejected', () => {
    const ext = extOf(contentDisposition("Ana's (Copy) *1!.jpg"));
    expect(ext).toBe("UTF-8''Ana%27s%20%28Copy%29%20%2A1%21.jpg");
  });

  it('always yields a valid extended value, whatever the name', () => {
    const nasty = [
      'Reyes (2) - 001.jpg',
      "Dela Cruz's Wedding - 007.mp4",
      'A+B & C #1 @ 50% [raw] {x}; y=z, ~`^|.jpg',
      'Niño — 結婚式 😀.zip',
      'line\nbreak\r\ninjected: header.jpg',
      'tab\there.jpg',
      '😀'.repeat(41).slice(0, 81), // an emoji cut in half, as safeFileStem can
      "'''(((***)))!!!",
      '',
    ];
    for (const name of nasty) {
      const header = contentDisposition(name);
      expect(extOf(header)).toMatch(EXT_VALUE);
      expect(header).not.toMatch(/[\r\n]/);
      expect(() => decodeURIComponent(extOf(header).slice(7))).not.toThrow();
    }
  });

  it('round-trips the real name for clients that read filename*', () => {
    const name = "Ana's (Copy) — Niño 😀 *1!.jpg";
    expect(decodeURIComponent(extOf(contentDisposition(name)).slice(7))).toBe(name);
  });
});
