import type { BoardDoc, Frame, Note } from './board-doc';
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

/** The box around everything on the board, with a margin; null for an empty board. */
export function boardBounds(board: BoardDoc, margin = 40): { x: number; y: number; w: number; h: number } | null {
  const items = [...board.frames(), ...board.notes()];
  if (!items.length) return null;
  const x = Math.min(...items.map((i) => i.x)) - margin;
  const y = Math.min(...items.map((i) => i.y)) - margin;
  return { x, y, w: Math.max(...items.map((i) => i.x + i.w)) + margin - x, h: Math.max(...items.map((i) => i.y + i.h)) + margin - y };
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

/** Draws the whole board onto a canvas, at `scale` (2 for crisp images), in the page's current colours. */
export function boardCanvas(board: BoardDoc, scale = 2): HTMLCanvasElement {
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
