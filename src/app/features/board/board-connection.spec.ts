import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { BoardConnection, STUCK_MS } from './board-connection';
import type { BoardDoc } from './board-doc';

/** This browser's saved copy of a board, loading when the test says so. */
class FakeLocal {
  static last: FakeLocal;
  loaded!: () => void;
  readonly whenSynced = new Promise<void>((resolve) => (this.loaded = resolve));
  cleared = 0;
  closed = 0;
  constructor() {
    FakeLocal.last = this;
  }
  clearData() {
    this.cleared++;
    return Promise.resolve();
  }
  destroy() {
    this.closed++;
    return Promise.resolve();
  }
}

/** The collaboration provider: the test calls its handlers as the server would. */
class FakeProvider {
  static last: FakeProvider;
  readonly awareness = new Awareness(new Y.Doc());
  readonly configuration = { websocketProvider: { status: 'connected' } };
  constructor(readonly options: Record<string, (arg: never) => void>) {
    FakeProvider.last = this;
  }
  on() {}
  off() {}
  destroy() {}
  disconnect() {}
  detach() {}
  attach() {}
  setAwarenessField() {}
}

// Mocks are hoisted above the classes, so they reach them only when called.
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: function IndexeddbPersistence() {
    return new FakeLocal();
  },
}));
vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: function HocuspocusProvider(options: Record<string, (arg: never) => void>) {
    return new FakeProvider(options);
  },
  WebSocketStatus: { Connected: 'connected', Disconnected: 'disconnected' },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('this browser\'s copy of unsent edits', () => {
  let connection: BoardConnection;
  beforeEach(() => vi.stubGlobal('indexedDB', {}));
  afterEach(() => vi.unstubAllGlobals());
  const open = () => {
    connection = new BoardConnection('b1', { doc: new Y.Doc() } as unknown as BoardDoc, () => 't', { id: 'u', name: 'Ada', color: 'red' } as never);
    return { local: FakeLocal.last, server: FakeProvider.last.options as unknown as Record<string, (arg: unknown) => void> };
  };

  it('keeps the copy when the board is left before it has loaded', async () => {
    const { server } = open();
    server['onSynced']({ state: true });
    connection.destroy();
    await flush();
    expect(FakeLocal.last.cleared).toBe(0);
    expect(FakeLocal.last.closed).toBe(1);
  });

  it('keeps the copy until the server has synced after it loaded', async () => {
    const { local, server } = open();
    server['onSynced']({ state: true });
    local.loaded();
    await flush();
    connection.destroy();
    await flush();
    expect(local.cleared).toBe(0);
  });

  it('clears the copy once it has loaded and the server has every edit', async () => {
    const { local, server } = open();
    local.loaded();
    await flush();
    server['onSynced']({ state: true });
    server['onUnsyncedChanges']({ number: 0 });
    connection.destroy();
    await flush();
    expect(local.cleared).toBe(1);
  });

  it('keeps edits the server has not taken, even once they are stuck', async () => {
    vi.useFakeTimers();
    try {
      const { local, server } = open();
      local.loaded();
      await vi.advanceTimersByTimeAsync(0);
      server['onSynced']({ state: true });
      server['onStatus']({ status: 'connected' });
      server['onUnsyncedChanges']({ number: 2 });
      await vi.advanceTimersByTimeAsync(STUCK_MS + 1);
      expect(connection.status()).toBe('stuck');
      connection.destroy();
      await vi.advanceTimersByTimeAsync(0);
      expect(local.cleared).toBe(0);
      // Only on purpose.
      await connection.discardLocal();
      expect(local.cleared).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the copy while the board is open in another tab, which shares it', async () => {
    // Another tab holds the board: an exclusive hold is never available.
    const locks = { request: (_name: string, options: unknown, callback?: (lock: unknown) => unknown) => {
      const cb = (typeof options === 'function' ? options : callback) as (lock: unknown) => unknown;
      const opts = (typeof options === 'function' ? {} : options) as { mode?: string; ifAvailable?: boolean };
      return Promise.resolve(cb(opts.mode === 'exclusive' ? null : {}));
    } };
    vi.stubGlobal('navigator', { ...navigator, locks });
    const { local, server } = open();
    local.loaded();
    await flush();
    server['onSynced']({ state: true });
    server['onUnsyncedChanges']({ number: 0 });
    connection.destroy();
    await flush();
    expect(local.cleared).toBe(0);
    expect(local.closed).toBe(1);
  });
});
