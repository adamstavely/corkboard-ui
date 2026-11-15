import * as Y from 'yjs';
import { FacilitationFeed, activityLabel, formatRemaining, noteVotes, pollTally, ranking } from './facilitation';

describe('formatRemaining', () => {
  it('shows minutes and seconds, rounding up', () => {
    expect(formatRemaining(245_000)).toBe('4:05');
    expect(formatRemaining(8_100)).toBe('0:09');
    expect(formatRemaining(-50)).toBe('0:00');
  });
});

describe('activityLabel', () => {
  it('says what a step runs in a few words', () => {
    expect(activityLabel(null)).toBe('');
    expect(activityLabel({ kind: 'writing', anonymous: true })).toBe('Hidden writing, anonymous');
    expect(activityLabel({ kind: 'vote', votesEach: 3 })).toBe('Dot vote, 3 each');
    expect(activityLabel({ kind: 'poll', question: 'Ready?', pollKind: 'fist', options: [] })).toBe('Fist to five: Ready?');
  });
});

describe('noteVotes', () => {
  const votes = new Map([
    ['ada', ['n1', 'n1', 'n2']],
    ['grace', ['n2', 'n3']],
  ]);

  it("shows only your own votes while voting runs, so nobody follows the crowd", () => {
    const open = noteVotes({ open: true, votesEach: 3, round: 1 }, votes, 'ada');
    expect(open).toEqual(
      new Map([
        ['n1', { mine: 2, total: null }],
        ['n2', { mine: 1, total: null }],
      ]),
    );
  });

  it("shows everyone's once it's over", () => {
    const closed = noteVotes({ open: false, votesEach: 3, round: 1 }, votes, 'ada');
    expect(closed.get('n2')).toEqual({ mine: 1, total: 2 });
    expect(closed.get('n3')).toEqual({ mine: 0, total: 1 });
    expect(ranking(votes)).toEqual([
      { id: 'n1', votes: 2 },
      { id: 'n2', votes: 2 },
      { id: 'n3', votes: 1 },
    ]);
  });
});

describe('FacilitationFeed', () => {
  it('follows the vote and the timer in the board document', () => {
    const doc = new Y.Doc();
    const feed = new FacilitationFeed(doc);
    doc.getMap('voting').set('open', true);
    doc.getMap('voting').set('votesEach', 3);
    doc.getMap<string[]>('votes').set('ada', ['n1']);
    doc.getMap('timer').set('endsAt', 5000);
    doc.getMap('timer').set('label', 'Add notes');
    expect(feed.state().voting).toEqual({ open: true, votesEach: 3, round: 0 });
    expect(feed.state().votes.get('ada')).toEqual(['n1']);
    expect(feed.state().timer).toMatchObject({ endsAt: 5000, label: 'Add notes' });
    feed.destroy();
  });

  it('shows a hidden writing round: whether it is on and how many have written, nothing more', () => {
    const doc = new Y.Doc();
    const feed = new FacilitationFeed(doc);
    expect(feed.state().writing.open).toBe(false);
    const w = doc.getMap('writing');
    doc.transact(() => {
      w.set('open', true);
      w.set('anonymous', true);
      w.set('round', 'r1');
      w.set('startedBy', 'Ada');
      w.set('notes', 4);
      w.set('writers', 2);
    });
    expect(feed.state().writing).toEqual({ open: true, anonymous: true, round: 'r1', frameId: null, startedBy: 'Ada', notes: 4, writers: 2 });
    feed.destroy();
  });

  it('shows breakout groups as the API writes them', () => {
    const doc = new Y.Doc();
    const feed = new FacilitationFeed(doc);
    expect(feed.state().breakouts).toEqual({ open: false, groups: [] });
    const groups = [{ frameId: 'f1', members: [{ id: 'u1', name: 'Ada' }], endsAt: 5, seconds: 300 }];
    doc.transact(() => {
      doc.getMap('breakouts').set('open', true);
      doc.getMap('breakouts').set('groups', groups);
    });
    expect(feed.state().breakouts).toEqual({ open: true, groups });
    feed.destroy();
  });

  it('shows who is facilitating and each time they bring everyone', () => {
    const doc = new Y.Doc();
    const feed = new FacilitationFeed(doc);
    expect(feed.state().facilitator).toEqual({ userId: null, name: '' });
    doc.transact(() => {
      doc.getMap('facilitator').set('userId', 'u1');
      doc.getMap('facilitator').set('name', 'Ada');
      doc.getMap('spotlight').set('n', 2);
      doc.getMap('spotlight').set('by', 'Ada');
      doc.getMap('spotlight').set('view', { cx: 1, cy: 2, zoom: 0.5 });
    });
    expect(feed.state().facilitator).toEqual({ userId: 'u1', name: 'Ada' });
    expect(feed.state().spotlight).toEqual({ n: 2, by: 'Ada', view: { cx: 1, cy: 2, zoom: 0.5 } });
    feed.destroy();
  });

  it('reads the agenda (steps saved before activities have none), and no current step when the step it names is gone', () => {
    const doc = new Y.Doc();
    const feed = new FacilitationFeed(doc);
    expect(feed.state().agenda).toEqual({ steps: [], current: null });
    const steps = [{ id: 'a', title: 'Ideas', seconds: 300, frameId: null }];
    doc.transact(() => {
      doc.getMap('agenda').set('steps', steps);
      doc.getMap('agenda').set('current', 0);
    });
    expect(feed.state().agenda).toEqual({ steps: [{ ...steps[0], activity: null }], current: 0 });
    doc.getMap('agenda').set('current', 4);
    expect(feed.state().agenda.current).toBeNull();
    feed.destroy();
  });

  it('reads the poll and its answers, and counts them per answer', () => {
    const doc = new Y.Doc();
    const feed = new FacilitationFeed(doc);
    expect(feed.state().poll).toBeNull();
    doc.transact(() => {
      const poll = doc.getMap('poll');
      poll.set('question', 'Ready?');
      poll.set('kind', 'fist');
      poll.set('options', []);
      poll.set('open', true);
      poll.set('round', 1);
      doc.getMap('pollAnswers').set('ada', 4);
      doc.getMap('pollAnswers').set('bob', 4);
      doc.getMap('pollAnswers').set('cy', 9);
    });
    const { poll, pollAnswers } = feed.state();
    expect(poll).toEqual({ open: true, round: 1, question: 'Ready?', kind: 'fist', options: [] });
    // Out-of-range answers aren't counted.
    expect(pollTally(poll!, pollAnswers)).toEqual([0, 0, 0, 0, 2, 0]);
    expect(pollTally({ ...poll!, kind: 'choice', options: ['A', 'B'] }, new Map([['ada', 1]]))).toEqual([0, 1]);
    feed.destroy();
  });
});
