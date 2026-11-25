import { BoardDoc } from '../board-doc';
import { BPMN_STARTER } from './bpmn';
import { readC4 } from './c4';
import { diagramFrame } from './flow-board';
import { addLane } from './flow-edit';
import { addC4Boundary, addUsecaseBoundary } from './group-edit';
import { C4_STARTER, diagramLayout, diagramText, USECASE_STARTER } from './kinds';

function place(board: BoardDoc, text: string): string {
  const result = diagramLayout(text);
  if ('error' in result) throw new Error(result.error);
  return board.addLayout(result.layout, 0, 0).find((id) => diagramFrame(board, id))!;
}

describe('adding boundaries and lanes by hand', () => {
  it('adds a C4 software system boundary with a container in it', () => {
    const board = new BoardDoc();
    const id = place(board, C4_STARTER);
    const added = addC4Boundary(board, id, 'system')!;
    expect(added).toBeTruthy();
    const group = board.frames().find((f) => f.id === added.group)!;
    expect(group.part).toMatchObject({ of: id, role: 'group', extra: { kind: 'system' } });
    const data = readC4(board, id)!;
    const element = data.elements.find((e) => e.name === 'New container')!;
    expect(element).toMatchObject({ kind: 'container', group: group.part!.key });
    expect(data.groups.find((g) => g.id === group.part!.key)?.kind).toBe('system');
    expect(diagramText(board, id)).toContain('New container');
  });

  it('nests a boundary inside an open one', () => {
    const board = new BoardDoc();
    const id = place(board, C4_STARTER);
    const outer = addC4Boundary(board, id, 'system')!;
    const key = board.frames().find((f) => f.id === outer.group)!.part!.key;
    const inner = addC4Boundary(board, id, 'container', key)!;
    expect(board.frames().find((f) => f.id === inner.group)?.part?.extra?.['parent']).toBe(key);
    // The outer boundary keeps its own container; the inner one has its component.
    const data = readC4(board, id)!;
    expect(data.elements.find((e) => e.name === 'New container')?.group).toBe(key);
    expect(data.elements.find((e) => e.name === 'New component')?.group).toBe(
      board.frames().find((f) => f.id === inner.group)!.part!.key,
    );
  });

  it('adds a use case system boundary with a use case in it', () => {
    const board = new BoardDoc();
    const id = place(board, USECASE_STARTER);
    const added = addUsecaseBoundary(board, id)!;
    expect(board.frames().find((f) => f.id === added.group)?.part).toMatchObject({ role: 'group' });
    expect(diagramText(board, id)).toContain('New use case');
  });

  it('adds a lane to a BPMN process', () => {
    const board = new BoardDoc();
    const id = place(board, BPMN_STARTER);
    expect(addLane(board, id)).toBeTruthy();
    expect(diagramText(board, id)).toContain('New lane');
  });
});
