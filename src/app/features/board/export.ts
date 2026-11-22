import { diagramLinks, renderDiagram, svgUrl, type DiagramImages } from './diagram';
import { chartMarkdown, chartSpec } from './chart';
import { FILE_CARD, TEXT_SIZES, VIEW_NAMES, type ArrowStyle, type BoardDoc, type Frame, type Item, type Media, type Note } from './board-doc';
import { shapeDetail, shapePath } from './items';
import { fileSize } from './file-cache';
import { noteLines } from './tasks';

/**
 * The board as Markdown: a heading per frame (a level deeper for frames inside frames, like a timeline's columns) with
 * its notes as bullets, then notes in no frame. Bold lines stay bold.
 */
export function boardMarkdown(board: BoardDoc, title: string): string {
  const frames = [...board.frames()].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = new Set<string>();
  // A note is a bullet: its paragraphs joined, with any list it holds nested under it as a Markdown list.
  const bullet = (note: Note) => {
    const all = noteLines(note.text);
    const lines = all.filter((l) => !l.code);
    // Code goes under the bullet as a fenced block.
    const code = all.filter((l) => l.code).map((l) => `  ${l.text}`);
    const fence = code.length ? ['  ```', ...code, '  ```'] : [];
    const item = /^(\s*)(•|\d+\.) (.*)$/;
    const head = lines.filter((l) => !item.test(l.text)).map((l) => (l.bold ? `**${l.text}**` : l.text.trim()));
    const nested = lines.flatMap((l) => {
      const m = item.exec(l.text);
      if (!m) return [];
      const text = l.bold ? `**${m[3]}**` : m[3];
      return [`  ${m[1]}${m[2] === '•' ? '-' : m[2]} ${text}`];
    });
    if (!head.length && !nested.length && !fence.length) return '';
    const first = head.length ? head.join(' — ') : nested.length ? nested.shift()!.trim().replace(/^(-|\d+\.) /, '') : 'Code';
    return [`- ${first}`, ...nested, ...fence].join('\n');
  };
  const out = [`# ${title}`, ''];
  // Innermost frame wins, so a note in a timeline's column is listed under the column.
  const owner = new Map<string, Frame>();
  for (const f of [...frames].sort((a, b) => b.w * b.h - a.w * a.h)) for (const id of board.notesIn([f.id])) owner.set(id, f);
  for (const frame of frames) {
    const notes = board.notes().filter((n) => owner.get(n.id)?.id === frame.id).sort((a, b) => a.y - b.y || a.x - b.x);
    const depth = frames.filter((f) => f.id !== frame.id && board.withInnerFrames([f.id]).includes(frame.id)).length;
    out.push(`${'#'.repeat(Math.min(6, 2 + depth))} ${frame.title || 'Untitled frame'}`, '');
    const lines = notes.flatMap((n) => {
      placed.add(n.id);
      return bullet(n) || [];
    });
    if (lines.length) out.push(...lines, '');
  }
  const loose = board.notes().filter((n) => !placed.has(n.id)).sort((a, b) => a.y - b.y || a.x - b.x);
  if (loose.length) {
    out.push(frames.length ? '## Other notes' : '## Notes', '');
    for (const n of loose) {
      const line = bullet(n);
      if (line) out.push(line);
    }
    out.push('');
  }
  // What's written elsewhere on the board, top to bottom: text boxes and labelled shapes.
  const writing = board
    .items()
    .flatMap((i) => (i.kind === 'text' && i.text.trim() ? [{ y: i.y, x: i.x, text: i.text.trim() }] : i.kind === 'shape' && i.label.trim() ? [{ y: i.y, x: i.x, text: i.label.trim() }] : []))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (writing.length) {
    out.push('## Text', '');
    for (const w of writing) out.push(`- ${w.text.replace(/\s*\n\s*/g, ' ')}`);
    out.push('');
  }
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  for (const t of board.items().flatMap((i) => (i.kind === 'table' && [...i.cells.values()].some((v) => v.trim()) ? [i] : []))) {
    out.push('## Table', '');
    for (let r = 0; r < t.rows; r++) {
      out.push(`| ${Array.from({ length: t.cols }, (_, c) => cell(t.cells.get(`${r}:${c}`) ?? '')).join(' | ')} |`);
      if (r === 0) out.push(`|${' --- |'.repeat(t.cols)}`);
    }
    out.push('');
  }
  const links = board.items().flatMap((i) => (i.kind === 'link' && i.url ? [i] : []));
  const files = board.media();
  if (links.length || files.length) {
    out.push('## Links and files', '');
    for (const l of links) out.push(`- [${(l.title || l.url).replace(/[[\]]/g, '')}](${l.url})`);
    for (const f of files) out.push(`- ${f.name}`);
    out.push('');
  }
  const charts = board.items().flatMap((i) => (i.kind === 'chart' && i.rows.length ? [i] : []));
  if (charts.length) {
    out.push('## Charts', '');
    for (const c of charts) out.push(...chartMarkdown(c.title, c.rows), '');
  }
  const diagrams = board.items().flatMap((i) => (i.kind === 'diagram' && i.source.trim() ? [i.source.trim()] : []));
  if (diagrams.length) {
    out.push('## Diagrams', '');
    for (const d of diagrams) {
      out.push('```mermaid', d, '```', '');
      // A diagram's links, to follow from the page: the block above is only text.
      const links = diagramLinks(d);
      if (links.length) out.push(...links.map((l) => `- [${l.label.replace(/[[\]]/g, '')}](${l.url.replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)})`), '');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
}

type Box = { x: number; y: number; w: number; h: number };

/** Everything on the board that takes up room: frames, notes, images and file cards. Arrows run between them. */
/** The notes on show: not those in a folded mind-map branch. */
const shownNotes = (board: BoardDoc) => {
  const hidden = board.hiddenNotes();
  return hidden.size ? board.notes().filter((n) => !hidden.has(n.id)) : board.notes();
};

export const boardBoxes = (board: BoardDoc): (Box & { id: string })[] => [...board.frames(), ...shownNotes(board), ...board.media(), ...board.items()];

/** The box around everything on the board, with a margin; null for an empty board. */
export function boardBounds(board: BoardDoc, margin = 40): Box | null {
  const items = boardBoxes(board);
  if (!items.length) return null;
  const x = Math.min(...items.map((i) => i.x)) - margin;
  const y = Math.min(...items.map((i) => i.y)) - margin;
  return { x, y, w: Math.max(...items.map((i) => i.x + i.w)) + margin - x, h: Math.max(...items.map((i) => i.y + i.h)) + margin - y };
}

/** Where a line from a box's centre toward a point leaves the box. */
export function edgePoint(box: Box, toward: { x: number; y: number }): { x: number; y: number } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const scale = 1 / Math.max(Math.abs(dx) / (box.w / 2), Math.abs(dy) / (box.h / 2));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

type Point = { x: number; y: number };

/** An arrow as drawn: its path (SVG path data, which canvas's Path2D reads too), its style, and where its head points. */
export interface ArrowPath {
  id: string;
  start: Point;
  end: Point;
  d: string;
  /** The direction of the line arriving at the end, in radians, for the arrowhead. */
  angle: number;
  style: ArrowStyle;
}

/**
 * Each arrow's path. Straight runs edge to edge, aimed at the centres. Elbow and curved arrows leave from the middle of
 * the side facing the other box and arrive at the middle of the side facing back: elbows across, along, then across
 * (or down, across, down), curves bowing the same way.
 */
export function arrowLines(board: BoardDoc): ArrowPath[] {
  // Arrows into a folded branch go with it.
  const boxes = new Map<string, Box>([...shownNotes(board), ...board.frames(), ...board.items(), ...board.media()].map((n) => [n.id, n]));
  return board.connectors().flatMap((c) => {
    const a = boxes.get(c.from);
    const b = boxes.get(c.to);
    if (!a || !b) return [];
    const style = { route: c.route, dash: c.dash, weight: c.weight };
    if (c.route === 'straight') {
      const start = edgePoint(a, centre(b));
      const end = edgePoint(b, centre(a));
      return [{ id: c.id, start, end, d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, angle: Math.atan2(end.y - start.y, end.x - start.x), style }];
    }
    const ca = centre(a);
    const cb = centre(b);
    const across = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
    const sx = Math.sign(cb.x - ca.x) || 1;
    const sy = Math.sign(cb.y - ca.y) || 1;
    const start = across ? { x: ca.x + (sx * a.w) / 2, y: ca.y } : { x: ca.x, y: ca.y + (sy * a.h) / 2 };
    const end = across ? { x: cb.x - (sx * b.w) / 2, y: cb.y } : { x: cb.x, y: cb.y - (sy * b.h) / 2 };
    const angle = across ? (sx > 0 ? 0 : Math.PI) : sy > 0 ? Math.PI / 2 : -Math.PI / 2;
    let d: string;
    if (c.route === 'elbow') {
      const mid = across ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
      d = across ? `M ${start.x} ${start.y} H ${mid} V ${end.y} H ${end.x}` : `M ${start.x} ${start.y} V ${mid} H ${end.x} V ${end.y}`;
    } else {
      const pull = across ? Math.abs(end.x - start.x) / 2 : Math.abs(end.y - start.y) / 2;
      const [c1, c2] = across
        ? [{ x: start.x + sx * pull, y: start.y }, { x: end.x - sx * pull, y: end.y }]
        : [{ x: start.x, y: start.y + sy * pull }, { x: end.x, y: end.y - sy * pull }];
      d = `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    }
    return [{ id: c.id, start, end, d, angle, style }];
  });
}

const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** An arrow's dashes as a dash pattern for its weight: [] for solid. Dots need round line caps. */
export function dashPattern(style: ArrowStyle): number[] {
  if (style.dash === 'dashed') return [style.weight * 4, style.weight * 3];
  if (style.dash === 'dotted') return [0.1, style.weight * 2.5];
  return [];
}

/** The board's images, loaded from their object URLs, to draw (diagrams with their pictures); ones that fail are left out. */
export async function loadImages(board: BoardDoc, urls: ReadonlyMap<string, string>, diagramImages?: DiagramImages): Promise<Map<string, HTMLImageElement>> {
  const loaded = new Map<string, HTMLImageElement>();
  const image = (key: string, src: string) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        loaded.set(key, img);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });
  // Diagrams and charts, drawn as SVG, under their item's id.
  await Promise.all(
    board.items().map(async (item) => {
      if (item.kind === 'diagram') {
        const drawn = await renderDiagram(item.source, diagramImages);
        if ('svg' in drawn) await image(item.id, svgUrl(drawn.svg));
      } else if (item.kind === 'chart' && item.rows.length) {
        try {
          const { renderChartToSVG } = await import('@adamstavely/trenchcoat/charts');
          const { w, h } = chartPlot(item);
          const svg = await renderChartToSVG(chartSpec(item.chart, item.title, item.rows), { width: w, height: h, tokensCss: pageCss(), theme: pageTheme() });
          await image(item.id, svgUrl(svg));
        } catch {
          // Drawn as a titled card instead.
        }
      }
    }),
  );
  await Promise.all(
    board
      .media()
      .filter((m) => m.kind === 'image' && urls.has(m.fileId))
      .map(
        (m) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              loaded.set(m.fileId, img);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = urls.get(m.fileId)!;
          }),
      ),
  );
  return loaded;
}

/** The page's stylesheets as text: Trench Coat's tokens are among them, for a chart drawn on its own to resolve. */
/** Where a chart's plot sits in its box, as the board lays it out (chart-view.ts): under the title, inside the padding. */
export function chartPlot(item: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const pad = 12;
  const h = Math.max(80, item.h - 72);
  return { x: pad, y: Math.max(44, item.h - pad - h), w: Math.max(80, item.w - 2 * pad), h };
}

function pageCss(): string {
  const rules = (sheet: CSSStyleSheet): string[] => {
    try {
      return [...sheet.cssRules].flatMap((r) => (r instanceof CSSImportRule && r.styleSheet ? rules(r.styleSheet) : [r.cssText]));
    } catch {
      // Another origin's stylesheet can't be read; Trench Coat's own are the app's.
      return [];
    }
  };
  return [...document.styleSheets].flatMap(rules).join('\n');
}

/** Light or dark, as the page is drawn now. */
const pageTheme = (): 'light' | 'dark' =>
  document.documentElement.dataset['tcTheme'] === 'dark' || (!document.documentElement.dataset['tcTheme'] && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';

/**
 * A theme colour as a canvas can use it. The tokens are often light-dark(…) or var(…), which canvases don't understand,
 * so a probe element resolves them to rgb() in the page's current scheme.
 */
function color(name: string, fallback: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${name}, ${fallback})`;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

const fontFamily = () => getComputedStyle(document.documentElement).getPropertyValue('--tc-font-sans').trim() || 'system-ui, sans-serif';

/** Wraps text to a width, at most `max` lines, the last ending in … when cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  if (lines.length > max) {
    const cut = lines.slice(0, max);
    cut[max - 1] = `${cut[max - 1].replace(/\s*\S*$/, '')}…`;
    return cut;
  }
  return lines;
}

/**
 * Draws the whole board onto a canvas, at `scale` (2 for crisp images), in the page's current colours: frames, arrows,
 * then notes, shapes, images and file cards in their stack order. Pass the images from `loadImages` to draw them.
 */
export function boardCanvas(board: BoardDoc, images: ReadonlyMap<string, HTMLImageElement> = new Map(), scale = 2): HTMLCanvasElement {
  const bounds = boardBounds(board) ?? { x: 0, y: 0, w: 400, h: 300 };
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bounds.w * scale);
  canvas.height = Math.ceil(bounds.h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(-bounds.x, -bounds.y);
  ctx.fillStyle = color('--app-canvas', '#f4f4f2');
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  const font = fontFamily();
  const text = color('--tc-text-primary', '#1a1a1a');
  const surface = color('--tc-surface-raised', '#ffffff');
  const border = color('--tc-border-default', '#d0d0d0');

  const accent = color('--tc-accent-solid', '#3b6fd8');
  const onAccent = color('--tc-text-on-accent', '#ffffff');
  // Canvases don't understand color-mix(), so a mix is one colour painted over another at a strength.
  const paint = (path: Path2D, style: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = style;
    ctx.fill(path);
    ctx.globalAlpha = 1;
  };
  const box = (x: number, y: number, w: number, h: number, r: number | number[] = 0) => {
    const path = new Path2D();
    path.roundRect(x, y, w, h, r);
    return path;
  };
  for (const f of [...board.frames()].sort((a, b) => a.z - b.z)) {
    const tinted = f.fill !== 'clear' && f.fill !== 'solid';
    const tint = tinted ? color(`--note-${f.fill}`, '#fff3a8') : '';
    const solid = f.fill === 'solid' || ['card', 'slide', 'browser'].includes(f.look);
    const radius = { slide: 4, lane: 0, zone: 24 }[f.look as string] ?? 12;
    // A tab's title sticks out above the frame, in the frame's own fill and border.
    ctx.font = `600 18px ${font}`;
    const tab = f.look === 'tab' ? { w: Math.min(f.w, ctx.measureText(f.title || 'Untitled frame').width + 48), h: 34 } : null;
    const outline = new Path2D();
    if (tab) {
      outline.roundRect(f.x, f.y - tab.h, tab.w, tab.h + 6, [6, 6, 0, 0]);
      outline.roundRect(f.x, f.y, f.w, f.h, [0, radius, radius, radius]);
    } else outline.roundRect(f.x, f.y, f.w, f.h, radius);
    const washed = f.look === 'zone' || f.look === 'lane';
    if (f.look !== 'drop') paint(outline, washed ? text : surface, solid ? 1 : washed ? 0.05 : 0.6);
    // A tinted frame: its note colour at 45% over the surface, as the board mixes it.
    if (tinted) {
      paint(outline, surface);
      paint(outline, tint, 0.45);
    }
    const bordered = f.border !== 'none' && !['card', 'slide', 'zone', 'lane'].includes(f.look);
    if (bordered) {
      ctx.strokeStyle = f.look === 'drop' ? text : border;
      ctx.globalAlpha = f.look === 'drop' ? 0.35 : 1;
      ctx.lineWidth = f.look === 'drop' ? 2.5 : 1.5;
      ctx.setLineDash(f.border === 'dashed' || f.look === 'drop' ? [8, 6] : []);
      ctx.stroke(outline);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (f.look === 'lane') {
      const stripe = box(f.x, f.y, 6, f.h);
      paint(stripe, tinted ? tint : accent);
      if (tinted) paint(stripe, text, 0.3);
    }
    let title = { x: f.x + 16, y: f.y + 30, color: f.look === 'drop' ? color('--tc-text-muted', '#888888') : text, weight: f.look === 'drop' ? 400 : 600, size: 18 };
    if (f.look === 'band' || f.look === 'browser') {
      const bar = box(f.x, f.y, f.w, 44, [radius, radius, 0, 0]);
      paint(bar, tinted ? tint : f.look === 'band' ? accent : surface);
      if (tinted || f.look === 'browser') paint(bar, text, tinted ? 0.2 : 0.06);
      if (f.look === 'band') title = { ...title, color: tinted ? text : onAccent };
      else {
        ['--note-pink', '--note-yellow', '--note-green'].forEach((dot, i) => {
          ctx.fillStyle = color(dot, '#cccccc');
          ctx.beginPath();
          ctx.arc(f.x + 21 + i * 16, f.y + 22, 5, 0, Math.PI * 2);
          ctx.fill();
        });
        paint(box(f.x + 76, f.y + 7, f.w - 92, 30, 15), color('--tc-surface-base', '#ffffff'));
        title = { x: f.x + 92, y: f.y + 27, color: color('--tc-text-secondary', '#555555'), weight: 400, size: 14 };
      }
    }
    if (tab) title = { ...title, y: f.y - 11 };
    ctx.fillStyle = title.color;
    ctx.font = `${title.weight} ${title.size}px ${font}`;
    ctx.fillText(f.title || 'Untitled frame', title.x, title.y, (tab ? tab.w : f.w) - (title.x - f.x) - 16);
  }
  // Arrows go over frames and under everything else, as on the board.
  const ink = color('--tc-text-secondary', '#555555');
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  for (const { end, d, angle, style } of arrowLines(board)) {
    ctx.lineWidth = style.weight;
    ctx.setLineDash(dashPattern(style));
    ctx.stroke(new Path2D(d));
    ctx.setLineDash([]);
    const head = 8 + style.weight * 2;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - head * Math.cos(angle - 0.4), end.y - head * Math.sin(angle - 0.4));
    ctx.lineTo(end.x - head * Math.cos(angle + 0.4), end.y - head * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineCap = 'butt';
  // Notes, shapes and images in the board's stack order (see BoardDoc.restack).
  const muted = color('--tc-text-muted', '#6b6b6b');
  const colours = { surface, border, text, muted, font };
  const stack = board.stack();
  const content = [
    ...board.media().map((m) => ({ id: m.id, draw: () => drawMedia(ctx, m, images.get(m.fileId), colours) })),
    ...board.items().map((item) => ({ id: item.id, draw: () => drawItem(ctx, item, colours, images.get(item.id)) })),
    ...shownNotes(board).map((n) => ({ id: n.id, draw: () => drawNote(ctx, n, colours) })),
  ];
  for (const c of content.sort((a, b) => (stack.get(a.id) ?? 0) - (stack.get(b.id) ?? 0))) c.draw();
  return canvas;
}

/** A sticky note, its lines wrapped to fit. */
function drawNote(ctx: CanvasRenderingContext2D, n: Note, c: { text: string; font: string }): void {
  ctx.fillStyle = color(`--note-${n.color}`, '#fff3a8');
  ctx.beginPath();
  ctx.roundRect(n.x, n.y, n.w, n.h, 6);
  ctx.fill();
  ctx.fillStyle = c.text;
  let y = n.y + 26;
  for (const l of noteLines(n.text)) {
    ctx.font = l.code ? `400 13px ui-monospace, Menlo, monospace` : `${l.bold ? 600 : 400} 15px ${c.font}`;
    // Code keeps its lines as written; prose wraps.
    for (const line of l.code ? [l.text] : wrap(ctx, l.text, n.w - 24, Math.max(1, Math.floor((n.y + n.h - y) / 21)))) {
      if (y > n.y + n.h - 8) break;
      ctx.fillText(line, n.x + 12, y);
      y += 21;
    }
  }
}

/** A shape, text, pen stroke, table or link card as it is on the board. */
function drawItem(ctx: CanvasRenderingContext2D, item: Item, c: { surface: string; border: string; text: string; muted: string; font: string }, image?: HTMLImageElement): void {
  ctx.save();
  ctx.translate(item.x, item.y);
  const centred = (line: string, size: number, weight = 500) => {
    ctx.fillStyle = c.text;
    ctx.font = `${weight} ${size}px ${c.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(line, item.w / 2, item.h / 2, item.w - 16);
  };
  switch (item.kind) {
    case 'shape':
      ctx.fillStyle = color(`--note-${item.color}`, '#cfe3ff');
      ctx.fill(new Path2D(shapePath(item.shape, item.w, item.h)));
      {
        const detail = shapeDetail(item.shape, item.w, item.h);
        if (detail) {
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.stroke(new Path2D(detail));
        }
      }
      if (item.label) centred(item.label, 15);
      break;
    case 'text':
      ctx.fillStyle = c.text;
      ctx.font = `600 ${TEXT_SIZES[item.size]}px ${c.font}`;
      ctx.textBaseline = 'top';
      ctx.fillText(item.text, 0, 2, item.w);
      break;
    case 'drawing': {
      ctx.scale(item.w / item.vw, item.h / item.vh);
      ctx.strokeStyle = color(`--pen-${item.color}`, c.text);
      ctx.lineWidth = item.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < item.points.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](item.points[i], item.points[i + 1]);
      ctx.stroke();
      break;
    }
    case 'table': {
      const cw = item.w / item.cols;
      const ch = item.h / item.rows;
      ctx.fillStyle = c.surface;
      ctx.fillRect(0, 0, item.w, item.h);
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 1;
      ctx.font = `400 13px ${c.font}`;
      ctx.textBaseline = 'middle';
      for (let r = 0; r < item.rows; r++) {
        for (let col = 0; col < item.cols; col++) {
          ctx.strokeRect(col * cw, r * ch, cw, ch);
          const cell = item.cells.get(`${r}:${col}`);
          if (cell) {
            ctx.fillStyle = c.text;
            ctx.fillText(cell, col * cw + 6, r * ch + ch / 2, cw - 12);
          }
        }
      }
      break;
    }
    case 'chart':
      ctx.fillStyle = c.surface;
      ctx.strokeStyle = c.border;
      ctx.beginPath();
      ctx.roundRect(0, 0, item.w, item.h, 12);
      ctx.fill();
      ctx.stroke();
      // As on the board: the title, then the plot under it at the size it was drawn.
      ctx.fillStyle = c.text;
      ctx.font = `600 16px ${c.font}`;
      ctx.fillText(item.title || 'Chart', 16, 30, item.w - 32);
      if (image) {
        const plot = chartPlot(item);
        ctx.drawImage(image, plot.x, plot.y, plot.w, plot.h);
      }
      break;
    case 'diagram': {
      // Drawn as on the board: fitted to its box, on a card.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(0, 0, item.w, item.h, 8);
      ctx.fill();
      if (image) {
        const fit = Math.min(item.w / image.naturalWidth, item.h / image.naturalHeight);
        const w = image.naturalWidth * fit;
        const h = image.naturalHeight * fit;
        ctx.drawImage(image, (item.w - w) / 2, (item.h - h) / 2, w, h);
      }
      break;
    }
    case 'view':
    case 'app':
      // A placed view or mini-app is live on the board; in an image it's a titled box, as it draws from data, not shapes.
      ctx.fillStyle = c.surface;
      ctx.strokeStyle = c.border;
      ctx.beginPath();
      ctx.roundRect(0, 0, item.w, item.h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.font = `600 16px ${c.font}`;
      ctx.fillText(item.kind === 'view' ? VIEW_NAMES[item.view] : item.title, 16, 30, item.w - 32);
      break;
    case 'link':
      ctx.fillStyle = c.surface;
      ctx.strokeStyle = c.border;
      ctx.beginPath();
      ctx.roundRect(0, 0, item.w, item.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.font = `600 14px ${c.font}`;
      ctx.fillText(item.title, 14, 28, item.w - 28);
      ctx.fillStyle = c.muted;
      ctx.font = `400 12px ${c.font}`;
      ctx.fillText(item.site, 14, item.h - 16, item.w - 28);
      break;
  }
  ctx.restore();
}

/** An image as it is on the board (its name in a box if it hasn't loaded), or a file's card with its name and size. */
function drawMedia(
  ctx: CanvasRenderingContext2D,
  m: Media,
  image: HTMLImageElement | undefined,
  c: { surface: string; border: string; text: string; muted: string; font: string },
): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(m.x, m.y, m.w, m.h, 8);
  ctx.fillStyle = c.surface;
  ctx.fill();
  if (image) {
    ctx.clip();
    ctx.drawImage(image, m.x, m.y, m.w, m.h);
    ctx.restore();
    return;
  }
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = c.text;
  ctx.font = `600 14px ${c.font}`;
  const h = m.kind === 'file' ? FILE_CARD.h : m.h;
  ctx.fillText(m.name, m.x + 14, m.y + Math.min(h / 2, 30), m.w - 28);
  if (m.kind === 'file') {
    ctx.fillStyle = c.muted;
    ctx.font = `400 12px ${c.font}`;
    ctx.fillText(fileSize(m.size), m.x + 14, m.y + 52, m.w - 28);
  }
  ctx.restore();
}

/** Hands the browser a file to save. */
export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name from a board's title: "Sprint 12 retro" → "sprint-12-retro". */
export const fileName = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'board';
