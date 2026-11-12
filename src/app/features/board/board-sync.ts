import { signal } from '@angular/core';
import { Api } from '../../api/generated/api';
import { boardsControllerDocument } from '../../api/generated/fn/boards/boards-controller-document';
import { boardsControllerSaveDocument } from '../../api/generated/fn/boards/boards-controller-save-document';
import { fromBase64, toBase64 } from './base64';
import { REMOTE, type BoardDoc } from './board-doc';

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error';

/** How long after the last change to save, and how long to wait before trying again after a failure. */
export const SAVE_DELAY_MS = 800;
export const RETRY_DELAY_MS = 5000;

/**
 * Loads a board's document and saves it back shortly after each change. A stand-in for real-time sync: the next phase
 * swaps this for a Hocuspocus provider on the same BoardDoc.
 */
export class BoardSync {
  readonly status = signal<SaveStatus>('loading');
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inFlight: Promise<void> | undefined;
  #dirty = false;
  #destroyed = false;

  constructor(
    private readonly api: Api,
    private readonly boardId: string,
    private readonly board: BoardDoc,
  ) {}

  async load(): Promise<void> {
    const { state } = await this.api.invoke(boardsControllerDocument, { id: this.boardId });
    if (state) this.board.apply(fromBase64(state));
    this.board.doc.on('update', (_update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE) this.#changed();
    });
    this.status.set('saved');
  }

  /** Saves now if anything is waiting; for leaving the page. */
  async flush(): Promise<void> {
    if (this.#destroyed) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    await this.#inFlight;
    if (this.#dirty) await this.#save();
  }

  #changed(): void {
    if (this.#destroyed) return;
    this.#dirty = true;
    this.status.set('saving');
    this.#schedule(SAVE_DELAY_MS);
  }

  #schedule(ms: number): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#save();
    }, ms);
  }

  async #save(): Promise<void> {
    // One save at a time; changes made meanwhile go in the next.
    if (this.#inFlight) return;
    this.#dirty = false;
    const state = toBase64(this.board.encode());
    this.#inFlight = this.api
      .invoke(boardsControllerSaveDocument, { id: this.boardId, body: { state } })
      .then(
        () => {
          if (!this.#dirty) this.status.set('saved');
        },
        () => {
          this.#dirty = true;
          this.status.set('error');
        },
      )
      .finally(() => {
        this.#inFlight = undefined;
        if (this.#dirty && !this.#timer && !this.#destroyed) this.#schedule(this.status() === 'error' ? RETRY_DELAY_MS : SAVE_DELAY_MS);
      });
    await this.#inFlight;
  }

  /** Stops saving, dropping anything not yet saved (the board was deleted, or has been flushed). */
  destroy(): void {
    this.#destroyed = true;
    clearTimeout(this.#timer);
  }
}
