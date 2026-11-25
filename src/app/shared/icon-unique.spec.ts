import { ICONS } from './icon';

describe('icons', () => {
  // One look, one meaning: two names drawing the same glyph would show people the same icon for two different things.
  it('draw every name with a glyph of its own', () => {
    const byGlyph = new Map<string, string[]>();
    for (const [name, node] of Object.entries(ICONS)) {
      const key = JSON.stringify(node);
      byGlyph.set(key, [...(byGlyph.get(key) ?? []), name]);
    }
    const shared = [...byGlyph.values()].filter((names) => names.length > 1);
    expect(shared).toEqual([]);
  });
});
