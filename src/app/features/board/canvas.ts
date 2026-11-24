import { Component, computed, effect, ElementRef, HostListener, inject, input, output, signal, untracked, viewChild, type TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Icon, type IconName } from '../../shared/icon';
import { Highlighter, List, ListOrdered, type IconNode, SquareCode, Sigma } from 'lucide';
import { DiagramView } from './diagram-view';
import { ChartView } from './chart-view';
import { PdfPages } from './pdf-pages';
import { CHART_NAMES, STARTER_ROWS, type ChartRow } from './chart';
import { DIAGRAM_MENU, DIAGRAM_STARTERS, diagramTitle, type DiagramImages, type DiagramKind } from './diagram';
import { HIGHLIGHTS, type HighlightColor } from './note-text';
import { MenuMorph } from '@adamstavely/trenchcoat/angular/menu-morph';
import { Api } from '../../api/generated/api';
import { unfurlControllerPreview } from '../../api/generated/fn/boards/unfurl-controller-preview';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SelectionToolbar } from '@adamstavely/trenchcoat/angular/selection-toolbar';
import {
  defaultSelectionToolbarItems,
  selectionRect,
  type SelectionToolbarCommand,
  type SelectionToolbarItem,
} from '@adamstavely/trenchcoat/selection-toolbar';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Editor } from '@tiptap/core';
import { VIEW_NAMES, type BoardView, type Layout, layoutSize, type ViewItem, type AppItem, DEFAULT_ARROW, MAX_ARROW_LABEL, DEFAULT_FRAME, DEFAULT_PEN, type PenStyle, FRAME_BORDERS, FRAME_FILLS, FRAME_LOOKS, type FrameBorder, type FrameFill, type FrameLook, type FrameStyle, type Restack, NOTE_COLORS, NOTE_SIZE, type ArrowRoute, type ArrowStyle, NOTE_TEMPLATES, SHAPES, TEXT_SIZES, type BoardDoc, type Clip, type Item, type NoteColor, type NoteTemplate, type Note, type ShapeKind, type TableItem, type TextSize } from './board-doc';
import { boardTags, findOnBoard, NO_QUERY, notePeople, type FindQuery } from './find';
import { describeBoard, describeThing } from './describe';
import { align, distribute, snap, tidy, type Alignment, type Box as LayoutBox, type Guide } from './layout';
import type { ImagePin } from './comments';
import { NoteView } from './note';
import type { Presence } from './presence';
import type { NoteVotes } from './facilitation';
import { arrowHeads, arrowLines, boardBounds, boardBoxes, dashPattern } from './export';
import { ArrowStyleBar } from './arrow-style';
import { PenStyleBar } from './pen-style';
import { playableKind, safeUrl, shapeDetail, shapePath } from './items';
import type { NoteReaction } from './reactions';
import type { Media } from './board-doc';
import { fileSize } from './file-cache';
import { REACTIONS, reactionLook } from './reactions';
import type { PresentedView } from './presence';
import { clampZoom, contains, intersects, rectFrom, toWorld, zoomAt, type Point, type Rect, type Viewport } from './viewport';

type Gesture =
  | { kind: 'pan'; last: Point }
  | { kind: 'drag'; last: Point; moved: boolean; ids: Set<string>; start: Point; applied: Point; box: Rect | null; others: LayoutBox[] }
  | { kind: 'resize'; id: string; start: Point; size: { w: number; h: number }; item?: boolean }
  | { kind: 'marquee'; start: Point; base: Set<string> }
  | { kind: 'draw'; points: number[] }
  | { kind: 'place'; tool: PlacingTool; start: Point };

/**
 * What a click on the board does: select (the default), or place something, draw, join two things with an arrow, or
 * comment. A placing tool goes back to Select once it's used; Pen stays until it's put down.
 */
export type Tool = 'select' | 'note' | 'text' | ShapeKind | 'frame' | 'table' | 'pen' | 'connect' | 'comment';
type PlacingTool = Extract<Tool, 'note' | 'text' | ShapeKind | 'frame' | 'table'>;
const PLACING: ReadonlySet<Tool> = new Set<Tool>(['note', 'text', 'rect', 'ellipse', 'diamond', 'triangle', 'frame', 'table']);
/** Single keys that pick a tool, as the rail shows them. N adds a note straight away (see onKeyDown). */
const TOOL_KEYS: Readonly<Record<string, Tool>> = { v: 'select', t: 'text', r: 'rect', o: 'ellipse', f: 'frame', p: 'pen', l: 'connect', c: 'comment' };
/** A drag smaller than this, on screen, is a click: the thing gets its usual size. */
const DRAG_MIN = 8;

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  triangle: 'Triangle',
  hexagon: 'Hexagon',
  star: 'Star',
  arrow: 'Arrow',
  cylinder: 'Cylinder',
  cloud: 'Cloud',
  callout: 'Speech bubble',
};
const TEXT_SIZE_NAMES: { id: TextSize; label: string; name: string }[] = [
  { id: 'sm', label: 'S', name: 'Small' },
  { id: 'md', label: 'M', name: 'Medium' },
  { id: 'lg', label: 'L', name: 'Large' },
  { id: 'xl', label: 'XL', name: 'Extra large' },
];



/** A Lucide icon as the path data Trench Coat's bar draws. */
const paths = (icon: IconNode) => icon.flatMap(([tag, attrs]) => (tag === 'path' ? [String(attrs['d'])] : []));
const HIGHLIGHT_NAMES: Record<HighlightColor, string> = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink', purple: 'Purple' };

/** The formats a note supports: Trench Coat's marks, a highlighter, and bulleted and numbered lists one click away. */
const pick = (id: string) => defaultSelectionToolbarItems.find((i) => i.type !== 'separator' && i.id === id)!;
const FORMAT_ITEMS: SelectionToolbarItem[] = [
  pick('bold'),
  pick('italic'),
  pick('strike'),
  pick('code'),
  {
    type: 'menu',
    id: 'highlight',
    label: 'Highlight',
    icon: paths(Highlighter),
    options: [{ value: 'none', label: 'No highlight' }, ...HIGHLIGHTS.map((c) => ({ value: c, label: HIGHLIGHT_NAMES[c], color: `var(--hl-${c})` }))],
  },
  { type: 'separator' },
  { type: 'toggle', id: 'bullets', label: 'Bulleted list', icon: paths(List), shortcut: '- then space' },
  { type: 'toggle', id: 'numbers', label: 'Numbered list', icon: paths(ListOrdered), shortcut: '1. then space' },
  { type: 'separator' },
  { type: 'toggle', id: 'codeBlock', label: 'Code block', icon: paths(SquareCode), shortcut: '``` then space' },
  { type: 'button', id: 'math', label: 'Maths', icon: paths(Sigma), shortcut: '$x^2$' },
];
const MARKS = ['bold', 'italic', 'strike', 'code'] as const;

const COLOR_LABELS: Record<NoteColor, string> = {
  yellow: 'Yellow',
  pink: 'Pink',
  blue: 'Blue',
  green: 'Green',
  purple: 'Purple',
  gray: 'Gray',
};

/** Spacing of the background dots at 100%. */
const GRID = 24;

/**
 * What ⌘/Ctrl C or X last took, shared by the boards open in this tab, with the text it put on the system clipboard (so a
 * paste after copying something else elsewhere doesn't bring it back) and how many times it's been pasted.
 */
let clipboard: { clip: Clip; text: string | null; pastes: number } | null = null;

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** A note with no votes while a vote runs; one object, so each note keeps the same input. */
const NO_VOTES_YET: NoteVotes = { mine: 0, total: null };
/** No reactions, likewise. */
const NO_REACTIONS: NoteReaction[] = [];

const NO_NOTES: Note[] = [];
/** Below this zoom a note's words can't be read (15px type under 5px), so notes are drawn as blocks of colour. */
const FAR_ZOOM = 0.3;

/** How many things a board has before only what's on screen is drawn. */
const CULL_FROM = 300;

/**
 * The board: an endless surface to pan and zoom, with notes to add, select, drag and edit, and frames that group them.
 * Drag the background to select with a box; hold Space (or use the middle button) and drag to pan; scroll to pan, and
 * pinch or Ctrl/⌘-scroll to zoom. Double-click empty space to add a note, a note to write in it, or a frame's title to
 * rename it. A frame is picked up anywhere on it (Shift-drag inside one to box-select instead), carries its notes with
 * it, and resizes from its corner.
 */
/**
 * What the page around a canvas can do for it: upload files, open the template picker, draw placed views and apps,
 * ask the model, and edit diagrams and charts in a side panel. A board page has them all; a guest's shared page none.
 */
export type CanvasCapability = 'files' | 'templates' | 'views' | 'assistant' | 'diagrams' | 'charts' | 'imagePins';
export const MEMBER_CAPABILITIES: ReadonlySet<CanvasCapability> = new Set(['files', 'templates', 'views', 'assistant', 'diagrams', 'charts', 'imagePins']);
export const GUEST_CAPABILITIES: ReadonlySet<CanvasCapability> = new Set();

@Component({
  selector: 'app-canvas',
  imports: [NoteView, Button, SelectionToolbar, MenuMorph, Icon, ArrowStyleBar, PenStyleBar, NgTemplateOutlet, DiagramView, ChartView, PdfPages],
  templateUrl: './canvas.html',
  styleUrls: ['./canvas.css', './canvas-frames.css', './canvas-items.css', './canvas-find.css', './canvas-rail.css'],
})
export class Canvas {
  readonly board = input.required<BoardDoc>();
  /** What the page around the canvas handles beyond the board itself; commands needing anything else aren't shown. */
  readonly capabilities = input<ReadonlySet<CanvasCapability>>(MEMBER_CAPABILITIES);
  protected can(capability: CanvasCapability): boolean {
    return this.capabilities().has(capability);
  }
  /** Who else is here, and where this person's pointer and selection go out to them. */
  readonly presence = input<Presence | undefined>(undefined);
  /** Readers and commenters look, select and ask; they don't add, move, change or delete anything. */
  readonly readOnly = input(false);
  /** Private mode: names stay hidden on notes and on others' pointers and selections. */
  readonly privateMode = input(false);
  /** Whether this person locks and unlocks things (an owner, or the facilitator). */
  readonly canLock = input(true);
  /** What to call that in the toolbar, e.g. "View only". */
  readonly readOnlyLabel = input('View only');
  /** How many comments each note or frame's open thread has, for badges. */
  readonly commentCounts = input<ReadonlyMap<string, number>>(new Map());
  /** The live connection, for others' carets inside notes. */
  readonly provider = input<HocuspocusProvider | undefined>(undefined);
  /** The selected notes, and those in selected frames, whenever they change (the assistant works on them). */
  readonly selectionChange = output<readonly string[]>();
  /** Titles of the selected frames, so the assistant can say which region it's about. */
  readonly framesChange = output<readonly string[]>();
  /** A line under some frames' titles (a breakout group's members and time), and whether this person can join it. */
  readonly frameBadges = input<ReadonlyMap<string, { label: string; mine: boolean; joinable: boolean }>>(new Map());
  /** This person asked to join the group in this frame. */
  readonly joinFrame = output<string>();
  /** Exactly what's selected – notes and frames – for comments on them. */
  readonly selectedIds = output<readonly string[]>();
  /** Dot votes per note (see noteVotes), whether this person is voting, and how many votes they have left. */
  readonly noteVotes = input<ReadonlyMap<string, NoteVotes>>(new Map());
  readonly voting = input(false);
  readonly votesLeft = input(0);
  readonly vote = output<{ noteId: string; add: boolean }>();
  /** Reactions per note, whether this person may react, and their reactions going out. */
  readonly reactions = input<ReadonlyMap<string, NoteReaction[]>>(new Map());
  readonly canReact = input(false);
  readonly react = output<{ nodeId: string; emoji: string; on: boolean }>();
  /** Object URLs of the board's files (see FileCache), by file id. */
  readonly fileUrls = input<ReadonlyMap<string, string>>(new Map());
  /** Where diagrams get their pictures: the board's files and the web, through the API (see FileCache). */
  readonly diagramImages = input<DiagramImages | undefined>(undefined);
  /** Files dropped on the board, and where (board coordinates). */
  readonly filesDropped = output<{ files: File[]; at: Point }>();
  /** Open the add-files panel, ask about an image, or open a file. */
  readonly addFiles = output<void>();
  /** Open a diagram's text to edit it. */
  readonly editDiagram = output<string>();
  /** Open a chart's numbers to edit them. */
  readonly editChart = output<string>();
  /** Open the board-template picker. */
  readonly boardTemplates = output<void>();
  readonly askImage = output<Media>();
  readonly openFile = output<Media>();
  /** Comments pinned to spots on images, by image; a pin opens its thread, and a new one can be placed. */
  readonly pins = input<ReadonlyMap<string, ImagePin[]>>(new Map());
  readonly pinOpen = output<string>();
  readonly pinPlaced = output<{ nodeId: string; anchor: { x: number; y: number } }>();
  /** The next click on the selected image pins a comment there. */
  protected readonly pinning = signal(false);

  /** What this person is looking at, whenever it changes: for presenting it to others. */
  readonly viewChange = output<PresentedView>();
  /** The frames on screen, close enough to read, whenever that changes: for the facilitator's participation view. */
  readonly framesInView = output<readonly string[]>();

  protected readonly viewport = signal<Viewport>({ x: 80, y: 80, zoom: 1 });
  protected readonly selection = signal<ReadonlySet<string>>(new Set());
  protected readonly editing = signal<string | null>(null);
  /** The frame whose title is being edited. */
  protected readonly renaming = signal<string | null>(null);
  protected readonly marquee = signal<Rect | null>(null);
  protected readonly spaceHeld = signal(false);
  protected readonly panning = signal(false);

  protected readonly colors = NOTE_COLORS.map((c) => ({ id: c, label: COLOR_LABELS[c] }));

  // ── Shapes, text, pen strokes, tables and link cards ──

  readonly #api = inject(Api);
  protected readonly textSizes = TEXT_SIZES;
  protected readonly shapes = SHAPES;
  protected readonly shapeNames = SHAPE_NAMES;
  protected readonly textSizeNames = TEXT_SIZE_NAMES;
  protected readonly shapePath = shapePath;
  protected readonly noReactions = NO_REACTIONS;
  protected readonly shapeDetail = shapeDetail;
  protected readonly playable = playableKind;
  protected readonly safeUrl = safeUrl;
  protected readonly insertOpen = signal(false);
  /** Drawing with the pen: a drag on the board draws instead of selecting. */
  /** The tool in hand (see Tool). */
  readonly tool = signal<Tool>('select');
  protected readonly pen = computed(() => this.tool() === 'pen');
  protected readonly placing = computed(() => PLACING.has(this.tool()));
  protected readonly shapeTool = computed(() => ['rect', 'ellipse', 'diamond', 'triangle', 'connect'].includes(this.tool()));
  /** ⌘ on Apple devices, Ctrl elsewhere, for the shortcuts shown. */
  protected readonly modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';
  /** The colour new notes get: the one last picked. */
  readonly #noteColor = signal<NoteColor>('yellow');
  /** With the arrow tool, the thing the arrow starts from. */
  readonly #connectFrom = signal<string | null>(null);
  protected readonly createOpen = signal(false);
  protected readonly colourOpen = signal(false);
  protected readonly shapeOpen = signal(false);
  protected readonly sizeOpen = signal(false);
  protected readonly tagOpen = signal(false);
  protected readonly reactOpen = signal(false);
  protected readonly moreOpen = signal(false);
  protected readonly shapeIcons: Record<ShapeKind, IconName> = {
    rect: 'rect',
    ellipse: 'oval',
    diamond: 'rhombus',
    triangle: 'triangle',
    hexagon: 'hexagon',
    star: 'star',
    arrow: 'blockArrow',
    cylinder: 'cylinder',
    cloud: 'cloud',
    callout: 'callout',
  };
  /** The colour of the first selected note or shape, for the selection bar's swatch. */
  protected readonly barColour = computed<NoteColor>(() => {
    const sel = this.selection();
    const note = this.board().notes().find((n) => sel.has(n.id));
    if (note) return note.color;
    const shape = this.board().items().find((i) => i.kind === 'shape' && sel.has(i.id));
    return shape && shape.kind === 'shape' ? shape.color : this.#noteColor();
  });

  /** The selection bar's comment: the comments on the one thing selected, or a pin on an image. */
  protected commentOnSelection(): void {
    const [id] = this.selection();
    if (!id) return;
    if (this.oneImage()) this.pinning.set(!this.pinning());
    else this.pinOpen.emit(id);
  }

  protected duplicateSelection(): void {
    const copies = this.board().duplicate(this.selection(), 24, 24);
    this.selection.set(new Set(copies));
  }
  protected readonly templatesOpen = signal(false);
  protected readonly shapesOpen = signal(false);
  /** The rail's views, opened beside the board. */
  /** What a placed view (matrix, kanban, timeline) shows in its body; the board page has what they need. */
  readonly viewContent = input<TemplateRef<{ $implicit: ViewItem }> | null>(null);
  /** What a mini-app's body shows: the app, run (board-page's boardApp); without it, a note on where to use it. */
  readonly appContent = input<TemplateRef<{ $implicit: AppItem }> | null>(null);
  /** What "Make an app from these" asks the assistant, about the selected notes. */
  protected readonly makeAppPrompt = 'Make a mini-app that works with these notes: something useful for what they are, like a tally, a chart, a sorter or a quiz.';
  protected readonly makeDiagramPrompt = 'Make a diagram from these notes: a flowchart of the steps or decisions in them, or a sequence diagram if they describe who sends what to whom.';
  protected readonly viewIcons: Record<BoardView, IconName> = { matrix: 'matrix', kanban: 'kanban', timeline: 'timeline' };

  /** Picks a tool from the rail or a key. Frame, with notes selected, frames them at once. */
  pickTool(tool: Tool): void {
    this.createOpen.set(false);
    this.templatesOpen.set(false);
    this.shapesOpen.set(false);
    this.#connectFrom.set(null);
    if (tool === 'frame' && this.hasNotesSelected()) {
      this.addFrame();
      this.tool.set('select');
      return;
    }
    this.tool.set(this.tool() === tool && tool !== 'select' ? 'select' : tool);
  }

  /**
   * Puts a matrix, kanban or timeline on the board, in the middle of the view. There's one of each per board (they all
   * show the whole board's notes or tasks), so if it's already there, this goes to it instead.
   */
  placeView(view: BoardView): void {
    this.createOpen.set(false);
    const there = this.board().items().find((i) => i.kind === 'view' && i.view === view);
    if (there) {
      this.selection.set(new Set([there.id]));
      this.#reveal(there.id);
      return;
    }
    if (this.readOnly()) return;
    const at = this.#viewCentre();
    const id = this.board().addView(at.x, at.y, view);
    this.selection.set(new Set([id]));
  }

  /**
   * Lays a template out in the middle of the view, or to the right of everything if that would cover what's there, then
   * brings it into view. One undo takes it all away.
   */
  placeLayout(layout: Layout): string[] {
    if (this.readOnly()) return [];
    const things = boardBoxes(this.board());
    const size = layoutSize(layout);
    let at = this.#viewCentre();
    const box = { x: at.x - size.w / 2, y: at.y - size.h / 2, ...size };
    const covers = things.some((b) => b.x < box.x + box.w && box.x < b.x + b.w && b.y < box.y + box.h && box.y < b.y + b.h);
    if (covers) {
      const right = Math.max(...things.map((b) => b.x + b.w)) + 160;
      const top = Math.min(...things.map((b) => b.y));
      at = { x: right + size.w / 2, y: top + size.h / 2 };
    }
    const ids = this.board().addLayout(layout, at.x, at.y);
    this.show(ids, false);
    return ids;
  }

  /** Locks or unlocks the layout, so people can only add and move notes around it. */
  lockLayout(lock: boolean): void {
    this.board().setLocked(layoutIds(this.board()), lock);
  }

  /** Goes to the board's parking lot, a frame for what's not for now, making one first if there isn't one. */
  goToParkingLot(): void {
    const there = this.board().frames().find((f) => /^parking lot$/i.test(f.title.trim()));
    if (there) {
      this.show([there.id]);
      return;
    }
    const [id] = this.placeLayout({
      frames: [{ title: 'Parking lot', x: 0, y: 0, w: 464, h: 640, fill: 'gray', border: 'dashed' }],
      notes: [{ text: 'Good, but not for now.', color: 'gray', x: 32, y: 48 }],
    });
    if (id) this.selection.set(new Set([id]));
  }

  protected undo(): void {
    this.board().undo.undo();
  }

  protected redo(): void {
    this.board().undo.redo();
  }

  /** What an armed tool makes where it was clicked, or in the box dragged out for it. */
  #placeWith(tool: PlacingTool, box: Rect): void {
    const zoom = this.viewport().zoom;
    const sized = box.w * zoom >= DRAG_MIN || box.h * zoom >= DRAG_MIN;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const w = Math.max(box.w, 40);
    const h = Math.max(box.h, 30);
    const board = this.board();
    if (tool === 'note') {
      const id = board.addNote(cx, cy, this.#noteColor());
      this.selection.set(new Set([id]));
      this.#edit(id);
    } else if (tool === 'frame') {
      const id = board.addFrame(cx, cy);
      if (sized) board.resizeFrame(id, w, h);
      this.selection.set(new Set([id]));
      this.#rename(id);
    } else if (tool === 'table') {
      this.selection.set(new Set([board.addTable(cx, cy)]));
    } else {
      const id = tool === 'text' ? board.addText(cx, cy) : board.addShape(cx, cy, tool);
      if (sized) board.resizeItem(id, w, h);
      this.selection.set(new Set([id]));
      this.#editItem(id);
    }
    board.undo.stopCapturing();
  }
  /** The stroke being drawn, in board points. */
  protected readonly draft = signal<number[] | null>(null);
  /** The colour and thickness the pen draws in: the ones last picked. */
  protected readonly penStyle = signal<PenStyle>(DEFAULT_PEN);
  protected readonly penOpen = signal(false);
  protected readonly selectedDrawings = computed(() => this.board().items().filter((i) => i.kind === 'drawing' && this.selection().has(i.id)));
  /** The first selected stroke's style, for the selection bar's swatch and the menu's ticks. */
  protected readonly drawingStyle = computed<PenStyle>(() => {
    const [d] = this.selectedDrawings();
    return d && d.kind === 'drawing' ? { color: d.color, width: d.width } : this.penStyle();
  });

  /** Restyles the selected strokes, and the pen with them, so the next stroke matches. */
  protected restyleDrawings(change: Partial<PenStyle>): void {
    this.board().setPenStyle(this.selectedDrawings().map((d) => d.id), change);
    this.penStyle.update((s) => ({ ...s, ...change }));
  }
  protected readonly linkPrompt = signal(false);
  /** The shape or text being written in, or the table cell. */
  protected readonly itemEditing = signal<{ id: string; cell?: string } | null>(null);
  protected readonly selectedShapes = computed(() => this.board().items().filter((i) => i.kind === 'shape' && this.selection().has(i.id)).map((i) => i.id));
  /** Whether every selected shape is see-through, so the menu's tick shows and choosing it makes them solid again. */
  protected readonly shapesSeeThrough = computed(() => {
    const picked = this.board().items().filter((i) => i.kind === 'shape' && this.selection().has(i.id));
    return picked.length > 0 && picked.every((i) => i.kind === 'shape' && i.fill === 'tint');
  });
  /** The one diagram selected, by itself, to edit its text. */
  protected readonly oneDiagram = computed(() => {
    const [id, ...more] = this.selection();
    return !more.length && this.board().items().some((i) => i.id === id && i.kind === 'diagram') ? id : null;
  });
  /** The one chart selected, by itself, to edit its numbers. */
  protected readonly oneChart = computed(() => {
    const [id, ...more] = this.selection();
    return !more.length && this.board().items().some((i) => i.id === id && i.kind === 'chart') ? id : null;
  });
  protected readonly selectedTexts = computed(() => this.board().items().filter((i) => i.kind === 'text' && this.selection().has(i.id)).map((i) => i.id));
  protected readonly oneTable = computed(() => {
    if (this.selection().size !== 1) return null;
    const [id] = this.selection();
    return (this.board().items().find((i) => i.id === id && i.kind === 'table') as TableItem | undefined) ?? null;
  });

  // ── Note templates, tags, and finding things ──

  protected readonly noteTemplates = NOTE_TEMPLATES;
  /** The selected notes not already in a mind map: what "Make a mind map" would use, offered for two or more. */
  protected readonly mindMapNotes = computed(() => this.board().notes().filter((n) => this.selection().has(n.id) && !n.mind).length);
  protected readonly selectedNoteIds = computed(() => this.board().notes().filter((n) => this.selection().has(n.id)).map((n) => n.id));
  /** Tags on any selected note, to take off. */
  protected readonly selectedTags = computed(() => [...new Set(this.board().notes().filter((n) => this.selection().has(n.id)).flatMap((n) => n.tags))]);
  protected readonly tags = computed(() => boardTags(this.board()));
  protected readonly people = computed(() => notePeople(this.board()));
  protected readonly finding = signal(false);
  protected readonly query = signal<FindQuery>(NO_QUERY);
  /** What matches, in reading order; null when nothing's being looked for. */
  protected readonly found = computed(() => (this.finding() ? findOnBoard(this.board(), this.query()) : null));
  readonly #foundSet = computed(() => new Set(this.found() ?? []));
  readonly #at = signal(0);
  /** The match shown last with ↑/↓ or Enter. */
  protected readonly current = computed(() => {
    const f = this.found();
    return f?.length ? f[Math.min(this.#at(), f.length - 1)] : null;
  });
  protected readonly foundLabel = computed(() => {
    const f = this.found();
    if (!f) return '';
    if (!f.length) return 'No matches';
    return `${Math.min(this.#at(), f.length - 1) + 1} of ${f.length}`;
  });
  protected dims(id: string): boolean {
    return !!this.found() && !this.#foundSet().has(id);
  }
  protected isFound(id: string): boolean {
    return !!this.found() && this.#foundSet().has(id);
  }

  // ── Snapping, aligning, and the bar over a selection ──

  /** Guide lines while a drag snaps (board coordinates). */
  protected readonly guides = signal<Guide[]>([]);
  protected readonly layoutOpen = signal(false);
  protected readonly aiOpen = signal(false);
  /** Ask the model about the selected notes (the chat takes the selection as its scope). */
  readonly askAi = output<string>();
  /** Whether the assistant is here to ask (not on a participant's view of a board). */
  readonly canAsk = input(true);
  /** Presenting slides: the board alone, without its tools. */
  readonly bare = input(false);

  /** Where the bar over the selection goes, in screen space: above the selection, or null when there's nothing to act on. */
  protected readonly selectionBar = computed(() => {
    // Shown while a note is written in, too, so its colour can change without leaving it; but not while text in it is
    // selected, when the text bar takes its place rather than sitting on top of it.
    if (this.itemEditing() || this.marquee() || this.selection().size === 0 || this.formatAnchor()) return null;
    const chosen = boardBoxes(this.board()).filter((b) => this.selection().has(b.id));
    if (!chosen.length) return null;
    const r = rectAround(chosen);
    const { x, y, zoom } = this.viewport();
    const notes = this.board().notes().filter((n) => this.selection().has(n.id)).length;
    const canArrange = !this.readOnly() && chosen.length > 1;
    const canAsk = notes > 0 && this.canReact();
    if (!canArrange && !canAsk && this.readOnly()) return null;
    return { left: (r.x + r.w / 2) * zoom + x, top: Math.max(8, r.y * zoom + y - 56), count: chosen.length, notes };
  });

  protected readonly layerOpen = signal(false);
  protected readonly layerChoices: { how: Restack; label: string; icon: IconName; keys: string }[] = [
    { how: 'front', label: 'Bring to front', icon: 'toFront', keys: `⇧${this.modKey}]` },
    { how: 'forward', label: 'Bring forward', icon: 'forward', keys: `${this.modKey}]` },
    { how: 'backward', label: 'Send backward', icon: 'backward', keys: `${this.modKey}[` },
    { how: 'back', label: 'Send to back', icon: 'toBack', keys: `⇧${this.modKey}[` },
  ];

  /** Moves what's selected up or down the stack (frames among frames, everything else above them). Locked things stay. */
  protected restack(how: Restack): void {
    this.layerOpen.set(false);
    this.board().restack([...this.selection()].filter((id) => !this.board().locked().has(id)), how);
  }

  protected readonly frameStyleOpen = signal(false);
  protected readonly selectedFrames = computed(() => this.board().frames().filter((f) => this.selection().has(f.id)));
  /** The first selected frame's look, for the bar's swatch and the menu's ticks. */
  protected readonly frameStyle = computed<FrameStyle>(() => this.selectedFrames()[0] ?? DEFAULT_FRAME);
  protected readonly frameFills = FRAME_FILLS.map((fill) => ({ id: fill, label: fill === 'clear' ? 'Clear' : fill === 'solid' ? 'Solid' : COLOR_LABELS[fill] }));
  protected readonly frameLooks: { id: FrameLook; label: string }[] = FRAME_LOOKS.map((l) => ({
    id: l,
    label: { outline: 'Outline', card: 'Card', band: 'Band', tab: 'Tab', zone: 'Zone', drop: 'Drop zone', lane: 'Lane', slide: 'Slide', browser: 'Browser' }[l],
  }));
  protected readonly frameBorders: { id: FrameBorder; label: string }[] = FRAME_BORDERS.map((b) => ({ id: b, label: { solid: 'Solid border', dashed: 'Dashed border', none: 'No border' }[b] }));

  /** A fill as a swatch shows it (inline, so the menu's own button styles don't cover it); clear is hatched. */
  protected fillLook(fill: FrameFill): string {
    if (fill === 'clear') return 'repeating-linear-gradient(45deg, transparent 0 4px, color-mix(in srgb, var(--tc-text-primary) 14%, transparent) 4px 5px)';
    if (fill === 'solid') return 'var(--tc-surface-raised)';
    return `color-mix(in srgb, var(--note-${fill}) 45%, var(--tc-surface-raised))`;
  }

  protected restyleFrames(change: { fill?: FrameFill; border?: FrameBorder; look?: FrameLook }): void {
    this.board().setFrameStyle(this.selectedFrames().map((f) => f.id), change);
  }

  /** Whether everything selected is locked: the bar offers Unlock then, else Lock. */
  protected readonly allLocked = computed(() => [...this.selection()].every((id) => this.board().locked().has(id)));

  protected toggleLock(): void {
    this.board().setLocked(this.selection(), !this.allLocked());
  }

  protected arrange(how: Alignment | 'h' | 'v' | 'tidy'): void {
    this.layoutOpen.set(false);
    const chosen = boardBoxes(this.board()).filter((b) => this.selection().has(b.id) && !this.board().locked().has(b.id));
    const moves = how === 'tidy' ? tidy(chosen) : how === 'h' ? distribute(chosen, 'x') : how === 'v' ? distribute(chosen, 'y') : align(chosen, how);
    this.board().place(moves);
  }

  protected ask(what: string): void {
    this.aiOpen.set(false);
    this.askAi.emit(what);
  }

  #viewRect(): Rect {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const { x, y, zoom } = this.viewport();
    return { x: -x / zoom, y: -y / zoom, w: width / zoom, h: height / zoom };
  }

  togglePen(): void {
    this.pickTool('pen');
  }

  /** The note just added next to another (Tab, ⌘Enter or a + handle), open to write in, joined by an arrow if asked. */
  #addNext(id: string, side: 'right' | 'left' | 'down' | 'up', arrow = false): void {
    const next = this.board().addNoteNext(id, side);
    if (!next) return;
    if (arrow) this.board().connect(id, next);
    this.selection.set(new Set([next]));
    this.#reveal(next);
    this.#edit(next);
  }

  /** Adds a branch to a mind map (under a note, or beside it) and starts writing in it. */
  #addBranch(id: string, where: 'child' | 'sibling'): void {
    const added = where === 'child' ? this.board().addMindChild(id) : this.board().addMindSibling(id);
    if (!added) return;
    this.selection.set(new Set([added]));
    this.#reveal(added);
    this.#edit(added);
  }

  /** Starts a mind map in the middle of the view, writing its root. */
  protected startMindMap(): void {
    this.createOpen.set(false);
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const at = toWorld(this.viewport(), { x: width / 2, y: height / 2 });
    const id = this.board().startMindMap(at.x - 200, at.y);
    this.selection.set(new Set([id]));
    this.#edit(id);
  }

  /** The one note selected, when it's in a mind map, with how many branches it has. */
  protected readonly oneMindNote = computed(() => {
    const [id, more] = this.selection();
    const note = !more && id ? this.board().notes().find((n) => n.id === id) : undefined;
    if (!note?.mind) return null;
    const branches = this.board().notes().filter((n) => n.mind?.parent === note.id).length;
    return { id: note.id, branches, folded: !!note.mind.collapsed };
  });
  protected addBranch(where: 'child' | 'sibling'): void {
    const one = this.oneMindNote();
    if (one) this.#addBranch(one.id, where);
  }
  protected toggleFold(): void {
    const one = this.oneMindNote();
    if (one) this.board().toggleMindFold(one.id);
  }
  protected makeMindMap(): void {
    this.moreOpen.set(false);
    const root = this.board().makeMindMap(this.selectedNoteIds());
    if (root) this.selection.set(new Set([root]));
  }
  /** How many branches are folded away under each folded note, for its badge. */
  protected readonly foldedCounts = computed(() => {
    const counts = new Map<string, number>();
    const hidden = this.board().hiddenNotes();
    if (!hidden.size) return counts;
    const notes = this.board().notes();
    const byId = new Map(notes.map((n) => [n.id, n]));
    for (const id of hidden) {
      // Count it against the nearest folded note above it.
      for (let p = byId.get(id)?.mind?.parent, depth = 0; p && depth < 100; depth++) {
        const parent = byId.get(p);
        if (parent?.mind?.collapsed) {
          counts.set(p, (counts.get(p) ?? 0) + 1);
          break;
        }
        p = parent?.mind?.parent ?? null;
      }
    }
    return counts;
  });

  /** The + handles round the one note selected: each adds a note on that side, with an arrow to it. */
  protected readonly handles = computed(() => {
    if (this.readOnly() || this.editing() || this.selection().size !== 1) return null;
    const [id] = this.selection();
    const n = this.board().notes().find((x) => x.id === id);
    // A mind map's notes grow branches instead (Tab, or the bar).
    if (!n || n.mind) return null;
    const gap = 14;
    return {
      id,
      spots: [
        { side: 'right' as const, x: n.x + n.w + gap, y: n.y + n.h / 2 },
        { side: 'down' as const, x: n.x + n.w / 2, y: n.y + n.h + gap },
        { side: 'left' as const, x: n.x - gap, y: n.y + n.h / 2 },
        { side: 'up' as const, x: n.x + n.w / 2, y: n.y - gap },
      ],
    };
  });

  protected onHandle(id: string, side: 'right' | 'left' | 'down' | 'up', e: Event): void {
    e.stopPropagation();
    this.#addNext(id, side, true);
  }

  protected insertTemplate(t: NoteTemplate): void {
    this.insertOpen.set(false);
    const at = this.#viewCentre();
    const id = this.board().addTemplateNote(at.x, at.y, t);
    this.selection.set(new Set([id]));
    this.#edit(id);
  }

  protected addTag(input: HTMLInputElement): void {
    this.board().addTag(this.selectedNoteIds(), input.value);
    input.value = '';
  }

  toggleFind(): void {
    const open = !this.finding();
    this.finding.set(open);
    if (!open) {
      this.query.set(NO_QUERY);
      return;
    }
    setTimeout(() => this.surface().nativeElement.parentElement?.querySelector<HTMLInputElement>('[data-find-autofocus]')?.focus());
  }

  protected setQuery(change: Partial<FindQuery>): void {
    this.query.update((q) => ({ ...q, ...change }));
    this.#at.set(0);
    // Bring the first match into view as you type.
    const first = this.found()?.[0];
    if (first) this.show([first], false);
  }

  /** The next (or previous) match, brought into view. */
  protected step(by: 1 | -1): void {
    const f = this.found();
    if (!f?.length) return;
    this.#at.update((i) => (Math.min(i, f.length - 1) + by + f.length) % f.length);
    this.show([this.current()!], false);
  }

  protected onFindKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.step(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.toggleFind();
    }
  }

  // ── Keyboard and screen readers ──

  /** What a screen reader hears when the board gets focus: what's on it, in a sentence. */
  protected readonly summary = computed(() => describeBoard(this.board()));
  /** Said once, politely, by screen readers: what was selected or moved. */
  protected readonly announcement = signal('');
  #announceSelection = effect(() => {
    const ids = [...this.selection()];
    untracked(() => {
      if (!ids.length) return;
      const board = this.board();
      this.announcement.set(ids.length === 1 ? `Selected ${describeThing(board, ids[0])}` : `${ids.length} things selected`);
    });
  });

  /** Everything that can be selected, in reading order (top to bottom, then left to right), for Tab. */
  #readingOrder(): string[] {
    return boardBoxes(this.board())
      .slice()
      .sort((a, b) => Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x)
      .map((b) => b.id);
  }

  /** Selects the next (or previous) thing on the board and brings it into view, without zooming in past 100%. */
  #tabTo(by: 1 | -1): void {
    const order = this.#readingOrder();
    if (!order.length) return;
    const [current] = this.selection();
    const at = current ? order.indexOf(current) : -1;
    const next = order[(at + by + order.length) % order.length];
    this.selection.set(new Set([next]));
    this.#reveal(next);
  }

  /** Pans just enough to bring something into view, keeping the zoom. */
  #reveal(id: string): void {
    const box = boardBoxes(this.board()).find((b) => b.id === id);
    if (!box) return;
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const { x, y, zoom } = this.viewport();
    const left = box.x * zoom + x;
    const top = box.y * zoom + y;
    const margin = 80;
    let dx = 0;
    let dy = 0;
    if (left < margin) dx = margin - left;
    else if (left + box.w * zoom > width - margin) dx = width - margin - (left + box.w * zoom);
    if (top < margin) dy = margin - top;
    else if (top + box.h * zoom > height - 140) dy = height - 140 - (top + box.h * zoom);
    if (dx || dy) this.viewport.set({ x: x + dx, y: y + dy, zoom });
  }

  /** Moves what's selected by the arrow keys; frames carry what's in them, as when dragged. */
  #nudge(dx: number, dy: number): void {
    const frames = this.board().withInnerFrames(this.board().frames().filter((f) => this.selection().has(f.id)).map((f) => f.id));
    const ids = new Set([...this.selection(), ...frames, ...this.board().notesIn(frames)]);
    this.board().move(ids, dx, dy);
    const [first] = this.selection();
    if (first) this.#reveal(first);
  }

  protected itemLabel(item: Item): string {
    switch (item.kind) {
      case 'shape':
        return `${SHAPE_NAMES[item.shape]}${item.label ? `: ${item.label}` : ''}`;
      case 'text':
        return `Text: ${item.text}`;
      case 'drawing':
        return 'Drawing';
      case 'table':
        return `Table, ${item.rows} by ${item.cols}`;
      case 'link':
        return `Link: ${item.title}`;
      case 'view':
        return VIEW_NAMES[item.view];
      case 'app':
        return `App: ${item.title}`;
      case 'diagram':
        return `Diagram: ${diagramTitle(item.source)}`;
      case 'chart':
        return `${CHART_NAMES[item.chart]}${item.title ? `: ${item.title}` : ''}`;
    }
  }

  /** Puts a chart in the middle of the view, selected, and returns its id. */
  placeChart(title: string, rows: readonly ChartRow[]): string {
    const at = this.#viewCentre();
    const id = this.board().addChart(at.x, at.y, 'bar', title, rows);
    this.selection.set(new Set([id]));
    return id;
  }

  /** Puts a bar chart with a few example numbers in the middle of the view, selected, and opens its numbers. */
  protected addChart(): void {
    this.createOpen.set(false);
    const at = this.#viewCentre();
    const id = this.board().addChart(at.x, at.y, 'bar', 'Untitled chart', STARTER_ROWS);
    this.selection.set(new Set([id]));
    this.editChart.emit(id);
  }

  /** The kinds of diagram past the first two, shown in the Create menu on asking. */
  protected readonly moreDiagrams = DIAGRAM_MENU.slice(2);
  protected readonly moreDiagramsOpen = signal(false);

  /** Puts a starter diagram of a kind in the middle of the view, selected, and opens its text. */
  protected addDiagram(kind: DiagramKind): void {
    this.createOpen.set(false);
    this.moreDiagramsOpen.set(false);
    const at = this.#viewCentre();
    const id = this.board().addDiagram(at.x, at.y, DIAGRAM_STARTERS[kind]);
    this.selection.set(new Set([id]));
    this.editDiagram.emit(id);
  }

  protected tableCells(t: TableItem): { key: string; row: number; col: number; text: string }[] {
    const cells = [];
    for (let row = 0; row < t.rows; row++) for (let col = 0; col < t.cols; col++) cells.push({ key: `${row}:${col}`, row, col, text: t.cells.get(`${row}:${col}`) ?? '' });
    return cells;
  }

  /** Adds something from the Insert menu in the middle of the view, selected (and open to write in, for text). */
  insert(what: ShapeKind | 'text' | 'table' | 'link'): void {
    this.insertOpen.set(false);
    if (what === 'link') {
      this.linkPrompt.set(true);
      this.#focusSoon();
      return;
    }
    const at = this.#viewCentre();
    const id = what === 'text' ? this.board().addText(at.x, at.y) : what === 'table' ? this.board().addTable(at.x, at.y) : this.board().addShape(at.x, at.y, what);
    this.selection.set(new Set([id]));
    if (what !== 'table') this.#editItem(id);
  }

  /** Puts a link card in the middle of the view, then fills in its title and picture from the page. */
  protected async addLink(raw: string): Promise<void> {
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    this.linkPrompt.set(false);
    const at = this.#viewCentre();
    const id = this.board().addLink(at.x, at.y, url);
    this.selection.set(new Set([id]));
    try {
      const preview = await this.#api.invoke(unfurlControllerPreview, { body: { url } });
      this.board().setLinkPreview(id, preview);
    } catch {
      // The card keeps the site's name; the link still works.
    }
  }

  protected onItemEditKey(id: string, e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.itemEditing.set(null);
      this.surface().nativeElement.focus({ preventScroll: true });
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.finishItemEdit(id, (e.target as HTMLTextAreaElement).value);
    }
  }

  /** In a cell, Enter and Tab move on (down, across), as in a spreadsheet; Escape leaves it as it was. */
  protected onCellKey(t: TableItem, row: number, col: number, e: KeyboardEvent): void {
    const value = (e.target as HTMLInputElement).value;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.itemEditing.set(null);
      return;
    }
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    this.board().setCell(t.id, row, col, value);
    const [nr, nc] = e.key === 'Tab' ? (col + 1 < t.cols ? [row, col + 1] : [row + 1, 0]) : [row + 1, col];
    this.itemEditing.set(nr < t.rows ? { id: t.id, cell: `${nr}:${nc}` } : null);
    this.#focusSoon();
  }

  /** Saves what was written and stops editing; a cell's blur only counts while that cell is still the one open. */
  protected finishItemEdit(id: string, value: string, cell?: string): void {
    const editing = this.itemEditing();
    if (!editing || editing.id !== id || (cell !== undefined && editing.cell !== cell)) return;
    if (editing.cell) {
      const [row, col] = editing.cell.split(':').map(Number);
      this.board().setCell(id, row, col, value);
    } else this.board().setText(id, value.trim());
    this.itemEditing.set(null);
  }

  #editItem(id: string, cell?: string): void {
    if (this.readOnly() || this.board().locked().has(id)) return;
    this.itemEditing.set({ id, ...(cell ? { cell } : {}) });
    this.#focusSoon();
  }

  /** Focuses the editor that's just appeared (an item's text, a cell, the link box). */
  #focusSoon(): void {
    setTimeout(() => {
      const el = this.surface().nativeElement.parentElement?.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-autofocus]');
      el?.focus();
      el?.select?.();
    });
  }

  /** The middle of the view, stepped down and right past anything already placed there, so new things don't stack. */
  #viewCentre(): Point {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const at = toWorld(this.viewport(), { x: width / 2, y: height / 2 });
    const centres = [...this.board().items(), ...this.board().notes()].map((i) => ({ x: i.x + i.w / 2, y: i.y + i.h / 2 }));
    for (let step = 0; step < 20 && centres.some((c) => Math.abs(c.x - at.x) < 24 && Math.abs(c.y - at.y) < 24); step++) {
      at.x += 40;
      at.y += 40;
    }
    return at;
  }
  protected readonly formatItems = FORMAT_ITEMS;

  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  /** The same, for effects that may run before the view exists. */
  private readonly surfaceIfReady = viewChild<ElementRef<HTMLElement>>('surface');
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  #gesture: Gesture | undefined;

  protected readonly worldTransform = computed(() => {
    const { x, y, zoom } = this.viewport();
    return `translate(${x}px, ${y}px) scale(${zoom})`;
  });
  /**
   * On a big board, only what's on screen (with a margin) is drawn, plus whatever's selected or being written in, so
   * panning and typing stay quick with thousands of notes. Small boards draw everything.
   */
  readonly #onScreen = computed(() => {
    const board = this.board();
    if (board.notes().length + board.items().length + board.media().length < CULL_FROM) return null;
    const { x, y, zoom } = this.viewport();
    const { width, height } = this.#size();
    const margin = 400 / zoom;
    const view: Rect = { x: -x / zoom - margin, y: -y / zoom - margin, w: width / zoom + 2 * margin, h: height / zoom + 2 * margin };
    const keep = new Set([...this.selection(), this.editing(), this.itemEditing()?.id].filter((id): id is string => !!id));
    return (thing: { id: string } & Rect) => keep.has(thing.id) || intersects(view, thing);
  });
  protected readonly drawnNotes = computed(() => {
    const hidden = this.board().hiddenNotes();
    return this.#cull(hidden.size ? this.board().notes().filter((n) => !hidden.has(n.id)) : this.board().notes());
  });
  /** The ids of the frames on screen, space-separated so it only changes when they do; none when too far out to read. */
  readonly #framesInView = computed(() => {
    const { x, y, zoom } = this.viewport();
    const { width, height } = this.#size();
    if (!width || zoom < FAR_ZOOM) return '';
    const view: Rect = { x: -x / zoom, y: -y / zoom, w: width / zoom, h: height / zoom };
    return this.board()
      .frames()
      .filter((f) => intersects(view, f))
      .map((f) => f.id)
      .sort()
      .join(' ');
  });
  /** Zoomed out this far, a note's words are too small to read, so notes are drawn as their colour alone. */
  protected readonly farView = computed(() => this.viewport().zoom < FAR_ZOOM);
  /** The notes drawn in full: all of them, or zoomed out, only the one being written in. */
  protected readonly nearNotes = computed(() => (this.farView() ? this.drawnNotes().filter((n) => n.id === this.editing()) : this.drawnNotes()));
  /** The notes drawn as their colour alone, zoomed out. */
  protected readonly farNotes = computed(() => (this.farView() ? this.drawnNotes().filter((n) => n.id !== this.editing()) : NO_NOTES));
  protected readonly drawnItems = computed(() => this.#cull(this.board().items()));
  protected readonly drawnMedia = computed(() => this.#cull(this.board().media()));
  #cull<T extends { id: string } & Rect>(all: T[]): T[] {
    const show = this.#onScreen();
    return show ? all.filter(show) : all;
  }
  protected readonly gridSize = computed(() => GRID * this.viewport().zoom);
  protected readonly hasNotesSelected = computed(() => this.board().notes().some((n) => this.selection().has(n.id)));
  protected readonly zoomPercent = computed(() => `${Math.round(this.viewport().zoom * 100)}%`);

  /** The marquee is drawn in screen space, so it stays crisp at any zoom. */
  protected readonly marqueeScreen = computed(() => {
    const m = this.marquee();
    if (!m) return null;
    const { x, y, zoom } = this.viewport();
    return { x: m.x * zoom + x, y: m.y * zoom + y, w: m.w * zoom, h: m.h * zoom };
  });

  /** Others' pointers, in screen space so they stay the same size at any zoom. */
  protected readonly peerPointers = computed(() => {
    const { x, y, zoom } = this.viewport();
    return (this.presence()?.peers() ?? [])
      .filter((p) => p.pointer)
      .map((p) => ({ id: p.clientId, name: p.user.name, color: p.user.color, x: p.pointer!.x * zoom + x, y: p.pointer!.y * zoom + y }));
  });

  /** Per note, the first other person who has it selected or is writing in it. */
  protected readonly peerMarks = computed(() => {
    const marks = new Map<string, { name: string; color: string; editing: boolean }>();
    for (const p of this.presence()?.peers() ?? []) {
      if (p.editing) marks.set(p.editing, { name: p.user.name, color: p.user.color, editing: true });
      for (const id of p.selection) {
        if (!marks.has(id)) marks.set(id, { name: p.user.name, color: p.user.color, editing: false });
      }
    }
    return marks;
  });

  // The note editor and its formatting bar
  protected readonly editor = signal<Editor | null>(null);
  protected readonly editorElement = computed(() => this.editor()?.view.dom ?? null);
  protected readonly formatAnchor = signal<ReturnType<typeof selectionRect>>(null);
  protected readonly pressed = signal<string[]>([]);
  protected readonly values = signal<Record<string, string>>({});

  constructor() {
    // A note someone locks while this person is writing in it: they stop, as the server won't take their typing.
    effect(() => {
      const id = this.editing();
      if (id && !this.canLock() && this.board().locked().has(id)) untracked(() => this.editing.set(null));
    });
    // Track the surface's size for the minimap.
    effect((onCleanup) => {
      const surface = this.surfaceIfReady()?.nativeElement;
      if (!surface) return;
      const observer = new ResizeObserver(([entry]) => this.#size.set({ width: entry.contentRect.width, height: entry.contentRect.height }));
      observer.observe(surface);
      onCleanup(() => observer.disconnect());
    });
    // Others see what this person has selected and which note they're writing in.
    effect(() => this.presence()?.setSelection(this.selection()));
    effect(() => {
      const selection = this.selection();
      const board = this.board();
      const notes = board.notes().filter((n) => selection.has(n.id)).map((n) => n.id);
      const frames = board.frames().filter((f) => selection.has(f.id));
      this.selectionChange.emit([...new Set([...notes, ...untracked(() => board.notesIn(frames.map((f) => f.id)))])]);
      this.framesChange.emit(frames.map((f) => f.title || 'Untitled frame'));
      this.selectedIds.emit([...selection]);
    });
    effect(() => {
      const input = this.renameInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
    effect(() => {
      const input = this.labelInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
    effect(() => this.presence()?.setEditing(this.editing()));
    effect(() => {
      const { x, y, zoom } = this.viewport();
      const surface = this.surfaceIfReady()?.nativeElement;
      if (!surface) return;
      const { width, height } = surface.getBoundingClientRect();
      this.viewChange.emit({ cx: (width / 2 - x) / zoom, cy: (height / 2 - y) / zoom, zoom });
    });

    effect(() => {
      const ids = this.#framesInView();
      this.framesInView.emit(ids ? ids.split(' ') : []);
    });

    // Something that's gone – deleted by someone else, or by undo – can't stay selected or open here. Anything that can
    // be selected counts: notes, frames, images, files and arrows.
    effect(() => {
      const board = this.board();
      const ids = new Set([...board.notes(), ...board.frames(), ...board.media(), ...board.items(), ...board.connectors()].map((n) => n.id));
      const editing = this.editing();
      if (editing && !ids.has(editing)) this.editing.set(null);
      const renaming = this.renaming();
      if (renaming && !ids.has(renaming)) this.renaming.set(null);
      const selection = untracked(this.selection);
      if ([...selection].some((id) => !ids.has(id))) this.selection.set(new Set([...selection].filter((id) => ids.has(id))));
    });

    effect((onCleanup) => {
      const editor = this.editor();
      if (!editor) {
        this.formatAnchor.set(null);
        return;
      }
      const sync = () => {
        // Kept open while focus is in the bar itself (its highlight menu takes focus), so the pick lands.
        const inBar = !!document.activeElement?.closest('tc-selection-toolbar');
        if (inBar) return;
        this.formatAnchor.set(editor.state.selection.empty || !editor.isFocused ? null : selectionRect());
        this.pressed.set([
          ...MARKS.filter((m) => editor.isActive(m)),
          ...(editor.isActive('bulletList') ? ['bullets'] : []),
          ...(editor.isActive('orderedList') ? ['numbers'] : []),
          ...(editor.isActive('codeBlock') ? ['codeBlock'] : []),
        ]);
        this.values.set({ highlight: editor.isActive('highlight') ? String(editor.getAttributes('highlight')['color'] ?? 'yellow') : 'none' });
      };
      editor.on('transaction', sync);
      editor.on('selectionUpdate', sync);
      onCleanup(() => {
        editor.off('transaction', sync);
        editor.off('selectionUpdate', sync);
      });
    });
  }

  // ── Pointer ──────────────────────────────────────────────────────────

  protected onPointerDown(e: PointerEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('.toolbar') || target.closest('.item-editor, .cell-input')) return;
    // Inside a placed view, the pointer works the view (drag a point, a card); its title bar moves it.
    if (target.closest('.view-body')) return;
    // With the pen, a drag on the board draws.
    if (this.pen() && e.button === 0 && !this.spaceHeld() && !this.readOnly()) {
      const p = toWorld(this.viewport(), this.#screenPoint(e));
      this.#gesture = { kind: 'draw', points: [p.x, p.y] };
      this.draft.set([p.x, p.y]);
      return;
    }
    // An armed tool: a click places its thing there, a drag sizes it.
    const tool = this.tool();
    if (PLACING.has(tool) && e.button === 0 && !this.spaceHeld() && !this.readOnly()) {
      const p = toWorld(this.viewport(), this.#screenPoint(e));
      this.#gesture = { kind: 'place', tool: tool as PlacingTool, start: p };
      this.marquee.set({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    // Pinning a comment: the click on the image says where.
    const commenting = tool === 'comment' && this.canReact();
    const pinImage = this.pinning() || commenting ? target.closest<HTMLElement>('[data-media-id]') : null;
    if (pinImage && e.button === 0) {
      const r = pinImage.getBoundingClientRect();
      const anchor = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
      this.pinning.set(false);
      this.tool.set('select');
      this.pinPlaced.emit({ nodeId: `${pinImage.dataset['mediaId']}@${crypto.randomUUID()}`, anchor });
      return;
    }
    if (target.closest('.image-pin')) return;
    const noteEl = target.closest<HTMLElement>('app-note, .note-far, [data-media-id], [data-item-id]');
    // A frame is grabbed anywhere on it (a note can cover its title). Shift-drag inside one boxes notes instead.
    const frameEl = noteEl ? null : target.closest<HTMLElement>('.frame');
    const onFrameBody = !!frameEl && !target.closest('.frame-title, .frame-resize');
    const frameId = frameEl && !(onFrameBody && e.shiftKey) ? frameEl.dataset['frameId'] : undefined;
    const id = noteEl?.dataset['noteId'] ?? noteEl?.dataset['mediaId'] ?? noteEl?.dataset['itemId'] ?? frameId;
    const itemId = noteEl?.dataset['itemId'];
    // The comment tool opens the comments on whatever's clicked.
    if (commenting && e.button === 0) {
      if (id) {
        e.preventDefault();
        this.pinOpen.emit(id);
        this.tool.set('select');
      }
      return;
    }
    // The arrow tool: the first click picks where it starts, the second where it ends.
    if (tool === 'connect' && e.button === 0 && !this.readOnly()) {
      const from = this.#connectFrom();
      if (!id) {
        this.#connectFrom.set(null);
        return;
      }
      if (!from || from === id) {
        this.#connectFrom.set(id);
        this.selection.set(new Set([id]));
        return;
      }
      const arrow = this.board().connect(from, id, this.arrowStyle());
      this.#connectFrom.set(null);
      this.tool.set('select');
      if (arrow) this.selection.set(new Set([arrow]));
      return;
    }
    if (itemId && itemId === this.itemEditing()?.id) return;
    // Inside the note being edited, the pointer is the editor's; so is the title being renamed.
    if (id && id === this.editing()) return;
    if (target.closest('.toolbar') || target.closest('.frame-rename') || target.closest('.arrow-label-input') || target.closest('.note-votes') || target.closest('.note-reactions')) return;
    // An arrow is picked by clicking its line; it never drags.
    const connectorId = target.closest<SVGElement>('[data-connector-id]')?.dataset['connectorId'];
    if (connectorId && e.button === 0) {
      const next = e.shiftKey ? new Set(this.selection()) : new Set<string>();
      if (next.has(connectorId)) next.delete(connectorId);
      else next.add(connectorId);
      this.selection.set(next);
      return;
    }

    // Moves and releases are followed on the window (see below) rather than by capturing the pointer, which would
    // retarget the double-click that opens a note.
    const screen = this.#screenPoint(e);

    if (e.button === 1 || this.spaceHeld()) {
      e.preventDefault();
      this.#gesture = { kind: 'pan', last: screen };
      this.panning.set(true);
      return;
    }
    if (e.button !== 0) return;
    this.editing.set(null);

    if (itemId && target.closest('.item-resize') && !this.readOnly() && !this.board().locked().has(itemId)) {
      const item = this.board().items().find((i) => i.id === itemId)!;
      this.board().undo.stopCapturing();
      this.#gesture = { kind: 'resize', id: itemId, start: screen, size: { w: item.w, h: item.h }, item: true };
      return;
    }
    if (frameId && target.closest('.frame-resize') && !this.readOnly() && !this.board().locked().has(frameId)) {
      const frame = this.board().frames().find((f) => f.id === frameId)!;
      this.board().undo.stopCapturing();
      this.#gesture = { kind: 'resize', id: frameId, start: screen, size: { w: frame.w, h: frame.h } };
      return;
    }

    if (id) {
      const selected = this.selection();
      if (e.shiftKey) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        this.selection.set(next);
        if (!next.has(id)) return;
      } else if (!selected.has(id)) {
        this.selection.set(new Set([id]));
      }
      // Frames carry the frames and notes inside them.
      const frames = this.board().withInnerFrames(this.board().frames().filter((f) => this.selection().has(f.id)).map((f) => f.id));
      const ids = new Set([...this.selection(), ...frames, ...this.board().notesIn(frames)]);
      // Without edit rights, or with anything locked, a click selects but nothing moves.
      if (this.readOnly() || [...ids].some((x) => this.board().locked().has(x))) return;
      this.board().undo.stopCapturing();
      // What the dragged things can line up with: everything else in view.
      const boxes = boardBoxes(this.board());
      const moving = boxes.filter((b) => ids.has(b.id));
      const box = moving.length ? rectAround(moving) : null;
      const view = this.#viewRect();
      const others = boxes.filter((b) => !ids.has(b.id) && intersects(view, b));
      this.#gesture = { kind: 'drag', last: screen, moved: false, ids, start: screen, applied: { x: 0, y: 0 }, box, others };
      return;
    }

    // On the empty board with nothing selected, a drag moves the view; with something selected (or with shift), it
    // draws a box to select with.
    if (this.selection().size === 0 && !e.shiftKey) {
      // No text selection across the page as it drags; the board still takes focus, for its keys.
      e.preventDefault();
      this.surface().nativeElement.focus({ preventScroll: true });
      this.#gesture = { kind: 'pan', last: screen };
      this.panning.set(true);
      return;
    }
    const start = toWorld(this.viewport(), screen);
    const base = e.shiftKey ? new Set(this.selection()) : new Set<string>();
    this.selection.set(base);
    this.#gesture = { kind: 'marquee', start, base };
  }

  @HostListener('window:pointermove', ['$event'])
  protected onPointerMove(e: PointerEvent): void {
    const screen = this.#screenPoint(e);
    this.#sharePointer(e, screen);
    const g = this.#gesture;
    if (!g) return;
    if (g.kind === 'pan') {
      this.viewport.update((v) => ({ ...v, x: v.x + screen.x - g.last.x, y: v.y + screen.y - g.last.y }));
      g.last = screen;
    } else if (g.kind === 'drag') {
      const zoom = this.viewport().zoom;
      const raw = { x: (screen.x - g.start.x) / zoom, y: (screen.y - g.start.y) / zoom };
      // Edges and centres snap to others' within a few pixels on screen; Alt drags freely.
      const s = g.box && !e.altKey ? snap({ ...g.box, x: g.box.x + raw.x, y: g.box.y + raw.y }, g.others, 6 / zoom) : { dx: 0, dy: 0, guides: [] };
      const target = { x: raw.x + s.dx, y: raw.y + s.dy };
      this.board().move(g.ids, target.x - g.applied.x, target.y - g.applied.y);
      g.applied = target;
      this.guides.set(s.guides);
      g.last = screen;
      g.moved = true;
    } else if (g.kind === 'resize') {
      const zoom = this.viewport().zoom;
      const w = g.size.w + (screen.x - g.start.x) / zoom;
      const h = g.size.h + (screen.y - g.start.y) / zoom;
      if (g.item) this.board().resizeItem(g.id, w, h);
      else this.board().resizeFrame(g.id, w, h);
    } else if (g.kind === 'place') {
      this.marquee.set(rectFrom(g.start, toWorld(this.viewport(), screen)));
    } else if (g.kind === 'draw') {
      const p = toWorld(this.viewport(), screen);
      const [lx, ly] = g.points.slice(-2);
      // A point every couple of pixels on screen is plenty.
      if (Math.hypot(p.x - lx, p.y - ly) * this.viewport().zoom < 2) return;
      g.points.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
      this.draft.set([...g.points]);
    } else {
      const rect = rectFrom(g.start, toWorld(this.viewport(), screen));
      this.marquee.set(rect);
      // Notes the box touches (not those folded away), and frames it takes in whole.
      const hidden = this.board().hiddenNotes();
      const hit = [
        ...this.board()
          .notes()
          .filter((n) => !hidden.has(n.id) && intersects(rect, n))
          .map((n) => n.id),
        ...this.board()
          .frames()
          .filter((f) => contains(rect, f))
          .map((f) => f.id),
        ...[...this.board().media(), ...this.board().items()].filter((m) => intersects(rect, m)).map((m) => m.id),
      ];
      this.selection.set(new Set([...g.base, ...hit]));
    }
  }

  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  protected onPointerUp(): void {
    if (this.#gesture?.kind === 'draw') {
      const id = this.board().addDrawing(this.#gesture.points, this.penStyle());
      this.draft.set(null);
      if (id) this.board().undo.stopCapturing();
    }
    if (this.#gesture?.kind === 'place') {
      const box = this.marquee();
      this.marquee.set(null);
      if (box) this.#placeWith(this.#gesture.tool, box);
      this.tool.set('select');
    }
    if ((this.#gesture?.kind === 'drag' && this.#gesture.moved) || this.#gesture?.kind === 'resize') this.board().undo.stopCapturing();
    this.#gesture = undefined;
    this.guides.set([]);
    this.marquee.set(null);
    this.panning.set(false);
  }

  protected onDoubleClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.view-body, .arrow-label-input')) return;
    // An arrow opens its words to write.
    const arrowId = (e.target as Element).closest<HTMLElement | SVGElement>('[data-connector-id]')?.dataset['connectorId'];
    if (arrowId) {
      this.#labelArrow(arrowId);
      return;
    }
    // A link card opens its page, for anyone; a shape, text or cell opens to write in.
    const itemEl = (e.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
    if (itemEl) {
      const item = this.board().items().find((i) => i.id === itemEl.dataset['itemId']);
      if (item?.kind === 'link' && safeUrl(item.url) !== '#') window.open(item.url, '_blank', 'noopener,noreferrer');
      else if (item?.kind === 'diagram' && !this.readOnly() && this.can('diagrams')) this.editDiagram.emit(item.id);
      else if (item?.kind === 'chart' && !this.readOnly() && this.can('charts')) this.editChart.emit(item.id);
      else if (item?.kind === 'shape' || item?.kind === 'text') this.#editItem(item.id);
      else if (item?.kind === 'table') {
        const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')?.dataset['cell'];
        if (cell) this.#editItem(item.id, cell);
      }
      return;
    }
    // An image or file opens on double-click; see the media element's own handler.
    if (this.readOnly() || (e.target as HTMLElement).closest('[data-media-id]')) return;
    const frameId = (e.target as HTMLElement).closest('.frame-title')?.closest<HTMLElement>('.frame')?.dataset['frameId'];
    if (frameId) {
      this.#rename(frameId);
      return;
    }
    if ((e.target as HTMLElement).closest('.frame-rename')) return;
    const id = (e.target as HTMLElement).closest<HTMLElement>('app-note, .note-far')?.dataset['noteId'];
    if (id) {
      if (id !== this.editing()) this.#edit(id);
      return;
    }
    if ((e.target as HTMLElement).closest('.toolbar')) return;
    const at = toWorld(this.viewport(), this.#screenPoint(e));
    this.#edit(this.board().addNote(at.x, at.y));
  }

  protected onWheel(e: WheelEvent): void {
    if ((e.target as HTMLElement).closest('app-note.editing')) return;
    // Scrolling inside a view scrolls the view; pinching still zooms the board.
    if ((e.target as HTMLElement).closest('.view-body') && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Pinch gestures arrive as Ctrl + wheel.
      const v = this.viewport();
      this.viewport.set(zoomAt(v, v.zoom * Math.exp(-e.deltaY * 0.01), this.#screenPoint(e)));
    } else {
      this.viewport.update((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  }

  // ── Keyboard ─────────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  protected onKeyDown(e: KeyboardEvent): void {
    // Keys inside a placed view are the view's (arrow keys move a matrix point; Delete isn't the board's).
    if ((e.target as HTMLElement | null)?.closest?.('.view-body')) return;
    const mod = e.metaKey || e.ctrlKey;
    // Writing in a note: Tab starts the next one beside it, ⌘/Ctrl Enter the next one below (Tab in a list still indents).
    const writing = this.editing();
    if (writing && !this.readOnly()) {
      const inList = !!this.editor()?.isActive('bulletList') || !!this.editor()?.isActive('orderedList');
      // In a mind map, Tab adds a branch under this one and ⌘/Ctrl Enter one beside it.
      const inMap = !!this.board().notes().find((n) => n.id === writing)?.mind;
      if (e.key === 'Tab' && !e.shiftKey && !inList) {
        e.preventDefault();
        if (inMap) this.#addBranch(writing, 'child');
        else this.#addNext(writing, 'right');
        return;
      }
      if (e.key === 'Enter' && mod) {
        e.preventDefault();
        if (inMap) this.#addBranch(writing, 'sibling');
        else this.#addNext(writing, 'down');
        return;
      }
    }
    if (!isEditable(e.target) && !this.readOnly() && this.selection().size) {
      // ⌘/Ctrl C and X: copy, or copy and delete, what's selected (⌘/Ctrl V pastes it: see onPaste).
      if (mod && !e.shiftKey && !e.altKey && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
        e.preventDefault();
        this.#copySelection(e.key.toLowerCase() === 'x');
        return;
      }
      // ⌘/Ctrl ] and [: forward and backward; with Shift, to the front and back.
      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault();
        const up = e.code === 'BracketRight';
        this.restack(e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward');
        return;
      }
      // ⌘/Ctrl D: a copy beside; Alt + arrow: a copy of one note on that side.
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const copies = this.board().duplicate(this.selection(), 24, 24);
        this.selection.set(new Set(copies));
        return;
      }
      const sides: Record<string, 'right' | 'left' | 'down' | 'up'> = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up' };
      const side = sides[e.key];
      if (e.altKey && side && this.selection().size === 1) {
        const [id] = this.selection();
        const note = this.board().notes().find((n) => n.id === id);
        if (note) {
          e.preventDefault();
          const gap = 24;
          const dx = side === 'right' ? note.w + gap : side === 'left' ? -(note.w + gap) : 0;
          const dy = side === 'down' ? note.h + gap : side === 'up' ? -(note.h + gap) : 0;
          const [copy] = this.board().duplicate([id], dx, dy);
          this.selection.set(new Set([copy]));
          this.#reveal(copy);
          return;
        }
      }
    }
    if (e.key === 'Escape' && this.editing()) {
      this.editing.set(null);
      // Back to the board, so the keyboard carries on from here.
      this.surface().nativeElement.focus({ preventScroll: true });
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (!this.finding()) this.toggleFind();
      else this.surface().nativeElement.parentElement?.querySelector<HTMLInputElement>('[data-find-autofocus]')?.focus();
      return;
    }
    // Keys on the board itself (it has focus): adding, stepping through and moving things without a mouse.
    if (e.target === this.surface().nativeElement && !mod) {
      if (e.key === 'Tab') {
        e.preventDefault();
        // One note of a mind map selected: Tab adds a branch to it.
        const [one, more] = this.selection();
        if (!e.shiftKey && one && !more && !this.readOnly() && this.board().notes().find((n) => n.id === one)?.mind) this.#addBranch(one, 'child');
        else this.#tabTo(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key.startsWith('Arrow') && this.selection().size && !this.readOnly()) {
        e.preventDefault();
        const step = e.shiftKey ? 50 : 10;
        const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
        this.#nudge(dx, dy);
        return;
      }
      if (e.key.toLowerCase() === 'n' && !this.readOnly()) {
        e.preventDefault();
        this.addNote();
        return;
      }
    }
    if (e.key === 'Escape' && this.pinning()) {
      this.pinning.set(false);
      return;
    }
    if (e.key === 'Escape' && this.tool() !== 'select' && !isEditable(e.target)) {
      this.pickTool('select');
      return;
    }
    if (isEditable(e.target)) return;
    if (e.shiftKey && e.code === 'Digit1' && !mod) {
      e.preventDefault();
      this.fitAll();
      return;
    }
    // V, T, R, O, F, P, L and C pick a tool, as the rail's tooltips say.
    const toolKey = !mod && !e.altKey && !e.shiftKey ? TOOL_KEYS[e.key.toLowerCase()] : undefined;
    if (toolKey && (!this.readOnly() || (toolKey === 'comment' && this.canReact()) || toolKey === 'select')) {
      e.preventDefault();
      this.pickTool(toolKey);
      return;
    }
    // Of the shortcuts, only selecting and panning are for people who can't edit.
    const editing = (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter' || (mod && ['z', 'y'].includes(e.key.toLowerCase())));
    if (this.readOnly() && editing) return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.spaceHeld.set(true);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection().size > 0) {
      e.preventDefault();
      this.deleteSelection();
    } else if (e.key === 'Escape') {
      this.selection.set(new Set());
    } else if (e.key === 'Enter' && this.selection().size === 1) {
      e.preventDefault();
      const [id] = this.selection();
      const item = this.board().items().find((i) => i.id === id);
      if (this.board().frames().some((f) => f.id === id)) this.#rename(id);
      else if (this.board().connectors().some((c) => c.id === id)) this.#labelArrow(id);
      else if (item?.kind === 'shape' || item?.kind === 'text') this.#editItem(id);
      else if (item?.kind === 'table') this.#editItem(id, '0:0');
      else if (!item) this.#edit(id);
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.board().undo.redo();
      else this.board().undo.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.board().undo.redo();
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.selection.set(new Set([...this.board().frames(), ...this.board().notes()].map((n) => n.id)));
    }
  }

  @HostListener('document:keyup', ['$event'])
  protected onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') this.spaceHeld.set(false);
  }

  @HostListener('window:blur')
  protected onBlur(): void {
    this.spaceHeld.set(false);
  }

  // ── Toolbar ──────────────────────────────────────────────────────────

  addNote(): void {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    // A little off-centre each time, so repeated adds don't stack exactly.
    const jitter = () => (Math.random() - 0.5) * 60;
    const at = toWorld(this.viewport(), { x: width / 2 + jitter(), y: height / 2 + jitter() });
    this.#edit(this.board().addNote(at.x, at.y));
  }

  /** Selects exactly these (an empty list clears the selection). */
  select(ids: readonly string[]): void {
    this.editing.set(null);
    this.selection.set(new Set(ids));
  }

  /** Looks where a presenter is looking: the same middle and zoom, on this screen. */
  lookAt(view: PresentedView): void {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const zoom = clampZoom(view.zoom);
    this.viewport.set({ zoom, x: width / 2 - view.cx * zoom, y: height / 2 - view.cy * zoom });
  }

  /** A note's vote controls or count: while voting, every note gets them. */
  protected votesFor(id: string): NoteVotes | null {
    return this.noteVotes().get(id) ?? (this.voting() ? NO_VOTES_YET : null);
  }

  /** Brings everything on the board into view, zoomed to fit (never past 100%), selecting nothing. */
  fitAll(): void {
    const items = boardBoxes(this.board());
    if (items.length) this.#fit(items);
  }

  /** Brings these notes, frames, images or files into view, zoomed to fit (never past 100%), selecting them unless told not to. */
  show(ids: readonly string[], select = true): void {
    const notes = boardBoxes(this.board()).filter((n) => ids.includes(n.id));
    if (notes.length === 0) return;
    this.editing.set(null);
    if (select) this.selection.set(new Set(notes.map((n) => n.id)));
    this.#fit(notes);
  }

  /** A frame as a slide: filling the screen (up to twice its size), clear of the slide bar below. */
  showSlide(id: string): void {
    const frame = this.board().frames().find((f) => f.id === id);
    if (!frame) return;
    this.editing.set(null);
    this.selection.set(new Set());
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const zoom = clampZoom(Math.min(2, (width - 48) / frame.w, (height - 112) / frame.h));
    this.viewport.set({ zoom, x: width / 2 - (frame.x + frame.w / 2) * zoom, y: (height - 64) / 2 - (frame.y + frame.h / 2) * zoom });
  }

  #fit(notes: readonly { x: number; y: number; w: number; h: number }[]): void {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const box = {
      x: Math.min(...notes.map((n) => n.x)),
      y: Math.min(...notes.map((n) => n.y)),
      r: Math.max(...notes.map((n) => n.x + n.w)),
      b: Math.max(...notes.map((n) => n.y + n.h)),
    };
    // Room around them, and below for the toolbar.
    const zoom = clampZoom(Math.min(1, (width - 160) / (box.r - box.x), (height - 220) / (box.b - box.y)));
    this.viewport.set({ zoom, x: width / 2 - ((box.x + box.r) / 2) * zoom, y: (height - 80) / 2 - ((box.y + box.b) / 2) * zoom });
  }

  /**
   * Writes a note beside these notes (or in the middle of the view), in the first free space to their right, selects it
   * and returns its id.
   */
  addNoteBeside(ids: readonly string[], text: string): string {
    const notes = this.board().notes();
    const near = notes.filter((n) => ids.includes(n.id));
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const start = near.length
      ? { x: Math.max(...near.map((n) => n.x + n.w)) + 40, y: Math.min(...near.map((n) => n.y)) }
      : (({ x, y }) => ({ x: x - NOTE_SIZE.w / 2, y: y - NOTE_SIZE.h / 2 }))(toWorld(this.viewport(), { x: width / 2, y: height / 2 }));
    let spot = start;
    for (let i = 0; i < 50 && notes.some((n) => intersects(n, { ...spot, ...NOTE_SIZE })); i++) {
      spot = { x: start.x + (i + 1) * (NOTE_SIZE.w + 24), y: start.y };
    }
    const id = this.board().addNote(spot.x + NOTE_SIZE.w / 2, spot.y + NOTE_SIZE.h / 2, 'blue', text);
    this.show([id, ...near.map((n) => n.id)]);
    this.selection.set(new Set([id]));
    return id;
  }

  /** "Delete 2 notes and a frame" – what the Delete button removes. A frame goes without its notes. */
  protected readonly deleteLabel = computed(() => {
    const selection = this.selection();
    const notes = this.board().notes().filter((n) => selection.has(n.id)).length;
    const frames = this.board().frames().filter((f) => selection.has(f.id)).length;
    const arrows = this.board().connectors().filter((c) => selection.has(c.id)).length;
    const parts = [
      notes ? `${notes} note${notes === 1 ? '' : 's'}` : '',
      frames ? `${frames} frame${frames === 1 ? '' : 's'}` : '',
      arrows ? `${arrows} arrow${arrows === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    return parts.length ? `Delete ${parts.join(' and ')}` : 'Delete selected';
  });

  // ── Arrows ───────────────────────────────────────────────────────────

  /** The two notes or frames selected, in the order they were picked, when exactly two are. */
  protected readonly pair = computed(() => {
    const ids = new Set([...this.board().notes(), ...this.board().frames(), ...this.board().items(), ...this.board().media()].map((n) => n.id));
    const picked = [...this.selection()].filter((id) => ids.has(id));
    return picked.length === 2 ? (picked as [string, string]) : null;
  });

  /** Arrows as lines from the edge of one box to the edge of the other, aimed at their centres. */
  protected readonly arrows = computed(() => {
    // Arrows into a folded branch go with it.
    const hidden = this.board().hiddenNotes();
    const gone = new Set(this.board().connectors().filter((c) => hidden.has(c.from) || hidden.has(c.to)).map((c) => c.id));
    return arrowLines(this.board())
      .filter((a) => !gone.has(a.id))
      .map((line) => ({
        id: line.id,
        d: line.d,
        weight: line.style.weight,
        dashes: dashPattern(line.style).join(' ') || null,
        heads: arrowHeads(line),
        // The marks at the ends stay fine on a heavy line.
        headWeight: Math.min(line.style.weight, 2),
        mid: line.mid,
        label: line.label,
      }));
  });
  protected readonly maxArrowLabel = MAX_ARROW_LABEL;
  /** The arrow whose words are being written, if any. */
  protected readonly labelling = signal<string | null>(null);
  private readonly labelInput = viewChild<ElementRef<HTMLInputElement>>('labelInput');

  /** Opens the one selected arrow's words to write. */
  protected labelSelectedArrow(): void {
    const [id] = this.selectedArrows();
    if (id) this.#labelArrow(id);
  }

  #labelArrow(id: string): void {
    if (this.readOnly() || this.board().locked().has(id)) return;
    this.editing.set(null);
    this.selection.set(new Set([id]));
    this.labelling.set(id);
  }

  protected finishLabel(id: string, input: HTMLInputElement, keep: boolean): void {
    if (this.labelling() !== id) return;
    this.labelling.set(null);
    if (keep) this.board().setArrowLabel(id, input.value);
  }

  protected onLabelKey(id: string, e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Enter') this.finishLabel(id, e.target as HTMLInputElement, true);
    else if (e.key === 'Escape') this.finishLabel(id, e.target as HTMLInputElement, false);
  }

  /** The style the next arrows get: what was picked last, for the tool or a selected arrow. */
  readonly arrowStyle = signal<ArrowStyle>(DEFAULT_ARROW);

  /** Picks the arrow tool with a route, from the shapes menu. */
  protected pickArrow(route: ArrowRoute): void {
    this.arrowStyle.update((s) => ({ ...s, route }));
    this.pickTool('connect');
  }

  protected restyleArrows(change: Partial<ArrowStyle>): void {
    this.board().setArrowStyle(this.selectedArrows(), change);
    this.arrowStyle.update((s) => ({ ...s, ...change }));
  }

  /** The arrows selected, for their style bar. */
  protected readonly selectedArrows = computed(() => this.board().connectors().filter((c) => this.selection().has(c.id)).map((c) => c.id));
  /** The style bar over a selected arrow: at the middle of the first one, in screen space, with its style. */
  protected readonly arrowBar = computed(() => {
    const [id] = this.selectedArrows();
    if (!id || this.readOnly() || this.marquee()) return null;
    const line = arrowLines(this.board()).find((a) => a.id === id);
    if (!line) return null;
    const { x, y, zoom } = this.viewport();
    return {
      left: line.mid.x * zoom + x,
      top: Math.max(8, Math.min(line.start.y, line.end.y, line.mid.y - 12) * zoom + y - 56),
      style: line.style,
      label: line.label,
    };
  });

  /** Draws an arrow from the first selected note or frame to the second. */
  protected connect(): void {
    const pair = this.pair();
    if (!pair) return;
    const id = this.board().connect(pair[0], pair[1], this.arrowStyle());
    if (id) this.selection.set(new Set([id]));
  }

  // ── Images and files ─────────────────────────────────────────────────

  protected readonly fileSize = fileSize;
  /** The one image selected, for asking about it. */
  protected readonly oneImage = computed(() => {
    const [id] = this.selection();
    return this.selection().size === 1 ? (this.board().media().find((m) => m.id === id && m.kind === 'image') ?? null) : null;
  });

  protected onDragOver(e: DragEvent): void {
    if (!this.readOnly() && this.can('files') && e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDrop(e: DragEvent): void {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (this.readOnly() || !this.can('files') || !files.length) return;
    e.preventDefault();
    this.filesDropped.emit({ files, at: toWorld(this.viewport(), this.#screenPoint(e)) });
  }

  /** The middle of what's in view, in board coordinates, for placing things. */
  viewCentre(): Point {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    return toWorld(this.viewport(), { x: width / 2, y: height / 2 });
  }

  protected readonly reactionChoices = REACTIONS;
  protected readonly reactionLook = reactionLook;
  /** The one note selected, for reacting to it from the toolbar. */
  protected readonly oneNote = computed(() => {
    const [id] = this.selection();
    return this.selection().size === 1 && this.board().notes().some((n) => n.id === id) ? id : null;
  });

  protected toggleReaction(nodeId: string, emoji: string): void {
    const mine = this.reactions().get(nodeId)?.find((r) => r.emoji === emoji)?.mine ?? false;
    this.react.emit({ nodeId, emoji, on: !mine });
  }

  #copySelection(cut: boolean): void {
    const board = this.board();
    const clip = board.copyOut(this.selection());
    if (!clip) return;
    // Plain text for pasting elsewhere; pasting it back here brings the things themselves.
    const text = clip.ids.map((id) => describeThing(board, id)).join('\n');
    const entry = { clip, text: text as string | null, pastes: 0 };
    clipboard = entry;
    navigator.clipboard?.writeText(text).catch(() => (entry.text = null));
    const what = clip.ids.length === 1 ? describeThing(board, clip.ids[0]) : `${clip.ids.length} things`;
    if (cut) this.deleteSelection();
    // A cut that deleteSelection refused (something locked) has said why already.
    if (!cut || this.selection().size === 0) this.announcement.set(`${cut ? 'Cut' : 'Copied'} ${what}`);
  }

  /** ⌘/Ctrl V: what was copied on the board, beside the originals if they're in view, else in the middle of the view. */
  @HostListener('document:paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    if (!clipboard || this.readOnly() || isEditable(e.target)) return;
    // Something else was copied since (here or in another app): leave that paste alone.
    const pasted = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n/g, '\n');
    if (clipboard.text !== null ? pasted !== clipboard.text : pasted !== '') return;
    e.preventDefault();
    const { clip } = clipboard;
    const board = this.board();
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const view = rectFrom(toWorld(this.viewport(), { x: 0, y: 0 }), toWorld(this.viewport(), { x: width, y: height }));
    let dx: number;
    let dy: number;
    if (clip.from === board && contains(view, clip.box)) {
      dx = dy = 24 * ++clipboard.pastes;
    } else {
      const at = this.#viewCentre();
      dx = Math.round(at.x - (clip.box.x + clip.box.w / 2));
      dy = Math.round(at.y - (clip.box.y + clip.box.h / 2));
    }
    const copies = board.paste(clip, dx, dy);
    if (!copies.length) {
      this.announcement.set('Files and apps can only be pasted on the board they were added to.');
      return;
    }
    this.selection.set(new Set(copies));
    this.announcement.set(copies.length === 1 ? `Pasted ${describeThing(board, copies[0])}` : `Pasted ${copies.length} things`);
  }

  protected deleteSelection(): void {
    if ([...this.selection()].some((id) => this.board().locked().has(id))) {
      this.announcement.set('Locked things can’t be deleted. Unlock them first.');
      return;
    }
    if (this.selection().size === 0) return;
    this.editing.set(null);
    this.renaming.set(null);
    this.board().remove(this.selection());
    this.selection.set(new Set());
  }

  /** Adds a frame around the selected notes, or an empty one in the middle of the view, and names it. */
  protected addFrame(): void {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const at = toWorld(this.viewport(), { x: width / 2, y: height / 2 });
    const around = this.board().notes().filter((n) => this.selection().has(n.id));
    this.#rename(this.board().addFrame(at.x, at.y, around));
  }

  protected finishRename(id: string, input: HTMLInputElement, keep: boolean): void {
    if (this.renaming() !== id) return;
    this.renaming.set(null);
    if (keep) this.board().renameFrame(id, input.value.trim());
  }

  protected onRenameKey(id: string, e: KeyboardEvent): void {
    if (e.key === 'Enter') this.finishRename(id, e.target as HTMLInputElement, true);
    else if (e.key === 'Escape') this.finishRename(id, e.target as HTMLInputElement, false);
  }

  protected setColor(color: NoteColor): void {
    this.#noteColor.set(color);
    this.board().setColor(this.selection(), color);
  }

  protected zoomBy(factor: number): void {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const v = this.viewport();
    this.viewport.set(zoomAt(v, v.zoom * factor, { x: width / 2, y: height / 2 }));
  }

  // ── Minimap ──────────────────────────────────────────────────────────

  /** The surface's size, kept current, for the minimap's view box. */
  readonly #size = signal({ width: 0, height: 0 });
  protected readonly minimapOpen = signal(false);
  protected readonly keysOpen = signal(false);
  /** The keyboard shortcuts, as the bottom-right panel lists them. */
  protected readonly shortcuts = [
    { label: 'Select', keys: 'V' },
    { label: 'Sticky note', keys: 'N' },
    { label: 'Text', keys: 'T' },
    { label: 'Rectangle', keys: 'R' },
    { label: 'Oval', keys: 'O' },
    { label: 'Arrow', keys: 'L' },
    { label: 'Pen', keys: 'P' },
    { label: 'Frame', keys: 'F' },
    { label: 'Comment', keys: 'C' },
    { label: 'Put the tool down', keys: 'Esc' },
    { label: 'Search and commands', keys: `${this.modKey}K` },
    { label: 'Find on this board', keys: `${this.modKey}F` },
    { label: 'Undo', keys: `${this.modKey}Z` },
    { label: 'Redo', keys: `⇧${this.modKey}Z` },
    { label: 'Copy, cut, paste', keys: `${this.modKey}C ${this.modKey}X ${this.modKey}V` },
    { label: 'Duplicate', keys: `${this.modKey}D` },
    { label: 'Bring forward', keys: `${this.modKey}]` },
    { label: 'Bring to front', keys: `⇧${this.modKey}]` },
    { label: 'Send backward', keys: `${this.modKey}[` },
    { label: 'Send to back', keys: `⇧${this.modKey}[` },
    { label: 'Fit everything', keys: '⇧1' },
    { label: 'Pan', keys: 'Space + drag' },
  ];
  /** Everything on the board and what's in view, in a small box: frames as outlines, notes as dots of their colour. */
  protected readonly minimap = computed(() => {
    const board = this.board();
    const content = boardBounds(board, 80);
    const { x, y, zoom } = this.viewport();
    const { width, height } = this.#size();
    const view = { x: -x / zoom, y: -y / zoom, w: width / zoom, h: height / zoom };
    if (!content || !width) return null;
    const box = {
      x: Math.min(content.x, view.x),
      y: Math.min(content.y, view.y),
      r: Math.max(content.x + content.w, view.x + view.w),
      b: Math.max(content.y + content.h, view.y + view.h),
    };
    return {
      viewBox: `${box.x} ${box.y} ${box.r - box.x} ${box.b - box.y}`,
      stroke: (box.r - box.x) / 200,
      frames: board.frames(),
      media: board.media(),
      items: board.items(),
      notes: board.notes(),
      view,
    };
  });

  /** Clicking or dragging on the minimap centres the view there. */
  protected onMinimap(e: PointerEvent): void {
    if (e.type === 'pointermove' && !(e.buttons & 1)) return;
    const svg = e.currentTarget as SVGSVGElement;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const world = point.matrixTransform(svg.getScreenCTM()!.inverse());
    const { width, height } = this.#size();
    const zoom = this.viewport().zoom;
    this.viewport.set({ zoom, x: width / 2 - world.x * zoom, y: height / 2 - world.y * zoom });
    e.preventDefault();
  }

  protected resetZoom(): void {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    this.viewport.set(zoomAt(this.viewport(), 1, { x: width / 2, y: height / 2 }));
  }

  protected onFormat(e: CustomEvent<SelectionToolbarCommand>): void {
    const editor = this.editor();
    if (!editor) return;
    const chain = editor.chain().focus();
    const { id, value } = e.detail;
    if (id === 'bold') chain.toggleBold().run();
    else if (id === 'italic') chain.toggleItalic().run();
    else if (id === 'strike') chain.toggleStrike().run();
    else if (id === 'code') chain.toggleCode().run();
    else if (id === 'bullets') chain.toggleBulletList().run();
    else if (id === 'numbers') chain.toggleOrderedList().run();
    else if (id === 'codeBlock') chain.toggleCodeBlock().run();
    else if (id === 'math') {
      // What's selected becomes maths; with nothing selected, an empty $$ to type into.
      const { from, to, empty } = editor.state.selection;
      const latex = editor.state.doc.textBetween(from, to, ' ').trim();
      if (!empty && latex) chain.insertContentAt({ from, to }, { type: 'math', attrs: { latex } }).run();
      else chain.insertContent('$$').setTextSelection(from + 1).run();
    }
    else if (id === 'highlight') chain.setHighlight(typeof value === 'string' && (HIGHLIGHTS as readonly string[]).includes(value) ? (value as HighlightColor) : null).run();
  }

  /** Sends where this person's pointer is on the board, or that it has left. */
  #sharePointer(e: PointerEvent, screen: Point): void {
    const presence = this.presence();
    if (!presence) return;
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const over = screen.x >= 0 && screen.y >= 0 && screen.x <= width && screen.y <= height && e.pointerType !== 'touch';
    presence.setPointer(over ? toWorld(this.viewport(), screen) : null);
  }

  #rename(id: string): void {
    this.editing.set(null);
    this.selection.set(new Set([id]));
    this.renaming.set(id);
  }

  #edit(id: string): void {
    if (this.board().locked().has(id)) return;
    this.selection.set(new Set([id]));
    this.editing.set(id);
  }

  #screenPoint(e: MouseEvent): Point {
    const r = this.surface().nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}

/** The smallest box round some boxes. */
function rectAround(boxes: readonly { x: number; y: number; w: number; h: number }[]): Rect {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** A board's layout: everything but notes, images, files, pen strokes and arrows. */
export function layoutIds(b: BoardDoc): string[] {
  return [...b.frames().map((f) => f.id), ...b.items().filter((i) => i.kind === 'text' || i.kind === 'shape' || i.kind === 'table' || i.kind === 'view').map((i) => i.id)];
}

/** Whether a board's whole layout is locked. */
export function layoutLocked(b: BoardDoc): boolean {
  const ids = layoutIds(b);
  return ids.length > 0 && ids.every((id) => b.locked().has(id));
}
