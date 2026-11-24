import { BoardDoc, type EntityItem } from '../board-doc';
import { arrowLines } from '../export';
import { diagramFrame } from './flow-board';
import { diagramLayout, diagramText } from './kinds';
import { columnsText, ERD_STARTER, erdDisplay, isErdText, readColumns, readErd, tidyErd } from './erd';

function place(board: BoardDoc): string {
  const result = diagramLayout(ERD_STARTER);
  if ('error' in result) throw new Error(result.error);
  expect(result.type).toBe('erd');
  return board.addLayout(result.layout, 0, 0).find((id) => diagramFrame(board, id))!;
}
const table = (board: BoardDoc, key: string) => board.items().find((i) => i.part?.key === key) as EntityItem;

describe('ER diagrams', () => {
  it('draws tables with their columns, and relationships with crow’s feet, solid when identifying', () => {
    expect(isErdText(ERD_STARTER)).toBe(true);
    expect(isErdText('flowchart\n a-->b')).toBe(false);
    const board = new BoardDoc();
    const id = place(board);
    const order = table(board, 'order');
    expect(order).toMatchObject({ kind: 'entity', name: 'order', color: 'blue' });
    expect(order.columns).toEqual([{ name: 'id', type: 'uuid', pk: true }, { name: 'customer_id', type: 'uuid', fk: true }, { name: 'placed_at', type: 'timestamptz' }]);
    expect(table(board, 'product').color).toBe('yellow');
    const places = board.connectors().find((c) => c.label === 'places')!;
    expect(places).toMatchObject({ dash: 'dashed', route: 'curve' });
    expect([places.start, places.end].sort()).toEqual(['one', 'zeroMany']);
    const items = board.connectors().find((c) => c.from === table(board, 'order_item').id && c.to === order.id)!;
    expect(items).toMatchObject({ dash: 'solid', start: 'oneMany', end: 'one' });
    // Curved by the engine, and read back as the same diagram.
    expect(arrowLines(board).find((l) => l.id === places.id)?.d).toMatch(/ C /);
    const data = readErd(board, id, false)!;
    expect(data.entities.map((e) => e.id).sort()).toEqual(['customer', 'order', 'order_item', 'product']);
    expect(data.colorKey).toEqual({ '1': 'Sales', '3': 'Catalogue' });
    expect(diagramText(board, id)).toMatch(/erDiagram[\s\S]*order_item/);
    board.destroy();
  });

  it('edits a table as text, and shows key columns only or names only', () => {
    expect(readColumns('uuid id PK\ntext? phone "mobile"\nuuid order_id PK, FK\nnot a column line')).toEqual([
      { name: 'id', type: 'uuid', pk: true },
      { name: 'phone', type: 'text', nullable: true, note: 'mobile' },
      { name: 'order_id', type: 'uuid', pk: true, fk: true },
    ]);
    expect(readColumns(columnsText(readColumns('uuid id PK\ntext? phone')))).toEqual(readColumns('uuid id PK\ntext? phone'));
    const board = new BoardDoc();
    const id = place(board);
    const before = table(board, 'customer').h;
    tidyErd(board, id, { detail: 'names' });
    expect(erdDisplay(board, id).detail).toBe('names');
    expect(table(board, 'customer').h).toBeLessThan(before);
    tidyErd(board, id, { detail: 'all', showTypes: false });
    expect(erdDisplay(board, id)).toEqual({ showTypes: false });
    board.destroy();
  });
});
