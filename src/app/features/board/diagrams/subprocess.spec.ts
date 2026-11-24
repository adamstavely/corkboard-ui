import { BoardDoc } from '../board-doc';
import { flowchartLayout } from './flowchart';
import { diagramFrame, flowchartMermaid, readFlowchart } from './flow-board';
import { collapseToSubprocess, expandSubprocess, placeChildren, subprocessesOf } from './flow-edit';

const LOAN = `flowchart
  subgraph lane_officer["Loan Officer"]
    submit(["Application Received"])
    verify_income[["Verify Income"]]
    income_ok{"Income Verified?"}
    funded(["Loan Funded"])
    declined(["Application Declined"])
  end
  submit --> verify_income --> income_ok
  income_ok -->|"Yes"| funded
  income_ok -->|"No"| declined

  subgraph sub_verify_income["Verify Income"]
    subgraph lane_officer["Loan Officer"]
      vi_start(["Verify Income"])
      check_payslips["Check Payslips"]
      vi_ok(["Income Verified"])
      vi_fail(["Income Not Verified"])
    end
    subgraph lane_employer["Employer"]
      confirm_salary["Confirm Salary"]
      salary_matches{"Salary Matches?"}
    end
  end
  vi_start --> check_payslips --> confirm_salary --> salary_matches
  salary_matches -->|"Yes"| vi_ok
  salary_matches -->|"No"| vi_fail
`;

function place(board: BoardDoc, source = LOAN): string {
  const result = flowchartLayout(source);
  if ('error' in result) throw new Error(result.error);
  const id = board.addLayout(result.layout, 0, 0).find((x) => diagramFrame(board, x))!;
  placeChildren(board, id, result.children);
  return id;
}

describe('sub-processes', () => {
  it('places a sub_ block as a flowchart of its own under the main one, linked both ways, and writes both back', () => {
    const board = new BoardDoc();
    const id = place(board);
    const [child] = subprocessesOf(board, id);
    const frame = diagramFrame(board, child)!;
    const main = diagramFrame(board, id)!;
    expect(frame.title).toBe('Verify Income');
    expect(frame.part?.parent).toBe(id);
    expect(frame.y).toBeGreaterThan(main.y + main.h);
    expect(board.items().find((i) => i.part?.key === 'verify_income')?.part?.sub).toBe(child);
    // The main flow has only its own lane; the sub-process has both of its.
    expect(readFlowchart(board, id)!.lanes.map((l) => l.name)).toEqual(['Loan Officer']);
    expect(readFlowchart(board, child)!.lanes.map((l) => l.name)).toEqual(['Loan Officer', 'Employer']);
    const text = flowchartMermaid(board, id)!;
    expect(text).toContain('subgraph sub_verify_income');
    expect(text).toContain('confirm_salary');
    board.destroy();
  });

  it('moves steps into a sub-process and back, keeping them the same board things', () => {
    const board = new BoardDoc();
    const id = place(board, `flowchart LR
  a(["Start"]) --> b["Check Order"] --> c["Pack Order"] --> d["Ship Order"] --> e(["Done"])
`);
    const step = (key: string) => board.items().find((i) => i.part?.key === key)!;
    const [pack, ship] = [step('c'), step('d')];
    const child = collapseToSubprocess(board, [pack.id, ship.id], 'Fulfil Order')!;
    expect(diagramFrame(board, child)?.part?.parent).toBe(id);
    expect(board.items().find((i) => i.id === pack.id)?.part?.of).toBe(child);
    const sub = board.items().find((i) => i.part?.of === id && i.part.type === 'subprocess')!;
    expect(sub).toMatchObject({ label: 'Fulfil Order', part: { sub: child } });
    const arrows = () => board.connectors().map((c) => [c.from, c.to]);
    expect(arrows()).toContainEqual([step('b').id, sub.id]);
    expect(arrows()).toContainEqual([sub.id, step('e').id]);
    // Inside: a start into Pack, Pack to Ship, Ship to an end.
    const childData = readFlowchart(board, child)!;
    expect(childData.nodes.map((n) => n.type).sort()).toEqual(['end', 'start', 'task', 'task']);
    expect(childData.edges.map((e) => `${e.from}>${e.to}`)).toContain('c>d');

    expect(expandSubprocess(board, sub.id)).toBe(true);
    expect(diagramFrame(board, child)).toBeNull();
    expect(board.items().find((i) => i.id === sub.id)).toBeUndefined();
    expect(board.items().find((i) => i.id === pack.id)?.part?.of).toBe(id);
    expect(arrows()).toContainEqual([step('b').id, pack.id]);
    expect(arrows()).toContainEqual([ship.id, step('e').id]);
    expect(arrows()).toContainEqual([pack.id, ship.id]);
    expect(readFlowchart(board, id)!.nodes).toHaveLength(5);
    board.destroy();
  });
});
