import { BoardDoc } from './board-doc';
import { DIAGRAM_STARTERS, diagramTitle } from './diagram';
import { boardMarkdown } from './export';

describe('diagrams', () => {
  it('go on the board from their text, change as one undoable step, and are found by it', () => {
    const board = new BoardDoc();
    const id = board.addDiagram(100, 100, DIAGRAM_STARTERS.flowchart);
    expect(board.items()).toEqual([expect.objectContaining({ id, kind: 'diagram', source: DIAGRAM_STARTERS.flowchart, w: 480, h: 360 })]);
    board.setDiagram(id, 'flowchart LR\n  a --> b');
    expect(board.items()[0]).toMatchObject({ source: 'flowchart LR\n  a --> b' });
    board.undo.undo();
    expect(board.items()[0]).toMatchObject({ source: DIAGRAM_STARTERS.flowchart });
  });

  it('are named by their first node or participant', () => {
    expect(diagramTitle(DIAGRAM_STARTERS.flowchart)).toBe('flowchart from “Idea”');
    expect(diagramTitle(DIAGRAM_STARTERS.sequence)).toBe('sequence diagram from “You”');
    expect(diagramTitle('flowchart TD')).toBe('flowchart');
  });

  it('go into the Markdown export as mermaid blocks', () => {
    const board = new BoardDoc();
    board.addDiagram(0, 0, 'flowchart TD\n  a --> b');
    expect(boardMarkdown(board, 'Plan')).toContain('## Diagrams\n\n```mermaid\nflowchart TD\n  a --> b\n```\n');
  });
});
