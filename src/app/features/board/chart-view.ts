import { Component, computed, input } from '@angular/core';
import { BarChart } from '@adamstavely/trenchcoat/angular/bar-chart';
import { LineChart } from '@adamstavely/trenchcoat/angular/line-chart';
import { PieChart } from '@adamstavely/trenchcoat/angular/pie-chart';
import type { ChartKind, ChartRow } from './chart';

/** A board chart drawn with Trench Coat's bar, line or pie chart, filling its box under its title. */
@Component({
  selector: 'app-chart-view',
  imports: [BarChart, LineChart, PieChart],
  template: `
    <p class="title">{{ title() || 'Chart' }}</p>
    @if (rows().length) {
      @switch (kind()) {
        @case ('bar') {
          <tc-bar-chart bare still [heading]="title() || 'Chart'" [data]="xy()" [height]="plot()" [highlight]="'max'"></tc-bar-chart>
        }
        @case ('line') {
          <tc-line-chart bare still [heading]="title() || 'Chart'" [data]="xy()" [height]="plot()"></tc-line-chart>
        }
        @case ('pie') {
          <tc-pie-chart bare still [heading]="title() || 'Chart'" [data]="slices()" [height]="plot()"></tc-pie-chart>
        }
      }
    } @else {
      <p class="empty">No numbers yet.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: 100%;
      height: 100%;
      padding: var(--tc-space-3);
      overflow: hidden;
    }
    .title {
      margin: 0;
      overflow: hidden;
      font-weight: var(--tc-font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .empty {
      margin: auto;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class ChartView {
  readonly kind = input.required<ChartKind>();
  readonly title = input('');
  readonly rows = input.required<readonly ChartRow[]>();
  /** The box's height, so the plot fills what's left under the title. */
  readonly boxHeight = input(380);
  protected readonly plot = computed(() => Math.max(80, this.boxHeight() - 72));
  /** The rows in the fields the charts read by default: x and y for bars and lines, label and value for slices. */
  protected readonly xy = computed(() => this.rows().map((r) => ({ x: r.label, y: r.value })));
  protected readonly slices = computed(() => this.rows().map((r) => ({ label: r.label, value: r.value })));
}
