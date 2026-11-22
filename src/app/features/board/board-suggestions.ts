import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, effect, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { ApprovalCard } from '@adamstavely/trenchcoat/angular/approval-card';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { suggestionsControllerAccept } from '../../api/generated/fn/suggestions/suggestions-controller-accept';
import { suggestionsControllerReject } from '../../api/generated/fn/suggestions/suggestions-controller-reject';
import type { BoardDoc } from './board-doc';
import { BoardChanges } from './board-changes';
import { Canvas } from './canvas';
import { proposedBoard, suggestionDetails, suggestionReason, type Suggestion } from './suggestions';
import { changesSince } from './versions';

const failure = (err: unknown, fallback: string) => {
  const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
  return new Error(typeof message === 'string' ? message : fallback);
};

/** Makes a suggestion's changes on the board, or turns it down; throws with what went wrong, in words. */
async function decide(api: Api, boardId: string, s: Suggestion, accept: boolean): Promise<void> {
  try {
    if (accept) await api.invoke(suggestionsControllerAccept, { id: boardId, suggestionId: s.id });
    else await api.invoke(suggestionsControllerReject, { id: boardId, suggestionId: s.id });
  } catch (err) {
    throw failure(err, accept ? "The suggestion couldn't be made. Try again." : "The suggestion couldn't be turned down. Try again.");
  }
}

/**
 * The model's suggestions waiting on the board, oldest first: what each would do and who asked. Updaters and owners
 * accept (it's then in History, to undo) or turn them down; anyone can see one on the board first.
 */
@Component({
  selector: 'app-board-suggestions',
  imports: [ApprovalCard, Button],
  template: `
    <aside class="panel" aria-label="Suggestions">
      <div class="head">
        <span class="note">{{ canEdit() ? "Changes from the model and from people's agents, waiting for an updater to make them or turn them down." : 'Updaters and owners decide on these.' }}</span>
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      @for (s of list(); track s.id) {
        <div class="item">
          @if (canEdit()) {
            <tc-approval-card
              [heading]="s.action"
              [description]="reason(s)"
              [details]="details(s)"
              [consequences]="consequences"
              approveLabel="Accept"
              denyLabel="Turn down"
              ifApproveLabel="If you accept"
              ifDenyLabel="If you turn it down"
              [allowAlways]="false"
              actions="card"
              [onApprove]="accept(s)"
              (tc-deny)="reject(s)"
            ></tc-approval-card>
          } @else {
            <div class="card">
              <strong>{{ s.action }}</strong>
              <span>{{ reason(s) }}</span>
            </div>
          }
          <tc-button size="sm" variant="ghost" label="See it on the board" (click)="preview.emit(s)"></tc-button>
        </div>
      } @empty {
        <p class="empty">No suggestions waiting. With “Ask me before changing a board” on in Settings, the assistant’s changes wait here.</p>
      }
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
      width: min(480px, calc(100% - 2 * var(--tc-space-4)));
      overflow: auto;
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .note {
      flex: 1;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tc-space-1);
    }
    .item > tc-approval-card {
      align-self: stretch;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-1);
      align-self: stretch;
      padding: var(--tc-space-3) var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
    }
    .card span {
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .empty {
      margin: 0;
      padding: var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
      color: var(--tc-text-muted);
    }
  `,
})
export class BoardSuggestions {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly list = input.required<readonly Suggestion[]>();
  readonly canEdit = input(false);
  readonly closed = output<void>();
  /** See one on the board before deciding. */
  readonly preview = output<Suggestion>();

  protected readonly details = suggestionDetails;
  protected readonly reason = suggestionReason;
  protected readonly consequences = {
    approve: 'The changes are made on the board for everyone. You can undo them from History.',
    deny: 'Nothing on the board changes.',
  };

  /** One function per suggestion for the card's onApprove: a rejection keeps the card waiting, with the problem. */
  readonly #accepts = new Map<string, () => Promise<void>>();
  protected accept(s: Suggestion): () => Promise<void> {
    let fn = this.#accepts.get(s.id);
    if (!fn) {
      fn = () => decide(this.#api, this.boardId(), s, true);
      this.#accepts.set(s.id, fn);
    }
    return fn;
  }

  protected async reject(s: Suggestion): Promise<void> {
    try {
      await decide(this.#api, this.boardId(), s, false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
}

/** A suggestion shown in place of the board: the board as it would be, read-only, beside what it would change. */
@Component({
  selector: 'app-suggestion-preview',
  imports: [Button, Canvas, BoardChanges],
  template: `
    <div class="preview" role="region" aria-label="Suggested change">
      <div class="bar">
        <div class="what">
          <strong>{{ suggestion().action }}</strong>
          <span>{{ suggestion().model }} for {{ suggestion().forName }}{{ suggestion().agent ? ' (an agent)' : '' }} · a preview, not made yet</span>
        </div>
        @if (canEdit()) {
          <tc-button size="sm" label="Accept" [loading]="busy() === 'accept'" [disabled]="!!busy()" (click)="decide(true)"></tc-button>
          <tc-button size="sm" variant="secondary" label="Turn down" [loading]="busy() === 'reject'" [disabled]="!!busy()" (click)="decide(false)"></tc-button>
        }
        <tc-button size="sm" variant="ghost" label="Back to the board" (click)="closed.emit()"></tc-button>
      </div>
      <div class="body">
        <div class="stage">
          @if (proposed(); as board) {
            <app-canvas [board]="board" [readOnly]="true" readOnlyLabel="Suggested" [fileUrls]="fileUrls()" />
          }
        </div>
        <aside class="changes" aria-labelledby="suggested-heading">
          <h2 id="suggested-heading">What it would change</h2>
          <p class="muted">{{ reason(suggestion()) }}</p>
          @if (changes(); as c) {
            <app-board-changes [changes]="c" />
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
    .what span,
    .muted {
      color: var(--tc-text-muted);
    }
    .muted {
      margin: 0;
      font-size: var(--tc-font-size-sm);
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
  `,
})
export class SuggestionPreview {
  readonly #api = inject(Api);
  readonly #injector = inject(Injector);

  readonly boardId = input.required<string>();
  readonly suggestion = input.required<Suggestion>();
  protected readonly reason = suggestionReason;
  /** The board as it is now, which the suggestion applies to. */
  readonly current = input.required<BoardDoc>();
  readonly canEdit = input(false);
  readonly fileUrls = input<ReadonlyMap<string, string>>(new Map());
  readonly closed = output<void>();

  private readonly canvas = viewChild(Canvas);
  protected readonly proposed = signal<BoardDoc | null>(null);
  protected readonly busy = signal<'accept' | 'reject' | null>(null);
  protected readonly changes = computed(() => {
    const board = this.proposed();
    return board ? changesSince(this.current(), board) : null;
  });

  constructor() {
    effect((onCleanup) => {
      const s = this.suggestion();
      const board = proposedBoard(this.current(), s);
      this.proposed.set(board);
      // Open on what it would add or change, or the whole board.
      const ids = [...s.added.map((n) => n.id), ...s.changed.map((c) => c.id)];
      afterNextRender(() => (ids.length ? this.canvas()?.show(ids) : this.canvas()?.fitAll()), { injector: this.#injector });
      onCleanup(() => board.destroy());
    });
  }

  protected async decide(accept: boolean): Promise<void> {
    this.busy.set(accept ? 'accept' : 'reject');
    try {
      await decide(this.#api, this.boardId(), this.suggestion(), accept);
      toast.success(accept ? 'Suggestion made' : 'Suggestion turned down', accept ? { description: 'Undo it from History if need be.' } : undefined);
      this.closed.emit();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      this.busy.set(null);
    }
  }
}
