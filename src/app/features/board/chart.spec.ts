import * as Y from 'yjs';
import { BoardDoc } from './board-doc';
import { chartMarkdown, chartSpec, cleanRows, MAX_CHART_ROWS, STARTER_ROWS } from './chart';
import { boardMarkdown } from './export';

describe('charts', () => {
  it('go on the board with clean rows, and change as one undoable step', () => {
    const board = new BoardDoc();
    const id = board.addChart(0, 0, 'bar', 'Mood', STARTER_ROWS);
    expect(board.items()).toEqual([expect.objectContaining({ id, kind: 'chart', chart: 'bar', title: 'Mood', rows: STARTER_ROWS })]);
    board.setChart(id, { chart: 'pie', title: 'Shares', rows: [{ label: 'A', value: 1 }] });
    expect(board.items()[0]).toMatchObject({ chart: 'pie', title: 'Shares', rows: [{ label: 'A', value: 1 }] });
    board.undo.undo();
    expect(board.items()[0]).toMatchObject({ chart: 'bar', title: 'Mood' });
    // The API reads a node's "rows" as a table's row count, so a chart keeps its numbers under "data".
    const node = board.doc.getMap<Y.Map<unknown>>('nodes').get(id)!;
    expect(node.has('rows')).toBe(false);
    expect(node.get('data')).toEqual(STARTER_ROWS);
  });

  it('keep only labelled finite numbers, up to the most a chart holds', () => {
    expect(cleanRows([{ label: 'A', value: 2 }, { label: 'B', value: 'x' }, { value: 3 }, null, { label: 'C', value: '4' }])).toEqual([
      { label: 'A', value: 2 },
      { label: 'C', value: 4 },
    ]);
    expect(cleanRows(Array.from({ length: 40 }, (_, i) => ({ label: `${i}`, value: i })))).toHaveLength(MAX_CHART_ROWS);
    expect(cleanRows('nope')).toEqual([]);
  });

  it('become a chart spec to draw on their own, and a Markdown table', () => {
    expect(chartSpec('pie', 'Shares', [{ label: 'A', value: 1 }])).toMatchObject({ type: 'pie', encoding: { label: 'label', value: 'value' } });
    expect(chartSpec('bar', 'Votes', [])).toMatchObject({ type: 'bar', encoding: { x: 'x', y: 'y' } });
    expect(chartMarkdown('Votes', [{ label: 'A|B', value: 3 }])).toEqual(['**Votes**', '', '| | |', '| --- | ---: |', '| A\\|B | 3 |']);
    const board = new BoardDoc();
    board.addChart(0, 0, 'bar', 'Votes', [{ label: 'Ship', value: 2 }]);
    expect(boardMarkdown(board, 'Retro')).toContain('## Charts\n\n**Votes**');
  });
});
