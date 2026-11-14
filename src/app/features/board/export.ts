import { FILE_CARD, TEXT_SIZES, type BoardDoc, type Frame, type Item, type Media, type Note } from './board-doc';
import { shapePath } from './items';
import { fileSize } from './file-cache';
import { noteLines } from './tasks';

/**
 * The board as Markdown: a heading per frame (a level deeper for frames inside frames, like a timeline's columns) with
 * its notes as bullets, then notes in no frame. Bold lines stay bold.
 */
export function boardMarkdown(board: BoardDoc, title: string): string {
  const frames = [...board.frames()].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = new Set<string>();
  const bullet = (note: Note) => {
    const lines = noteLines(note.text).map((l) => (l.bold ? `**${l.text}**` : l.text));
    return lines.length ? `- ${lines.join(' — ')}` : '';
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
  return `${out.join('\n').trimEnd()}\n`;
}

type Box = { x: number; y: number; w: number; h: number };

/** Everything on the board that takes up room: frames, notes, images and file cards. Arrows run between them. */
export const boardBoxes = (board: BoardDoc): (Box & { id: string })[] => [...board.frames(), ...board.notes(), ...board.media(), ...board.items()];

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

/** Each arrow as a line from the edge of one box to the edge of the other, aimed at their centres. */
export function arrowLines(board: BoardDoc): { id: string; start: { x: number; y: number }; end: { x: number; y: number } }[] {
  const boxes = new Map<string, Box>([...board.notes(), ...board.frames(), ...board.items(), ...board.media()].map((n) => [n.id, n]));
  return board.connectors().flatMap((c) => {
    const a = boxes.get(c.from);
    const b = boxes.get(c.to);
    if (!a || !b) return [];
    return [{ id: c.id, start: edgePoint(a, { x: b.x + b.w / 2, y: b.y + b.h / 2 }), end: edgePoint(b, { x: a.x + a.w / 2, y: a.y + a.h / 2 }) }];
  });
}

/** The board's images, loaded from their object URLs, to draw; ones that fail are left out. */
export async function loadImages(board: BoardDoc, urls: ReadonlyMap<string, string>): Promise<Map<string, HTMLImageElement>> {
  const loaded = new Map<string, HTMLImageElement>();
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
 * Draws the whole board onto a canvas, at `scale` (2 for crisp images), in the page's current colours: frames, images
 * and file cards, arrows, then notes. Pass the images from `loadImages` to draw them.
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

  for (const f of [...board.frames()].sort((a, b) => a.z - b.z)) {
    ctx.fillStyle = surface;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(f.x, f.y, f.w, f.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = `600 18px ${font}`;
    ctx.fillText(f.title || 'Untitled frame', f.x + 16, f.y + 30, f.w - 32);
  }
  const muted = color('--tc-text-muted', '#6b6b6b');
  for (const m of [...board.media()].sort((a, b) => a.z - b.z)) drawMedia(ctx, m, images.get(m.fileId), { surface, border, text, muted, font });
  for (const item of board.items()) drawItem(ctx, item, { surface, border, text, muted, font });
  // Arrows go under the notes, as on the board.
  const ink = color('--tc-text-secondary', '#555555');
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2;
  for (const { start, end } of arrowLines(board)) {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 12 * Math.cos(angle - 0.4), end.y - 12 * Math.sin(angle - 0.4));
    ctx.lineTo(end.x - 12 * Math.cos(angle + 0.4), end.y - 12 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  }
  for (const n of board.notes()) {
    ctx.fillStyle = color(`--note-${n.color}`, '#fff3a8');
    ctx.beginPath();
    ctx.roundRect(n.x, n.y, n.w, n.h, 6);
    ctx.fill();
    ctx.fillStyle = text;
    let y = n.y + 26;
    for (const l of noteLines(n.text)) {
      ctx.font = `${l.bold ? 600 : 400} 15px ${font}`;
      for (const line of wrap(ctx, l.text, n.w - 24, Math.max(1, Math.floor((n.y + n.h - y) / 21)))) {
        if (y > n.y + n.h - 8) break;
        ctx.fillText(line, n.x + 12, y);
        y += 21;
      }
    }
  }
  return canvas;
}

/** A shape, text, pen stroke, table or link card as it is on the board. */
function drawItem(ctx: CanvasRenderingContext2D, item: Item, c: { surface: string; border: string; text: string; muted: string; font: string }): void {
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
      ctx.strokeStyle = item.color === 'ink' ? c.text : color(`--note-${item.color}`, '#888');
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
