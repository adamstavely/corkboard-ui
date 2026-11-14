import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Corkboard's mark: a sticky note, its corner turned, on a blue tile. Its colours are fixed (it's a logo, not an
 * icon), and it's the same drawing as public/favicon.svg.
 */
const PARTS: [string, Record<string, string>][] = [
  ['rect', { x: '1', y: '1', width: '30', height: '30', rx: '8', fill: '#2f5bd3' }],
  ['path', { d: 'M9 9h14v9l-5 5H9z', fill: '#ffd84d' }],
  ['path', { d: 'M23 18h-5v5z', fill: '#e0b400' }],
];

/** The mark as an SVG element, for Trench Coat's header brand, which takes its logo as an element. */
export function logoElement(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of PARTS) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

/** The mark in a template; decorative, so the name beside it carries the meaning. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--logo-size, 24px);
      height: var(--logo-size, 24px);
    }
    :host ::ng-deep svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class Logo {
  constructor() {
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.append(logoElement());
  }
}
