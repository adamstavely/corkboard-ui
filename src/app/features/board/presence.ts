import { signal } from '@angular/core';
import type { Awareness } from 'y-protocols/awareness';
import type { Point } from './viewport';

/** Who someone is, as others see them. Stored under `user`, where Tiptap's caret extension looks for it too. */
export interface PresenceUser {
  id: string;
  name: string;
  /** A CSS colour for their pointer, selection and caret. */
  color: string;
}

/** Someone else on the board right now. */
export interface Peer {
  clientId: number;
  user: PresenceUser;
  /** Where their pointer is, in board coordinates; null when it's off the board. */
  pointer: Point | null;
  selection: string[];
  editing: string | null;
  /** Whether they're writing in the board's chat. */
  typing: boolean;
}

const COLORS = 6;

/** A colour per person from Trench Coat's chart palette, the same on every screen. */
export function colorFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `var(--tc-chart-${(Math.abs(hash) % COLORS) + 1})`;
}

/** Pointer moves are sent at most this often. */
const POINTER_MS = 40;

/**
 * Presence over the board's awareness channel: this person's pointer, selection, the note they're editing and whether
 * they're writing in the chat go out;
 * everyone else's come back as `peers`. Nothing here is saved.
 */
export class Presence {
  readonly #peers = signal<Peer[]>([]);
  readonly peers = this.#peers.asReadonly();

  #pointer: Point | null = null;
  #pointerTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly awareness: Awareness,
    user: PresenceUser,
  ) {
    awareness.setLocalStateField('user', user);
    awareness.on('change', this.#update);
    this.#update();
  }

  setPointer(point: Point | null): void {
    this.#pointer = point;
    // Leaving the board is sent at once; moves are batched.
    if (!point) {
      clearTimeout(this.#pointerTimer);
      this.#pointerTimer = undefined;
      this.awareness.setLocalStateField('pointer', null);
      return;
    }
    this.#pointerTimer ??= setTimeout(() => {
      this.#pointerTimer = undefined;
      this.awareness.setLocalStateField('pointer', this.#pointer);
    }, POINTER_MS);
  }

  setSelection(ids: Iterable<string>): void {
    this.awareness.setLocalStateField('selection', [...ids]);
  }

  setEditing(id: string | null): void {
    this.awareness.setLocalStateField('editing', id);
  }

  setTyping(typing: boolean): void {
    if (this.awareness.getLocalState()?.['typing'] !== typing) this.awareness.setLocalStateField('typing', typing);
  }

  destroy(): void {
    clearTimeout(this.#pointerTimer);
    this.awareness.off('change', this.#update);
    this.awareness.setLocalState(null);
  }

  readonly #update = () => {
    const peers: Peer[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.awareness.clientID) return;
      const user = state['user'] as PresenceUser | undefined;
      if (!user?.id) return;
      peers.push({
        clientId,
        user,
        pointer: (state['pointer'] as Point | null | undefined) ?? null,
        selection: (state['selection'] as string[] | undefined) ?? [],
        editing: (state['editing'] as string | null | undefined) ?? null,
        typing: state['typing'] === true,
      });
    });
    this.#peers.set(peers);
  };
}
