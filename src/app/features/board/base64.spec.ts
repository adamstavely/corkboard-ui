import { fromBase64, toBase64 } from './base64';

describe('base64', () => {
  it('round-trips every byte value, across chunk boundaries', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, i) => i % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('handles empty input', () => {
    expect(toBase64(new Uint8Array())).toBe('');
    expect(fromBase64('')).toEqual(new Uint8Array());
  });
});
