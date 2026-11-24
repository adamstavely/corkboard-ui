import { afterNextRender, Component, computed, effect, type ElementRef, input, output, signal, viewChild } from '@angular/core';
import { Icon } from '../../shared/icon';
import { GENERIC_ICONS, loadDevicon, logoPacks, logoSrc } from './diagrams/shape-icons';

/**
 * Picks an icon for a shape: a search field over the generic icons (drawn with Lucide), the bundled tech logos
 * (Devicon) and the workspace's own logo packs, with No icon first.
 */
@Component({
  selector: 'app-icon-picker',
  imports: [Icon],
  template: `
    <div class="picker" role="dialog" aria-label="Choose an icon" (pointerdown)="$event.stopPropagation()" (keydown.escape)="closed.emit()">
      <input #search class="search" type="search" placeholder="Search icons and logos" aria-label="Search icons and logos" [value]="query()" (input)="query.set($any($event.target).value)" />
      <div class="sections">
        <button type="button" class="choice none" [attr.aria-pressed]="!value()" (click)="picked.emit(null)"><app-icon name="noIcon" /><span>No icon</span></button>
        @for (section of sections(); track section.group) {
          <h3>{{ section.group }}</h3>
          <div class="grid">
            @for (choice of section.choices; track choice.name) {
              <button type="button" class="choice" [attr.aria-pressed]="value() === choice.name" [attr.aria-label]="choice.label" [attr.data-tip]="choice.label" (click)="picked.emit(choice.name)">
                @if (choice.icon) {
                  <app-icon [name]="choice.icon" />
                } @else {
                  <img [src]="choice.src" alt="" />
                }
              </button>
            }
          </div>
        }
        @if (!sections().length) {
          <p class="empty">Nothing matches “{{ query() }}”.</p>
        }
      </div>
    </div>
  `,
  styles: `
    .picker {
      display: grid;
      gap: 8px;
      width: 320px;
      max-height: 420px;
      padding: 8px;
    }
    .search {
      padding: 6px 10px;
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-sm);
      background: var(--tc-surface-base);
      color: var(--tc-text-primary);
      font: inherit;
    }
    .sections {
      overflow: auto;
    }
    h3 {
      margin: 10px 2px 4px;
      color: var(--tc-text-secondary);
      font-size: 12px;
      font-weight: var(--tc-font-weight-semibold);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }
    .choice {
      display: grid;
      place-items: center;
      min-width: 32px;
      min-height: 32px;
      padding: 4px;
      border: 1px solid transparent;
      border-radius: var(--tc-radius-sm);
      background: none;
      color: var(--tc-text-primary);
      cursor: pointer;
    }
    .choice:hover,
    .choice:focus-visible {
      background: var(--tc-fill-hover, var(--tc-fill-default));
    }
    .choice[aria-pressed='true'] {
      border-color: var(--tc-accent-text);
      background: var(--tc-accent-subtle);
    }
    /* Logos in their own colours, on a white disc as on the board, so dark ones show in dark mode. */
    .choice img {
      width: 24px;
      height: 24px;
      padding: 3px;
      border-radius: 50%;
      background: #ffffff;
      object-fit: contain;
    }
    .choice.none {
      display: flex;
      gap: 8px;
      width: 100%;
      justify-content: flex-start;
      font: inherit;
      font-size: 13px;
    }
    .empty {
      margin: 8px 2px;
      color: var(--tc-text-secondary);
      font-size: 13px;
    }
  `,
})
export class IconPicker {
  /** The icon the shape has now. */
  readonly value = input<string | undefined>();
  readonly picked = output<string | null>();
  readonly closed = output<void>();
  protected readonly query = signal('');

  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  constructor() {
    // The tech logos load when the picker first opens, and the search field takes the keys.
    effect(() => void loadDevicon());
    afterNextRender(() => this.search()?.nativeElement.focus());
  }

  protected readonly sections = computed(() => {
    const q = this.query().trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const generic = GENERIC_ICONS.map((g) => ({
      group: g.group,
      choices: g.icons.filter((i) => match(i.label) || match(i.name)).map((i) => ({ name: i.name, label: i.label, icon: i.icon, src: '' })),
    }));
    const logos = [...logoPacks()].map(([pack, entries]) => ({
      group: pack === 'devicon' ? 'Tech logos' : `Logos: ${pack}`,
      choices: Object.entries(entries)
        .filter(([name]) => match(name))
        .slice(0, 300)
        .map(([name, logo]) => ({ name: `logo:${pack}/${name}`, label: name, icon: undefined, src: logoSrc(logo) })),
    }));
    return [...generic, ...logos].filter((s) => s.choices.length);
  });
}
