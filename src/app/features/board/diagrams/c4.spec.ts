import { BoardDoc } from '../board-doc';
import { arrowLines } from '../export';
import { diagramFrame } from './flow-board';
import { C4_STARTER, diagramLayout, diagramText } from './kinds';
import { c4Text, elementLabel, isC4Text, parseC4, readC4, tidyC4 } from './c4';
import { settleSteps } from './flow-edit';

function place(board: BoardDoc, text = C4_STARTER): string {
  const result = diagramLayout(text);
  if ('error' in result) throw new Error(result.error);
  expect(result.type).toBe('c4');
  return board.addLayout(result.layout, 0, 0).find((id) => diagramFrame(board, id))!;
}
const el = (board: BoardDoc, key: string) => board.items().find((i) => i.part?.key === key)!;

describe('C4 diagrams', () => {
  it('knows C4 text, JSON or Mermaid, and draws people, systems, containers and stores in their boundaries', () => {
    expect(isC4Text(C4_STARTER)).toBe(true);
    expect(isC4Text('C4Context\n  Person(a, "A")')).toBe(true);
    expect(isC4Text('{"diagramType":"flowchart"}')).toBe(false);
    const board = new BoardDoc();
    const id = place(board);
    expect(el(board, 'customer')).toMatchObject({ shape: 'person', part: { type: 'person' } });
    expect(el(board, 'orders')).toMatchObject({ shape: 'cylinder', label: 'Order DB\n[Database: PostgreSQL]' });
    expect(el(board, 'payments')).toMatchObject({ color: 'gray', label: 'Payment Provider\n[External System]' });
    const shop = board.frames().find((f) => f.part?.key === 'shop')!;
    expect(shop).toMatchObject({ border: 'dashed', part: { role: 'group', extra: { kind: 'boundary' } } });
    expect(board.connectors().find((c) => c.from === el(board, 'api').id && c.to === el(board, 'orders').id)?.label).toBe('Reads and writes [SQL]');
    const data = readC4(board, id, false)!;
    expect(data.elements.find((e) => e.id === 'web')).toMatchObject({ kind: 'container', tech: 'React', group: 'platform' });
    expect(data.relations).toHaveLength(4);
    expect(elementLabel({ id: 'x', kind: 'system', name: 'CRM', description: 'Customer records' })).toBe('CRM\n[Software System]\nCustomer records');
    board.destroy();
  });

  it('closes a system to one box at level 1, its relations drawn to the box, and opens it again', () => {
    const board = new BoardDoc();
    const id = place(board);
    expect(tidyC4(board, id, { level: 1 })).toBe(true);
    expect(el(board, 'web').part?.extra?.['hidden']).toBe(true);
    const platform = board.frames().find((f) => f.part?.key === 'platform')!;
    expect(platform.part?.extra).toMatchObject({ collapsed: true });
    const lines = arrowLines(board);
    const into = board.connectors().find((c) => c.from === el(board, 'customer').id)!;
    const line = lines.find((l) => l.id === into.id)!;
    expect(line.end.y).toBeCloseTo(platform.y, -1);
    // Its relations leave from the box too; the model still has every container.
    expect(readC4(board, id, false)!.elements).toHaveLength(5);
    expect(c4Text(board, id)).toMatch(/System\(platform/);
    tidyC4(board, id, { level: 2 });
    expect(el(board, 'web').part?.extra?.['hidden']).toBeUndefined();
    expect(JSON.parse(c4Text(board, id, 'json')!).groups.find((g: { id: string }) => g.id === 'platform').collapsed).toBe(false);
    board.destroy();
  });

  it('makes a box dropped in an open system one of its containers, and reads Mermaid C4', () => {
    const board = new BoardDoc();
    const id = place(board);
    const platform = board.frames().find((f) => f.part?.key === 'platform')!;
    const box = board.addShape(platform.x + platform.w - 60, platform.y + platform.h - 50, 'rect', 'blue', 'Worker');
    settleSteps(board, [box]);
    expect(readC4(board, id, false)!.elements.find((e) => e.name === 'Worker')).toMatchObject({ kind: 'container', group: 'platform' });
    const fromMermaid = parseC4('C4Context\n  title Small\n  Person(u, "User")\n  System(s, "App", "Does things")\n  Rel(u, s, "Uses")');
    if ('error' in fromMermaid) throw new Error(fromMermaid.error);
    expect(fromMermaid.data.elements.map((e) => e.id)).toEqual(['u', 's']);
    expect(diagramText(board, id)).toMatch(/^C4/);
    board.destroy();
  });
});
