import { Component, computed, effect, ElementRef, HostListener, input, signal, viewChild } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SelectionToolbar } from '@adamstavely/trenchcoat/angular/selection-toolbar';
import {
  defaultSelectionToolbarItems,
  selectionRect,
  type SelectionToolbarCommand,
  type SelectionToolbarItem,
} from '@adamstavely/trenchcoat/selection-toolbar';
import type { Editor } from '@tiptap/core';
import { NOTE_COLORS, type BoardDoc, type NoteColor } from './board-doc';
import { NoteView } from './note';
import { intersects, rectFrom, toWorld, zoomAt, type Point, type Rect, type Viewport } from './viewport';

type Gesture =
  | { kind: 'pan'; last: Point }
  | { kind: 'drag'; last: Point; moved: boolean }
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
 * The board: an endless surface to pan and zoom, with notes to add, select, drag and edit. Drag the background to
 * select with a box; hold Space (or use the middle button) and drag to pan; scroll to pan, and pinch or Ctrl/⌘-scroll
 * to zoom. Double-click empty space to add a note, or a note to write in it.
 */
@Component({
  selector: 'app-canvas',
  imports: [NoteView, Button, SelectionToolbar],
  templateUrl: './canvas.html',
  styleUrl: './canvas.css',
})
export class Canvas {
  readonly board = input.required<BoardDoc>();

  protected readonly viewport = signal<Viewport>({ x: 80, y: 80, zoom: 1 });
  protected readonly selection = signal<ReadonlySet<string>>(new Set());
  protected readonly editing = signal<string | null>(null);
  protected readonly marquee = signal<Rect | null>(null);
  protected readonly spaceHeld = signal(false);
  protected readonly panning = signal(false);

  protected readonly colors = NOTE_COLORS.map((c) => ({ id: c, label: COLOR_LABELS[c] }));
  protected readonly formatItems = FORMAT_ITEMS;

  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  #gesture: Gesture | undefined;

  protected readonly worldTransform = computed(() => {
    const { x, y, zoom } = this.viewport();
    return `translate(${x}px, ${y}px) scale(${zoom})`;
  });
  protected readonly gridSize = computed(() => GRID * this.viewport().zoom);
  protected readonly zoomPercent = computed(() => `${Math.round(this.viewport().zoom * 100)}%`);

  /** The marquee is drawn in screen space, so it stays crisp at any zoom. */
  protected readonly marqueeScreen = computed(() => {
    const m = this.marquee();
    if (!m) return null;
    const { x, y, zoom } = this.viewport();
    return { x: m.x * zoom + x, y: m.y * zoom + y, w: m.w * zoom, h: m.h * zoom };
  });

  // The note editor and its formatting bar
  protected readonly editor = signal<Editor | null>(null);
  protected readonly editorElement = computed(() => this.editor()?.view.dom ?? null);
  protected readonly formatAnchor = signal<ReturnType<typeof selectionRect>>(null);
  protected readonly pressed = signal<string[]>([]);
  protected readonly values = signal<Record<string, string>>({});

  constructor() {
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
    const id = noteEl?.dataset['noteId'];
    // Inside the note being edited, the pointer is the editor's.
    if (id && id === this.editing()) return;
    if (target.closest('.toolbar')) return;

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
      this.board().bringToFront(this.selection());
      this.board().undo.stopCapturing();
      this.#gesture = { kind: 'drag', last: screen, moved: false };
      return;
    }

    const start = toWorld(this.viewport(), screen);
    const base = e.shiftKey ? new Set(this.selection()) : new Set<string>();
    this.selection.set(base);
    this.#gesture = { kind: 'marquee', start, base };
  }

  @HostListener('window:pointermove', ['$event'])
  protected onPointerMove(e: PointerEvent): void {
    const g = this.#gesture;
    if (!g) return;
    const screen = this.#screenPoint(e);
    if (g.kind === 'pan') {
      this.viewport.update((v) => ({ ...v, x: v.x + screen.x - g.last.x, y: v.y + screen.y - g.last.y }));
      g.last = screen;
    } else if (g.kind === 'drag') {
      const zoom = this.viewport().zoom;
      this.board().move(this.selection(), (screen.x - g.last.x) / zoom, (screen.y - g.last.y) / zoom);
      g.last = screen;
      g.moved = true;
    } else {
      const rect = rectFrom(g.start, toWorld(this.viewport(), screen));
      this.marquee.set(rect);
      const hit = this.board()
        .notes()
        .filter((n) => intersects(rect, n))
        .map((n) => n.id);
      this.selection.set(new Set([...g.base, ...hit]));
    }
  }

  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  protected onPointerUp(): void {
    if (this.#gesture?.kind === 'drag' && this.#gesture.moved) this.board().undo.stopCapturing();
    this.#gesture = undefined;
    this.marquee.set(null);
    this.panning.set(false);
  }

  protected onDoubleClick(e: MouseEvent): void {
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
    if (e.code === 'Space') {
      e.preventDefault();
      this.spaceHeld.set(true);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection().size > 0) {
      e.preventDefault();
      this.board().remove(this.selection());
      this.selection.set(new Set());
    } else if (e.key === 'Escape') {
      this.selection.set(new Set());
    } else if (e.key === 'Enter' && this.selection().size === 1) {
      e.preventDefault();
      this.#edit([...this.selection()][0]);
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.board().undo.redo();
      else this.board().undo.undo();
      this.#dropMissing();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.board().undo.redo();
      this.#dropMissing();
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.selection.set(new Set(this.board().notes().map((n) => n.id)));
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

  protected setColor(color: NoteColor): void {
    this.board().setColor(this.selection(), color);
  }

  protected zoomBy(factor: number): void {
    const { width, height } = this.surface().nativeElement.getBoundingClientRect();
    const v = this.viewport();
    this.viewport.set(zoomAt(v, v.zoom * factor, { x: width / 2, y: height / 2 }));
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

  #edit(id: string): void {
    this.selection.set(new Set([id]));
    this.editing.set(id);
  }

  /** After undo or redo, forget selected notes that no longer exist. */
  #dropMissing(): void {
    const ids = new Set(this.board().notes().map((n) => n.id));
    const kept = [...this.selection()].filter((id) => ids.has(id));
    if (kept.length !== this.selection().size) this.selection.set(new Set(kept));
  }

  #screenPoint(e: MouseEvent): Point {
    const r = this.surface().nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}
