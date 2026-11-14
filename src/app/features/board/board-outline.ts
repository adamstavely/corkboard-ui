import { Component, computed, input, output, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { BoardDoc, Frame } from './board-doc';
import type { Peer } from './presence';
import { Icon } from '../../shared/icon';

/**
 * The board's outline: its frames in order, how much is in each, and who's looking where. Click a frame to go there;
 * reorder them; present them in this order, a frame at a time (people following see each one).
 */
@Component({
  selector: 'app-board-outline',
  imports: [Button, Icon],
  template: `
    <aside class="panel" aria-label="Outline">
      <div class="head">
        <h2>Outline</h2>
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      @if (rows().length) {
        <div class="present" role="group" aria-label="Present frames in order">
          <button type="button" class="icon-btn small" aria-label="Previous frame" [disabled]="step() <= 0" (click)="go(step() - 1)"><app-icon name="arrowLeft" /></button>
          <tc-button size="sm" variant="secondary" [label]="step() < 0 ? 'Present in this order' : 'Frame ' + (step() + 1) + ' of ' + rows().length" (click)="go(step() < 0 ? 0 : step())"></tc-button>
          <button type="button" class="icon-btn small" aria-label="Next frame" [disabled]="step() >= rows().length - 1" (click)="go(step() + 1)"><app-icon name="arrowRight" /></button>
        </div>
        <ol>
          @for (row of rows(); track row.frame.id; let i = $index) {
            <li [class.current]="i === step()">
              <button type="button" class="title" (click)="show.emit(row.frame.id)">
                <span class="name">{{ row.frame.title || 'Untitled frame' }}</span>
                <span class="meta">{{ row.notes }} note{{ row.notes === 1 ? '' : 's' }}{{ row.here.length ? ' · ' + row.here.join(', ') + ' here' : '' }}</span>
              </button>
              @if (canEdit()) {
                <span class="order">
                  <button type="button" [attr.aria-label]="'Move ' + (row.frame.title || 'frame') + ' up'" [disabled]="i === 0" (click)="move(i, -1)"><app-icon name="up" /></button>
                  <button type="button" [attr.aria-label]="'Move ' + (row.frame.title || 'frame') + ' down'" [disabled]="i === rows().length - 1" (click)="move(i, 1)"><app-icon name="chevron" /></button>
                </span>
              }
            </li>
          }
        </ol>
        @if (loose()) {
          <p class="muted">Also {{ loose() }} note{{ loose() === 1 ? '' : 's' }} in no frame.</p>
        }
      } @else {
        <p class="muted">No frames yet. Frames give the board an outline: add one round some notes.</p>
      }
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      top: calc(var(--tc-space-3) + 52px);
      left: var(--tc-space-4);
      z-index: 4;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: 280px;
      max-height: calc(100% - 220px);
      overflow: auto;
      padding: var(--tc-space-3);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.1);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-md);
    }
    .present {
      display: flex;
      gap: 2px;
    }
    ol {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--tc-space-1);
      border-radius: var(--tc-radius-sm);
    }
    li.current {
      background: var(--tc-accent-subtle);
    }
    .title {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
      padding: var(--tc-space-1) var(--tc-space-2);
      border: 0;
      background: none;
      color: var(--tc-text-primary);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .name {
      max-width: 100%;
      overflow: hidden;
      font-weight: var(--tc-font-weight-medium);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta,
    .muted {
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .muted {
      margin: 0;
    }
    .order button {
      padding: 2px 6px;
      border: 0;
      background: none;
      color: var(--tc-text-muted);
      font: inherit;
      cursor: pointer;
    }
    .order button:disabled {
      opacity: 0.3;
      cursor: default;
    }
  `,
})
export class BoardOutline {
  readonly board = input.required<BoardDoc>();
  /** Everyone else on the board, to say who's looking at which frame. */
  readonly peers = input<readonly Peer[]>([]);
  readonly canEdit = input(false);
  readonly closed = output<void>();
  /** Go to this frame. */
  readonly show = output<string>();
  /** Present this frame: go there as the presenter, so followers see it. */
  readonly present = output<string>();

  protected readonly step = signal(-1);

  protected readonly rows = computed(() => {
    const board = this.board();
    board.frames();
    const frames: Frame[] = board.outline();
    return frames.map((frame) => ({
      frame,
      notes: board.notesIn([frame.id]).length,
      here: this.peers()
        .filter((p) => p.pointer && p.pointer.x >= frame.x && p.pointer.x <= frame.x + frame.w && p.pointer.y >= frame.y && p.pointer.y <= frame.y + frame.h)
        .map((p) => p.user.name.split(/\s+/)[0]),
    }));
  });
  protected readonly loose = computed(() => {
    const board = this.board();
    const inFrames = new Set(board.notesIn(board.frames().map((f) => f.id)));
    return board.notes().filter((n) => !inFrames.has(n.id)).length;
  });

  protected go(i: number): void {
    const row = this.rows()[i];
    if (!row) return;
    this.step.set(i);
    this.present.emit(row.frame.id);
  }

  protected move(i: number, by: -1 | 1): void {
    const ids = this.rows().map((r) => r.frame.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    this.board().setFrameOrder(ids);
  }
}
