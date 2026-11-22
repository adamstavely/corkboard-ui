import * as Y from 'yjs';
import { BoardDoc } from './board-doc';
import { proposedBoard, suggestionDetails, suggestionReason, SuggestionsFeed, type Suggestion } from './suggestions';
import { changesSince } from './versions';

const base: Omit<Suggestion, 'update'> = {
  id: 's1',
  at: 1,
  model: 'Claude',
  forId: 'u1',
  forName: 'Ada',
  asked: 'Add ideas',
  action: 'Would add 2 notes and change 1 note.',
  added: [
    { id: 'n2', attrs: { kind: 'note' }, text: 'Cache the build' },
    { id: 'n3', attrs: { kind: 'note' }, text: 'Split the tests\nby team' },
    { id: 'f1', attrs: { kind: 'frame', title: 'Speed' } },
  ],
  changed: [{ id: 'n1', before: { color: 'yellow' }, after: { color: 'pink' } }],
  removed: [],
};

describe('suggestions', () => {
  it('shows the board as it would be, leaving the board itself alone', () => {
    const now = new BoardDoc();
    const kept = now.addNote(0, 0, 'yellow', 'Slow deploys');
    // The model's copy, changed as the API's draft is.
    const draft = new BoardDoc();
    draft.apply(now.encode());
    const before = Y.encodeStateVector(draft.doc);
    draft.addNote(300, 0, 'green', 'Cache the build');
    draft.setColor([kept], 'pink');
    const update = Y.encodeStateAsUpdate(draft.doc, before);
    const s = { ...base, update: btoa(String.fromCharCode(...update)) };

    const proposed = proposedBoard(now, s);
    expect(now.notes()).toHaveLength(1);
    expect(changesSince(now, proposed)).toMatchObject({ added: ['Cache the build'], recoloured: 1 });
    proposed.destroy();
    draft.destroy();
    now.destroy();
  });

  it('lists what a suggestion adds and changes for its card', () => {
    expect(suggestionDetails({ ...base, update: '' })).toEqual([
      { label: 'Model', value: 'Claude' },
      { label: '2 new notes', value: '“Cache the build”, “Split the tests”' },
      { label: 'New frame', value: '“Speed”' },
      { label: 'Changes', value: '1 existing item' },
    ]);
  });

  it("names an agent's suggestion for the person whose token it used", () => {
    const fromAgent = { ...base, model: 'Cursor', agent: true, asked: 'Sort the retro', update: '' };
    expect(suggestionDetails(fromAgent)[0]).toEqual({ label: 'Agent', value: 'Cursor for Ada' });
    expect(suggestionReason(fromAgent)).toBe('Cursor for Ada: “Sort the retro”');
    expect(suggestionReason({ ...base, update: '' })).toBe('Ada asked: “Add ideas”');
  });

  it('follows the suggestions in the board document, oldest first', () => {
    const doc = new Y.Doc();
    const feed = new SuggestionsFeed(doc);
    doc.getMap<Suggestion>('suggestions').set('b', { ...base, id: 'b', at: 2, update: '' });
    doc.getMap<Suggestion>('suggestions').set('a', { ...base, id: 'a', at: 1, update: '' });
    expect(feed.list().map((s) => s.id)).toEqual(['a', 'b']);
    doc.getMap('suggestions').delete('a');
    expect(feed.list().map((s) => s.id)).toEqual(['b']);
    feed.destroy();
  });
});
