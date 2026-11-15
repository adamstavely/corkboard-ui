import type { ChartSpec } from '@adamstavely/trenchcoat/charts';

/** The charts a board can hold: bars to compare, a line for a trend, a pie for shares of a whole. */
export const CHART_KINDS = ['bar', 'line', 'pie'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
export const CHART_NAMES: Record<ChartKind, string> = { bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart' };

/** One row of a chart's data: a label and its number. */
export interface ChartRow {
  label: string;
  value: number;
}

/** The most rows a chart keeps; more than this doesn't read on a board. */
export const MAX_CHART_ROWS = 30;

/** What a new chart starts with, to show how it works. */
export const STARTER_ROWS: ChartRow[] = [
  { label: 'Ideas', value: 12 },
  { label: 'In progress', value: 5 },
  { label: 'Done', value: 8 },
];

/** Rows as the board can keep them: labelled, finite numbers, at most MAX_CHART_ROWS. */
export function cleanRows(rows: unknown): ChartRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .flatMap((r) => {
      const row = r as Partial<ChartRow> | null;
      const value = Number(row?.value);
      return row && typeof row.label === 'string' && Number.isFinite(value) ? [{ label: row.label.slice(0, 80), value }] : [];
    })
    .slice(0, MAX_CHART_ROWS);
}

/** A chart as Trench Coat's chart spec, to draw it as an SVG (for image exports). */
export function chartSpec(kind: ChartKind, title: string, rows: readonly ChartRow[]): ChartSpec {
  return {
    type: kind,
    title,
    data: kind === 'pie' ? rows.map((r) => ({ label: r.label, value: r.value })) : rows.map((r) => ({ x: r.label, y: r.value })),
    encoding: kind === 'pie' ? { label: 'label', value: 'value' } : { x: 'x', y: 'y' },
    options: { still: true },
  };
}

/** A chart's rows as a Markdown table. */
export function chartMarkdown(title: string, rows: readonly ChartRow[]): string[] {
  const cell = (s: string) => s.replace(/\|/g, '\\|');
  return [`**${cell(title || 'Chart')}**`, '', '| | |', '| --- | ---: |', ...rows.map((r) => `| ${cell(r.label)} | ${r.value} |`)];
}
