import { TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import { Api } from '../../api/generated/api';
import { replayControllerFrames } from '../../api/generated/fn/activity/replay-controller-frames';
import { replayControllerStates } from '../../api/generated/fn/activity/replay-controller-states';
import { BoardDoc } from './board-doc';
import { BoardReplay } from './board-replay';

// The canvas sizes itself to its box, which tests haven't got.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

describe('replaying a board', () => {
  async function replay({ privateMode = false } = {}) {
    // A board that grew a note at a time, and in private mode for the last.
    const live = new BoardDoc();
    const states: Uint8Array[] = [];
    live.addNote(0, 0, 'yellow', 'One');
    states.push(live.encode());
    live.addNote(300, 0, 'yellow', 'Two');
    states.push(live.encode());
    live.addNote(600, 0, 'yellow', 'Three');
    live.doc.getMap('privacy').set('on', true);
    states.push(live.encode());
    const frames = states.map((_, i) => ({ id: `f${i}`, at: 1_000_000 + i * 30_000, kind: 'snapshot', label: null }));
    const events = [{ id: 'e1', at: frames[1].at - 1, actor: 'Ada Lovelace', action: 'added a note', target: null, detail: null }];
    const asked: { from: string }[] = [];
    const api = {
      invoke: (fn: unknown, params: { from: string }) => {
        if (fn === replayControllerFrames) return Promise.resolve({ frames, events, sessionStartId: 'f1' });
        if (fn === replayControllerStates) {
          asked.push(params);
          const from = frames.findIndex((f) => f.id === params.from);
          return Promise.resolve({
            states: states.slice(from).map((s, i) => ({ id: frames[from + i].id, update: base64(i ? Y.diffUpdate(s, Y.encodeStateVectorFromUpdate(states[from + i - 1])) : s) })),
          });
        }
        return Promise.reject(new Error('unexpected'));
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    const fixture = TestBed.createComponent(BoardReplay);
    fixture.componentRef.setInput('boardId', 'b1');
    fixture.componentRef.setInput('privateMode', privateMode);
    const settle = async () => {
      for (let i = 0; i < 5; i++) {
        fixture.detectChanges();
        await fixture.whenStable();
      }
    };
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    const shown = () => (fixture.componentInstance as unknown as { board(): BoardDoc | null }).board()!.notes().length;
    const click = async (label: string) => {
      (el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click();
      await settle();
    };
    return { el, shown, click, asked, settle };
  }

  it('opens on this session and steps forward and back through it', async () => {
    const { el, shown, click, asked } = await replay();
    const scrubber = el.querySelector('input[type="range"]') as HTMLInputElement;
    expect(shown()).toBe(2);
    expect(scrubber.getAttribute('aria-valuetext')).toContain('1 of 2');
    expect(el.textContent).toContain('Ada Lovelace added a note');
    expect((el.querySelector('button[aria-label="Step back"]') as HTMLButtonElement).disabled).toBe(true);

    await click('Step forward');
    expect(shown()).toBe(3);
    expect(el.textContent).toContain('1 note added');
    expect(scrubber.getAttribute('aria-valuetext')).toContain('2 of 2');
    await click('Step back');
    expect(shown()).toBe(2);
    // One chunk, fetched once.
    expect(asked.length).toBe(1);
  });

  it('hides names while the board is in private mode', async () => {
    const { el } = await replay({ privateMode: true });
    expect(el.textContent).toContain('Someone added a note');
    expect(el.textContent).not.toContain('Ada Lovelace');
  });
});
