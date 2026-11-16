import { BoardDoc, NOTE_SIZE } from './board-doc';
import { noteLines } from './tasks';

describe('a saved template placed on a board', () => {
  it('writes its notes as they were saved, at their size, and drops what the editor cannot show', () => {
    const board = new BoardDoc();
    board.addLayout(
      {
        notes: [
          {
            text: 'Ship it',
            rich: [
              { n: 'bulletList', c: [{ n: 'listItem', c: [{ n: 'paragraph', c: [{ t: [{ insert: 'Ship it', attributes: { bold: {} } }] }] }] }] },
              { n: 'mathBlock', a: { latex: 'E=mc^2' } },
              { n: 'script', c: [{ t: [{ insert: 'alert(1)' }] }] },
            ],
            x: 0,
            y: 0,
            w: 320,
            h: 240,
          },
          { text: 'Plain', x: 400, y: 0 },
        ],
      },
      0,
      0,
    );
    const [rich, plain] = [...board.notes()].sort((a, b) => a.x - b.x);
    expect([rich.w, rich.h]).toEqual([320, 240]);
    expect([plain.w, plain.h]).toEqual([NOTE_SIZE.w, NOTE_SIZE.h]);
    expect(noteLines(rich.text).map((l) => l.text)).toEqual(['• Ship it', '$$E=mc^2$$']);
    expect(noteLines(rich.text)[0].bold).toBe(true);
    expect(noteLines(plain.text).map((l) => l.text)).toEqual(['Plain']);
    board.destroy();
  });
});
