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

/** A hidden writing round: whether it's on, and how many notes from how many people. Never what they say. */
export interface Writing {
  open: boolean;
  anonymous: boolean;
  round: string | null;
  frameId: string | null;
  startedBy: string;
  notes: number;
  writers: number;
}

/** One breakout group: the frame it works in, who's in it, and its own timer. */
export interface BreakoutGroup {
  frameId: string;
  members: { id: string; name: string }[];
  endsAt: number | null;
  seconds: number;
}

export interface Breakouts {
  open: boolean;
  groups: BreakoutGroup[];
}

/** Who holds the facilitator's seat, and the last time they brought everyone to their view. */
export interface Facilitator {
  userId: string | null;
  name: string;
}
export interface Spotlight {
  n: number;
  by: string;
  view: { cx: number; cy: number; zoom: number } | null;
}

/** What a step runs when it starts (moving on wraps it up): hidden writing, a dot vote, or a poll. */
export type StepActivity =
  | { kind: 'writing'; anonymous: boolean }
  | { kind: 'vote'; votesEach: number }
  | { kind: 'poll'; question: string; pollKind: 'choice' | 'fist'; options: string[] };

/** One step of the session's agenda: what it's for, its time (0 for none), the frame everyone goes to, what it runs. */
export interface AgendaStep {
  id: string;
  title: string;
  seconds: number;
  frameId: string | null;
  activity: StepActivity | null;
}

/** A step's activity in a few words, for the run sheet. */
export function activityLabel(a: StepActivity | null): string {
  if (!a) return '';
  if (a.kind === 'writing') return a.anonymous ? 'Hidden writing, anonymous' : 'Hidden writing';
  if (a.kind === 'vote') return `Dot vote, ${a.votesEach} each`;
  return a.pollKind === 'fist' ? `Fist to five: ${a.question}` : `Poll: ${a.question}`;
}
/** The agenda, and the step it's on (null before it starts and after it ends). */
export interface Agenda {
  steps: AgendaStep[];
  current: number | null;
}

/** A quick poll: a question with options, or a fist-to-five (0–5 fingers). */
export interface Poll {
  open: boolean;
  round: number;
  question: string;
  kind: 'choice' | 'fist';
  options: string[];
}

/** How many gave each answer, an option's index or a number of fingers, from 0 up to the last. */
export function pollTally(poll: Poll, answers: ReadonlyMap<string, number>): number[] {
  const tally = Array.from({ length: poll.kind === 'fist' ? 6 : poll.options.length }, () => 0);
  answers.forEach((a) => {
    if (a >= 0 && a < tally.length) tally[a]++;
  });
  return tally;
}

/** The decks planning poker estimates with, as the API has them. "?" is "I can't say yet". */
export const POKER_DECKS = {
  fibonacci: ['0', '1', '2', '3', '5', '8', '13', '21', '?'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL', '?'],
} as const;
export type PokerDeck = keyof typeof POKER_DECKS;

/** A round of planning poker: what's being estimated, with which deck, and whether the estimates are shown yet. */
export interface Poker {
  round: string;
  deck: PokerDeck;
  taskId: string | null;
  noteId: string | null;
  title: string;
  revealed: boolean;
  startedBy: string;
}

/** A task's estimate is a T-shirt size, so story points go in as the size they're nearest. */
const SIZE_FOR_POINTS: Record<string, string> = { '0': 'XS', '1': 'XS', '2': 'S', '3': 'M', '5': 'M', '8': 'L', '13': 'XL', '21': 'XL' };

/**
 * The revealed estimates: how many gave each card (in the deck's order, only those given), the average and spread of
 * the numeric ones, whether everyone agreed, and the size to suggest for the task: the most given, the larger on a tie.
 */
export function pokerSummary(poker: Poker, estimates: ReadonlyMap<string, string>) {
  const deck: readonly string[] = POKER_DECKS[poker.deck];
  const given = [...estimates.values()].filter((v) => deck.includes(v));
  const counts = deck.map((value) => ({ value, count: given.filter((v) => v === value).length })).filter((c) => c.count > 0);
  const sized = given.filter((v) => v !== '?');
  const numbers = poker.deck === 'fibonacci' ? sized.map(Number) : [];
  const most = counts.filter((c) => c.value !== '?').reduce<{ value: string; count: number } | null>((best, c) => (!best || c.count >= best.count ? c : best), null);
  const top = most?.value ?? null;
  return {
    counts,
    total: given.length,
    average: numbers.length ? Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 10) / 10 : null,
    spread: sized.length > 1 ? `${sized.reduce((a, b) => (deck.indexOf(a) <= deck.indexOf(b) ? a : b))}–${sized.reduce((a, b) => (deck.indexOf(a) >= deck.indexOf(b) ? a : b))}` : null,
    agreed: sized.length > 1 && new Set(sized).size === 1,
    size: top === null ? null : poker.deck === 'tshirt' ? top : (SIZE_FOR_POINTS[top] ?? null),
  };
}

/** The board's dot voting, timer, hidden writing, breakouts, agenda and poll, live from its document. Only the API writes them. */
export class FacilitationFeed {
  readonly #voting: Y.Map<unknown>;
  readonly #votes: Y.Map<string[]>;
  readonly #timer: Y.Map<unknown>;
  readonly #writing: Y.Map<unknown>;
  readonly #breakouts: Y.Map<unknown>;
  readonly #facilitator: Y.Map<unknown>;
  readonly #spotlight: Y.Map<unknown>;
  readonly #agenda: Y.Map<unknown>;
  readonly #poll: Y.Map<unknown>;
  readonly #pollAnswers: Y.Map<number>;
  readonly #poker: Y.Map<unknown>;
  readonly #pokerEstimates: Y.Map<string>;
  readonly #privacy: Y.Map<unknown>;

  readonly #state = signal<{
    voting: Voting;
    votes: ReadonlyMap<string, readonly string[]>;
    timer: Timer;
    writing: Writing;
    breakouts: Breakouts;
    facilitator: Facilitator;
    spotlight: Spotlight;
    agenda: Agenda;
    poll: Poll | null;
    pollAnswers: ReadonlyMap<string, number>;
    poker: Poker | null;
    /** Who has estimated (an empty value) until the reveal, then each one's estimate. */
    pokerEstimates: ReadonlyMap<string, string>;
    /** Private mode: pointers, selections and names hidden while it's on. */
    privacy: { on: boolean; by: string };
  }>({
    voting: { open: false, votesEach: 0, round: 0 },
    votes: new Map(),
    timer: { endsAt: null, seconds: 0, label: '', by: '' },
    writing: { open: false, anonymous: false, round: null, frameId: null, startedBy: '', notes: 0, writers: 0 },
    breakouts: { open: false, groups: [] },
    facilitator: { userId: null, name: '' },
    spotlight: { n: 0, by: '', view: null },
    agenda: { steps: [], current: null },
    poll: null,
    pollAnswers: new Map(),
    poker: null,
    pokerEstimates: new Map(),
    privacy: { on: false, by: '' },
  });
  readonly state = this.#state.asReadonly();

  constructor(doc: Y.Doc) {
    this.#voting = doc.getMap('voting');
    this.#votes = doc.getMap('votes');
    this.#timer = doc.getMap('timer');
    this.#writing = doc.getMap('writing');
    this.#breakouts = doc.getMap('breakouts');
    this.#facilitator = doc.getMap('facilitator');
    this.#spotlight = doc.getMap('spotlight');
    this.#agenda = doc.getMap('agenda');
    this.#poll = doc.getMap('poll');
    this.#pollAnswers = doc.getMap('pollAnswers');
    this.#poker = doc.getMap('poker');
    this.#pokerEstimates = doc.getMap('pokerEstimates');
    this.#privacy = doc.getMap('privacy');
    for (const map of this.#maps()) map.observe(this.#update);
    this.#update();
  }

  destroy(): void {
    for (const map of this.#maps()) map.unobserve(this.#update);
  }

  #maps(): Y.Map<unknown>[] {
    return [this.#voting, this.#votes as Y.Map<unknown>, this.#timer, this.#writing, this.#breakouts, this.#facilitator, this.#spotlight, this.#agenda, this.#poll, this.#pollAnswers as Y.Map<unknown>, this.#poker, this.#pokerEstimates as Y.Map<unknown>, this.#privacy];
  }

  #agendaOf(): Agenda {
    // Steps saved before steps had activities have none.
    const steps = Array.isArray(this.#agenda.get('steps')) ? (this.#agenda.get('steps') as AgendaStep[]).map((s) => ({ ...s, activity: s.activity ?? null })) : [];
    const current = this.#agenda.get('current');
    return { steps, current: typeof current === 'number' && current >= 0 && current < steps.length ? current : null };
  }

  #pollOf(): Poll | null {
    if (!this.#poll.has('question')) return null;
    return {
      open: this.#poll.get('open') === true,
      round: Number(this.#poll.get('round') ?? 0),
      question: text(this.#poll.get('question')),
      kind: this.#poll.get('kind') === 'fist' ? 'fist' : 'choice',
      options: Array.isArray(this.#poll.get('options')) ? (this.#poll.get('options') as string[]) : [],
    };
  }

  #pokerOf(): Poker | null {
    const round = this.#poker.get('round');
    if (typeof round !== 'string') return null;
    const id = (k: string) => (typeof this.#poker.get(k) === 'string' ? (this.#poker.get(k) as string) : null);
    return {
      round,
      deck: this.#poker.get('deck') === 'tshirt' ? 'tshirt' : 'fibonacci',
      taskId: id('taskId'),
      noteId: id('noteId'),
      title: text(this.#poker.get('title')),
      revealed: this.#poker.get('revealed') === true,
      startedBy: text(this.#poker.get('startedBy')),
    };
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
      writing: {
        open: this.#writing.get('open') === true,
        anonymous: this.#writing.get('anonymous') === true,
        round: text(this.#writing.get('round')) || null,
        frameId: text(this.#writing.get('frameId')) || null,
        startedBy: text(this.#writing.get('startedBy')),
        notes: Number(this.#writing.get('notes') ?? 0),
        writers: Number(this.#writing.get('writers') ?? 0),
      },
      breakouts: {
        open: this.#breakouts.get('open') === true,
        groups: Array.isArray(this.#breakouts.get('groups')) ? (this.#breakouts.get('groups') as BreakoutGroup[]) : [],
      },
      facilitator: { userId: text(this.#facilitator.get('userId')) || null, name: text(this.#facilitator.get('name')) },
      spotlight: {
        n: Number(this.#spotlight.get('n') ?? 0),
        by: text(this.#spotlight.get('by')),
        view: (this.#spotlight.get('view') as Spotlight['view']) ?? null,
      },
      agenda: this.#agendaOf(),
      poll: this.#pollOf(),
      pollAnswers: new Map(this.#pollAnswers.entries()),
      poker: this.#pokerOf(),
      pokerEstimates: new Map(this.#pokerEstimates.entries()),
      privacy: { on: this.#privacy.get('on') === true, by: text(this.#privacy.get('by')) },
    });
  };
}
