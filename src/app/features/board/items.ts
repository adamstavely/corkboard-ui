import type { ShapeKind } from './board-doc';

/** The outline of a shape filling a w × h box, as an SVG path. */
export function shapePath(shape: ShapeKind, w: number, h: number): string {
  switch (shape) {
    case 'ellipse':
      return `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`;
    case 'diamond':
      return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
    case 'triangle':
      return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
    default: {
      const r = Math.min(12, w / 4, h / 4);
      return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    }
  }
}

/** Only web links open from a link card; anything else (javascript:, data:) goes nowhere. */
export const safeUrl = (url: string): string => (/^https?:\/\//i.test(url) ? url : '#');
