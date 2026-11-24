import { BoardDoc } from '../board-doc';
import { arrowLines } from '../export';
import { diagramFrame } from './flow-board';
import { diagramLayout, diagramText, tidyDiagram, USECASE_STARTER } from './kinds';
import { readUsecase, routeUsecase, setRefsShown, setSubfunctionsShown, showsRefs, showsSubfunctions } from './usecase';
import { settleSteps } from './flow-edit';

const SHOP = `---
title: Online shop
---
%% @type usecase
%% @colorKey 1 Ordering
%% @colorKey 2 Payments
flowchart LR
  customer["Customer"]
  member["Registered customer"]
  psp["Payment gateway"]:::system
  subgraph shop["Storefront"]
    browse(["FR-1: Browse catalogue"]):::c1
    checkout(["FR-4: Check out"]):::c1
    voucher(["FR-6: Apply voucher"]):::c1
    pay(["FR-7: Take payment"]):::c2
  end
  class pay subfunction
  member -->|is a| customer
  customer --- browse
  member --- checkout
  checkout -.->|«include»| pay
  voucher -.->|"«extend» (Payment): customer has a code"| checkout
  pay --- psp
  n1>"Guest checkout allowed up to 200 EUR (BR-3)"] -.- checkout
  %% @points checkout Payment
`;

function place(board: BoardDoc, text = SHOP): string {
  const result = diagramLayout(text);
  if ('error' in result) throw new Error(result.error);
  expect(result.type).toBe('usecase');
  return board.addLayout(result.layout, 0, 0).find((id) => diagramFrame(board, id))!;
}

describe('use case diagrams', () => {
  it('lays out actors, the system and its use cases, with each kind of link drawn as UML draws it', () => {
    const board = new BoardDoc();
    const id = place(board);
    expect(diagramFrame(board, id)?.part).toMatchObject({ type: 'usecase' });
    expect(board.frames().find((f) => f.part?.role === 'group')?.title).toBe('Storefront');
    const byKey = (k: string) => board.items().find((i) => i.part?.key === k)!;
    expect(byKey('customer')).toMatchObject({ shape: 'actor', label: 'Customer', part: { type: 'actor' } });
    expect(byKey('psp')).toMatchObject({ shape: 'rect', label: '«system»\nPayment gateway', part: { type: 'system' } });
    expect(byKey('pay')).toMatchObject({ shape: 'ellipse', color: 'green', part: { type: 'subfunction' } });
    const arrow = (from: string, to: string) => board.connectors().find((c) => c.from === byKey(from).id && c.to === byKey(to).id)!;
    expect(arrow('customer', 'browse')).toMatchObject({ dash: 'solid', end: 'none', route: 'curve' });
    expect(arrow('checkout', 'pay')).toMatchObject({ dash: 'dashed', end: 'arrow', label: '«include»' });
    expect(arrow('voucher', 'checkout').label).toBe('«extend» (Payment): customer has a code');
    expect(arrow('member', 'customer').end).toBe('triangle');
    // The colour key and the remark.
    expect(board.items().filter((i) => i.part?.role === 'legend')).toHaveLength(4);
    expect(board.notes()[0].part).toMatchObject({ role: 'note', of: id });
    board.destroy();
  });

  it('reads the diagram back and writes the same Mermaid, routes its links as curves, and tidies', () => {
    const board = new BoardDoc();
    const id = place(board);
    const data = readUsecase(board, id, false)!;
    expect(data.colorKey).toEqual({ '1': 'Ordering', '2': 'Payments' });
    expect(data.actors.find((a) => a.id === 'member')?.parent).toBe('customer');
    expect(data.links.find((l) => l.type === 'extend')).toMatchObject({ from: 'voucher', to: 'checkout', condition: 'customer has a code', extensionPoint: 'Payment' });
    expect(data.useCases.find((u) => u.id === 'checkout')?.extensionPoints).toEqual(['Payment']);
    const text = diagramText(board, id)!;
    expect(text).toMatch(/@type usecase/);
    expect(text).toContain('voucher -.->|"«extend» (Payment): customer has a code"| checkout');
    const lines = arrowLines(board);
    const include = board.connectors().find((c) => c.label === '«include»')!;
    expect(lines.find((l) => l.id === include.id)?.d).toMatch(/^M -?[\d.]+ -?[\d.]+ C /);
    const browse = board.items().find((i) => i.part?.key === 'browse')!;
    board.move([browse.id], 300, 300);
    expect(tidyDiagram(board, id)).toBe(true);
    expect(board.items().find((i) => i.id === browse.id)?.x).toBe(browse.x);
    board.destroy();
  });

  it('makes a dropped ellipse a use case and a dropped figure an actor, and starts from a small example', () => {
    const board = new BoardDoc();
    const id = place(board, USECASE_STARTER);
    const frame = diagramFrame(board, id)!;
    const shop = board.frames().find((f) => f.part?.role === 'group')!;
    const goal = board.addShape(shop.x + shop.w / 2, shop.y + shop.h - 40, 'ellipse', 'blue', 'Track Order');
    const person = board.addShape(frame.x + 40, frame.y + frame.h - 80, 'actor', 'gray', 'Courier');
    settleSteps(board, [goal, person]);
    const data = readUsecase(board, id, false)!;
    expect(data.useCases.find((u) => u.name === 'Track Order')?.subject).toBe('shop');
    expect(data.actors.find((a) => a.name === 'Courier')).toBeDefined();
    board.destroy();
  });

  it('hides sub-functions at goal level, keeping them in the text, and shows requirement ids on request', () => {
    const board = new BoardDoc();
    const id = place(board);
    const pay = board.items().find((i) => i.part?.key === 'pay')!;
    expect(showsSubfunctions(board, id)).toBe(true);
    setSubfunctionsShown(board, id, false);
    expect(showsSubfunctions(board, id)).toBe(false);
    expect(board.items().find((i) => i.id === pay.id)?.part?.extra?.['hidden']).toBe(true);
    // Not laid out or routed, but still in the diagram's text.
    expect(readUsecase(board, id)!.useCases.map((u) => u.id)).not.toContain('pay');
    expect(readUsecase(board, id, false)!.useCases.map((u) => u.id)).toContain('pay');
    const include = board.connectors().find((c) => c.to === pay.id)!;
    expect(routeUsecase(board, diagramFrame(board, id)!).has(include.id)).toBe(false);
    setSubfunctionsShown(board, id, true);
    expect(board.items().find((i) => i.id === pay.id)?.part?.extra?.['hidden']).toBeUndefined();

    expect(showsRefs(board, id)).toBe(false);
    setRefsShown(board, id, true);
    expect(showsRefs(board, id)).toBe(true);
    board.destroy();
  });
});
