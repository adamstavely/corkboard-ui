import * as Y from 'yjs';
import { BoardDoc } from './board-doc';
import { arrowLines, boardBounds, boardBoxes, boardMarkdown, fileName } from './export';

describe('export', () => {
  it('writes the board as Markdown: frames as headings, notes as bullets, bold kept', () => {
    const board = new BoardDoc();
    const a = board.addNote(100, 100, 'yellow', 'Deploys are slow');
    board.addNote(100, 300, 'yellow', 'Owner\nCache the build');
    board.addFrame(0, 0, board.notes(), 'Delivery');
    board.addNote(2000, 2000, 'blue', 'Loose');
    // Make the second note's first line bold, as the model writes owners.
    const second = board.notes()[1].text.get(0) as Y.XmlElement;
    (second.get(0) as Y.XmlText).format(0, 5, { bold: true });
    expect(boardMarkdown(board, 'Retro')).toBe('# Retro\n\n## Delivery\n\n- Deploys are slow\n- **Owner** — Cache the build\n\n## Other notes\n\n- Loose\n');
    expect(boardBounds(board)).toMatchObject({ x: expect.any(Number), w: expect.any(Number) });
    expect(a).toBeTruthy();
    // Frames inside frames go a level deeper; an empty frame is just its heading.
    board.addFrame(0, 0, board.frames(), 'Plan');
    expect(boardMarkdown(board, 'Retro')).toContain('## Plan\n\n### Delivery\n\n- Deploys are slow');
    board.destroy();
  });

  it("counts images and files in the bounds, so an image-only board isn't empty", () => {
    const board = new BoardDoc();
    expect(boardBounds(board)).toBeNull();
    board.addMedia({ id: 'f1', name: 'photo.png', mime: 'image/png', size: 10 }, 3000, 3000, { w: 200, h: 100 });
    expect(boardBounds(board, 0)).toEqual({ x: 2900, y: 2950, w: 200, h: 100 });
    expect(boardBoxes(board)).toHaveLength(1);
    board.destroy();
  });

  it('draws arrows from edge to edge', () => {
    const board = new BoardDoc();
    const a = board.addNote(100, 100);
    const b = board.addNote(600, 100);
    board.connect(a, b);
    const [line] = arrowLines(board);
    const [na, nb] = board.notes();
    expect(line.start).toEqual({ x: na.x + na.w, y: 100 });
    expect(line.end).toEqual({ x: nb.x, y: 100 });
    board.destroy();
  });

  it('draws arrows between shapes and images too', () => {
    const board = new BoardDoc();
    const shape = board.addShape(100, 100);
    const image = board.addMedia({ id: 'f1', name: 'photo.png', mime: 'image/png', size: 10 }, 600, 100, { w: 200, h: 100 });
    board.connect(shape, image);
    expect(arrowLines(board)).toHaveLength(1);
    board.destroy();
  });

  it('names files after the board', () => {
    expect(fileName('Sprint 12: retro!')).toBe('sprint-12-retro');
    expect(fileName('???')).toBe('board');
  });
});
