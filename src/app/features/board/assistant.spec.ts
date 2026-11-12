import { changesLine } from './assistant';

describe('changesLine', () => {
  it('says what the model did on the board', () => {
    expect(changesLine(0, 0)).toBe('');
    expect(changesLine(1, 0)).toBe('Added 1 note.');
    expect(changesLine(3, 2)).toBe('Added 3 notes and recoloured 2.');
    expect(changesLine(0, 4)).toBe('Recoloured 4.');
  });
});
