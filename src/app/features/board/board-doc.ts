import { signal, type Signal } from '@angular/core';
import * as Y from 'yjs';

export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'gray'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_SIZE = { w: 200, h: 160 } as const;
/** A new empty frame's size, and the smallest a frame can be resized to. */
export const FRAME_SIZE = { w: 720, h: 480 } as const;
export const FRAME_MIN = { w: 240, h: 160 } as const;
/** Room around the notes a frame is drawn around, and for its title (corkboard-api's board-edit.ts lays out the same). */
export const FRAME_PADDING = 32;
export const FRAME_TITLE = 48;

/** A sticky note as the canvas draws it. `text` is the live Yjs fragment Tiptap edits. */
export interface Note {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  color: NoteColor;
  text: Y.XmlFragment;
  /** Who wrote it, when a signed writing round put it here; anonymous and ordinary notes have none. */
  authorName?: string;
  /** Who added it, for filtering by person; notes from before this was kept, or from the model, have none. */
  createdBy?: { id: string; name: string };
  /** Short labels to group and filter notes by: "bug", "q3". */
  tags: string[];
  /** Where it sits on the value-vs-effort matrix (0–10 each), once someone has placed it there. */
  value?: number;
  effort?: number;
}

/** A titled area of the board. It holds the notes whose centres are inside it: they move when it does. */
export interface Frame {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  title: string;
  /** On a timeline's outer frame: when its first column starts and how long each lasts, for the Gantt view. */
  schedule?: { start: string; every: 'week' | '2weeks' | 'month' | 'quarter' };
}

/** An image or file placed on the board; its bytes come from the API by `fileId`. */
export interface Media {
  id: string;
  kind: 'image' | 'file';
  fileId: string;
  name: string;
  mime: string;
  size: number;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export const SHAPES = ['rect', 'ellipse', 'diamond', 'triangle'] as const;
export type ShapeKind = (typeof SHAPES)[number];
/** Text label sizes, in px. */
export const TEXT_SIZES = { sm: 14, md: 20, lg: 32, xl: 48 } as const;
export type TextSize = keyof typeof TEXT_SIZES;
/** The smallest a shape, label, table or link card can be resized to. */
export const ITEM_MIN = 40;

interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}
/** A shape with a short label in it, in one of the note colours. */
export interface ShapeItem extends Placed {
  kind: 'shape';
  shape: ShapeKind;
  color: NoteColor;
  label: string;
}
/** Free text on the board, a heading or a label. */
export interface TextItem extends Placed {
  kind: 'text';
  text: string;
  size: TextSize;
}
/** A pen stroke: points (x, y, x, y, …) in a box `vw` by `vh` drawn at the item's size, so it scales when resized. */
export interface DrawingItem extends Placed {
  kind: 'drawing';
  points: readonly number[];
  vw: number;
  vh: number;
  color: NoteColor | 'ink';
  width: number;
}
/** A grid of text cells, each edited on its own, so two people can fill in different cells at once. */
export interface TableItem extends Placed {
  kind: 'table';
  rows: number;
  cols: number;
  /** Cell text by "row:col". */
  cells: ReadonlyMap<string, string>;
}
/** A web link as a card: its title, description and picture, fetched once when it's placed. */
export interface LinkItem extends Placed {
  kind: 'link';
  url: string;
  title: string;
  description: string;
  image: string | null;
  site: string;
}
/** The board's other things: shapes, text, pen strokes, tables and link cards. */
export type Item = ShapeItem | TextItem | DrawingItem | TableItem | LinkItem;
const ITEM_KINDS = new Set(['shape', 'text', 'drawing', 'table', 'link']);

/** A ready-made note: a bold heading and prompts to fill in. */
export interface NoteTemplate {
  id: string;
  name: string;
  hint: string;
  color: NoteColor;
  text: string;
}

export const NOTE_TEMPLATES: readonly NoteTemplate[] = [
  { id: 'story', name: 'User story', hint: 'As a…, I want…, so that…', color: 'blue', text: 'User story\nAs a \nI want \nso that ' },
  { id: 'idea', name: 'Idea', hint: 'What, why, and the first step', color: 'yellow', text: 'Idea\nWhat: \nWhy: \nFirst step: ' },
  { id: 'risk', name: 'Risk', hint: 'What could go wrong, and what to do', color: 'pink', text: 'Risk\nWhat could go wrong: \nHow likely: \nWhat we\'ll do: ' },
  { id: 'decision', name: 'Decision', hint: 'What, why, who decided', color: 'green', text: 'Decision\nWe decided: \nBecause: \nDecided by: ' },
  { id: 'question', name: 'Question', hint: 'An open question and who can answer', color: 'purple', text: 'Question\n \nWho can answer: ' },
];

/** A file's card on the board. */
export const FILE_CARD = { w: 240, h: 72 } as const;

/** An arrow from one note or frame to another. */
/** How an arrow runs: straight, at right angles, or in a curve. */
export const ARROW_ROUTES = ['straight', 'elbow', 'curve'] as const;
export type ArrowRoute = (typeof ARROW_ROUTES)[number];
export const ARROW_DASHES = ['solid', 'dashed', 'dotted'] as const;
export type ArrowDash = (typeof ARROW_DASHES)[number];
/** Line weights, in board pixels. */
export const ARROW_WEIGHTS = [1, 2, 4, 6] as const;

export interface ArrowStyle {
  route: ArrowRoute;
  dash: ArrowDash;
  weight: number;
}
export const DEFAULT_ARROW: ArrowStyle = { route: 'straight', dash: 'solid', weight: 2 };

export interface Connector extends ArrowStyle {
  id: string;
  from: string;
  to: string;
}

type Box = Pick<Frame, 'x' | 'y' | 'w' | 'h'>;

/** Whether a note is in a frame: its centre is inside. The API decides the same way. */
export const inFrame = (note: Box, frame: Box) =>
  note.x + note.w / 2 >= frame.x && note.x + note.w / 2 <= frame.x + frame.w && note.y + note.h / 2 >= frame.y && note.y + note.h / 2 <= frame.y + frame.h;

/** Each board's text revision, by its Yjs document, so code holding only a note's fragment can depend on its text. */
const textRevisions = new WeakMap<Y.Doc, Signal<number>>();

/**
 * Makes the caller (a computed, an effect, a template) depend on the text of the board this fragment is on: it reruns
 * when anyone edits any note's words. Everything that reads note text goes through here (see `noteLines`, `plainText`).
 */
export function trackText(fragment: Y.XmlFragment): void {
  if (fragment.doc) textRevisions.get(fragment.doc)?.();
}

/** Changes that came from the server rather than this person; they don't go on the undo stack or back to the server. */
export const REMOTE = Symbol('remote');

/** A timeline frame's dates, when someone has set them. */
function scheduleOf(node: Y.Map<unknown>): Pick<Frame, 'schedule'> {
  const s = node.get('schedule') as { start?: unknown; every?: unknown } | undefined;
  return s && typeof s.start === 'string' && ['week', '2weeks', 'month', 'quarter'].includes(s.every as string) ? { schedule: s as Frame['schedule'] } : {};
}

/** A note's matrix scores, when it has both. */
function scores(node: Y.Map<unknown>): { value?: number; effort?: number } {
  const value = node.get('value');
  const effort = node.get('effort');
  return typeof value === 'number' && typeof effort === 'number' ? { value, effort } : {};
}

/**
 * A board's content as one Yjs document: a map of nodes by id, each a map of its properties, with the note's rich text
 * as a nested XmlFragment. Everything that changes the board goes through here, so the same document can later be
 * shared over a WebSocket (and edited by the model) without the canvas changing.
 */
export class BoardDoc {
  readonly doc = new Y.Doc();
  /** Who's adding things here, stamped on new notes so they can be filtered by person. */
  author: { id: string; name: string } | null = null;
  readonly #nodes = this.doc.getMap<Y.Map<unknown>>('nodes');
  /** Moves made within 400ms of each other undo together; adding, recolouring and deleting are each their own step. */
  readonly undo: Y.UndoManager = new Y.UndoManager(this.#nodes, { captureTimeout: 400, trackedOrigins: new Set([null, this]) });

  readonly #notes = signal<Note[]>([]);
  /** Every note, bottom to top. Text edits don't change this list; each note watches its own fragment. */
  readonly notes = this.#notes.asReadonly();
  readonly #frames = signal<Frame[]>([]);
  /** Every frame, bottom to top. They are drawn under all the notes. */
  readonly frames = this.#frames.asReadonly();
  readonly #media = signal<Media[]>([]);
  /** Images and files on the board, bottom to top. */
  readonly media = this.#media.asReadonly();
  readonly #items = signal<Item[]>([]);
  /** Shapes, text, drawings, tables and link cards, bottom to top. */
  readonly items = this.#items.asReadonly();
  readonly #locked = signal<ReadonlySet<string>>(new Set());
  /** Things locked in place: they can be selected, but not moved, resized, edited or deleted until unlocked. */
  readonly locked = this.#locked.asReadonly();
  readonly #connectors = signal<Connector[]>([]);
  /** Every arrow between notes and frames. */
  readonly connectors = this.#connectors.asReadonly();

  readonly #textRevision = signal(0);
  /** Goes up whenever a note's text changes; `trackText` depends on it. */
  readonly textRevision = this.#textRevision.asReadonly();

  constructor() {
    textRevisions.set(this.doc, this.textRevision);
    this.#nodes.observeDeep((events) => {
      if (events.some((e) => !(e.target instanceof Y.Map))) this.#textRevision.update((n) => n + 1);
      // Typing inside a note changes only its fragment; the list needs rebuilding when nodes or their properties do.
      if (events.some((e) => e.target === this.#nodes || e.target instanceof Y.Map)) this.#refresh();
    });
    this.#refresh();
  }

  /** Adds a note centred on a point, with text if given (a paragraph a line), and returns its id. */
  addNote(cx: number, cy: number, color: NoteColor = 'yellow', text = '', boldFirst = false): string {
    const id = crypto.randomUUID();
    this.undo.stopCapturing();
    this.doc.transact(() => {
      const node = new Y.Map<unknown>();
      node.set('kind', 'note');
      node.set('x', Math.round(cx - NOTE_SIZE.w / 2));
      node.set('y', Math.round(cy - NOTE_SIZE.h / 2));
      node.set('w', NOTE_SIZE.w);
      node.set('h', NOTE_SIZE.h);
      node.set('z', this.#topZ() + 1);
      node.set('color', color);
      if (this.author) node.set('createdBy', { ...this.author });
      const fragment = new Y.XmlFragment();
      node.set('text', fragment);
      this.#nodes.set(id, node);
      if (text) {
        fragment.insert(
          0,
          text.split(/\r?\n/).map((line, i) => {
            const p = new Y.XmlElement('paragraph');
            if (line) {
              const run = new Y.XmlText(line);
              p.insert(0, [run]);
              if (i === 0 && boldFirst) run.format(0, line.length, { bold: true });
            }
            return p;
          }),
        );
      }
    }, this);
    return id;
  }

  /** A note from a template: its heading bold, its prompts below, in the template's colour. */
  addTemplateNote(cx: number, cy: number, template: NoteTemplate): string {
    return this.addNote(cx, cy, template.color, template.text, true);
  }

  /** Adds a tag to notes (lower case, trimmed), keeping each note's tags unique. */
  addTag(ids: Iterable<string>, tag: string): void {
    const t = tag.trim().toLowerCase().replace(/^#/, '').slice(0, 30);
    if (!t) return;
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#nodes.get(id);
        if (node?.get('kind') !== 'note') continue;
        const tags = tagsOf(node);
        if (!tags.includes(t)) node.set('tags', [...tags, t]);
      }
    }, this);
  }

  removeTag(ids: Iterable<string>, tag: string): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#nodes.get(id);
        if (node?.get('kind') !== 'note') continue;
        const tags = tagsOf(node);
        if (tags.includes(tag)) node.set('tags', tags.filter((x) => x !== tag));
      }
    }, this);
  }

  /** Adds a frame and returns its id: around `around` (with room for a title) or, without, a blank one centred on a point. */
  addFrame(cx: number, cy: number, around: Box[] = [], title = 'Frame'): string {
    const box = around.length
      ? (() => {
          const x = Math.min(...around.map((b) => b.x)) - FRAME_PADDING;
          const y = Math.min(...around.map((b) => b.y)) - FRAME_TITLE;
          return { x, y, w: Math.max(...around.map((b) => b.x + b.w)) + FRAME_PADDING - x, h: Math.max(...around.map((b) => b.y + b.h)) + FRAME_PADDING - y };
        })()
      : { x: cx - FRAME_SIZE.w / 2, y: cy - FRAME_SIZE.h / 2, ...FRAME_SIZE };
    const id = crypto.randomUUID();
    this.undo.stopCapturing();
    this.doc.transact(() => {
      const node = new Y.Map<unknown>();
      node.set('kind', 'frame');
      node.set('title', title);
      node.set('x', Math.round(box.x));
      node.set('y', Math.round(box.y));
      node.set('w', Math.round(box.w));
      node.set('h', Math.round(box.h));
      node.set('z', this.#topZ() + 1);
      this.#nodes.set(id, node);
    }, this);
    return id;
  }

  renameFrame(id: string, title: string): void {
    const node = this.#nodes.get(id);
    if (!node || node.get('kind') !== 'frame' || node.get('title') === title) return;
    this.undo.stopCapturing();
    this.doc.transact(() => node.set('title', title), this);
  }

  /** Resizes a frame from its bottom-right corner, no smaller than FRAME_MIN. */
  resizeFrame(id: string, w: number, h: number): void {
    const node = this.#nodes.get(id);
    if (!node || node.get('kind') !== 'frame') return;
    this.doc.transact(() => {
      node.set('w', Math.round(Math.max(FRAME_MIN.w, w)));
      node.set('h', Math.round(Math.max(FRAME_MIN.h, h)));
    }, this);
  }

  /** These frames and every frame wholly inside one of them, as a timeline holds its columns. */
  withInnerFrames(frameIds: Iterable<string>): string[] {
    const outer = this.frames().filter((f) => [...frameIds].includes(f.id));
    return this.frames()
      .filter((f) => outer.some((o) => o.id === f.id || (f.x >= o.x && f.y >= o.y && f.x + f.w <= o.x + o.w && f.y + f.h <= o.y + o.h)))
      .map((f) => f.id);
  }

  /** The notes in any of these frames. */
  notesIn(frameIds: Iterable<string>): string[] {
    const frames = this.frames().filter((f) => [...frameIds].includes(f.id));
    return this.notes()
      .filter((n) => frames.some((f) => inFrame(n, f)))
      .map((n) => n.id);
  }

  move(ids: Iterable<string>, dx: number, dy: number): void {
    if (!dx && !dy) return;
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#nodes.get(id);
        if (!node) continue;
        node.set('x', pos(node.get('x')) + dx);
        node.set('y', pos(node.get('y')) + dy);
      }
    }, this);
  }

  setColor(ids: Iterable<string>, color: NoteColor): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#nodes.get(id);
        const kind = node?.get('kind');
        if (kind === 'note' || kind === 'shape' || kind === 'drawing') node!.set('color', color);
      }
    }, this);
  }

  /** Sets when a timeline frame starts and how long each of its columns lasts. */
  setSchedule(frameId: string, schedule: NonNullable<Frame['schedule']>): void {
    this.doc.transact(() => {
      const node = this.#nodes.get(frameId);
      if (node?.get('kind') === 'frame') node.set('schedule', { ...schedule });
    }, this);
  }

  /** Places a note on the value-vs-effort matrix. */
  setScore(id: string, value: number, effort: number): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      const node = this.#nodes.get(id);
      if (node?.get('kind') !== 'note') return;
      node.set('value', value);
      node.set('effort', effort);
    }, this);
  }

  /** Puts notes above everything else, keeping their order among themselves. */
  bringToFront(ids: Iterable<string>): void {
    const wanted = new Set(ids);
    const chosen = [...this.notes(), ...this.items(), ...this.media()].filter((n) => wanted.has(n.id)).sort((a, b) => a.z - b.z);
    const top = this.#topZ();
    if (chosen.length === 0 || chosen.every((n, i) => n.z === top - chosen.length + 1 + i)) return;
    this.doc.transact(() => chosen.forEach((n, i) => this.#nodes.get(n.id)?.set('z', top + 1 + i)), this);
  }

  /** Removes notes, frames and arrows; arrows to or from what's removed go too. */
  remove(ids: Iterable<string>): void {
    const gone = new Set(ids);
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const c of this.connectors()) if (gone.has(c.from) || gone.has(c.to)) gone.add(c.id);
      for (const id of gone) this.#nodes.delete(id);
    }, this);
  }

  /** Places an uploaded image or file centred on a point, at a size, and returns its id. */
  addMedia(file: { id: string; name: string; mime: string; size: number }, cx: number, cy: number, size: { w: number; h: number }): string {
    const id = crypto.randomUUID();
    this.undo.stopCapturing();
    this.doc.transact(() => {
      const node = new Y.Map<unknown>();
      node.set('kind', file.mime.startsWith('image/') ? 'image' : 'file');
      node.set('fileId', file.id);
      node.set('name', file.name);
      node.set('mime', file.mime);
      node.set('size', file.size);
      node.set('x', Math.round(cx - size.w / 2));
      node.set('y', Math.round(cy - size.h / 2));
      node.set('w', Math.round(size.w));
      node.set('h', Math.round(size.h));
      node.set('z', this.#topZ() + 1);
      this.#nodes.set(id, node);
    }, this);
    return id;
  }

  #place(kind: Item['kind'], cx: number, cy: number, w: number, h: number, set: (node: Y.Map<unknown>) => void): string {
    const id = crypto.randomUUID();
    this.undo.stopCapturing();
    this.doc.transact(() => {
      const node = new Y.Map<unknown>();
      node.set('kind', kind);
      node.set('x', Math.round(cx - w / 2));
      node.set('y', Math.round(cy - h / 2));
      node.set('w', Math.round(w));
      node.set('h', Math.round(h));
      node.set('z', this.#topZ() + 1);
      this.#nodes.set(id, node);
      set(node);
    }, this);
    return id;
  }

  addShape(cx: number, cy: number, shape: ShapeKind = 'rect', color: NoteColor = 'blue', label = ''): string {
    return this.#place('shape', cx, cy, 200, shape === 'rect' ? 120 : 160, (n) => {
      n.set('shape', shape);
      n.set('color', color);
      n.set('label', label);
    });
  }

  addText(cx: number, cy: number, text = 'Text', size: TextSize = 'md'): string {
    return this.#place('text', cx, cy, 240, TEXT_SIZES[size] * 1.6, (n) => {
      n.set('text', text);
      n.set('size', size);
    });
  }

  /** A pen stroke through these board points (x, y, x, y, …); null if it's too short to keep. */
  addDrawing(points: readonly number[], color: DrawingItem['color'] = 'ink', width = 3): string | null {
    if (points.length < 4) return null;
    const xs = points.filter((_, i) => i % 2 === 0);
    const ys = points.filter((_, i) => i % 2 === 1);
    const pad = width;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    const w = Math.max(Math.max(...xs) - x + pad, 4);
    const h = Math.max(Math.max(...ys) - y + pad, 4);
    const local = points.map((v, i) => Math.round((i % 2 === 0 ? v - x : v - y) * 10) / 10);
    return this.#place('drawing', x + w / 2, y + h / 2, w, h, (n) => {
      n.set('points', local);
      n.set('vw', w);
      n.set('vh', h);
      n.set('color', color);
      n.set('width', width);
    });
  }

  addTable(cx: number, cy: number, rows = 3, cols = 3): string {
    return this.#place('table', cx, cy, cols * 140, rows * 40, (n) => {
      n.set('rows', rows);
      n.set('cols', cols);
      n.set('cells', new Y.Map<string>());
    });
  }

  addLink(cx: number, cy: number, url: string): string {
    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return url;
      }
    })();
    return this.#place('link', cx, cy, 320, 120, (n) => {
      n.set('url', url);
      n.set('title', host);
      n.set('description', '');
      n.set('image', null);
      n.set('site', host);
    });
  }

  /** Fills in a link card once its page's preview arrives; it's not undoable on its own. */
  setLinkPreview(id: string, p: { title: string; description: string; image: string | null; site: string }): void {
    const node = this.#nodes.get(id);
    if (node?.get('kind') !== 'link') return;
    this.doc.transact(() => {
      node.set('title', p.title);
      node.set('description', p.description);
      node.set('image', p.image);
      node.set('site', p.site);
    }, REMOTE);
  }

  /** A shape's label, or a text item's text. */
  setText(id: string, text: string): void {
    const node = this.#nodes.get(id);
    const key = node?.get('kind') === 'shape' ? 'label' : node?.get('kind') === 'text' ? 'text' : null;
    if (!node || !key || node.get(key) === text) return;
    this.undo.stopCapturing();
    this.doc.transact(() => node.set(key, text), this);
  }

  setShape(ids: Iterable<string>, shape: ShapeKind): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#nodes.get(id);
        if (node?.get('kind') === 'shape') node.set('shape', shape);
      }
    }, this);
  }

  setTextSize(ids: Iterable<string>, size: TextSize): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#nodes.get(id);
        if (node?.get('kind') === 'text') node.set('size', size);
      }
    }, this);
  }

  setCell(id: string, row: number, col: number, text: string): void {
    const cells = this.#nodes.get(id)?.get('cells');
    if (!(cells instanceof Y.Map)) return;
    const key = `${row}:${col}`;
    if ((cells.get(key) ?? '') === text) return;
    this.undo.stopCapturing();
    this.doc.transact(() => (text ? cells.set(key, text) : cells.delete(key)), this);
  }

  /** Adds or removes a table's last row or column; it grows or shrinks to match. */
  resizeTable(id: string, rows: number, cols: number): void {
    const node = this.#nodes.get(id);
    if (node?.get('kind') !== 'table') return;
    const r = Math.min(50, Math.max(1, rows));
    const c = Math.min(20, Math.max(1, cols));
    const wasR = node.get('rows') as number;
    const wasC = node.get('cols') as number;
    this.undo.stopCapturing();
    this.doc.transact(() => {
      node.set('rows', r);
      node.set('cols', c);
      node.set('w', Math.round(((node.get('w') as number) / wasC) * c));
      node.set('h', Math.round(((node.get('h') as number) / wasR) * r));
      const cells = node.get('cells');
      if (cells instanceof Y.Map) for (const key of [...cells.keys()]) {
        const [cr, cc] = key.split(':').map(Number);
        if (cr >= r || cc >= c) cells.delete(key);
      }
    }, this);
  }

  /** Resizes a shape, label, drawing, table or link card from its bottom-right corner. */
  resizeItem(id: string, w: number, h: number): void {
    const node = this.#nodes.get(id);
    if (!node || !ITEM_KINDS.has(String(node.get('kind')))) return;
    this.doc.transact(() => {
      node.set('w', Math.round(Math.max(ITEM_MIN, w)));
      node.set('h', Math.round(Math.max(node.get('kind') === 'text' ? 20 : ITEM_MIN, h)));
    }, this);
  }

  /**
   * Copies notes, frames and other things, moved by (dx, dy), on top; arrows between two copied things are copied too.
   * Returns the copies' ids, in the order given.
   */
  duplicate(ids: Iterable<string>, dx: number, dy: number): string[] {
    const wanted = [...ids].filter((id) => this.#nodes.get(id) && this.#nodes.get(id)!.get('kind') !== 'connector');
    const copies = new Map<string, string>();
    this.undo.stopCapturing();
    this.doc.transact(() => {
      let z = this.#topZ();
      for (const id of wanted) {
        const original = this.#nodes.get(id)!;
        // A clone can't be read or changed until it's in the document: place it, then move it.
        const newId = crypto.randomUUID();
        const copy = this.#nodes.set(newId, original.clone());
        copy.set('x', (original.get('x') as number) + dx);
        copy.set('y', (original.get('y') as number) + dy);
        copy.set('z', ++z);
        if (this.author && original.get('kind') === 'note') copy.set('createdBy', { ...this.author });
        copies.set(id, newId);
      }
      for (const c of this.connectors()) {
        const from = copies.get(c.from);
        const to = copies.get(c.to);
        if (!from || !to) continue;
        const arrow = new Y.Map<unknown>();
        arrow.set('kind', 'connector');
        arrow.set('from', from);
        arrow.set('to', to);
        this.#nodes.set(crypto.randomUUID(), arrow);
      }
    }, this);
    return wanted.map((id) => copies.get(id)!);
  }

  /** Locks or unlocks things in place. */
  setLocked(ids: Iterable<string>, locked: boolean): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#nodes.get(id);
        if (!node) continue;
        if (locked) node.set('locked', true);
        else node.delete('locked');
      }
    }, this);
  }

  /** Sets the frames' order for the outline and for presenting, first to last. */
  setFrameOrder(ids: readonly string[]): void {
    this.doc.transact(() => ids.forEach((id, i) => this.#nodes.get(id)?.set('order', i)), this);
  }

  /** The frames in outline order: as set, then (for ones never ordered) top to bottom, left to right. */
  outline(): Frame[] {
    const order = (f: Frame) => {
      const o = this.#nodes.get(f.id)?.get('order');
      return typeof o === 'number' ? o : Number.MAX_SAFE_INTEGER;
    };
    return [...this.frames()].sort((a, b) => order(a) - order(b) || Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x);
  }

  /** Moves things to these places in one step (one undo), as aligning and tidying do. */
  place(positions: ReadonlyMap<string, { x: number; y: number }>): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const [id, p] of positions) {
        const node = this.#nodes.get(id);
        if (!node) continue;
        if (node.get('x') !== p.x) node.set('x', p.x);
        if (node.get('y') !== p.y) node.set('y', p.y);
      }
    }, this);
  }

  /** A new empty note beside this one (same colour and size), in a direction, with a gap; returns its id. */
  addNoteNext(id: string, side: 'right' | 'left' | 'down' | 'up', gap = 24): string | null {
    const from = this.notes().find((n) => n.id === id);
    if (!from) return null;
    const dx = side === 'right' ? from.w + gap : side === 'left' ? -(from.w + gap) : 0;
    const dy = side === 'down' ? from.h + gap : side === 'up' ? -(from.h + gap) : 0;
    const newId = this.addNote(from.x + from.w / 2 + dx, from.y + from.h / 2 + dy, from.color);
    const node = this.#nodes.get(newId);
    if (node && (from.w !== NOTE_SIZE.w || from.h !== NOTE_SIZE.h)) {
      this.doc.transact(() => {
        node.set('x', from.x + dx);
        node.set('y', from.y + dy);
        node.set('w', from.w);
        node.set('h', from.h);
      }, this);
    }
    return newId;
  }

  /** Draws an arrow from one note or frame to another, unless there is one already; returns its id. */
  connect(from: string, to: string, style: ArrowStyle = DEFAULT_ARROW): string | null {
    if (from === to || !this.#nodes.has(from) || !this.#nodes.has(to)) return null;
    const existing = this.connectors().find((c) => c.from === from && c.to === to);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    this.undo.stopCapturing();
    this.doc.transact(() => {
      const node = new Y.Map<unknown>();
      node.set('kind', 'connector');
      node.set('from', from);
      node.set('to', to);
      node.set('route', style.route);
      node.set('dash', style.dash);
      node.set('weight', style.weight);
      this.#nodes.set(id, node);
    }, this);
    return id;
  }

  /** Restyles arrows: how they run, their dashes, their weight. */
  setArrowStyle(ids: Iterable<string>, change: Partial<ArrowStyle>): void {
    const arrows = new Set(this.connectors().map((c) => c.id));
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#nodes.get(id);
        if (!node || !arrows.has(id)) continue;
        for (const [key, value] of Object.entries(change)) if (value !== undefined) node.set(key, value);
      }
    }, this);
  }

  /** The whole document as one update, for saving. */
  encode(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /** Merges a saved or remote update in, without making it undoable. */
  apply(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update, REMOTE);
  }

  destroy(): void {
    this.undo.destroy();
    this.doc.destroy();
  }

  #topZ(): number {
    let top = 0;
    this.#nodes.forEach((node) => {
      if (node instanceof Y.Map) top = Math.max(top, num(node.get('z')));
    });
    return top;
  }

  #refresh(): void {
    const notes: Note[] = [];
    const frames: Frame[] = [];
    const connectors: Connector[] = [];
    const media: Media[] = [];
    const items: Item[] = [];
    const locked = new Set<string>();
    this.#nodes.forEach((node, id) => {
      // Anything the API let through that isn't a node is skipped, not allowed to break the board for everyone.
      if (!(node instanceof Y.Map)) return;
      try {
        this.#read(node, id, { notes, frames, connectors, media, items, locked });
      } catch {
        // A node that can't be read is left out.
      }
    });
    const order = (a: { z: number; id: string }, b: { z: number; id: string }) => a.z - b.z || a.id.localeCompare(b.id);
    this.#notes.set(notes.sort(order));
    this.#frames.set(frames.sort(order));
    this.#connectors.set(connectors);
    this.#media.set(media.sort(order));
    this.#items.set(items.sort(order));
    if (locked.size !== this.#locked().size || [...locked].some((id) => !this.#locked().has(id))) this.#locked.set(locked);
  }

  /** One node, into the list it belongs in; positions and sizes made safe on the way (see pos and size). */
  #read(
    node: Y.Map<unknown>,
    id: string,
    out: { notes: Note[]; frames: Frame[]; connectors: Connector[]; media: Media[]; items: Item[]; locked: Set<string> },
  ): void {
    const { notes, frames, connectors, media, items, locked } = out;
    if (node.get('locked') === true) locked.add(id);
    const kind = node.get('kind');
    if (kind === 'image' || kind === 'file') {
      media.push({
        id,
        kind,
        fileId: String(node.get('fileId') ?? ''),
        name: String(node.get('name') ?? ''),
        mime: String(node.get('mime') ?? ''),
        size: Number(node.get('size') ?? 0),
        x: pos(node.get('x')),
        y: pos(node.get('y')),
        w: size(node.get('w'), FILE_CARD.w),
        h: size(node.get('h'), FILE_CARD.h),
        z: num(node.get('z')),
      });
      return;
    }
    if (ITEM_KINDS.has(String(kind))) {
      const item = itemOf(id, node);
      if (item) items.push(item);
      return;
    }
    if (node.get('kind') === 'connector') {
      const from = node.get('from');
      const to = node.get('to');
      if (typeof from === 'string' && typeof to === 'string') connectors.push({ id, from, to, ...arrowStyleOf(node) });
      return;
    }
    if (node.get('kind') === 'frame') {
      const title = node.get('title');
      frames.push({
        id,
        x: pos(node.get('x')),
        y: pos(node.get('y')),
        w: size(node.get('w'), FRAME_SIZE.w),
        h: size(node.get('h'), FRAME_SIZE.h),
        z: num(node.get('z')),
        title: typeof title === 'string' ? title : '',
        ...scheduleOf(node),
      });
      return;
    }
    if (node.get('kind') !== 'note') return;
    const color = node.get('color') as NoteColor;
    const text = node.get('text');
    // A note's words are a rich-text fragment; without one it can't be shown or edited.
    if (!(text instanceof Y.XmlFragment)) return;
    notes.push({
      id,
      x: pos(node.get('x')),
      y: pos(node.get('y')),
      w: size(node.get('w'), NOTE_SIZE.w),
      h: size(node.get('h'), NOTE_SIZE.h),
      z: num(node.get('z')),
      color: NOTE_COLORS.includes(color) ? color : 'yellow',
      text,
      ...(typeof node.get('authorName') === 'string' ? { authorName: node.get('authorName') as string } : {}),
      ...createdByOf(node),
      tags: tagsOf(node),
      ...scores(node),
    });
  }
}

/** An arrow's style as stored, anything unknown read as the default. */
function arrowStyleOf(node: Y.Map<unknown>): ArrowStyle {
  const route = node.get('route') as ArrowRoute;
  const dash = node.get('dash') as ArrowDash;
  const weight = node.get('weight');
  return {
    route: ARROW_ROUTES.includes(route) ? route : DEFAULT_ARROW.route,
    dash: ARROW_DASHES.includes(dash) ? dash : DEFAULT_ARROW.dash,
    weight: typeof weight === 'number' && (ARROW_WEIGHTS as readonly number[]).includes(weight) ? weight : DEFAULT_ARROW.weight,
  };
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** A position: finite, and on the board (a very far one would make fitting the view useless). */
const pos = (v: unknown) => Math.max(-MAX_COORD, Math.min(MAX_COORD, num(v)));
/** A size: positive and not absurd, else the kind's usual size. */
const size = (v: unknown, fallback: number) => {
  const n = num(v, fallback);
  return n > 0 ? Math.min(n, MAX_SIZE) : fallback;
};
/** Table dimensions: whole, at least one, at most MAX_TABLE. */
const dim = (v: unknown) => Math.max(1, Math.min(MAX_TABLE, Math.floor(num(v, 1))));
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Limits on what a node may say, so one malformed or hostile node can't break or freeze the board for everyone. */
export const MAX_COORD = 1_000_000;
export const MAX_SIZE = 100_000;
export const MAX_TABLE = 100;

/** A shape, text, drawing, table or link card as the canvas draws it; null if its node is malformed. */
function itemOf(id: string, node: Y.Map<unknown>): Item | null {
  const box = { id, x: pos(node.get('x')), y: pos(node.get('y')), w: size(node.get('w'), 200), h: size(node.get('h'), 120), z: num(node.get('z')) };
  const color = node.get('color') as NoteColor;
  switch (node.get('kind')) {
    case 'shape': {
      const shape = node.get('shape') as ShapeKind;
      return { ...box, kind: 'shape', shape: SHAPES.includes(shape) ? shape : 'rect', color: NOTE_COLORS.includes(color) ? color : 'blue', label: str(node.get('label')) };
    }
    case 'text': {
      const size = node.get('size') as TextSize;
      return { ...box, kind: 'text', text: str(node.get('text')), size: size in TEXT_SIZES ? size : 'md' };
    }
    case 'drawing': {
      const points = node.get('points');
      return {
        ...box,
        kind: 'drawing',
        points: Array.isArray(points) ? points.filter((p): p is number => typeof p === 'number') : [],
        vw: num(node.get('vw'), box.w),
        vh: num(node.get('vh'), box.h),
        color: NOTE_COLORS.includes(color) ? color : 'ink',
        width: num(node.get('width'), 3),
      };
    }
    case 'table': {
      const cells = node.get('cells');
      return {
        ...box,
        kind: 'table',
        rows: dim(node.get('rows')),
        cols: dim(node.get('cols')),
        cells: cells instanceof Y.Map ? new Map([...cells.entries()].filter((e): e is [string, string] => typeof e[1] === 'string')) : new Map(),
      };
    }
    case 'link': {
      const image = node.get('image');
      return {
        ...box,
        kind: 'link',
        url: str(node.get('url')),
        title: str(node.get('title')),
        description: str(node.get('description')),
        image: typeof image === 'string' && image.startsWith('https://') ? image : null,
        site: str(node.get('site')),
      };
    }
    default:
      return null;
  }
}

function tagsOf(node: Y.Map<unknown>): string[] {
  const tags = node.get('tags');
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
}

function createdByOf(node: Y.Map<unknown>): Pick<Note, 'createdBy'> {
  const by = node.get('createdBy') as { id?: unknown; name?: unknown } | undefined;
  return by && typeof by.id === 'string' && typeof by.name === 'string' ? { createdBy: { id: by.id, name: by.name } } : {};
}
