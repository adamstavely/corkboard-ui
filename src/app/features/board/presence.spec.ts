import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { colorFor, Presence } from './presence';

/** Two people's awareness, wired together the way the server relays it. */
function pair() {
  const a = new Awareness(new Y.Doc());
  const b = new Awareness(new Y.Doc());
  a.on('update', ({ added, updated, removed }: Record<string, number[]>) =>
    applyAwarenessUpdate(b, encodeAwarenessUpdate(a, [...added, ...updated, ...removed]), 'a'),
  );
  b.on('update', ({ added, updated, removed }: Record<string, number[]>) =>
    applyAwarenessUpdate(a, encodeAwarenessUpdate(b, [...added, ...updated, ...removed]), 'b'),
  );
  return { a, b };
}

describe('Presence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows each person the others' pointer, selection, editing and typing, but not their own", () => {
    const { a, b } = pair();
    const ada = new Presence(a, { id: 'ada', name: 'Ada', color: colorFor('ada') });
    const grace = new Presence(b, { id: 'grace', name: 'Grace', color: colorFor('grace') });

    ada.setSelection(['n1', 'n2']);
    ada.setEditing('n1');
    ada.setPointer({ x: 10, y: 20 });
    ada.setPointer({ x: 30, y: 40 });
    vi.advanceTimersByTime(100);

    expect(ada.peers().map((p) => p.user.name)).toEqual(['Grace']);
    expect(grace.peers()).toEqual([
      {
        clientId: a.clientID,
        user: { id: 'ada', name: 'Ada', color: colorFor('ada') },
        pointer: { x: 30, y: 40 },
        selection: ['n1', 'n2'],
        editing: 'n1',
        typing: false,
        presenting: null,
      },
    ]);

    ada.setTyping(true);
    expect(grace.peers()[0].typing).toBe(true);
    ada.setPointer(null);
    expect(grace.peers()[0].pointer).toBeNull();

    ada.destroy();
    expect(grace.peers()).toEqual([]);
  });

  it('gives each person a steady colour from the palette', () => {
    expect(colorFor('ada')).toBe(colorFor('ada'));
    expect(colorFor('ada')).toMatch(/^var\(--tc-chart-[1-6]\)$/);
  });
});
