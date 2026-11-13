import { Component, computed, input, output } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { PrioritisationMatrix } from '@adamstavely/trenchcoat/angular/prioritisation-matrix';
import type { PrioritisationItem, PrioritisationItemsChange } from '@adamstavely/trenchcoat/prioritisation-matrix';
import type { BoardDoc } from './board-doc';
import { plainText } from './comments';

/** Where a note starts on the matrix before anyone has placed it: the middle. */
const UNSCORED = 5;
/** Item names stay short: they show in a small tip on the plot. */
const LABEL_CHARS = 60;

/** The notes as matrix items, numbered in board order; unscored notes start in the middle. */
export function matrixItems(notes: readonly { id: string; text: string; value?: number; effort?: number }[]): PrioritisationItem[] {
  return notes.map((n) => ({
    id: n.id,
    label: (n.text.trim() || 'Empty note').slice(0, LABEL_CHARS),
    value: n.value ?? UNSCORED,
    effort: n.effort ?? UNSCORED,
    ...(n.value === undefined ? { note: 'Not placed yet' } : {}),
  }));
}

/**
 * The board's notes on Trench Coat's value-vs-effort matrix: the selected ones, or all of them. Moving a point places
 * the note for everyone; people who can't edit the board see it read-only.
 */
@Component({
  selector: 'app-board-matrix',
  imports: [PrioritisationMatrix, Button],
  template: `
    <aside class="panel" aria-label="Prioritise">
      <div class="head">
        <span class="scope">{{ scope() }}</span>
        @if (canEdit() && unplaced() > 0) {
          <tc-button size="sm" variant="ghost" label="Ask the model to place them" (click)="ask.emit()"></tc-button>
        }
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      @if (items().length) {
        <tc-prioritisation-matrix
          heading="Value vs effort"
          [description]="canEdit() ? 'Drag a note, or focus it and use the arrow keys.' : 'Only updaters and owners can move notes.'"
          [items]="items()"
          [readonly]="!canEdit()"
          (tc-items-change)="onChange($event)"
        ></tc-prioritisation-matrix>
      } @else {
        <p class="empty">Add some notes to the board to weigh them here.</p>
      }
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      /* Below the facilitation strip's first row, which sits along the top middle. */
      top: calc(var(--tc-space-3) + 52px);
      right: var(--tc-space-4);
      bottom: calc(var(--tc-space-4) + 56px);
      z-index: 3;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: min(720px, calc(100% - 2 * var(--tc-space-4)));
      overflow: auto;
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .scope {
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
export class BoardMatrix {
  readonly board = input.required<BoardDoc>();
  /** The selected notes (with those in selected frames); empty for every note on the board. */
  readonly selection = input<readonly string[]>([]);
  readonly canEdit = input(false);
  readonly closed = output<void>();
  /** Ask the model to place the notes that aren't placed yet. */
  readonly ask = output<void>();

  readonly #notes = computed(() => {
    const chosen = new Set(this.selection());
    const notes = this.board().notes();
    return chosen.size ? notes.filter((n) => chosen.has(n.id)) : notes;
  });
  protected readonly items = computed(() => matrixItems(this.#notes().map((n) => ({ id: n.id, text: plainText(n.text), value: n.value, effort: n.effort }))));
  protected readonly unplaced = computed(() => this.#notes().filter((n) => n.value === undefined).length);
  protected readonly scope = computed(() => {
    const n = this.#notes().length;
    return this.selection().length ? `The ${n} selected note${n === 1 ? '' : 's'}` : `Every note on the board (${n})`;
  });

  protected onChange(e: CustomEvent<PrioritisationItemsChange>): void {
    const { id, value, effort } = e.detail.change;
    this.board().setScore(id, value, effort);
  }
}
