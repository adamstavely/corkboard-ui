import { layoutSize, NOTE_COLORS, type BoardDoc, type Frame, type Item, type Layout, type NoteColor, type Part, type ShapeKind } from '../board-doc';
import { layoutFlow, type FlowData } from './flowchart';
import { diagramFrame, tidyFlowchart } from './flow-board';
import { tidyDiagram } from './kinds';
import { USECASE_KINDS } from './usecase';
import { C4_SHAPE_KINDS } from './c4';
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

/** The editable diagrams on the board, outer frames, innermost first (smallest), so a nested drop goes to the right one. */
const editableDiagrams = (board: BoardDoc): Frame[] =>
  board
    .frames()
    .filter((f) => f.part?.role === 'diagram' && f.part.of === f.id && (f.part.type === 'flowchart' || f.part.type === 'usecase' || f.part.type === 'c4'))
    .sort((a, b) => a.w * a.h - b.w * b.h);
/** The kind of thing a shape becomes in a diagram, by the diagram's kind. */
const kindIn = (diagram: Frame, shape: ShapeKind) => (diagram.part?.type === 'usecase' ? USECASE_KINDS[shape] : diagram.part?.type === 'c4' ? C4_SHAPE_KINDS[shape] : STEP_KINDS[shape]);

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
  const diagrams = editableDiagrams(board);
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
    if (home && (!part || part.of !== home.id) && kindIn(home, shape.shape)) {
      const lane = laneAt(shape, home.id);
      changes.set(shape.id, { of: home.id, role: 'step', key: freshKey(board, home.id, shape.label, 'step'), type: kindIn(home, shape.shape), ...(lane ? { lane } : {}) });
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
  if (joined.length === 1 && joined[0].diagram.part?.type === 'flowchart') {
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
  for (const id of new Set(diagramIds)) if (autoTidies(board, id)) tidyDiagram(board, id);
}

/** Turns Auto-Tidy on or off for a flowchart; turning it on tidies it at once. */
export function setAutoTidy(board: BoardDoc, diagramId: string, on: boolean): void {
  const frame = diagramFrame(board, diagramId);
  if (!frame?.part) return;
  const { auto: _was, ...rest } = frame.part;
  board.setParts(new Map([[diagramId, on ? rest : { ...rest, auto: false }]]));
  if (on) tidyDiagram(board, diagramId);
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

// ── Sub-processes ─────────────────────────────────────────────────────────

const GAP = 120;

/** Where the next sub-process of a flowchart goes: under it, below any it has already. */
function belowFamily(board: BoardDoc, diagram: Frame): { x: number; y: number } {
  const family = board.frames().filter((f) => f.id === diagram.id || f.part?.parent === diagram.id);
  const remarks = board.notes().filter((n) => n.part && family.some((f) => f.id === n.part!.of));
  const bottom = Math.max(...family.map((f) => f.y + f.h), ...remarks.map((n) => n.y + n.h));
  return { x: diagram.x, y: bottom + GAP };
}

/**
 * Places sub-process flows (from Mermaid's `sub_` blocks) under their flowchart, each linked both ways to the
 * sub-process step it belongs to (found by id in the flowchart or a sub-process placed before it).
 */
export function placeChildren(board: BoardDoc, diagramId: string, children: { slug: string; layout: Layout }[]): string[] {
  const placed: string[] = [];
  const family = [diagramId];
  for (const child of children) {
    const parentStep = board.items().find((i) => i.part?.role === 'step' && i.part.key === child.slug && family.includes(i.part.of));
    const parent = parentStep ? diagramFrame(board, parentStep.part!.of) : diagramFrame(board, diagramId);
    if (!parent) continue;
    const at = belowFamily(board, diagramFrame(board, diagramId)!);
    const size = layoutSize(child.layout);
    const ids = board.addLayout(child.layout, at.x + size.w / 2, at.y + size.h / 2);
    const id = ids.find((x) => diagramFrame(board, x));
    if (!id) continue;
    const frame = diagramFrame(board, id)!;
    const links = new Map<string, Part>([[id, { ...frame.part!, parent: parent.id }]]);
    if (parentStep) links.set(parentStep.id, { ...parentStep.part!, sub: id });
    board.setParts(links);
    family.push(id);
    placed.push(id);
  }
  return placed;
}

/** The flowcharts that are sub-processes of this one, at any depth. */
export function subprocessesOf(board: BoardDoc, diagramId: string): string[] {
  const found: string[] = [];
  const walk = (id: string) => {
    for (const f of board.frames()) {
      if (f.part?.role === 'diagram' && f.part.parent === id && !found.includes(f.id)) {
        found.push(f.id);
        walk(f.id);
      }
    }
  };
  walk(diagramId);
  return found;
}

/**
 * Moves some steps of a flowchart into a sub-process of their own: a new flowchart under it holds them (the same
 * board things, with their comments), opened by a start pill and closed by an end pill per way out; one sub-process
 * step takes their place, with the arrows that came in and went out. Returns the new flowchart's id.
 */
export function collapseToSubprocess(board: BoardDoc, stepIds: readonly string[], name = 'Sub-process'): string | null {
  const steps = board.items().filter((i): i is Item & { kind: 'shape' } => i.kind === 'shape' && stepIds.includes(i.id) && i.part?.role === 'step');
  const diagramId = steps[0]?.part?.of;
  const diagram = diagramId ? diagramFrame(board, diagramId) : null;
  if (!diagram || !steps.length || steps.some((s) => s.part!.of !== diagramId)) return null;
  const chosen = new Set(steps.map((s) => s.id));
  const arrows = board.connectors().filter((c) => chosen.has(c.from) || chosen.has(c.to));
  const incoming = arrows.filter((c) => !chosen.has(c.from) && chosen.has(c.to) && board.items().some((i) => i.id === c.from));
  const outgoing = arrows.filter((c) => chosen.has(c.from) && !chosen.has(c.to) && board.items().some((i) => i.id === c.to));
  const internal = arrows.filter((c) => chosen.has(c.from) && chosen.has(c.to));
  const lanes = board.frames().filter((f) => f.part?.of === diagram.id && f.part.role === 'lane');
  const laneOf = (s: Item) => s.part?.lane ?? lanes.find((l) => inside(s, l))?.part?.key;
  const usedLanes = lanes.filter((l) => steps.some((s) => laneOf(s) === l.part!.key));
  // The child's model: the steps by their keys, a start into each step something came into, an end per way out.
  const key = (id: string) => steps.find((s) => s.id === id)!.part!.key;
  const entries = [...new Set(incoming.map((c) => key(c.to)))];
  if (!entries.length) entries.push(...steps.filter((s) => !internal.some((c) => c.to === s.id)).map((s) => s.part!.key).slice(0, 1));
  const exits = [...new Set(outgoing.map((c) => key(c.from)))];
  const data: FlowData = {
    diagramType: 'flowchart',
    title: name,
    direction: diagram.part!.dir === 'TB' ? 'TB' : 'LR',
    ...(usedLanes.length ? {} : { swimlanes: false }),
    lanes: usedLanes.length ? usedLanes.map((l) => ({ id: l.part!.key, name: l.title })) : [{ id: 'lane-main', name: 'Process' }],
    nodes: [
      { id: 'sub_start', type: 'start', label: name, laneId: laneOf(steps.find((s) => s.part!.key === entries[0]) ?? steps[0]) ?? 'lane-main' },
      ...steps.map((s) => ({ id: s.part!.key, type: s.part!.type ?? 'task', label: s.label, laneId: laneOf(s) ?? 'lane-main' })),
      ...exits.map((k, i) => ({ id: `sub_end_${i + 1}`, type: 'end', label: `${name} done`, laneId: laneOf(steps.find((s) => s.part!.key === k)!) ?? 'lane-main' })),
    ],
    edges: [
      ...entries.map((k, i) => ({ id: `in${i}`, from: 'sub_start', to: k })),
      ...internal.map((c) => ({ id: c.id, from: key(c.from), to: key(c.to), label: c.label })),
      ...exits.map((k, i) => ({ id: `out${i}`, from: k, to: `sub_end_${i + 1}` })),
    ],
  };
  const layout = layoutFlow(data);
  // Lay the frames and the new pills down; the steps themselves move in, keeping their ids.
  const moving = new Set(steps.map((s) => s.part!.key));
  const fresh: Layout = {
    frames: layout.frames,
    shapes: layout.shapes?.filter((s) => !moving.has(s.key!)),
    arrows: layout.arrows?.filter((a) => !moving.has(a.from) && !moving.has(a.to)),
  };
  const at = belowFamily(board, diagram);
  const size = layoutSize(layout);
  const ids = board.addLayout(fresh, at.x + size.w / 2, at.y + size.h / 2);
  const childId = ids.find((x) => diagramFrame(board, x));
  if (!childId) return null;
  const child = diagramFrame(board, childId)!;
  const origin = { x: child.x - layout.frames![0].x, y: child.y - layout.frames![0].y };
  const boxes = new Map<string, Box>();
  const parts = new Map<string, Part | null>([[childId, { ...child.part!, parent: diagram.id }]]);
  for (const s of steps) {
    const box = layout.shapes!.find((l) => l.key === s.part!.key)!;
    boxes.set(s.id, { x: origin.x + box.x, y: origin.y + box.y, w: box.w, h: box.h });
    parts.set(s.id, { ...s.part!, of: childId, ...(box.part?.lane ? { lane: box.part.lane } : {}) });
  }
  board.placeBoxes(boxes);
  board.setParts(parts);
  const childKey = (k: string) => board.items().find((i) => i.part?.of === childId && i.part.key === k)?.id;
  for (const a of layout.arrows ?? []) {
    if (!moving.has(a.from) && !moving.has(a.to)) continue;
    if (internal.some((c) => key(c.from) === a.from && key(c.to) === a.to)) continue;
    const from = childKey(a.from);
    const to = childKey(a.to);
    if (from && to) board.connect(from, to, { route: 'elbow' });
  }
  // In the flowchart, one sub-process step where the steps were, joined as they were.
  const centre = { x: steps.reduce((t, s) => t + s.x + s.w / 2, 0) / steps.length, y: steps.reduce((t, s) => t + s.y + s.h / 2, 0) / steps.length };
  const lane = laneOf(steps[0]);
  const stepId = board.addShape(centre.x, centre.y, 'subprocess', steps[0].color, name);
  board.resizeItem(stepId, steps[0].w, steps[0].h);
  board.setParts(new Map<string, Part>([[stepId, { of: diagram.id, role: 'step', key: freshKey(board, diagram.id, name, 'sub'), type: 'subprocess', sub: childId, ...(lane ? { lane } : {}) }]]));
  for (const c of incoming) {
    const id = board.connect(c.from, stepId, { route: c.route, dash: c.dash, weight: c.weight, start: c.start, end: c.end });
    if (id && c.label) board.setArrowLabel(id, c.label);
  }
  for (const c of outgoing) {
    const id = board.connect(stepId, c.to, { route: c.route, dash: c.dash, weight: c.weight, start: c.start, end: c.end });
    if (id && c.label) board.setArrowLabel(id, c.label);
  }
  board.remove([...incoming, ...outgoing].map((c) => c.id));
  tidyFlowchart(board, diagram.id);
  tidyFlowchart(board, childId);
  return childId;
}

/**
 * Puts a sub-process back in its flowchart: its steps (the same board things) take the sub-process step's place,
 * joined to what came into and went out of it, and the sub-process flowchart goes. Its start and end pills go too.
 */
export function expandSubprocess(board: BoardDoc, stepId: string): boolean {
  const step = board.items().find((i) => i.id === stepId);
  const childId = step?.part?.sub;
  const child = childId ? diagramFrame(board, childId) : null;
  const diagramId = step?.part?.of;
  if (!step || !child || !diagramId || !diagramFrame(board, diagramId)) return false;
  const all = board.items().filter((i) => i.part?.of === child.id && i.part.role === 'step');
  const arrows = board.connectors();
  const pill = (i: Item) => i.part!.type === 'start' || i.part!.type === 'end';
  const starts = all.filter((i) => pill(i) && !arrows.some((c) => c.to === i.id));
  const ends = all.filter((i) => pill(i) && !arrows.some((c) => c.from === i.id));
  const bounds = new Set([...starts, ...ends].map((i) => i.id));
  const moving = all.filter((i) => !bounds.has(i.id));
  const entries = arrows.filter((c) => bounds.has(c.from) && starts.some((s) => s.id === c.from)).map((c) => c.to);
  const exits = arrows.filter((c) => ends.some((e) => e.id === c.to)).map((c) => c.from);
  const parentLanes = new Set(board.frames().filter((f) => f.part?.of === diagramId && f.part.role === 'lane').map((f) => f.part!.key));
  // The steps join the flowchart, beside where the sub-process step was, in their own lane where it has one.
  const parts = new Map<string, Part | null>();
  const boxes = new Map<string, Box>();
  moving.forEach((m, i) => {
    const lane = m.part!.lane && parentLanes.has(m.part!.lane) ? m.part!.lane : step.part!.lane;
    parts.set(m.id, { ...m.part!, of: diagramId, key: freshKey(board, diagramId, m.part!.key, 'step'), ...(lane ? { lane } : {}) });
    boxes.set(m.id, { x: step.x + i * 24, y: step.y + i * 24, w: 0, h: 0 });
  });
  for (const n of board.notes()) if (n.part?.of === child.id) parts.set(n.id, { ...n.part, of: diagramId, key: freshKey(board, diagramId, n.part.key, 'n') });
  board.placeBoxes(boxes);
  board.setParts(parts);
  for (const c of arrows.filter((a) => a.to === stepId)) {
    for (const to of entries) {
      const id = board.connect(c.from, to, { route: c.route, dash: c.dash, weight: c.weight, start: c.start, end: c.end });
      if (id && c.label) board.setArrowLabel(id, c.label);
    }
  }
  for (const c of arrows.filter((a) => a.from === stepId)) {
    for (const from of exits) {
      const id = board.connect(from, c.to, { route: c.route, dash: c.dash, weight: c.weight, start: c.start, end: c.end });
      if (id && c.label) board.setArrowLabel(id, c.label);
    }
  }
  // Its own sub-processes now belong to the flowchart.
  const grandchildren = board.frames().filter((f) => f.part?.parent === child.id);
  if (grandchildren.length) board.setParts(new Map(grandchildren.map((g) => [g.id, { ...g.part!, parent: diagramId }])));
  board.remove([stepId, ...bounds, child.id, ...board.frames().filter((f) => f.part?.of === child.id && f.part.role === 'lane').map((f) => f.id)]);
  tidyFlowchart(board, diagramId);
  return true;
}

