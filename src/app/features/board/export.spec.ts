import * as Y from 'yjs';
import { BoardDoc } from './board-doc';
import { noteLines } from './tasks';
import { arrowLines, boardBounds, boardBoxes, boardMarkdown, dashPattern, fileName } from './export';

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

  it('runs arrows straight, at right angles or curved, keeping their weight and dashes', () => {
    const board = new BoardDoc();
    const a = board.addNote(100, 100);
    const b = board.addNote(600, 300);
    const arrow = board.connect(a, b, { route: 'elbow', dash: 'dashed', weight: 4 })!;
    let [line] = arrowLines(board);
    // Out of the right side, across, down, across into the left side.
    expect(line.d).toMatch(/^M 200 100 H 350 V 300 H 500$/);
    expect(line.angle).toBe(0);
    expect(line.style).toEqual({ route: 'elbow', dash: 'dashed', weight: 4 });
    expect(dashPattern(line.style)).toEqual([16, 12]);

    board.setArrowStyle([arrow], { route: 'curve', dash: 'dotted' });
    [line] = arrowLines(board);
    expect(line.d).toMatch(/^M 200 100 C /);
    expect(board.connectors()[0]).toMatchObject({ route: 'curve', dash: 'dotted', weight: 4 });
    board.destroy();
  });

  it('reads an arrow with no style, or a bad one, as a plain 2px straight line', () => {
    const board = new BoardDoc();
    const a = board.addNote(100, 100);
    const b = board.addNote(600, 100);
    const arrow = board.connect(a, b)!;
    board.setArrowStyle([arrow], { weight: 99, route: 'zigzag' as never });
    expect(board.connectors()[0]).toMatchObject({ route: 'straight', dash: 'solid', weight: 2 });
    board.destroy();
  });

  it('keeps bullet and numbered lists in notes, nested too, in Markdown and wherever note text is read', () => {
    const board = new BoardDoc();
    const id = board.addNote(100, 100);
    const text = board.notes().find((n) => n.id === id)!.text;
    const para = (t: string) => {
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText(t)]);
      return p;
    };
    const item = (...children: Y.XmlElement[]) => {
      const li = new Y.XmlElement('listItem');
      li.insert(0, children);
      return li;
    };
    const list = (kind: 'bulletList' | 'orderedList', ...items: Y.XmlElement[]) => {
      const l = new Y.XmlElement(kind);
      l.insert(0, items);
      return l;
    };
    board.doc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, [
        para('Risks'),
        list('bulletList', item(para('Critical list item')), item(para('Second'), list('orderedList', item(para('Step one')), item(para('Step two'))))),
      ]);
    });
    expect(noteLines(text).map((l) => l.text)).toEqual(['Risks', '• Critical list item', '• Second', '  1. Step one', '  2. Step two']);
    expect(boardMarkdown(board, 'Plan')).toContain('- Risks\n  - Critical list item\n  - Second\n    1. Step one\n    2. Step two');
    board.destroy();
  });

  it('names files after the board', () => {
    expect(fileName('Sprint 12: retro!')).toBe('sprint-12-retro');
    expect(fileName('???')).toBe('board');
  });
});
