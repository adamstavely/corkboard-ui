import { intersects, MAX_ZOOM, MIN_ZOOM, rectFrom, toWorld, zoomAt } from './viewport';

describe('viewport', () => {
  it('maps screen points to the board through pan and zoom', () => {
    expect(toWorld({ x: 100, y: 50, zoom: 2 }, { x: 300, y: 250 })).toEqual({ x: 100, y: 100 });
  });

  it('zooms around a point, keeping what is under it in place', () => {
    const before = { x: 40, y: -20, zoom: 1 };
    const anchor = { x: 400, y: 300 };
    const after = zoomAt(before, 2.5, anchor);
    expect(after.zoom).toBe(2.5);
    expect(toWorld(after, anchor)).toEqual(toWorld(before, anchor));
  });

  it('keeps zoom within its limits', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 100, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
  });

  it('builds a rectangle from corners dragged either way, and tests overlap', () => {
    const r = rectFrom({ x: 10, y: 40 }, { x: 0, y: 0 });
    expect(r).toEqual({ x: 0, y: 0, w: 10, h: 40 });
    expect(intersects(r, { x: 9, y: 39, w: 5, h: 5 })).toBe(true);
    expect(intersects(r, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });
});
