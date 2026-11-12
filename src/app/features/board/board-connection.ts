import { computed, signal } from '@angular/core';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import type { BoardDoc } from './board-doc';
import { Presence, type PresenceUser } from './presence';

export type ConnectionStatus = 'connecting' | 'saving' | 'saved' | 'offline' | 'denied';

/** The API's collaboration socket, through the same /api prefix as everything else. */
export function collabUrl(loc: Pick<Location, 'protocol' | 'host'> = location): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/api/collab`;
}

/**
 * A board shared live with everyone who has it open: Hocuspocus keeps the BoardDoc in step with the server, which
 * saves it, and carries each person's presence. Edits made offline are kept and sent on reconnecting.
 */
export class BoardConnection {
  readonly provider: HocuspocusProvider;
  readonly presence: Presence;

  readonly #connected = signal(false);
  readonly #synced = signal(false);
  readonly #unsynced = signal(0);
  readonly #denied = signal(false);

  readonly status = computed<ConnectionStatus>(() => {
    if (this.#denied()) return 'denied';
    if (!this.#synced()) return 'connecting';
    if (!this.#connected()) return 'offline';
    return this.#unsynced() > 0 ? 'saving' : 'saved';
  });

  /** Changes this person has made that the server hasn't confirmed yet. */
  readonly pending = computed(() => this.#unsynced() > 0);

  constructor(boardId: string, board: BoardDoc, token: () => string, user: PresenceUser) {
    this.provider = new HocuspocusProvider({
      url: collabUrl(),
      name: boardId,
      document: board.doc,
      // Read on every (re)connect, so a renewed session's token is the one sent.
      token,
      onStatus: ({ status }) => this.#connected.set(status === WebSocketStatus.Connected),
      onSynced: ({ state }) => {
        if (state) this.#synced.set(true);
      },
      onUnsyncedChanges: ({ number }) => this.#unsynced.set(number),
      onAuthenticationFailed: () => {
        this.#denied.set(true);
        // It would only be refused again: the board is gone, or this person no longer has access.
        this.provider.disconnect();
      },
    });
    this.presence = new Presence(this.provider.awareness!, user);
  }

  destroy(): void {
    this.presence.destroy();
    this.provider.destroy();
  }
}
