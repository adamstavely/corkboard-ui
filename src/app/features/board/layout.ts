/** Something with a place and a size on the board. */
export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A guide line to draw while snapping: vertical at x (from y1 to y2), or horizontal at y (from x1 to x2). */
export type Guide = { axis: 'x'; at: number; from: number; to: number } | { axis: 'y'; at: number; from: number; to: number };

const bounds = (boxes: readonly Box[]) => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
};

/**
 * Where a box being dragged should go to line up with others: the nudge (dx, dy) that brings one of its edges or its
 * centre onto another's, within `within`, and the guides to show. Nothing nearer than that, no nudge.
 */
export function snap(moving: Omit<Box, 'id'>, others: readonly Box[], within: number): { dx: number; dy: number; guides: Guide[] } {
  const lines = (b: Omit<Box, 'id'>, axis: 'x' | 'y') => (axis === 'x' ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h]);
  const best = (axis: 'x' | 'y') => {
    let found: { d: number; at: number; other: Box } | null = null;
    for (const o of others) {
      for (const mine of lines(moving, axis)) {
        for (const theirs of lines(o, axis)) {
          const d = theirs - mine;
          if (Math.abs(d) <= within && (!found || Math.abs(d) < Math.abs(found.d))) found = { d, at: theirs, other: o };
        }
      }
    }
    return found;
  };
  const bx = best('x');
  const by = best('y');
  const guides: Guide[] = [];
  const moved = { ...moving, x: moving.x + (bx?.d ?? 0), y: moving.y + (by?.d ?? 0) };
  if (bx) guides.push({ axis: 'x', at: bx.at, from: Math.min(moved.y, bx.other.y), to: Math.max(moved.y + moved.h, bx.other.y + bx.other.h) });
  if (by) guides.push({ axis: 'y', at: by.at, from: Math.min(moved.x, by.other.x), to: Math.max(moved.x + moved.w, by.other.x + by.other.w) });
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, guides };
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Where each box goes to line up with the others along one edge or centre line. */
export function align(boxes: readonly Box[], how: Alignment): Map<string, { x: number; y: number }> {
  const b = bounds(boxes);
  return new Map(
    boxes.map((box) => {
      const x = how === 'left' ? b.x : how === 'center' ? b.x + b.w / 2 - box.w / 2 : how === 'right' ? b.x + b.w - box.w : box.x;
      const y = how === 'top' ? b.y : how === 'middle' ? b.y + b.h / 2 - box.h / 2 : how === 'bottom' ? b.y + b.h - box.h : box.y;
      return [box.id, { x: Math.round(x), y: Math.round(y) }];
    }),
  );
}

/** Spaces boxes evenly between the first and last along one axis (the ends stay put); needs three or more. */
export function distribute(boxes: readonly Box[], axis: 'x' | 'y'): Map<string, { x: number; y: number }> {
  const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);
  if (sorted.length < 3) return new Map(sorted.map((b) => [b.id, { x: b.x, y: b.y }]));
  const size = axis === 'x' ? 'w' : 'h';
  const first = sorted[0];
  const last = sorted.at(-1)!;
  const room = last[axis] + last[size] - first[axis] - sorted.reduce((sum, b) => sum + b[size], 0);
  const gap = room / (sorted.length - 1);
  let at = first[axis];
  const out = new Map<string, { x: number; y: number }>();
  for (const b of sorted) {
    out.set(b.id, axis === 'x' ? { x: Math.round(at), y: b.y } : { x: b.x, y: Math.round(at) });
    at += b[size] + gap;
  }
  return out;
}

/**
 * Lays boxes out in a tidy grid from where the top-left one is, keeping their reading order (rows top to bottom, then
 * left to right), about as many columns as rows.
 */
export function tidy(boxes: readonly Box[], gap = 24): Map<string, { x: number; y: number }> {
  if (!boxes.length) return new Map();
  const b = bounds(boxes);
  const rowOf = (box: Box) => Math.round(box.y / Math.max(40, Math.min(...boxes.map((x) => x.h)) / 2));
  const ordered = [...boxes].sort((a, c) => rowOf(a) - rowOf(c) || a.x - c.x);
  const columns = Math.ceil(Math.sqrt(ordered.length));
  const cellW = Math.max(...ordered.map((x) => x.w)) + gap;
  const cellH = Math.max(...ordered.map((x) => x.h)) + gap;
  return new Map(ordered.map((box, i) => [box.id, { x: b.x + (i % columns) * cellW, y: b.y + Math.floor(i / columns) * cellH }]));
}
