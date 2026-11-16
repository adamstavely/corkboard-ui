import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import type { BoardDoc } from './board-doc';
import { CHART_KINDS, CHART_NAMES, MAX_CHART_ROWS, parseNumber, type ChartKind, type ChartRow } from './chart';
import { ChartView } from './chart-view';
import { Icon } from '../../shared/icon';

/** A row as its fields hold it while it's edited: the number as typed. */
interface DraftRow {
  label: string;
  value: string;
}

/**
 * A chart's kind, title and numbers, beside the board: a small table of labels and values over a live preview, saved
 * to the board as one undoable change. Closing without saving leaves the chart as it was.
 */
@Component({
  selector: 'app-board-chart',
  imports: [Button, Select, ChartView, Icon],
  template: `
    <aside class="panel" aria-labelledby="chart-heading">
      <div class="head">
        <h2 id="chart-heading">Chart</h2>
        <tc-button size="sm" variant="ghost" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <div class="row">
        <tc-select label="Kind of chart" [labelVisible]="false" [options]="kinds" [value]="kind()" (tc-value-change)="kind.set($any($event.detail.value))"></tc-select>
        <input type="text" class="text-input grow" maxlength="120" aria-label="Title" placeholder="Title" [value]="title()" (input)="title.set($any($event.target).value)" />
      </div>
      <div class="rows" role="group" aria-label="Numbers">
        @for (r of rows(); track $index; let i = $index) {
          <div class="row">
            <input type="text" class="text-input grow" maxlength="80" [attr.aria-label]="'Row ' + (i + 1) + ' label'" placeholder="Label" [value]="r.label" (input)="setRow(i, { label: $any($event.target).value })" />
            <input type="text" inputmode="decimal" class="text-input number" [attr.aria-label]="'Row ' + (i + 1) + ' value'" placeholder="0" [value]="r.value" (input)="setRow(i, { value: $any($event.target).value })" />
            <button type="button" class="icon-btn" [attr.aria-label]="'Remove row ' + (i + 1)" data-tip="Remove" (click)="removeRow(i)"><app-icon name="close" /></button>
          </div>
        }
      </div>
      @if (rows().length < maxRows) {
        <div><tc-button size="sm" variant="ghost" label="Add a row" (click)="rows.set([...rows(), { label: '', value: '' }])"></tc-button></div>
      }
      @if (problem(); as p) {
        <p class="problem" role="alert">{{ p }}</p>
      }
      @if (theirs()) {
        <p class="notice" role="status">
          Someone else changed this chart while you were editing.
          <tc-button size="sm" variant="ghost" label="Use their version" (click)="useTheirs()"></tc-button>
        </p>
      }
      <div class="preview" aria-hidden="true">
        <app-chart-view [kind]="kind()" [title]="title()" [rows]="drawn()" [boxHeight]="220" />
      </div>
      <div class="actions">
        <span class="grow"></span>
        <tc-button size="sm" variant="primary" label="Save to the board" [disabled]="!changed() || !!problem()" (click)="save()"></tc-button>
      </div>
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      top: calc(var(--tc-space-3) + 52px);
      right: var(--tc-space-4);
      z-index: 4;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: min(400px, calc(100% - 2 * var(--tc-space-4)));
      max-height: calc(100% - 140px);
      overflow: auto;
      padding: var(--tc-space-3);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.1);
      color: var(--tc-text-primary);
    }
    .head,
    .actions,
    .row {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .head {
      justify-content: space-between;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-1);
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .text-input {
      height: 32px;
      padding: 0 var(--tc-space-2);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-base, var(--tc-surface-raised));
      color: var(--tc-text-primary);
      font: inherit;
      font-size: var(--tc-font-size-sm);
    }
    .text-input:focus-visible {
      outline: 2px solid var(--tc-focus-ring, var(--tc-accent-text));
      outline-offset: 1px;
    }
    .number {
      width: 88px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-md);
    }
    .notice {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      margin: 0;
      font-size: var(--tc-font-size-sm);
    }
    .problem {
      margin: 0;
      color: var(--tc-status-danger-fg, var(--tc-text-primary));
      font-size: var(--tc-font-size-sm);
    }
    .preview {
      flex: none;
      height: 220px;
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-md);
    }
  `,
})
export class BoardChart {
  readonly board = input.required<BoardDoc>();
  readonly chartId = input.required<string>();
  readonly closed = output<void>();

  protected readonly kinds = CHART_KINDS.map((k) => ({ value: k, label: CHART_NAMES[k] }));
  protected readonly maxRows = MAX_CHART_ROWS;
  readonly #saved = computed(() => {
    const item = this.board().items().find((i) => i.id === this.chartId());
    return item?.kind === 'chart' ? item : null;
  });
  protected readonly kind = signal<ChartKind>('bar');
  protected readonly title = signal('');
  protected readonly rows = signal<DraftRow[]>([]);
  /** What's on the board as the draft started from it: when the board moves on, an untouched draft follows. */
  readonly #base = signal<string | null>(null);
  #openedId: string | null = null;
  /** The rows with a label or a number, numbers read as typed ("1,200", "3,5" and "3.5" all work). */
  protected readonly parsed = computed<ChartRow[]>(() =>
    this.rows()
      .filter((r) => r.label.trim() || r.value.trim())
      .map((r) => ({ label: r.label.trim(), value: parseNumber(r.value) })),
  );
  /** What the preview draws: the rows that have a number. */
  protected readonly drawn = computed(() => this.parsed().filter((r) => Number.isFinite(r.value)));
  protected readonly problem = computed(() => {
    const parsed = this.parsed();
    const bad = parsed.findIndex((r) => !Number.isFinite(r.value));
    if (bad >= 0) return `“${parsed[bad].label || 'Row ' + (bad + 1)}” needs a number.`;
    if (this.kind() === 'pie') {
      if (parsed.some((r) => r.value < 0)) return 'A pie chart can only show numbers of 0 or more.';
      if (parsed.length && parsed.every((r) => r.value === 0)) return 'A pie chart needs at least one number above 0.';
    }
    return '';
  });
  readonly #draftKey = computed(() => chartKey(this.kind(), this.title().trim(), this.parsed()));
  protected readonly changed = computed(() => {
    const saved = this.#saved();
    return !!saved && chartKey(saved.chart, saved.title, saved.rows) !== this.#draftKey();
  });
  /** Someone else saved while this draft had changes of its own: saving now would put theirs back. */
  protected readonly theirs = computed(() => {
    const saved = this.#saved();
    const base = this.#base();
    return !!saved && base !== null && chartKey(saved.chart, saved.title, saved.rows) !== base && this.changed();
  });

  constructor() {
    // Each chart opened starts from what's on the board, and keeps up with it while the draft is untouched (another
    // person's save, an undo); one taken off the board closes the panel.
    effect(() => {
      const id = this.chartId();
      const saved = this.#saved();
      if (!saved) {
        this.closed.emit();
        return;
      }
      untracked(() => {
        const opened = this.#openedId !== id;
        if (!opened && this.#draftKey() !== this.#base()) return;
        this.#openedId = id;
        this.#start(saved);
      });
    });
  }

  protected useTheirs(): void {
    const saved = this.#saved();
    if (saved) this.#start(saved);
  }

  #start(saved: { chart: ChartKind; title: string; rows: readonly ChartRow[] }): void {
    this.kind.set(saved.chart);
    this.title.set(saved.title);
    this.rows.set(saved.rows.map((r) => ({ label: r.label, value: String(r.value) })));
    this.#base.set(chartKey(saved.chart, saved.title, saved.rows));
  }

  protected setRow(i: number, change: Partial<DraftRow>): void {
    this.rows.update((rows) => rows.map((r, at) => (at === i ? { ...r, ...change } : r)));
  }

  protected removeRow(i: number): void {
    this.rows.update((rows) => rows.filter((_, at) => at !== i));
  }

  protected save(): void {
    if (!this.changed() || this.problem()) return;
    this.board().setChart(this.chartId(), { chart: this.kind(), title: this.title().trim(), rows: this.parsed() });
    this.#base.set(this.#draftKey());
  }
}

/** A chart's content as one comparable string. */
const chartKey = (chart: ChartKind, title: string, rows: readonly ChartRow[]) => JSON.stringify([chart, title, rows.map((r) => [r.label, r.value])]);
