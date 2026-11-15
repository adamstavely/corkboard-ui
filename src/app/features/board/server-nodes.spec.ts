import * as Y from 'yjs';
import { BoardDoc } from './board-doc';

/**
 * Nodes the API makes on its own (corkboard-api's assistant tools), exactly as it writes them, read back the way the
 * board shows them. A kind the API makes but the board can't read would be a change the assistant reports and no one sees.
 */
describe('nodes the API makes', () => {
  it("shows the assistant's diagrams (corkboard-api diagram-node.ts placeDiagram)", () => {
    const board = new BoardDoc();
    board.doc.transact(() => {
      const node = new Y.Map<unknown>();
      board.doc.getMap('nodes').set('d1', node);
      node.set('kind', 'diagram');
      node.set('x', 100);
      node.set('y', 200);
      node.set('w', 480);
      node.set('h', 320);
      node.set('z', 1);
      node.set('source', 'flowchart TD\n  A --> B');
      node.set('author', 'assistant');
    });
    expect(board.items()).toEqual([expect.objectContaining({ id: 'd1', kind: 'diagram', source: 'flowchart TD\n  A --> B' })]);
  });

  it("shows the assistant's mini-apps (corkboard-api app-node.ts placeApp)", () => {
    const board = new BoardDoc();
    board.doc.transact(() => {
      const node = new Y.Map<unknown>();
      board.doc.getMap('nodes').set('a1', node);
      node.set('kind', 'app');
      node.set('x', 0);
      node.set('y', 0);
      node.set('w', 480);
      node.set('h', 360);
      node.set('z', 1);
      node.set('appId', 'app-1');
      node.set('title', 'Dot voting');
      node.set('version', 1);
      node.set('sources', ['n1']);
      node.set('author', 'assistant');
    });
    expect(board.items()).toEqual([expect.objectContaining({ id: 'a1', kind: 'app', appId: 'app-1', title: 'Dot voting' })]);
  });
});
