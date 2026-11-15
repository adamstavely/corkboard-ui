import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import type { BoardDoc } from './board-doc';
import { CHART_KINDS, CHART_NAMES, MAX_CHART_ROWS, type ChartKind } from './chart';
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
      <div class="preview" aria-hidden="true">
        <app-chart-view [kind]="kind()" [title]="title()" [rows]="parsed()" [boxHeight]="220" />
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
  /** The rows with a label or a number, numbers read as typed ("1,200" and "3.5" both work). */
  protected readonly parsed = computed(() =>
    this.rows()
      .filter((r) => r.label.trim() || r.value.trim())
      .map((r) => ({ label: r.label.trim(), value: Number(r.value.replace(/,/g, '').trim()) })),
  );
  protected readonly problem = computed(() => {
    const bad = this.rows().filter((r) => r.label.trim() || r.value.trim()).findIndex((r) => !r.value.trim() || !Number.isFinite(Number(r.value.replace(/,/g, ''))));
    if (bad >= 0) return `“${this.parsed()[bad].label || 'Row ' + (bad + 1)}” needs a number.`;
    if (this.kind() === 'pie' && this.parsed().some((r) => r.value < 0)) return 'A pie chart can only show numbers of 0 or more.';
    return '';
  });
  protected readonly changed = computed(() => {
    const saved = this.#saved();
    return !!saved && (saved.chart !== this.kind() || saved.title !== this.title().trim() || JSON.stringify(saved.rows) !== JSON.stringify(this.parsed()));
  });

  constructor() {
    // Each chart opened starts from what's on the board; one taken off the board closes the panel.
    effect(() => {
      this.chartId();
      const saved = untracked(this.#saved);
      if (!saved) return;
      this.kind.set(saved.chart);
      this.title.set(saved.title);
      this.rows.set(saved.rows.map((r) => ({ label: r.label, value: String(r.value) })));
    });
    effect(() => {
      if (!this.#saved()) this.closed.emit();
    });
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
  }
}
