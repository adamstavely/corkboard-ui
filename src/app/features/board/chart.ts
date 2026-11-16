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

/**
 * A number as someone typed it: "1,200" and "1 200" are twelve hundred, "3,5" (a decimal comma) and "3.5" are three and
 * a half. NaN when it isn't a number.
 */
export function parseNumber(typed: string): number {
  const text = typed.trim().replace(/[\s\u00a0]/g, '');
  if (!text) return NaN;
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) return Number(text.replace(/,/g, ''));
  if (/^[-+]?\d*,\d+$/.test(text)) return Number(text.replace(',', '.'));
  return Number(text);
}

/**
 * The rows as a chart draws them. Charts merge rows that share a label (adding their values), so each label is made
 * its own: an empty one becomes "Row 3", a repeated one "Coffee (2)". A pie's labels carry their share, as its slices
 * name their category rather than only a percentage.
 */
export function chartPoints(kind: ChartKind, rows: readonly ChartRow[]): ChartRow[] {
  const seen = new Map<string, number>();
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.value), 0);
  return rows.map((r, i) => {
    const base = r.label.trim() || `Row ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const label = n > 1 ? `${base} (${n})` : base;
    if (kind !== 'pie' || total <= 0) return { label, value: r.value };
    return { label: `${label} · ${Math.round((Math.max(0, r.value) / total) * 100)}%`, value: r.value };
  });
}

/** A chart as Trench Coat's chart spec, to draw it as an SVG (for image exports). */
export function chartSpec(kind: ChartKind, title: string, rows: readonly ChartRow[]): ChartSpec {
  const points = chartPoints(kind, rows);
  return {
    type: kind,
    title,
    data: kind === 'pie' ? points.map((r) => ({ label: r.label, value: r.value })) : points.map((r) => ({ x: r.label, y: r.value })),
    encoding: kind === 'pie' ? { label: 'label', value: 'value' } : { x: 'x', y: 'y' },
    // As on the board: rows in the order written (not sorted as numbers or dates), slices named.
    options: { still: true, ...(kind === 'pie' ? { labelMode: 'label' } : { xType: 'band' }) },
  };
}

/** A chart's rows as a Markdown table. */
export function chartMarkdown(title: string, rows: readonly ChartRow[]): string[] {
  const cell = (s: string) => s.replace(/\|/g, '\\|');
  return [`**${cell(title || 'Chart')}**`, '', '| | |', '| --- | ---: |', ...rows.map((r) => `| ${cell(r.label)} | ${r.value} |`)];
}
