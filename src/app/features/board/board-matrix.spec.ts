import { matrixItems } from './board-matrix';
import { BoardDoc, cleanMatrixNames } from './board-doc';

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

describe("a matrix's own names", () => {
  it('keeps the names people give it, trimmed, and drops empty ones so the defaults show', () => {
    const board = new BoardDoc();
    const id = board.addView(0, 0, 'matrix');
    board.setMatrixNames(id, {
      heading: '  Risk map ',
      x: 'Likelihood',
      y: 'Impact',
      quickWins: 'Watch',
      bigBets: '',
      fillIns: 'x'.repeat(60),
    });
    const item = board.items().find((i) => i.id === id);
    expect(item?.kind === 'view' && item.matrix).toEqual({
      heading: 'Risk map',
      x: 'Likelihood',
      y: 'Impact',
      quickWins: 'Watch',
      fillIns: 'x'.repeat(40),
    });

    board.setMatrixNames(id, { heading: ' ' });
    const reset = board.items().find((i) => i.id === id);
    expect(reset?.kind === 'view' && reset.matrix).toBeUndefined();
  });

  it('only names matrices', () => {
    const board = new BoardDoc();
    const id = board.addView(0, 0, 'kanban');
    board.setMatrixNames(id, { heading: 'Nope' });
    const item = board.items().find((i) => i.id === id);
    expect(item?.kind === 'view' && item.matrix).toBeUndefined();
  });

  it('reads only the names a matrix may carry', () => {
    expect(cleanMatrixNames({ heading: 'A', evil: 'B', x: 3 })).toEqual({ heading: 'A' });
    expect(cleanMatrixNames('nope')).toBeUndefined();
  });
});
