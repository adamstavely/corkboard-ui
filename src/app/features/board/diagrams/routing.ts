import type { Connector, Frame, Item, ShapeKind } from '../board-doc';
import { FLOW_SCALE, flowEngine, isFlowKind, type FlowEdge, type FlowNode } from './flowchart';

type Box = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

/** An arrow routed round a diagram's steps: its path, its ends, the directions its ends point, and its label's place. */
export interface RoutedArrow {
  d: string;
  start: Point;
  end: Point;
  angle: number;
  startAngle: number;
  mid: Point;
  /** The corners it turns at, start to end. */
  points: Point[];
}

/** How far inside its box a step's outline is, on one side, at a point along that side: arrows end on the outline. */
function outlineInset(shape: ShapeKind, r: Box, side: string, along: number): number {
  const horiz = side === 'top' || side === 'bottom';
  const c = Math.max(0, Math.min(1, horiz ? (along - r.x) / r.w : (along - r.y) / r.h));
  const depth = horiz ? r.h / 2 : r.w / 2;
  const arc = (t: number) => 1 - Math.sqrt(Math.max(0, 1 - t * t));
  switch (shape) {
    case 'diamond':
      return depth * Math.abs(2 * c - 1);
    case 'ellipse':
      return depth * arc(2 * c - 1);
    case 'pill': {
      const r0 = Math.min(r.h / 2, r.w / 2);
      if (horiz) {
        const x = c * r.w;
        const off = x < r0 ? r0 - x : x > r.w - r0 ? x - (r.w - r0) : 0;
        return off ? r0 * arc(off / r0) : 0;
      }
      // The round ends: deepest at the corners, on the box edge halfway up.
      return r0 * arc(2 * c - 1);
    }
    case 'parallelogram': {
      const slant = Math.min(r.w * 0.15, r.h * 0.5);
      return side === 'left' ? slant * (1 - c) : side === 'right' ? slant * c : 0;
    }
    case 'delay': {
      const r0 = Math.min(r.h / 2, r.w / 2);
      if (side === 'right') return r0 * arc(2 * c - 1);
      const x = c * r.w;
      return horiz && x > r.w - r0 ? (r.h / 2) * arc((x - (r.w - r0)) / r0) : 0;
    }
    case 'cylinder':
      return horiz ? Math.min(r.h * 0.15, r.w / 4) * arc(2 * c - 1) : 0;
    default:
      return 0;
  }
}

const routeCache = new Map<string, { key: string; routes: Map<string, RoutedArrow> }>();

/**
 * Right-angled arrows between the steps of each editable diagram, routed together round the steps by the diagram
 * skill's router so they don't cross steps or pile up: the arrows between two steps of one diagram that run at right
 * angles. Others (straight or curved, or to things outside the diagram) are drawn as usual. Results are kept per
 * diagram while nothing it routes round has changed.
 */
export function routeDiagramArrows(frames: readonly Frame[], items: readonly Item[], connectors: readonly Connector[]): Map<string, RoutedArrow> {
  const out = new Map<string, RoutedArrow>();
  const diagrams = frames.filter((f) => f.part?.role === 'diagram' && f.part.of === f.id && isFlowKind(f.part.type));
  if (!diagrams.length) return out;
  for (const diagram of diagrams) {
    const steps = items.filter((i) => i.part?.of === diagram.id && i.part.role === 'step');
    if (steps.length < 2) continue;
    const ids = new Set(steps.map((s) => s.id));
    const arrows = connectors.filter((c) => c.route === 'elbow' && ids.has(c.from) && ids.has(c.to));
    if (!arrows.length) continue;
    const tb = diagram.part!.dir === 'TB';
    // Lanes in order across the flow; a step is in the lane its centre is in.
    const lanes = frames.filter((f) => f.part?.of === diagram.id && f.part.role === 'lane').sort((a, b) => (tb ? a.x - b.x : a.y - b.y));
    const laneOf = (b: Box) => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      return lanes.find((l) => cx >= l.x && cx <= l.x + l.w && cy >= l.y && cy <= l.y + l.h)?.id ?? lanes[0]?.id ?? 'main';
    };
    const nodes: FlowNode[] = steps.map((s) => ({ id: s.id, type: s.part!.type ?? 'task', label: s.kind === 'shape' ? s.label : '', laneId: laneOf(s) }));
    const edges: FlowEdge[] = arrows.map((a) => ({ id: a.id, from: a.from, to: a.to, label: a.label }));
    const boxes = Object.fromEntries(steps.map((s) => [s.id, { x: s.x, y: s.y, w: s.w, h: s.h }]));
    const dividers = lanes.slice(0, -1).map((l) => (tb ? l.x + l.w : l.y + l.h));
    const key = JSON.stringify([tb, boxes, edges, nodes.map((n) => n.laneId), dividers]);
    let cached = routeCache.get(diagram.id);
    if (cached?.key !== key) {
      cached = { key, routes: route(tb, nodes, edges, boxes, dividers, lanes.map((l) => ({ id: l.id, name: l.title })), steps) };
      routeCache.set(diagram.id, cached);
    }
    for (const [id, r] of cached.routes) out.set(id, r);
  }
  return out;
}

function route(tb: boolean, nodes: FlowNode[], edges: FlowEdge[], boxes: Record<string, Box>, laneDividers: number[], lanes: { id: string; name: string }[], steps: readonly Item[]): Map<string, RoutedArrow> {
  const eng = flowEngine();
  const shapeOf = new Map(steps.map((s) => [s.id, s.kind === 'shape' ? s.shape : 'rect']));
  const routes = eng.routeEdgesOrthogonal({
    chartData: { nodes, edges },
    tb,
    boxes,
    laneDividers,
    loopSide: eng.loopSides(nodes, edges, lanes.length ? lanes : [{ id: 'main', name: '' }]),
    outlineInset: (node: FlowNode, r: Box, side: string, along: number) => outlineInset(shapeOf.get(node.id) ?? 'rect', r, side, along),
    labelMaxW: eng.LE.LABEL_MAX_W * FLOW_SCALE,
  });
  const out = new Map<string, RoutedArrow>();
  for (const e of edges) {
    const r = routes[e.id];
    if (!r?.path || r.points.length < 2) continue;
    const p = r.points.map(([x, y]) => ({ x, y }));
    const [a, b] = [p[0], p[1]];
    const [y, z] = [p[p.length - 2], p[p.length - 1]];
    out.set(e.id, {
      d: r.path,
      start: a,
      end: z,
      angle: Math.atan2(z.y - y.y, z.x - y.x),
      startAngle: Math.atan2(a.y - b.y, a.x - b.x),
      mid: { x: r.midX, y: r.midY },
      points: p,
    });
  }
  return out;
}
