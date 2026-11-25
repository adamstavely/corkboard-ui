import { BoardDoc, type Item } from '../board-doc';
import { diagramFrame } from './flow-board';
import { C4_STARTER, diagramLayout, diagramText, USECASE_STARTER } from './kinds';
import { BPMN_STARTER } from './bpmn';
import {
  addNextStep,
  bpmnMarkers,
  followC4Bracket,
  setBpmnMarker,
  setStepKind,
  stepKinds,
} from './step-kinds';

function place(board: BoardDoc, text: string): string {
  const result = diagramLayout(text);
  if ('error' in result) throw new Error(result.error);
  return board.addLayout(result.layout, 0, 0).find((id) => diagramFrame(board, id))!;
}
const steps = (board: BoardDoc, of: string) =>
  board
    .items()
    .filter(
      (i): i is Item & { kind: 'shape' } =>
        i.kind === 'shape' && i.part?.of === of && i.part.role === 'step',
    );
const FLOW = 'flowchart LR\n  a["Check order"] --> b["Ship order"]';

describe('changing and adding steps by hand', () => {
  it('offers each kind of diagram its own kinds', () => {
    expect(stepKinds('state').map((k) => k.label)).toContain('Fork');
    expect(stepKinds('c4').map((k) => k.kind)).toEqual([
      'person',
      'system',
      'container',
      'component',
      'database',
      'queue',
      'external',
      'code',
    ]);
    expect(stepKinds('erd')).toEqual([]);
    expect(bpmnMarkers('bpmn', 'decision')[0].kind).toBe('exclusive');
    expect(bpmnMarkers('flowchart', 'task')).toEqual([]);
  });

  it('turns a flowchart step into a decision: its part and shape change', () => {
    const board = new BoardDoc();
    const id = place(board, FLOW);
    const check = steps(board, id).find((s) => s.label === 'Check order')!;
    expect(setStepKind(board, check.id, 'decision')).toBe(true);
    const now = steps(board, id).find((s) => s.id === check.id)!;
    expect(now.part?.type).toBe('decision');
    expect(now.shape).toBe('diamond');
    expect(diagramText(board, id)).toContain('{');
    expect(setStepKind(board, check.id, 'nonsense')).toBe(false);
  });

  it('makes a C4 container a component, rewriting its bracket line, and follows a retyped bracket', () => {
    const board = new BoardDoc();
    const id = place(board, C4_STARTER);
    const container = steps(board, id).find((s) => s.part?.type === 'container')!;
    setStepKind(board, container.id, 'component');
    const now = steps(board, id).find((s) => s.id === container.id)!;
    expect(now.part?.type).toBe('component');
    expect(now.label).toMatch(/\[Component/);
    // Typed by hand: the bracket says what it is.
    board.setText(now.id, now.label.replace('[Component', '[External System'));
    followC4Bracket(board, now.id);
    const external = steps(board, id).find((s) => s.id === container.id)!;
    expect(external.part?.type).toBe('external');
    expect(external.color).toBe('gray');
  });

  it('gives a BPMN task a marker, a gateway a kind, and drops a marker that no longer fits', () => {
    const board = new BoardDoc();
    const id = place(board, BPMN_STARTER);
    const task = steps(board, id).find((s) => s.part?.type === 'task')!;
    expect(setBpmnMarker(board, task.id, 'user')).toBe(true);
    expect(steps(board, id).find((s) => s.id === task.id)).toMatchObject({
      icon: 'bpmn-user',
      part: { extra: { marker: 'user' } },
    });
    expect(diagramText(board, id)).toContain('userTask');
    setStepKind(board, task.id, 'decision');
    const gateway = steps(board, id).find((s) => s.id === task.id)!;
    expect(gateway.shape).toBe('diamond');
    expect(gateway.part?.extra?.['marker']).toBe('exclusive');
    setBpmnMarker(board, task.id, 'parallel');
    expect(diagramText(board, id)).toContain('parallelGateway');
  });

  it('turns a use case person into a system, with its stereotype', () => {
    const board = new BoardDoc();
    const id = place(board, USECASE_STARTER);
    const actor = steps(board, id).find((s) => s.part?.type === 'actor')!;
    setStepKind(board, actor.id, 'system');
    const now = steps(board, id).find((s) => s.id === actor.id)!;
    expect(now.shape).toBe('rect');
    expect(now.label.startsWith('«system»\n')).toBe(true);
  });

  it('adds the next step, joined by an arrow, in every kind of diagram', () => {
    for (const text of [
      FLOW,
      C4_STARTER,
      BPMN_STARTER,
      USECASE_STARTER,
      'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Done',
    ]) {
      const board = new BoardDoc();
      const id = place(board, text);
      const from = steps(board, id).find((s) => !['start', 'end'].includes(s.part?.type ?? ''))!;
      const before = steps(board, id).length;
      const added = addNextStep(board, from.id);
      expect(added).toBeTruthy();
      expect(steps(board, id).length).toBe(before + 1);
      expect(board.connectors().some((c) => c.from === from.id && c.to === added)).toBe(true);
    }
  });
});
