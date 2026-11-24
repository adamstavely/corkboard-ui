import type { BoardDoc, Frame, Item, Layout, NoteColor, Part } from '../board-doc';
import { plainText } from '../comments';
import { usecaseEngine } from './vendor/usecase';

/**
 * Editable use case diagrams, from Mermaid (a flowchart marked `%% @type usecase`): the Ultimate Diagram skill's reader
 * and layout engine (vendor/) place actors, system boundaries (subjects) and use cases, which become board things — a
 * frame for the diagram and each subject, an actor or ellipse per actor and use case, arrows for associations,
 * «include», «extend» and "is a" — tagged with their parts so the diagram can be laid out again and read back.
 */

const TOKENS = { font: { metrics: { label: 7.4, title: 7.4, detail: 6.4, note: 6.2, type: 6.6, edgeLabel: 7, edgeWrap: 6.6 } } };

type Pt = [number, number];
export interface UcSubject {
  id: string;
  name: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface UcActor {
  id: string;
  name: string;
  kind?: 'person' | 'system' | 'time';
  parent?: string;
  abstract?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface UcCase {
  id: string;
  name: string;
  subject?: string;
  color?: string;
  refs?: string[];
  level?: string;
  extensionPoints?: string[];
  parent?: string;
  abstract?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface UcLink {
  id: string;
  type: 'association' | 'include' | 'extend';
  from: string;
  to: string;
  condition?: string;
  extensionPoint?: string;
  navigable?: boolean;
  points?: Pt[];
  labelBox?: { x: number; y: number; w: number; h: number };
}
export interface UcData {
  diagramType: 'usecase';
  title?: string;
  colorKey?: Record<string, string>;
  subjects: UcSubject[];
  actors: UcActor[];
  useCases: UcCase[];
  links: UcLink[];
  notes?: { id: string; text: string; useCases?: string[]; actors?: string[] }[];
  _parents?: { from: string; to: string; points: Pt[] }[];
}
interface UcEngine {
  layoutDiagram(data: UcData): void;
  routeDiagram(data: UcData): void;
  fromMermaid(text: string): { data: UcData; infos: string[]; warnings: string[] };
  toMermaid(data: UcData, opts?: object): string;
}
let engine: UcEngine | undefined;
const ucEngine = (): UcEngine => (engine ??= usecaseEngine(TOKENS) as UcEngine);

/** The skill's pixels are drawn this much bigger on the board, as flowcharts are. */
const S = 1.25;
const PAD = 24;
const TITLE = 56;
const NOTE = { w: 220, h: 140, gap: 24 };
/** Palette slots 1–8 (a use case's feature area) as note colours. */
const SLOT_COLOURS: NoteColor[] = ['blue', 'green', 'yellow', 'purple', 'pink', 'gray', 'blue', 'green'];
const slotColour = (slot: string | undefined): NoteColor => SLOT_COLOURS[(Number(slot) || 1) - 1] ?? 'blue';
const colourSlot = (colour: NoteColor): string => String(SLOT_COLOURS.indexOf(colour) + 1 || 1);
/** How an actor that isn't a person is labelled on the board. */
const STEREOTYPE: Record<string, string> = { system: '«system»', time: '«time»' };

/** Whether Mermaid text is a use case diagram (a flowchart with `%% @type usecase`). */
export const isUsecaseText = (text: string): boolean => /^\s*%%\s*@type\s+usecase\b/m.test(text) && /^\s*(flowchart|graph)\b/m.test(text);

/** Mermaid read as a use case diagram, with the reader's warnings; or why it can't be read. */
export function parseUsecase(text: string): { data: UcData; warnings: string[] } | { error: string } {
  try {
    const { data, warnings } = ucEngine().fromMermaid(text);
    if (!data.useCases?.length && !data.actors?.length) return { error: 'The use case diagram has no actors or use cases.' };
    return { data, warnings: warnings.map((w) => w.replace(/^\[WARN\]\s*/, '')) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The use case diagram could not be read.' };
  }
}

/** The words on an «include» or «extend» arrow. */
function linkLabel(l: UcLink): string {
  if (l.type === 'include') return '«include»';
  if (l.type !== 'extend') return '';
  return `«extend»${l.extensionPoint ? ` (${l.extensionPoint})` : ''}${l.condition ? `: ${l.condition}` : ''}`;
}

/** An arrow's look for each kind of link: plain lines for associations, dashed with a head for «include»/«extend», a triangle for "is a". */
function linkArrow(l: UcLink): NonNullable<Layout['arrows']>[number] {
  const dashed = l.type !== 'association';
  return {
    from: l.from,
    to: l.to,
    route: 'curve',
    dash: dashed ? 'dashed' : 'solid',
    weight: 2,
    start: 'none',
    end: dashed || l.navigable ? 'arrow' : 'none',
    ...(linkLabel(l) ? { label: linkLabel(l) } : {}),
  };
}

/** A use case diagram's model laid out afresh as board things, from the layout's top-left. */
export function layoutUsecase(data: UcData): Layout {
  ucEngine().layoutDiagram(data);
  const at = (x = 0, y = 0) => ({ x: Math.round(PAD + x * S), y: Math.round(TITLE + y * S) });
  const size = (w = 0, h = 0) => ({ w: Math.max(1, Math.round(w * S)), h: Math.max(1, Math.round(h * S)) });
  const things = [...data.subjects, ...data.actors, ...data.useCases];
  const right = Math.max(...things.map((t) => (t.x ?? 0) + (t.w ?? 0)));
  const bottom = Math.max(...things.map((t) => (t.y ?? 0) + (t.h ?? 0)));
  const keys = Object.entries(data.colorKey ?? {});
  const legendH = keys.length ? 48 : 0;
  const diagram = { w: Math.round(PAD * 2 + right * S), h: Math.round(TITLE + bottom * S + PAD + legendH) };
  const layout: Layout = { frames: [], shapes: [], notes: [], texts: [], arrows: [] };
  layout.frames!.push({ key: 'diagram', title: data.title?.trim() || 'Use cases', x: 0, y: 0, ...diagram, look: 'outline', part: { role: 'diagram', key: 'diagram', type: 'usecase' } });
  for (const s of data.subjects) layout.frames!.push({ key: `group:${s.id}`, title: s.name, ...at(s.x, s.y), ...size(s.w, s.h), look: 'card', part: { role: 'group', key: s.id } });
  for (const a of data.actors) {
    const person = !a.kind || a.kind === 'person';
    layout.shapes!.push({
      key: a.id,
      shape: person ? 'actor' : 'rect',
      color: person ? 'gray' : 'gray',
      label: person ? a.name : `${STEREOTYPE[a.kind!]}\n${a.name}`,
      ...at(a.x, a.y),
      ...size(a.w, a.h),
      part: { role: 'step', key: a.id, type: person ? 'actor' : a.kind!, ...(a.abstract ? { extra: { abstract: true } } : {}) },
    });
  }
  for (const u of data.useCases) {
    const extra: Record<string, string | string[] | boolean> = {};
    if (u.refs?.length) extra['refs'] = u.refs;
    if (u.extensionPoints?.length) extra['points'] = u.extensionPoints;
    if (u.abstract) extra['abstract'] = true;
    layout.shapes!.push({
      key: u.id,
      shape: 'ellipse',
      color: slotColour(u.color),
      label: u.name,
      ...at(u.x, u.y),
      ...size(u.w, u.h),
      part: { role: 'step', key: u.id, type: u.level === 'subfunction' ? 'subfunction' : 'usecase', ...(Object.keys(extra).length ? { extra } : {}) },
    });
  }
  for (const l of data.links) layout.arrows!.push(linkArrow(l));
  for (const t of [...data.actors, ...data.useCases]) if (t.parent) layout.arrows!.push({ from: t.id, to: t.parent, route: 'curve', start: 'none', end: 'triangle', label: '' });
  // The colour key: a swatch and a name per feature area, along the diagram's foot.
  keys.forEach(([slot, name], i) => {
    const x = PAD + i * 200;
    const y = diagram.h - legendH + 8;
    layout.shapes!.push({ key: `legend:${slot}`, shape: 'rect', color: slotColour(slot), label: '', x, y, w: 24, h: 24, part: { role: 'legend', key: `legend:${slot}` } });
    layout.texts!.push({ key: `legend-name:${slot}`, text: name.slice(0, 60), size: 'sm', x: x + 32, y: y - 2, w: 160, part: { role: 'legend', key: `legend-name:${slot}` } });
  });
  // Remarks under the diagram, joined by dotted lines.
  (data.notes ?? []).forEach((n, i) => {
    const key = `note:${n.id}`;
    layout.notes!.push({ key, text: n.text, color: 'yellow', x: i * (NOTE.w + NOTE.gap), y: diagram.h + NOTE.gap * 2, w: NOTE.w, h: NOTE.h, part: { role: 'note', key: n.id } });
    for (const id of [...(n.useCases ?? []), ...(n.actors ?? [])]) layout.arrows!.push({ from: key, to: id, route: 'straight', dash: 'dotted', start: 'none', end: 'none', weight: 1 });
  });
  return layout;
}

// ── On the board ────────────────────────────────────────────────────────────

type Box = { x: number; y: number; w: number; h: number };
const centreIn = (b: Box, f: Box) => {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h;
};

/** A link's kind from how its arrow looks: a triangle is "is a"; dashed is «extend» if it says so, else «include». */
function linkOf(c: { label: string; dash: string; end: string }): { type: UcLink['type'] | 'parent'; condition?: string; extensionPoint?: string; navigable?: boolean } {
  if (c.end === 'triangle') return { type: 'parent' };
  if (c.dash !== 'solid') {
    if (/extend/i.test(c.label)) {
      const m = /extend»?\s*(?:\(([^)]*)\))?\s*(?::\s*(.*))?$/i.exec(c.label);
      return { type: 'extend', ...(m?.[1] ? { extensionPoint: m[1].trim() } : {}), ...(m?.[2] ? { condition: m[2].trim() } : {}) };
    }
    return { type: 'include' };
  }
  return { type: 'association', ...(c.end === 'arrow' ? { navigable: true } : {}) };
}

/**
 * A use case diagram on the board read back as its model, with positions in the skill's pixels from the diagram's
 * origin (for routing); arrows keep the board's ids.
 */
export function readUsecase(board: BoardDoc, diagramId: string, withPositions = true, shownOnly = withPositions): UcData | null {
  const frame = board.frames().find((f) => f.id === diagramId);
  if (frame?.part?.role !== 'diagram' || frame.part.type !== 'usecase') return null;
  const ox = frame.x + PAD;
  const oy = frame.y + TITLE;
  const pos = (b: Box) => (withPositions ? { x: (b.x - ox) / S, y: (b.y - oy) / S, w: b.w / S, h: b.h / S } : {});
  const subjects = board.frames().filter((f) => f.part?.of === diagramId && f.part.role === 'group');
  // Sub-functions hidden at goal level aren't drawn, routed or laid out; the text keeps them.
  const things = board
    .items()
    .filter((i): i is Item & { kind: 'shape' } => i.kind === 'shape' && i.part?.of === diagramId && i.part.role === 'step' && !(shownOnly && i.part.extra?.['hidden'] === true));
  const keyOf = new Map(things.map((t) => [t.id, t.part!.key]));
  const isCase = (t: Item) => t.part!.type === 'usecase' || t.part!.type === 'subfunction';
  const actors: UcActor[] = [];
  const useCases: UcCase[] = [];
  const links: UcLink[] = [];
  const parents = new Map<string, string>();
  for (const c of board.connectors()) {
    if (!keyOf.has(c.from) || !keyOf.has(c.to)) continue;
    const kind = linkOf(c);
    if (kind.type === 'parent') parents.set(keyOf.get(c.from)!, keyOf.get(c.to)!);
    else links.push({ id: c.id, from: keyOf.get(c.from)!, to: keyOf.get(c.to)!, ...kind, type: kind.type });
  }
  for (const t of [...things].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const key = t.part!.key;
    const extra = t.part!.extra ?? {};
    if (isCase(t)) {
      const subject = subjects.find((s) => centreIn(t, s));
      useCases.push({
        id: key,
        name: t.label,
        ...(subject ? { subject: subject.part!.key } : {}),
        color: colourSlot(t.color),
        ...(Array.isArray(extra['refs']) ? { refs: extra['refs'] } : {}),
        ...(Array.isArray(extra['points']) ? { extensionPoints: extra['points'] } : {}),
        ...(extra['abstract'] === true ? { abstract: true } : {}),
        ...(t.part!.type === 'subfunction' ? { level: 'subfunction' } : {}),
        ...(parents.has(key) ? { parent: parents.get(key) } : {}),
        ...pos(t),
      });
    } else {
      const kind = t.part!.type === 'system' || t.part!.type === 'time' ? t.part!.type : 'person';
      actors.push({
        id: key,
        name: kind === 'person' ? t.label : t.label.replace(/^«(system|time)»\s*/, ''),
        ...(kind === 'person' ? {} : { kind }),
        ...(extra['abstract'] === true ? { abstract: true } : {}),
        ...(parents.has(key) ? { parent: parents.get(key) } : {}),
        ...pos(t),
      });
    }
  }
  const legend = board.items().filter((i) => i.part?.of === diagramId && i.part.role === 'legend' && i.kind === 'shape');
  const colorKey: Record<string, string> = {};
  for (const swatch of legend) {
    const slot = swatch.part!.key.replace(/^legend:/, '');
    const name = board.items().find((i) => i.part?.of === diagramId && i.part.key === `legend-name:${slot}`);
    if (name?.kind === 'text' && swatch.kind === 'shape') colorKey[colourSlot(swatch.color)] = name.text;
  }
  const notes = board
    .notes()
    .filter((n) => n.part?.of === diagramId && n.part.role === 'note')
    .map((n) => {
      const joined = board
        .connectors()
        .filter((c) => c.from === n.id && keyOf.has(c.to))
        .map((c) => keyOf.get(c.to)!);
      return { id: n.part!.key, text: plainText(n.text), useCases: joined.filter((k) => useCases.some((u) => u.id === k)), actors: joined.filter((k) => actors.some((a) => a.id === k)) };
    });
  return {
    diagramType: 'usecase',
    title: frame.title,
    ...(Object.keys(colorKey).length ? { colorKey } : {}),
    subjects: subjects.sort((a, b) => a.y - b.y || a.x - b.x).map((s) => ({ id: s.part!.key, name: s.title, ...pos(s) })),
    actors,
    useCases,
    links,
    ...(notes.length ? { notes } : {}),
  };
}

/** A use case diagram on the board written as Mermaid, as the skill writes it. */
export function usecaseMermaid(board: BoardDoc, diagramId: string): string | null {
  const data = readUsecase(board, diagramId, false);
  return data ? ucEngine().toMermaid(data, {}) : null;
}

/** An arrow between the things of a use case diagram, as the skill routes it: a curve. */
export interface UcRoute {
  d: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  angle: number;
  startAngle: number;
  mid: { x: number; y: number };
  points: { x: number; y: number }[];
}

const routeCache = new Map<string, { key: string; routes: Map<string, UcRoute> }>();

/** The arrows of a use case diagram routed by the skill's engine round its things, kept while nothing they go round changes. */
export function routeUsecase(board: BoardDoc, diagram: Frame): Map<string, UcRoute> {
  const data = readUsecase(board, diagram.id);
  if (!data) return new Map();
  const key = JSON.stringify([diagram.x, diagram.y, data]);
  const cached = routeCache.get(diagram.id);
  if (cached?.key === key) return cached.routes;
  ucEngine().routeDiagram(data);
  const ox = diagram.x + PAD;
  const oy = diagram.y + TITLE;
  const toBoard = ([x, y]: Pt) => ({ x: ox + x * S, y: oy + y * S });
  const routes = new Map<string, UcRoute>();
  const add = (id: string, pts: Pt[] | undefined, box?: Box) => {
    if (!pts || pts.length < 2) return;
    const p = pts.map(toBoard);
    const [a, b] = [p[0], p[1]];
    const [y, z] = [p[p.length - 2], p[p.length - 1]];
    const d = p.length === 4 ? `M ${a.x} ${a.y} C ${p[1].x} ${p[1].y} ${p[2].x} ${p[2].y} ${z.x} ${z.y}` : `M ${p.map((q) => `${q.x} ${q.y}`).join(' L ')}`;
    const mid = box ? { x: ox + (box.x + box.w / 2) * S, y: oy + (box.y + box.h / 2) * S } : p.length === 4 ? { x: (a.x + 3 * p[1].x + 3 * p[2].x + z.x) / 8, y: (a.y + 3 * p[1].y + 3 * p[2].y + z.y) / 8 } : { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
    routes.set(id, { d, start: a, end: z, angle: Math.atan2(z.y - y.y, z.x - y.x), startAngle: Math.atan2(a.y - b.y, a.x - b.x), mid, points: p });
  };
  for (const l of data.links) add(l.id, l.points, l.labelBox);
  // "Is a" arrows: the board's arrow from the child to its parent.
  const things = board.items().filter((i) => i.part?.of === diagram.id && i.part.role === 'step');
  const idOf = new Map(things.map((t) => [t.part!.key, t.id]));
  for (const p of data._parents ?? []) {
    const from = idOf.get(p.from);
    const to = idOf.get(p.to);
    const arrow = board.connectors().find((c) => c.from === from && c.to === to && c.end === 'triangle');
    if (arrow) add(arrow.id, p.points);
  }
  routeCache.set(diagram.id, { key, routes });
  return routes;
}

/** Where Tidy puts a use case diagram's things, by their keys in its layout. */
export function usecaseKeys(board: BoardDoc, diagramId: string): Map<string, string> {
  const byKey = new Map<string, string>([['diagram', diagramId]]);
  for (const f of board.frames()) if (f.part?.of === diagramId && f.part.role === 'group') byKey.set(`group:${f.part.key}`, f.id);
  for (const i of board.items()) {
    if (i.part?.of !== diagramId) continue;
    if (i.part.role === 'step') byKey.set(i.part.key, i.id);
    if (i.part.role === 'legend') byKey.set(i.part.key, i.id);
  }
  for (const n of board.notes()) if (n.part?.of === diagramId && n.part.role === 'note') byKey.set(`note:${n.part.key}`, n.id);
  return byKey;
}

/** Lays a use case diagram on the board out again where it is (one undo step). */
export function tidyUsecase(board: BoardDoc, diagramId: string): boolean {
  const frame = board.frames().find((f) => f.id === diagramId);
  const data = readUsecase(board, diagramId, false, true);
  if (!frame || !data) return false;
  const layout = layoutUsecase(data);
  const byKey = usecaseKeys(board, diagramId);
  const boxes = new Map<string, Box>();
  for (const t of [...(layout.frames ?? []), ...(layout.shapes ?? []), ...(layout.texts ?? [])]) {
    const id = t.key && byKey.get(t.key);
    if (id) boxes.set(id, { x: frame.x + t.x, y: frame.y + t.y, w: 'h' in t ? (t.w ?? 0) : 0, h: 'h' in t ? (t.h ?? 0) : 0 });
  }
  board.placeBoxes(boxes);
  return true;
}

/** Whether a use case diagram shows its sub-functions (off: goal level, the user goals only). */
export const showsSubfunctions = (board: BoardDoc, diagramId: string) =>
  board.frames().find((f) => f.id === diagramId)?.part?.extra?.['goalLevel'] !== true;

/** Shows or hides a use case diagram's sub-functions, and lays it out again. */
export function setSubfunctionsShown(board: BoardDoc, diagramId: string, shown: boolean): void {
  const frame = board.frames().find((f) => f.id === diagramId);
  if (!frame?.part) return;
  const parts = new Map<string, Part>();
  const { goalLevel: _g, ...rest } = frame.part.extra ?? {};
  parts.set(frame.id, { ...frame.part, extra: shown ? rest : { ...rest, goalLevel: true } });
  for (const i of board.items()) {
    if (i.part?.of !== diagramId || i.part.type !== 'subfunction') continue;
    const { hidden: _h, ...others } = i.part.extra ?? {};
    parts.set(i.id, { ...i.part, extra: shown ? others : { ...others, hidden: true } });
  }
  board.setParts(parts);
  tidyUsecase(board, diagramId);
}

/** Whether a use case diagram shows its use cases' requirement ids under their names. */
export const showsRefs = (board: BoardDoc, diagramId: string) => board.frames().find((f) => f.id === diagramId)?.part?.extra?.['showRefs'] === true;

/** Shows or hides the requirement ids under a use case diagram's use cases. */
export function setRefsShown(board: BoardDoc, diagramId: string, shown: boolean): void {
  const frame = board.frames().find((f) => f.id === diagramId);
  if (!frame?.part) return;
  const { showRefs: _s, ...rest } = frame.part.extra ?? {};
  board.setParts(new Map([[frame.id, { ...frame.part, extra: shown ? { ...rest, showRefs: true } : rest }]]));
}

/** A new use case on the board, from a shape dropped in: its part, by the shape. */
export const USECASE_KINDS: Partial<Record<string, string>> = { ellipse: 'usecase', actor: 'actor', rect: 'system' };
export type { Part };
