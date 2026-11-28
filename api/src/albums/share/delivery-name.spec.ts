import { deliveryName } from './album-share.service';

describe('deliveryName', () => {
  it('numbers a delivery from one, keeping the file\'s own extension', () => {
    expect(deliveryName('Reyes Wedding', 6, 'users/u/albums/2026/10/abc.JPG')).toBe('Reyes Wedding - 007.jpg');
    expect(deliveryName('Reyes Wedding', 0, 'users/u/albums/2026/10/abc.mov', 'video/quicktime')).toBe(
      'Reyes Wedding - 001.mov',
    );
  });

  it('names a HEIC stored as a JPEG .jpg, though its key still ends in .heic', () => {
    expect(deliveryName('Ana', 11, 'users/u/albums/2026/11/abc.heic', 'image/jpeg')).toBe('Ana - 012.jpg');
    expect(deliveryName('Ana', 11, 'users/u/albums/2026/11/abc.HEIF', 'image/jpeg')).toBe('Ana - 012.jpg');
  });

  it('keeps .heic for one not converted yet, which is what it still is', () => {
    expect(deliveryName('Ana', 0, 'users/u/albums/2026/11/abc.heic', 'image/heic')).toBe('Ana - 001.heic');
    expect(deliveryName('Ana', 0, 'users/u/albums/2026/11/abc.heic')).toBe('Ana - 001.heic');
  });
});
