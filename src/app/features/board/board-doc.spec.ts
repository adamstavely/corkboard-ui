import { computed } from '@angular/core';
import * as Y from 'yjs';
import { plainText } from './comments';
import { noteLines } from './tasks';
import { BoardDoc, FRAME_MIN, FRAME_PADDING, FRAME_SIZE, FRAME_TITLE, NOTE_SIZE } from './board-doc';

describe('BoardDoc', () => {
  let board: BoardDoc;

  beforeEach(() => {
    board = new BoardDoc();
  });
  afterEach(() => board.destroy());

  it('reruns anything derived from note text when the text changes, here or from someone else', () => {
    board.addNote(0, 0, 'yellow', 'Before');
    const label = computed(() => plainText(board.notes()[0].text));
    const lines = computed(() => noteLines(board.notes()[0].text).map((l) => l.text));
    expect(label()).toBe('Before');
    expect(lines()).toEqual(['Before']);

    // A remote edit: the same change made in another copy of the document.
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(board.doc));
    const before = Y.encodeStateVector(other);
    const text = ((other.getMap<Y.Map<unknown>>('nodes').values().next().value!.get('text') as Y.XmlFragment).get(0) as Y.XmlElement).get(0) as Y.XmlText;
    text.delete(0, 6);
    text.insert(0, 'After');
    Y.applyUpdate(board.doc, Y.encodeStateAsUpdate(other, before));
    expect(label()).toBe('After');
    expect(lines()).toEqual(['After']);
  });

  it('duplicates things with their text and the arrows between them, and adds a note beside another', () => {
    const a = board.addNote(100, 100, 'pink', 'Original');
    const b = board.addNote(400, 100);
    board.connect(a, b);
    const [ca, cb] = board.duplicate([a, b], 24, 24);
    const copy = board.notes().find((n) => n.id === ca)!;
    expect(copy).toMatchObject({ color: 'pink', x: board.notes().find((n) => n.id === a)!.x + 24 });
    expect(copy.text.toString()).toContain('Original');
    expect(board.connectors().some((c) => c.from === ca && c.to === cb)).toBe(true);

    const right = board.addNoteNext(a, 'right')!;
    const original = board.notes().find((n) => n.id === a)!;
    expect(board.notes().find((n) => n.id === right)).toMatchObject({ x: original.x + original.w + 24, y: original.y, color: 'pink' });
  });

  it('locks and unlocks things, and keeps frames in the order set for the outline', () => {
    const a = board.addNote(0, 0);
    board.setLocked([a], true);
    expect(board.locked().has(a)).toBe(true);
    board.setLocked([a], false);
    expect(board.locked().size).toBe(0);

    const top = board.addFrame(0, 0, [], 'Top');
    const bottom = board.addFrame(0, 1000, [], 'Bottom');
    expect(board.outline().map((f) => f.title)).toEqual(['Top', 'Bottom']);
    board.setFrameOrder([bottom, top]);
    expect(board.outline().map((f) => f.title)).toEqual(['Bottom', 'Top']);
  });

  it('adds notes centred on a point, each above the last', () => {
    const a = board.addNote(100, 100);
    const b = board.addNote(300, 100, 'pink');
    expect(board.notes().map((n) => n.id)).toEqual([a, b]);
    expect(board.notes()[0]).toMatchObject({ x: 100 - NOTE_SIZE.w / 2, y: 100 - NOTE_SIZE.h / 2, color: 'yellow' });
    expect(board.notes()[1].color).toBe('pink');
    expect(board.notes()[1].z).toBeGreaterThan(board.notes()[0].z);
  });

  it('draws arrows between notes once each, and removes them with what they join', () => {
    const a = board.addNote(0, 0);
    const b = board.addNote(300, 0);
    const c = board.addNote(600, 0);
    const ab = board.connect(a, b);
    expect(board.connect(a, b)).toBe(ab);
    expect(board.connect(a, a)).toBeNull();
    board.connect(b, c);
    expect(board.connectors().map((x) => [x.from, x.to])).toEqual([
      [a, b],
      [b, c],
    ]);
    board.remove([b]);
    expect(board.connectors()).toEqual([]);
    expect(board.notes()).toHaveLength(2);
  });

  it('places a note on the value-vs-effort matrix', () => {
    const a = board.addNote(100, 100);
    expect(board.notes()[0]).not.toHaveProperty('value');
    board.setScore(a, 8.5, 2);
    expect(board.notes()[0]).toMatchObject({ value: 8.5, effort: 2 });
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

  it('adds frames around notes or on their own, and knows which notes are in them', () => {
    const a = board.addNote(100, 100);
    const b = board.addNote(400, 300);
    const far = board.addNote(2000, 2000);
    const around = board.addFrame(0, 0, board.notes().filter((n) => n.id !== far), 'Delivery');
    const [frame] = board.frames();
    expect(frame).toMatchObject({ id: around, title: 'Delivery', x: 100 - NOTE_SIZE.w / 2 - FRAME_PADDING, y: 100 - NOTE_SIZE.h / 2 - FRAME_TITLE });
    expect(board.notesIn([around]).sort()).toEqual([a, b].sort());

    const blank = board.addFrame(1000, 1000);
    expect(board.frames().find((f) => f.id === blank)).toMatchObject({ ...FRAME_SIZE, title: 'Frame' });
    expect(board.notes()).toHaveLength(3);
  });

  it('renames and resizes frames, never below the minimum, and leaves notes alone when recolouring', () => {
    const id = board.addFrame(0, 0);
    board.renameFrame(id, 'Risks');
    // The canvas makes each resize gesture its own undo step.
    board.undo.stopCapturing();
    board.resizeFrame(id, 10, 900);
    board.undo.stopCapturing();
    expect(board.frames()[0]).toMatchObject({ title: 'Risks', w: FRAME_MIN.w, h: 900 });
    board.setColor([id], 'pink');
    expect(board.doc.getMap<Y.Map<unknown>>('nodes').get(id)!.has('color')).toBe(false);
    board.undo.undo();
    expect(board.frames()[0]).toMatchObject({ title: 'Risks', ...FRAME_SIZE });
    board.undo.undo();
    expect(board.frames()[0].title).toBe('Frame');
  });

  it('finds the frames inside a frame, as a timeline holds its columns', () => {
    const outer = board.addFrame(0, 0, [{ x: 0, y: 0, w: 1000, h: 600 }], 'Plan');
    const inner = board.addFrame(0, 0, [{ x: 100, y: 100, w: 200, h: 200 }], 'Week 1');
    const outside = board.addFrame(5000, 5000);
    expect(board.withInnerFrames([outer]).sort()).toEqual([outer, inner].sort());
    expect(board.withInnerFrames([inner])).toEqual([inner]);
    expect(board.withInnerFrames([outside])).toEqual([outside]);
  });

  it('writes text into a new note, a paragraph a line', () => {
    const id = board.addNote(0, 0, 'blue', 'Two risks\nVendor and budget');
    const note = board.notes().find((n) => n.id === id)!;
    expect(note.color).toBe('blue');
    expect(note.text.toArray().map((p) => (p as Y.XmlElement).toArray().map((t) => t.toString()).join(''))).toEqual(['Two risks', 'Vendor and budget']);
  });
});
