import { BoardDoc } from '../board-doc';
import { flowchartLayout } from './flowchart';
import { diagramFrame, flowchartMermaid, readFlowchart, tidyFlowchart } from './flow-board';
import { routeDiagramArrows } from './routing';

const SOURCE = `---
title: Returns
---
flowchart LR
  subgraph lane_customer["Customer"]
    ask(["Ask for a refund"])
    done(["Refunded"])
  end
  subgraph lane_shop["Shop"]
    check{"Within 30 days?"}
    refund["Refund"]
    decline["Decline"]
  end
  ask --> check
  check -->|"Yes"| refund --> done
  check -->|"No"| decline
  n1>"Receipt needed"] -.- check
`;

function place(board: BoardDoc): string {
  const result = flowchartLayout(SOURCE);
  if ('error' in result) throw new Error(result.error);
  const ids = board.addLayout(result.layout, 0, 0);
  return ids.find((id) => diagramFrame(board, id))!;
}

describe('flowcharts on the board', () => {
  it('reads a flowchart back as its model, and writes it as Mermaid that reads the same', () => {
    const board = new BoardDoc();
    const id = place(board);
    const data = readFlowchart(board, id)!;
    expect(data.title).toBe('Returns');
    expect(data.lanes.map((l) => l.name)).toEqual(['Customer', 'Shop']);
    expect(data.nodes.find((n) => n.id === 'check')).toMatchObject({ type: 'decision', laneId: 'lane_shop', label: 'Within 30 days?' });
    expect(data.edges.find((e) => e.from === 'check' && e.to === 'refund')?.label).toBe('Yes');
    expect(data.notes).toEqual([{ id: 'n1', text: 'Receipt needed', nodes: ['check'] }]);
    const text = flowchartMermaid(board, id)!;
    expect(text).toContain('subgraph lane_shop');
    const again = flowchartLayout(text);
    if ('error' in again) throw new Error(again.error);
    expect(again.layout.shapes?.map((s) => s.key).sort()).toEqual(data.nodes.map((n) => n.id).sort());
    board.destroy();
  });

  it('puts a moved step back, and turns the diagram to run top to bottom, in one undo step each', () => {
    const board = new BoardDoc();
    const id = place(board);
    const refund = board.items().find((i) => i.part?.key === 'refund')!;
    board.move([refund.id], 900, 0);
    expect(tidyFlowchart(board, id)).toBe(true);
    // Back inside the diagram, and tidying again changes nothing.
    const frame = diagramFrame(board, id)!;
    const back = board.items().find((i) => i.id === refund.id)!;
    expect(back.x + back.w).toBeLessThanOrEqual(frame.x + frame.w);
    const before = JSON.stringify(board.items().map((i) => [i.id, i.x, i.y]));
    tidyFlowchart(board, id);
    expect(JSON.stringify(board.items().map((i) => [i.id, i.x, i.y]))).toBe(before);
    expect(tidyFlowchart(board, id, 'TB')).toBe(true);
    expect(diagramFrame(board, id)?.part?.dir).toBe('TB');
    const [customer, shop] = board.frames().filter((f) => f.part?.role === 'lane');
    // Lanes are columns now, side by side.
    expect(shop.x).toBeGreaterThan(customer.x);
    expect(shop.y).toBe(customer.y);
    board.undo.undo();
    expect(diagramFrame(board, id)?.part?.dir).toBe('LR');
    board.destroy();
  });

  it('moves everything in a diagram with its frame, and a lane takes its steps', () => {
    const board = new BoardDoc();
    const id = place(board);
    const members = board.diagramMembers([id]);
    // Itself, its two lanes, its steps and its remark.
    expect(members).toHaveLength(board.items().length + board.notes().length + 3);
    const shop = board.frames().find((f) => f.title === 'Shop')!;
    const inShop = board.diagramMembers([shop.id]).map((m) => board.items().find((i) => i.id === m)?.part?.key);
    expect(inShop.sort()).toEqual(['check', 'decline', 'refund']);
    board.destroy();
  });

  it('routes the arrows between steps round them, ending at the outline of each step', () => {
    const board = new BoardDoc();
    place(board);
    const routes = routeDiagramArrows(board.frames(), board.items(), board.connectors());
    const between = board.connectors().filter((c) => c.route === 'elbow');
    expect(routes.size).toBe(between.length);
    const ask = board.items().find((i) => i.part?.key === 'ask')!;
    const arrow = between.find((c) => c.from === ask.id)!;
    const route = routes.get(arrow.id)!;
    expect(route.d.startsWith('M')).toBe(true);
    expect(Number.isFinite(route.angle) && Number.isFinite(route.startAngle)).toBe(true);
    // It leaves the start pill from its edge.
    const onEdge = Math.abs(route.start.x - (ask.x + ask.w)) < 2 || Math.abs(route.start.y - (ask.y + ask.h)) < 2 || Math.abs(route.start.x - ask.x) < 2;
    expect(onEdge).toBe(true);
    board.destroy();
  });
});
