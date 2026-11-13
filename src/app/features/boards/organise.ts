/** Which boards the list shows: everything, starred, recently opened, or one folder's. */
export type BoardFilter = { kind: 'all' } | { kind: 'starred' } | { kind: 'recent' } | { kind: 'folder'; id: string };

/** How many boards "Recent" shows. */
const RECENT = 12;

interface Listed {
  folderId?: string | null;
  starred?: boolean;
  lastVisitedAt?: string | null;
}

/** The boards a filter shows, in its order: recent ones by when they were opened, the rest as they come. */
export function filterBoards<T extends Listed>(boards: readonly T[], filter: BoardFilter): T[] {
  switch (filter.kind) {
    case 'starred':
      return boards.filter((b) => b.starred);
    case 'recent':
      return boards
        .filter((b) => b.lastVisitedAt)
        .sort((a, b) => Date.parse(b.lastVisitedAt!) - Date.parse(a.lastVisitedAt!))
        .slice(0, RECENT);
    case 'folder':
      return boards.filter((b) => b.folderId === filter.id);
    default:
      return [...boards];
  }
}
