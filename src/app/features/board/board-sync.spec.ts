import type { Api } from '../../api/generated/api';
import { boardsControllerDocument } from '../../api/generated/fn/boards/boards-controller-document';
import { boardsControllerSaveDocument } from '../../api/generated/fn/boards/boards-controller-save-document';
import { fromBase64, toBase64 } from './base64';
import { BoardDoc } from './board-doc';
import { BoardSync, RETRY_DELAY_MS, SAVE_DELAY_MS } from './board-sync';

/** An Api whose document endpoint returns `state` and whose saves are recorded (or fail while `failing`). */
function fakeApi(state = '') {
  const saves: string[] = [];
  const api = {
    failing: false,
    saves,
    invoke: vi.fn(async (fn: unknown, params: { body?: { state: string } }) => {
      if (fn === boardsControllerDocument) return { state };
      if (fn === boardsControllerSaveDocument) {
        if (api.failing) throw new Error('offline');
        saves.push(params.body!.state);
        return undefined;
      }
      throw new Error('unexpected call');
    }),
  };
  return api;
}

describe('BoardSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads the saved document without saving it straight back', async () => {
    const saved = new BoardDoc();
    saved.addNote(0, 0, 'green');
    const api = fakeApi(toBase64(saved.encode()));
    const board = new BoardDoc();
    const sync = new BoardSync(api as unknown as Api, 'b1', board);

    await sync.load();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(board.notes()[0].color).toBe('green');
    expect(sync.status()).toBe('saved');
    expect(api.saves).toEqual([]);
  });

  it('saves once shortly after a burst of changes', async () => {
    const api = fakeApi();
    const board = new BoardDoc();
    const sync = new BoardSync(api as unknown as Api, 'b1', board);
    await sync.load();

    const id = board.addNote(0, 0);
    board.move([id], 5, 5);
    board.setColor([id], 'pink');
    expect(sync.status()).toBe('saving');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    expect(api.saves).toHaveLength(1);
    expect(sync.status()).toBe('saved');
    const copy = new BoardDoc();
    copy.apply(fromBase64(api.saves[0]));
    expect(copy.notes()[0].color).toBe('pink');
  });

  it('keeps retrying after a failed save', async () => {
    const api = fakeApi();
    const board = new BoardDoc();
    const sync = new BoardSync(api as unknown as Api, 'b1', board);
    await sync.load();

    api.failing = true;
    board.addNote(0, 0);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(sync.status()).toBe('error');

    api.failing = false;
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(api.saves).toHaveLength(1);
    expect(sync.status()).toBe('saved');
  });

  it('saves pending changes on flush, and nothing once destroyed', async () => {
    const api = fakeApi();
    const board = new BoardDoc();
    const sync = new BoardSync(api as unknown as Api, 'b1', board);
    await sync.load();

    board.addNote(0, 0);
    await sync.flush();
    expect(api.saves).toHaveLength(1);

    sync.destroy();
    board.addNote(0, 0);
    await sync.flush();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(api.saves).toHaveLength(1);
  });
});
