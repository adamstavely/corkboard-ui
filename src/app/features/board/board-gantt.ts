import { Component, computed, input, output, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { RoadmapTimeline } from '@adamstavely/trenchcoat/angular/roadmap-timeline';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import type { RoadmapSelectedChange } from '@adamstavely/trenchcoat/roadmap-timeline';
import type { BoardDoc } from './board-doc';
import type { StoredTask } from './tasks';
import { PERIODS, roadmapOf, timelinesOf, type Period, type Schedule } from './timeline';

/** Next Monday, as "YYYY-MM-DD": where a timeline starts until someone says otherwise. */
export function nextMonday(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

/**
 * A timeline on the board (a frame of period columns) as a Gantt chart: a lane per owner, a bar per step across its
 * period's dates. Updaters and owners set when it starts and how long each period lasts, for everyone.
 */
@Component({
  selector: 'app-board-gantt',
  imports: [RoadmapTimeline, Select, Button],
  template: `
    <aside class="panel" aria-label="Timeline">
      <div class="head">
        @if (timelines().length > 1) {
          <tc-select label="Timeline" [options]="timelineOptions()" [value]="currentId()" (tc-value-change)="chosen.set($event.detail.value)"></tc-select>
        }
        @if (current()) {
          <label class="start">
            <span>Starts</span>
            <input type="date" [value]="schedule().start" [disabled]="!canEdit()" (change)="setStart($any($event.target).value)" />
          </label>
          <tc-select label="Each column" [options]="periods" [value]="schedule().every" [disabled]="!canEdit()" (tc-value-change)="setEvery($any($event.detail.value))"></tc-select>
        }
        <span class="spacer"></span>
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      @if (current(); as t) {
        <tc-roadmap-timeline
          [heading]="t.frame.title || 'Timeline'"
          [description]="t.columns.length + ' periods, from the board. Select a bar to find its note.'"
          [lanes]="roadmap().lanes"
          [items]="roadmap().items"
          [scale]="schedule().every === 'quarter' || schedule().every === 'month' ? 'month' : 'week'"
          (tc-selected-change)="onSelected($event)"
        ></tc-roadmap-timeline>
      } @else {
        <p class="empty">
          No timeline on this board yet. Put a plan's steps on notes, then ask the assistant to turn the plan into a
          timeline: its columns show here as a Gantt chart.
        </p>
      }
    </aside>
  `,
  styles: `
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
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--tc-space-3);
    }
    .spacer {
      flex: 1;
    }
    .start {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-1);
      font-size: var(--tc-font-size-sm);
      font-weight: var(--tc-font-weight-medium);
    }
    .start input {
      padding: var(--tc-space-1) var(--tc-space-2);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-sm);
      background: var(--tc-surface-base);
      color: var(--tc-text-primary);
      font: inherit;
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
export class BoardGantt {
  readonly board = input.required<BoardDoc>();
  readonly tasks = input<readonly StoredTask[]>([]);
  readonly canEdit = input(false);
  readonly closed = output<void>();
  /** Find a bar's note on the board. */
  readonly show = output<readonly string[]>();

  protected readonly periods = PERIODS;
  protected readonly chosen = signal<string | null>(null);
  protected readonly timelines = computed(() => timelinesOf(this.board().frames()));
  protected readonly timelineOptions = computed(() => this.timelines().map((t) => ({ value: t.frame.id, label: t.frame.title || 'Untitled timeline' })));
  protected readonly current = computed<ReturnType<typeof timelinesOf>[number] | undefined>(
    () => this.timelines().find((t) => t.frame.id === this.chosen()) ?? this.timelines()[0],
  );
  protected readonly currentId = computed(() => this.current()?.frame.id ?? '');

  /** Dates someone without edit rights tried out, kept to this view. */
  readonly #local = signal<Schedule | null>(null);
  protected readonly schedule = computed<Schedule>(() => this.#local() ?? this.current()?.frame.schedule ?? { start: nextMonday(), every: 'week' });
  protected readonly roadmap = computed(() => {
    const t = this.current();
    return t ? roadmapOf(t, this.board(), this.schedule(), this.tasks()) : { lanes: [], items: [] };
  });

  protected setStart(start: string): void {
    if (start) this.#save({ ...this.schedule(), start });
  }

  protected setEvery(every: Period): void {
    this.#save({ ...this.schedule(), every });
  }

  #save(schedule: Schedule): void {
    const t = this.current();
    if (t && this.canEdit()) this.board().setSchedule(t.frame.id, schedule);
    else this.#local.set(schedule);
  }

  protected onSelected(e: CustomEvent<RoadmapSelectedChange>): void {
    if (e.detail.selected) this.show.emit([e.detail.selected]);
  }
}
