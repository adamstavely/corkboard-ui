import * as Y from 'yjs';
import { BoardDoc } from './board-doc';
import { CHUNK, chunkOf, decode, eventsAt, nextPoint, rangeOf, route } from './replay-steps';
import { changesSince, contentOf } from './versions';

describe('stepping through a replay', () => {
  it('steps forward within a chunk by applying only what comes next', () => {
    expect(route(3, 4)).toEqual({ fresh: false, from: 4, to: 4 });
    expect(route(3, 9)).toEqual({ fresh: false, from: 4, to: 9 });
    expect(route(3, 3)).toEqual({ fresh: false, from: 4, to: 3 });
  });

  it('starts again from the chunk’s first point to go back, into another chunk, or the first time', () => {
    expect(route(null, 4)).toEqual({ fresh: true, from: 0, to: 4 });
    expect(route(9, 4)).toEqual({ fresh: true, from: 0, to: 4 });
    expect(route(CHUNK - 1, CHUNK)).toEqual({ fresh: true, from: CHUNK, to: CHUNK });
    expect(route(2, CHUNK + 5)).toEqual({ fresh: true, from: CHUNK, to: CHUNK + 5 });
    expect(chunkOf(CHUNK * 2 + 7)).toBe(CHUNK * 2);
  });

  it('covers this session from where it started, or everything', () => {
    const frames = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    expect(rangeOf(frames, 'c', 'session')).toEqual({ start: 2, end: 3 });
    expect(rangeOf(frames, 'c', 'all')).toEqual({ start: 0, end: 3 });
    // Unknown, or gone: everything.
    expect(rangeOf(frames, null, 'session')).toEqual({ start: 0, end: 3 });
    expect(rangeOf(frames, 'zz', 'session')).toEqual({ start: 0, end: 3 });
  });

  it('plays to the end of the range and stops', () => {
    expect(nextPoint(2, 3)).toBe(3);
    expect(nextPoint(3, 3)).toBeNull();
  });

  it('says who did what between the point before and this one', () => {
    const frames = [{ at: 100 }, { at: 200 }, { at: 300 }];
    const events = [50, 100, 150, 200, 250].map((at) => ({ at }));
    expect(eventsAt(events, frames, 0).map((e) => e.at)).toEqual([50, 100]);
    expect(eventsAt(events, frames, 1).map((e) => e.at)).toEqual([150, 200]);
    expect(eventsAt(events, frames, 2).map((e) => e.at)).toEqual([250]);
    expect(eventsAt(events, frames, 5)).toEqual([]);
  });

  it('rebuilds each point from a chunk sent as one whole board and what changed after it', () => {
    const live = new BoardDoc();
    const states: Uint8Array[] = [];
    live.addNote(0, 0, 'yellow', 'First');
    states.push(live.encode());
    const second = live.addNote(300, 0, 'pink', 'Second');
    states.push(live.encode());
    live.remove([second]);
    states.push(live.encode());
    // As the API sends them: base64, the first whole, the rest only what changed since the one before.
    const sent = states.map((s, i) => btoa(String.fromCharCode(...(i ? Y.diffUpdate(s, Y.encodeStateVectorFromUpdate(states[i - 1])) : s))));

    const shown = new BoardDoc();
    const texts: string[][] = [];
    let before = contentOf(shown);
    const changes = [];
    for (const update of sent) {
      before = contentOf(shown);
      shown.apply(decode(update));
      texts.push(shown.notes().map((n) => n.text.toString().replace(/<[^>]+>/g, '')));
      changes.push(changesSince(before, shown));
    }
    expect(texts).toEqual([['First'], ['First', 'Second'], ['First']]);
    expect(changes[1].added).toEqual(['Second']);
    expect(changes[2].removed).toEqual(['Second']);
  });

  it('remembers a note’s words as they were, for what changed when they’re edited after', () => {
    const board = new BoardDoc();
    const id = board.addNote(0, 0, 'yellow', 'Before');
    const then = contentOf(board);
    const text = (board.notes().find((n) => n.id === id)!.text.get(0) as Y.XmlElement).get(0) as Y.XmlText;
    text.delete(0, 6);
    text.insert(0, 'After');
    expect(changesSince(then, board).edited).toEqual([{ before: 'Before', after: 'After' }]);
  });
});
