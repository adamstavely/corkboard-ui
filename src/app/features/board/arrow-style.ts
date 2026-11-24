import { Component, input, output, signal } from '@angular/core';
import { Icon, type IconName } from '../../shared/icon';
import { ARROW_DASHES, ARROW_HEADS, ARROW_ROUTES, ARROW_WEIGHTS, type ArrowDash, type ArrowHead, type ArrowRoute, type ArrowStyle } from './board-doc';
import { arrowHead, type HeadPart } from './export';

const ROUTES: Record<ArrowRoute, { label: string; icon: IconName }> = {
  straight: { label: 'Straight', icon: 'arrow' },
  elbow: { label: 'Right angle', icon: 'elbow' },
  curve: { label: 'Curved', icon: 'curve' },
};
const DASHES: Record<ArrowDash, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };
const HEADS: Record<ArrowHead, string> = {
  none: 'No end',
  arrow: 'Arrowhead',
  triangle: 'Open triangle (is a)',
  one: 'Exactly one',
  zeroOne: 'Zero or one',
  oneMany: 'One or many',
  zeroMany: 'Zero or many',
};
/** A sample of each end, on a short line: pointing right for the end, left for the start. */
const sample = (head: ArrowHead, side: 'start' | 'end'): HeadPart[] =>
  side === 'end' ? arrowHead(head, { x: 38, y: 10 }, 0, 1.5) : arrowHead(head, { x: 2, y: 10 }, Math.PI, 1.5);
const SAMPLES = Object.fromEntries(
  (['start', 'end'] as const).map((side) => [side, Object.fromEntries(ARROW_HEADS.map((h) => [h, sample(h, side)]))]),
) as Record<'start' | 'end', Record<ArrowHead, HeadPart[]>>;
/** The dash pattern a sample line shows, at the sample's weight. */
const SAMPLE_DASH: Record<ArrowDash, string> = { solid: '', dashed: '6 4', dotted: '0.1 5' };

/**
 * An arrow's style, in a small panel: how it runs (straight, right angle, curved), its weight and its dashes. Shown
 * beside the rail while the arrow tool is picked (for the next arrows), and over a selected arrow (for that one).
 * The weight and dash buttons show the line itself, as colour swatches show a colour.
 */
@Component({
  selector: 'app-arrow-style',
  imports: [Icon],
  template: `
    <div class="app-island panel" role="toolbar" [attr.aria-label]="label()" (pointerdown)="$event.stopPropagation()">
      <div class="group" role="radiogroup" aria-label="Route">
        @for (route of routes; track route) {
          <button type="button" class="icon-btn" role="radio" [attr.aria-checked]="value().route === route" [attr.aria-label]="look[route].label" [attr.data-tip]="look[route].label" (click)="changed.emit({ route })">
            <app-icon [name]="look[route].icon" />
          </button>
        }
      </div>
      <span class="sep" aria-hidden="true"></span>
      <div class="group" role="radiogroup" aria-label="Weight">
        @for (weight of weights; track weight) {
          <button type="button" class="icon-btn sample" role="radio" [attr.aria-checked]="value().weight === weight" [attr.aria-label]="weight + ' pixel line'" [attr.data-tip]="weight + ' px'" (click)="changed.emit({ weight })">
            <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12" [attr.stroke-width]="weight" /></svg>
          </button>
        }
      </div>
      <span class="sep" aria-hidden="true"></span>
      <div class="group" role="radiogroup" aria-label="Line">
        @for (dash of dashes; track dash) {
          <button type="button" class="icon-btn sample" role="radio" [attr.aria-checked]="value().dash === dash" [attr.aria-label]="dashNames[dash]" [attr.data-tip]="dashNames[dash]" (click)="changed.emit({ dash })">
            <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12" stroke-width="2.5" [attr.stroke-dasharray]="sampleDash[dash]" /></svg>
          </button>
        }
      </div>
      <span class="sep" aria-hidden="true"></span>
      @for (side of sides; track side) {
        <div class="ends" (keydown.escape)="open.set(null)">
          <button
            type="button"
            class="icon-btn end-btn"
            aria-haspopup="true"
            [attr.aria-expanded]="open() === side"
            [attr.aria-label]="(side === 'start' ? 'Start: ' : 'End: ') + headNames[value()[side]]"
            [attr.data-tip]="side === 'start' ? 'Start' : 'End'"
            (click)="open.set(open() === side ? null : side)"
          >
            <svg viewBox="0 0 40 20" aria-hidden="true">
              <line x1="2" y1="10" x2="38" y2="10" />
              @for (part of samples[side][value()[side]]; track $index) {
                <path [class]="'fill-' + part.fill" [attr.d]="part.d" />
              }
            </svg>
          </button>
          @if (open() === side) {
            <div class="app-island end-menu" role="radiogroup" [attr.aria-label]="side === 'start' ? 'Start of the arrow' : 'End of the arrow'">
              @for (head of heads; track head) {
                <button type="button" class="end-option" role="radio" [attr.aria-checked]="value()[side] === head" (click)="pick(side, head)">
                  <svg viewBox="0 0 40 20" aria-hidden="true">
                    <line x1="2" y1="10" x2="38" y2="10" />
                    @for (part of samples[side][head]; track $index) {
                      <path [class]="'fill-' + part.fill" [attr.d]="part.d" />
                    }
                  </svg>
                  <span>{{ headNames[head] }}</span>
                </button>
              }
            </div>
          }
        </div>
      }
      @if (removable()) {
        <span class="sep" aria-hidden="true"></span>
        <button type="button" class="icon-btn" [attr.aria-label]="labelled() ? 'Edit label' : 'Add label'" [attr.data-tip]="labelled() ? 'Edit label' : 'Add label'" (click)="labelArrow.emit()"><app-icon name="text" /></button>
        <button type="button" class="icon-btn" aria-label="Turn the arrow round" data-tip="Turn round" (click)="reversed.emit()"><app-icon name="swap" /></button>
        <button type="button" class="icon-btn" aria-label="Delete arrow" data-tip="Delete" (click)="removed.emit()"><app-icon name="trash" /></button>
      }
    </div>
  `,
  styles: `
    .panel {
      white-space: nowrap;
    }
    .group {
      display: flex;
      gap: 2px;
    }
    .icon-btn[aria-checked='true'] {
      background: var(--tc-accent-subtle);
      color: var(--tc-accent-text);
    }
    .sample svg {
      width: 22px;
      height: 22px;
      stroke: currentColor;
      stroke-linecap: round;
    }
    .ends {
      position: relative;
    }
    .end-btn {
      width: auto;
      padding-inline: 4px;
    }
    .end-btn svg,
    .end-option svg {
      width: 40px;
      height: 20px;
      flex: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linejoin: round;
    }
    .fill-line {
      fill: currentColor;
    }
    .fill-paper {
      fill: var(--tc-surface-raised);
    }
    .fill-none {
      fill: none;
    }
    .end-menu {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      z-index: 1;
      display: grid;
      padding: 4px;
    }
    .end-option {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      padding: 4px 10px 4px 6px;
      border: none;
      border-radius: var(--tc-radius-sm);
      background: none;
      color: var(--tc-text-primary);
      font: inherit;
      font-size: 13px;
      text-align: start;
      cursor: pointer;
    }
    .end-option:hover,
    .end-option:focus-visible {
      background: var(--tc-fill-hover, var(--tc-fill-default));
    }
    .end-option[aria-checked='true'] {
      background: var(--tc-accent-subtle);
      color: var(--tc-accent-text);
    }
  `,
})
export class ArrowStyleBar {
  readonly value = input.required<ArrowStyle>();
  readonly label = input('Arrow style');
  /** Offer Delete (for a selected arrow, not the tool's defaults). */
  readonly removable = input(false);
  readonly changed = output<Partial<ArrowStyle>>();
  readonly removed = output<void>();
  /** The arrow has words already (the button then edits them). */
  readonly labelled = input(false);
  readonly labelArrow = output<void>();
  readonly reversed = output<void>();
  protected readonly open = signal<'start' | 'end' | null>(null);
  protected readonly sides = ['start', 'end'] as const;
  protected readonly heads = ARROW_HEADS;
  protected readonly headNames = HEADS;
  protected readonly samples = SAMPLES;

  protected pick(side: 'start' | 'end', head: ArrowHead): void {
    this.open.set(null);
    this.changed.emit({ [side]: head });
  }

  protected readonly routes = ARROW_ROUTES;
  protected readonly weights = ARROW_WEIGHTS;
  protected readonly dashes = ARROW_DASHES;
  protected readonly look = ROUTES;
  protected readonly dashNames = DASHES;
  protected readonly sampleDash = SAMPLE_DASH;
}
