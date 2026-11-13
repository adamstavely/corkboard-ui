import { fileSize, imageSize } from './file-cache';

describe('files on the board', () => {
  it('fits images within 360 by 360, keeping their shape, never tiny', () => {
    expect(imageSize(1200, 600)).toEqual({ w: 360, h: 180 });
    expect(imageSize(200, 100)).toEqual({ w: 200, h: 100 });
    expect(imageSize(4000, 10)).toEqual({ w: 360, h: 40 });
  });

  it('writes sizes for people', () => {
    expect(fileSize(2_500_000)).toBe('2.4 MB');
    expect(fileSize(34_000)).toBe('33 KB');
    expect(fileSize(10)).toBe('1 KB');
  });
});
