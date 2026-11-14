import * as Y from 'yjs';
import { BoardDoc } from './board-doc';
import { changesSince, unchanged } from './versions';

describe('comparing a version with the board now', () => {
  it('lists notes added, removed, edited and moved, and frames and files changed', () => {
    const now = new BoardDoc();
    const keep = now.addNote(0, 0, 'yellow', 'Keep');
    const edit = now.addNote(300, 0, 'yellow', 'Before');
    const gone = now.addNote(600, 0, 'yellow', 'Gone soon');
    const frame = now.addFrame(0, 0, [], 'Old title');
    const then = new BoardDoc();
    then.apply(now.encode());
    expect(unchanged(changesSince(then, now))).toBe(true);

    now.addNote(900, 0, 'blue', 'New');
    now.remove([gone]);
    const text = (now.notes().find((n) => n.id === edit)!.text.get(0) as Y.XmlElement).get(0) as Y.XmlText;
    text.delete(0, 6);
    text.insert(0, 'After');
    now.move([keep], 50, 50);
    now.renameFrame(frame, 'New title');
    now.addMedia({ id: 'f1', name: 'photo.png', mime: 'image/png', size: 1 }, 0, 0, { w: 10, h: 10 });

    expect(changesSince(then, now)).toEqual({
      added: ['New'],
      removed: ['Gone soon'],
      edited: [{ before: 'Before', after: 'After' }],
      moved: 1,
      framesAdded: [],
      framesRemoved: [],
      framesRenamed: [{ before: 'Old title', after: 'New title' }],
      mediaAdded: ['photo.png'],
      mediaRemoved: [],
    });
    now.destroy();
    then.destroy();
  });
});
