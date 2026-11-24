import { BoardDoc } from '../board-doc';
import { flowchartLayout, isFlowchartText } from './flowchart';

const LOAN = `---
title: Loan application
---
flowchart
  subgraph lane_customer["Applicant"]
    submit(["Submit application"])
    upload_docs[/"Upload missing docs"/]
    rejected(["Rejected"])
  end
  subgraph lane_officer["Loan officer"]
    docs_ok{"Docs complete?"}
    offer@{ shape: doc, label: "Issue offer" }
    funded(["Funded"])
  end
  submit --> docs_ok
  docs_ok -->|"No"| upload_docs
  upload_docs ==>|"Resubmit"| docs_ok
  docs_ok -->|"Yes"| offer --> funded
  docs_ok -->|"Withdrawn"| rejected
  n1>"ID and payslips"] -.- submit
`;

describe('editable flowcharts', () => {
  it('lays Mermaid out as a diagram frame, lanes, steps, notes and arrows, each tagged with its part', () => {
    const result = flowchartLayout(LOAN);
    if ('error' in result) throw new Error(result.error);
    const { layout } = result;
    expect(layout.frames?.map((f) => [f.title, f.part?.role])).toEqual([
      ['Loan application', 'diagram'],
      ['Applicant', 'lane'],
      ['Loan officer', 'lane'],
    ]);
    const shapes = new Map(layout.shapes!.map((s) => [s.key, s]));
    expect(shapes.get('docs_ok')).toMatchObject({ shape: 'diamond', label: 'Docs complete?', part: { role: 'step', key: 'docs_ok', type: 'decision' } });
    expect(shapes.get('submit')?.shape).toBe('pill');
    expect(shapes.get('upload_docs')?.shape).toBe('parallelogram');
    expect(shapes.get('offer')?.shape).toBe('document');
    // Every step sits inside its lane, and lanes sit inside the diagram.
    const [diagram, applicant, officer] = layout.frames!;
    const inside = (b: { x: number; y: number; w: number; h: number }, f: { x: number; y: number; w: number; h: number }) =>
      b.x >= f.x && b.y >= f.y && b.x + b.w <= f.x + f.w && b.y + b.h <= f.y + f.h;
    for (const lane of [applicant, officer]) expect(inside(lane, diagram)).toBe(true);
    expect(inside(shapes.get('submit')!, applicant)).toBe(true);
    expect(inside(shapes.get('docs_ok')!, officer)).toBe(true);
    // The flow runs left to right.
    expect(shapes.get('submit')!.x).toBeLessThan(shapes.get('offer')!.x);
    expect(layout.arrows?.find((a) => a.from === 'docs_ok' && a.to === 'upload_docs')).toMatchObject({ route: 'elbow', label: 'No' });
    expect(layout.notes?.[0]).toMatchObject({ text: 'ID and payslips', part: { role: 'note', key: 'n1' } });
    expect(layout.arrows?.find((a) => a.from === 'note:n1')).toMatchObject({ to: 'submit', dash: 'dotted', end: 'none' });
  });

  it('places a flowchart on the board, every part naming the diagram frame', () => {
    const result = flowchartLayout(LOAN);
    if ('error' in result) throw new Error(result.error);
    const board = new BoardDoc();
    board.addLayout(result.layout, 1000, 1000);
    const diagram = board.frames().find((f) => f.part?.role === 'diagram')!;
    expect(diagram.part).toMatchObject({ of: diagram.id, type: 'flowchart', dir: 'LR' });
    expect(board.items().filter((i) => i.part?.of === diagram.id)).toHaveLength(6);
    expect(board.notes()[0].part).toMatchObject({ of: diagram.id, role: 'note' });
    expect(board.connectors().filter((c) => c.label)).toHaveLength(4);
    // A copy of the whole diagram is a diagram of its own; a step copied alone is a plain shape.
    const all = [diagram.id, ...board.items().map((i) => i.id)];
    const copies = board.duplicate(all, 0, 2000);
    const copy = board.frames().find((f) => f.id !== diagram.id && f.part?.role === 'diagram')!;
    expect(copies).toContain(copy.id);
    expect(board.items().filter((i) => i.part?.of === copy.id)).toHaveLength(6);
    const [lone] = board.duplicate([board.items()[0].id], 0, 4000);
    expect(board.items().find((i) => i.id === lone)?.part).toBeUndefined();
    board.destroy();
  });

  it('reads top-to-bottom flowcharts, refuses what it cannot read, and knows flowchart text when it sees it', () => {
    const tb = flowchartLayout('flowchart TB\n  a(["Start"]) --> b["Do it"] --> c(["Done"])');
    if ('error' in tb) throw new Error(tb.error);
    const [a, , c] = tb.layout.shapes!;
    expect(c.y).toBeGreaterThan(a.y);
    expect(tb.layout.frames).toHaveLength(1);
    expect(flowchartLayout('flowchart\n  a[[[')).toHaveProperty('error');
    expect(isFlowchartText('---\ntitle: X\n---\nflowchart LR\n a-->b')).toBe(true);
    expect(isFlowchartText('graph TD\n a-->b')).toBe(true);
    expect(isFlowchartText('sequenceDiagram\n a->>b: hi')).toBe(false);
    expect(isFlowchartText('just some words')).toBe(false);
  });
});
