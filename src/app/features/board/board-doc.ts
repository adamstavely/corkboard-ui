import { signal } from '@angular/core';
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
}

type Box = Pick<Frame, 'x' | 'y' | 'w' | 'h'>;

/** Whether a note is in a frame: its centre is inside. The API decides the same way. */
export const inFrame = (note: Box, frame: Box) =>
  note.x + note.w / 2 >= frame.x && note.x + note.w / 2 <= frame.x + frame.w && note.y + note.h / 2 >= frame.y && note.y + note.h / 2 <= frame.y + frame.h;

/** Changes that came from the server rather than this person; they don't go on the undo stack or back to the server. */
export const REMOTE = Symbol('remote');

/**
 * A board's content as one Yjs document: a map of nodes by id, each a map of its properties, with the note's rich text
 * as a nested XmlFragment. Everything that changes the board goes through here, so the same document can later be
 * shared over a WebSocket (and edited by the model) without the canvas changing.
 */
export class BoardDoc {
  readonly doc = new Y.Doc();
  readonly #nodes = this.doc.getMap<Y.Map<unknown>>('nodes');
  /** Moves made within 400ms of each other undo together; adding, recolouring and deleting are each their own step. */
  readonly undo: Y.UndoManager = new Y.UndoManager(this.#nodes, { captureTimeout: 400, trackedOrigins: new Set([null, this]) });

  readonly #notes = signal<Note[]>([]);
  /** Every note, bottom to top. Text edits don't change this list; each note watches its own fragment. */
  readonly notes = this.#notes.asReadonly();
  readonly #frames = signal<Frame[]>([]);
  /** Every frame, bottom to top. They are drawn under all the notes. */
  readonly frames = this.#frames.asReadonly();

  constructor() {
    this.#nodes.observeDeep((events) => {
      // Typing inside a note changes only its fragment; the list needs rebuilding when nodes or their properties do.
      if (events.some((e) => e.target === this.#nodes || e.target instanceof Y.Map)) this.#refresh();
    });
    this.#refresh();
  }

  /** Adds a note centred on a point and returns its id. */
  addNote(cx: number, cy: number, color: NoteColor = 'yellow'): string {
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
      node.set('text', new Y.XmlFragment());
      this.#nodes.set(id, node);
    }, this);
    return id;
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
        node.set('x', (node.get('x') as number) + dx);
        node.set('y', (node.get('y') as number) + dy);
      }
    }, this);
  }

  setColor(ids: Iterable<string>, color: NoteColor): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) {
        const node = this.#nodes.get(id);
        if (node?.get('kind') === 'note') node.set('color', color);
      }
    }, this);
  }

  /** Puts notes above everything else, keeping their order among themselves. */
  bringToFront(ids: Iterable<string>): void {
    const chosen = this.notes().filter((n) => [...ids].includes(n.id));
    const top = this.#topZ();
    if (chosen.length === 0 || chosen.every((n, i) => n.z === top - chosen.length + 1 + i)) return;
    this.doc.transact(() => chosen.forEach((n, i) => this.#nodes.get(n.id)?.set('z', top + 1 + i)), this);
  }

  remove(ids: Iterable<string>): void {
    this.undo.stopCapturing();
    this.doc.transact(() => {
      for (const id of ids) this.#nodes.delete(id);
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
    this.#nodes.forEach((node) => (top = Math.max(top, (node.get('z') as number) ?? 0)));
    return top;
  }

  #refresh(): void {
    const notes: Note[] = [];
    const frames: Frame[] = [];
    this.#nodes.forEach((node, id) => {
      if (node.get('kind') === 'frame') {
        const title = node.get('title');
        frames.push({
          id,
          x: node.get('x') as number,
          y: node.get('y') as number,
          w: (node.get('w') as number) ?? FRAME_SIZE.w,
          h: (node.get('h') as number) ?? FRAME_SIZE.h,
          z: (node.get('z') as number) ?? 0,
          title: typeof title === 'string' ? title : '',
        });
        return;
      }
      if (node.get('kind') !== 'note') return;
      const color = node.get('color') as NoteColor;
      notes.push({
        id,
        x: node.get('x') as number,
        y: node.get('y') as number,
        w: (node.get('w') as number) ?? NOTE_SIZE.w,
        h: (node.get('h') as number) ?? NOTE_SIZE.h,
        z: (node.get('z') as number) ?? 0,
        color: NOTE_COLORS.includes(color) ? color : 'yellow',
        text: node.get('text') as Y.XmlFragment,
      });
    });
    const order = (a: { z: number; id: string }, b: { z: number; id: string }) => a.z - b.z || a.id.localeCompare(b.id);
    this.#notes.set(notes.sort(order));
    this.#frames.set(frames.sort(order));
  }
}
