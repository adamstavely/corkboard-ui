import type { Layout, NoteColor, ShapeKind } from '../board-doc';
import { flowchartEngine } from './vendor/flowchart';

/**
 * Editable swimlane flowcharts, from Mermaid: the Ultimate Diagram skill's reader and layout engine (vendor/) turn the
 * text into lanes and steps with positions, which become ordinary board things (a frame for the diagram, a frame per
 * lane, a shape per step, a note per remark), each tagged with its part so the diagram can be laid out again.
 */

/** The skill's text measurements: average character widths per text style, for its own sizing of labels. */
const TOKENS = { font: { metrics: { label: 7.4, title: 7.4, detail: 6.4, note: 6.2, type: 6.6, edgeLabel: 7, edgeWrap: 6.6 } } };

export interface FlowEngine {
  layoutDiagram(data: FlowData): void;
  loopSides(nodes: FlowNode[], edges: FlowEdge[], lanes: FlowLane[]): (edge: FlowEdge) => 'far' | 'near';
  routeEdgesOrthogonal(model: object): Record<string, { path: string; points: [number, number][]; midX: number; midY: number } | undefined>;
  LE: { NODE_W: number; NODE_H: number; DEC_H: number; START_X: number; LABEL_MAX_W: number };
  fromMermaid(text: string): { data: FlowData; infos: string[]; warnings: string[] };
  toMermaid(data: FlowData, opts?: object): string;
}
export interface FlowLane {
  id: string;
  name: string;
  height?: number;
}
export interface FlowNode {
  id: string;
  laneId?: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
}
export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  feedback?: boolean;
}
export interface FlowData {
  diagramType?: string;
  title?: string;
  direction?: 'LR' | 'TB';
  swimlanes?: boolean;
  lanes: FlowLane[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  notes?: { id: string; text: string; nodes: string[] }[];
  children?: Record<string, unknown>;
}

let engine: FlowEngine | undefined;
/** The engine, made the first time a flowchart needs it. */
export const flowEngine = (): FlowEngine => (engine ??= flowchartEngine(TOKENS) as FlowEngine);

/** A step's kind, as the skill names it, and the board shape that draws it. */
export const FLOW_SHAPES: Record<string, ShapeKind> = {
  start: 'pill',
  end: 'pill',
  task: 'rect',
  decision: 'diamond',
  io: 'parallelogram',
  document: 'document',
  database: 'cylinder',
  delay: 'delay',
  subprocess: 'subprocess',
  connector: 'ellipse',
};

/** The skill lays a flowchart out in its own pixels; the board draws it this much bigger, so labels read at board size. */
export const FLOW_SCALE = 1.25;
/** Room at the top of a lane for its name, and round the lanes inside the diagram's frame (board pixels). */
const LANE_TITLE = 48;
const PAD = 24;
const DIAGRAM_TITLE = 56;
/** A start or end with no words is a dot, and so is a connector. */
const DOT = 40;
/** Remarks on steps sit under the diagram. */
const NOTE = { w: 220, h: 140, gap: 24 };

/** The colours lanes take in turn; a lane's steps share its colour. */
const LANE_COLOURS: NoteColor[] = ['blue', 'green', 'yellow', 'purple', 'pink', 'gray'];

/** A sub-process flow, from a `sub_<slug>` block: the step it belongs to (by id), its name and its own layout. */
export interface ChildFlow {
  slug: string;
  name: string;
  layout: Layout;
}
export type FlowchartResult = { layout: Layout; children: ChildFlow[]; notices: string[] } | { error: string };

/** One sub-process of a flowchart's model as a flowchart of its own: its steps, arrows, remarks and the lanes they use. */
export function childFlow(data: FlowData, slug: string): FlowData | null {
  const child = (data.children as Record<string, ChildData> | undefined)?.[slug];
  if (!child) return null;
  const byId = new Map(data.lanes.map((l) => [l.id, l]));
  const order = [...(child.laneOrder ?? []), ...child.nodes.map((n) => n.laneId ?? '')].filter((id, i, a) => byId.has(id) && a.indexOf(id) === i);
  return {
    diagramType: 'flowchart',
    title: child.name,
    ...(data.direction ? { direction: data.direction } : {}),
    ...(order.length ? {} : { swimlanes: false }),
    lanes: order.length ? order.map((id) => ({ id, name: byId.get(id)!.name })) : [{ id: 'lane-main', name: 'Process' }],
    nodes: child.nodes,
    edges: child.edges,
    ...(child.notes?.length ? { notes: child.notes } : {}),
  };
}
/** A sub-process as the skill's reader and writer keep it. */
export interface ChildData {
  name: string;
  laneOrder?: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  notes?: { id: string; text: string; nodes: string[] }[];
}

/** A step's box in the skill's pixels, from its slot: decisions are deeper, dots smaller. */
function stepBox(n: FlowNode, tb: boolean, LE: FlowEngine['LE']): { x: number; y: number; w: number; h: number } {
  const along = LE.NODE_W;
  const across = n.type === 'decision' ? LE.DEC_H : LE.NODE_H;
  const x = n.x ?? 0;
  const y = n.y ?? 0;
  // The engine works in flow terms (x along the flow, y across the lanes); top to bottom swaps them on screen.
  const slot = tb ? { x: y, y: x, w: across, h: along } : { x, y, w: along, h: across };
  if (isDot(n)) return { x: slot.x + (slot.w - DOT) / 2, y: slot.y + (slot.h - DOT) / 2, w: DOT, h: DOT };
  return slot;
}
const isDot = (n: FlowNode) => n.type === 'connector' || ((n.type === 'start' || n.type === 'end') && !n.label.trim());

/**
 * A flowchart, written in Mermaid, laid out as board things: the diagram's frame, a frame per lane, a shape per step,
 * a note per remark, and right-angled arrows between steps (dotted lines from remarks to their steps). Positions are
 * from the layout's top-left corner. Sub-process flows (`sub_` blocks) aren't drawn yet: the main flow is.
 */
export function flowchartLayout(source: string): FlowchartResult {
  let parsed: ReturnType<FlowEngine['fromMermaid']>;
  try {
    parsed = flowEngine().fromMermaid(source);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The flowchart could not be read.' };
  }
  const data = parsed.data;
  if (!data.nodes.length) return { error: 'The flowchart has no steps.' };
  const notices = [...parsed.warnings];
  // Each sub-process becomes a flowchart of its own, linked to its step (nested ones too: they're all in one list).
  const children = Object.keys(data.children ?? {}).flatMap((slug) => {
    const flow = childFlow(data, slug);
    return flow?.nodes.length ? [{ slug, name: flow.title ?? slug, layout: layoutFlow(flow) }] : [];
  });
  // The main flow keeps only its own lanes (those its steps use, and any no sub-process uses).
  if (children.length) {
    const own = new Set(data.nodes.map((n) => n.laneId));
    const theirs = new Set(Object.values(data.children as Record<string, ChildData>).flatMap((c) => [...(c.laneOrder ?? []), ...c.nodes.map((n) => n.laneId ?? '')]));
    data.lanes = data.lanes.filter((l) => own.has(l.id) || !theirs.has(l.id));
  }
  return { layout: layoutFlow(data), children, notices };
}

/** A flowchart's model (lanes, steps, arrows, remarks) laid out afresh as board things, from the layout's top-left. */
export function layoutFlow(data: FlowData): Layout {
  const eng = flowEngine();
  // Without subgraphs a flowchart has one unnamed lane: no lane frames, just the diagram.
  const named = data.swimlanes !== false && data.lanes.length > 0;
  eng.layoutDiagram(data);
  const tb = data.direction === 'TB';
  const s = FLOW_SCALE;
  const lanes = data.lanes ?? [];
  const laneTitle = named ? LANE_TITLE : 0;

  // Each lane's band across the flow, in board pixels from the top-left of the lanes.
  const across = new Map<string, number>();
  let offset = 0;
  for (const lane of lanes) {
    across.set(lane.id, offset);
    offset += (lane.height ?? 192) * s + (tb ? 0 : laneTitle);
  }
  const lanesAcross = offset;
  const boxes = new Map(data.nodes.map((n) => [n.id, stepBox(n, tb, eng.LE)]));
  const along = Math.max(...data.nodes.map((n) => (tb ? boxes.get(n.id)!.y + boxes.get(n.id)!.h : boxes.get(n.id)!.x + boxes.get(n.id)!.w))) + eng.LE.START_X;
  const lanesAlong = along * s + (tb ? laneTitle : 0);
  const origin = { x: PAD, y: DIAGRAM_TITLE };
  const lanesBox = tb ? { w: lanesAcross, h: lanesAlong } : { w: lanesAlong, h: lanesAcross };

  const layout: Layout = { frames: [], shapes: [], notes: [], arrows: [] };
  const diagram = { w: lanesBox.w + PAD * 2, h: DIAGRAM_TITLE + lanesBox.h + PAD };
  layout.frames!.push({
    key: 'diagram',
    title: data.title?.trim() || 'Flowchart',
    x: 0,
    y: 0,
    ...diagram,
    look: 'outline',
    part: { role: 'diagram', key: 'diagram', type: 'flowchart', dir: tb ? 'TB' : 'LR' },
  });
  const colourOf = new Map<string, NoteColor>();
  lanes.forEach((lane, i) => {
    const colour = LANE_COLOURS[i % LANE_COLOURS.length];
    colourOf.set(lane.id, colour);
    if (!named) return;
    const at = across.get(lane.id)!;
    const band = (lane.height ?? 192) * s + (tb ? 0 : laneTitle);
    layout.frames!.push({
      key: `lane:${lane.id}`,
      title: lane.name,
      ...(tb ? { x: origin.x + at, y: origin.y, w: band, h: lanesAlong } : { x: origin.x, y: origin.y + at, w: lanesAlong, h: band }),
      look: 'lane',
      fill: colour,
      part: { role: 'lane', key: lane.id },
    });
  });
  for (const n of data.nodes) {
    const b = boxes.get(n.id)!;
    const lane = across.get(n.laneId ?? '') ?? 0;
    // A step's place: its lane's band across the flow, under the lane's name, and its own place in the lane.
    const x = tb ? origin.x + lane + b.x * s : origin.x + b.x * s;
    const y = tb ? origin.y + laneTitle + b.y * s : origin.y + lane + laneTitle + b.y * s;
    layout.shapes!.push({
      key: n.id,
      shape: FLOW_SHAPES[n.type] ?? 'rect',
      color: n.type === 'connector' ? 'gray' : (colourOf.get(n.laneId ?? '') ?? 'blue'),
      label: n.label,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(b.w * s),
      h: Math.round(b.h * s),
      part: { role: 'step', key: n.id, type: n.type, ...(named && n.laneId ? { lane: n.laneId } : {}) },
    });
  }
  for (const e of data.edges) {
    if (!boxes.has(e.from) || !boxes.has(e.to)) continue;
    layout.arrows!.push({ from: e.from, to: e.to, route: 'elbow', ...(e.label ? { label: e.label.slice(0, 200) } : {}), ...(e.feedback ? { weight: 4 } : {}) });
  }
  // Remarks: a row of notes under the diagram, each under its first step where there's room, with dotted lines to its steps.
  let nextX = 0;
  const stepX = (id: string) => layout.shapes!.find((sh) => sh.key === id)?.x ?? 0;
  const remarks = [...(data.notes ?? [])].filter((n) => n.nodes.some((id) => boxes.has(id))).sort((a, b) => stepX(a.nodes[0]) - stepX(b.nodes[0]));
  for (const note of remarks) {
    const x = Math.max(nextX, stepX(note.nodes[0]));
    nextX = x + NOTE.w + NOTE.gap;
    const key = `note:${note.id}`;
    layout.notes!.push({ key, text: note.text, color: 'yellow', x, y: diagram.h + NOTE.gap * 2, w: NOTE.w, h: NOTE.h, part: { role: 'note', key: note.id } });
    for (const id of note.nodes) if (boxes.has(id)) layout.arrows!.push({ from: key, to: id, route: 'straight', dash: 'dotted', start: 'none', end: 'none', weight: 1 });
  }
  return layout;
}

/** Whether text looks like a Mermaid flowchart (its first real line), so pasting it can make a diagram. */
export function isFlowchartText(text: string): boolean {
  const first = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  // Front matter (a title) may come first.
  let i = 0;
  if (first[0] === '---') {
    i = first.indexOf('---', 1) + 1;
    if (i === 0) return false;
  }
  return /^(flowchart|graph)\b/i.test(first[i] ?? '');
}

/** What a new editable flowchart starts as: two lanes, a decision, and its two outcomes. */
export const FLOWCHART_STARTER = `---
title: Order process
---
flowchart
  subgraph lane_customer["Customer"]
    placed(["Order placed"])
    received(["Order received"])
  end
  subgraph lane_shop["Shop"]
    in_stock{"In stock?"}
    ship["Ship the order"]
    refund["Refund the order"]
  end
  placed --> in_stock
  in_stock -->|"Yes"| ship --> received
  in_stock -->|"No"| refund --> received
`;
