/** Where a note sits in a mind map: the map's root, its parent (null for the root), its place among its siblings. */
export interface MindLink {
  root: string;
  parent: string | null;
  order: number;
  /** Its branches are folded away. */
  collapsed?: boolean;
}

/** Gaps between a parent and its branches, and between branches (corkboard-api's boards/mindmap.ts lays out the same). */
export const MIND_GAP = { x: 96, y: 24 } as const;

export function mindLinkOf(value: unknown): MindLink | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v['root'] !== 'string' || (v['parent'] !== null && typeof v['parent'] !== 'string')) return undefined;
  return { root: v['root'], parent: v['parent'] as string | null, order: typeof v['order'] === 'number' ? v['order'] : 0, ...(v['collapsed'] === true ? { collapsed: true } : {}) };
}

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  mind?: MindLink;
}

/** A map's branches under each node, in order. */
export function mindChildren(nodes: readonly Box[], root: string): Map<string, Box[]> {
  const children = new Map<string, Box[]>();
  for (const n of nodes) {
    if (!n.mind || n.mind.root !== root || !n.mind.parent) continue;
    children.set(n.mind.parent, [...(children.get(n.mind.parent) ?? []), n]);
  }
  for (const list of children.values()) list.sort((a, b) => a.mind!.order - b.mind!.order);
  return children;
}

/**
 * A tidy tree growing to the right of the root, which stays where it is: each branch level a column, each subtree as
 * tall as its branches, centred on its parent. Folded branches take no room. Returns where every node in the map goes.
 */
export function mindLayout(nodes: readonly Box[], rootId: string): Map<string, { x: number; y: number }> {
  const root = nodes.find((n) => n.id === rootId);
  const at = new Map<string, { x: number; y: number }>();
  if (!root) return at;
  const children = mindChildren(nodes, rootId);
  const shown = (n: Box) => (n.mind?.collapsed ? [] : (children.get(n.id) ?? []));
  const heights = new Map<string, number>();
  const height = (n: Box): number => {
    const kids = shown(n);
    const own = kids.length ? Math.max(n.h, kids.reduce((sum, k) => sum + height(k), 0) + MIND_GAP.y * (kids.length - 1)) : n.h;
    heights.set(n.id, own);
    return own;
  };
  height(root);
  const place = (n: Box, x: number, centreY: number) => {
    at.set(n.id, { x: Math.round(x), y: Math.round(centreY - n.h / 2) });
    const kids = shown(n);
    if (!kids.length) return;
    const total = kids.reduce((sum, k) => sum + heights.get(k.id)!, 0) + MIND_GAP.y * (kids.length - 1);
    let top = centreY - total / 2;
    for (const k of kids) {
      const h = heights.get(k.id)!;
      place(k, x + n.w + MIND_GAP.x, top + h / 2);
      top += h + MIND_GAP.y;
    }
  };
  place(root, root.x, root.y + root.h / 2);
  return at;
}

/** The nodes hidden by folded branches above them, across every map. */
export function hiddenByFolds(nodes: readonly Box[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hidden = new Set<string>();
  for (const n of nodes) {
    for (let p = n.mind?.parent, depth = 0; p && depth < 100; depth++) {
      const parent = byId.get(p);
      if (!parent) break;
      if (parent.mind?.collapsed) {
        hidden.add(n.id);
        break;
      }
      p = parent.mind?.parent ?? null;
    }
  }
  return hidden;
}
