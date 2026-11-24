import { BoardDoc } from '../board-doc';
import { flowchartLayout } from './flowchart';
import { diagramFrame, readFlowchart, tidyFlowchart } from './flow-board';
import { addLane, addRemark, autoTidies, autoTidy, diagramOf, freshKey, nameStep, setAutoTidy, settleSteps } from './flow-edit';

const SOURCE = `flowchart LR
  subgraph lane_customer["Customer"]
    ask(["Ask"])
    done(["Done"])
  end
  subgraph lane_shop["Shop"]
    check["Check Order"]
    ship["Ship Order"]
  end
  ask --> check --> ship --> done
`;

function place(board: BoardDoc): string {
  const result = flowchartLayout(SOURCE);
  if ('error' in result) throw new Error(result.error);
  return board.addLayout(result.layout, 0, 0).find((id) => diagramFrame(board, id))!;
}
const step = (board: BoardDoc, key: string) => board.items().find((i) => i.part?.key === key)!;

describe('editing flowcharts', () => {
  it('makes a shape dropped in a flowchart one of its steps, in the lane it lands in, and frees one dragged out', () => {
    const board = new BoardDoc();
    const id = place(board);
    const shop = board.frames().find((f) => f.title === 'Shop')!;
    const shape = board.addShape(shop.x + shop.w - 100, shop.y + shop.h - 60, 'diamond', 'blue', 'Paid?');
    expect(settleSteps(board, [shape])).toEqual([id]);
    expect(board.items().find((i) => i.id === shape)?.part).toMatchObject({ of: id, role: 'step', key: 'paid', type: 'decision', lane: 'lane_shop' });
    // It takes its lane's colour.
    expect(board.items().find((i) => i.id === shape)).toMatchObject({ color: shop.fill });
    // A step dropped in without words is named by them once written.
    const blank = board.addShape(shop.x + 80, shop.y + shop.h - 60, 'rect');
    settleSteps(board, [blank]);
    expect(board.items().find((i) => i.id === blank)?.part?.key).toBe('step');
    board.setText(blank, 'Pack Order');
    nameStep(board, blank);
    expect(board.items().find((i) => i.id === blank)?.part?.key).toBe('pack_order');
    board.move([shape], 5000, 0);
    expect(settleSteps(board, [shape])).toEqual([id]);
    expect(board.items().find((i) => i.id === shape)?.part).toBeUndefined();
    board.destroy();
  });

  it('puts a new step dropped on an arrow into the flow there', () => {
    const board = new BoardDoc();
    const id = place(board);
    const check = step(board, 'check');
    const ship = step(board, 'ship');
    // Halfway between Check and Ship, on their arrow.
    const at = { x: (check.x + check.w / 2 + ship.x + ship.w / 2) / 2, y: (check.y + check.h / 2 + ship.y + ship.h / 2) / 2 };
    const shape = board.addShape(at.x, at.y, 'rect', 'blue', 'Pack Order');
    settleSteps(board, [shape]);
    const arrows = board.connectors().map((c) => [c.from, c.to]);
    expect(arrows).toContainEqual([check.id, shape]);
    expect(arrows).toContainEqual([shape, ship.id]);
    expect(arrows).not.toContainEqual([check.id, ship.id]);
    expect(diagramOf(board, shape)).toBe(id);
    board.destroy();
  });

  it('adds lanes and remarks, keeps a step in its lane while the lanes move, and switches Auto-Tidy', () => {
    const board = new BoardDoc();
    const id = place(board);
    const lane = addLane(board, id)!;
    expect(board.frames().find((f) => f.id === lane)?.part).toMatchObject({ role: 'lane', of: id });
    expect(readFlowchart(board, id)!.lanes.map((l) => l.name)).toEqual(['Customer', 'Shop', 'New lane']);
    // Shop moves above Customer: its steps go with it and stay its own.
    const shop = board.frames().find((f) => f.title === 'Shop')!;
    const customer = board.frames().find((f) => f.title === 'Customer')!;
    board.move([shop.id, ...board.diagramMembers([shop.id])], 0, customer.y - shop.y - 10);
    tidyFlowchart(board, id);
    const data = readFlowchart(board, id)!;
    expect(data.lanes.map((l) => l.name)).toEqual(['Shop', 'Customer', 'New lane']);
    expect(data.nodes.find((n) => n.id === 'check')?.laneId).toBe('lane_shop');

    const note = addRemark(board, step(board, 'check').id)!;
    expect(board.notes().find((n) => n.id === note)?.part).toMatchObject({ role: 'note', of: id });
    expect(board.connectors().find((c) => c.from === note)).toMatchObject({ dash: 'dotted', end: 'none' });
    expect(freshKey(board, id, 'Check Order', 'step')).toBe('check_order');
    expect(freshKey(board, id, 'check', 'step')).toBe('check_2');
    expect(freshKey(board, id, 'End', 'step')).toBe('end_step');

    expect(autoTidies(board, id)).toBe(true);
    setAutoTidy(board, id, false);
    expect(autoTidies(board, id)).toBe(false);
    const ship = step(board, 'ship');
    board.move([ship.id], 0, 30);
    autoTidy(board, [id]);
    expect(step(board, 'ship').y).toBe(ship.y + 30);
    setAutoTidy(board, id, true);
    expect(step(board, 'ship').y).not.toBe(ship.y + 30);
    board.destroy();
  });
});
