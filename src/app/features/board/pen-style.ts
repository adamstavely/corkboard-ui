import { Component, input, output } from '@angular/core';
import { PEN_COLORS, PEN_WIDTHS, type PenColor, type PenStyle } from './board-doc';

const NAMES: Record<PenColor, string> = {
  ink: 'Black',
  gray: 'Gray',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
};
const WIDTH_NAMES: Record<number, string> = { 2: 'Fine', 4: 'Medium', 8: 'Bold', 16: 'Marker' };

/**
 * The pen's colour and thickness, in a small panel. Shown down the side of the rail while the pen is picked (for the
 * next strokes), and across, over selected strokes (for those). The thickness buttons show a dot of that size in the colour picked.
 */
@Component({
  selector: 'app-pen-style',
  template: `
    <div class="panel" [class.app-island]="!inMenu()" [class.vertical]="vertical()" role="toolbar" [attr.aria-label]="label()" [attr.aria-orientation]="vertical() ? 'vertical' : 'horizontal'" (pointerdown)="$event.stopPropagation()">
      <div class="group" role="radiogroup" aria-label="Colour">
        @for (color of colors; track color) {
          <button
            type="button"
            class="icon-btn swatch"
            role="radio"
            [attr.aria-checked]="value().color === color"
            [attr.aria-label]="names[color]"
            [attr.data-tip]="names[color]"
            (click)="changed.emit({ color })"
          >
            <span class="dot" [style.background]="'var(--pen-' + color + ')'"></span>
          </button>
        }
      </div>
      <span class="sep" aria-hidden="true"></span>
      <div class="group" role="radiogroup" aria-label="Thickness">
        @for (width of widths; track width) {
          <button
            type="button"
            class="icon-btn"
            role="radio"
            [attr.aria-checked]="value().width === width"
            [attr.aria-label]="widthNames[width] + ', ' + width + ' pixels'"
            [attr.data-tip]="widthNames[width]"
            (click)="changed.emit({ width })"
          >
            <span class="dot" [style.width.px]="dot(width)" [style.height.px]="dot(width)" [style.background]="'var(--pen-' + value().color + ')'"></span>
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .panel {
      display: flex;
      align-items: center;
      gap: var(--tc-space-1);
      white-space: nowrap;
    }
    .sep {
      align-self: stretch;
      width: 1px;
      margin: 4px 2px;
      background: var(--tc-border-subtle);
    }
    .group {
      display: flex;
      gap: 2px;
    }
    .vertical,
    .vertical .group {
      flex-direction: column;
    }
    .vertical .sep {
      width: auto;
      height: 1px;
      margin: 2px 4px;
    }
    .icon-btn[aria-checked='true'] {
      background: var(--tc-accent-subtle);
      box-shadow: inset 0 0 0 1.5px var(--tc-accent-text);
    }
    .dot {
      display: block;
      flex: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tc-text-primary) 15%, transparent);
    }
  `,
})
export class PenStyleBar {
  readonly value = input.required<PenStyle>();
  readonly label = input('Pen');
  /** Inside a menu, which is already a raised box: no box of its own. */
  readonly inMenu = input(false);
  /** Down the page, beside the rail; across, in a menu. */
  readonly vertical = input(false);
  readonly changed = output<Partial<PenStyle>>();

  protected readonly colors = PEN_COLORS;
  protected readonly widths = PEN_WIDTHS;
  protected readonly names = NAMES;
  protected readonly widthNames = WIDTH_NAMES;
  /** How big a thickness's sample dot is: its width, at least 4px so the finest shows, at most 20px to fit. */
  protected dot(width: number): number {
    return Math.max(4, Math.min(20, width + 2));
  }
}
