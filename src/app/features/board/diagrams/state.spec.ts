import { BoardDoc } from '../board-doc';
import { diagramFrame, readFlowchartTree, stateMermaid, tidyFlowchart } from './flow-board';
import { diagramLayout, diagramText, diagramType } from './kinds';
import { isStateText, parseState, STATE_STARTER, stateText } from './state';
import type { ChildData } from './flowchart';

const PLAYER = `stateDiagram-v2
  [*] --> Stopped
  Stopped --> Playing : play
  state Playing {
    [*] --> Loading
    Loading --> Streaming : buffered
    --
    [*] --> Muted
    Muted --> Audible : unmute
  }
  Playing --> Stopped : stop
  state f <<fork>>
  Stopped --> f
  f --> Stopped
  Playing --> [*]
  note left of Stopped
    Nothing is loaded
    while stopped
  end note
`;

describe('state machines', () => {
  it('reads states, start and end dots, choices and notes, and writes them back the same', () => {
    expect(isStateText(STATE_STARTER)).toBe(true);
    expect(isStateText('flowchart LR\n a-->b')).toBe(false);
    const parsed = parseState(STATE_STARTER);
    if ('error' in parsed) throw new Error(parsed.error);
    const { data, warnings } = parsed;
    expect(warnings).toEqual([]);
    expect(data.title).toBe('Order');
    expect(data.direction).toBe('LR');
    const types = Object.fromEntries(data.nodes.map((n) => [n.id, n.type]));
    expect(types).toMatchObject({ Placed: 'task', paid_check: 'decision', Delivered: 'task' });
    expect(data.nodes.filter((n) => n.type === 'start')).toHaveLength(1);
    expect(data.nodes.filter((n) => n.type === 'end')).toHaveLength(1);
    expect(data.edges.find((e) => e.from === 'paid_check' && e.to === 'Shipped')?.label).toBe(
      '[in stock]',
    );
    expect(data.notes).toEqual([
      { id: 'n1', text: 'The customer is told the new date', nodes: ['Backordered'] },
    ]);
    const again = parseState(stateText(data));
    if ('error' in again) throw new Error(again.error);
    // The same states and transitions (in any order; the dots' own ids are the reader's).
    const dot = (d: typeof data, id: string) =>
      d.nodes.find((n) => n.id === id)?.type === 'start' ||
      d.nodes.find((n) => n.id === id)?.type === 'end'
        ? '[*]'
        : id;
    const states = (d: typeof data) =>
      d.nodes
        .filter((n) => n.type !== 'start' && n.type !== 'end')
        .map((n) => `${n.id}:${n.type}:${n.label}`)
        .sort();
    const moves = (d: typeof data) =>
      d.edges.map((e) => `${dot(d, e.from)}>${dot(d, e.to)}:${e.label ?? ''}`).sort();
    expect(states(again.data)).toEqual(states(data));
    expect(moves(again.data)).toEqual(moves(data));
  });

  it('keeps a composite state as a sub-process, its regions as lanes, and a fork as a bar', () => {
    const parsed = parseState(PLAYER);
    if ('error' in parsed) throw new Error(parsed.error);
    const { data } = parsed;
    expect(data.nodes.find((n) => n.id === 'Playing')?.type).toBe('subprocess');
    expect(data.nodes.find((n) => n.id === 'f')?.type).toBe('fork');
    const inside = (data.children as Record<string, ChildData>)['Playing'];
    expect(inside.laneOrder).toEqual(['Playing__region1', 'Playing__region2']);
    expect(inside.nodes.filter((n) => n.laneId === 'Playing__region2').map((n) => n.label)).toEqual(
      ['', 'Muted', 'Audible'],
    );
    expect(data.notes?.[0].text).toBe('Nothing is loaded\nwhile stopped');
    const text = stateText(data);
    expect(text).toContain('state Playing {');
    expect(text).toContain('  --');
    expect(text).toContain('state f <<fork>>');
    expect(text).toContain('note right of Stopped\n    Nothing is loaded');
  });

  it('draws a transition that crosses into a composite to the composite, and says so', () => {
    const parsed = parseState(
      'stateDiagram-v2\n  state Busy {\n    Working\n  }\n  Idle --> Working : go',
    );
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.data.edges).toEqual([
      expect.objectContaining({ from: 'Idle', to: 'Busy', label: 'go' }),
    ]);
    expect(parsed.warnings[0]).toContain('drawn from Idle to Busy');
  });

  it('goes on the board as an editable state machine that tidies and reads back as stateDiagram-v2', () => {
    const result = diagramLayout(STATE_STARTER);
    if ('error' in result) throw new Error(result.error);
    expect(result.type).toBe('state');
    const board = new BoardDoc();
    const id = board.addLayout(result.layout, 0, 0).find((x) => diagramFrame(board, x))!;
    expect(diagramType(board, id)).toBe('state');
    const shapes = new Map(
      board.items().flatMap((i) => (i.kind === 'shape' && i.part ? [[i.part.key, i.shape]] : [])),
    );
    expect(shapes.get('Placed')).toBe('rounded');
    expect(shapes.get('paid_check')).toBe('diamond');
    expect(tidyFlowchart(board, id)).toBe(true);
    const text = diagramText(board, id)!;
    expect(text.startsWith('---\ntitle: Order\n---\nstateDiagram-v2')).toBe(true);
    expect(text).toContain('Placed --> Paid : payment received');
    expect(text).toContain('[*] --> Placed');
    expect(stateMermaid(board, id)).toBe(text);
    expect(readFlowchartTree(board, id)?.nodes).toHaveLength(
      parseState(STATE_STARTER) &&
        (parseState(STATE_STARTER) as { data: { nodes: unknown[] } }).data.nodes.length,
    );
  });
});
