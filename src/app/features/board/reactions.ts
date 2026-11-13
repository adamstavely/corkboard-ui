import { signal } from '@angular/core';
import * as Y from 'yjs';

export const REACTIONS = ['👍', '❤️', '🎉', '❓', '👀'] as const;

/** A note's reactions as it shows them: each emoji someone used, how many, and whether this person did. */
export interface NoteReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

/** Who reacted with what on each note, for one person; emoji in the fixed order. */
export function reactionsFor(all: ReadonlyMap<string, Record<string, readonly string[]>>, me: string): Map<string, NoteReaction[]> {
  const out = new Map<string, NoteReaction[]>();
  all.forEach((byEmoji, nodeId) => {
    const list = REACTIONS.filter((e) => byEmoji[e]?.length).map((e) => ({ emoji: e, count: byEmoji[e].length, mine: byEmoji[e].includes(me) }));
    if (list.length) out.set(nodeId, list);
  });
  return out;
}

/** The board's reactions, live from its document; only the API writes them. */
export class ReactionsFeed {
  readonly #map: Y.Map<Record<string, string[]>>;
  readonly #all = signal<ReadonlyMap<string, Record<string, readonly string[]>>>(new Map());
  readonly all = this.#all.asReadonly();

  constructor(doc: Y.Doc) {
    this.#map = doc.getMap('reactions');
    this.#map.observe(this.#update);
    this.#update();
  }

  destroy(): void {
    this.#map.unobserve(this.#update);
  }

  readonly #update = () => this.#all.set(new Map(this.#map.entries()));
}
