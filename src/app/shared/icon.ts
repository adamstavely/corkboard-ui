import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A small dot, as path data, for the "more" and emoji icons. */
const dot = (x: number, y: number) => `M${x - 1} ${y}a1 1 0 1 0 2 0 1 1 0 0 0-2 0z`;

/** Stroked 24×24 icons for the board's floating panels and tool rail, as SVG path data. */
export const ICONS = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  more: dot(12, 5) + dot(12, 12) + dot(12, 19),
  export: 'M12 15V3M7 8l5-5 5 5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  timer: 'M10 2h4M12 14l3-3M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z',
  comments: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  play: 'M7 4l13 8-13 8z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4-5.7',
  chevron: 'M6 9l6 6 6-6',
  cloud: 'M17.5 19H8a6 6 0 1 1 5.7-8h1.8a4 4 0 0 1 2 8z',
  cloudOff: 'M17.5 19H8a6 6 0 0 1-3.2-11M9.6 5.2A6 6 0 0 1 13.7 11h1.8a4 4 0 0 1 3.6 5.7M2 2l20 20',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 3v4M3 5h4',
  cursor: 'M4 4l7 17 2.5-7.5L21 11z',
  create: 'M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6M8 9h4M8 13h8M8 17h8M18 2v6M15 5h6',
  template: 'M4 4h16v16H4zM4 9h16M9 9v11',
  sticky: 'M15 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10zM15 21v-4a2 2 0 0 1 2-2h4',
  text: 'M5 7V4h14v3M9 20h6M12 4v16',
  shapes: 'M3 3h7v7H3zM17.5 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM6.5 14L10 20H3zM14 21l7-7M16 14h5v5',
  pen: 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6M11 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  frame: 'M22 6H2M22 18H2M6 2v20M18 2v20',
  smile: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 14s1.5 2 4 2 4-2 4-2' + dot(9, 9) + dot(15, 9),
  comment: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z' + dot(8, 12) + dot(12, 12) + dot(16, 12),
  hidden: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.4 3.2M6.6 6.6A17 17 0 0 0 2.5 12S6 19 12 19a9.5 9.5 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5M10 5h9v9',
  rect: 'M4 5h16v14H4z',
  oval: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  rhombus: 'M12 3l9 9-9 9-9-9z',
  triangle: 'M12 4l9 16H3z',
  table: 'M3 4h18v16H3zM3 10h18M3 15h18M9 4v16M15 4v16',
  timeline: 'M3 3v18h18M7 7h8M9 12h9M7 17h6',
  kanban: 'M5 3h4v18H5zM10 3h4v12h-4zM15 3h4v8h-4z',
  matrix: 'M4 4h16v16H4zM12 4v16M4 12h16',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6',
  image: 'M3 3h18v18H3zM8.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM21 15l-5-5L5 21',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  fit: 'M3 8V4a1 1 0 0 1 1-1h4M16 3h4a1 1 0 0 1 1 1v4M21 16v4a1 1 0 0 1-1 1h-4M8 21H4a1 1 0 0 1-1-1v-4',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3' + dot(12, 17),
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  send: 'M12 19V5M5 12l7-7 7 7',
  close: 'M18 6L6 18M6 6l12 12',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z' + dot(7, 7),
} as const;

export type IconName = keyof typeof ICONS;

/** One of ICONS, drawn in the text colour. Decorative: the button around it carries the name. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path [attr.d]="d()" /></svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--icon-size, 20px);
      height: var(--icon-size, 20px);
    }
    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly d = computed(() => ICONS[this.name()]);
}
