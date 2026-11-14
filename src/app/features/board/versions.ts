import type { BoardDoc, Frame } from './board-doc';
import { plainText } from './comments';

/** What's different between a saved version of a board and the board now. */
export interface BoardChanges {
  /** Notes written since the version. */
  added: string[];
  /** Notes the version has that are gone now. */
  removed: string[];
  /** Notes whose words changed: before (in the version) and after (now). */
  edited: { before: string; after: string }[];
  /** Notes that are in a different place. */
  moved: number;
  framesAdded: string[];
  framesRemoved: string[];
  /** Frames renamed: before and after. */
  framesRenamed: { before: string; after: string }[];
  /** Images and files added and removed. */
  mediaAdded: string[];
  mediaRemoved: string[];
}

const label = (text: string) => text || 'Empty note';
const title = (f: Frame) => f.title || 'Untitled frame';

/** What would change if the board went back to `then`, as what's happened since: added, removed and edited. */
export function changesSince(then: BoardDoc, now: BoardDoc): BoardChanges {
  const thenNotes = new Map(then.notes().map((n) => [n.id, n]));
  const nowNotes = new Map(now.notes().map((n) => [n.id, n]));
  const thenFrames = new Map(then.frames().map((f) => [f.id, f]));
  const nowFrames = new Map(now.frames().map((f) => [f.id, f]));
  const thenMedia = new Map(then.media().map((m) => [m.id, m]));
  const nowMedia = new Map(now.media().map((m) => [m.id, m]));

  const edited: BoardChanges['edited'] = [];
  let moved = 0;
  for (const [id, was] of thenNotes) {
    const is = nowNotes.get(id);
    if (!is) continue;
    const before = plainText(was.text);
    const after = plainText(is.text);
    if (before !== after) edited.push({ before: label(before), after: label(after) });
    if (was.x !== is.x || was.y !== is.y) moved++;
  }
  return {
    added: [...nowNotes.values()].filter((n) => !thenNotes.has(n.id)).map((n) => label(plainText(n.text))),
    removed: [...thenNotes.values()].filter((n) => !nowNotes.has(n.id)).map((n) => label(plainText(n.text))),
    edited,
    moved,
    framesAdded: [...nowFrames.values()].filter((f) => !thenFrames.has(f.id)).map(title),
    framesRemoved: [...thenFrames.values()].filter((f) => !nowFrames.has(f.id)).map(title),
    framesRenamed: [...thenFrames.values()].flatMap((f) => {
      const is = nowFrames.get(f.id);
      return is && is.title !== f.title ? [{ before: title(f), after: title(is) }] : [];
    }),
    mediaAdded: [...nowMedia.values()].filter((m) => !thenMedia.has(m.id)).map((m) => m.name),
    mediaRemoved: [...thenMedia.values()].filter((m) => !nowMedia.has(m.id)).map((m) => m.name),
  };
}

/** True when the version and the board have the same content. */
export const unchanged = (c: BoardChanges) =>
  !c.added.length && !c.removed.length && !c.edited.length && !c.moved && !c.framesAdded.length && !c.framesRemoved.length && !c.framesRenamed.length && !c.mediaAdded.length && !c.mediaRemoved.length;
