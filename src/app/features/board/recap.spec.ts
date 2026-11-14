import type { SessionRecapDto } from '../../api/generated/models/session-recap-dto';
import { threadItems } from './chat';
import { personNamed, recapMarkdown, recapTasks, recapText } from './recap';

const recap: SessionRecapDto = {
  title: 'Sprint 12 retro',
  decisions: [{ text: 'Move to blue-green deploys', sources: ['n1'] }],
  actions: [
    { text: 'Set up the second environment', owner: 'Grace', due: 'Friday', sources: ['n2'] },
    { text: 'Write the rollback runbook', owner: 'Someone new', sources: [] },
  ],
  questions: ['Who pays for it?'],
  model: 'Claude',
  by: 'Ada',
  at: Date.parse('2026-11-14T10:00:00Z'),
};

describe('the session recap', () => {
  it('reads as sections in the chat', () => {
    expect(recapText(recap)).toBe(
      'Recap: Sprint 12 retro\n\nDecisions\n• Move to blue-green deploys\n\nActions\n• Set up the second environment — Grace, by Friday\n• Write the rollback runbook — Someone new\n\nOpen questions\n• Who pays for it?',
    );
    const [item] = threadItems([{ id: 'm', authorId: 'model', name: 'Claude', at: 1, text: 'Recap: …', recap }]);
    expect((item as { text?: string }).text).toBe(recapText(recap));
  });

  it('saves as Markdown with a checklist of actions', () => {
    const md = recapMarkdown(recap, 'Retro board');
    expect(md).toContain('# Sprint 12 retro');
    expect(md).toContain('Board: Retro board');
    expect(md).toContain('- [ ] Set up the second environment — **Grace** (by Friday)');
    expect(md).toContain('## Open questions\n\n- Who pays for it?');
    expect(recapMarkdown({ ...recap, decisions: [] }, '')).toContain('## Decisions\n\n_None recorded._');
  });

  it('becomes tasks, assigned to people on the board when it names them', () => {
    const people = [{ id: 'u1', name: 'Grace Hopper' }, { id: 'u2', name: 'Ada Lovelace' }];
    expect(personNamed('grace', people)?.id).toBe('u1');
    expect(personNamed('Ada Lovelace', people)?.id).toBe('u2');
    expect(personNamed('Linus', people)).toBeUndefined();
    expect(recapTasks(recap, people)).toEqual([
      { title: 'Set up the second environment (by Friday)', status: 'todo', priority: 0, labels: ['action', 'recap'], assignee: 'u1', noteId: 'n2' },
      { title: 'Write the rollback runbook', status: 'todo', priority: 0, labels: ['action', 'recap'] },
    ]);
  });
});
