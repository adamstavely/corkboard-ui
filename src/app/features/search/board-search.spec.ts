import { searchGroups, snippetText } from './board-search';

describe('board search', () => {
  it("shows each board with its first matching passage as plain text", () => {
    const groups = searchGroups([
      { boardId: 'b1', title: 'Retro', updatedAt: '', snippets: ['<mark>Deploys</mark> are slow &amp; flaky', 'more'] },
      { boardId: 'b2', title: 'Deploy plan', updatedAt: '', snippets: [] },
    ]);
    expect(groups).toEqual([
      {
        id: 'boards',
        label: 'Boards',
        commands: [
          { id: 'b1', label: 'Retro', hint: 'Deploys are slow & flaky' },
          { id: 'b2', label: 'Deploy plan', hint: undefined },
        ],
      },
    ]);
  });

  it('shows no group when nothing matches', () => {
    expect(searchGroups([])).toEqual([]);
  });

  it("never turns a snippet's text into markup", () => {
    expect(snippetText('&lt;img src=x onerror=alert(1)&gt;')).toBe('<img src=x onerror=alert(1)>');
  });
});
