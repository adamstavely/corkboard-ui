import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { AuditTrail } from '@adamstavely/trenchcoat/angular/audit-trail';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { AuditEvent } from '@adamstavely/trenchcoat/audit-trail';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { activityControllerList } from '../../api/generated/fn/activity/activity-controller-list';
import { activityControllerListVersions } from '../../api/generated/fn/activity/activity-controller-list-versions';
import { activityControllerRestore } from '../../api/generated/fn/activity/activity-controller-restore';
import { activityControllerSaveVersion } from '../../api/generated/fn/activity/activity-controller-save-version';
import type { BoardEventDto } from '../../api/generated/models/board-event-dto';
import type { BoardVersionDto } from '../../api/generated/models/board-version-dto';

/** Activity as Trench Coat's audit trail shows it. */
export function auditEvents(events: readonly BoardEventDto[]): AuditEvent[] {
  return events.map((e) => ({ id: e.id, at: e.at, actor: e.actor, action: e.action, ...(e.target ? { target: e.target } : {}), ...(e.detail ? { detail: e.detail } : {}) }));
}

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const problem = (err: unknown, fallback: string) => {
  const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
  return typeof message === 'string' ? message : fallback;
};

/** What's happened on the board, and its saved versions, which updaters and owners can save and bring back. */
@Component({
  selector: 'app-board-activity',
  imports: [AuditTrail, Button],
  template: `
    <aside class="panel" aria-label="Activity and versions">
      <div class="head">
        <span class="note">Who did what on this board, and versions to go back to.</span>
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <section class="versions" aria-labelledby="versions-heading">
        <div class="versions-head">
          <h2 id="versions-heading">Versions</h2>
          @if (canEdit()) {
            <tc-button size="sm" variant="secondary" label="Save a version" [loading]="saving()" (click)="save()"></tc-button>
          }
        </div>
        @if (versions().length) {
          <ul>
            @for (v of versions(); track v.id) {
              <li>
                <span class="label">{{ v.label }}</span>
                <span class="meta">{{ when(v.at) }}{{ v.by ? ' · ' + v.by : '' }}</span>
                <tc-button size="sm" variant="ghost" label="Preview" [attr.aria-label]="'Preview ' + v.label" (click)="preview.emit(v)"></tc-button>
                @if (canEdit()) {
                  <tc-button size="sm" variant="ghost" label="Restore" [loading]="restoring() === v.id" (click)="restore(v.id, v.label)"></tc-button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="meta">The board keeps a version every 15 minutes while people edit it.</p>
        }
      </section>
      <tc-audit-trail heading="Activity" [events]="events()" exportable></tc-audit-trail>
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      top: calc(var(--tc-space-3) + 52px);
      right: var(--tc-space-4);
      bottom: calc(var(--tc-space-4) + 56px);
      z-index: 3;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
      width: min(620px, calc(100% - 2 * var(--tc-space-4)));
      overflow: auto;
    }
    .head,
    .versions-head {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .note {
      flex: 1;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .versions {
      padding: var(--tc-space-3) var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
    }
    h2 {
      flex: 1;
      margin: 0;
      font-size: var(--tc-font-size-md);
      font-weight: var(--tc-font-weight-semibold);
    }
    ul {
      display: flex;
      flex-direction: column;
      margin: var(--tc-space-2) 0 0;
      padding: 0;
      max-height: 220px;
      overflow: auto;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      padding: var(--tc-space-1) 0;
      border-top: 1px solid var(--tc-border-subtle);
    }
    .label {
      flex: 1;
      font-size: var(--tc-font-size-sm);
    }
    .meta {
      margin: 0;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class BoardActivity {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly canEdit = input(false);
  /** Goes up when a version is restored elsewhere (the preview), to reload the list. */
  readonly refresh = input(0);
  readonly closed = output<void>();
  /** A version to look at before restoring it. */
  readonly preview = output<BoardVersionDto>();

  readonly #activity = resource({
    params: () => ({ id: this.boardId(), refresh: this.refresh() }),
    loader: ({ params }) => this.#api.invoke(activityControllerList, { id: params.id }),
  });
  readonly #versions = resource({
    params: () => ({ id: this.boardId(), refresh: this.refresh() }),
    loader: ({ params }) => this.#api.invoke(activityControllerListVersions, { id: params.id }),
  });
  protected readonly events = computed(() => auditEvents(this.#activity.hasValue() ? this.#activity.value() : []));
  protected readonly versions = computed(() => (this.#versions.hasValue() ? this.#versions.value() : []));
  protected readonly saving = signal(false);
  protected readonly restoring = signal<string | null>(null);
  protected readonly when = when;

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const v = await this.#api.invoke(activityControllerSaveVersion, { id: this.boardId(), body: {} });
      toast.success('Version saved', { description: `${v.label}, ${when(v.at)}` });
      this.#refresh();
    } catch (err) {
      toast.error("The version couldn't be saved", { description: problem(err, 'Try again.') });
    } finally {
      this.saving.set(false);
    }
  }

  protected async restore(versionId: string, label: string): Promise<void> {
    this.restoring.set(versionId);
    try {
      const { beforeVersionId } = await this.#api.invoke(activityControllerRestore, { id: this.boardId(), versionId });
      this.#refresh();
      toast.success(`Restored “${label}”`, {
        description: 'Everyone on the board sees it. What was here was saved as a version first.',
        // Undo brings back exactly what this restore saved, whatever anyone else restores meanwhile.
        action: { label: 'Undo', onClick: () => void this.restore(beforeVersionId, 'the board as it was') },
      });
    } catch (err) {
      toast.error("The version couldn't be restored", { description: problem(err, 'Try again.') });
    } finally {
      this.restoring.set(null);
    }
  }

  #refresh(): void {
    this.#activity.reload();
    this.#versions.reload();
  }
}
