import { computed, signal, type Signal } from '@angular/core';
import * as Y from 'yjs';
import { MAX_DIAGRAM_CHARS } from './diagram';
import { CHART_KINDS, cleanRows, type ChartKind, type ChartRow } from './chart';
import { hiddenByFolds, mindChildren, mindLayout, mindLinkOf, type MindLink } from './mindmap';

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
  /** Written by someone from outside the team, through the board's feedback link. */
  participant?: boolean;
  /** On a participant's view of a board: whose it is ("p4"), to tell their own apart. */
  by?: string;
  /** Who added it, for filtering by person; notes from before this was kept, or from the model, have none. */
  createdBy?: { id: string; name: string };
  /** Short labels to group and filter notes by: "bug", "q3". */
  tags: string[];
  /** Where it sits on the value-vs-effort matrix (0–10 each), once someone has placed it there. */
  value?: number;
  effort?: number;
  /** Its place in a mind map, when it's in one. */
  mind?: MindLink;
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
  /** How it looks: its fill, its border and its shape (see FRAME_FILLS, FRAME_BORDERS and FRAME_LOOKS). */
  fill: FrameFill;
  border: FrameBorder;
  look: FrameLook;
  /** On a timeline's outer frame: when its first column starts and how long each lasts, for the Gantt view. */
  schedule?: { start: string; every: 'week' | '2weeks' | 'month' | 'quarter' };
}

/** A frame's fill: clear (the board shows through, as frames always have), solid, or a tint of a note colour. */
export const FRAME_FILLS = ['clear', 'solid', ...NOTE_COLORS] as const;
export type FrameFill = (typeof FRAME_FILLS)[number];
export const FRAME_BORDERS = ['solid', 'dashed', 'none'] as const;
export type FrameBorder = (typeof FRAME_BORDERS)[number];
/**
 * A frame's shape: outlined (as frames always were), a card, a header band, a folder tab, a soft zone, a drop zone, a
 * lane, a 16:9 slide or a browser window (corkboard-api's boards/layout.ts takes the same).
 */
export const FRAME_LOOKS = ['outline', 'card', 'band', 'tab', 'zone', 'drop', 'lane', 'slide', 'browser'] as const;
export type FrameLook = (typeof FRAME_LOOKS)[number];
export type FrameStyle = Pick<Frame, 'fill' | 'border' | 'look'>;
export const DEFAULT_FRAME: FrameStyle = { fill: 'clear', border: 'solid', look: 'outline' };
/** A slide frame's height for its width: always 16:9. */
export const slideHeight = (w: number) => Math.round((w * 9) / 16);

/** Where a selection moves in the stack: to the top or bottom, or past the next thing it overlaps. */
export type Restack = 'front' | 'forward' | 'backward' | 'back';

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

export const SHAPES = ['rect', 'ellipse', 'diamond', 'triangle', 'hexagon', 'star', 'arrow', 'cylinder', 'cloud', 'callout'] as const;
export type ShapeKind = (typeof SHAPES)[number];
/** A shape's fill: solid, or a see-through tint (for overlapping circles such as a Venn diagram), as in corkboard-api's layout.ts. */
export const SHAPE_FILLS = ['solid', 'tint'] as const;
export type ShapeFill = (typeof SHAPE_FILLS)[number];
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
  fill: ShapeFill;
  label: string;
}
/** Free text on the board, a heading or a label. */
export interface TextItem extends Placed {
  kind: 'text';
  text: string;
  size: TextSize;
}
/** Pen colours (see --pen-* in styles.css). Strokes from before these were kept used note colours, which are all here. */
export const PEN_COLORS = ['ink', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as const;
export type PenColor = (typeof PEN_COLORS)[number];
/** Pen thicknesses, in board pixels: fine, medium, bold and marker. */
export const PEN_WIDTHS = [2, 4, 8, 16] as const;
export interface PenStyle {
  color: PenColor;
  width: number;
}
export const DEFAULT_PEN: PenStyle = { color: 'ink', width: 4 };

/** A pen stroke: points (x, y, x, y, …) in a box `vw` by `vh` drawn at the item's size, so it scales when resized. */
export interface DrawingItem extends Placed {
  kind: 'drawing';
  points: readonly number[];
  vw: number;
  vh: number;
  color: PenColor;
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
/** The views that live on the board as things of their own: drawn from the board's notes and tasks, kept live. */
export const BOARD_VIEWS = ['matrix', 'kanban', 'timeline'] as const;
export type BoardView = (typeof BOARD_VIEWS)[number];
/** A new view's size: room for Trench Coat's matrix, task board or roadmap at 100%. */
export const VIEW_SIZE: Record<BoardView, { w: number; h: number }> = {
  matrix: { w: 760, h: 620 },
  kanban: { w: 1040, h: 620 },
  timeline: { w: 1040, h: 520 },
};
/** The smallest a view can be resized to and still be used. */
export const VIEW_MIN = { w: 360, h: 280 } as const;
/** What each view is called, on its title bar and to a screen reader. */
export const VIEW_NAMES: Record<BoardView, string> = { matrix: 'Value vs effort', kanban: 'Tasks', timeline: 'Timeline' };
/** A matrix, kanban or timeline placed on the board: moved, sized and stacked like anything else. */
export interface ViewItem extends Placed {
  kind: 'view';
  view: BoardView;
}

/**
 * A mini-app the assistant made: a small web page that shows or works with notes, run sandboxed. The code lives in the
 * API (see AppDto); this names the app, the version shown and the notes it reads (none: the whole board's).
 */
export interface AppItem extends Placed {
  kind: 'app';
  appId: string;
  title: string;
  version: number;
  sources: string[];
}

/** A diagram written as text in Mermaid (a flowchart or a sequence diagram), drawn on the board from it. */
export interface DiagramItem extends Placed {
  kind: 'diagram';
  source: string;
}

/** A bar, line or pie chart of a few labelled numbers, drawn with Trench Coat's charts. */
export interface ChartItem extends Placed {
  kind: 'chart';
  chart: ChartKind;
  title: string;
  rows: ChartRow[];
}

/** The board's other things: shapes, text, pen strokes, tables, link cards, views, mini-apps, diagrams and charts. */
export type Item = ShapeItem | TextItem | DrawingItem | TableItem | LinkItem | ViewItem | AppItem | DiagramItem | ChartItem;
const ITEM_KINDS = new Set(['shape', 'text', 'drawing', 'table', 'link', 'view', 'app', 'diagram', 'chart']);

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

/**
 * A template's layout, as corkboard-api's GET /board-templates sends it: things in board pixels from its top-left corner,
 * arrows joined by key. Choices arrive as strings and are checked as they're placed.
 */
export interface Layout {
  frames?: { key?: string; title: string; x: number; y: number; w: number; h: number; fill?: string; border?: string; look?: string }[];
  /** `rich`: a saved board's note as written (corkboard-api's boards/rich-text.ts), used instead of `text` when given. */
  notes?: { key?: string; text: string; rich?: readonly object[]; color?: string; x: number; y: number; w?: number; h?: number }[];
  texts?: { key?: string; text: string; size?: string; x: number; y: number; w?: number }[];
  /** Tinted shapes go under the notes; solid ones on top with the rest. */
  shapes?: { key?: string; shape: string; color?: string; fill?: string; label?: string; x: number; y: number; w: number; h: number }[];
  tables?: { key?: string; x: number; y: number; rows?: number; cols?: number; cells: string[][]; colWidth?: number }[];
  views?: { key?: string; view: string; x: number; y: number }[];
  arrows?: { from: string; to: string; route?: string; dash?: string; weight?: number }[];
}
type LayoutTable = NonNullable<Layout['tables']>[number];
const tableSize = (t: LayoutTable) => ({
  rows: Math.min(50, Math.max(t.rows ?? 1, t.cells.length, 1)),
  cols: Math.min(20, Math.max(t.cols ?? 1, ...t.cells.map((r) => r.length), 1)),
});
const tableBox = (t: LayoutTable) => {
  const { rows, cols } = tableSize(t);
  return { w: cols * (t.colWidth ?? 140), h: rows * 40 };
};
/** How big a layout is, from its top-left corner. */
export function layoutSize(layout: Layout): { w: number; h: number } {
  const boxes = [
    ...(layout.frames ?? []),
    ...(layout.notes ?? []).map((n) => ({ ...n, w: n.w ?? NOTE_SIZE.w, h: n.h ?? NOTE_SIZE.h })),
    ...(layout.shapes ?? []),
    ...(layout.texts ?? []).map((t) => ({ x: t.x, y: t.y, w: t.w ?? 240, h: TEXT_SIZES[textSize(t.size)] * 1.6 })),
    ...(layout.tables ?? []).map((t) => ({ x: t.x, y: t.y, ...tableBox(t) })),
    ...(layout.views ?? []).map((v) => ({ x: v.x, y: v.y, ...(VIEW_SIZE[v.view as BoardView] ?? { w: 0, h: 0 }) })),
  ];
  return { w: Math.max(0, ...boxes.map((b) => b.x + b.w)), h: Math.max(0, ...boxes.map((b) => b.y + b.h)) };
}
const textSize = (size: string | undefined): TextSize => (size && size in TEXT_SIZES ? (size as TextSize) : 'md');
/** A paragraph a line; `**Name:**` at a line's start is bold, as corkboard-api writes it. */
function paragraphsOf(text: string): Y.XmlElement[] {
  return text.split(/\r?\n/).map((line) => {
    const p = new Y.XmlElement('paragraph');
    if (!line) return p;
    const run = new Y.XmlText();
    const bold = /^\*\*(.+?)\*\*(.*)$/.exec(line);
    if (bold) {
      run.insert(0, bold[1], { bold: true });
      if (bold[2]) run.insert(bold[1].length, bold[2]);
    } else run.insert(0, line);
    p.insert(0, [run]);
    return p;
  });
}

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
function frameStyleOf(node: Y.Map<unknown>): FrameStyle {
  const fill = node.get('fill') as FrameFill;
  const border = node.get('border') as FrameBorder;
  const look = node.get('look') as FrameLook;
  return {
    fill: FRAME_FILLS.includes(fill) ? fill : DEFAULT_FRAME.fill,
    border: FRAME_BORDERS.includes(border) ? border : DEFAULT_FRAME.border,
    look: FRAME_LOOKS.includes(look) ? look : DEFAULT_FRAME.look,
  };
}

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
  /**
   * Whether this person may change locked things: a board owner, or the facilitator. The server refuses anyone else's
   * changes to them (and a refused change leaves this copy out of step), so without it nothing here writes to them.
   */
  get canChangeLocked(): boolean {
    return this.#canChangeLocked;
  }
  set canChangeLocked(can: boolean) {
    if (can === this.#canChangeLocked) return;
    this.#canChangeLocked = can;
    // An undo could reach back into something locked since.
    if (!can && this.#locked().size) this.undo.clear();
  }
  #canChangeLocked = true;
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

  /** Each note, item and image's place in the stack, from 1 at the bottom: its CSS z-index (layers can be any number). */
  readonly stack = computed(() => {
    const order = (a: { z: number; id: string }, b: { z: number; id: string }) => a.z - b.z || a.id.localeCompare(b.id);
    return new Map([...this.notes(), ...this.items(), ...this.media()].sort(order).map((n, i) => [n.id, i + 1]));
  });

  readonly #textRevision = signal(0);
  /** Goes up whenever a note's text changes; `trackText` depends on it. */
  readonly textRevision = this.#textRevision.asReadonly();

  constructor() {
    textRevisions.set(this.doc, this.textRevision);
    this.#nodes.observeDeep((events) => {
      if (events.some((e) => !(e.target instanceof Y.Map))) this.#textRevision.update((n) => n + 1);
      // Typing inside a note changes only its fragment; the lists need rebuilding when nodes or their properties do,
      // and then only the nodes that changed are read again.
      const changed = new Set<string>();
      for (const e of events) {
        if (e.target === this.#nodes) for (const key of e.changes.keys.keys()) changed.add(key);
        else if (e.target instanceof Y.Map) {
          const id = this.#nodeIdOf(e.target);
          if (id) changed.add(id);
        }
      }
      if (changed.size) this.#refresh(changed);
    });
    this.#refresh(null);
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

  /**
   * Lays out a template (corkboard-api's boards/layout.ts) centred on a point, as one undo step, above everything else
   * with its frames under the rest. Anything the board doesn't have (a colour, a shape) falls back to the default.
   * Returns the new things' ids, frames first.
   */
  addLayout(layout: Layout, cx: number, cy: number): string[] {
    const { w, h } = layoutSize(layout);
    if (w === 0) return [];
    const ox = cx - w / 2;
    const oy = cy - h / 2;
    const ids: string[] = [];
    const byKey = new Map<string, string>();
    const color = (c: string | undefined, fallback: NoteColor) => ((NOTE_COLORS as readonly string[]).includes(c ?? '') ? (c as NoteColor) : fallback);
    this.undo.stopCapturing();
    this.doc.transact(() => {
      let z = this.#topZ();
      const add = (kind: string, key: string | undefined, box: { x: number; y: number; w: number; h: number }, set: (node: Y.Map<unknown>) => void) => {
        const id = crypto.randomUUID();
        const node = new Y.Map<unknown>();
        node.set('kind', kind);
        node.set('x', Math.round(ox + box.x));
        node.set('y', Math.round(oy + box.y));
        node.set('w', Math.round(box.w));
        node.set('h', Math.round(box.h));
        node.set('z', ++z);
        this.#nodes.set(id, node);
        set(node);
        ids.push(id);
        if (key) byKey.set(key, id);
      };
      for (const f of layout.frames ?? [])
        add('frame', f.key, f, (n) => {
          n.set('title', f.title);
          if ((FRAME_FILLS as readonly string[]).includes(f.fill ?? '')) n.set('fill', f.fill);
          if ((FRAME_BORDERS as readonly string[]).includes(f.border ?? '')) n.set('border', f.border);
          if ((FRAME_LOOKS as readonly string[]).includes(f.look ?? '')) n.set('look', f.look);
          if (f.look === 'slide') n.set('h', slideHeight(f.w));
        });
      const shape = (s: NonNullable<Layout['shapes']>[number]) =>
        add('shape', s.key, s, (n) => {
          n.set('shape', (SHAPES as readonly string[]).includes(s.shape) ? s.shape : 'rect');
          n.set('color', color(s.color, 'blue'));
          n.set('label', s.label ?? '');
          if (s.fill === 'tint') n.set('fill', 'tint');
        });
      for (const s of layout.shapes ?? []) if (s.fill === 'tint') shape(s);
      for (const note of layout.notes ?? [])
        add('note', note.key, { ...note, w: size(note.w, NOTE_SIZE.w), h: size(note.h, NOTE_SIZE.h) }, (n) => {
          n.set('color', color(note.color, 'yellow'));
          if (this.author) n.set('createdBy', { ...this.author });
          const fragment = new Y.XmlFragment();
          n.set('text', fragment);
          const rich = note.rich && richNodes(note.rich);
          fragment.insert(0, rich?.length ? rich : paragraphsOf(note.text));
        });
      for (const t of layout.texts ?? []) {
        const size = textSize(t.size);
        add('text', t.key, { x: t.x, y: t.y, w: t.w ?? 240, h: TEXT_SIZES[size] * 1.6 }, (n) => {
          n.set('text', t.text);
          n.set('size', size);
        });
      }
      for (const s of layout.shapes ?? []) if (s.fill !== 'tint') shape(s);
      for (const t of layout.tables ?? [])
        add('table', t.key, { x: t.x, y: t.y, ...tableBox(t) }, (n) => {
          const { rows, cols } = tableSize(t);
          n.set('rows', rows);
          n.set('cols', cols);
          const cells = new Y.Map<string>();
          n.set('cells', cells);
          t.cells.forEach((row, r) => row.forEach((text, c) => text && cells.set(`${r}:${c}`, text)));
        });
      for (const v of layout.views ?? []) {
        if (!(BOARD_VIEWS as readonly string[]).includes(v.view)) continue;
        add('view', v.key, { x: v.x, y: v.y, ...VIEW_SIZE[v.view as BoardView] }, (n) => n.set('view', v.view));
      }
      for (const a of layout.arrows ?? []) {
        const from = byKey.get(a.from);
        const to = byKey.get(a.to);
        if (!from || !to || from === to) continue;
        const node = new Y.Map<unknown>();
        node.set('kind', 'connector');
        node.set('from', from);
        node.set('to', to);
        node.set('route', (ARROW_ROUTES as readonly string[]).includes(a.route ?? '') ? a.route : DEFAULT_ARROW.route);
        node.set('dash', (ARROW_DASHES as readonly string[]).includes(a.dash ?? '') ? a.dash : DEFAULT_ARROW.dash);
        node.set('weight', (ARROW_WEIGHTS as readonly number[]).includes(a.weight ?? 0) ? a.weight : DEFAULT_ARROW.weight);
        this.#nodes.set(crypto.randomUUID(), node);
      }
    }, this);
    return ids;
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
        const node = this.#writable(id);
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
        const node = this.#writable(id);
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
    const node = this.#writable(id);
    if (!node || node.get('kind') !== 'frame' || node.get('title') === title) return;
    this.undo.stopCapturing();
    this.doc.transact(() => node.set('title', title), this);
  }

  /** Resizes a frame from its bottom-right corner, no smaller than FRAME_MIN; a slide keeps to 16:9, from its width. */
  resizeFrame(id: string, w: number, h: number): void {
    const node = this.#writable(id);
    if (!node || node.get('kind') !== 'frame') return;
    this.doc.transact(() => {
      const width = Math.round(Math.max(FRAME_MIN.w, node.get('look') === 'slide' ? Math.max(w, (FRAME_MIN.h * 16) / 9) : w));
      node.set('w', width);
      node.set('h', node.get('look') === 'slide' ? slideHeight(width) : Math.round(Math.max(FRAME_MIN.h, h)));
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
        const node = this.#writable(id);
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
        const node = this.#writable(id);
        const kind = node?.get('kind');
        if (kind === 'note' || kind === 'shape' || kind === 'drawing') node!.set('color', color);
      }
    }, this);
  }

  /** Sets when a timeline frame starts and how long each of its columns lasts. */
  setSchedule(frameId: string, schedule: NonNullable<Frame['schedule']>): void {
    this.doc.transact(() => {
      const node = this.#writable(frameId);
      if (node?.get('kind') === 'frame') node.set('schedule', { ...schedule });
    }, this);
  }

  /** Places a note on the value-vs-effort matrix. */
  setScore(id: string, value: number, effort: number): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      const node = this.#writable(id);
      if (node?.get('kind') !== 'note') return;
      node.set('value', value);
      node.set('effort', effort);
    }, this);
  }

  /**
   * Moves things up or down the stack, keeping their order among themselves. There are two stacks: frames, among
   * frames, and everything else (notes, shapes, text, images…), which is always above the frames it sits in. Forward
   * and backward step past the next thing the selection overlaps; with nothing overlapping, nothing changes.
   */
  restack(ids: Iterable<string>, how: Restack): void {
    const wanted = new Set(ids);
    const order = (a: { z: number; id: string }, b: { z: number; id: string }) => a.z - b.z || a.id.localeCompare(b.id);
    const layers = [[...this.frames()], [...this.notes(), ...this.items(), ...this.media()]].map((layer) => layer.sort(order));
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const layer of layers) {
        const chosen = layer.filter((n) => wanted.has(n.id));
        if (chosen.length) this.#restackLayer(layer, chosen, how);
      }
    }, this);
  }

  /** One stack's part of restack: new layers (whole numbers, for CSS) for what moves and, to make room, what's above. */
  #restackLayer(layer: readonly (Box & { id: string; z: number })[], chosen: readonly (Box & { id: string; z: number })[], how: Restack): void {
    const rest = layer.filter((n) => !chosen.includes(n));
    const overlaps = (n: Box) => chosen.some((c) => c.x < n.x + n.w && n.x < c.x + c.w && c.y < n.y + n.h && n.y < c.y + c.h);
    const setZ = (id: string, z: number) => this.#writable(id)?.set('z', z);
    const k = chosen.length;
    if (how === 'front' || how === 'back') {
      const end = how === 'front' ? layer.slice(-k) : layer.slice(0, k);
      if (end.every((n, i) => n === chosen[i]) && new Set(layer.map((n) => n.z)).size === layer.length) return;
      const z = how === 'front' ? Math.max(...layer.map((n) => n.z)) + 1 : Math.min(...layer.map((n) => n.z)) - k;
      chosen.forEach((n, i) => setZ(n.id, z + i));
      return;
    }
    // Forward: just above the first overlapping thing over the selection's top; backward: just below the last one
    // under its bottom. Whatever is from there up is raised by k to make room.
    const index = (n: { id: string }) => layer.findIndex((m) => m.id === n.id);
    const past =
      how === 'forward'
        ? rest.find((n) => index(n) > index(chosen[k - 1]) && overlaps(n))
        : [...rest].reverse().find((n) => index(n) < index(chosen[0]) && overlaps(n));
    if (!past) return;
    const base = how === 'forward' ? past.z + 1 : past.z;
    for (const n of rest) if (n.z >= base && (how === 'backward' || n !== past)) setZ(n.id, n.z + k);
    chosen.forEach((n, i) => setZ(n.id, base + i));
  }

  /** Changes pen strokes' colour or thickness. */
  setPenStyle(ids: Iterable<string>, change: Partial<PenStyle>): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#writable(id);
        if (node?.get('kind') !== 'drawing') continue;
        if (change.color && PEN_COLORS.includes(change.color)) node.set('color', change.color);
        if (change.width && (PEN_WIDTHS as readonly number[]).includes(change.width)) node.set('width', change.width);
      }
    }, this);
  }

  /** Changes frames' fill, border or look; a frame made a slide becomes 16:9. */
  setFrameStyle(ids: Iterable<string>, change: Partial<FrameStyle>): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#writable(id);
        if (node?.get('kind') !== 'frame') continue;
        if (change.fill && FRAME_FILLS.includes(change.fill)) node.set('fill', change.fill);
        if (change.border && FRAME_BORDERS.includes(change.border)) node.set('border', change.border);
        if (change.look && FRAME_LOOKS.includes(change.look)) {
          node.set('look', change.look);
          if (change.look === 'slide') node.set('h', slideHeight(Math.max(node.get('w') as number, (FRAME_MIN.h * 16) / 9)));
        }
      }
    }, this);
  }

  /**
   * Removes notes, frames and arrows; arrows to or from what's removed go too. A mind-map note takes its branches with
   * it (the whole map, for its root), and the map closes up around the gap.
   */
  remove(ids: Iterable<string>): void {
    const gone = new Set(ids);
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of gone) if (!this.#writable(id)) gone.delete(id);
      const maps = this.#mindBoxes();
      const byId = new Map(maps.map((b) => [b.id, b]));
      const under = (b: { mind?: MindLink }) => {
        for (let p = b.mind?.parent, depth = 0; p && depth < 100; depth++) {
          if (gone.has(p)) return true;
          p = byId.get(p)?.mind?.parent ?? null;
        }
        return false;
      };
      for (const b of maps) if (!gone.has(b.id) && under(b) && this.#writable(b.id)) gone.add(b.id);
      for (const c of this.connectors()) if (gone.has(c.from) || gone.has(c.to)) gone.add(c.id);
      const roots = new Set(maps.filter((b) => gone.has(b.id) && !gone.has(b.mind!.root)).map((b) => b.mind!.root));
      for (const id of gone) this.#nodes.delete(id);
      for (const root of roots) this.#layoutMind(root);
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
  addDrawing(points: readonly number[], { color, width }: PenStyle = DEFAULT_PEN): string | null {
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

  /** Puts a matrix, kanban or timeline on the board, centred on a point, and returns its id. */
  addView(cx: number, cy: number, view: BoardView): string {
    const { w, h } = VIEW_SIZE[view];
    return this.#place('view', cx, cy, w, h, (n) => n.set('view', view));
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

  /** Puts a diagram on the board from its Mermaid text, centred on a point, and returns its id. */
  addDiagram(cx: number, cy: number, source: string, w = 480, h = 360): string {
    return this.#place('diagram', cx, cy, w, h, (n) => n.set('source', source.slice(0, MAX_DIAGRAM_CHARS)));
  }

  /** A diagram's new text, as one undoable change. */
  setDiagram(id: string, source: string): void {
    const node = this.#writable(id);
    source = source.slice(0, MAX_DIAGRAM_CHARS);
    if (node?.get('kind') !== 'diagram' || node.get('source') === source) return;
    this.undo.stopCapturing();
    this.doc.transact(() => node.set('source', source), this);
  }

  /** Puts a chart on the board, centred on a point, and returns its id. */
  addChart(cx: number, cy: number, chart: ChartKind, title: string, rows: readonly ChartRow[]): string {
    return this.#place('chart', cx, cy, 520, 380, (n) => {
      n.set('chart', chart);
      n.set('title', title);
      // Not "rows": the API reads that as a table's row count.
      n.set('data', cleanRows(rows));
    });
  }

  /** A chart's kind, title and rows, as one undoable change. */
  setChart(id: string, chart: { chart: ChartKind; title: string; rows: readonly ChartRow[] }): void {
    const node = this.#writable(id);
    if (node?.get('kind') !== 'chart') return;
    this.undo.stopCapturing();
    this.doc.transact(() => {
      node.set('chart', chart.chart);
      node.set('title', chart.title);
      node.set('data', cleanRows(chart.rows));
    }, this);
  }

  /** Fills in a link card once its page's preview arrives; it's not undoable on its own. */
  setLinkPreview(id: string, p: { title: string; description: string; image: string | null; site: string }): void {
    const node = this.#writable(id);
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
    const node = this.#writable(id);
    const key = node?.get('kind') === 'shape' ? 'label' : node?.get('kind') === 'text' ? 'text' : null;
    if (!node || !key || node.get(key) === text) return;
    this.undo.stopCapturing();
    this.doc.transact(() => node.set(key, text), this);
  }

  setShape(ids: Iterable<string>, shape: ShapeKind): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#writable(id);
        if (node?.get('kind') === 'shape') node.set('shape', shape);
      }
    }, this);
  }

  /** Makes shapes see-through (a tint) or solid again. */
  setShapeFill(ids: Iterable<string>, fill: ShapeFill): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#writable(id);
        if (node?.get('kind') !== 'shape') continue;
        if (fill === 'tint') node.set('fill', 'tint');
        else node.delete('fill');
      }
    }, this);
  }

  setTextSize(ids: Iterable<string>, size: TextSize): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#writable(id);
        if (node?.get('kind') === 'text') node.set('size', size);
      }
    }, this);
  }

  setCell(id: string, row: number, col: number, text: string): void {
    const cells = this.#writable(id)?.get('cells');
    if (!(cells instanceof Y.Map)) return;
    const key = `${row}:${col}`;
    if ((cells.get(key) ?? '') === text) return;
    this.undo.stopCapturing();
    this.doc.transact(() => (text ? cells.set(key, text) : cells.delete(key)), this);
  }

  /** Adds or removes a table's last row or column; it grows or shrinks to match. */
  resizeTable(id: string, rows: number, cols: number): void {
    const node = this.#writable(id);
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
    const node = this.#writable(id);
    if (!node || !ITEM_KINDS.has(String(node.get('kind')))) return;
    this.doc.transact(() => {
      const view = node.get('kind') === 'view';
      node.set('w', Math.round(Math.max(view ? VIEW_MIN.w : ITEM_MIN, w)));
      node.set('h', Math.round(Math.max(view ? VIEW_MIN.h : node.get('kind') === 'text' ? 20 : ITEM_MIN, h)));
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
      // Copied mind-map notes make a map of their own: parents and roots point at the copies. A copy whose parent
      // wasn't copied heads the new map if it has branches with it, and is a plain note otherwise.
      const minds = new Map<string, MindLink>();
      for (const id of wanted) {
        const link = mindLinkOf(this.#nodes.get(id)!.get('mind'));
        if (link) minds.set(id, link);
      }
      const top = (id: string): string => {
        let at = id;
        for (let depth = 0; depth < 100; depth++) {
          const parent = minds.get(at)?.parent;
          if (!parent || !minds.has(parent)) return at;
          at = parent;
        }
        return at;
      };
      for (const [id, link] of minds) {
        const copy = this.#nodes.get(copies.get(id)!)!;
        const head = top(id);
        if (head !== id) copy.set('mind', { ...link, root: copies.get(head)!, parent: copies.get(link.parent!)! });
        else if ([...minds.values()].some((m) => m.parent === id)) copy.set('mind', { ...link, root: copies.get(id)!, parent: null, order: 0 });
        else copy.delete('mind');
      }
      for (const c of this.connectors()) {
        const from = copies.get(c.from);
        const to = copies.get(c.to);
        if (!from || !to) continue;
        // The arrow as it is (its route, dashes and weight), between the copies.
        const arrow = this.#nodes.set(crypto.randomUUID(), (this.#nodes.get(c.id) as Y.Map<unknown>).clone());
        arrow.set('from', from);
        arrow.set('to', to);
      }
    }, this);
    return wanted.map((id) => copies.get(id)!);
  }

  /** Locks or unlocks things in place. */
  setLocked(ids: Iterable<string>, locked: boolean): void {
    if (!this.canChangeLocked) return;
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
    this.doc.transact(() => ids.forEach((id, i) => this.#writable(id)?.set('order', i)), this);
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
        const node = this.#writable(id);
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

  // ── Mind maps: notes joined by curved arrows, laid out as a tree growing right from the root ──

  /** Notes hidden because a branch above them is folded. */
  readonly hiddenNotes = computed(() => hiddenByFolds(this.notes()));

  /** Starts a mind map: a note that is its root, centred on a point. */
  startMindMap(cx: number, cy: number, text = ''): string {
    const id = this.addNote(cx, cy, 'yellow', text);
    this.doc.transact(() => this.#nodes.get(id)?.set('mind', { root: id, parent: null, order: 0 }), this);
    return id;
  }

  /** Adds a branch under a note (making it a map's root if it isn't in one yet), and lays the map out again. */
  addMindChild(parentId: string, text = ''): string | null {
    const parent = this.notes().find((n) => n.id === parentId);
    if (!parent || !this.#writable(parentId)) return null;
    this.undo.stopCapturing();
    let id = '';
    this.doc.transact(() => {
      const link = parent.mind ?? { root: parent.id, parent: null, order: 0 };
      if (!parent.mind) this.#nodes.get(parent.id)!.set('mind', link);
      // A folded branch opens to show the new one.
      if (link.collapsed) this.#nodes.get(parent.id)!.set('mind', { ...link, collapsed: false });
      const siblings = mindChildren(this.#mindBoxes(), link.root).get(parent.id) ?? [];
      id = this.addNote(parent.x + parent.w + 200, parent.y + parent.h / 2, parent.color, text);
      this.#nodes.get(id)!.set('mind', { root: link.root, parent: parent.id, order: siblings.length ? Math.max(...siblings.map((c) => c.mind!.order)) + 1 : 0 });
      this.connect(parent.id, id, { route: 'curve', dash: 'solid', weight: 2 });
      this.#layoutMind(link.root);
    }, this);
    return id;
  }

  /** Adds a branch beside a note in its map, right after it (under the root, for the root itself). */
  addMindSibling(id: string, text = ''): string | null {
    const note = this.notes().find((n) => n.id === id);
    if (!note?.mind?.parent) return this.addMindChild(id, text);
    const parentId = note.mind.parent;
    this.undo.stopCapturing();
    let added: string | null = null;
    this.doc.transact(() => {
      // Make room right after it.
      for (const sib of mindChildren(this.#mindBoxes(), note.mind!.root).get(parentId) ?? []) {
        if (sib.mind!.order > note.mind!.order) this.#writable(sib.id)?.set('mind', { ...sib.mind, order: sib.mind!.order + 1 });
      }
      added = this.addMindChild(parentId, text);
      if (added) {
        this.#nodes.get(added)!.set('mind', { ...mindLinkOf(this.#nodes.get(added)!.get('mind'))!, order: note.mind!.order + 1 });
        this.#layoutMind(note.mind!.root);
      }
    }, this);
    return added;
  }

  /** Folds a note's branches away, or opens them again. */
  toggleMindFold(id: string): void {
    const node = this.#writable(id);
    const link = mindLinkOf(node?.get('mind'));
    if (!node || !link) return;
    this.undo.stopCapturing();
    this.doc.transact(() => {
      node.set('mind', { ...link, collapsed: !link.collapsed });
      this.#layoutMind(link.root);
    }, this);
  }

  /** Makes a mind map of notes: the one nearest their middle as the root, the rest its branches, top to bottom. */
  makeMindMap(ids: readonly string[]): string | null {
    const notes = this.notes().filter((n) => ids.includes(n.id) && !n.mind);
    if (notes.length < 2) return null;
    const cx = notes.reduce((s, n) => s + n.x + n.w / 2, 0) / notes.length;
    const cy = notes.reduce((s, n) => s + n.y + n.h / 2, 0) / notes.length;
    const root = [...notes].sort((a, b) => Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) - Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy))[0];
    const branches = notes.filter((n) => n.id !== root.id).sort((a, b) => a.y - b.y || a.x - b.x);
    this.undo.stopCapturing();
    this.doc.transact(() => {
      this.#writable(root.id)?.set('mind', { root: root.id, parent: null, order: 0 });
      branches.forEach((b, order) => {
        this.#writable(b.id)?.set('mind', { root: root.id, parent: root.id, order });
        this.connect(root.id, b.id, { route: 'curve', dash: 'solid', weight: 2 });
      });
      this.#layoutMind(root.id);
    }, this);
    return root.id;
  }

  /** The notes in maps, as the document has them now (mid-change, before the board's lists catch up). */
  #mindBoxes(): { id: string; x: number; y: number; w: number; h: number; mind?: MindLink }[] {
    const boxes: { id: string; x: number; y: number; w: number; h: number; mind?: MindLink }[] = [];
    this.#nodes.forEach((node, id) => {
      if (!(node instanceof Y.Map) || node.get('kind') !== 'note') return;
      const mind = mindLinkOf(node.get('mind'));
      if (!mind) return;
      boxes.push({ id, x: num(node.get('x')), y: num(node.get('y')), w: num(node.get('w'), NOTE_SIZE.w), h: num(node.get('h'), NOTE_SIZE.h), mind });
    });
    return boxes;
  }

  /** Puts every note in a map where the tree layout says. */
  #layoutMind(rootId: string): void {
    for (const [id, at] of mindLayout(this.#mindBoxes(), rootId)) {
      const node = this.#writable(id);
      if (!node) continue;
      if (node.get('x') !== at.x) node.set('x', at.x);
      if (node.get('y') !== at.y) node.set('y', at.y);
    }
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
        const node = this.#writable(id);
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

  /** A node to change: undefined when it's not there, or it's locked and this person may not change locked things. */
  #writable(id: string): Y.Map<unknown> | undefined {
    const node = this.#nodes.get(id);
    return node && (this.#canChangeLocked || node.get('locked') !== true) ? node : undefined;
  }

  #topZ(): number {
    let top = 0;
    this.#nodes.forEach((node) => {
      if (node instanceof Y.Map) top = Math.max(top, num(node.get('z')));
    });
    return top;
  }

  /** The node a map belongs to: the node itself, or the node a map inside it (a table's cells) is in. */
  #nodeIdOf(type: Y.AbstractType<any>): string | null {
    let t: Y.AbstractType<any> | null = type;
    while (t?._item) {
      if (t._item.parent === this.#nodes) return t._item.parentSub;
      t = t._item.parent as Y.AbstractType<any>;
    }
    return null;
  }

  /**
   * Each node as last read, for as long as it doesn't change: the canvas gets the same object back, so a note that
   * didn't move or change isn't drawn again. On a board of thousands that's most of them, every time.
   */
  #read$ = new Map<string, { node: Y.Map<unknown>; read: NodeRead }>();

  /** Rebuilds the lists, reading again only the nodes that changed (all of them when `changed` is null). */
  #refresh(changed: ReadonlySet<string> | null): void {
    const notes: Note[] = [];
    const frames: Frame[] = [];
    const connectors: Connector[] = [];
    const media: Media[] = [];
    const items: Item[] = [];
    const locked = new Set<string>();
    const lists = { notes, frames, connectors, media, items } as Record<NonNullable<NodeRead>['list'], { id: string }[]>;
    const kept = new Map<string, { node: Y.Map<unknown>; read: NodeRead }>();
    this.#nodes.forEach((node, id) => {
      // Anything the API let through that isn't a node is skipped, not allowed to break the board for everyone.
      if (!(node instanceof Y.Map)) return;
      const cached = this.#read$.get(id);
      let read: NodeRead;
      if (cached && cached.node === node && changed && !changed.has(id)) read = cached.read;
      else {
        try {
          read = this.#read(node, id);
        } catch {
          // A node that can't be read is left out.
          read = null;
        }
      }
      kept.set(id, { node, read });
      if (!read) return;
      if (read.locked) locked.add(id);
      lists[read.list].push(read.value);
    });
    this.#read$ = kept;
    const order = (a: { z: number; id: string }, b: { z: number; id: string }) => a.z - b.z || a.id.localeCompare(b.id);
    this.#notes.set(notes.sort(order));
    this.#frames.set(frames.sort(order));
    this.#connectors.set(connectors);
    this.#media.set(media.sort(order));
    this.#items.set(items.sort(order));
    if (locked.size !== this.#locked().size || [...locked].some((id) => !this.#locked().has(id))) {
      // Something newly locked by someone else: an undo here could reach back into it.
      if (!this.#canChangeLocked && [...locked].some((id) => !this.#locked().has(id))) this.undo.clear();
      this.#locked.set(locked);
    }
  }

  /** One node, as the list it belongs in shows it; positions and sizes made safe on the way (see pos and size). */
  #read(node: Y.Map<unknown>, id: string): NodeRead {
    const locked = node.get('locked') === true;
    const kind = node.get('kind');
    if (kind === 'image' || kind === 'file') {
      return {
        list: 'media',
        locked,
        value: {
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
        },
      };
    }
    if (ITEM_KINDS.has(String(kind))) {
      const item = itemOf(id, node);
      return item ? { list: 'items', locked, value: item } : null;
    }
    if (node.get('kind') === 'connector') {
      const from = node.get('from');
      const to = node.get('to');
      return typeof from === 'string' && typeof to === 'string' ? { list: 'connectors', locked, value: { id, from, to, ...arrowStyleOf(node) } } : null;
    }
    if (node.get('kind') === 'frame') {
      const title = node.get('title');
      return {
        list: 'frames',
        locked,
        value: {
        id,
        x: pos(node.get('x')),
        y: pos(node.get('y')),
        w: size(node.get('w'), FRAME_SIZE.w),
        h: size(node.get('h'), FRAME_SIZE.h),
        z: num(node.get('z')),
        title: typeof title === 'string' ? title : '',
        ...frameStyleOf(node),
          ...scheduleOf(node),
        },
      };
    }
    if (node.get('kind') !== 'note') return null;
    const color = node.get('color') as NoteColor;
    const text = node.get('text');
    // A note's words are a rich-text fragment; without one it can't be shown or edited.
    if (!(text instanceof Y.XmlFragment)) return null;
    return {
      list: 'notes',
      locked,
      value: {
      id,
      x: pos(node.get('x')),
      y: pos(node.get('y')),
      w: size(node.get('w'), NOTE_SIZE.w),
      h: size(node.get('h'), NOTE_SIZE.h),
      z: num(node.get('z')),
      color: NOTE_COLORS.includes(color) ? color : 'yellow',
      text,
      ...(typeof node.get('authorName') === 'string' ? { authorName: node.get('authorName') as string } : {}),
      // A participant's view names the writer as the board allows ("You", "Participant 4"), in place of who they are.
      ...(typeof node.get('byline') === 'string' && typeof node.get('authorName') !== 'string' ? { authorName: node.get('byline') as string } : {}),
      ...(node.get('participant') === true ? { participant: true } : {}),
      ...(typeof node.get('by') === 'string' ? { by: node.get('by') as string } : {}),
      ...createdByOf(node),
      tags: tagsOf(node),
      ...(mindLinkOf(node.get('mind')) ? { mind: mindLinkOf(node.get('mind')) } : {}),
        ...scores(node),
      },
    };
  }
}

/** A node as read: the list it goes in and how that list shows it, and whether it's locked; null if it can't be shown. */
type NodeRead =
  | { list: 'notes'; locked: boolean; value: Note }
  | { list: 'frames'; locked: boolean; value: Frame }
  | { list: 'connectors'; locked: boolean; value: Connector }
  | { list: 'media'; locked: boolean; value: Media }
  | { list: 'items'; locked: boolean; value: Item }
  | null;

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
      return { ...box, kind: 'shape', shape: SHAPES.includes(shape) ? shape : 'rect', color: NOTE_COLORS.includes(color) ? color : 'blue', fill: node.get('fill') === 'tint' ? 'tint' : 'solid', label: str(node.get('label')) };
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
        color: PEN_COLORS.includes(color) ? color : 'ink',
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
    case 'view': {
      const view = node.get('view') as BoardView;
      return BOARD_VIEWS.includes(view) ? { ...box, kind: 'view', view } : null;
    }
    case 'app': {
      const appId = node.get('appId');
      const version = node.get('version');
      const sources = node.get('sources');
      if (typeof appId !== 'string') return null;
      return {
        ...box,
        kind: 'app',
        appId,
        title: str(node.get('title')) || 'App',
        version: Number.isInteger(version) && (version as number) > 0 ? (version as number) : 1,
        sources: Array.isArray(sources) ? sources.filter((s): s is string => typeof s === 'string') : [],
      };
    }
    case 'diagram':
      return { ...box, kind: 'diagram', source: str(node.get('source')) };
    case 'chart': {
      const chart = node.get('chart') as ChartKind;
      return { ...box, kind: 'chart', chart: CHART_KINDS.includes(chart) ? chart : 'bar', title: str(node.get('title')), rows: cleanRows(node.get('data')) };
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

/** A note's rich text as plain data, as a saved template keeps it: an element, or a run of text with its marks. */
export type RichNode = { n: string; a?: Record<string, unknown>; c?: RichNode[] } | { t: { insert: string; attributes?: Record<string, unknown> }[] };

/** The blocks a note's editor writes (note-text.ts): anything else in a template's rich text is left out. */
const RICH_ELEMENTS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'blockquote', 'hardBreak', 'horizontalRule', 'math', 'mathBlock']);

/** Rich data as the Yjs nodes of a note's text; empty when there's nothing the editor can show. */
export function richNodes(rich: readonly object[], depth = 0): (Y.XmlElement | Y.XmlText)[] {
  if (depth > 12) return [];
  return (rich as readonly RichNode[]).flatMap((node): (Y.XmlElement | Y.XmlText)[] => {
    if (!node || typeof node !== 'object') return [];
    if ('t' in node) {
      if (!Array.isArray(node.t)) return [];
      const text = new Y.XmlText();
      text.applyDelta(node.t.filter((op) => typeof op?.insert === 'string'));
      return [text];
    }
    if (typeof node.n !== 'string' || !RICH_ELEMENTS.has(node.n)) return [];
    const el = new Y.XmlElement(node.n);
    for (const [k, v] of Object.entries(node.a ?? {})) el.setAttribute(k, v as string);
    const children = Array.isArray(node.c) ? richNodes(node.c, depth + 1) : [];
    if (children.length) el.insert(0, children);
    return [el];
  });
}
