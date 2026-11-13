import { filterBoards } from './organise';

describe('filterBoards', () => {
  const boards = [
    { id: 'a', folderId: 'f1', starred: true, lastVisitedAt: '2026-11-10T00:00:00Z' },
    { id: 'b', folderId: null, starred: false, lastVisitedAt: '2026-11-12T00:00:00Z' },
    { id: 'c', folderId: 'f1', starred: false, lastVisitedAt: null },
  ];

  it('shows starred, recently opened (newest first) or one folder', () => {
    expect(filterBoards(boards, { kind: 'all' }).map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(filterBoards(boards, { kind: 'starred' }).map((b) => b.id)).toEqual(['a']);
    expect(filterBoards(boards, { kind: 'recent' }).map((b) => b.id)).toEqual(['b', 'a']);
    expect(filterBoards(boards, { kind: 'folder', id: 'f1' }).map((b) => b.id)).toEqual(['a', 'c']);
  });
});
