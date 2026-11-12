import { BoardDoc } from './board-doc';
import { messagesOf, nodeLabel, openCounts, plainText } from './comments';

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
      resolvedAt: resolved ? '2026-11-12T00:00:00Z' : null,
      comments: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, author: { id: i ? 'me' : 'ada', name: i ? 'Grace' : 'Ada' }, body: `c${i}`, createdAt: '2026-11-12T00:00:00Z' })),
    });
    expect([...openCounts([thread('a', false, 2), thread('b', true, 5)])]).toEqual([['node-a', 2]]);
    expect(messagesOf(thread('a', false, 2), 'me').map((m) => [m.author.name, m.text])).toEqual([
      ['Ada', 'c0'],
      ['Grace (you)', 'c1'],
    ]);
  });
});
