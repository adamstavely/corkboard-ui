import type { BoardDoc } from './board-doc';
import { plainText } from './comments';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The board in a sentence or two, for a screen reader: what's on it, and what each frame holds. "12 notes, 3 frames,
 * 1 image. Frames: What went well (4 notes), What could be better (5 notes), Action items (3 notes)."
 */
export function describeBoard(board: BoardDoc): string {
  const notes = board.notes();
  const frames = board.frames();
  const parts = [
    count(notes.length, 'note'),
    frames.length ? count(frames.length, 'frame') : '',
    board.media().length ? count(board.media().length, 'image or file', 'images and files') : '',
    board.items().length ? count(board.items().length, 'other item') : '',
    board.connectors().length ? count(board.connectors().length, 'arrow') : '',
  ].filter(Boolean);
  if (!notes.length && !frames.length && !board.media().length && !board.items().length) return 'Empty. Press N to add a note.';
  const inside = frames.map((f) => `${f.title || 'Untitled frame'} (${count(board.notesIn([f.id]).length, 'note')})`);
  return `${parts.join(', ')}.${inside.length ? ` Frames: ${inside.join(', ')}.` : ''}`;
}

/** One thing on the board, as it would be read out: "note “Deploys are slow” in What could be better". */
export function describeThing(board: BoardDoc, id: string): string {
  const note = board.notes().find((n) => n.id === id);
  if (note) {
    const frame = board.frames().filter((f) => board.notesIn([f.id]).includes(id)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
    const text = plainText(note.text);
    const tags = note.tags.length ? `, tagged ${note.tags.join(', ')}` : '';
    return `note “${clip(text) || 'empty'}”${frame ? ` in ${frame.title || 'an untitled frame'}` : ''}${tags}`;
  }
  const frame = board.frames().find((f) => f.id === id);
  if (frame) return `frame ${frame.title || 'untitled'}, with ${count(board.notesIn([id]).length, 'note')}`;
  const media = board.media().find((m) => m.id === id);
  if (media) return `${media.kind === 'image' ? 'image' : 'file'} ${media.name}`;
  const item = board.items().find((i) => i.id === id);
  if (item) {
    switch (item.kind) {
      case 'shape':
        return `${item.shape === 'rect' ? 'rectangle' : item.shape}${item.label ? ` “${clip(item.label)}”` : ''}`;
      case 'text':
        return `text “${clip(item.text)}”`;
      case 'drawing':
        return 'drawing';
      case 'table':
        return `table, ${item.rows} by ${item.cols}`;
      case 'link':
        return `link to ${item.title || item.url}`;
    }
  }
  return board.connectors().some((c) => c.id === id) ? 'arrow' : 'something no longer on the board';
}
