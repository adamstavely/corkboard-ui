import { auditEvents } from './board-activity';

describe('board activity', () => {
  it('shows each event as the audit trail does, leaving out what it lacks', () => {
    expect(
      auditEvents([
        { id: '1', at: 5, actor: 'Ada', action: 'renamed the board', target: 'Retro', detail: 'Was "Untitled"' },
        { id: '2', at: 4, actor: 'Grace', action: 'commented', target: null, detail: null },
      ]),
    ).toEqual([
      { id: '1', at: 5, actor: 'Ada', action: 'renamed the board', target: 'Retro', detail: 'Was "Untitled"' },
      { id: '2', at: 4, actor: 'Grace', action: 'commented' },
    ]);
  });
});
