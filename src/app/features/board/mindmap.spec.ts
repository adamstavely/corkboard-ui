import { BoardDoc, NOTE_SIZE } from './board-doc';
import { MIND_GAP, mindLayout } from './mindmap';

describe('mind maps', () => {
  let board: BoardDoc;
  beforeEach(() => (board = new BoardDoc()));
  afterEach(() => board.destroy());
  const note = (id: string) => board.notes().find((n) => n.id === id)!;

  it('grows branches to the right of the root, centred on it, joined by curved arrows, in one undo each', () => {
    const root = board.startMindMap(0, 0, 'Launch');
    const a = board.addMindChild(root, 'Marketing')!;
    const b = board.addMindChild(root, 'Engineering')!;
    const r = note(root);
    // Both a column to the right, stacked and centred on the root.
    expect(note(a).x).toBe(r.x + NOTE_SIZE.w + MIND_GAP.x);
    expect(note(b).y - note(a).y).toBe(NOTE_SIZE.h + MIND_GAP.y);
    expect((note(a).y + note(b).y + NOTE_SIZE.h) / 2).toBeCloseTo(r.y + r.h / 2, 0);
    expect(board.connectors().map((c) => [c.from, c.to, c.route])).toEqual([
      [root, a, 'curve'],
      [root, b, 'curve'],
    ]);
    board.undo.undo();
    expect(board.notes().map((n) => n.id).sort()).toEqual([a, root].sort());
  });

  it('adds a sibling right after a branch, and folds a branch away and back', () => {
    const root = board.startMindMap(0, 0);
    const a = board.addMindChild(root)!;
    const c = board.addMindChild(root)!;
    const b = board.addMindSibling(a)!;
    expect([a, b, c].map((id) => note(id).y)).toEqual([...[a, b, c].map((id) => note(id).y)].sort((x, y) => x - y));
    const deep = board.addMindChild(a)!;
    board.toggleMindFold(a);
    expect(board.hiddenNotes().has(deep)).toBe(true);
    expect(note(a).mind?.collapsed).toBe(true);
    // A new branch on a folded note opens it.
    board.addMindChild(a);
    expect(board.hiddenNotes().has(deep)).toBe(false);
  });

  it('makes a map of loose notes around the one nearest their middle', () => {
    const top = board.addNote(0, -400, 'yellow', 'Top');
    const middle = board.addNote(0, 0, 'yellow', 'Middle');
    const bottom = board.addNote(0, 400, 'yellow', 'Bottom');
    expect(board.makeMindMap([top, middle, bottom])).toBe(middle);
    expect([note(top).mind?.parent, note(bottom).mind?.parent]).toEqual([middle, middle]);
    expect(note(top).y).toBeLessThan(note(bottom).y);
  });

  it('lays a deep tree out with no overlaps', () => {
    const boxes = [
      { id: 'r', x: 0, y: 0, w: 200, h: 160, mind: { root: 'r', parent: null, order: 0 } },
      ...['a', 'b'].map((id, order) => ({ id, x: 0, y: 0, w: 200, h: 160, mind: { root: 'r', parent: 'r', order } })),
      ...['a1', 'a2', 'a3'].map((id, order) => ({ id, x: 0, y: 0, w: 200, h: 160, mind: { root: 'r', parent: 'a', order } })),
    ];
    const at = mindLayout(boxes, 'r');
    const ys = ['a1', 'a2', 'a3', 'b'].map((id) => at.get(id)!.y);
    // a's three branches take the room; b sits below them, not on top.
    expect(at.get('b')!.y).toBeGreaterThan(at.get('a')!.y);
    expect(new Set(ys).size).toBe(4);
    expect(at.get('a1')!.x).toBe(2 * (200 + MIND_GAP.x));
  });
});
