import { afterNextRender, Component, computed, DestroyRef, effect, inject, Injector, input, output, resource, signal, untracked, viewChild } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { replayControllerFrames } from '../../api/generated/fn/activity/replay-controller-frames';
import { replayControllerStates } from '../../api/generated/fn/activity/replay-controller-states';
import type { ReplayFrameDto } from '../../api/generated/models/replay-frame-dto';
import { Icon } from '../../shared/icon';
import { BoardChanges } from './board-changes';
import { BoardDoc } from './board-doc';
import { Canvas } from './canvas';
import type { DiagramImages } from './diagram';
import { CHUNK, chunkOf, decode, eventsAt, nextPoint, pointTime, rangeOf, route, sameDay, SPEEDS, type ReplayRange, type Speed } from './replay-steps';
import { changesSince, contentOf, unchanged, type BoardChanges as Changes } from './versions';

const RANGES = [
  { value: 'session', label: 'This session' },
  { value: 'all', label: 'All history' },
];
const SPEED_OPTIONS = SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }));

/**
 * Replay: the board as it was at each point of its history, read-only, stepped through with a timeline, beside what
 * changed at each step and who did what. Esc or "Back to the board" leaves.
 */
@Component({
  selector: 'app-board-replay',
  imports: [Button, Canvas, Icon, SegmentedControl, Skeleton, BoardChanges],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="replay" role="region" aria-label="Replay of the board">
      <div class="bar">
        <div class="what">
          <strong>Replay</strong>
          <span>{{ frame() ? pointTime(frame()!.at, oneDay()) : '' }} · read-only</span>
        </div>
        <div class="choice" role="group" aria-labelledby="replay-range">
          <span id="replay-range" class="sr-only">Show</span>
          <tc-segmented-control size="sm" [options]="ranges" [value]="range()" (tc-value-change)="pickRange($event.detail.value)"></tc-segmented-control>
        </div>
        <tc-button size="sm" variant="secondary" label="Back to the board" (click)="closed.emit()"></tc-button>
      </div>
      <div class="body">
        <div class="stage">
          @if (board(); as b) {
            <app-canvas [board]="b" [readOnly]="true" readOnlyLabel="Replay" [privateMode]="namesHidden()" [fileUrls]="fileUrls()" [diagramImages]="diagramImages()" />
          } @else if (problem()) {
            <p class="problem" role="alert">{{ problem() }}</p>
          } @else if (frames().length || data.isLoading()) {
            <tc-skeleton aria-label="Loading the replay"></tc-skeleton>
          } @else {
            <p class="problem">There's nothing to replay yet. The board keeps its history as people edit it.</p>
          }
        </div>
        <aside class="side" aria-labelledby="replay-step-heading">
          <h2 id="replay-step-heading">At this point</h2>
          @if (frame(); as f) {
            <p class="muted">{{ pointTime(f.at, false) }}{{ f.label ? ' · ' + f.label : '' }}</p>
          }
          <div [attr.aria-live]="playing() ? 'off' : 'polite'">
            @if (events().length) {
              <h3>Who did what</h3>
              <ul class="events">
                @for (e of events(); track e.id) {
                  <li>
                    <span>{{ namesHidden() ? 'Someone' : e.actor }} {{ e.action }}{{ e.target ? ': ' + e.target : '' }}</span>
                    <span class="muted">{{ pointTime(e.at, true) }}</span>
                  </li>
                }
              </ul>
            }
            @if (changes(); as c) {
              @if (!unchanged(c)) {
                <h3>What changed</h3>
                <app-board-changes [changes]="c" />
              }
            }
            @if (frame() && !events().length && (!changes() || unchanged(changes()!))) {
              <p class="muted">{{ index() === start() ? 'Where the replay starts.' : 'Nothing else changed here.' }}</p>
            }
          </div>
        </aside>
      </div>
      <div class="controls">
        <button type="button" class="icon-btn" aria-label="Step back" data-tip="Step back" [disabled]="!ready() || index() <= start()" (click)="step(-1)">
          <app-icon name="stepBack" />
        </button>
        <button type="button" class="icon-btn filled" [attr.aria-label]="playing() ? 'Pause' : 'Play'" [attr.data-tip]="playing() ? 'Pause' : 'Play'" [disabled]="!ready() || start() === end()" (click)="toggle()">
          <app-icon [name]="playing() ? 'pause' : 'play'" />
        </button>
        <button type="button" class="icon-btn" aria-label="Step forward" data-tip="Step forward" [disabled]="!ready() || index() >= end()" (click)="step(1)">
          <app-icon name="stepForward" />
        </button>
        <input
          class="scrubber"
          type="range"
          aria-label="Point in the board's history"
          [attr.aria-valuetext]="valueText()"
          [min]="start()"
          [max]="end()"
          step="1"
          [value]="index()"
          [disabled]="!ready()"
          (input)="seek($event)"
        />
        <span class="time" aria-hidden="true">{{ ready() ? index() - start() + 1 + ' / ' + (end() - start() + 1) : '' }}</span>
        <div class="choice" role="group" aria-labelledby="replay-speed">
          <span id="replay-speed" class="label">Speed</span>
          <tc-segmented-control size="sm" [options]="speeds" [value]="speed() + ''" (tc-value-change)="pickSpeed($event.detail.value)"></tc-segmented-control>
        </div>
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
    .replay {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .bar,
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--tc-space-2);
      padding: var(--tc-space-2) var(--tc-space-4);
      background: var(--tc-accent-subtle);
    }
    .bar {
      border-bottom: 1px solid var(--tc-border-subtle);
    }
    .controls {
      border-top: 1px solid var(--tc-border-subtle);
      background: var(--tc-surface-raised);
    }
    .what {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: 0 var(--tc-space-2);
      min-width: 0;
    }
    .what span,
    .muted,
    .time,
    .label {
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .choice {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .scrubber {
      flex: 1;
      min-width: 160px;
      accent-color: var(--tc-accent-text);
    }
    .scrubber:focus-visible {
      outline: 2px solid var(--tc-focus-ring, var(--tc-accent-text));
      outline-offset: 2px;
    }
    .time {
      min-width: 5ch;
      font-variant-numeric: tabular-nums;
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
    .side {
      width: 320px;
      overflow: auto;
      padding: var(--tc-space-4);
      border-left: 1px solid var(--tc-border-subtle);
      background: var(--tc-surface-raised);
    }
    h2 {
      margin: 0 0 var(--tc-space-1);
      font-size: var(--tc-font-size-md);
    }
    h3 {
      margin: var(--tc-space-4) 0 var(--tc-space-1);
      font-size: var(--tc-font-size-sm);
    }
    .events {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .events li {
      display: flex;
      flex-direction: column;
      padding: var(--tc-space-1) 0;
      font-size: var(--tc-font-size-sm);
    }
    .problem {
      padding: var(--tc-space-8);
    }
    @media (max-width: 720px) {
      .body {
        flex-direction: column;
      }
      .side {
        width: auto;
        max-height: 35%;
        border-left: 0;
        border-top: 1px solid var(--tc-border-subtle);
      }
    }
    /* New things fade in as the board grows; only for those who haven't asked for less motion. */
    @media (prefers-reduced-motion: no-preference) {
      :host ::ng-deep :is(app-note, .note-far, [data-media-id], [data-item-id]) {
        animation: replay-in 400ms ease-out;
      }
    }
    @keyframes replay-in {
      from {
        opacity: 0;
      }
    }
  `,
})
export class BoardReplay {
  readonly #api = inject(Api);
  readonly #injector = inject(Injector);

  readonly boardId = input.required<string>();
  /** The board is in private mode now: names stay hidden here too. */
  readonly privateMode = input(false);
  readonly fileUrls = input<ReadonlyMap<string, string>>(new Map());
  readonly diagramImages = input<DiagramImages | undefined>(undefined);
  readonly closed = output<void>();

  private readonly canvas = viewChild(Canvas);
  protected readonly ranges = RANGES;
  protected readonly speeds = SPEED_OPTIONS;
  protected readonly pointTime = pointTime;
  protected readonly unchanged = unchanged;

  protected readonly data = resource({
    params: () => ({ id: this.boardId() }),
    loader: ({ params }) => this.#api.invoke(replayControllerFrames, { id: params.id }),
  });
  protected readonly frames = computed<ReplayFrameDto[]>(() => (this.data.hasValue() ? this.data.value().frames : []));
  protected readonly range = signal<ReplayRange>('session');
  readonly #bounds = computed(() => rangeOf(this.frames(), this.data.hasValue() ? this.data.value().sessionStartId : null, this.range()));
  protected readonly start = computed(() => this.#bounds().start);
  protected readonly end = computed(() => this.#bounds().end);
  protected readonly ready = computed(() => this.frames().length > 0);
  protected readonly oneDay = computed(() => {
    const f = this.frames();
    return f.length > 0 && sameDay(f[this.start()].at, f[this.end()].at);
  });

  /** The point to show, by its place in the whole history. */
  protected readonly index = signal(0);
  protected readonly frame = computed<ReplayFrameDto | undefined>(() => this.frames()[this.index()]);
  protected readonly playing = signal(false);
  protected readonly speed = signal<Speed>(1);

  /** The board as it was at the point shown, and what changed since the point before it. */
  protected readonly board = signal<BoardDoc | null>(null);
  protected readonly changes = signal<Changes | null>(null);
  /** The point shown was in private mode. */
  readonly #wasPrivate = signal(false);
  protected readonly namesHidden = computed(() => this.privateMode() || this.#wasPrivate());
  protected readonly problem = signal('');
  protected readonly events = computed(() => (this.data.hasValue() ? eventsAt(this.data.value().events, this.frames(), this.index()) : []));
  protected readonly valueText = computed(() => {
    const f = this.frame();
    return f ? `${pointTime(f.at, this.oneDay())}, ${this.index() - this.start() + 1} of ${this.end() - this.start() + 1}` : '';
  });

  /** Which point is on screen, to step on from. */
  #shown: number | null = null;
  /** Bumped by every move, so a slower one that finishes late doesn't win. */
  #move = 0;
  readonly #chunks = new Map<number, Promise<Map<string, Uint8Array>>>();

  constructor() {
    // A new history, or a different range: start from its beginning.
    effect(() => {
      const { start } = this.#bounds();
      this.frames();
      untracked(() => {
        this.playing.set(false);
        this.index.set(start);
      });
    });
    effect(() => {
      if (this.data.error()) this.problem.set("The board's history couldn't be loaded.");
    });
    effect(() => {
      const target = this.index();
      if (this.ready()) untracked(() => void this.#show(target));
    });
    // Playing: a point a second (or two, or four), stopping at the end; it waits for a slow chunk rather than skipping.
    effect((onCleanup) => {
      if (!this.playing()) return;
      const timer = setInterval(() => {
        if (this.#shown !== this.index()) return;
        const next = nextPoint(this.index(), this.end());
        if (next === null) this.playing.set(false);
        else this.index.set(next);
        // The next chunk on its way before it's needed.
        if (next !== null && next % CHUNK >= CHUNK - 5 && next + 5 <= this.end()) void this.#chunk(chunkOf(next + 5));
      }, 1000 / this.speed());
      onCleanup(() => clearInterval(timer));
    });
    inject(DestroyRef).onDestroy(() => this.board()?.destroy());
  }

  protected step(by: -1 | 1): void {
    this.playing.set(false);
    this.index.set(Math.min(this.end(), Math.max(this.start(), this.index() + by)));
  }

  protected toggle(): void {
    // Playing from the end starts again.
    if (!this.playing() && this.index() >= this.end()) this.index.set(this.start());
    this.playing.set(!this.playing());
  }

  protected seek(e: Event): void {
    this.playing.set(false);
    this.index.set(Number((e.target as HTMLInputElement).value));
  }

  protected pickRange(value: string): void {
    this.range.set(value === 'all' ? 'all' : 'session');
  }

  protected pickSpeed(value: string): void {
    const speed = SPEEDS.find((s) => String(s) === value);
    if (speed) this.speed.set(speed);
  }

  /** Shows the board at point `target`, building on what's shown when it can. */
  async #show(target: number): Promise<void> {
    const move = ++this.#move;
    const frames = this.frames();
    const path = route(this.#shown, target);
    let updates: Map<string, Uint8Array>;
    try {
      updates = await this.#chunk(chunkOf(target));
    } catch {
      if (move === this.#move) this.problem.set("This part of the board's history couldn't be loaded. Try again.");
      return;
    }
    if (move !== this.#move) return;
    const first = !this.board();
    // The board at the point before, so what changed between the two can be told: what's shown, when it's that one.
    let before = this.#shown === target - 1 && this.board() ? contentOf(this.board()!) : null;
    const board = path.fresh ? new BoardDoc() : this.board()!;
    for (let i = path.from; i <= path.to; i++) {
      if (i === path.to && i > path.from) before = contentOf(board);
      const update = updates.get(frames[i].id);
      if (update) board.apply(update);
    }
    this.problem.set('');
    this.changes.set(before && target > this.start() ? changesSince(before, board) : null);
    this.#wasPrivate.set(board.doc.getMap('privacy').get('on') === true);
    this.#shown = target;
    if (path.fresh) {
      const old = this.board();
      this.board.set(board);
      old?.destroy();
    }
    // Open showing everything on it, as a board does.
    if (first) afterNextRender(() => this.canvas()?.fitAll(), { injector: this.#injector });
  }

  /** The chunk of points starting at `start`, fetched once. */
  #chunk(start: number): Promise<Map<string, Uint8Array>> {
    let chunk = this.#chunks.get(start);
    if (!chunk) {
      const from = this.frames()[start].id;
      chunk = this.#api.invoke(replayControllerStates, { id: this.boardId(), from, count: CHUNK }).then((r) => new Map(r.states.map((s) => [s.id, decode(s.update)])));
      // A failed fetch can be tried again.
      chunk.catch(() => this.#chunks.delete(start));
      this.#chunks.set(start, chunk);
    }
    return chunk;
  }
}
