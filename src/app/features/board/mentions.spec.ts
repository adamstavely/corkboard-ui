import {
  MENTION_HIGHLIGHT,
  mentionSpans,
  paintMentions,
  pickedNames,
  plainMentions,
  shutOut,
  writeMentions,
} from './mentions';

const grace = { id: '33333333-3333-4333-8333-333333333333', name: 'Grace Hopper' };
const graceToo = { id: '55555555-5555-4555-8555-555555555555', name: 'Grace Hopper' };

describe('mentions', () => {
  it('writes each person picked as one the API can tell apart, and leaves typed ones as typed', () => {
    expect(
      writeMentions('@Grace Hopper and @Grace Hopper, over to you. @Ada?', [graceToo, grace]),
    ).toBe(`@[Grace Hopper](${graceToo.id}) and @[Grace Hopper](${grace.id}), over to you. @Ada?`);
    // Picked, then deleted from the draft: nothing to write.
    expect(writeMentions('Never mind', [grace])).toBe('Never mind');
    // Not the start of a longer word.
    expect(writeMentions('@Grace Hoppers', [grace])).toBe('@Grace Hoppers');
  });

  it('reads stored mentions back as names', () => {
    const body = `@[Grace Hopper](${grace.id}) can you check?`;
    expect(plainMentions(body)).toBe('@Grace Hopper can you check?');
    expect(pickedNames(body)).toEqual(['Grace Hopper']);
    expect(plainMentions('Plain @Grace stays')).toBe('Plain @Grace stays');
  });

  it("says who a draft names that can't open the board", () => {
    const members = [
      { userId: 'a', name: 'Ada Lovelace', role: 'owner' },
      { userId: 'l', name: 'Linus Torvalds', role: null },
      { userId: 'a2', name: 'Ada Byron', role: null },
    ];
    expect(shutOut('@Linus can you look?', members)).toEqual([{ id: 'l', name: 'Linus Torvalds' }]);
    expect(shutOut('@linus torvalds', members)).toEqual([{ id: 'l', name: 'Linus Torvalds' }]);
    // "@Ada" is the Ada who can open it; only the full name means the other.
    expect(shutOut('@Ada', members)).toEqual([]);
    expect(shutOut('@Ada Byron', members)).toEqual([{ id: 'a2', name: 'Ada Byron' }]);
    expect(shutOut('No mentions here', members)).toEqual([]);
  });

  it('finds the spans to highlight, longest name first and never overlapping', () => {
    const text = 'Thanks @Grace Hopper and @grace, not @Gracefully';
    expect(mentionSpans(text, ['Grace', 'Grace Hopper'])).toEqual([
      [7, 20],
      [25, 31],
    ]);
  });

  it('paints mentions in the thread with a CSS highlight, where the browser has them', () => {
    const highlights = new Map<string, unknown>();
    class FakeHighlight {
      readonly ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }
    const g = globalThis as unknown as { CSS?: unknown; Highlight?: unknown };
    const saved = { CSS: g.CSS, Highlight: g.Highlight };
    g.CSS = { highlights };
    g.Highlight = FakeHighlight;
    try {
      const root = document.createElement('div');
      root.innerHTML =
        '<p class="ui-ct__text">Over to @Grace Hopper</p><p class="other">@Grace Hopper</p>';
      paintMentions(root, ['Grace Hopper']);
      const painted = highlights.get(MENTION_HIGHLIGHT) as FakeHighlight;
      expect(painted.ranges.map((r) => r.toString())).toEqual(['@Grace Hopper']);
    } finally {
      g.CSS = saved.CSS;
      g.Highlight = saved.Highlight;
    }
  });
});
