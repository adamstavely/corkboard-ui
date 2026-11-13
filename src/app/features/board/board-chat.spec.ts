import * as Y from 'yjs';
import { changesLine, ChatFeed, MODEL_AUTHOR, scopeLine, threadItems, threadPeople, type ChatMessage } from './chat';

describe('changesLine', () => {
  const none = { notesAdded: 0, notesChanged: 0, framesAdded: 0, notesMoved: 0 };

  it('says what the model changed', () => {
    expect(changesLine(none)).toBe('');
    expect(changesLine({ ...none, notesAdded: 1 })).toBe('Added 1 note.');
    expect(changesLine({ ...none, notesAdded: 3, notesChanged: 2 })).toBe('Added 3 notes and recoloured 2.');
    expect(changesLine({ ...none, notesChanged: 4 })).toBe('Recoloured 4.');
  });

  it('describes grouping into frames', () => {
    expect(changesLine({ ...none, framesAdded: 4, notesMoved: 12, notesAdded: 3 })).toBe('Made 4 frames, moved 12 notes into them and added 3 notes.');
    expect(changesLine({ ...none, framesAdded: 1, notesMoved: 1 })).toBe('Made 1 frame and moved 1 note into it.');
  });
});

describe('scopeLine', () => {
  it('names what the model will be asked about', () => {
    expect(scopeLine(0, [])).toBe('About the whole board');
    expect(scopeLine(1, [])).toBe('About the 1 note selected');
    expect(scopeLine(4, ['Risks'])).toBe('About “Risks” (4 notes)');
    expect(scopeLine(9, ['Risks', 'Wins'])).toBe('About 2 frames (9 notes)');
  });
});

describe('the board chat', () => {
  const ada: ChatMessage = { id: '1', authorId: 'ada', name: 'Ada', at: 1, text: '@Claude group this' };
  const answer: ChatMessage = {
    id: '2',
    authorId: MODEL_AUTHOR,
    name: 'Claude',
    at: 2,
    text: 'Grouped by theme.',
    replyTo: 'ada',
    changes: { notesAdded: 0, notesChanged: 0, framesAdded: 3, notesMoved: 9 },
  };

  it("shows the model's changes after its answer, and whose message it answers", () => {
    expect(threadItems([ada, answer])).toEqual([
      { id: '1', authorId: 'ada', at: 1, text: '@Claude group this' },
      { id: '2', authorId: MODEL_AUTHOR, at: 2, text: 'Grouped by theme.\n\nMade 3 frames and moved 9 notes into them.', replyTo: 'ada' },
    ]);
  });

  it("knows who's here and who wrote earlier, once each, and not the model", () => {
    const people = threadPeople([{ id: 'grace', name: 'Grace' }], [ada, answer, { ...ada, id: '3', name: 'Ada L' }]);
    expect(people).toEqual([
      { id: 'grace', name: 'Grace' },
      { id: 'ada', name: 'Ada' },
    ]);
  });

  it('follows the chat in the board document', () => {
    const doc = new Y.Doc();
    const feed = new ChatFeed(doc);
    expect(feed.messages()).toEqual([]);
    doc.getArray<ChatMessage>('chat').push([ada]);
    expect(feed.messages()).toEqual([ada]);
    feed.destroy();
  });
});
