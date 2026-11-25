import type { BoardDoc, Item, NoteColor, Part, ShapeKind } from '../board-doc';
import { bracketKind, c4Look, C4_KIND_NAMES, relabelC4, type C4Kind } from './c4';
import { diagramFrame } from './flow-board';
import { freshKey } from './flow-edit';
import { isFlowKind, stepColour, stepShape, type FlowKind } from './flowchart';
import { diagramType, tidyDiagram } from './kinds';

/**
 * Changing what a step of an editable diagram is (a decision rather than a task, a component rather than a container,
 * a timer event rather than a plain one), and adding the next step after one: by hand, on the board, for every kind of
 * editable diagram drawn from steps (flowcharts, state machines, BPMN processes, use case and C4 diagrams).
 */

/** One thing a step can be: its kind in its diagram, and what to call it. */
export interface StepKind {
  kind: string;
  label: string;
}

const FLOWCHART: StepKind[] = [
  { kind: 'task', label: 'Process step' },
  { kind: 'decision', label: 'Decision' },
  { kind: 'start', label: 'Start or end' },
  { kind: 'io', label: 'Input or output' },
  { kind: 'document', label: 'Document' },
  { kind: 'database', label: 'Database' },
  { kind: 'delay', label: 'Delay' },
  { kind: 'connector', label: 'Connector' },
];
const STATE: StepKind[] = [
  { kind: 'task', label: 'State' },
  { kind: 'decision', label: 'Choice' },
  { kind: 'start', label: 'Start or end' },
  { kind: 'fork', label: 'Fork' },
  { kind: 'join', label: 'Join' },
];
const BPMN: StepKind[] = [
  { kind: 'task', label: 'Task' },
  { kind: 'start', label: 'Start event' },
  { kind: 'event', label: 'Intermediate event' },
  { kind: 'end', label: 'End event' },
  { kind: 'decision', label: 'Gateway' },
  { kind: 'data', label: 'Data object' },
  { kind: 'store', label: 'Data store' },
];
const USECASE: StepKind[] = [
  { kind: 'actor', label: 'Person' },
  { kind: 'system', label: 'System' },
  { kind: 'time', label: 'Time' },
  { kind: 'usecase', label: 'Use case' },
];
const C4: StepKind[] = (Object.entries(C4_KIND_NAMES) as [C4Kind, string][]).map(
  ([kind, label]) => ({ kind, label }),
);

/** What a step in a diagram of this type can be. */
export function stepKinds(type: string | undefined): StepKind[] {
  if (type === 'flowchart') return FLOWCHART;
  if (type === 'state') return STATE;
  if (type === 'bpmn') return BPMN;
  if (type === 'usecase') return USECASE;
  if (type === 'c4') return C4;
  return [];
}

/** BPMN markers by kind of step: a task's kind, an event's trigger, a gateway's kind. The first is the plain one. */
const BPMN_MARKERS: Record<string, StepKind[]> = {
  task: [
    { kind: '', label: 'Plain task' },
    { kind: 'user', label: 'User task' },
    { kind: 'service', label: 'Service task' },
    { kind: 'script', label: 'Script task' },
    { kind: 'send', label: 'Send task' },
    { kind: 'receive', label: 'Receive task' },
    { kind: 'manual', label: 'Manual task' },
    { kind: 'rule', label: 'Business rule task' },
  ],
  event: [
    { kind: '', label: 'No trigger' },
    { kind: 'message', label: 'Message' },
    { kind: 'timer', label: 'Timer' },
    { kind: 'signal', label: 'Signal' },
    { kind: 'error', label: 'Error' },
    { kind: 'conditional', label: 'Condition' },
  ],
  decision: [
    { kind: 'exclusive', label: 'Exclusive (one way)' },
    { kind: 'parallel', label: 'Parallel (every way)' },
    { kind: 'inclusive', label: 'Inclusive (some ways)' },
    { kind: 'event', label: 'Event-based' },
    { kind: 'complex', label: 'Complex' },
  ],
};
BPMN_MARKERS['start'] = BPMN_MARKERS['event'];
BPMN_MARKERS['end'] = [...BPMN_MARKERS['event'], { kind: 'terminate', label: 'Terminate' }];

/** The markers a BPMN step of this kind can carry; none for other diagrams or kinds. */
export const bpmnMarkers = (type: string | undefined, kind: string | undefined): StepKind[] =>
  type === 'bpmn' && kind ? (BPMN_MARKERS[kind] ?? []) : [];

const STEREOTYPE: Record<string, string> = { system: '«system»', time: '«time»' };
const withoutStereotype = (label: string) => label.replace(/^«(system|time)»\s*/, '');

/** How a step of a kind looks: its shape, its colour where the kind fixes one, its marker icon and its words. */
function lookOf(
  type: string,
  kind: string,
  step: Pick<Item & { kind: 'shape' }, 'label'>,
  marker?: string,
): { shape: ShapeKind; color?: NoteColor; icon?: string | null; label?: string } {
  if (isFlowKind(type)) {
    return {
      shape: stepShape(type as FlowKind, kind),
      color: stepColour(type as FlowKind, kind),
      ...(type === 'bpmn' ? { icon: marker ? `bpmn-${marker}` : null } : {}),
    };
  }
  if (type === 'c4') {
    const look = c4Look(kind as C4Kind);
    return { shape: look.shape, color: look.color, label: relabelC4(step.label, kind as C4Kind) };
  }
  // A use case diagram: people are figures, systems and time boxes with their stereotype, use cases ovals.
  const name = withoutStereotype(step.label);
  if (kind === 'usecase') return { shape: 'ellipse', label: name };
  if (kind === 'actor') return { shape: 'actor', color: 'gray', label: name };
  return {
    shape: 'rect',
    color: 'gray',
    label: `${STEREOTYPE[kind]}\n${name.replace(/^\n+/, '')}`,
  };
}

/** Puts a step's new look on the board. */
function restyle(
  board: BoardDoc,
  step: Item & { kind: 'shape' },
  look: ReturnType<typeof lookOf>,
): void {
  if (look.shape !== step.shape) board.setShape([step.id], look.shape);
  if (look.color && look.color !== step.color) board.setColor([step.id], look.color);
  if (look.icon !== undefined && look.icon !== (step.icon ?? null))
    board.setShapeIcon([step.id], look.icon);
  if (look.label !== undefined && look.label !== step.label) board.setText(step.id, look.label);
}

const stepOf = (board: BoardDoc, id: string) =>
  board
    .items()
    .find(
      (i): i is Item & { kind: 'shape' } =>
        i.id === id && i.kind === 'shape' && i.part?.role === 'step',
    );

/**
 * Makes a step another kind of thing in its diagram: its part, shape, colour and words change to match, a BPMN step
 * keeps a marker only where it still makes sense, and the diagram lays itself out again. False if it can't be that.
 */
export function setStepKind(board: BoardDoc, id: string, kind: string): boolean {
  const step = stepOf(board, id);
  const type = step && diagramType(board, step.part!.of);
  if (!step || !type || !stepKinds(type).some((k) => k.kind === kind)) return false;
  const part = step.part!;
  const extra: Record<string, unknown> = { ...(part.extra ?? {}) };
  // What the step was recorded as in a BPMN file no longer holds; a marker carries over only to a kind that has it.
  delete extra['bpmn'];
  const marker = typeof extra['marker'] === 'string' ? extra['marker'] : undefined;
  const markers = bpmnMarkers(type, kind);
  const keep =
    marker && markers.some((m) => m.kind === marker)
      ? marker
      : kind === 'decision' && type === 'bpmn'
        ? 'exclusive'
        : undefined;
  if (keep) extra['marker'] = keep;
  else delete extra['marker'];
  const next: Part = {
    ...part,
    type: kind,
    ...(Object.keys(extra).length ? { extra: extra as Part['extra'] } : {}),
  };
  if (!Object.keys(extra).length) delete next.extra;
  board.setParts(new Map([[id, next]]));
  restyle(board, step, lookOf(type, kind, step, keep));
  tidyDiagram(board, part.of);
  return true;
}

/** Gives a BPMN step a marker (a task's kind, an event's trigger, a gateway's kind), or takes it off (''). */
export function setBpmnMarker(board: BoardDoc, id: string, marker: string): boolean {
  const step = stepOf(board, id);
  if (
    !step ||
    diagramType(board, step.part!.of) !== 'bpmn' ||
    !bpmnMarkers('bpmn', step.part!.type).some((m) => m.kind === marker)
  )
    return false;
  const {
    bpmn: _recorded,
    marker: _was,
    ...rest
  } = (step.part!.extra ?? {}) as Record<string, unknown>;
  const extra = { ...rest, ...(marker ? { marker } : {}) };
  const part: Part = {
    ...step.part!,
    ...(Object.keys(extra).length ? { extra: extra as Part['extra'] } : {}),
  };
  if (!Object.keys(extra).length) delete part.extra;
  board.setParts(new Map([[id, part]]));
  board.setShapeIcon([id], marker ? `bpmn-${marker}` : null);
  return true;
}

/** A C4 element whose bracket line has been retyped to another kind ("[Component: …]") becomes that kind. */
export function followC4Bracket(board: BoardDoc, id: string): void {
  const step = stepOf(board, id);
  if (!step || diagramType(board, step.part!.of) !== 'c4') return;
  const kind = bracketKind(step.label);
  if (kind && kind !== step.part!.type) setStepKind(board, id, kind);
}

/** What comes after a step of a kind: a task after a start or a decision, a use case after a person, the same otherwise. */
function nextKind(type: string, kind: string): string {
  if (isFlowKind(type))
    return ['task', 'subprocess'].includes(kind) ||
      (type === 'flowchart' && ['io', 'document', 'database', 'delay'].includes(kind))
      ? kind === 'subprocess'
        ? 'task'
        : kind
      : 'task';
  if (type === 'usecase') return 'usecase';
  if (type === 'c4')
    return kind === 'person'
      ? 'system'
      : kind === 'code'
        ? 'code'
        : kind === 'component'
          ? 'component'
          : 'container';
  return kind;
}
const NEW_WORDS: Record<string, string> = { usecase: 'New use case', task: 'New step' };

/**
 * Adds a step after this one, joined to it by an arrow, in the same lane or group, and lays the diagram out; returns the
 * new step's id, to name it.
 */
export function addNextStep(board: BoardDoc, id: string): string | null {
  const step = stepOf(board, id);
  const diagram = step && diagramFrame(board, step.part!.of);
  const type = diagram && diagramType(board, diagram.id);
  if (!step || !diagram || !type || !stepKinds(type).length) return null;
  const kind = nextKind(type, step.part!.type ?? 'task');
  const across = diagram.part?.dir !== 'TB';
  const words =
    type === 'c4'
      ? `New ${C4_KIND_NAMES[kind as C4Kind].toLowerCase()}`
      : (NEW_WORDS[kind] ?? 'New step');
  const look = lookOf(type, kind, {
    label: type === 'c4' ? `${words}\n[${C4_KIND_NAMES[kind as C4Kind]}]` : words,
  });
  const w = step.w;
  const h = step.h;
  const cx = across ? step.x + step.w + 80 + w / 2 : step.x + step.w / 2;
  const cy = across ? step.y + step.h / 2 : step.y + step.h + 80 + h / 2;
  const newId = board.addShape(cx, cy, look.shape, look.color ?? step.color, look.label ?? words);
  board.resizeItem(newId, w, h);
  const { lane, extra } = step.part!;
  const group =
    type === 'c4' || type === 'usecase'
      ? (extra as Record<string, unknown> | undefined)?.['group']
      : undefined;
  board.setParts(
    new Map([
      [
        newId,
        {
          of: diagram.id,
          role: 'step',
          key: freshKey(board, diagram.id, words, 'step'),
          type: kind,
          ...(lane ? { lane } : {}),
          ...(typeof group === 'string' ? { extra: { group } } : {}),
        },
      ],
    ]),
  );
  const style =
    type === 'usecase'
      ? ({ route: 'curve', dash: 'solid', weight: 2, start: 'none', end: 'none' } as const)
      : ({ route: 'elbow' } as const);
  board.connect(step.id, newId, style);
  tidyDiagram(board, diagram.id);
  return newId;
}
