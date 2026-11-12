import { changesLine, scopeLine } from './assistant';

describe('changesLine', () => {
  const none = { notesAdded: 0, notesChanged: 0, framesAdded: 0, notesMoved: 0 };

  it('says what the model did on the board', () => {
    expect(changesLine(none)).toBe('');
    expect(changesLine({ ...none, notesAdded: 1 })).toBe('Added 1 note.');
    expect(changesLine({ ...none, notesAdded: 3, notesChanged: 2 })).toBe('Added 3 notes and recoloured 2.');
    expect(changesLine({ ...none, notesChanged: 4 })).toBe('Recoloured 4.');
  });

  it('counts frames and the notes moved into them', () => {
    expect(changesLine({ ...none, framesAdded: 4, notesMoved: 12, notesAdded: 3 })).toBe('Made 4 frames, moved 12 notes into them and added 3 notes.');
    expect(changesLine({ ...none, framesAdded: 1, notesMoved: 1 })).toBe('Made 1 frame and moved 1 note into it.');
  });
});

describe('scopeLine', () => {
  it('names what the assistant will be asked about', () => {
    expect(scopeLine(0, [])).toBe('About the whole board');
    expect(scopeLine(1, [])).toBe('About the 1 note selected');
    expect(scopeLine(4, ['Risks'])).toBe('About “Risks” (4 notes)');
    expect(scopeLine(9, ['Risks', 'Wins'])).toBe('About 2 frames (9 notes)');
  });
});
