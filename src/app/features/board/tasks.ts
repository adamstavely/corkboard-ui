import { signal } from '@angular/core';
import type { Task, TaskStatus } from '@adamstavely/trenchcoat/task-board';
import * as Y from 'yjs';
import type { BoardDoc, Note } from './board-doc';

export type TaskState = 'todo' | 'doing' | 'done';

/** A task as the board's document keeps it. Due dates are calendar days, so they mean the same to everyone. */
export interface StoredTask {
  id: string;
  key: string;
  title: string;
  status: TaskState;
  priority: Task['priority'];
  estimate?: Task['estimate'];
  /** A person's user id. */
  assignee?: string;
  labels: string[];
  /** "YYYY-MM-DD". */
  due?: string;
  /** The note it came from, if any. */
  noteId?: string;
  /** ISO time. */
  created: string;
}

export const TASK_STATUSES: TaskStatus[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

export const ACTION_LABEL = 'action';

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY;

/** As Trench Coat's task board shows it: the due date as days from today. */
export function toTask(t: StoredTask, now = Date.now()): Task {
  const dueIn = t.due ? Math.round((Date.parse(t.due) - dayStart(now)) / DAY) : undefined;
  return {
    id: t.id,
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    labels: t.labels,
    // The card prints it as is.
    created: new Date(t.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    ...(t.estimate ? { estimate: t.estimate } : {}),
    ...(t.assignee ? { assignee: t.assignee } : {}),
    ...(dueIn !== undefined ? { dueIn } : {}),
  };
}

/** Back from the task board, keeping what it doesn't know about (the note it came from). */
export function fromTask(task: Task, was: StoredTask | undefined, now = Date.now()): StoredTask {
  const status = (['todo', 'doing', 'done'] as const).find((s) => s === task.status) ?? 'todo';
  return {
    id: task.id,
    key: task.key,
    title: task.title,
    status,
    priority: task.priority,
    labels: task.labels,
    // Cards show a date; the document keeps the time it was made.
    created: was?.created ?? new Date(now).toISOString(),
    ...(task.estimate ? { estimate: task.estimate } : {}),
    ...(task.assignee ? { assignee: task.assignee } : {}),
    ...(task.dueIn !== undefined ? { due: isoDay(dayStart(now) + task.dueIn * DAY) } : {}),
    ...(was?.noteId ? { noteId: was.noteId } : {}),
  };
}

/** A note's paragraphs, each with whether it's all bold. */
export function noteLines(fragment: Y.XmlFragment): { text: string; bold: boolean }[] {
  return fragment.toArray().flatMap((block) => {
    if (!(block instanceof Y.XmlElement)) return [];
    const runs = block.toArray().filter((c): c is Y.XmlText => c instanceof Y.XmlText).flatMap((t) => t.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]);
    const text = runs.map((r) => (typeof r.insert === 'string' ? r.insert : '')).join('').trim();
    return text ? [{ text, bold: runs.length > 0 && runs.every((r) => !!r.attributes?.['bold']) }] : [];
  });
}

/** Who a note is for, when its first line is a name in bold (as the model writes action items), and the rest. */
export function ownerAndText(fragment: Y.XmlFragment): { owner?: string; text: string } {
  const lines = noteLines(fragment);
  if (lines.length > 1 && lines[0].bold) return { owner: lines[0].text.replace(/:$/, ''), text: lines.slice(1).map((l) => l.text).join(' ') };
  return { text: lines.map((l) => l.text).join(' ') };
}

/** The notes that are action items: those in frames called "Action items", or the given notes. */
export function actionItemNotes(board: BoardDoc, only?: readonly string[]): Note[] {
  if (only?.length) return board.notes().filter((n) => only.includes(n.id));
  const frames = board.frames().filter((f) => /action items?/i.test(f.title));
  const ids = new Set(board.notesIn(frames.map((f) => f.id)));
  return board.notes().filter((n) => ids.has(n.id));
}

/** The board's tasks, live from its document; anyone who can edit the board can change them. */
export class TaskFeed {
  readonly #tasks: Y.Map<StoredTask>;
  readonly #meta: Y.Map<unknown>;
  readonly #list = signal<StoredTask[]>([]);
  readonly tasks = this.#list.asReadonly();

  constructor(private readonly doc: Y.Doc) {
    this.#tasks = doc.getMap<StoredTask>('tasks');
    this.#meta = doc.getMap('meta');
    this.#tasks.observe(this.#update);
    this.#update();
  }

  destroy(): void {
    this.#tasks.unobserve(this.#update);
  }

  /** Adds tasks, numbering them T-1, T-2… in the order given. */
  add(tasks: Omit<StoredTask, 'id' | 'key' | 'created'>[], now = Date.now()): StoredTask[] {
    const added: StoredTask[] = [];
    this.doc.transact(() => {
      let seq = Number(this.#meta.get('taskSeq') ?? 0);
      for (const t of tasks) {
        const task: StoredTask = { ...t, id: crypto.randomUUID(), key: `T-${++seq}`, created: new Date(now).toISOString() };
        this.#tasks.set(task.id, task);
        added.push(task);
      }
      this.#meta.set('taskSeq', seq);
    });
    return added;
  }

  /** Takes the board's next key for a task made on the task board itself. */
  nextKey(): string {
    return `T-${Number(this.#meta.get('taskSeq') ?? 0) + 1}`;
  }

  put(task: StoredTask): void {
    this.doc.transact(() => {
      this.#tasks.set(task.id, task);
      const n = Number(/^T-(\d+)$/.exec(task.key)?.[1] ?? 0);
      if (n > Number(this.#meta.get('taskSeq') ?? 0)) this.#meta.set('taskSeq', n);
    });
  }

  remove(id: string): void {
    this.#tasks.delete(id);
  }

  readonly #update = () => this.#list.set([...this.#tasks.values()].sort((a, b) => a.created.localeCompare(b.created) || a.key.localeCompare(b.key)));
}
