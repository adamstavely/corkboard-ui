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
    case 'hexagon': {
      const inset = Math.min(w / 4, h / 2);
      return `M ${inset} 0 H ${w - inset} L ${w} ${h / 2} L ${w - inset} ${h} H ${inset} L 0 ${h / 2} Z`;
    }
    case 'star': {
      // Five points, the inner ones at 40% of the way out.
      const points = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 0.4 : 1;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return `${round(w / 2 + (r * w * Math.cos(a)) / 2)} ${round(h / 2 + (r * h * Math.sin(a)) / 2)}`;
      });
      return `M ${points.join(' L ')} Z`;
    }
    case 'arrow': {
      // A block arrow pointing right: a shaft and a head that's at most as long as the arrow is tall.
      const head = Math.min(w * 0.45, h * 0.8);
      return `M 0 ${h * 0.3} H ${w - head} V 0 L ${w} ${h / 2} L ${w - head} ${h} V ${h * 0.7} H 0 Z`;
    }
    case 'cylinder': {
      const ry = Math.min(h * 0.15, w / 4);
      return `M 0 ${ry} A ${w / 2} ${ry} 0 0 1 ${w} ${ry} V ${h - ry} A ${w / 2} ${ry} 0 0 1 0 ${h - ry} Z`;
    }
    case 'cloud': {
      // Bumps along the top and a flatter bottom, drawn in a 100 × 100 box and scaled to w × h.
      const p = (x: number, y: number) => `${round((x * w) / 100)} ${round((y * h) / 100)}`;
      const r = (rx: number, ry: number) => `${round((rx * w) / 100)} ${round((ry * h) / 100)}`;
      return `M ${p(22, 88)} A ${r(20, 20)} 0 0 1 ${p(14, 50)} A ${r(22, 24)} 0 0 1 ${p(42, 22)} A ${r(22, 22)} 0 0 1 ${p(80, 32)} A ${r(18, 22)} 0 0 1 ${p(80, 88)} Z`;
    }
    case 'callout': {
      // A speech bubble: a rounded box with a tail from its lower left.
      const body = h * 0.8;
      const rr = Math.min(12, w / 4, body / 4);
      return `M ${rr} 0 H ${w - rr} Q ${w} 0 ${w} ${rr} V ${body - rr} Q ${w} ${body} ${w - rr} ${body} H ${w * 0.38} L ${w * 0.18} ${h} L ${w * 0.22} ${body} H ${rr} Q 0 ${body} 0 ${body - rr} V ${rr} Q 0 0 ${rr} 0 Z`;
    }
    case 'actor': {
      // A person: a head over a stick figure (see shapeDetail), its name under it.
      const r = Math.min(w * 0.14, h * 0.1);
      const cx = w / 2;
      return `M ${round(cx - r)} ${round(r + 2)} A ${round(r)} ${round(r)} 0 1 0 ${round(cx + r)} ${round(r + 2)} A ${round(r)} ${round(r)} 0 1 0 ${round(cx - r)} ${round(r + 2)} Z`;
    }
    case 'person': {
      // A C4 person: a round head over a rounded body that holds the words.
      const r = Math.min(w * 0.18, h * 0.2);
      const top = r * 1.6;
      const rr = Math.min(w, h - top) * 0.22;
      return `M ${round(w / 2 - r)} ${round(r)} A ${round(r)} ${round(r)} 0 1 0 ${round(w / 2 + r)} ${round(r)} A ${round(r)} ${round(r)} 0 1 0 ${round(w / 2 - r)} ${round(r)} Z M ${round(rr)} ${round(top)} H ${round(w - rr)} Q ${w} ${round(top)} ${w} ${round(top + rr)} V ${round(h - rr)} Q ${w} ${h} ${round(w - rr)} ${h} H ${round(rr)} Q 0 ${h} 0 ${round(h - rr)} V ${round(top + rr)} Q 0 ${round(top)} ${round(rr)} ${round(top)} Z`;
    }
    case 'queue': {
      // A queue: a cylinder on its side.
      const rx = Math.min(w * 0.12, h / 4);
      return `M ${rx} 0 H ${w - rx} A ${rx} ${h / 2} 0 0 1 ${w - rx} ${h} H ${rx} A ${rx} ${h / 2} 0 0 1 ${rx} 0 Z`;
    }
    case 'pill': {
      // A start or end: a box with fully rounded ends.
      const r = Math.min(h / 2, w / 2);
      return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    }
    case 'parallelogram': {
      // Data in or out: slanted sides.
      const slant = Math.min(w * 0.15, h * 0.5);
      return `M ${slant} 0 H ${w} L ${w - slant} ${h} H 0 Z`;
    }
    case 'document': {
      // A page with a wavy foot.
      const p = (x: number, y: number) => `${round(x * w)} ${round(y * h)}`;
      return `M 0 0 H ${w} V ${round(0.88 * h)} C ${p(0.83, 0.76)} ${p(0.67, 0.76)} ${p(0.5, 0.88)} C ${p(0.33, 1)} ${p(0.17, 1)} ${p(0, 0.88)} Z`;
    }
    case 'delay': {
      // A wait: flat on the left, a half round on the right.
      const r = Math.min(h / 2, w / 2);
      return `M 0 0 H ${w - r} A ${r} ${h / 2} 0 0 1 ${w - r} ${h} H 0 Z`;
    }
    default: {
      const r = Math.min(12, w / 4, h / 4);
      return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    }
  }
}

const round = (n: number) => Math.round(n * 10) / 10;

/** A line drawn over a shape's fill, where its outline alone doesn't show its form: a cylinder's top rim. */
export function shapeDetail(shape: ShapeKind, w: number, h: number): string | null {
  // A person's body, arms and legs, under the head, in the top two-thirds of the box.
  if (shape === 'actor') {
    const r = Math.min(w * 0.14, h * 0.1);
    const cx = w / 2;
    const neck = 2 * r + 2;
    const hip = h * 0.46;
    const foot = h * 0.66;
    const arm = Math.min(w * 0.3, h * 0.2);
    return `M ${round(cx)} ${round(neck)} V ${round(hip)} M ${round(cx - arm)} ${round(neck + (hip - neck) * 0.35)} H ${round(cx + arm)} M ${round(cx)} ${round(hip)} L ${round(cx - arm * 0.8)} ${round(foot)} M ${round(cx)} ${round(hip)} L ${round(cx + arm * 0.8)} ${round(foot)}`;
  }
  // A queue's near end.
  if (shape === 'queue') {
    const rx = Math.min(w * 0.12, h / 4);
    return `M ${w - rx} 0 A ${rx} ${h / 2} 0 0 0 ${w - rx} ${h}`;
  }
  // A sub-process: a box with a second line down each side.
  if (shape === 'subprocess') {
    const side = Math.min(14, w / 8);
    return `M ${side} 0 V ${h} M ${w - side} 0 V ${h}`;
  }
  if (shape !== 'cylinder') return null;
  const ry = Math.min(h * 0.15, w / 4);
  return `M 0 ${ry} A ${w / 2} ${ry} 0 0 0 ${w} ${ry}`;
}

/** How a file shows on the board, when it does more than sit there as a card: played, or turned through by page. */
export function playableKind(file: { kind: string; mime: string }): 'video' | 'audio' | 'pdf' | null {
  if (file.kind !== 'file') return null;
  if (file.mime.startsWith('video/')) return 'video';
  if (file.mime.startsWith('audio/')) return 'audio';
  return file.mime === 'application/pdf' ? 'pdf' : null;
}

/** The size a file takes on the board when placed: a player or a page for those that show, else a card. */
export function placedFileSize(mime: string): { w: number; h: number } | null {
  const kind = playableKind({ kind: 'file', mime });
  return kind === 'video' ? { w: 480, h: 300 } : kind === 'audio' ? { w: 340, h: 92 } : kind === 'pdf' ? { w: 300, h: 420 } : null;
}

/** Only web links open from a link card; anything else (javascript:, data:) goes nowhere. */
export const safeUrl = (url: string): string => (/^https?:\/\//i.test(url) ? url : '#');
