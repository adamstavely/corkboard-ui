import type { ArrowHead, BoardDoc, EntityColumn, EntityItem, Frame, Layout, NoteColor, Part } from '../board-doc';
import { plainText } from '../comments';
import { erdEngine } from './vendor/erd';

/**
 * Editable ER diagrams, from Mermaid's erDiagram: the Ultimate Diagram skill's reader and layout engine (vendor/) place
 * database tables and their relationships, which become board things — a frame for the diagram, a table item per
 * entity (its columns, keys and types), crow's-foot arrows (solid when identifying, dashed otherwise) — tagged with
 * their parts so the diagram can be laid out again and read back.
 */

const TOKENS = { font: { metrics: { label: 7.4, title: 7.4, detail: 6.4, note: 6.2, type: 6.6, edgeLabel: 7, edgeWrap: 6.6 } } };

type Pt = [number, number];
type End = 'one' | 'zeroOrOne' | 'oneOrMany' | 'zeroOrMany';
export interface ErEntity {
  id: string;
  name?: string;
  columns: EntityColumn[];
  color?: string;
  x?: number;
  y?: number;
  box?: { x: number; y: number; w: number; h: number };
}
export interface ErRelationship {
  id?: string;
  from: string;
  to: string;
  fromEnd: End;
  toEnd: End;
  identifying?: boolean;
  label?: string;
  columns?: string[];
  curve?: Pt[];
}
export interface ErData {
  diagramType: 'erd';
  title?: string;
  colorKey?: Record<string, string>;
  detail?: 'keys' | 'names';
  showTypes?: boolean;
  entities: ErEntity[];
  relationships: ErRelationship[];
  notes?: { id: string; text: string; entities?: string[] }[];
}
interface ErEngine {
  layoutDiagram(data: ErData, opts?: object): void;
  routeDiagram(data: ErData): void;
  fromMermaid(text: string): { data: ErData; infos: string[]; warnings: string[] };
  toMermaid(data: ErData, opts?: object): string;
  erVisibleColumns(entity: ErEntity, data: { detail?: string }): { cols: { col: EntityColumn; index: number }[]; more: number };
  ER: { HEAD_H: number; ROW_H: number; MORE_H: number };
}
let engine: ErEngine | undefined;
const er = (): ErEngine => (engine ??= erdEngine(TOKENS) as ErEngine);

export const ERD_SCALE = 1.25;
const S = ERD_SCALE;
const PAD = 24;
const TITLE = 56;
const NOTE = { w: 220, h: 140, gap: 24 };
const SLOT_COLOURS: NoteColor[] = ['blue', 'green', 'yellow', 'purple', 'pink', 'gray', 'blue', 'green'];
const slotColour = (slot?: string): NoteColor => SLOT_COLOURS[(Number(slot) || 1) - 1] ?? 'blue';
const colourSlot = (c: NoteColor) => String(SLOT_COLOURS.indexOf(c) + 1 || 1);

/** The skill's relationship ends as the board's arrow ends. */
const HEAD: Record<End, ArrowHead> = { one: 'one', zeroOrOne: 'zeroOne', oneOrMany: 'oneMany', zeroOrMany: 'zeroMany' };
const END: Partial<Record<ArrowHead, End>> = { one: 'one', zeroOne: 'zeroOrOne', oneMany: 'oneOrMany', zeroMany: 'zeroOrMany' };

/** Whether text is an ER diagram (its first line, after any front matter, is erDiagram). */
export const isErdText = (text: string): boolean => /^\s*erDiagram\b/m.test(text.replace(/^---[\s\S]*?---/, ''));

/** Mermaid read as an ER diagram, with the reader's warnings; or why it can't be read. */
export function parseErd(text: string): { data: ErData; warnings: string[] } | { error: string } {
  try {
    const { data, warnings } = er().fromMermaid(text);
    if (!data.entities?.length) return { error: 'The ER diagram has no tables.' };
    return { data, warnings: warnings.map((w) => w.replace(/^\[WARN\]\s*/, '')) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The ER diagram could not be read.' };
  }
}

/** Which columns a table shows, and how many it doesn't, at the diagram's detail. */
export const visibleColumns = (columns: EntityColumn[], detail?: string) => er().erVisibleColumns({ id: '', columns }, { detail });
/** A table's rows' heights on the board: its name strip, a column, and the "+ N more" row. */
export const erdRows = () => ({ head: er().ER.HEAD_H * S, row: er().ER.ROW_H * S, more: er().ER.MORE_H * S });

/** An ER model laid out afresh as board things, from the layout's top-left. */
export function layoutErd(data: ErData): Layout {
  er().layoutDiagram(data);
  const boxes = data.entities.map((e) => e.box ?? { x: e.x ?? 0, y: e.y ?? 0, w: 168, h: 100 });
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  const keys = Object.entries(data.colorKey ?? {});
  const legendH = keys.length ? 48 : 0;
  const diagram = { w: Math.round(PAD * 2 + right * S), h: Math.round(TITLE + bottom * S + PAD + legendH) };
  const extra: Record<string, string | boolean> = {};
  if (data.detail) extra['detail'] = data.detail;
  if (data.showTypes === false) extra['hideTypes'] = true;
  const layout: Layout = { frames: [], shapes: [], texts: [], notes: [], arrows: [], entities: [] };
  layout.frames!.push({ key: 'diagram', title: data.title?.trim() || 'Data model', x: 0, y: 0, ...diagram, look: 'outline', part: { role: 'diagram', key: 'diagram', type: 'erd', ...(Object.keys(extra).length ? { extra } : {}) } });
  data.entities.forEach((e, i) => {
    const b = boxes[i];
    layout.entities!.push({
      key: e.id,
      name: e.name ?? e.id,
      columns: e.columns,
      color: slotColour(e.color),
      x: Math.round(PAD + b.x * S),
      y: Math.round(TITLE + b.y * S),
      w: Math.round(b.w * S),
      h: Math.round(b.h * S),
      part: { role: 'step', key: e.id, type: 'table' },
    });
  });
  for (const r of data.relationships) {
    layout.arrows!.push({
      from: r.from,
      to: r.to,
      route: 'curve',
      dash: r.identifying ? 'solid' : 'dashed',
      weight: 2,
      start: HEAD[r.fromEnd] ?? 'zeroMany',
      end: HEAD[r.toEnd] ?? 'one',
      ...(r.label ? { label: r.label.slice(0, 200) } : {}),
    });
  }
  keys.forEach(([slot, name], i) => {
    const x = PAD + i * 200;
    const y = diagram.h - legendH + 8;
    layout.shapes!.push({ key: `legend:${slot}`, shape: 'rect', color: slotColour(slot), label: '', x, y, w: 24, h: 24, part: { role: 'legend', key: `legend:${slot}` } });
    layout.texts!.push({ key: `legend-name:${slot}`, text: name.slice(0, 60), size: 'sm', x: x + 32, y: y - 2, w: 160, part: { role: 'legend', key: `legend-name:${slot}` } });
  });
  (data.notes ?? []).forEach((n, i) => {
    const key = `note:${n.id}`;
    layout.notes!.push({ key, text: n.text, color: 'yellow', x: i * (NOTE.w + NOTE.gap), y: diagram.h + NOTE.gap * 2, w: NOTE.w, h: NOTE.h, part: { role: 'note', key: n.id } });
    for (const id of n.entities ?? []) layout.arrows!.push({ from: key, to: id, route: 'straight', dash: 'dotted', start: 'none', end: 'none', weight: 1 });
  });
  return layout;
}

// ── On the board ────────────────────────────────────────────────────────────

/** The diagram's display: which columns its tables show (all, keys only, names only) and whether they show types. */
export function erdDisplay(board: BoardDoc, diagramId: string): { detail?: 'keys' | 'names'; showTypes: boolean } {
  const extra = board.frames().find((f) => f.id === diagramId)?.part?.extra ?? {};
  const detail = extra['detail'] === 'keys' || extra['detail'] === 'names' ? extra['detail'] : undefined;
  return { ...(detail ? { detail } : {}), showTypes: extra['hideTypes'] !== true };
}

/** An ER diagram on the board read back as its model; with positions (the skill's pixels from the diagram's origin) for routing. */
export function readErd(board: BoardDoc, diagramId: string, withPositions = true): ErData | null {
  const frame = board.frames().find((f) => f.id === diagramId);
  if (frame?.part?.role !== 'diagram' || frame.part.type !== 'erd') return null;
  const ox = frame.x + PAD;
  const oy = frame.y + TITLE;
  const tables = board.items().filter((i): i is EntityItem => i.kind === 'entity' && i.part?.of === diagramId && i.part.role === 'step');
  const keyOf = new Map(tables.map((t) => [t.id, t.part!.key]));
  const display = erdDisplay(board, diagramId);
  const entities: ErEntity[] = [...tables]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t) => ({
      id: t.part!.key,
      ...(t.name !== t.part!.key ? { name: t.name } : {}),
      columns: t.columns,
      color: colourSlot(t.color),
      ...(withPositions ? { x: (t.x - ox) / S, y: (t.y - oy) / S, box: { x: (t.x - ox) / S, y: (t.y - oy) / S, w: t.w / S, h: t.h / S } } : {}),
    }));
  const relationships: ErRelationship[] = board
    .connectors()
    .filter((c) => keyOf.has(c.from) && keyOf.has(c.to))
    .map((c) => ({
      ...(withPositions ? { id: c.id } : {}),
      from: keyOf.get(c.from)!,
      to: keyOf.get(c.to)!,
      fromEnd: END[c.start] ?? 'zeroOrMany',
      toEnd: END[c.end] ?? 'one',
      identifying: c.dash === 'solid',
      ...(c.label ? { label: c.label } : {}),
    }));
  const colorKey: Record<string, string> = {};
  for (const swatch of board.items().filter((i) => i.part?.of === diagramId && i.part.role === 'legend' && i.kind === 'shape')) {
    const slot = swatch.part!.key.replace(/^legend:/, '');
    const name = board.items().find((i) => i.part?.of === diagramId && i.part.key === `legend-name:${slot}`);
    if (name?.kind === 'text') colorKey[slot] = name.text;
  }
  const notes = board
    .notes()
    .filter((n) => n.part?.of === diagramId && n.part.role === 'note')
    .map((n) => ({
      id: n.part!.key,
      text: plainText(n.text),
      entities: board
        .connectors()
        .filter((c) => c.from === n.id && keyOf.has(c.to))
        .map((c) => keyOf.get(c.to)!),
    }));
  return {
    diagramType: 'erd',
    title: frame.title,
    ...(Object.keys(colorKey).length ? { colorKey } : {}),
    ...(display.detail ? { detail: display.detail } : {}),
    ...(display.showTypes ? {} : { showTypes: false }),
    entities,
    relationships,
    ...(notes.length ? { notes } : {}),
  };
}

/** An ER diagram on the board written as Mermaid, as the skill writes it. */
export function erdMermaid(board: BoardDoc, diagramId: string): string | null {
  const data = readErd(board, diagramId, false);
  return data ? er().toMermaid(data, {}) : null;
}

export interface ErRoute {
  d: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  angle: number;
  startAngle: number;
  mid: { x: number; y: number };
  points: { x: number; y: number }[];
}
const cache = new Map<string, { key: string; routes: Map<string, ErRoute> }>();

/** An ER diagram's relationships as the skill's engine curves them between the tables where they are. */
export function routeErd(board: BoardDoc, diagram: Frame): Map<string, ErRoute> {
  const data = readErd(board, diagram.id);
  if (!data) return new Map();
  const key = JSON.stringify([diagram.x, diagram.y, data]);
  const hit = cache.get(diagram.id);
  if (hit?.key === key) return hit.routes;
  try {
    er().routeDiagram(data);
  } catch {
    return new Map();
  }
  const ox = diagram.x + PAD;
  const oy = diagram.y + TITLE;
  const at = ([x, y]: Pt) => ({ x: ox + x * S, y: oy + y * S });
  const routes = new Map<string, ErRoute>();
  for (const r of data.relationships) {
    if (!r.id || !r.curve || r.curve.length !== 4) continue;
    const [a, c1, c2, z] = r.curve.map(at);
    routes.set(r.id, {
      d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${z.x} ${z.y}`,
      start: a,
      end: z,
      angle: Math.atan2(z.y - c2.y, z.x - c2.x),
      startAngle: Math.atan2(a.y - c1.y, a.x - c1.x),
      mid: { x: (a.x + 3 * c1.x + 3 * c2.x + z.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + z.y) / 8 },
      points: [a, c1, c2, z],
    });
  }
  cache.set(diagram.id, { key, routes });
  return routes;
}

/** Lays an ER diagram on the board out again where it is (one undo step), at a display if given. */
export function tidyErd(board: BoardDoc, diagramId: string, display?: { detail?: 'keys' | 'names' | 'all'; showTypes?: boolean }): boolean {
  const frame = board.frames().find((f) => f.id === diagramId);
  const data = readErd(board, diagramId, false);
  if (!frame?.part || !data) return false;
  if (display?.detail) data.detail = display.detail === 'all' ? undefined : display.detail;
  if (display?.showTypes !== undefined) data.showTypes = display.showTypes;
  const layout = layoutErd(data);
  const byKey = new Map<string, string>([['diagram', diagramId]]);
  for (const i of board.items()) if (i.part?.of === diagramId && (i.part.role === 'step' || i.part.role === 'legend')) byKey.set(i.part.key, i.id);
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const t of [...(layout.frames ?? []), ...(layout.entities ?? []), ...(layout.shapes ?? []), ...(layout.texts ?? [])]) {
    const id = t.key && byKey.get(t.key);
    if (id) boxes.set(id, { x: frame.x + t.x, y: frame.y + t.y, w: 'h' in t ? (t.w ?? 0) : 0, h: 'h' in t ? (t.h ?? 0) : 0 });
  }
  const own = layout.frames![0].part!;
  board.placeBoxes(boxes, new Map<string, Part>([[diagramId, { ...frame.part, ...own, of: diagramId, ...(frame.part.auto === false ? { auto: false } : {}) }]]));
  return true;
}

/** A table's columns as lines of the diagram's text ("uuid id PK", "text? phone"), for editing. */
export const columnsText = (columns: readonly EntityColumn[]): string =>
  columns
    .map((c) => {
      const keys = [c.pk ? 'PK' : '', c.fk ? 'FK' : '', c.unique ? 'UK' : ''].filter(Boolean).join(', ');
      return `${c.type || 'text'}${c.nullable ? '?' : ''} ${c.name}${keys ? ` ${keys}` : ''}${c.note ? ` "${c.note}"` : ''}`;
    })
    .join('\n');

/** Lines of column text read back as columns; lines that aren't one are left out. */
export function readColumns(text: string): EntityColumn[] {
  return text.split('\n').flatMap((line) => {
    const m = /^\s*([\w()[\],.-]+?)(\?)?\s+([\w.-]+)\s*((?:\b(?:PK|FK|UK)\b[\s,]*)*)\s*(?:"([^"]*)")?\s*$/i.exec(line);
    if (!m) return [];
    const keys = (m[4] ?? '').toUpperCase();
    return [
      {
        name: m[3],
        type: m[1],
        ...(keys.includes('PK') ? { pk: true } : {}),
        ...(keys.includes('FK') ? { fk: true } : {}),
        ...(keys.includes('UK') ? { unique: true } : {}),
        ...(m[2] ? { nullable: true } : {}),
        ...(m[5] ? { note: m[5] } : {}),
      },
    ];
  });
}

/** What a new ER diagram starts as: customers, orders and their items, and products. */
export const ERD_STARTER = `---
title: Shop
---
erDiagram
  %% @colorKey 1 Sales
  %% @colorKey 3 Catalogue
  customer {
    uuid id PK
    text email UK
    text? phone
  }
  order {
    uuid id PK
    uuid customer_id FK
    timestamptz placed_at
  }
  order_item {
    uuid order_id PK, FK
    uuid product_id PK, FK
    int qty "1 to 99"
  }
  product {
    uuid id PK
    text name
  }
  customer ||..o{ order : "places"
  order ||--|{ order_item : ""
  product ||--o{ order_item : ""
  class customer,order,order_item c1
  class product c3
`;
