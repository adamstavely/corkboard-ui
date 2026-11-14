import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input } from '@angular/core';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronUp,
  ChartGantt,
  ChevronDown,
  CircleQuestionMark,
  Cloud,
  CloudOff,
  EllipsisVertical,
  Eye,
  EyeOff,
  FaceSlightlySmiling,
  FileText,
  Frame,
  Grid2x2,
  Heart,
  Image,
  LayoutTemplate,
  Link,
  Lock,
  LockOpen,
  Map,
  Menu,
  MessageCircle,
  MessageCircleMore,
  MessageSquare,
  Mic,
  Minus,
  MousePointer2,
  MoveUpRight,
  PartyPopper,
  PenTool,
  Play,
  Plus,
  Redo2,
  Scan,
  Search,
  Shapes,
  Sparkles,
  Square,
  SquareKanban,
  SquarePlus,
  Star,
  StickyNote,
  Table,
  Tag,
  ThumbsUp,
  Timer,
  Trash,
  Triangle,
  Type,
  Undo2,
  Upload,
  Users,
  X,
  Circle,
  Diamond,
  type IconNode,
} from 'lucide';

/** The Lucide icons the app uses, by the names its templates use. */
export const ICONS = {
  menu: Menu,
  more: EllipsisVertical,
  export: Upload,
  search: Search,
  timer: Timer,
  chat: MessageCircle,
  comments: MessageSquare,
  play: Play,
  users: Users,
  chevron: ChevronDown,
  up: ChevronUp,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  cloud: Cloud,
  cloudOff: CloudOff,
  sparkles: Sparkles,
  cursor: MousePointer2,
  create: SquarePlus,
  template: LayoutTemplate,
  sticky: StickyNote,
  text: Type,
  shapes: Shapes,
  pen: PenTool,
  frame: Frame,
  smile: FaceSlightlySmiling,
  comment: MessageCircleMore,
  hidden: EyeOff,
  eye: Eye,
  plus: Plus,
  minus: Minus,
  undo: Undo2,
  redo: Redo2,
  arrow: MoveUpRight,
  rect: Square,
  oval: Circle,
  rhombus: Diamond,
  triangle: Triangle,
  table: Table,
  timeline: ChartGantt,
  kanban: SquareKanban,
  matrix: Grid2x2,
  doc: FileText,
  image: Image,
  link: Link,
  fit: Scan,
  help: CircleQuestionMark,
  map: Map,
  trash: Trash,
  lock: Lock,
  unlock: LockOpen,
  mic: Mic,
  send: ArrowUp,
  close: X,
  tag: Tag,
  star: Star,
  thumbsUp: ThumbsUp,
  heart: Heart,
  party: PartyPopper,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

const SVG = 'http://www.w3.org/2000/svg';

/** An icon as an SVG element, for Trench Coat components that take an icon element. */
export function iconElement(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  for (const [tag, attrs] of ICONS[name]) {
    const el = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) if (value !== undefined) el.setAttribute(key, String(value));
    svg.append(el);
  }
  return svg;
}

/** An icon as SVG markup, for places that aren't Angular templates (Lit templates in dialogs). */
export function iconMarkup(name: IconName, size = 20): string {
  const parts = ICONS[name].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`);
  return `<svg xmlns="${SVG}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts.join('')}</svg>`;
}

/** One of ICONS, drawn in the text colour. Decorative: the button around it carries the name. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"></svg>`,
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
      fill: var(--icon-fill, none);
      stroke: currentColor;
      stroke-width: var(--icon-stroke, 1.75);
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Lucide gives each icon as its SVG elements and their attributes; draw them into the one svg.
    effect(() => {
      const svg = this.#host.nativeElement.querySelector('svg');
      if (!svg) return;
      svg.replaceChildren(
        ...ICONS[this.name()].map(([tag, attrs]) => {
          const el = document.createElementNS(SVG, tag);
          for (const [key, value] of Object.entries(attrs)) if (value !== undefined) el.setAttribute(key, String(value));
          return el;
        }),
      );
    });
  }
}
