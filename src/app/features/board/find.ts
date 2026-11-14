import type { BoardDoc } from './board-doc';
import { plainText } from './comments';

/** What to find on the board: words, a tag, and who added a note. Empty parts don't narrow anything. */
export interface FindQuery {
  text: string;
  tag: string;
  person: string;
}

export const NO_QUERY: FindQuery = { text: '', tag: '', person: '' };
export const isActive = (q: FindQuery) => !!(q.text.trim() || q.tag || q.person);

/**
 * The things on the board that match, in reading order (top to bottom, left to right); null when nothing is being
 * looked for. Words match notes, frame titles, shapes, text, table cells, link cards and file names; a tag or a person
 * narrows to notes.
 */
export function findOnBoard(board: BoardDoc, q: FindQuery): string[] | null {
  if (!isActive(q)) return null;
  const words = q.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const narrowsToNotes = !!(q.tag || q.person);
  const found: { id: string; x: number; y: number }[] = [];
  for (const n of board.notes()) {
    if (q.tag && !n.tags.includes(q.tag)) continue;
    if (q.person && n.createdBy?.id !== q.person && n.authorName !== q.person) continue;
    if (words.length && !hit(`${plainText(n.text)} ${n.tags.join(' ')}`)) continue;
    found.push(n);
  }
  if (!narrowsToNotes && words.length) {
    for (const f of board.frames()) if (hit(f.title)) found.push(f);
    for (const m of board.media()) if (hit(m.name)) found.push(m);
    for (const i of board.items()) {
      const text =
        i.kind === 'shape' ? i.label : i.kind === 'text' ? i.text : i.kind === 'table' ? [...i.cells.values()].join(' ') : i.kind === 'link' ? `${i.title} ${i.description} ${i.url}` : '';
      if (text && hit(text)) found.push(i);
    }
  }
  return found.sort((a, b) => a.y - b.y || a.x - b.x).map((f) => f.id);
}

/** Everyone who's added a note here, by name, for the person filter. */
export function notePeople(board: BoardDoc): { id: string; name: string }[] {
  const people = new Map<string, string>();
  for (const n of board.notes()) {
    if (n.createdBy) people.set(n.createdBy.id, n.createdBy.name);
    else if (n.authorName) people.set(n.authorName, n.authorName);
  }
  return [...people].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Every tag on the board's notes, most used first. */
export function boardTags(board: BoardDoc): string[] {
  const counts = new Map<string, number>();
  for (const n of board.notes()) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}
