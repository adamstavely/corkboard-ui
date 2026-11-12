import * as Y from 'yjs';
import { BoardDoc, NOTE_SIZE } from './board-doc';

describe('BoardDoc', () => {
  let board: BoardDoc;

  beforeEach(() => {
    board = new BoardDoc();
  });
  afterEach(() => board.destroy());

  it('adds notes centred on a point, each above the last', () => {
    const a = board.addNote(100, 100);
    const b = board.addNote(300, 100, 'pink');
    expect(board.notes().map((n) => n.id)).toEqual([a, b]);
    expect(board.notes()[0]).toMatchObject({ x: 100 - NOTE_SIZE.w / 2, y: 100 - NOTE_SIZE.h / 2, color: 'yellow' });
    expect(board.notes()[1].color).toBe('pink');
    expect(board.notes()[1].z).toBeGreaterThan(board.notes()[0].z);
  });

  it('moves, recolours and removes several notes at once', () => {
    const a = board.addNote(0, 0);
    const b = board.addNote(0, 0);
    const c = board.addNote(0, 0);
    board.move([a, b], 10, -5);
    board.setColor([b, c], 'green');
    board.remove([c]);
    const [na, nb] = board.notes();
    expect(board.notes()).toHaveLength(2);
    expect([na.x - nb.x, na.y]).toEqual([0, -NOTE_SIZE.h / 2 - 5]);
    expect([na.color, nb.color]).toEqual(['yellow', 'green']);
  });

  it('brings notes to the front, keeping their order among themselves', () => {
    const [a, b, c] = [board.addNote(0, 0), board.addNote(0, 0), board.addNote(0, 0)];
    board.bringToFront([a, b]);
    expect(board.notes().map((n) => n.id)).toEqual([c, a, b]);
  });

  it("doesn't rebuild the list when only a note's text changes", () => {
    board.addNote(0, 0);
    const before = board.notes();
    const text = before[0].text;
    text.insert(0, [new Y.XmlElement('paragraph')]);
    expect(board.notes()).toBe(before);
  });

  it('undoes adding, recolouring and deleting as separate steps', () => {
    const a = board.addNote(0, 0);
    board.setColor([a], 'blue');
    board.remove([a]);
    board.undo.undo();
    expect(board.notes()[0]?.color).toBe('blue');
    board.undo.undo();
    expect(board.notes()[0]?.color).toBe('yellow');
    board.undo.undo();
    expect(board.notes()).toEqual([]);
  });

  it("round-trips through an encoded update, text included, without making the load undoable", () => {
    const a = board.addNote(50, 50, 'purple');
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText('Hello')]);
    board.notes()[0].text.insert(0, [p]);

    const copy = new BoardDoc();
    copy.apply(board.encode());
    expect(copy.notes()).toHaveLength(1);
    expect(copy.notes()[0]).toMatchObject({ id: a, color: 'purple' });
    expect(copy.notes()[0].text.toString()).toBe('<paragraph>Hello</paragraph>');
    expect(copy.undo.canUndo()).toBe(false);
    copy.destroy();
  });
});
