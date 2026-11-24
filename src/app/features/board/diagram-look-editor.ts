import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import {
  contrast,
  FONT_NAMES,
  FONT_STACKS,
  MIN_CONTRAST,
  normHex,
  THEME_FONTS,
  THEME_SLOTS,
  themeFromBrand,
  themeProblems,
  type DiagramTheme,
  type ThemeFont,
} from './diagrams/diagram-theme';

const SLOT_NAMES: Record<(typeof THEME_SLOTS)[number], string> = {
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow',
  purple: 'Purple',
  pink: 'Pink',
  gray: 'Grey',
};

/**
 * A diagram look to change: its name, the six fills in light and dark (each with the contrast of text on it), the
 * text colours, the font and the corners, with a preview in both modes. Brand colours make a fresh start. Changes go
 * out as they're made; whoever holds the look decides when it's saved.
 */
@Component({
  selector: 'app-diagram-look-editor',
  imports: [Button, Select],
  template: `
    @let t = draft();
    <div class="row">
      <label class="field grow">
        <span>Name</span>
        <input
          class="text-input"
          maxlength="60"
          [value]="t.name"
          (input)="set({ name: $any($event.target).value })"
        />
      </label>
      <tc-select
        label="Font"
        [options]="fonts"
        [value]="t.font"
        (tc-value-change)="set({ font: $any($event.detail.value) })"
      ></tc-select>
      <label class="field">
        <span>Corners ({{ t.radius }} px)</span>
        <input
          type="range"
          min="0"
          max="24"
          step="1"
          [value]="t.radius"
          (input)="set({ radius: +$any($event.target).value })"
        />
      </label>
    </div>

    <table class="fills">
      <caption class="sr-only">
        The fills for each colour, and how readable text is on them
      </caption>
      <thead>
        <tr>
          <th scope="col">Colour</th>
          <th scope="col">Light</th>
          <th scope="col">Dark</th>
        </tr>
      </thead>
      <tbody>
        @for (slot of slots; track slot; let i = $index) {
          <tr>
            <th scope="row">{{ slotNames[slot] }}</th>
            @for (mode of modes; track mode) {
              <td>
                <span class="pick">
                  <input
                    type="color"
                    [attr.aria-label]="slotNames[slot] + ' fill, ' + mode"
                    [value]="t[mode][i]"
                    (input)="fill(mode, i, $any($event.target).value)"
                  />
                  <code>{{ t[mode][i] }}</code>
                  <span class="ratio" [class.bad]="ratio(mode, i) < min"
                    >{{ ratio(mode, i).toFixed(1) }}:1</span
                  >
                </span>
              </td>
            }
          </tr>
        }
        <tr>
          <th scope="row">Text on fills</th>
          @for (mode of modes; track mode) {
            <td>
              <span class="pick">
                <input
                  type="color"
                  [attr.aria-label]="'Text colour, ' + mode"
                  [value]="t.ink[mode]"
                  (input)="ink(mode, $any($event.target).value)"
                />
                <code>{{ t.ink[mode] }}</code>
              </span>
            </td>
          }
        </tr>
      </tbody>
    </table>

    <div class="previews" aria-hidden="true">
      @for (mode of modes; track mode) {
        <div class="preview" [class.dark]="mode === 'dark'" [style.font-family]="stack()">
          @for (slot of slots; track slot; let i = $index) {
            <span
              class="box"
              [style.background]="t[mode][i]"
              [style.color]="t.ink[mode]"
              [style.border-radius.px]="t.radius"
              >{{ slotNames[slot] }}</span
            >
          }
        </div>
      }
    </div>

    <p class="status" role="status">
      @if (problems().length) {
        {{ problems().length }} thing{{ problems().length === 1 ? '' : 's' }} to fix before it can
        be used: {{ problems().join(' ') }}
      } @else {
        Text on every fill meets WCAG 2.2 AA ({{ min }}:1) in light and dark.
      }
    </p>

    <div class="row">
      <label class="field grow">
        <span>Start again from brand colours</span>
        <input
          class="text-input"
          placeholder="#e4002b, #00205b"
          [value]="brand()"
          (input)="brand.set($any($event.target).value)"
          (keydown.enter)="fromBrand()"
        />
      </label>
      <tc-button
        size="sm"
        variant="secondary"
        label="Make fills"
        [disabled]="!brandColours().length"
        (click)="fromBrand()"
      ></tc-button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--tc-space-3);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-1);
      font-size: var(--tc-font-size-sm);
    }
    .grow {
      flex: 1;
      min-width: 12rem;
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
    .fills {
      border-collapse: collapse;
      font-size: var(--tc-font-size-sm);
    }
    .fills th,
    .fills td {
      padding: var(--tc-space-1) var(--tc-space-2);
      text-align: left;
    }
    .pick {
      display: inline-flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .pick input {
      width: 32px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-sm);
      background: none;
    }
    .ratio {
      color: var(--tc-text-secondary);
      font-variant-numeric: tabular-nums;
    }
    .ratio.bad {
      color: var(--tc-status-danger-fg);
      font-weight: var(--tc-font-weight-semibold);
    }
    .previews {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tc-space-2);
    }
    .preview {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tc-space-2);
      padding: var(--tc-space-3);
      border: 1px solid var(--tc-border-subtle, var(--tc-border-default));
      border-radius: var(--tc-radius-md);
      background: #ffffff;
    }
    .preview.dark {
      background: #1c1c1c;
    }
    .box {
      padding: var(--tc-space-2) var(--tc-space-3);
      font-size: 13px;
    }
    .status {
      margin: 0;
      font-size: var(--tc-font-size-sm);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class DiagramLookEditor {
  readonly theme = input.required<DiagramTheme>();
  readonly themeChange = output<DiagramTheme>();

  protected readonly draft = linkedSignal(() => this.theme());
  protected readonly brand = signal('');
  protected readonly slots = THEME_SLOTS;
  protected readonly slotNames = SLOT_NAMES;
  protected readonly modes = ['light', 'dark'] as const;
  protected readonly min = MIN_CONTRAST;
  protected readonly fonts = THEME_FONTS.map((f) => ({ value: f, label: FONT_NAMES[f] }));
  protected readonly problems = computed(() => themeProblems(this.draft()));
  protected readonly stack = computed(() =>
    FONT_STACKS[this.draft().font].replace('var(--tc-font-sans)', 'Inter, system-ui, sans-serif'),
  );
  protected readonly brandColours = computed(() =>
    this.brand()
      .split(/[\s,;]+/)
      .map((c) => normHex(c))
      .filter((c): c is string => !!c),
  );

  protected ratio(mode: 'light' | 'dark', i: number): number {
    const t = this.draft();
    return contrast(t[mode][i], t.ink[mode]);
  }

  protected set(patch: Partial<Pick<DiagramTheme, 'name' | 'font' | 'radius'>>): void {
    const next = { ...this.draft(), ...patch };
    if (patch.font && !THEME_FONTS.includes(patch.font as ThemeFont)) return;
    this.#emit(next);
  }

  protected fill(mode: 'light' | 'dark', i: number, value: string): void {
    const hex = normHex(value);
    if (!hex) return;
    const t = this.draft();
    const fills = [...t[mode]];
    fills[i] = hex;
    this.#emit({ ...t, [mode]: fills });
  }

  protected ink(mode: 'light' | 'dark', value: string): void {
    const hex = normHex(value);
    if (hex) this.#emit({ ...this.draft(), ink: { ...this.draft().ink, [mode]: hex } });
  }

  protected fromBrand(): void {
    const colours = this.brandColours();
    if (!colours.length) return;
    const t = this.draft();
    this.#emit(themeFromBrand(colours, { name: t.name, font: t.font, radius: t.radius }));
  }

  #emit(next: DiagramTheme): void {
    this.draft.set(next);
    this.themeChange.emit(next);
  }
}
