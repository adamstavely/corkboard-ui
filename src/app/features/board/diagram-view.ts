import { Component, input, resource } from '@angular/core';
import { renderDiagram, svgUrl } from './diagram';

/** A diagram drawn from its Mermaid text, fitted to its box; or what's wrong with the text. */
@Component({
  selector: 'app-diagram-view',
  template: `
    @if (drawn.value(); as d) {
      @if ('svg' in d) {
        <img [src]="url(d.svg)" [alt]="label()" draggable="false" />
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
      overflow: hidden;
    }
    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
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
  protected readonly drawn = resource({ params: () => this.source(), loader: ({ params }) => renderDiagram(params) });
  protected readonly url = svgUrl;
}
