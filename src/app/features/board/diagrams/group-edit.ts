import type { BoardDoc } from '../board-doc';
import { C4_KIND_NAMES, c4Look, type C4GroupKind, type C4Kind } from './c4';
import { diagramFrame } from './flow-board';
import { freshKey } from './flow-edit';
import { tidyDiagram } from './kinds';

/**
 * Adding the groups an editable diagram draws round its parts, by hand: a C4 boundary (a software system, container or
 * component opened to what's inside it, or a plain grouping), and a use case diagram's system boundary. Each starts with
 * one thing inside it, so there's something to lay out and to name, and the diagram lays itself out again.
 */

/** The boundaries a C4 diagram can have, and what a new one holds to begin with. */
export const C4_BOUNDARIES: { kind: C4GroupKind; label: string; holds: C4Kind }[] = [
  { kind: 'system', label: 'Software system boundary', holds: 'container' },
  { kind: 'container', label: 'Container boundary', holds: 'component' },
  { kind: 'component', label: 'Component boundary', holds: 'code' },
  { kind: 'boundary', label: 'Grouping boundary', holds: 'system' },
];
const GROUP_NAMES: Record<C4GroupKind, string> = {
  system: 'New system',
  container: 'New container',
  component: 'New component',
  boundary: 'New group',
};

/** Room for a new group and the one thing in it, beside what the diagram already has (the layout puts it in its place). */
function besideDiagram(
  board: BoardDoc,
  diagramId: string,
  inside?: { x: number; y: number; w: number; h: number },
): { x: number; y: number } {
  if (inside) return { x: inside.x + inside.w / 2, y: inside.y + inside.h / 2 };
  // Just under the diagram, clear of its groups, so what's in the new one is read as in it and nothing else.
  const d = diagramFrame(board, diagramId)!;
  return { x: d.x + d.w / 2, y: d.y + d.h + 200 };
}

/**
 * Adds a C4 boundary of a kind, inside the open group `parent` if one's given, with one element in it; returns the
 * boundary's frame and the element, to name.
 */
export function addC4Boundary(
  board: BoardDoc,
  diagramId: string,
  kind: C4GroupKind,
  parent?: string,
): { group: string; element: string } | null {
  const diagram = diagramFrame(board, diagramId);
  const plan = C4_BOUNDARIES.find((b) => b.kind === kind);
  if (!diagram || diagram.part?.type !== 'c4' || !plan) return null;
  const parentFrame = parent
    ? board
        .frames()
        .find(
          (f) =>
            f.part?.of === diagramId &&
            f.part.role === 'group' &&
            f.part.key === parent &&
            f.part.extra?.['collapsed'] !== true,
        )
    : undefined;
  // Under the diagram even when nested: its parent is recorded, and nothing already in the parent is caught in it.
  const at = besideDiagram(board, diagramId);
  const name = GROUP_NAMES[kind];
  const key = freshKey(board, diagramId, name, 'group');
  const [group] = board.addLayout(
    {
      frames: [
        {
          title: name,
          x: 0,
          y: 0,
          w: 320,
          h: 220,
          look: 'outline',
          border: kind === 'boundary' ? 'dashed' : 'solid',
        },
      ],
    },
    at.x,
    at.y,
  );
  if (!group) return null;
  const extra: Record<string, string> = { kind };
  if (parentFrame) extra['parent'] = parentFrame.part!.key;
  board.setParts(new Map([[group, { of: diagramId, role: 'group', key, extra }]]));
  // What it holds: one element of the kind that goes in it, in its middle.
  const holds = plan.holds;
  const words = `New ${C4_KIND_NAMES[holds].toLowerCase()}`;
  const look = c4Look(holds);
  const element = board.addShape(
    at.x,
    at.y + 16,
    look.shape,
    look.color,
    `${words}\n[${C4_KIND_NAMES[holds]}]`,
  );
  board.resizeItem(element, 200, 110);
  board.setParts(
    new Map([
      [
        element,
        {
          of: diagramId,
          role: 'step',
          key: freshKey(board, diagramId, words, 'element'),
          type: holds,
          extra: { group: key },
        },
      ],
    ]),
  );
  tidyDiagram(board, diagramId);
  return { group, element };
}

/** Adds a system boundary to a use case diagram, with one use case in it; returns the boundary and the use case. */
export function addUsecaseBoundary(
  board: BoardDoc,
  diagramId: string,
): { group: string; element: string } | null {
  const diagram = diagramFrame(board, diagramId);
  if (!diagram || diagram.part?.type !== 'usecase') return null;
  const at = besideDiagram(board, diagramId);
  const key = freshKey(board, diagramId, 'New system', 'system');
  const [group] = board.addLayout(
    { frames: [{ title: 'New system', x: 0, y: 0, w: 320, h: 220, look: 'card' }] },
    at.x,
    at.y,
  );
  if (!group) return null;
  board.setParts(new Map([[group, { of: diagramId, role: 'group', key }]]));
  const element = board.addShape(at.x, at.y + 16, 'ellipse', 'blue', 'New use case');
  board.resizeItem(element, 200, 90);
  board.setParts(
    new Map([
      [
        element,
        {
          of: diagramId,
          role: 'step',
          key: freshKey(board, diagramId, 'New use case', 'usecase'),
          type: 'usecase',
        },
      ],
    ]),
  );
  tidyDiagram(board, diagramId);
  return { group, element };
}
