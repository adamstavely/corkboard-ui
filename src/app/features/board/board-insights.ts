import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output } from '@angular/core';
import { AgentLedger } from '@adamstavely/trenchcoat/angular/agent-ledger';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { NetworkGraph } from '@adamstavely/trenchcoat/angular/network-graph';
import { Api } from '../../api/generated/api';
import { ledgerControllerRedo } from '../../api/generated/fn/ledger/ledger-controller-redo';
import { ledgerControllerUndo } from '../../api/generated/fn/ledger/ledger-controller-undo';
import type { BoardDoc } from './board-doc';
import { noteGraph } from './clusters';
import { plainText } from './comments';
import { ledgerEntries, type LedgerFeed } from './ledger';

const failure = (err: unknown) => {
  const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
  return new Error(typeof message === 'string' ? message : 'That change could not be taken back.');
};

/** Everything the model changed on the board, newest first, each with Undo (and Redo) for updaters and owners. */
@Component({
  selector: 'app-board-history',
  imports: [AgentLedger, Button],
  template: `
    <aside class="panel" aria-label="History">
      <div class="head">
        <span class="note">{{ canEdit() ? 'Undo takes a change back exactly, with anything built on it.' : 'Only updaters and owners can undo changes.' }}</span>
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      @if (entries().length) {
        <tc-agent-ledger
          heading="What the model changed"
          agent="Assistant"
          [entries]="entries()"
          [undone]="undone()"
          [onUndo]="canEdit() ? undo : undefined"
          [onRedo]="canEdit() ? redo : undefined"
        ></tc-agent-ledger>
      } @else {
        <p class="empty">Nothing yet. When the model changes the board, each change is listed here, ready to undo.</p>
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
      gap: var(--tc-space-2);
      width: min(560px, calc(100% - 2 * var(--tc-space-4)));
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
export class BoardHistory {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly feed = input.required<LedgerFeed>();
  readonly canEdit = input(false);
  readonly closed = output<void>();

  protected readonly entries = computed(() => ledgerEntries(this.feed().runs()));
  protected readonly undone = computed(() => this.feed().runs().filter((r) => r.undone).map((r) => r.id));

  /** Newest first, so what builds on a change goes before it. */
  protected readonly undo = async (ids: string[]): Promise<void> => {
    const order = this.feed().runs().map((r) => r.id);
    for (const id of [...ids].sort((a, b) => order.indexOf(b) - order.indexOf(a))) {
      try {
        await this.#api.invoke(ledgerControllerUndo, { id: this.boardId(), entryId: id });
      } catch (err) {
        throw failure(err);
      }
    }
  };

  /** Oldest first, so what a change builds on comes back before it. */
  protected readonly redo = async (ids: string[]): Promise<void> => {
    const order = this.feed().runs().map((r) => r.id);
    for (const id of [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
      try {
        await this.#api.invoke(ledgerControllerRedo, { id: this.boardId(), entryId: id });
      } catch (err) {
        throw failure(err);
      }
    }
  };
}

/** The board's notes as a graph of shared words, grouped by frame: themes show before anyone groups them. */
@Component({
  selector: 'app-board-clusters',
  imports: [NetworkGraph, Button],
  template: `
    <aside class="panel" aria-label="Clusters">
      <div class="head">
        <span class="note">Notes that share words are linked; colours are frames. Select a note to find it on the board.</span>
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <tc-network-graph
        heading="How the notes connect"
        [description]="graph().nodes.length + ' notes, ' + graph().links.length + ' links'"
        [nodes]="graph().nodes"
        [links]="graph().links"
        [height]="420"
        (tc-mark-click)="onClick($event)"
      ></tc-network-graph>
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      top: calc(var(--tc-space-3) + 52px);
      right: var(--tc-space-4);
      z-index: 3;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: min(640px, calc(100% - 2 * var(--tc-space-4)));
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
  `,
})
export class BoardClusters {
  readonly board = input.required<BoardDoc>();
  readonly closed = output<void>();
  readonly show = output<readonly string[]>();

  protected readonly graph = computed(() => {
    const board = this.board();
    const frames = board.frames();
    return noteGraph(
      board.notes().map((n) => {
        // The smallest frame it's in, as the API decides.
        const frame = frames.filter((f) => board.notesIn([f.id]).includes(n.id)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
        return { id: n.id, text: plainText(n.text), ...(frame ? { frame: frame.title || 'Untitled frame' } : {}) };
      }),
    );
  });

  /** tc-mark-click: the node picked, as Trench Coat's charts report it. */
  protected onClick(e: CustomEvent<{ event: unknown }>): void {
    const picked = e.detail.event as { datum?: { id?: string } | null; key?: string };
    const id = picked.datum?.id ?? picked.key;
    if (id) this.show.emit([id]);
  }
}
