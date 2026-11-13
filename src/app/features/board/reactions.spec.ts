import * as Y from 'yjs';
import { ReactionsFeed, reactionsFor } from './reactions';

describe('reactions', () => {
  it('counts each emoji in a fixed order, marking your own', () => {
    const doc = new Y.Doc();
    const feed = new ReactionsFeed(doc);
    doc.getMap('reactions').set('n1', { '🎉': ['ada', 'grace'], '👍': ['grace'] });
    expect(reactionsFor(feed.all(), 'ada').get('n1')).toEqual([
      { emoji: '👍', count: 1, mine: false },
      { emoji: '🎉', count: 2, mine: true },
    ]);
    feed.destroy();
  });
});
