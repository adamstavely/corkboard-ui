import { BoardDoc } from './board-doc';
import { columnDates, roadmapOf, timelinesOf } from './timeline';

describe('timelines', () => {
  it('finds frames that hold columns, outermost only', () => {
    const board = new BoardDoc();
    const w1 = board.addFrame(150, 300, [], 'Week 1');
    const w2 = board.addFrame(950, 300, [], 'Week 2');
    const plan = board.addFrame(0, 0, board.frames(), 'Launch plan');
    board.addFrame(5000, 0, [], 'Elsewhere');
    const [t] = timelinesOf(board.frames());
    expect(timelinesOf(board.frames())).toHaveLength(1);
    expect(t.frame.id).toBe(plan);
    expect(t.columns.map((c) => c.id)).toEqual([w1, w2]);
    board.destroy();
  });

  it('dates each column from a start and a period', () => {
    expect(columnDates({ start: '2026-11-16', every: 'week' }, 1)).toEqual({ start: '2026-11-23', end: '2026-11-29' });
    // Month periods keep the start's day, or the month's last day when it's shorter: never spilling into the next.
    expect(columnDates({ start: '2026-01-31', every: 'month' }, 0)).toEqual({ start: '2026-01-31', end: '2026-02-27' });
    expect(columnDates({ start: '2026-01-31', every: 'month' }, 1)).toEqual({ start: '2026-02-28', end: '2026-03-30' });
    expect(columnDates({ start: '2026-01-31', every: 'month' }, 2)).toEqual({ start: '2026-03-31', end: '2026-04-29' });
    expect(columnDates({ start: '2028-01-30', every: 'month' }, 1)).toEqual({ start: '2028-02-29', end: '2028-03-29' });
    expect(columnDates({ start: '2026-11-30', every: 'quarter' }, 1)).toEqual({ start: '2027-02-28', end: '2027-05-29' });
    expect(columnDates({ start: '2026-01-01', every: 'quarter' }, 1)).toEqual({ start: '2026-04-01', end: '2026-06-30' });
  });

  it('gives an owner a second row when two of their steps share a period', () => {
    const board = new BoardDoc();
    board.addNote(100, 400);
    board.addNote(100, 600);
    board.addFrame(0, 0, board.notes(), 'Week 1');
    board.addFrame(2000, 0, [], 'Week 2');
    board.addFrame(0, 0, board.frames(), 'Plan');
    const { lanes, items } = roadmapOf(timelinesOf(board.frames())[0], board, { start: '2026-11-16', every: 'week' });
    expect(lanes).toEqual([
      { id: 'Unassigned', label: 'Unassigned' },
      { id: 'Unassigned (2)', label: 'Unassigned' },
    ]);
    expect(items.map((i) => i.lane)).toEqual(['Unassigned', 'Unassigned (2)']);
    board.destroy();
  });

  it('draws a bar per note in its column, in its owner’s lane, done when its task is', () => {
    const board = new BoardDoc();
    const a = board.addNote(100, 400);
    const b = board.addNote(1000, 400);
    board.addFrame(0, 0, [board.notes()[0]], 'Week 1');
    board.addFrame(0, 0, [board.notes()[1]], 'Week 2');
    const plan = board.addFrame(0, 0, board.frames(), 'Plan');
    const [t] = timelinesOf(board.frames());
    expect(t.frame.id).toBe(plan);
    const { lanes, items } = roadmapOf(t, board, { start: '2026-11-16', every: 'week' }, [
      { id: 't', key: 'T-1', title: 'x', status: 'done', priority: 0, labels: [], created: '', noteId: b },
    ]);
    expect(lanes).toEqual([{ id: 'Unassigned', label: 'Unassigned' }]);
    expect(items).toEqual([
      { id: a, lane: 'Unassigned', label: 'Week 1', start: '2026-11-16', end: '2026-11-22' },
      { id: b, lane: 'Unassigned', label: 'Week 2', start: '2026-11-23', end: '2026-11-29', status: 'done' },
    ]);
    board.destroy();
  });
});
