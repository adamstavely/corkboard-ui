import * as Y from 'yjs';
import { FacilitationFeed, formatRemaining, noteVotes, ranking } from './facilitation';

describe('formatRemaining', () => {
  it('shows minutes and seconds, rounding up', () => {
    expect(formatRemaining(245_000)).toBe('4:05');
    expect(formatRemaining(8_100)).toBe('0:09');
    expect(formatRemaining(-50)).toBe('0:00');
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
});
