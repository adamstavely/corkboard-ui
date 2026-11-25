import { BoardDoc } from '../board-doc';
import { diagramFrame } from './flow-board';
import { C4_STARTER, diagramLayout, diagramText, USECASE_STARTER } from './kinds';
import { replaceDiagram, setUsecaseRelation, usecaseArrow } from './text-edit';

function place(board: BoardDoc, text: string): string {
  const result = diagramLayout(text);
  if ('error' in result) throw new Error(result.error);
  return board.addLayout(result.layout, 0, 0).find((id) => diagramFrame(board, id))!;
}

describe('editing a diagram as its text', () => {
  it('draws a flowchart again from changed text, where it was', () => {
    const board = new BoardDoc();
    const id = place(board, 'flowchart LR\n  a["Check order"] --> b["Ship order"]');
    const before = diagramFrame(board, id)!;
    const result = replaceDiagram(
      board,
      id,
      'flowchart LR\n  a["Check order"] --> b["Ship order"] --> c["Invoice"]',
    );
    expect('id' in result).toBe(true);
    if (!('id' in result)) return;
    expect(board.frames().some((f) => f.id === id)).toBe(false);
    const now = diagramFrame(board, result.id)!;
    expect({ x: now.x, y: now.y }).toEqual({ x: before.x, y: before.y });
    expect(diagramText(board, result.id)).toContain('Invoice');
    // Nothing of the old one is left.
    expect(board.items().filter((i) => i.part?.of === id)).toEqual([]);
  });

  it('round-trips a C4 diagram, and keeps a diagram its own kind', () => {
    const board = new BoardDoc();
    const id = place(board, C4_STARTER);
    const text = diagramText(board, id)!;
    const result = replaceDiagram(board, id, text.replace('Web App', 'Storefront'));
    expect('id' in result && diagramText(board, result.id)).toContain('Storefront');
    if (!('id' in result)) return;
    expect(replaceDiagram(board, result.id, 'flowchart LR\n  a --> b')).toEqual({
      error: expect.stringMatching(/stays a C4 diagram/),
    });
    expect(replaceDiagram(board, result.id, '   ')).toEqual({ error: expect.any(String) });
  });

  it("changes what a use case diagram's arrow means", () => {
    const board = new BoardDoc();
    const id = place(board, USECASE_STARTER);
    const steps = board.items().filter((i) => i.part?.of === id && i.part.type === 'usecase');
    const arrow = board.connect(steps[0].id, steps[1].id, {
      route: 'curve',
      dash: 'solid',
      start: 'none',
      end: 'none',
    })!;
    expect(usecaseArrow(board, arrow)?.relation).toBe('association');
    setUsecaseRelation(board, arrow, 'include');
    expect(usecaseArrow(board, arrow)?.relation).toBe('include');
    expect(board.connectors().find((c) => c.id === arrow)).toMatchObject({
      dash: 'dashed',
      end: 'arrow',
      label: '«include»',
    });
    setUsecaseRelation(board, arrow, 'extend');
    expect(diagramText(board, id)).toMatch(/extend/);
    setUsecaseRelation(board, arrow, 'parent');
    expect(board.connectors().find((c) => c.id === arrow)).toMatchObject({
      dash: 'solid',
      end: 'triangle',
      label: '',
    });
  });
});
