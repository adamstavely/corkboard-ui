import { signal } from '@angular/core';
import type { MultiplayerItem, MultiplayerPerson } from '@adamstavely/trenchcoat/multiplayer-thread';
import * as Y from 'yjs';

/** Who wrote a chat message when it's the model; matches Trench Coat's MULTIPLAYER_MODEL_ID and the API's. */
export const MODEL_AUTHOR = 'model';

/** One message in the board's shared chat, as the API writes it into the board's document. */
export interface ChatMessage {
  id: string;
  /** A person's id, or MODEL_AUTHOR. */
  authorId: string;
  name: string;
  /** Epoch ms. */
  at: number;
  text: string;
  /** On the model's messages: whose message it answers, the notes it's about, and the notes it was asked about. */
  replyTo?: string;
  cited?: string[];
  asked?: string[];
  changes?: { notesAdded: number; notesChanged: number; framesAdded: number; notesMoved: number };
  failed?: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Made 3 frames, moved 9 notes into them and added 2 notes." – what the model did on the board, after what it said. */
export function changesLine(result: { notesAdded: number; notesChanged: number; framesAdded: number; notesMoved: number }): string {
  const parts = [
    result.framesAdded ? `made ${plural(result.framesAdded, 'frame')}` : '',
    result.notesMoved ? `moved ${plural(result.notesMoved, 'note')} into ${result.framesAdded === 1 ? 'it' : 'them'}` : '',
    result.notesAdded ? `added ${plural(result.notesAdded, 'note')}` : '',
    result.notesChanged ? `recoloured ${result.notesChanged}` : '',
  ].filter(Boolean);
  if (!parts.length) return '';
  const line = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `${line[0].toUpperCase()}${line.slice(1)}.`;
}

/** "About “Risks” (4 notes)" – what the model will be asked about. */
export function scopeLine(notes: number, frames: readonly string[]): string {
  const count = `${notes} note${notes === 1 ? '' : 's'}`;
  if (frames.length === 1) return `About “${frames[0]}” (${count})`;
  if (frames.length > 1) return `About ${frames.length} frames (${count})`;
  return notes ? `About the ${count} selected` : 'About the whole board';
}

/** The chat as Trench Coat's thread shows it: the model's messages end with what it changed on the board. */
export function threadItems(messages: readonly ChatMessage[]): MultiplayerItem[] {
  return messages.map((m) => {
    const changes = m.changes ? changesLine(m.changes) : '';
    return { id: m.id, authorId: m.authorId, at: m.at, text: changes ? `${m.text}\n\n${changes}` : m.text, ...(m.replyTo ? { replyTo: m.replyTo } : {}) };
  });
}

/** Everyone the thread should know by name: those here now first, then anyone who wrote in it before. */
export function threadPeople(here: readonly { id: string; name: string }[], messages: readonly ChatMessage[]): MultiplayerPerson[] {
  const people = new Map<string, MultiplayerPerson>();
  for (const p of here) if (!people.has(p.id)) people.set(p.id, { id: p.id, name: p.name });
  for (const m of messages) if (m.authorId !== MODEL_AUTHOR && !people.has(m.authorId)) people.set(m.authorId, { id: m.authorId, name: m.name });
  return [...people.values()];
}

/** The board's chat, live from its document. Only the API writes to it. */
export class ChatFeed {
  readonly #array: Y.Array<ChatMessage>;
  readonly #messages = signal<ChatMessage[]>([]);
  readonly messages = this.#messages.asReadonly();

  constructor(doc: Y.Doc) {
    this.#array = doc.getArray<ChatMessage>('chat');
    this.#array.observe(this.#update);
    this.#update();
  }

  destroy(): void {
    this.#array.unobserve(this.#update);
  }

  readonly #update = () => this.#messages.set(this.#array.toArray());
}
