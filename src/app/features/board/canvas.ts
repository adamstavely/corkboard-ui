import { Component, computed, effect, ElementRef, HostListener, input, output, signal, untracked, viewChild } from '@angular/core';
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
import { NOTE_COLORS, NOTE_SIZE, type BoardDoc, type NoteColor } from './board-doc';
import { NoteView } from './note';
import type { Presence } from './presence';
import type { NoteVotes } from './facilitation';
import { boardBounds } from './export';
import type { PresentedView } from './presence';
import { clampZoom, contains, intersects, rectFrom, toWorld, zoomAt, type Point, type Rect, type Viewport } from './viewport';

type Gesture =
  | { kind: 'pan'; last: Point }
  | { kind: 'drag'; last: Point; moved: boolean; ids: Set<string> }
  | { kind: 'resize'; id: string; start: Point; size: { w: number; h: number } }
  | { kind: 'marquee'; start: Point; base: Set<string> };

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
  imports: [NoteView, Button, SelectionToolbar],
  templateUrl: './canvas.html',
  styleUrl: './canvas.css',
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
  /** Exactly what's selected – notes and frames – for comments on them. */
  readonly selectedIds = output<readonly string[]>();
  /** Dot votes per note (see noteVotes), whether this person is voting, and how many votes they have left. */
  readonly noteVotes = input<ReadonlyMap<string, NoteVotes>>(new Map());
  readonly voting = input(false);
  readonly votesLeft = input(0);
  readonly vote = output<{ noteId: string; add: boolean }>();
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

    // A note or frame that's gone – deleted by someone else, or by undo – can't stay selected or open here.
    effect(() => {
      const ids = new Set([...this.board().notes(), ...this.board().frames()].map((n) => n.id));
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
    const noteEl = target.closest<HTMLElement>('app-note');
    // A frame is grabbed anywhere on it (a note can cover its title). Shift-drag inside one boxes notes instead.
    const frameEl = noteEl ? null : target.closest<HTMLElement>('.frame');
    const onFrameBody = !!frameEl && !target.closest('.frame-title, .frame-resize');
    const frameId = frameEl && !(onFrameBody && e.shiftKey) ? frameEl.dataset['frameId'] : undefined;
    const id = noteEl?.dataset['noteId'] ?? frameId;
    // Inside the note being edited, the pointer is the editor's; so is the title being renamed.
    if (id && id === this.editing()) return;
    if (target.closest('.toolbar') || target.closest('.frame-rename') || target.closest('.note-votes')) return;

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
      this.board().resizeFrame(g.id, g.size.w + (screen.x - g.start.x) / zoom, g.size.h + (screen.y - g.start.y) / zoom);
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
      ];
      this.selection.set(new Set([...g.base, ...hit]));
    }
  }

  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  protected onPointerUp(): void {
    if ((this.#gesture?.kind === 'drag' && this.#gesture.moved) || this.#gesture?.kind === 'resize') this.board().undo.stopCapturing();
    this.#gesture = undefined;
    this.marquee.set(null);
    this.panning.set(false);
  }

  protected onDoubleClick(e: MouseEvent): void {
    if (this.readOnly()) return;
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
      if (this.board().frames().some((f) => f.id === id)) this.#rename(id);
      else this.#edit(id);
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
    const items = [...this.board().notes(), ...this.board().frames()];
    if (items.length) this.#fit(items);
  }

  /** Selects these notes and frames and brings them into view, zoomed to fit (never past 100%). */
  show(ids: readonly string[]): void {
    const notes = [...this.board().notes(), ...this.board().frames()].filter((n) => ids.includes(n.id));
    if (notes.length === 0) return;
    this.editing.set(null);
    this.selection.set(new Set(notes.map((n) => n.id)));
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
    const parts = [notes ? `${notes} note${notes === 1 ? '' : 's'}` : '', frames ? `${frames} frame${frames === 1 ? '' : 's'}` : ''].filter(Boolean);
    return parts.length ? `Delete ${parts.join(' and ')}` : 'Delete selected';
  });

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
