import * as Y from 'yjs';
import { BoardDoc } from './board-doc';
import { chartMarkdown, chartPoints, chartSpec, cleanRows, MAX_CHART_ROWS, parseNumber, STARTER_ROWS } from './chart';
import { boardMarkdown, chartPlot } from './export';

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

describe('chart numbers and labels', () => {
  it('reads numbers as people type them, with thousands separators or a decimal comma', () => {
    expect(parseNumber('1,200')).toBe(1200);
    expect(parseNumber('1,200.5')).toBe(1200.5);
    expect(parseNumber('3,5')).toBe(3.5);
    expect(parseNumber(' 3.5 ')).toBe(3.5);
    expect(parseNumber('1 200')).toBe(1200);
    expect(parseNumber('-4')).toBe(-4);
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('lots')).toBeNaN();
  });

  it('keeps rows that share a label apart, names empty ones, and puts each slice\'s share in its name', () => {
    const rows = [
      { label: 'Coffee', value: 2 },
      { label: 'Coffee', value: 2 },
      { label: '', value: 4 },
    ];
    expect(chartPoints('bar', rows).map((r) => r.label)).toEqual(['Coffee', 'Coffee (2)', 'Row 3']);
    expect(chartPoints('pie', rows).map((r) => r.label)).toEqual(['Coffee · 25%', 'Coffee (2) · 25%', 'Row 3 · 50%']);
    const spec = chartSpec('line', 'T', [{ label: '3', value: 1 }, { label: '1', value: 2 }]);
    expect(spec.options).toMatchObject({ xType: 'band' });
    expect(chartSpec('pie', 'T', rows).options).toMatchObject({ labelMode: 'label' });
  });

  it('exports the plot under the title at the size it was drawn', () => {
    expect(chartPlot({ w: 520, h: 380 })).toEqual({ x: 12, y: 60, w: 496, h: 308 });
  });
});
