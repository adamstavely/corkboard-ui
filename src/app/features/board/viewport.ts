/** Where the board is scrolled and zoomed: a world point p appears on screen at p × zoom + (x, y). */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export function toWorld(v: Viewport, screen: Point): Point {
  return { x: (screen.x - v.x) / v.zoom, y: (screen.y - v.y) / v.zoom };
}

/** Zooms to `zoom`, keeping the world point under `anchor` (a screen point) where it is. */
export function zoomAt(v: Viewport, zoom: number, anchor: Point): Viewport {
  const next = clampZoom(zoom);
  const k = next / v.zoom;
  return { zoom: next, x: anchor.x - (anchor.x - v.x) * k, y: anchor.y - (anchor.y - v.y) * k };
}

/** The rectangle between two corners, whichever way it was dragged. */
export function rectFrom(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
