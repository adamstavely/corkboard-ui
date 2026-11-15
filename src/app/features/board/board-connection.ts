import { IndexeddbPersistence } from 'y-indexeddb';
import { LOCAL_PREFIX } from '../../core/pending-work';
import { computed, signal } from '@angular/core';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import type { BoardDoc } from './board-doc';
import { Presence, type PresenceUser } from './presence';

export type ConnectionStatus = 'connecting' | 'saving' | 'saved' | 'offline' | 'denied' | 'stuck';

/** How long edits may wait for the server, while connected, before they're taken as refused. */
export const STUCK_MS = 20_000;

/** The API's collaboration socket, through the same /api prefix as everything else. */
export function collabUrl(loc: Pick<Location, 'protocol' | 'host'> = location): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/api/collab`;
}

/**
 * A board shared live with everyone who has it open: Hocuspocus keeps the BoardDoc in step with the server, which
 * saves it, and carries each person's presence. Edits are also kept in this browser (IndexedDB) until the server has
 * them, so ones made offline survive leaving the board or reloading, and are sent when it's next open; once everything
 * is sent, the local copy is cleared.
 */
export class BoardConnection {
  readonly provider: HocuspocusProvider;
  readonly presence: Presence;

  readonly #connected = signal(false);
  readonly #synced = signal(false);
  readonly #unsynced = signal(0);
  readonly #denied = signal(false);

  /**
   * Connected and in step, yet edits the server hasn't taken for STUCK_MS: it refused them (an update it can't accept,
   * e.g. one carrying things it lost in a crash). They'll never go through as they are.
   */
  readonly #stuck = signal(false);
  #stuckTimer: ReturnType<typeof setTimeout> | undefined;

  readonly status = computed<ConnectionStatus>(() => {
    if (this.#denied()) return 'denied';
    if (this.#stuck()) return 'stuck';
    if (!this.#synced()) return 'connecting';
    if (!this.#connected()) return 'offline';
    return this.#unsynced() > 0 ? 'saving' : 'saved';
  });

  readonly #commentsChanged = signal(0);
  /** Goes up whenever someone changes the board's comments, so they can be fetched again. */
  readonly commentsChanged = this.#commentsChanged.asReadonly();

  readonly #answering = signal<ReadonlySet<string>>(new Set());
  /** People the model is answering in the board's chat right now. */
  readonly answering = this.#answering.asReadonly();

  readonly #signIns = signal(0);
  /** Goes up each time the server lets this person in. It reconnects them when their role changes, so a new value means
   *  their role may have. */
  readonly signIns = this.#signIns.asReadonly();

  /** Changes this person has made that the server hasn't confirmed yet. */
  readonly pending = computed(() => this.#unsynced() > 0);

  readonly #local: IndexeddbPersistence | undefined;
  /** Whether this browser's saved copy has loaded into the board: until it has, what's on disk is unknown. */
  #hydrated = false;
  /** Whether the server has synced with the board since that copy loaded, so it holds everything that was on disk. */
  #syncedSinceHydrated = false;
  /** Held while the board is open, so another tab with it open keeps the saved copy it shares (see #mayClear). */
  #releaseHold: (() => void) | undefined;
  /** Settles once that hold is let go. */
  #held: Promise<unknown> = Promise.resolve();

  /**
   * `boardId` is the document's name: a board, or a participant's read-only view of one (which keeps no local copy,
   * since it's rebuilt by the server and never edited here).
   */
  constructor(boardId: string, board: BoardDoc, token: () => string, user: PresenceUser, { keepLocal = true }: { keepLocal?: boolean } = {}) {
    // Edits left from last time (made offline, then the board was left) load into the board and go to the server.
    this.#local = typeof indexedDB === 'undefined' || !keepLocal ? undefined : new IndexeddbPersistence(`${LOCAL_PREFIX}${boardId}`, board.doc);
    this.#lockName = `${LOCAL_PREFIX}${boardId}`;
    if (this.#local) {
      void this.#local.whenSynced.then(() => (this.#hydrated = true));
      this.#hold();
    } else this.#hydrated = true;
    this.provider = new HocuspocusProvider({
      url: collabUrl(),
      name: boardId,
      document: board.doc,
      // Read on every (re)connect, so a renewed session's token is the one sent.
      token,
      onStatus: ({ status }) => {
        this.#connected.set(status === WebSocketStatus.Connected);
        this.#watchStuck();
      },
      onSynced: ({ state }) => {
        if (!state) return;
        this.#synced.set(true);
        if (this.#hydrated) this.#syncedSinceHydrated = true;
      },
      onUnsyncedChanges: ({ number }) => {
        this.#unsynced.set(number);
        this.#watchStuck();
      },
      onAuthenticated: () => this.#signIns.update((n) => n + 1),
      // The server closes one board's connection (the socket stays up) when someone's role changes or the share link
      // they came through is turned off. Join again: they're let back in with their new role, or turned away.
      onClose: () =>
        setTimeout(() => {
          if (this.#destroyed || this.provider.configuration.websocketProvider.status !== WebSocketStatus.Connected) return;
          this.provider.detach();
          this.provider.attach();
        }, 300),
      onStateless: ({ payload }) => {
        try {
          const message = JSON.parse(payload) as { type?: unknown; personId?: unknown; on?: unknown };
          if (message.type === 'comments') this.#commentsChanged.update((n) => n + 1);
          if (message.type === 'answering' && typeof message.personId === 'string') {
            const id = message.personId;
            this.#answering.update((ids) => {
              const next = new Set(ids);
              if (message.on === true) next.add(id);
              else next.delete(id);
              return next;
            });
          }
        } catch {
          // Not a message this app sends.
        }
      },
      onAuthenticationFailed: () => {
        this.#denied.set(true);
        // It would only be refused again: the board is gone, or this person no longer has access.
        this.provider.disconnect();
      },
    });
    this.presence = new Presence(this.provider.awareness!, user);
  }

  #destroyed = false;
  readonly #lockName: string;

  /** Takes a shared hold on the board's saved copy for as long as this tab has the board open. */
  #hold(): void {
    if (typeof navigator === 'undefined' || !navigator.locks) return;
    this.#held = navigator.locks.request(this.#lockName, { mode: 'shared' }, () => new Promise<void>((release) => (this.#releaseHold = release)));
  }

  /**
   * Whether the saved copy can go, once this tab has let go of its hold: no other tab has the board open (they share the
   * copy, and theirs may hold edits not sent yet).
   */
  async #alone(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.locks) return true;
    await this.#held.catch(() => undefined);
    return navigator.locks.request(this.#lockName, { mode: 'exclusive', ifAvailable: true }, (lock) => lock !== null);
  }

  /** Starts the stuck clock while connected with edits waiting, and stops it (and clears stuck) otherwise. */
  #watchStuck(): void {
    const waiting = this.#connected() && this.#unsynced() > 0;
    if (!waiting) {
      clearTimeout(this.#stuckTimer);
      this.#stuckTimer = undefined;
      this.#stuck.set(false);
      return;
    }
    this.#stuckTimer ??= setTimeout(() => this.#stuck.set(true), STUCK_MS);
  }

  /** Throws away this browser's copy of the board's unsent edits, e.g. once the server has refused them. */
  async discardLocal(): Promise<void> {
    await this.#local?.clearData();
  }

  destroy(): void {
    this.#destroyed = true;
    this.presence.destroy();
    clearTimeout(this.#stuckTimer);
    // Everything sent and confirmed: the local copy isn't needed. Otherwise it's kept, to be sent next time or discarded
    // on purpose.
    // Only once it has loaded (else what's on disk was never seen) and the server has synced since and taken every edit
    // made here. A refused edit (stuck) isn't a reason: it's kept until someone chooses to discard it.
    const local = this.#local;
    if (local) {
      const confirmed = this.#hydrated && this.#syncedSinceHydrated && !this.pending();
      this.#releaseHold?.();
      void (confirmed ? this.#alone() : Promise.resolve(false)).then(
        (alone) => (alone ? local.clearData() : local.destroy()),
        () => local.destroy(),
      );
    }
    this.provider.destroy();
  }
}
