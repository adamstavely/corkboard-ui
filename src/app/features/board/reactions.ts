import { signal } from '@angular/core';
import * as Y from 'yjs';

import type { IconName } from '../../shared/icon';

/** The reactions, by the key the API stores (an emoji); shown with a Lucide icon and a word, not the emoji. */
export const REACTIONS = ['👍', '❤️', '🎉', '❓', '👀'] as const;
export const REACTION_LOOK: Record<(typeof REACTIONS)[number], { icon: IconName; label: string }> = {
  '👍': { icon: 'thumbsUp', label: 'Agree' },
  '❤️': { icon: 'heart', label: 'Love' },
  '🎉': { icon: 'party', label: 'Celebrate' },
  '❓': { icon: 'help', label: 'Question' },
  '👀': { icon: 'eye', label: 'Looking' },
};
/** How a reaction looks, for any key (an unknown one falls back to a question). */
export const reactionLook = (key: string) => REACTION_LOOK[key as (typeof REACTIONS)[number]] ?? REACTION_LOOK['❓'];

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
