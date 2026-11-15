import { auditCsv } from './admin-page';

describe('the audit log as CSV', () => {
  it('has a row an event, quotes what needs it, and never lets a cell run as a formula', () => {
    const csv = auditCsv([
      { at: Date.UTC(2026, 10, 14, 12), boardId: 'b1', board: 'Retro, Q4', actorId: 'u1', actorName: 'Ada', actorEmail: 'ada@x.test', action: 'added a note', target: null, detail: 'Says "hi"', restricted: false },
      { at: Date.UTC(2026, 10, 14, 13), boardId: 'b1', board: 'Retro', actorId: 'u2', actorName: 'Ola', actorEmail: null, action: 'wrote a note in a writing round', target: null, detail: '=HYPERLINK("x")', restricted: true },
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('When,Board,Who,Email,User id,Did,What,Detail,Anonymous on the board');
    expect(lines[1]).toBe('2026-11-14T12:00:00.000Z,"Retro, Q4",Ada,ada@x.test,u1,added a note,,"Says ""hi""",');
    expect(lines[2]).toBe(`2026-11-14T13:00:00.000Z,Retro,Ola,,u2,wrote a note in a writing round,,"'=HYPERLINK(""x"")",yes`);
  });
});
