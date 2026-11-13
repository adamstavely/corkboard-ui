import { keywords, noteGraph } from './clusters';
import { ledgerEntries, type ModelRun } from './ledger';

describe("the model's history", () => {
  const run = (id: string, over: Partial<ModelRun> = {}): ModelRun => ({ id, at: 1, model: 'Claude', forName: 'Ada', action: 'Did it', created: [], removed: [], changed: [], undone: false, ...over });

  it('lists runs, and ties a run to the earlier one whose notes it changed', () => {
    const shown = ledgerEntries([run('a', { created: ['n1', 'f1'] }), run('b', { changed: [{ id: 'n1' }] }), run('c', { removed: [{ id: 'f2' }] })]);
    expect(shown[0]).toEqual({ id: 'a', action: 'Did it', target: 'for Ada', system: 'Claude', at: 1, detail: '2 added' });
    expect(shown[1].dependsOn).toEqual(['a']);
    expect(shown[2].dependsOn).toBeUndefined();
  });
});

describe('note clusters', () => {
  it('links notes that share words, ignoring common ones', () => {
    expect([...keywords('The deploys are slow, and deploy is flaky')]).toEqual(['deploy', 'slow', 'flaky']);
    const { nodes, links } = noteGraph([
      { id: 'a', text: 'Deploys are slow', frame: 'Delivery' },
      { id: 'b', text: 'Slow deploy pipeline' },
      { id: 'c', text: 'Lunch was great' },
    ]);
    expect(links).toEqual([{ source: 'a', target: 'b', value: 2 }]);
    expect(nodes.map((n) => [n.id, n.group, n.size])).toEqual([
      ['a', 'Delivery', 2],
      ['b', 'Not in a frame', 2],
      ['c', 'Not in a frame', 1],
    ]);
  });
});
