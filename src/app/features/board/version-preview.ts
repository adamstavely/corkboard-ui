import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, effect, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { activityControllerRestore } from '../../api/generated/fn/activity/activity-controller-restore';
import type { BoardVersionDto } from '../../api/generated/models/board-version-dto';
import { Auth } from '../../core/auth';
import { BoardDoc } from './board-doc';
import { Canvas } from './canvas';
import { changesSince, unchanged } from './versions';

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * A saved version of the board, shown in place of the board, read-only, beside what's changed since; updaters and
 * owners can bring it back from here.
 */
@Component({
  selector: 'app-version-preview',
  imports: [Button, Canvas, Skeleton],
  template: `
    <div class="preview" role="region" [attr.aria-label]="'Version: ' + version().label">
      <div class="bar">
        <div class="what">
          <strong>{{ version().label }}</strong>
          <span>Saved {{ when(version().at) }}{{ version().by ? ' by ' + version().by : '' }} · read-only</span>
        </div>
        @if (canEdit()) {
          <tc-button size="sm" label="Restore this version" [loading]="restoring()" [disabled]="!saved()" (click)="restore()"></tc-button>
        }
        <tc-button size="sm" variant="secondary" label="Back to the board" (click)="closed.emit()"></tc-button>
      </div>
      <div class="body">
        <div class="stage">
          @if (saved(); as board) {
            <app-canvas [board]="board" [readOnly]="true" readOnlyLabel="Saved version" [fileUrls]="fileUrls()" />
          } @else if (problem()) {
            <p class="problem" role="alert">{{ problem() }}</p>
          } @else {
            <tc-skeleton aria-label="Loading the version"></tc-skeleton>
          }
        </div>
        <aside class="changes" aria-labelledby="changes-heading">
          <h2 id="changes-heading">Changed since</h2>
          @if (changes(); as c) {
            @if (nothing()) {
              <p class="muted">Nothing: the board is the same as this version.</p>
            } @else {
              <p class="muted">Restoring brings back the version as it is on the left: these changes would be undone.</p>
              @if (c.added.length) {
                <h3>{{ c.added.length }} note{{ c.added.length === 1 ? '' : 's' }} added</h3>
                <ul>@for (t of c.added; track $index) { <li class="added">{{ t }}</li> }</ul>
              }
              @if (c.removed.length) {
                <h3>{{ c.removed.length }} note{{ c.removed.length === 1 ? '' : 's' }} removed</h3>
                <ul>@for (t of c.removed; track $index) { <li class="removed">{{ t }}</li> }</ul>
              }
              @if (c.edited.length) {
                <h3>{{ c.edited.length }} note{{ c.edited.length === 1 ? '' : 's' }} edited</h3>
                <ul>
                  @for (e of c.edited; track $index) {
                    <li><del>{{ e.before }}</del> <span aria-hidden="true">→</span><span class="sr-only">now</span> <ins>{{ e.after }}</ins></li>
                  }
                </ul>
              }
              @if (c.moved) {
                <h3>{{ c.moved }} note{{ c.moved === 1 ? '' : 's' }} moved</h3>
              }
              @if (c.framesAdded.length || c.framesRemoved.length || c.framesRenamed.length) {
                <h3>Frames</h3>
                <ul>
                  @for (t of c.framesAdded; track $index) { <li class="added">Added “{{ t }}”</li> }
                  @for (t of c.framesRemoved; track $index) { <li class="removed">Removed “{{ t }}”</li> }
                  @for (r of c.framesRenamed; track $index) { <li>Renamed “{{ r.before }}” to “{{ r.after }}”</li> }
                </ul>
              }
              @if (c.mediaAdded.length || c.mediaRemoved.length) {
                <h3>Images and files</h3>
                <ul>
                  @for (t of c.mediaAdded; track $index) { <li class="added">Added {{ t }}</li> }
                  @for (t of c.mediaRemoved; track $index) { <li class="removed">Removed {{ t }}</li> }
                </ul>
              }
            }
          }
        </aside>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 20;
      display: block;
      background: var(--app-canvas, var(--tc-surface-base));
    }
    .preview {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      padding: var(--tc-space-2) var(--tc-space-4);
      border-bottom: 1px solid var(--tc-border-subtle);
      background: var(--tc-accent-subtle);
    }
    .what {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: 0 var(--tc-space-2);
      min-width: 0;
    }
    .what span {
      color: var(--tc-text-muted);
    }
    .body {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    .stage {
      position: relative;
      flex: 1;
      min-width: 0;
    }
    .changes {
      width: 320px;
      overflow: auto;
      padding: var(--tc-space-4);
      border-left: 1px solid var(--tc-border-subtle);
      background: var(--tc-surface-raised);
    }
    h2 {
      margin: 0 0 var(--tc-space-2);
      font-size: var(--tc-font-size-md);
    }
    h3 {
      margin: var(--tc-space-4) 0 var(--tc-space-1);
      font-size: var(--tc-font-size-sm);
      font-weight: var(--tc-font-weight-semibold);
    }
    ul {
      margin: 0;
      padding-left: var(--tc-space-4);
      font-size: var(--tc-font-size-sm);
    }
    li {
      margin-bottom: var(--tc-space-1);
      overflow-wrap: anywhere;
    }
    .added,
    ins {
      color: var(--tc-status-success-fg, inherit);
      text-decoration: none;
    }
    .removed,
    del {
      color: var(--tc-status-danger-fg, inherit);
    }
    .muted {
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .problem {
      padding: var(--tc-space-8);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  `,
})
export class VersionPreview {
  readonly #api = inject(Api);
  readonly #auth = inject(Auth);

  readonly boardId = input.required<string>();
  readonly version = input.required<BoardVersionDto>();
  /** The board as it is now, to compare with. */
  readonly current = input.required<BoardDoc>();
  readonly canEdit = input(false);
  readonly fileUrls = input<ReadonlyMap<string, string>>(new Map());
  readonly closed = output<void>();
  readonly restored = output<void>();

  readonly #injector = inject(Injector);
  private readonly canvas = viewChild(Canvas);
  protected readonly saved = signal<BoardDoc | null>(null);
  protected readonly problem = signal('');
  protected readonly restoring = signal(false);
  protected readonly when = when;

  protected readonly changes = computed(() => {
    const saved = this.saved();
    return saved ? changesSince(saved, this.current()) : null;
  });
  protected readonly nothing = computed(() => !!this.changes() && unchanged(this.changes()!));

  constructor() {
    effect((onCleanup) => {
      const url = `/api/boards/${this.boardId()}/versions/${this.version().id}`;
      const stop = new AbortController();
      let board: BoardDoc | null = null;
      this.saved.set(null);
      this.problem.set('');
      fetch(url, { headers: { Authorization: `Bearer ${this.#auth.token() ?? ''}` }, signal: stop.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(res.status === 404 ? 'That version is gone.' : "The version couldn't be loaded.");
          board = new BoardDoc();
          board.apply(new Uint8Array(await res.arrayBuffer()));
          this.saved.set(board);
          // Open showing everything on it, as a board does.
          afterNextRender(() => this.canvas()?.fitAll(), { injector: this.#injector });
        })
        .catch((err: Error) => {
          if (!stop.signal.aborted) this.problem.set(err.message || "The version couldn't be loaded.");
        });
      onCleanup(() => {
        stop.abort();
        board?.destroy();
      });
    });
  }

  protected async restore(): Promise<void> {
    this.restoring.set(true);
    try {
      await this.#api.invoke(activityControllerRestore, { id: this.boardId(), versionId: this.version().id });
      toast.success(`Restored “${this.version().label}”`, { description: 'Everyone on the board sees it. What was here was saved as a version first.' });
      this.restored.emit();
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      toast.error("The version couldn't be restored", { description: typeof message === 'string' ? message : 'Try again.' });
    } finally {
      this.restoring.set(false);
    }
  }
}
