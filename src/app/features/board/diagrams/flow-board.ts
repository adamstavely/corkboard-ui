import type { BoardDoc, Frame, Item } from '../board-doc';
import { plainText } from '../comments';
import { flowEngine, layoutFlow, type FlowData, type FlowEdge, type FlowNode } from './flowchart';

/** A diagram's outer frame, by its id, if it is one. */
export function diagramFrame(board: BoardDoc, id: string): Frame | null {
  const frame = board.frames().find((f) => f.id === id);
  return frame?.part?.role === 'diagram' && frame.part.of === frame.id ? frame : null;
}

/** The lane frames of a diagram, in order across its flow. */
function lanesOf(board: BoardDoc, diagram: Frame): Frame[] {
  const tb = diagram.part?.dir === 'TB';
  return board
    .frames()
    .filter((f) => f.part?.of === diagram.id && f.part.role === 'lane')
    .sort((a, b) => (tb ? a.x - b.x : a.y - b.y));
}

const centreIn = (b: { x: number; y: number; w: number; h: number }, f: Frame) => {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h;
};

/**
 * A flowchart on the board read back as its model: its lanes in order, each step in the lane it sits in (by its centre),
 * the arrows between its steps with their words, and its remarks with the steps they're joined to. Ids are the
 * diagram's own (Mermaid) ids; arrows keep the board's.
 */
export function readFlowchart(board: BoardDoc, diagramId: string): FlowData | null {
  const diagram = diagramFrame(board, diagramId);
  if (!diagram || diagram.part?.type !== 'flowchart') return null;
  const lanes = lanesOf(board, diagram);
  const tb = diagram.part?.dir === 'TB';
  // In the order they run (along the flow, then across it), with ties by id: the layout engine's results depend on the
  // order it's given things in, and the board keeps them in no order at all.
  const steps = board
    .items()
    .filter((i): i is Item & { kind: 'shape' } => i.kind === 'shape' && i.part?.of === diagram.id && i.part.role === 'step')
    .sort((a, b) => (tb ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y) || a.part!.key.localeCompare(b.part!.key));
  const rank = new Map(steps.map((s, i) => [s.id, i]));
  const keyOf = new Map(steps.map((s) => [s.id, s.part!.key]));
  const main = { id: 'lane-main', name: 'Process' };
  const laneOf = (s: Item) => {
    const lane = lanes.find((l) => centreIn(s, l)) ?? lanes[0];
    return lane ? lane.part!.key : main.id;
  };
  const nodes: FlowNode[] = steps.map((s) => ({ id: s.part!.key, laneId: laneOf(s), type: s.part!.type ?? 'task', label: s.label }));
  const edges: FlowEdge[] = board
    .connectors()
    .filter((c) => keyOf.has(c.from) && keyOf.has(c.to))
    .sort((a, b) => rank.get(a.from)! - rank.get(b.from)! || rank.get(a.to)! - rank.get(b.to)!)
    .map((c) => ({ id: c.id, from: keyOf.get(c.from)!, to: keyOf.get(c.to)!, label: c.label, ...(c.weight >= 4 ? { feedback: true } : {}) }));
  const remarks = board
    .notes()
    .filter((n) => n.part?.of === diagram.id && n.part.role === 'note')
    .sort((a, b) => a.part!.key.localeCompare(b.part!.key));
  const notes = remarks.map((n) => ({
    id: n.part!.key,
    text: plainText(n.text),
    nodes: board
      .connectors()
      .filter((c) => c.from === n.id && keyOf.has(c.to))
      .map((c) => keyOf.get(c.to)!),
  }));
  return {
    diagramType: 'flowchart',
    title: diagram.title,
    direction: diagram.part?.dir === 'TB' ? 'TB' : 'LR',
    ...(lanes.length ? {} : { swimlanes: false }),
    lanes: lanes.length ? lanes.map((l) => ({ id: l.part!.key, name: l.title })) : [main],
    nodes,
    edges,
    ...(notes.length ? { notes } : {}),
  };
}

/** A flowchart on the board written as Mermaid, as the diagram skill writes it (lanes as subgraphs, remarks as flags). */
export function flowchartMermaid(board: BoardDoc, diagramId: string): string | null {
  const data = readFlowchart(board, diagramId);
  return data ? flowEngine().toMermaid(data, {}) : null;
}

/**
 * Lays a flowchart on the board out again, where it is: its frame, lanes, steps and remarks take the places the layout
 * engine gives them (one undo step). Optionally it turns to run the other way. Things the diagram doesn't know (a
 * shape dropped in without a part) are left where they are.
 */
export function tidyFlowchart(board: BoardDoc, diagramId: string, dir?: 'LR' | 'TB'): boolean {
  const diagram = diagramFrame(board, diagramId);
  const data = readFlowchart(board, diagramId);
  if (!diagram || !data || !data.nodes.length) return false;
  if (dir) data.direction = dir;
  const layout = layoutFlow(data);
  const byKey = new Map<string, string>([['diagram', diagram.id]]);
  for (const f of board.frames()) if (f.part?.of === diagram.id && f.part.role === 'lane') byKey.set(`lane:${f.part.key}`, f.id);
  for (const i of board.items()) if (i.part?.of === diagram.id && i.part.role === 'step') byKey.set(i.part.key, i.id);
  for (const n of board.notes()) if (n.part?.of === diagram.id && n.part.role === 'note') byKey.set(`note:${n.part.key}`, n.id);
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const thing of [...(layout.frames ?? []), ...(layout.shapes ?? []), ...(layout.notes ?? [])]) {
    const id = thing.key && byKey.get(thing.key);
    if (!id) continue;
    boxes.set(id, { x: diagram.x + thing.x, y: diagram.y + thing.y, w: thing.w ?? 0, h: thing.h ?? 0 });
  }
  board.placeBoxes(boxes, dir ? new Map([[diagram.id, { ...diagram.part!, dir }]]) : undefined);
  return true;
}
