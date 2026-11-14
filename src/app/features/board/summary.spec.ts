import * as Y from 'yjs';
import { BoardDoc } from './board-doc';
import { contentFingerprint, isStale, SummaryFeed } from './summary';

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
    const board = new BoardDoc();
    const a = board.addNote(0, 0);
    const b = board.addNote(300, 0);
    expect(isStale({ basis: [b, a] }, board)).toBe(false);
    expect(isStale({ basis: [a] }, board)).toBe(true);
    board.destroy();
  });

  it("is stale once a note's text changes, matching the API's fingerprint", () => {
    const board = new BoardDoc();
    board.addNote(0, 0, 'yellow', 'Deploys are slow');
    const fingerprint = contentFingerprint(board);
    expect(isStale({ basis: [], fingerprint }, board)).toBe(false);
    const paragraph = board.notes()[0].text.get(0) as Y.XmlElement;
    (paragraph.get(0) as Y.XmlText).insert(0, 'Very ');
    expect(isStale({ basis: [], fingerprint }, board)).toBe(true);
    board.destroy();
  });
});
