import { Component, input, output } from '@angular/core';
import { Icon, type IconName } from '../../shared/icon';
import { ARROW_DASHES, ARROW_ROUTES, ARROW_WEIGHTS, type ArrowDash, type ArrowRoute, type ArrowStyle } from './board-doc';

const ROUTES: Record<ArrowRoute, { label: string; icon: IconName }> = {
  straight: { label: 'Straight', icon: 'arrow' },
  elbow: { label: 'Right angle', icon: 'elbow' },
  curve: { label: 'Curved', icon: 'curve' },
};
const DASHES: Record<ArrowDash, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };
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
      @if (removable()) {
        <span class="sep" aria-hidden="true"></span>
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
  `,
})
export class ArrowStyleBar {
  readonly value = input.required<ArrowStyle>();
  readonly label = input('Arrow style');
  /** Offer Delete (for a selected arrow, not the tool's defaults). */
  readonly removable = input(false);
  readonly changed = output<Partial<ArrowStyle>>();
  readonly removed = output<void>();

  protected readonly routes = ARROW_ROUTES;
  protected readonly weights = ARROW_WEIGHTS;
  protected readonly dashes = ARROW_DASHES;
  protected readonly look = ROUTES;
  protected readonly dashNames = DASHES;
  protected readonly sampleDash = SAMPLE_DASH;
}
