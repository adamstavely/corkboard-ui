import { signal } from '@angular/core';
import * as Y from 'yjs';

/** A round of dot voting, as the API keeps it in the board's document. */
export interface Voting {
  open: boolean;
  votesEach: number;
  round: number;
}

/** The board's shared timer; `endsAt` is null when none runs. */
export interface Timer {
  endsAt: number | null;
  seconds: number;
  label: string;
  by: string;
}

/** What a note shows during and after a vote: this person's votes on it, and (once the vote is over) everyone's. */
export interface NoteVotes {
  mine: number;
  total: number | null;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** "4:05", or "0:09" – time left, rounded up to the second. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Votes per note for one person: while a vote runs, their own (others' stay hidden so nobody follows the crowd); once
 * it's over, everyone's too. Notes nobody voted for aren't in it.
 */
export function noteVotes(voting: Voting, votes: ReadonlyMap<string, readonly string[]>, me: string): Map<string, NoteVotes> {
  const result = new Map<string, NoteVotes>();
  const add = (id: string, mine: number, total: number) => {
    const was = result.get(id) ?? { mine: 0, total: voting.open ? null : 0 };
    result.set(id, { mine: was.mine + mine, total: was.total === null ? null : was.total + total });
  };
  votes.forEach((ids, person) => ids.forEach((id) => add(id, person === me ? 1 : 0, 1)));
  if (voting.open) for (const [id, v] of result) if (v.mine === 0) result.delete(id);
  return result;
}

/** The notes with the most votes, most first; ties keep board order. */
export function ranking(votes: ReadonlyMap<string, readonly string[]>): { id: string; votes: number }[] {
  const counts = new Map<string, number>();
  votes.forEach((ids) => ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
  return [...counts].map(([id, n]) => ({ id, votes: n })).sort((a, b) => b.votes - a.votes);
}

/** The board's dot voting and timer, live from its document. Only the API writes them. */
export class FacilitationFeed {
  readonly #voting: Y.Map<unknown>;
  readonly #votes: Y.Map<string[]>;
  readonly #timer: Y.Map<unknown>;

  readonly #state = signal<{ voting: Voting; votes: ReadonlyMap<string, readonly string[]>; timer: Timer }>({
    voting: { open: false, votesEach: 0, round: 0 },
    votes: new Map(),
    timer: { endsAt: null, seconds: 0, label: '', by: '' },
  });
  readonly state = this.#state.asReadonly();

  constructor(doc: Y.Doc) {
    this.#voting = doc.getMap('voting');
    this.#votes = doc.getMap('votes');
    this.#timer = doc.getMap('timer');
    for (const map of [this.#voting, this.#votes, this.#timer]) map.observe(this.#update);
    this.#update();
  }

  destroy(): void {
    for (const map of [this.#voting, this.#votes, this.#timer]) map.unobserve(this.#update);
  }

  readonly #update = () => {
    const endsAt = this.#timer.get('endsAt');
    this.#state.set({
      voting: { open: this.#voting.get('open') === true, votesEach: Number(this.#voting.get('votesEach') ?? 0), round: Number(this.#voting.get('round') ?? 0) },
      votes: new Map(this.#votes.entries()),
      timer: {
        endsAt: typeof endsAt === 'number' ? endsAt : null,
        seconds: Number(this.#timer.get('seconds') ?? 0),
        label: text(this.#timer.get('label')),
        by: text(this.#timer.get('by')),
      },
    });
  };
}
