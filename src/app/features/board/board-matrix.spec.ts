import { matrixItems } from './board-matrix';

describe('matrixItems', () => {
  it('puts notes nobody has placed in the middle, and keeps names short', () => {
    expect(
      matrixItems([
        { id: 'a', text: 'Cache the build', value: 9, effort: 2 },
        { id: 'b', text: '  ' },
        { id: 'c', text: 'x'.repeat(80) },
      ]),
    ).toEqual([
      { id: 'a', label: 'Cache the build', value: 9, effort: 2 },
      { id: 'b', label: 'Empty note', value: 5, effort: 5, note: 'Not placed yet' },
      { id: 'c', label: 'x'.repeat(60), value: 5, effort: 5, note: 'Not placed yet' },
    ]);
  });
});
