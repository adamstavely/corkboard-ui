import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, resource, signal, untracked } from '@angular/core';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { linksControllerOpen } from '../../api/generated/fn/links/links-controller-open';
import { BoardConnection } from '../board/board-connection';
import { BoardDoc } from '../board/board-doc';
import { Canvas } from '../board/canvas';
import { colorFor } from '../board/presence';

/**
 * A board opened from a share link: live and read-only, as a guest, with no need to pick who you are. The link's
 * token is the connection's credential, so turning the link off ends the view.
 */
@Component({
  selector: 'app-shared-board',
  imports: [Canvas, Skeleton],
  template: `
    <div class="page">
      <div class="bar">
        <strong class="title">{{ meta.hasValue() ? meta.value().title : 'Shared board' }}</strong>
        <span class="badge">View only</span>
        <span class="status" role="status">{{ statusText() }}</span>
      </div>
      <div class="stage">
        @if (problem()) {
          <p class="problem" role="alert">{{ problem() }}</p>
        } @else if (board() && connection() && connection()!.status() !== 'connecting') {
          <app-canvas [board]="board()!" [presence]="connection()!.presence" [provider]="connection()!.provider" [readOnly]="true" readOnlyLabel="View only" />
        } @else {
          <tc-skeleton aria-label="Loading board"></tc-skeleton>
        }
      </div>
    </div>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: var(--tc-space-3);
      padding: var(--tc-space-2) var(--tc-space-4);
      border-bottom: 1px solid var(--tc-border-subtle);
      background: var(--tc-surface-raised);
    }
    .title {
      font-size: var(--tc-font-size-md);
    }
    .badge {
      padding: 2px var(--tc-space-2);
      border-radius: 999px;
      background: var(--tc-accent-subtle);
      color: var(--tc-accent-text);
      font-size: var(--tc-font-size-sm);
    }
    .status {
      margin-left: auto;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .stage {
      position: relative;
      flex: 1;
      min-height: 0;
    }
    .problem {
      padding: var(--tc-space-8);
    }
  `,
})
export class SharedBoard {
  readonly #api = inject(Api);

  /** From the route. */
  readonly token = input.required<string>();

  protected readonly meta = resource({ params: () => this.token(), loader: ({ params }) => this.#api.invoke(linksControllerOpen, { token: params }) });
  protected readonly board = signal<BoardDoc | undefined>(undefined);
  protected readonly connection = signal<BoardConnection | undefined>(undefined);

  protected readonly problem = computed(() => {
    const err = this.meta.error();
    if (err) return err instanceof HttpErrorResponse && err.status === 410 ? 'This link has been turned off or has expired.' : "This link doesn't open a board.";
    return this.connection()?.status() === 'denied' ? 'This link has been turned off or has expired.' : '';
  });
  protected readonly statusText = computed(() => (this.connection()?.status() === 'offline' ? 'Reconnecting…' : 'Live'));

  constructor() {
    effect((onCleanup) => {
      if (!this.meta.hasValue()) return;
      const { boardId } = this.meta.value();
      const token = this.token();
      untracked(() => {
        const guestId = `guest-${crypto.randomUUID()}`;
        const board = new BoardDoc();
        const connection = new BoardConnection(boardId, board, () => `link:${token}`, { id: guestId, name: 'Guest', color: colorFor(guestId) });
        this.board.set(board);
        this.connection.set(connection);
        onCleanup(() => {
          this.board.set(undefined);
          this.connection.set(undefined);
          connection.destroy();
          board.destroy();
        });
      });
    });
  }
}
