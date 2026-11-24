import { NOTE_COLORS, type BoardDoc, type Frame, type Item, type NoteColor, type Part, type ShapeKind } from '../board-doc';
import { diagramFrame, tidyFlowchart } from './flow-board';
import { routeDiagramArrows } from './routing';

/**
 * Editing an editable flowchart on the board: shapes dropped into a diagram become its steps (and steps dragged out of
 * it become plain shapes), a step dropped on an arrow goes into the flow there, lanes and remarks are added, and a
 * diagram with Auto-Tidy on lays itself out again after each change.
 */

/** The kind of step a shape is, when it's dropped into a flowchart. */
const STEP_KINDS: Partial<Record<ShapeKind, string>> = {
  rect: 'task',
  diamond: 'decision',
  pill: 'start',
  parallelogram: 'io',
  document: 'document',
  cylinder: 'database',
  delay: 'delay',
  subprocess: 'subprocess',
};
const LANE_COLOURS: NoteColor[] = ['blue', 'green', 'yellow', 'purple', 'pink', 'gray'];

type Box = { x: number; y: number; w: number; h: number };
const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const inside = (b: Box, f: Box) => {
  const c = centre(b);
  return c.x >= f.x && c.x <= f.x + f.w && c.y >= f.y && c.y <= f.y + f.h;
};

/** A key for a new part, from its words, not used by any other part of the diagram. */
export function freshKey(board: BoardDoc, diagramId: string, words: string, fallback: string): string {
  const taken = new Set([...board.frames(), ...board.items(), ...board.notes()].flatMap((t) => (t.part?.of === diagramId ? [t.part.key] : [])));
  const base =
    words
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || fallback;
  // Never a word Mermaid keeps for itself.
  const safe = ['end', 'class', 'style', 'graph', 'subgraph', 'flowchart'].includes(base) ? `${base}_step` : /^[0-9]/.test(base) ? `s_${base}` : base;
  if (!taken.has(safe)) return safe;
  for (let i = 2; ; i++) if (!taken.has(`${safe}_${i}`)) return `${safe}_${i}`;
}

/** The flowcharts on the board, outer frames, innermost first (smallest), so a nested drop goes to the right one. */
const flowcharts = (board: BoardDoc): Frame[] =>
  board
    .frames()
    .filter((f) => f.part?.role === 'diagram' && f.part.of === f.id && f.part.type === 'flowchart')
    .sort((a, b) => a.w * a.h - b.w * b.h);

/** Distance from a point to a polyline. */
function distanceTo(p: { x: number; y: number }, line: { x: number; y: number }[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/**
 * After things are placed or moved: shapes now in a flowchart become its steps, steps now outside their flowchart
 * become plain shapes, and one new step dropped on an arrow between two steps goes into the flow there (the arrow's
 * words stay on its first half). Returns the flowcharts that changed.
 */
export function settleSteps(board: BoardDoc, ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  const shapes = board.items().filter((i): i is Item & { kind: 'shape' } => i.kind === 'shape' && wanted.has(i.id));
  if (!shapes.length) return [];
  const diagrams = flowcharts(board);
  const changes = new Map<string, Part | null>();
  const touched = new Set<string>();
  const joined: { shape: Item & { kind: 'shape' }; diagram: Frame }[] = [];
  // The lane a step is in now: the lane of its flowchart its centre is in.
  const laneAt = (shape: Item, diagramId: string) =>
    board.frames().find((f) => f.part?.of === diagramId && f.part.role === 'lane' && inside(shape, f))?.part?.key;
  for (const shape of shapes) {
    const home = diagrams.find((d) => inside(shape, d));
    const part = shape.part;
    if (part?.role === 'step' && part.of !== home?.id) {
      changes.set(shape.id, null);
      touched.add(part.of);
    }
    if (home && (!part || part.of !== home.id) && STEP_KINDS[shape.shape]) {
      const lane = laneAt(shape, home.id);
      changes.set(shape.id, { of: home.id, role: 'step', key: freshKey(board, home.id, shape.label, 'step'), type: STEP_KINDS[shape.shape], ...(lane ? { lane } : {}) });
      touched.add(home.id);
      joined.push({ shape, diagram: home });
    } else if (home && part?.role === 'step' && part.of === home.id) {
      // A step moved within its flowchart takes the lane it was dropped in.
      const lane = laneAt(shape, home.id);
      if (lane && lane !== part.lane) {
        changes.set(shape.id, { ...part, lane });
        touched.add(home.id);
      }
    }
  }
  if (!changes.size) return [];
  // A new step takes its lane's colour.
  for (const { shape, diagram } of joined) {
    const lane = board.frames().find((f) => f.part?.of === diagram.id && f.part.role === 'lane' && inside(shape, f));
    if (lane && (NOTE_COLORS as readonly string[]).includes(lane.fill)) board.setColor([shape.id], lane.fill as NoteColor);
  }
  // The arrows as they ran before the new step joined (once it's a step, they'd be routed round it).
  const before = joined.length === 1 ? routeDiagramArrows(board.frames(), board.items(), board.connectors()) : null;
  board.setParts(changes);
  // One step dropped on an arrow of its flowchart, with no arrows of its own yet, goes into the flow there.
  if (joined.length === 1) {
    const [{ shape, diagram }] = joined;
    const own = board.connectors().some((c) => c.from === shape.id || c.to === shape.id);
    if (!own) {
      const routes = before!;
      const at = centre(shape);
      const hit = board
        .connectors()
        .filter((c) => c.from !== shape.id && c.to !== shape.id && routes.has(c.id))
        .map((c) => ({ c, d: distanceTo(at, routes.get(c.id)!.points) }))
        .filter(({ d }) => d <= Math.max(24, Math.min(shape.w, shape.h) / 2))
        .sort((a, b) => a.d - b.d)[0];
      if (hit && board.items().find((i) => i.id === hit.c.from)?.part?.of === diagram.id) {
        const { from, to, label, route, dash, weight, start, end } = hit.c;
        board.remove([hit.c.id]);
        const first = board.connect(from, shape.id, { route, dash, weight, start, end });
        board.connect(shape.id, to, { route, dash, weight, start, end });
        if (first && label) board.setArrowLabel(first, label);
      }
    }
  }
  return [...touched];
}

/** A step still called by a stand-in id ("step", "step_2") takes one from its name, once it has one. */
export function nameStep(board: BoardDoc, id: string): void {
  const step = board.items().find((i) => i.id === id);
  if (step?.kind !== 'shape' || step.part?.role !== 'step' || !/^step(_\d+)?$/.test(step.part.key) || !step.label.trim()) return;
  const key = freshKey(board, step.part.of, step.label, step.part.key);
  if (key !== step.part.key) board.setParts(new Map([[id, { ...step.part, key }]]));
}

/** The flowchart a thing (or an arrow, by where it starts) is part of, if any. */
export function diagramOf(board: BoardDoc, id: string): string | null {
  const thing = [...board.frames(), ...board.items(), ...board.notes()].find((t) => t.id === id);
  if (thing) return thing.part?.of ?? null;
  const arrow = board.connectors().find((c) => c.id === id);
  return arrow ? diagramOf(board, arrow.from) : null;
}

/** Whether a flowchart lays itself out again after each change. */
export const autoTidies = (board: BoardDoc, diagramId: string) => diagramFrame(board, diagramId)?.part?.auto !== false;

/** Lays out again the flowcharts that have Auto-Tidy on, among these. */
export function autoTidy(board: BoardDoc, diagramIds: Iterable<string>): void {
  for (const id of new Set(diagramIds)) if (autoTidies(board, id)) tidyFlowchart(board, id);
}

/** Turns Auto-Tidy on or off for a flowchart; turning it on tidies it at once. */
export function setAutoTidy(board: BoardDoc, diagramId: string, on: boolean): void {
  const frame = diagramFrame(board, diagramId);
  if (!frame?.part) return;
  const { auto: _was, ...rest } = frame.part;
  board.setParts(new Map([[diagramId, on ? rest : { ...rest, auto: false }]]));
  if (on) tidyFlowchart(board, diagramId);
}

/** Adds a lane at the end of a flowchart, named "New lane", and lays the flowchart out; returns the lane's id. */
export function addLane(board: BoardDoc, diagramId: string): string | null {
  const frame = diagramFrame(board, diagramId);
  if (!frame) return null;
  const tb = frame.part?.dir === 'TB';
  const lanes = board.frames().filter((f) => f.part?.of === diagramId && f.part.role === 'lane');
  const last = [...lanes].sort((a, b) => (tb ? b.x - a.x : b.y - a.y))[0];
  // Below the last lane (beside it, top to bottom); a flowchart without lanes gets its first one round everything.
  const box = last ? (tb ? { x: last.x + last.w, y: last.y, w: 240, h: last.h } : { x: last.x, y: last.y + last.h, w: last.w, h: 240 }) : { x: frame.x + 24, y: frame.y + 56, w: frame.w - 48, h: frame.h - 80 };
  const key = freshKey(board, diagramId, `lane ${lanes.length + 1}`, 'lane');
  const ids = board.addLayout(
    { frames: [{ title: 'New lane', x: 0, y: 0, w: box.w, h: box.h, look: 'lane', fill: LANE_COLOURS[lanes.length % LANE_COLOURS.length] }] },
    box.x + box.w / 2,
    box.y + box.h / 2,
  );
  const id = ids[0];
  if (!id) return null;
  board.setParts(new Map([[id, { of: diagramId, role: 'lane', key }]]));
  // The diagram's frame grows round it before the layout runs, so the new lane is read as inside.
  board.placeBoxes(new Map([[diagramId, { x: frame.x, y: frame.y, w: Math.max(frame.w, box.x + box.w - frame.x + 24), h: Math.max(frame.h, box.y + box.h - frame.y + 24) }]]));
  tidyFlowchart(board, diagramId);
  return id;
}

/** Adds a remark to a step: a note beside it, joined to it by a dotted line; returns the note's id. */
export function addRemark(board: BoardDoc, stepId: string): string | null {
  const step = board.items().find((i) => i.id === stepId);
  if (!step?.part || step.part.role !== 'step') return null;
  const diagramId = step.part.of;
  const frame = diagramFrame(board, diagramId);
  if (!frame) return null;
  // Under the diagram, below the step, clear of the remarks already there.
  const remarks = board.notes().filter((n) => n.part?.of === diagramId);
  let x = step.x;
  const y = frame.y + frame.h + 48;
  while (remarks.some((n) => Math.abs(n.y - y) < 40 && x < n.x + n.w + 24 && n.x < x + 220 + 24)) x += 244;
  const [id] = board.addLayout({ notes: [{ text: '', x: 0, y: 0, w: 220, h: 140 }] }, x + 110, y + 70);
  if (!id) return null;
  board.setParts(new Map([[id, { of: diagramId, role: 'note', key: freshKey(board, diagramId, 'n', 'n') }]]));
  board.connect(id, stepId, { route: 'straight', dash: 'dotted', start: 'none', end: 'none', weight: 1 });
  return id;
}
