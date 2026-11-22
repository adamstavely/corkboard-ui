import { Component, DestroyRef, ElementRef, computed, inject, input, resource, signal } from '@angular/core';
import { placeHotspot, renderDiagram, svgUrl, type DiagramImages } from './diagram';

/**
 * A diagram drawn from its Mermaid text, fitted to its box; or what's wrong with the text. Its nodes' links (click A
 * href "https://…") lie over the drawing as ordinary links, when `links` is on: the drawing itself is an image, so
 * nothing in it can be clicked.
 */
@Component({
  selector: 'app-diagram-view',
  template: `
    @if (drawn.value(); as d) {
      @if ('svg' in d) {
        <img [src]="url(d.svg)" [alt]="label()" draggable="false" />
        @for (spot of hotspots(); track $index) {
          <a
            class="hotspot"
            [href]="spot.url"
            target="_blank"
            rel="noopener noreferrer"
            draggable="false"
            [attr.aria-label]="spot.label + ', opens ' + spot.url + ' in a new tab'"
            [attr.data-tip]="spot.url"
            data-tip-side="top"
            [style.left.px]="spot.left"
            [style.top.px]="spot.top"
            [style.width.px]="spot.width"
            [style.height.px]="spot.height"
            (pointerdown)="$event.stopPropagation()"
            (dblclick)="$event.stopPropagation()"
            (keydown.enter)="$event.stopPropagation()"
          ></a>
        }
      } @else {
        <p class="problem">{{ d.error }}</p>
      }
    } @else {
      <p class="muted">Drawing…</p>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
    }
    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
    }
    .hotspot {
      position: absolute;
      border-radius: var(--tc-radius-sm, 4px);
      cursor: pointer;
    }
    .hotspot:hover {
      background: rgb(0 102 204 / 0.08);
      box-shadow: inset 0 0 0 2px rgb(0 102 204 / 0.5);
    }
    .hotspot:focus-visible {
      outline: 2px solid var(--tc-focus-ring, #0066cc);
      outline-offset: 2px;
    }
    p {
      margin: 0;
      padding: var(--tc-space-3);
      font-size: var(--tc-font-size-sm);
      text-align: center;
    }
    .problem {
      color: var(--tc-status-danger-fg, var(--tc-text-primary));
    }
    .muted {
      color: var(--tc-text-muted);
    }
  `,
})
export class DiagramView {
  readonly source = input.required<string>();
  readonly label = input('Diagram');
  /** Where its pictures come from: the board's files and the web, through the API. Without them, pictures show blank. */
  readonly images = input<DiagramImages | undefined>(undefined);
  /** Lay its nodes' links over it, to follow. Off while the board is busy with something else (drawing, connecting). */
  readonly links = input(false);

  protected readonly drawn = resource({
    params: () => ({ source: this.source(), images: this.images() }),
    loader: ({ params }) => renderDiagram(params.source, params.images),
  });
  protected readonly url = svgUrl;

  /** The box's size as laid out (before the board's zoom), to place the links in. */
  readonly #size = signal({ w: 0, h: 0 });
  protected readonly hotspots = computed(() => {
    const d = this.drawn.value();
    const shown = this.#size();
    if (!this.links() || !d || !('svg' in d) || !shown.w || !shown.h) return [];
    return d.hotspots.map((h) => ({ ...h, ...placeHotspot(h.box, d.view, d, shown) }));
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([entry]) => this.#size.set({ w: entry.contentRect.width, h: entry.contentRect.height }));
    watch.observe(host);
    inject(DestroyRef).onDestroy(() => watch.disconnect());
  }
}
