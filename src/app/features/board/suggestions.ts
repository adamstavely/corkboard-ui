import { signal } from '@angular/core';
import type { ApprovalDetail } from '@adamstavely/trenchcoat/approval-card';
import * as Y from 'yjs';
import { BoardDoc } from './board-doc';

/** Changes the model proposed instead of making, as the API keeps them in the board's document (see corkboard-api's suggestions-doc.ts). */
export interface Suggestion {
  id: string;
  at: number;
  model: string;
  forId: string;
  forName: string;
  /** What was asked, shortened. */
  asked: string;
  /** "Would make 3 frames and move 9 notes into them." */
  action: string;
  added: { id: string; attrs: Record<string, unknown>; text?: string }[];
  changed: { id: string; before: Record<string, unknown>; after: Record<string, unknown> }[];
  removed: string[];
  /** The change itself: a Yjs update, base64. */
  update: string;
}

/** The board's waiting suggestions, oldest first, live from its document. Only the API writes them. */
export class SuggestionsFeed {
  readonly #map: Y.Map<Suggestion>;
  readonly #list = signal<Suggestion[]>([]);
  readonly list = this.#list.asReadonly();

  constructor(doc: Y.Doc) {
    this.#map = doc.getMap<Suggestion>('suggestions');
    this.#map.observe(this.#update);
    this.#update();
  }

  destroy(): void {
    this.#map.unobserve(this.#update);
  }

  readonly #update = () => this.#list.set([...this.#map.values()].sort((a, b) => a.at - b.at));
}

/** The board as it would be with a suggestion made: a copy of it now, with the suggestion's change applied. */
export function proposedBoard(current: BoardDoc, s: Suggestion): BoardDoc {
  const board = new BoardDoc();
  board.apply(Y.encodeStateAsUpdate(current.doc));
  board.apply(Uint8Array.from(atob(s.update), (c) => c.charCodeAt(0)));
  return board;
}

const quoted = (texts: string[], max = 3) => {
  const shown = texts.slice(0, max).map((t) => `“${t.split('\n')[0].slice(0, 80)}”`);
  return texts.length > max ? `${shown.join(', ')} and ${texts.length - max} more` : shown.join(', ');
};

/** What a suggestion's card lists: the model, the notes it would add, and how much it would change. */
export function suggestionDetails(s: Suggestion): ApprovalDetail[] {
  const notes = s.added.filter((n) => n.attrs['kind'] === 'note' && n.text).map((n) => n.text!);
  const frames = s.added.filter((n) => n.attrs['kind'] === 'frame').map((n) => String(n.attrs['title'] ?? 'Untitled'));
  return [
    { label: 'Model', value: s.model },
    ...(notes.length ? [{ label: notes.length === 1 ? 'New note' : `${notes.length} new notes`, value: quoted(notes) }] : []),
    ...(frames.length ? [{ label: frames.length === 1 ? 'New frame' : `${frames.length} new frames`, value: quoted(frames) }] : []),
    ...(s.changed.length ? [{ label: 'Changes', value: `${s.changed.length} existing ${s.changed.length === 1 ? 'item' : 'items'}` }] : []),
    ...(s.removed.length ? [{ label: 'Removes', value: `${s.removed.length} ${s.removed.length === 1 ? 'frame' : 'frames'}` }] : []),
  ];
}
