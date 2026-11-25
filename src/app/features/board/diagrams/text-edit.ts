import { layoutSize, type BoardDoc } from '../board-doc';
import { diagramFrame } from './flow-board';
import { placeChildren } from './flow-edit';
import { diagramLayout, diagramType } from './kinds';

/**
 * Editing an editable diagram as its text, in place: the text it copies as (Mermaid, C4 JSON or BPMN XML) is changed and
 * the diagram is drawn again from it where it was, its sub-processes with it. And setting what a use case diagram's
 * arrow means (an association, «include», «extend» or "is a") without restyling it by hand.
 */

/** A diagram and the sub-process diagrams under it, all the way down. */
function withChildren(board: BoardDoc, id: string): string[] {
  const children = board.frames().filter((f) => f.part?.role === 'diagram' && f.part.parent === id);
  return [id, ...children.flatMap((c) => withChildren(board, c.id))];
}

/**
 * Draws a diagram again from text, in its place (its top left corner stays put), replacing it and its sub-processes.
 * The text must be the same kind of diagram. Returns the new diagram's id, or why the text can't be used.
 */
export function replaceDiagram(
  board: BoardDoc,
  diagramId: string,
  text: string,
): { id: string; notices: string[] } | { error: string } {
  const old = diagramFrame(board, diagramId);
  const type = old && diagramType(board, diagramId);
  if (!old || !type) return { error: 'That diagram is no longer on the board.' };
  if (!text.trim()) return { error: 'Write the diagram, or cancel to keep it as it is.' };
  const result = diagramLayout(text);
  if ('error' in result) return { error: result.error };
  if (result.type !== type)
    return {
      error: `That reads as a different kind of diagram; this one stays a ${type === 'usecase' ? 'use case diagram' : type === 'c4' ? 'C4 diagram' : type === 'erd' ? 'ER diagram' : type === 'state' ? 'state machine' : type === 'bpmn' ? 'BPMN process' : 'flowchart'}.`,
    };
  const size = layoutSize(result.layout);
  const parent = old.part?.parent;
  const doomed = withChildren(board, diagramId);
  board.remove([...doomed, ...board.diagramMembers(doomed)]);
  const ids = board.addLayout(result.layout, old.x + size.w / 2, old.y + size.h / 2);
  const id = ids.find((x) => diagramFrame(board, x));
  if (!id) return { error: 'The diagram couldn’t be drawn.' };
  // A sub-process edited as text stays under the step it belongs to.
  if (parent) {
    const frame = diagramFrame(board, id)!;
    board.setParts(new Map([[id, { ...frame.part!, parent }]]));
  }
  placeChildren(board, id, result.children);
  return { id, notices: result.notices };
}

/** What an arrow between two parts of a use case diagram can mean. */
export const USECASE_RELATIONS = [
  { kind: 'association', label: 'Association' },
  { kind: 'include', label: '«include»' },
  { kind: 'extend', label: '«extend»' },
  { kind: 'parent', label: 'Is a (generalisation)' },
] as const;
export type UsecaseRelation = (typeof USECASE_RELATIONS)[number]['kind'];
/** Each relation's name, for its button. */
export const relationLabels = Object.fromEntries(
  USECASE_RELATIONS.map((r) => [r.kind, r.label]),
) as Record<UsecaseRelation, string>;

/** An arrow of a use case diagram, if this is one (both its ends are parts of the same use case diagram). */
export function usecaseArrow(
  board: BoardDoc,
  arrowId: string,
): { id: string; relation: UsecaseRelation } | null {
  const arrow = board.connectors().find((c) => c.id === arrowId);
  if (!arrow) return null;
  const ends = [arrow.from, arrow.to].map((id) => board.items().find((i) => i.id === id)?.part?.of);
  if (!ends[0] || ends[0] !== ends[1] || diagramType(board, ends[0]) !== 'usecase') return null;
  const relation: UsecaseRelation =
    arrow.end === 'triangle'
      ? 'parent'
      : arrow.dash !== 'solid'
        ? /extend/i.test(arrow.label)
          ? 'extend'
          : 'include'
        : 'association';
  return { id: arrow.id, relation };
}

/** Makes a use case diagram's arrow mean something else: its line, head and words change to match. */
export function setUsecaseRelation(
  board: BoardDoc,
  arrowId: string,
  relation: UsecaseRelation,
): boolean {
  const now = usecaseArrow(board, arrowId);
  if (!now) return false;
  const dashed = relation === 'include' || relation === 'extend';
  board.setArrowStyle([arrowId], {
    route: 'curve',
    dash: dashed ? 'dashed' : 'solid',
    weight: 2,
    start: 'none',
    end: relation === 'parent' ? 'triangle' : dashed ? 'arrow' : 'none',
  });
  const label = board.connectors().find((c) => c.id === arrowId)?.label ?? '';
  // An «extend» keeps the extension point and condition written after it; anything else drops the stereotype.
  const rest = label.replace(/^«(include|extend)»\s*/i, '');
  board.setArrowLabel(
    arrowId,
    relation === 'include'
      ? '«include»'
      : relation === 'extend'
        ? `«extend»${rest && /^[(:]/.test(rest) ? ` ${rest}` : ''}`
        : rest,
  );
  return true;
}
