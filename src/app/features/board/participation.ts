import type { DataColumn, DataRow, TagTone } from '@adamstavely/trenchcoat/data-table';
import type { ParticipationDto } from '../../api/generated/models/participation-dto';

/** A frame counts as looked at once it has been on someone's screen this long. */
export const LOOK_MS = 3000;
/** Frames looked at are sent at most this often. */
export const SEND_MS = 15_000;

/**
 * Which frames this person has looked at (had on screen for LOOK_MS), sent to the API for the facilitator's
 * participation view. Each frame goes once per visit to the board, and sends are spaced SEND_MS apart, so it costs a
 * request now and then, never one per frame per second.
 */
export class FrameLooks {
  /** Frames on screen now and not yet counted, with when they came on screen. */
  readonly #onScreen = new Map<string, number>();
  readonly #counted = new Set<string>();
  readonly #waiting = new Set<string>();
  #check: ReturnType<typeof setTimeout> | undefined;
  #sendTimer: ReturnType<typeof setTimeout> | undefined;
  #sentAt = -Infinity;

  constructor(private readonly send: (frameIds: string[]) => Promise<unknown>) {}

  /** The frames on screen now. */
  inView(frameIds: readonly string[]): void {
    const now = Date.now();
    const shown = new Set(frameIds);
    for (const id of this.#onScreen.keys()) if (!shown.has(id)) this.#onScreen.delete(id);
    for (const id of shown)
      if (!this.#counted.has(id) && !this.#onScreen.has(id)) this.#onScreen.set(id, now);
    this.#schedule();
  }

  destroy(): void {
    clearTimeout(this.#check);
    clearTimeout(this.#sendTimer);
  }

  /** Checks again when the next frame on screen will have been there long enough. */
  #schedule(): void {
    clearTimeout(this.#check);
    this.#check = undefined;
    if (!this.#onScreen.size) return;
    const due = Math.min(...this.#onScreen.values()) + LOOK_MS;
    this.#check = setTimeout(() => this.#tick(), Math.max(0, due - Date.now()));
  }

  #tick(): void {
    const now = Date.now();
    for (const [id, since] of this.#onScreen) {
      if (now - since < LOOK_MS) continue;
      this.#onScreen.delete(id);
      this.#counted.add(id);
      this.#waiting.add(id);
    }
    this.#schedule();
    this.#queueSend();
  }

  #queueSend(): void {
    if (!this.#waiting.size || this.#sendTimer) return;
    this.#sendTimer = setTimeout(
      () => {
        this.#sendTimer = undefined;
        const ids = [...this.#waiting];
        this.#waiting.clear();
        this.#sentAt = Date.now();
        // Not counting a look is no loss to anyone; there's nothing to tell this person.
        this.send(ids).catch(() => undefined);
      },
      Math.max(0, this.#sentAt + SEND_MS - Date.now()),
    );
  }
}

/** "Since the agenda started at 14:05" or "In the last 3 hours": what the view counts. */
export function sessionLine(
  p: Pick<ParticipationDto, 'since' | 'fromAgenda'>,
  now = Date.now(),
): string {
  if (p.fromAgenda)
    return `Since the agenda started at ${new Date(p.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return `In the last ${Math.round((now - p.since) / 3_600_000)} hours (start the agenda to count from then)`;
}

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

export const QUIET = 'Hasn’t added anything yet';
export const TAKING_PART = 'Taking part';
export const UNSEEN = 'Nobody has looked yet';
export const SEEN = 'Looked at';
/** The words say it; the colours only help. */
export const TONES: Record<string, TagTone> = {
  [QUIET]: 'amber',
  [TAKING_PART]: 'green',
  [UNSEEN]: 'amber',
  [SEEN]: 'gray',
};

// Counts get set widths (wide enough for a header and its sort control) so names have the rest: with equal widths the
// panel cut "Grace Hopper" short.
const COUNT = '5rem';

export const PEOPLE_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Name', type: 'title' },
  { key: 'status', label: 'Status', type: 'tag', width: '9rem' },
  { key: 'here', label: 'Here', type: 'text', width: '6rem' },
  { key: 'notes', label: 'Notes', type: 'number', width: COUNT },
  { key: 'votes', label: 'Votes', type: 'number', width: COUNT },
  { key: 'comments', label: 'Comments', type: 'number', width: '7rem' },
  { key: 'chat', label: 'Chat', type: 'number', width: COUNT },
];

export const FRAME_COLUMNS: DataColumn[] = [
  { key: 'title', label: 'Frame', type: 'title' },
  { key: 'status', label: 'Status', type: 'tag', width: '11rem' },
  { key: 'viewers', label: 'Looked at by', type: 'number', width: '8rem' },
  { key: 'contributors', label: 'Added to by', type: 'number', width: '8rem' },
  { key: 'notes', label: 'New notes', type: 'number', width: '7rem' },
];

/** The team, quietest first, as the API sorted them. Nobody in private mode. */
export function peopleRows(p: ParticipationDto): DataRow[] {
  if (p.private) return [];
  return p.people.map((person) => ({
    id: person.id,
    name: person.name,
    status: person.notes + person.votes + person.comments + person.chat ? TAKING_PART : QUIET,
    here: person.online ? 'Here now' : 'Left',
    notes: person.notes,
    votes: person.votes,
    comments: person.comments,
    chat: person.chat,
  }));
}

/** The frames, those nobody has looked at first. */
export function frameRows(p: ParticipationDto): DataRow[] {
  return p.frames.map((f) => ({
    id: f.id,
    title: f.title || 'Untitled frame',
    status: f.viewers ? SEEN : UNSEEN,
    viewers: f.viewers,
    contributors: f.contributors,
    notes: f.notes,
  }));
}

/** A few plain lines on the room as a whole: the team, who's quiet, and what's only ever counted. */
export function summaryLines(p: ParticipationDto): string[] {
  const t = p.team;
  const lines = [
    t.people
      ? `${plural(t.people, 'person', 'people')} from the team this session, ${t.online} here now. ${t.quiet ? `${plural(t.quiet, 'person hasn’t', 'people haven’t')} added anything yet.` : 'Everyone has added something.'}`
      : 'Nobody from the team has been here this session.',
  ];
  if (p.private)
    lines.push(
      `Private mode is on, so nobody is named. The team added ${plural(t.notes, 'note')}, ${plural(t.votes, 'vote')}, ${plural(t.comments, 'comment')} and ${plural(t.chat, 'chat message')}.`,
    );
  const q = p.participants;
  if (q.people || q.notes || q.votes || q.comments)
    lines.push(
      `${plural(q.people, 'feedback participant')} (${q.online} here now): ${plural(q.notes, 'note')}, ${plural(q.votes, 'vote')}, ${plural(q.comments, 'comment')}. Counted together, never named.`,
    );
  if (p.anonymousNotes)
    lines.push(
      `${plural(p.anonymousNotes, 'anonymous note')} from hidden writing. Counted, never credited to anyone.`,
    );
  if (p.writing.open)
    lines.push(
      `Hidden writing under way: ${plural(p.writing.notes, 'note')} from ${plural(p.writing.writers, 'person', 'people')} so far.`,
    );
  return lines;
}

/** "2 frames nobody has looked at yet", or null when everyone has seen every frame. */
export function unseenLine(p: ParticipationDto): string | null {
  const unseen = p.frames.filter((f) => !f.viewers).length;
  return unseen ? `${plural(unseen, 'frame')} nobody has looked at yet.` : null;
}
