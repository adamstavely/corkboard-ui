import { BoardDoc, type DrawingItem, type LinkItem, type ShapeItem, type TableItem, type TextItem } from './board-doc';
import { boardBounds } from './export';
import { safeUrl, shapePath } from './items';

describe('shapes, text, drawings, tables and link cards', () => {
  let board: BoardDoc;
  beforeEach(() => (board = new BoardDoc()));
  afterEach(() => board.destroy());

  const item = <T>(id: string) => board.items().find((i) => i.id === id) as T;

  it('adds a shape with a label, and changes its kind, colour and size', () => {
    const id = board.addShape(100, 100, 'diamond', 'pink', 'Ship it?');
    expect(item<ShapeItem>(id)).toMatchObject({ kind: 'shape', shape: 'diamond', color: 'pink', label: 'Ship it?', w: 200, h: 160 });
    board.setShape([id], 'ellipse');
    board.setColor([id], 'green');
    board.setText(id, 'Yes');
    board.resizeItem(id, 10, 300);
    expect(item<ShapeItem>(id)).toMatchObject({ shape: 'ellipse', color: 'green', label: 'Yes', w: 40, h: 300 });
  });

  it('adds text in a size, and changes it', () => {
    const id = board.addText(0, 0, 'Sprint goals', 'lg');
    board.setTextSize([id], 'xl');
    board.setText(id, 'Q4 goals');
    expect(item<TextItem>(id)).toMatchObject({ kind: 'text', text: 'Q4 goals', size: 'xl' });
  });

  it('keeps a pen stroke in its own box, and drops a dot too short to keep', () => {
    expect(board.addDrawing([5, 5])).toBeNull();
    const id = board.addDrawing([100, 100, 150, 120, 200, 100])!;
    const d = item<DrawingItem>(id);
    expect(d).toMatchObject({ kind: 'drawing', x: 97, y: 97, w: 106, h: 26, vw: 106, vh: 26 });
    expect(d.points.slice(0, 2)).toEqual([3, 3]);
  });

  it('fills in table cells one at a time, and drops cells a smaller table loses', () => {
    const id = board.addTable(0, 0, 2, 2);
    board.setCell(id, 0, 0, 'Owner');
    board.setCell(id, 1, 1, 'Grace');
    expect(item<TableItem>(id).cells).toEqual(new Map([['0:0', 'Owner'], ['1:1', 'Grace']]));
    board.resizeTable(id, 1, 3);
    expect(item<TableItem>(id)).toMatchObject({ rows: 1, cols: 3, w: 420, h: 40 });
    expect(item<TableItem>(id).cells).toEqual(new Map([['0:0', 'Owner']]));
  });

  it('fills in a link card from its preview, and only opens web links', () => {
    const id = board.addLink(0, 0, 'https://www.example.com/post');
    expect(item<LinkItem>(id)).toMatchObject({ title: 'example.com', site: 'example.com', image: null });
    board.setLinkPreview(id, { title: 'A post', description: 'About things', image: 'http://insecure/pic.png', site: 'Example' });
    expect(item<LinkItem>(id)).toMatchObject({ title: 'A post', image: null });
    expect(safeUrl('https://example.com')).toBe('https://example.com');
    expect(safeUrl('javascript:alert(1)')).toBe('#');
  });

  it('counts them in the board, and removes them', () => {
    const id = board.addShape(1000, 1000);
    expect(boardBounds(board, 0)).toEqual({ x: 900, y: 940, w: 200, h: 120 });
    board.remove([id]);
    expect(board.items()).toEqual([]);
  });

  it('draws each shape as a closed path', () => {
    for (const s of ['rect', 'ellipse', 'diamond', 'triangle'] as const) expect(shapePath(s, 100, 50)).toMatch(/^M .* Z$/);
  });
});
