import * as Y from 'yjs';
import { isStale, SummaryFeed } from './summary';

describe('the board summary', () => {
  it('follows the summary in the board document', () => {
    const doc = new Y.Doc();
    const feed = new SummaryFeed(doc);
    expect(feed.summary()).toBeNull();
    doc.getMap('summary').set('tldr', 'Deploys are slow.');
    expect(feed.summary()).toMatchObject({ tldr: 'Deploys are slow.', points: [], questions: [] });
    feed.destroy();
  });

  it('is stale once notes are added or removed', () => {
    expect(isStale(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(isStale(['a'], ['a', 'c'])).toBe(true);
    expect(isStale(['a', 'b'], ['a'])).toBe(true);
  });
});
