import type { SessionRecapDto } from '../../api/generated/models/session-recap-dto';
import { threadItems } from './chat';
import { personNamed, recapLayout, recapMarkdown, recapTasks, recapTasksLine, recapText, resultLine } from './recap';

const recap: SessionRecapDto = {
  title: 'Sprint 12 retro',
  decisions: [{ text: 'Move to blue-green deploys', sources: ['n1'] }],
  actions: [
    { text: 'Set up the second environment', owner: 'Grace', due: 'Friday', sources: ['n2'] },
    { text: 'Write the rollback runbook', owner: 'Someone new', sources: [] },
  ],
  questions: ['Who pays for it?'],
  results: [],
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

  const results: SessionRecapDto['results'] = [
    { kind: 'agenda', title: 'Steps run', items: [{ label: 'Ideas' }, { label: 'Which theme first?' }] },
    { kind: 'vote', title: 'Which theme first?', items: [{ label: 'Onboarding', count: 7 }, { label: 'Billing', count: 4 }] },
    { kind: 'poll', title: 'Ship on Friday?', open: true, items: [{ label: 'Yes', count: 3 }, { label: 'No', count: 0 }] },
  ];

  it('shows the results exactly as counted, in the chat and the Markdown', () => {
    expect(resultLine(results[1])).toBe('Vote: Which theme first? — Onboarding 7, Billing 4');
    expect(resultLine(results[2])).toBe('Poll: Ship on Friday? (still open) — Yes 3, No 0');
    expect(recapText({ ...recap, results })).toContain('Results\n• Agenda: Steps run — Ideas, Which theme first?\n• Vote: Which theme first? — Onboarding 7, Billing 4');
    expect(recapMarkdown({ ...recap, results }, '')).toContain('## Results\n\n- Agenda: Steps run — Ideas, Which theme first?\n- Vote: Which theme first? — Onboarding 7, Billing 4');
    // Recaps written before results were counted have none, and no section.
    const older = { ...recap } as Partial<SessionRecapDto>;
    delete older.results;
    expect(recapText(older as SessionRecapDto)).not.toContain('Results');
    expect(recapMarkdown(older as SessionRecapDto, '')).not.toContain('## Results');
  });

  it('goes on the board as a frame with its title, a note for each section it has, side by side inside it', () => {
    const layout = recapLayout({ ...recap, questions: [], results });
    expect(layout.frames).toHaveLength(1);
    const [frame] = layout.frames!;
    expect(frame.title).toBe('Sprint 12 retro');
    expect(layout.notes!.map((n) => n.text.split('\n')[0])).toEqual(['**Decisions**', '**Actions**', '**Results**']);
    expect(layout.notes![1].text).toContain('• Set up the second environment — Grace, by Friday');
    for (const n of layout.notes!) {
      expect(n.x).toBeGreaterThanOrEqual(frame.x);
      expect(n.y).toBeGreaterThan(frame.y);
      expect(n.x + n.w!).toBeLessThanOrEqual(frame.x + frame.w);
      expect(n.y + n.h!).toBeLessThanOrEqual(frame.y + frame.h);
    }
    const [a, b] = layout.notes!;
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.w!);
  });

  it('says where the tasks will go', () => {
    expect(recapTasksLine(1, null)).toBe('Its action becomes a task on this board.');
    expect(recapTasksLine(3, 'Jira')).toBe('Its 3 actions become tasks on this board, and go to Jira too.');
  });
});
