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
});
