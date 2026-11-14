import { BoardDoc } from './board-doc';
import type { CommentThreadDto } from '../../api/generated/models/comment-thread-dto';
import { imagePins, messagesOf, nodeLabel, openCounts, pinOf, plainText } from './comments';

describe('comments', () => {
  it('names the note or frame a thread is about', () => {
    const board = new BoardDoc();
    const note = board.addNote(0, 0, 'yellow', 'Deploys are slow\non Fridays');
    const frame = board.addFrame(0, 0, [], 'Delivery');
    expect(nodeLabel(board, note)).toBe('Note: Deploys are slow on Fridays');
    expect(nodeLabel(board, frame)).toBe('Frame: Delivery');
    expect(nodeLabel(board, 'gone')).toBe('A deleted note or frame');
    expect(plainText(board.notes()[0].text)).toBe('Deploys are slow on Fridays');
    board.destroy();
  });

  it('counts open threads for badges and turns comments into thread messages', () => {
    const thread = (id: string, resolved: boolean, n: number) => ({
      id,
      nodeId: `node-${id}`,
      anchor: null,
      resolvedAt: resolved ? '2026-11-12T00:00:00Z' : null,
      comments: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, author: { id: i ? 'me' : 'ada', name: i ? 'Grace' : 'Ada' }, body: `c${i}`, createdAt: '2026-11-12T00:00:00Z' })),
    });
    expect([...openCounts([thread('a', false, 2), thread('b', true, 5)])]).toEqual([['node-a', 2]]);
    expect(messagesOf(thread('a', false, 2), 'me').map((m) => [m.author.name, m.text])).toEqual([
      ['Ada', 'c0'],
      ['Grace (you)', 'c1'],
    ]);
  });

  it('reads pinned comments off their threads, numbered per image, skipping resolved ones', () => {
    const thread = (nodeId: string, anchor: { x: number; y: number } | null, resolved = false) =>
      ({ id: nodeId, nodeId, anchor, resolvedAt: resolved ? '2026-11-14' : null, comments: [] }) as unknown as CommentThreadDto;
    expect(pinOf('img@p1')).toEqual({ imageId: 'img', pinId: 'p1' });
    expect(pinOf('note-1')).toBeNull();
    const pins = imagePins([thread('img@p1', { x: 0.1, y: 0.2 }), thread('note-1', null), thread('img@p2', { x: 0.5, y: 0.5 }, true), thread('img@p3', { x: 0.9, y: 0.9 })]);
    expect(pins.get('img')).toEqual([
      { nodeId: 'img@p1', x: 0.1, y: 0.2, n: 1, resolved: false },
      { nodeId: 'img@p3', x: 0.9, y: 0.9, n: 2, resolved: false },
    ]);
    const board = new BoardDoc();
    const id = board.addMedia({ id: 'f', name: 'mock.png', mime: 'image/png', size: 1 }, 0, 0, { w: 10, h: 10 });
    expect(nodeLabel(board, `${id}@p1`)).toBe('Pin on mock.png');
    expect(nodeLabel(board, 'gone@p1')).toBe('A pin on a deleted image');
    board.destroy();
  });
});
