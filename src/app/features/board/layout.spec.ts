import { align, distribute, snap, tidy } from './layout';

const box = (id: string, x: number, y: number, w = 100, h = 50) => ({ id, x, y, w, h });

describe('board layout', () => {
  it('snaps an edge or centre to the nearest one close enough, with guides', () => {
    const other = box('o', 300, 100);
    const near = snap({ x: 296, y: 230, w: 100, h: 50 }, [other], 6);
    expect(near.dx).toBe(4);
    expect(near.dy).toBe(0);
    expect(near.guides).toEqual([{ axis: 'x', at: 300, from: 100, to: 280 }]);
    expect(snap({ x: 280, y: 230, w: 100, h: 50 }, [other], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
    // Centres line up too.
    expect(snap({ x: 500, y: 103, w: 100, h: 50 }, [other], 6).dy).toBe(-3);
  });

  it('aligns along an edge or centre', () => {
    const boxes = [box('a', 0, 0), box('b', 200, 40, 50)];
    expect(align(boxes, 'left')).toEqual(new Map([['a', { x: 0, y: 0 }], ['b', { x: 0, y: 40 }]]));
    expect(align(boxes, 'right').get('b')).toEqual({ x: 200, y: 40 });
    expect(align(boxes, 'right').get('a')).toEqual({ x: 150, y: 0 });
    expect(align(boxes, 'middle').get('a')).toEqual({ x: 0, y: 20 });
  });

  it('spaces boxes evenly between the ends', () => {
    const out = distribute([box('a', 0, 0), box('b', 130, 0), box('c', 400, 0)], 'x');
    expect(out.get('a')!.x).toBe(0);
    expect(out.get('b')!.x).toBe(200);
    expect(out.get('c')!.x).toBe(400);
  });

  it('tidies into a grid, keeping reading order', () => {
    const out = tidy([box('c', 500, 300), box('a', 10, 20), box('b', 400, 25), box('d', 0, 310)]);
    expect([...out.entries()].map(([id, p]) => [id, p.x, p.y])).toEqual([
      ['a', 0, 20],
      ['b', 124, 20],
      ['d', 0, 94],
      ['c', 124, 94],
    ]);
  });
});
