import * as Y from 'yjs';
import { BoardDoc } from './board-doc';
import { actionItemNotes, fromTask, ownerAndText, TaskFeed, toTask, type StoredTask } from './tasks';

/** A note's text the way Tiptap stores it, with `**x**` lines bold. */
function fragmentOf(board: BoardDoc, id: string, lines: string[]): void {
  const fragment = board.notes().find((n) => n.id === id)!.text;
  board.doc.transact(() => {
    fragment.delete(0, fragment.length);
    fragment.insert(
      0,
      lines.map((line) => {
        const p = new Y.XmlElement('paragraph');
        const bold = /^\*\*(.+)\*\*$/.exec(line);
        const t = new Y.XmlText();
        t.insert(0, bold ? bold[1] : line, bold ? { bold: true } : undefined);
        p.insert(0, [t]);
        return p;
      }),
    );
  });
}

describe('tasks', () => {
  it('reads a bold first line as who a note is for', () => {
    const board = new BoardDoc();
    const a = board.addNote(0, 0);
    fragmentOf(board, a, ['**Ada**', 'Cache the build', 'in CI']);
    const b = board.addNote(300, 0);
    fragmentOf(board, b, ['Book a pairing rota']);
    expect(ownerAndText(board.notes()[0].text)).toEqual({ owner: 'Ada', text: 'Cache the build in CI' });
    expect(ownerAndText(board.notes()[1].text)).toEqual({ text: 'Book a pairing rota' });
    board.destroy();
  });

  it("finds the action items: notes in an Action items frame, or the ones you give it", () => {
    const board = new BoardDoc();
    const inside = board.addNote(100, 100);
    board.addNote(2000, 2000);
    board.addFrame(0, 0, [board.notes()[0]], 'Action items');
    expect(actionItemNotes(board).map((n) => n.id)).toEqual([inside]);
    expect(actionItemNotes(board, ['x']).map((n) => n.id)).toEqual([]);
    board.destroy();
  });

  it('numbers new tasks and keeps the note they came from through edits on the task board', () => {
    const doc = new Y.Doc();
    const feed = new TaskFeed(doc);
    const [t1, t2] = feed.add([
      { title: 'Cache the build', status: 'todo', priority: 0, labels: [], noteId: 'n1' },
      { title: 'Book a rota', status: 'todo', priority: 0, labels: [] },
    ]);
    expect([t1.key, t2.key]).toEqual(['T-1', 'T-2']);
    expect(feed.nextKey()).toBe('T-3');

    const now = Date.parse('2026-11-13T12:00:00Z');
    const stored: StoredTask = { ...t1, due: '2026-11-16' };
    const shown = toTask(stored, now);
    expect(shown.dueIn).toBe(3);
    const back = fromTask({ ...shown, status: 'done', dueIn: 1 }, stored, now);
    expect(back).toMatchObject({ status: 'done', due: '2026-11-14', noteId: 'n1', created: t1.created });
    feed.put(back);
    expect(feed.tasks().find((t) => t.id === t1.id)?.status).toBe('done');
    feed.remove(t2.id);
    expect(feed.tasks().map((t) => t.key)).toEqual(['T-1']);
    feed.destroy();
  });
});
