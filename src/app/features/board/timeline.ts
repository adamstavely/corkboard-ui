import type { RoadmapItem, RoadmapLane, RoadmapStatus } from '@adamstavely/trenchcoat/roadmap-timeline';
import type { BoardDoc, Frame, Note } from './board-doc';
import { ownerAndText, type StoredTask } from './tasks';

/** How long each column of a timeline lasts. */
export type Period = 'week' | '2weeks' | 'month' | 'quarter';
export const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'A week each' },
  { value: '2weeks', label: 'Two weeks each' },
  { value: 'month', label: 'A month each' },
  { value: 'quarter', label: 'A quarter each' },
];

/** When a timeline's first column starts, and how long each lasts; kept on its outer frame. */
export interface Schedule {
  start: string;
  every: Period;
}

/** A timeline on the board: a frame holding columns (frames) side by side, as "turn this plan into a timeline" makes. */
export interface BoardTimeline {
  frame: Frame;
  columns: Frame[];
}

const inside = (inner: Frame, outer: Frame) =>
  inner.id !== outer.id && inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/** Frames that hold two or more columns, outermost only, each with its columns left to right. */
export function timelinesOf(frames: readonly Frame[]): BoardTimeline[] {
  return frames
    .map((frame) => {
      const within = frames.filter((f) => inside(f, frame));
      // Columns are the frames directly inside, not frames inside those.
      const columns = within.filter((c) => !within.some((o) => inside(c, o))).sort((a, b) => a.x - b.x);
      return { frame, columns };
    })
    .filter((t) => t.columns.length >= 2)
    .filter((t, _, all) => !all.some((o) => o.frame.id !== t.frame.id && inside(t.frame, o.frame)));
}

/** The first day of column `i` and its last, as "YYYY-MM-DD". */
export function columnDates(schedule: Schedule, i: number): { start: string; end: string } {
  const [y, m, d] = schedule.start.split('-').map(Number);
  const at = (k: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (schedule.every === 'week') date.setUTCDate(date.getUTCDate() + 7 * k);
    else if (schedule.every === '2weeks') date.setUTCDate(date.getUTCDate() + 14 * k);
    else date.setUTCMonth(date.getUTCMonth() + (schedule.every === 'month' ? 1 : 3) * k);
    return date;
  };
  const end = at(i + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start: at(i).toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const STATUS: Record<StoredTask['status'], RoadmapStatus> = { todo: 'planned', doing: 'active', done: 'done' };

/**
 * A timeline as Trench Coat's roadmap draws it: lanes per owner (bold names on the notes; "Unassigned" for the rest),
 * a bar per note across its column's dates, done or under way when the note's task is. An owner with two steps in one
 * period gets a second row, so bars never cover each other.
 */
export function roadmapOf(timeline: BoardTimeline, board: BoardDoc, schedule: Schedule, tasks: readonly StoredTask[] = []): { lanes: RoadmapLane[]; items: RoadmapItem[] } {
  const lanes = new Map<string, RoadmapLane & { owner: string }>();
  /** Per owner, the columns each of their rows already has a bar in. */
  const rows = new Map<string, Set<number>[]>();
  const items: RoadmapItem[] = [];
  timeline.columns.forEach((column, i) => {
    const dates = columnDates(schedule, i);
    const notes: Note[] = board.notes().filter((n) => board.notesIn([column.id]).includes(n.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const note of notes) {
      const { owner = 'Unassigned', text } = ownerAndText(note.text);
      const ownRows = rows.get(owner) ?? [];
      rows.set(owner, ownRows);
      let row = ownRows.findIndex((used) => !used.has(i));
      if (row < 0) row = ownRows.push(new Set()) - 1;
      ownRows[row].add(i);
      const lane = row ? `${owner} (${row + 1})` : owner;
      if (!lanes.has(lane)) lanes.set(lane, { id: lane, label: owner, owner });
      const task = tasks.find((t) => t.noteId === note.id);
      items.push({ id: note.id, lane, label: text || column.title, ...dates, ...(task ? { status: STATUS[task.status] } : {}) });
    }
  });
  // Each owner's rows together, in the order they first appear; Unassigned last.
  const owners = [...new Set([...lanes.values()].map((l) => l.owner))].sort((a, b) => Number(a === 'Unassigned') - Number(b === 'Unassigned'));
  const ordered = owners.flatMap((o) => [...lanes.values()].filter((l) => l.owner === o).map(({ id, label }) => ({ id, label })));
  return { lanes: ordered, items };
}
