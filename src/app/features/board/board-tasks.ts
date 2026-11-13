import { Component, computed, inject, input, output, resource } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { TaskBoard } from '@adamstavely/trenchcoat/angular/task-board';
import type { TaskBoardTasksChange, TaskLabel } from '@adamstavely/trenchcoat/task-board';
import { Api } from '../../api/generated/api';
import { boardsControllerMembers } from '../../api/generated/fn/boards/boards-controller-members';
import type { BoardDoc } from './board-doc';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { ACTION_LABEL, actionItemNotes, fromTask, ownerAndText, TASK_STATUSES, toTask, type TaskFeed } from './tasks';

const LABELS: TaskLabel[] = [{ id: ACTION_LABEL, label: 'Action item', color: 'var(--tc-chart-1)' }];

/**
 * The board's tasks on Trench Coat's kanban: To do, In progress, Done. Action items on the board (notes in an "Action
 * items" frame, or the selected notes) become tasks in one click, assigned to whoever's name is in bold on them.
 */
@Component({
  selector: 'app-board-tasks',
  imports: [TaskBoard, Button],
  template: `
    <aside class="panel" aria-label="Tasks">
      <div class="head">
        <span class="note">{{ canEdit() ? hint() : 'Only updaters and owners can change tasks.' }}</span>
        @if (canEdit() && newItems().length) {
          <tc-button size="sm" variant="secondary" [label]="'Add ' + newItems().length + ' action item' + (newItems().length === 1 ? '' : 's')" (click)="addActionItems()"></tc-button>
        }
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <tc-task-board
        [tasks]="tasks()"
        [statuses]="statuses"
        [labels]="labels"
        [people]="people()"
        [path]="[boardTitle(), 'Tasks']"
        (tc-tasks-change)="onChange($event)"
      ></tc-task-board>
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      inset: calc(var(--tc-space-3) + 52px) var(--tc-space-4) calc(var(--tc-space-4) + 56px);
      z-index: 3;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      overflow: auto;
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .note {
      flex: 1;
      margin: 0;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    tc-task-board {
      flex: 1;
      min-height: 0;
    }
  `,
})
export class BoardTasks {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly boardTitle = input('Board');
  readonly board = input.required<BoardDoc>();
  readonly feed = input.required<TaskFeed>();
  /** The selected notes: these become tasks instead of the Action items frame's. */
  readonly selection = input<readonly string[]>([]);
  readonly canEdit = input(false);
  readonly closed = output<void>();

  protected readonly statuses = TASK_STATUSES;
  protected readonly labels = LABELS;

  readonly #members = resource({
    params: () => this.boardId(),
    loader: ({ params: id }) => this.#api.invoke(boardsControllerMembers, { id }),
  });
  /** Everyone who can open the board can be given a task. */
  protected readonly people = computed(() => (this.#members.hasValue() ? this.#members.value() : []).filter((m) => m.role).map((m) => ({ id: m.userId, name: m.name })));

  protected readonly tasks = computed(() => this.feed().tasks().map((t) => toTask(t)));

  /** Action items that aren't tasks yet. */
  protected readonly newItems = computed(() => {
    const linked = new Set(this.feed().tasks().map((t) => t.noteId));
    return actionItemNotes(this.board(), this.selection()).filter((n) => !linked.has(n.id));
  });
  protected readonly hint = computed(() =>
    this.selection().length ? 'The selected notes can become tasks.' : 'Notes in an "Action items" frame can become tasks, or select the notes you want.',
  );

  protected addActionItems(): void {
    const people = this.people();
    const items = this.newItems().map((note) => {
      const { owner, text } = ownerAndText(note.text);
      // "Ada" matches Ada Lovelace; "Unassigned" and unknown names don't.
      const who = owner && people.find((p) => p.name.toLowerCase() === owner.toLowerCase() || p.name.toLowerCase().split(/\s+/)[0] === owner.toLowerCase());
      return { title: text || 'Untitled', status: 'todo' as const, priority: 0 as const, labels: [ACTION_LABEL], noteId: note.id, ...(who ? { assignee: who.id } : {}) };
    });
    const added = this.feed().add(items);
    toast.success(`Added ${added.length} task${added.length === 1 ? '' : 's'}`, { description: added.map((t) => `${t.key} ${t.title}`).join(' · ') });
  }

  protected onChange(e: CustomEvent<TaskBoardTasksChange>): void {
    if (!this.canEdit()) {
      e.preventDefault();
      return;
    }
    const { task, change } = e.detail;
    const feed = this.feed();
    if (change === 'delete') feed.remove(task.id);
    else feed.put(fromTask(task, feed.tasks().find((t) => t.id === task.id)));
  }
}
