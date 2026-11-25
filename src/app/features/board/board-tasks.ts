import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, input, output, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { TaskBoard } from '@adamstavely/trenchcoat/angular/task-board';
import type { TaskBoardTasksChange, TaskLabel } from '@adamstavely/trenchcoat/task-board';
import { Api } from '../../api/generated/api';
import { boardsControllerMembers } from '../../api/generated/fn/boards/boards-controller-members';
import { integrationsControllerExport } from '../../api/generated/fn/integrations/integrations-controller-export';
import { integrationsControllerList } from '../../api/generated/fn/integrations/integrations-controller-list';
import { integrationsControllerSyncNow } from '../../api/generated/fn/integrations/integrations-controller-sync-now';
import { integrationsControllerSyncStatus } from '../../api/generated/fn/integrations/integrations-controller-sync-status';
import type { BoardDoc } from './board-doc';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { personNamed } from './recap';
import { ACTION_LABEL, actionItemNotes, fromTask, ownerAndText, syncedAgo, TASK_STATUSES, toTask, TRACKER_NAMES, type TaskFeed } from './tasks';
import { Icon } from '../../shared/icon';

const LABELS: TaskLabel[] = [{ id: ACTION_LABEL, label: 'Action item', color: 'var(--tc-chart-1)' }];

/**
 * The board's tasks on Trench Coat's kanban: To do, In progress, Done. Action items on the board (notes in an "Action
 * items" frame, or the selected notes) become tasks in one click, assigned to whoever's name is in bold on them.
 */
@Component({
  selector: 'app-board-tasks',
  imports: [TaskBoard, Button, Icon],
  template: `
    <aside class="panel" [class.placed]="placed()" aria-label="Tasks">
      <div class="head">
        <span class="note">{{ canEdit() ? hint() : 'Only updaters and owners can change tasks.' }}</span>
        @if (canEdit() && trackers().length && unsent() > 0 && sendRefusal()) {
          <span class="note">{{ sendRefusal() }}</span>
        } @else if (canEdit() && trackers().length && unsent() > 0) {
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
        @if (!placed()) {
          <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
        }
      </div>
      @if (linked().length) {
        <div class="sync">
          <ul class="linked" aria-label="Tasks sent to issue trackers">
            @for (t of linked(); track t.id) {
              <li>
                <a [href]="t.url" target="_blank" rel="noopener noreferrer">{{ t.key }} <app-icon name="becomes" /> {{ t.issue }}</a>
                <span class="when">{{ t.synced }}</span>
                @if (t.trackerAssignee) {
                  <span class="who">Assigned to {{ t.trackerAssignee }} in {{ t.tracker }}</span>
                }
              </li>
            }
          </ul>
          @if (canEdit()) {
            <tc-button size="sm" variant="secondary" label="Sync now" [loading]="syncing()" (click)="syncNow()"></tc-button>
          }
        </div>
        @for (s of failing(); track s.integrationId) {
          <p class="sync-error" role="status">
            <app-icon name="cloudOff" />
            <span><strong>{{ s.label }}</strong> isn't syncing: {{ s.error }}{{ s.retry }}</span>
          </p>
        }
      }
      @if (canEdit() && held().length) {
        <div class="held" role="status">
          <span>
            May already be in the tracker: an earlier send got no answer.
            @for (t of held(); track t.taskId) {
              <strong>{{ t.taskKey }}</strong>
            }
            Check the tracker first, then send them again if they aren't there.
          </span>
          <tc-button size="sm" variant="secondary" label="Send again" [loading]="sending()" (click)="sendAgain()"></tc-button>
        </div>
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
    /* Placed on the board: it fills its element there, which does the positioning. */
    .panel.placed {
      position: static;
      inset: auto;
      width: auto;
      height: 100%;
      max-height: none;
      z-index: auto;
    }
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
    .sync {
      display: flex;
      align-items: flex-start;
      gap: var(--tc-space-2);
    }
    .linked {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: var(--tc-space-1) var(--tc-space-4);
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .linked li {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tc-space-1);
    }
    .linked a {
      color: var(--tc-accent-text);
    }
    .sync-error {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      margin: 0;
      color: var(--tc-status-danger-fg);
      font-size: var(--tc-font-size-sm);
    }
    .held {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--tc-space-2);
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
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
  /** Why the workspace's policy stops you sending tasks to a tracker (it's an export); null when it doesn't. */
  readonly sendRefusal = input<string | null>(null);
  /** The board's workspace, for its issue trackers. */
  readonly orgId = input<string>();
  /** On the board as an element of its own, rather than opened beside it: no Close, and it fills its box. */
  readonly placed = input(false);
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
  // ── Keeping sent tasks in step with their issues (the API syncs title, status and assignee both ways) ──

  /** Ticks every half minute, so "Synced 2 minutes ago" stays true. */
  readonly #now = signal(Date.now());
  readonly #linkedCount = computed(() => this.feed().tasks().filter((t) => t.external).length);
  readonly #sync = resource({
    params: () => (this.#linkedCount() ? { id: this.boardId(), linked: this.#linkedCount() } : undefined),
    loader: ({ params }) => this.#api.invoke(integrationsControllerSyncStatus, { id: params.id }),
  });
  protected readonly syncing = signal(false);

  constructor() {
    const tick = setInterval(() => {
      this.#now.set(Date.now());
      // The API syncs on its own every couple of minutes: catch up with it now and then.
      if (this.#now() % 120_000 < 30_000 && this.#sync.hasValue()) this.#sync.reload();
    }, 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  protected readonly linked = computed(() => {
    const synced = new Map((this.#sync.hasValue() ? this.#sync.value().tasks : []).map((t) => [t.taskId, t.syncedAt]));
    const now = this.#now();
    return this.feed()
      .tasks()
      .filter((t) => t.external && /^https:\/\//.test(t.external.url))
      .map((t) => ({
        id: t.id,
        key: t.key,
        issue: t.external!.key,
        url: t.external!.url,
        synced: syncedAgo(synced.get(t.id), now),
        tracker: TRACKER_NAMES[t.external!.kind] ?? t.external!.kind,
        // Someone the issue is assigned to in the tracker who isn't on this board.
        trackerAssignee: t.assignee ? undefined : t.external!.assignee,
      }));
  });

  /** Trackers that are failing to sync, and when they'll be tried again. */
  protected readonly failing = computed(() =>
    (this.#sync.hasValue() ? this.#sync.value().trackers : [])
      .filter((s) => s.error)
      .map((s) => ({
        integrationId: s.integrationId,
        label: s.label,
        error: s.error!.replace(/\.$/, ''),
        retry: s.retryAt ? `. Trying again at ${new Date(s.retryAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.` : '.',
      })),
  );

  protected async syncNow(): Promise<void> {
    this.syncing.set(true);
    try {
      const r = await this.#api.invoke(integrationsControllerSyncNow, { id: this.boardId() });
      this.#sync.set(r);
      this.#now.set(Date.now());
      const down = r.trackers.filter((s) => s.error);
      if (down.length) toast.error(`${down[0].label} isn't syncing`, { description: down[0].error ?? undefined });
      else toast.success('Synced with the issue trackers');
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      toast.error("The tasks couldn't be synced", { description: typeof message === 'string' ? message : 'Try again.' });
    } finally {
      this.syncing.set(false);
    }
  }

  protected pick(id: string): void {
    this.#picked.set(id);
  }

  /**
   * Tasks an earlier send may have made issues for (it got no answer, or was cut off): held back from plain sends until
   * someone has checked the tracker and sends them again by name.
   */
  protected readonly held = signal<{ taskId: string; taskKey: string }[]>([]);

  /** Sends the held tasks again, once someone has checked they aren't in the tracker. */
  protected sendAgain(): Promise<void> {
    return this.send(this.held().map((t) => t.taskId));
  }

  protected async send(taskIds?: string[]): Promise<void> {
    const integrationId = this.tracker();
    if (!integrationId) return;
    this.sending.set(true);
    try {
      const r = await this.#api.invoke(integrationsControllerExport, { id: this.boardId(), body: { integrationId, ...(taskIds ? { taskIds } : {}) } });
      // What's held now: those still in doubt, less any that went this time.
      const sent = new Set([...r.exported.map((e) => e.taskId), ...(taskIds ?? [])]);
      const doubtful = r.failed.filter((f) => f.mayExist).map((f) => ({ taskId: f.taskId, taskKey: f.taskKey }));
      this.held.update((was) => [...was.filter((t) => !sent.has(t.taskId) && !doubtful.some((d) => d.taskId === t.taskId)), ...doubtful]);
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
    // A card added on the task board comes with the board's own stand-in id and key (t-301, NW-301): it gets a real id
    // and the board's next key instead, like a task made any other way.
    else if (change === 'add') feed.put({ ...fromTask(task, undefined), id: crypto.randomUUID(), key: feed.nextKey() });
    else feed.put(fromTask(task, feed.tasks().find((t) => t.id === task.id)));
  }
}
