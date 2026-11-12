import { edited } from './edited';

describe('edited', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const ago = (ms: number) => edited(new Date(now.getTime() - ms), now);

  it('says how long ago, in the largest unit that fits', () => {
    expect(ago(10_000)).toBe('Edited just now');
    expect(ago(5 * 60_000)).toBe('Edited 5 minutes ago');
    expect(ago(3 * 3_600_000)).toBe('Edited 3 hours ago');
    expect(ago(24 * 3_600_000)).toBe('Edited yesterday');
    expect(ago(14 * 24 * 3_600_000)).toBe('Edited 2 weeks ago');
  });

  it('gives the date once it is more than a few weeks back', () => {
    expect(ago(90 * 24 * 3_600_000)).toMatch(/^Edited .*2026$/);
  });
});
