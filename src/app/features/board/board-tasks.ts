import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { TaskBoard } from '@adamstavely/trenchcoat/angular/task-board';
import type { TaskBoardTasksChange, TaskLabel } from '@adamstavely/trenchcoat/task-board';
import { Api } from '../../api/generated/api';
import { boardsControllerMembers } from '../../api/generated/fn/boards/boards-controller-members';
import { integrationsControllerExport } from '../../api/generated/fn/integrations/integrations-controller-export';
import { integrationsControllerList } from '../../api/generated/fn/integrations/integrations-controller-list';
import type { BoardDoc } from './board-doc';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { personNamed } from './recap';
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
        @if (canEdit() && trackers().length && unsent() > 0) {
          <select class="tracker" aria-label="Issue tracker" [value]="tracker()" (change)="pick($any($event.target).value)">
            @for (t of trackers(); track t.id) {
              <option [value]="t.id">{{ t.label }} ({{ t.target }})</option>
            }
          </select>
          <tc-button size="sm" variant="secondary" [label]="'Send ' + unsent() + ' open task' + (unsent() === 1 ? '' : 's')" [loading]="sending()" (click)="send()"></tc-button>
        }
        @if (canEdit() && newItems().length) {
          <tc-button size="sm" variant="secondary" [label]="'Add ' + newItems().length + ' action item' + (newItems().length === 1 ? '' : 's')" (click)="addActionItems()"></tc-button>
        }
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      @if (linked().length) {
        <p class="linked">
          Sent:
          @for (t of linked(); track t.id) {
            <a [href]="t.url" target="_blank" rel="noopener noreferrer">{{ t.key }} → {{ t.issue }}</a>
          }
        </p>
      }
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
    .tracker {
      padding: 4px 8px;
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-sm);
      background: var(--tc-surface-base);
      color: var(--tc-text-primary);
      font: inherit;
      font-size: var(--tc-font-size-sm);
    }
    .linked {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tc-space-2);
      margin: 0;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .linked a {
      color: var(--tc-accent-text);
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
  /** The board's workspace, for its issue trackers. */
  readonly orgId = input<string>();
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

  // ── Sending tasks to an issue tracker ──

  readonly #trackers = resource({
    params: () => this.orgId(),
    loader: ({ params: orgId }) => this.#api.invoke(integrationsControllerList, { orgId }),
  });
  protected readonly trackers = computed(() => (this.#trackers.hasValue() ? this.#trackers.value() : []));
  readonly #picked = signal('');
  protected readonly tracker = computed(() => this.#picked() || this.trackers()[0]?.id || '');
  protected readonly sending = signal(false);
  /** Open tasks not sent anywhere yet. */
  protected readonly unsent = computed(() => this.feed().tasks().filter((t) => t.status !== 'done' && !t.external).length);
  protected readonly linked = computed(() =>
    this.feed()
      .tasks()
      .filter((t) => t.external && /^https:\/\//.test(t.external.url))
      .map((t) => ({ id: t.id, key: t.key, issue: t.external!.key, url: t.external!.url })),
  );

  protected pick(id: string): void {
    this.#picked.set(id);
  }

  protected async send(): Promise<void> {
    const integrationId = this.tracker();
    if (!integrationId) return;
    this.sending.set(true);
    try {
      const r = await this.#api.invoke(integrationsControllerExport, { id: this.boardId(), body: { integrationId } });
      if (r.exported.length) toast.success(`Sent ${r.exported.length} task${r.exported.length === 1 ? '' : 's'}`, { description: r.exported.map((e) => `${e.taskKey} → ${e.issueKey}`).join(' · ') });
      if (r.failed.length) toast.error(`${r.failed.length} task${r.failed.length === 1 ? '' : 's'} weren't sent`, { description: r.failed[0].reason });
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      toast.error("The tasks couldn't be sent", { description: typeof message === 'string' ? message : 'Try again.' });
    } finally {
      this.sending.set(false);
    }
  }

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
      const who = personNamed(owner, people);
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
