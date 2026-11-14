import { Component, computed, effect, ElementRef, HostListener, inject, input, output, signal, untracked, viewChild } from '@angular/core';
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
import { NOTE_COLORS, NOTE_SIZE, NOTE_TEMPLATES, SHAPES, TEXT_SIZES, type BoardDoc, type Item, type NoteColor, type NoteTemplate, type ShapeKind, type TableItem, type TextSize } from './board-doc';
import { boardTags, findOnBoard, NO_QUERY, notePeople, type FindQuery } from './find';
import { NoteView } from './note';
import type { Presence } from './presence';
import type { NoteVotes } from './facilitation';
import { arrowLines, boardBounds, boardBoxes } from './export';
import { safeUrl, shapePath } from './items';
import type { NoteReaction } from './reactions';
import type { Media } from './board-doc';
import { fileSize } from './file-cache';
import { REACTIONS } from './reactions';
import type { PresentedView } from './presence';
import { clampZoom, contains, intersects, rectFrom, toWorld, zoomAt, type Point, type Rect, type Viewport } from './viewport';

type Gesture =
  | { kind: 'pan'; last: Point }
  | { kind: 'drag'; last: Point; moved: boolean; ids: Set<string> }
  | { kind: 'resize'; id: string; start: Point; size: { w: number; h: number }; item?: boolean }
  | { kind: 'marquee'; start: Point; base: Set<string> }
  | { kind: 'draw'; points: number[] };

const SHAPE_NAMES: Record<ShapeKind, string> = { rect: 'Rectangle', ellipse: 'Ellipse', diamond: 'Diamond', triangle: 'Triangle' };
const TEXT_SIZE_NAMES: { id: TextSize; label: string }[] = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' },
  { id: 'xl', label: 'XL' },
];



/** The formats a note supports, from Trench Coat's bar; checklists wait for a task-list extension. */
const pick = (id: string) => defaultSelectionToolbarItems.find((i) => i.type !== 'separator' && i.id === id)!;
const list = pick('list');
const FORMAT_ITEMS: SelectionToolbarItem[] = [
  pick('bold'),
  pick('italic'),
  pick('strike'),
  pick('code'),
  { type: 'separator' },
  list.type === 'menu' ? { ...list, options: list.options.filter((o) => o.value !== 'checks') } : list,
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

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * The board: an endless surface to pan and zoom, with notes to add, select, drag and edit, and frames that group them.
 * Drag the background to select with a box; hold Space (or use the middle button) and drag to pan; scroll to pan, and
 * pinch or Ctrl/⌘-scroll to zoom. Double-click empty space to add a note, a note to write in it, or a frame's title to
 * rename it. A frame is picked up anywhere on it (Shift-drag inside one to box-select instead), carries its notes with
 * it, and resizes from its corner.
 */
@Component({
  selector: 'app-canvas',
  imports: [NoteView, Button, SelectionToolbar, MenuMorph],
  templateUrl: './canvas.html',
  styleUrls: ['./canvas.css', './canvas-items.css'],
})
export class Canvas {
  readonly board = input.required<BoardDoc>();
  /** Who else is here, and where this person's pointer and selection go out to them. */
  readonly presence = input<Presence | undefined>(undefined);
  /** Readers and commenters look, select and ask; they don't add, move, change or delete anything. */
  readonly readOnly = input(false);
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
  /** Files dropped on the board, and where (board coordinates). */
  readonly filesDropped = output<{ files: File[]; at: Point }>();
  /** Open the add-files panel, ask about an image, or open a file. */
  readonly addFiles = output<void>();
  readonly askImage = output<Media>();
  readonly openFile = output<Media>();
  /** What this person is looking at, whenever it changes: for presenting it to others. */
  readonly viewChange = output<PresentedView>();

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
  protected readonly safeUrl = safeUrl;
  protected readonly insertOpen = signal(false);
  /** Drawing with the pen: a drag on the board draws instead of selecting. */
  protected readonly pen = signal(false);
  /** The stroke being drawn, in board points. */
  protected readonly draft = signal<number[] | null>(null);
  protected readonly linkPrompt = signal(false);
  /** The shape or text being written in, or the table cell. */
  protected readonly itemEditing = signal<{ id: string; cell?: string } | null>(null);
  protected readonly selectedShapes = computed(() => this.board().items().filter((i) => i.kind === 'shape' && this.selection().has(i.id)).map((i) => i.id));
  protected readonly selectedTexts = computed(() => this.board().items().filter((i) => i.kind === 'text' && this.selection().has(i.id)).map((i) => i.id));
  protected readonly oneTable = computed(() => {
    if (this.selection().size !== 1) return null;
    const [id] = this.selection();
    return (this.board().items().find((i) => i.id === id && i.kind === 'table') as TableItem | undefined) ?? null;
  });

  // ── Note templates, tags, and finding things ──

  protected readonly noteTemplates = NOTE_TEMPLATES;
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

  protected toggleFind(): void {
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
    }
  }

  protected tableCells(t: TableItem): { key: string; row: number; col: number; text: string }[] {
    const cells = [];
    for (let row = 0; row < t.rows; row++) for (let col = 0; col < t.cols; col++) cells.push({ key: `${row}:${col}`, row, col, text: t.cells.get(`${row}:${col}`) ?? '' });
    return cells;
  }

  /** Adds something from the Insert menu in the middle of the view, selected (and open to write in, for text). */
  protected insert(what: ShapeKind | 'text' | 'table' | 'link'): void {
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
    if (this.readOnly()) return;
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
    effect(() => this.presence()?.setEditing(this.editing()));
    effect(() => {
      const { x, y, zoom } = this.viewport();
      const surface = this.surfaceIfReady()?.nativeElement;
      if (!surface) return;
      const { width, height } = surface.getBoundingClientRect();
      this.viewChange.emit({ cx: (width / 2 - x) / zoom, cy: (height / 2 - y) / zoom, zoom });
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
        this.formatAnchor.set(editor.state.selection.empty || !editor.isFocused ? null : selectionRect());
        this.pressed.set(MARKS.filter((m) => editor.isActive(m)));
        this.values.set({
          list: editor.isActive('bulletList') ? 'bullets' : editor.isActive('orderedList') ? 'numbers' : 'none',
        });
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
    // With the pen, a drag on the board draws.
    if (this.pen() && e.button === 0 && !this.spaceHeld() && !this.readOnly()) {
      const p = toWorld(this.viewport(), this.#screenPoint(e));
      this.#gesture = { kind: 'draw', points: [p.x, p.y] };
      this.draft.set([p.x, p.y]);
      return;
    }
    const noteEl = target.closest<HTMLElement>('app-note, [data-media-id], [data-item-id]');
    // A frame is grabbed anywhere on it (a note can cover its title). Shift-drag inside one boxes notes instead.
    const frameEl = noteEl ? null : target.closest<HTMLElement>('.frame');
    const onFrameBody = !!frameEl && !target.closest('.frame-title, .frame-resize');
    const frameId = frameEl && !(onFrameBody && e.shiftKey) ? frameEl.dataset['frameId'] : undefined;
    const id = noteEl?.dataset['noteId'] ?? noteEl?.dataset['mediaId'] ?? noteEl?.dataset['itemId'] ?? frameId;
    const itemId = noteEl?.dataset['itemId'];
    if (itemId && itemId === this.itemEditing()?.id) return;
    // Inside the note being edited, the pointer is the editor's; so is the title being renamed.
    if (id && id === this.editing()) return;
    if (target.closest('.toolbar') || target.closest('.frame-rename') || target.closest('.note-votes') || target.closest('.note-reactions')) return;
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

    if (itemId && target.closest('.item-resize') && !this.readOnly()) {
      const item = this.board().items().find((i) => i.id === itemId)!;
      this.board().undo.stopCapturing();
      this.#gesture = { kind: 'resize', id: itemId, start: screen, size: { w: item.w, h: item.h }, item: true };
      return;
    }
    if (frameId && target.closest('.frame-resize') && !this.readOnly()) {
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
      // Without edit rights, a click selects but nothing moves.
      if (this.readOnly()) return;
      this.board().bringToFront(ids);
      this.board().undo.stopCapturing();
      this.#gesture = { kind: 'drag', last: screen, moved: false, ids };
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
      this.board().move(g.ids, (screen.x - g.last.x) / zoom, (screen.y - g.last.y) / zoom);
      g.last = screen;
      g.moved = true;
    } else if (g.kind === 'resize') {
      const zoom = this.viewport().zoom;
      const w = g.size.w + (screen.x - g.start.x) / zoom;
      const h = g.size.h + (screen.y - g.start.y) / zoom;
      if (g.item) this.board().resizeItem(g.id, w, h);
      else this.board().resizeFrame(g.id, w, h);
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
      // Notes the box touches, and frames it takes in whole.
      const hit = [
        ...this.board()
          .notes()
          .filter((n) => intersects(rect, n))
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
      const id = this.board().addDrawing(this.#gesture.points);
      this.draft.set(null);
      if (id) this.board().undo.stopCapturing();
    }
    if ((this.#gesture?.kind === 'drag' && this.#gesture.moved) || this.#gesture?.kind === 'resize') this.board().undo.stopCapturing();
    this.#gesture = undefined;
    this.marquee.set(null);
    this.panning.set(false);
  }

  protected onDoubleClick(e: MouseEvent): void {
    // A link card opens its page, for anyone; a shape, text or cell opens to write in.
    const itemEl = (e.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
    if (itemEl) {
      const item = this.board().items().find((i) => i.id === itemEl.dataset['itemId']);
      if (item?.kind === 'link' && safeUrl(item.url) !== '#') window.open(item.url, '_blank', 'noopener,noreferrer');
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
    const id = (e.target as HTMLElement).closest<HTMLElement>('app-note')?.dataset['noteId'];
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
    if (e.key === 'Escape' && this.editing()) {
      this.editing.set(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (!this.finding()) this.toggleFind();
      else this.surface().nativeElement.parentElement?.querySelector<HTMLInputElement>('[data-find-autofocus]')?.focus();
      return;
    }
    if (e.key === 'Escape' && this.pen() && !isEditable(e.target)) {
      this.pen.set(false);
      return;
    }
    if (isEditable(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
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

  protected addNote(): void {
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
    return this.noteVotes().get(id) ?? (this.voting() ? { mine: 0, total: null } : null);
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
    const ids = new Set([...this.board().notes(), ...this.board().frames()].map((n) => n.id));
    const picked = [...this.selection()].filter((id) => ids.has(id));
    return picked.length === 2 ? (picked as [string, string]) : null;
  });

  /** Arrows as lines from the edge of one box to the edge of the other, aimed at their centres. */
  protected readonly arrows = computed(() => arrowLines(this.board()).map(({ id, start, end }) => ({ id, d: `M ${start.x} ${start.y} L ${end.x} ${end.y}` })));

  /** Draws an arrow from the first selected note or frame to the second. */
  protected connect(): void {
    const pair = this.pair();
    if (!pair) return;
    const id = this.board().connect(pair[0], pair[1]);
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
    if (!this.readOnly() && e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDrop(e: DragEvent): void {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (this.readOnly() || !files.length) return;
    e.preventDefault();
    this.filesDropped.emit({ files, at: toWorld(this.viewport(), this.#screenPoint(e)) });
  }

  /** The middle of what's in view, in board coordinates, for placing things. */
  viewCentre(): Point {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    return toWorld(this.viewport(), { x: width / 2, y: height / 2 });
  }

  protected readonly reactionChoices = REACTIONS;
  /** The one note selected, for reacting to it from the toolbar. */
  protected readonly oneNote = computed(() => {
    const [id] = this.selection();
    return this.selection().size === 1 && this.board().notes().some((n) => n.id === id) ? id : null;
  });

  protected toggleReaction(nodeId: string, emoji: string): void {
    const mine = this.reactions().get(nodeId)?.find((r) => r.emoji === emoji)?.mine ?? false;
    this.react.emit({ nodeId, emoji, on: !mine });
  }

  protected deleteSelection(): void {
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
  protected readonly minimapOpen = signal(true);
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
    else if (id === 'list') {
      if (value === 'bullets' && !editor.isActive('bulletList')) chain.toggleBulletList().run();
      else if (value === 'numbers' && !editor.isActive('orderedList')) chain.toggleOrderedList().run();
      else if (value === 'none' && editor.isActive('bulletList')) chain.toggleBulletList().run();
      else if (value === 'none' && editor.isActive('orderedList')) chain.toggleOrderedList().run();
    }
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
    this.selection.set(new Set([id]));
    this.editing.set(id);
  }

  #screenPoint(e: MouseEvent): Point {
    const r = this.surface().nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}
