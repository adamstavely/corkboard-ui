import { BoardDoc } from '../board-doc';
import { arrowLines } from '../export';
import { diagramFrame } from './flow-board';
import { C4_STARTER, diagramLayout, diagramText } from './kinds';
import { c4Text, elementLabel, isC4Text, parseC4, readC4, tidyC4 } from './c4';
import { settleSteps } from './flow-edit';

/** A landscape at levels 1 and 2 only (the starter before it gained components and code). */
const LANDSCAPE = JSON.stringify({
  diagramType: 'c4',
  title: 'Shop system landscape',
  groups: [
    { id: 'shop', name: 'Shop', kind: 'boundary' },
    { id: 'platform', name: 'Order Platform', kind: 'system', parent: 'shop', collapsed: false },
    { id: 'outside', name: 'Third-party services', kind: 'boundary' },
  ],
  elements: [
    {
      id: 'customer',
      kind: 'person',
      name: 'Customer',
      description: 'Buys products online',
      color: '1',
    },
    { id: 'web', kind: 'container', name: 'Web App', tech: 'React', group: 'platform' },
    { id: 'api', kind: 'container', name: 'API', tech: 'Node.js, REST', group: 'platform' },
    { id: 'orders', kind: 'database', name: 'Order DB', tech: 'PostgreSQL', group: 'platform' },
    { id: 'payments', kind: 'external', name: 'Payment Provider', group: 'outside' },
  ],
  relations: [
    { from: 'customer', to: 'web', label: 'Browses and orders', tech: 'HTTPS' },
    { from: 'web', to: 'api', label: 'Calls', tech: 'JSON/HTTPS' },
    { from: 'api', to: 'orders', label: 'Reads and writes', tech: 'SQL' },
    { from: 'api', to: 'payments', label: 'Charges cards', tech: 'REST' },
  ],
});

function place(board: BoardDoc, text = LANDSCAPE): string {
  const result = diagramLayout(text);
  if ('error' in result) throw new Error(result.error);
  expect(result.type).toBe('c4');
  return board.addLayout(result.layout, 0, 0).find((id) => diagramFrame(board, id))!;
}
const el = (board: BoardDoc, key: string) => board.items().find((i) => i.part?.key === key)!;

describe('C4 diagrams', () => {
  it('knows C4 text, JSON or Mermaid, and draws people, systems, containers and stores in their boundaries', () => {
    expect(isC4Text(C4_STARTER)).toBe(true);
    expect(isC4Text(LANDSCAPE)).toBe(true);
    expect(isC4Text('C4Context\n  Person(a, "A")')).toBe(true);
    expect(isC4Text('{"diagramType":"flowchart"}')).toBe(false);
    const board = new BoardDoc();
    const id = place(board);
    expect(el(board, 'customer')).toMatchObject({ shape: 'person', part: { type: 'person' } });
    expect(el(board, 'orders')).toMatchObject({
      shape: 'cylinder',
      label: 'Order DB\n[Database: PostgreSQL]',
    });
    expect(el(board, 'payments')).toMatchObject({
      color: 'gray',
      label: 'Payment Provider\n[External System]',
    });
    const shop = board.frames().find((f) => f.part?.key === 'shop')!;
    expect(shop).toMatchObject({
      border: 'dashed',
      part: { role: 'group', extra: { kind: 'boundary' } },
    });
    expect(
      board
        .connectors()
        .find((c) => c.from === el(board, 'api').id && c.to === el(board, 'orders').id)?.label,
    ).toBe('Reads and writes [SQL]');
    const data = readC4(board, id, false)!;
    expect(data.elements.find((e) => e.id === 'web')).toMatchObject({
      kind: 'container',
      tech: 'React',
      group: 'platform',
    });
    expect(data.relations).toHaveLength(4);
    expect(
      elementLabel({ id: 'x', kind: 'system', name: 'CRM', description: 'Customer records' }),
    ).toBe('CRM\n[Software System]\nCustomer records');
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
    expect(
      JSON.parse(c4Text(board, id, 'json')!).groups.find((g: { id: string }) => g.id === 'platform')
        .collapsed,
    ).toBe(false);
    board.destroy();
  });

  it('makes a box dropped in an open system one of its containers, and reads Mermaid C4', () => {
    const board = new BoardDoc();
    const id = place(board);
    const platform = board.frames().find((f) => f.part?.key === 'platform')!;
    const box = board.addShape(
      platform.x + platform.w - 60,
      platform.y + platform.h - 50,
      'rect',
      'blue',
      'Worker',
    );
    settleSteps(board, [box]);
    expect(readC4(board, id, false)!.elements.find((e) => e.name === 'Worker')).toMatchObject({
      kind: 'container',
      group: 'platform',
    });
    const fromMermaid = parseC4(
      'C4Context\n  title Small\n  Person(u, "User")\n  System(s, "App", "Does things")\n  Rel(u, s, "Uses")',
    );
    if ('error' in fromMermaid) throw new Error(fromMermaid.error);
    expect(fromMermaid.data.elements.map((e) => e.id)).toEqual(['u', 's']);
    expect(diagramText(board, id)).toMatch(/^C4/);
    board.destroy();
  });

  it('opens all four levels: systems to containers, containers to components, components to their code', () => {
    const board = new BoardDoc();
    const id = place(board, C4_STARTER);
    const shown = (key: string) => el(board, key).part?.extra?.['hidden'] !== true;
    const group = (key: string) => board.frames().find((f) => f.part?.key === key)!;
    // Level 2 to start: the API is one box, its components and code inside it.
    expect(group('api')).toMatchObject({ part: { extra: { kind: 'container', collapsed: true } } });
    expect(shown('web')).toBe(true);
    expect(shown('orders-api')).toBe(false);
    tidyC4(board, id, { level: 3 });
    expect(shown('orders-api')).toBe(true);
    expect(group('ordering').part?.extra).toMatchObject({ kind: 'component', collapsed: true });
    expect(shown('order-service')).toBe(false);
    tidyC4(board, id, { level: 4 });
    expect(shown('order-service')).toBe(true);
    expect(el(board, 'order-repo')).toMatchObject({
      label: 'OrderRepository\n[Code: interface]\n+save(order): void\n+find(id): Order',
    });
    // Its members read back a line each; and back to level 1, everything is inside the systems' boxes.
    expect(readC4(board, id, false)!.elements.find((e) => e.id === 'order-status')).toMatchObject({
      kind: 'code',
      tech: 'enum',
      description: 'PLACED\nPAID\nSHIPPED',
      group: 'ordering',
    });
    tidyC4(board, id, { level: 1 });
    expect(shown('web') || shown('orders-api') || shown('order-service')).toBe(false);
    // One component opened on its own, the rest as they are.
    tidyC4(board, id, { level: 3 });
    tidyC4(board, id, { collapse: { ordering: false } });
    expect(shown('order-service')).toBe(true);
    // Deeper than Mermaid's C4 goes: written as the JSON model.
    expect(JSON.parse(diagramText(board, id)!).groups.map((g: { kind: string }) => g.kind)).toEqual(
      expect.arrayContaining(['container', 'component']),
    );
    board.destroy();
  });
});
