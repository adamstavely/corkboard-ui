import type { BoardDoc, DiagramType, Layout } from '../board-doc';
import { diagramFrame, flowchartMermaid, tidyFlowchart } from './flow-board';
import { flowchartLayout, isFlowchartText, type ChildFlow } from './flowchart';
import { isUsecaseText, layoutUsecase, parseUsecase, tidyUsecase, usecaseMermaid } from './usecase';
import { c4Text, isC4Text, layoutC4, parseC4, tidyC4 } from './c4';

/**
 * The kinds of editable diagram, side by side: what reads each from text, lays it out again, and writes it back.
 * Flowcharts and use case diagrams are written in Mermaid.
 */

/** An editable diagram's kind, by its outer frame. */
export function diagramType(board: BoardDoc, id: string): DiagramType | null {
  const type = diagramFrame(board, id)?.part?.type;
  return type === 'flowchart' || type === 'usecase' || type === 'c4' ? type : null;
}

/** Whether text is a diagram the board can make editable. */
export const isDiagramText = (text: string): boolean => isC4Text(text) || isUsecaseText(text) || isFlowchartText(text);

/** A diagram's text laid out as board things, by its kind; or why it can't be read. */
export function diagramLayout(text: string): { type: DiagramType; layout: Layout; children: ChildFlow[]; notices: string[]; count: number } | { error: string } {
  if (isC4Text(text)) {
    const parsed = parseC4(text);
    if ('error' in parsed) return parsed;
    return { type: 'c4', layout: layoutC4(parsed.data), children: [], notices: parsed.warnings, count: parsed.data.elements.length };
  }
  if (isUsecaseText(text)) {
    const parsed = parseUsecase(text);
    if ('error' in parsed) return parsed;
    const count = parsed.data.useCases.length;
    return { type: 'usecase', layout: layoutUsecase(parsed.data), children: [], notices: parsed.warnings, count };
  }
  const result = flowchartLayout(text);
  if ('error' in result) return result;
  return { type: 'flowchart', layout: result.layout, children: result.children, notices: result.notices, count: result.layout.shapes?.length ?? 0 };
}

/** Lays an editable diagram out again where it is; a flowchart can turn to run the other way. */
export function tidyDiagram(board: BoardDoc, id: string, dir?: 'LR' | 'TB'): boolean {
  const type = diagramType(board, id);
  if (type === 'usecase') return tidyUsecase(board, id);
  if (type === 'c4') return tidyC4(board, id);
  return type === 'flowchart' ? tidyFlowchart(board, id, dir) : false;
}

/** An editable diagram written back as text (Mermaid). */
export function diagramText(board: BoardDoc, id: string): string | null {
  const type = diagramType(board, id);
  if (type === 'usecase') return usecaseMermaid(board, id);
  if (type === 'c4') return c4Text(board, id);
  return type === 'flowchart' ? flowchartMermaid(board, id) : null;
}

/** How each kind of diagram names itself in messages. */
export const DIAGRAM_NAMES: Record<DiagramType, string> = { flowchart: 'flowchart', usecase: 'use case diagram', c4: 'C4 diagram' };

/** What a new use case diagram starts as: a customer, a shop with three use cases, a payment system. */
export const USECASE_STARTER = `---
title: Online shop
---
%% @type usecase
%% @colorKey 1 Ordering
%% @colorKey 2 Payments
flowchart LR
  customer["Customer"]
  psp["Payment Gateway"]:::system
  subgraph shop["Storefront"]
    browse(["Browse Catalogue"]):::c1
    checkout(["Check Out"]):::c1
    pay(["Take Payment"]):::c2
  end
  class pay subfunction
  customer --- browse
  customer --- checkout
  checkout -.->|«include»| pay
  pay --- psp
`;

/** What a new C4 diagram starts as: a customer, a shop's order platform (open, at level 2) and a payment provider. */
export const C4_STARTER = JSON.stringify(
  {
    diagramType: 'c4',
    schemaVersion: 1,
    title: 'Shop system landscape',
    colorKey: { '1': 'People', '2': 'Our systems' },
    groups: [
      { id: 'shop', name: 'Shop', kind: 'boundary' },
      { id: 'platform', name: 'Order Platform', kind: 'system', parent: 'shop', collapsed: false },
      { id: 'outside', name: 'Third-party services', kind: 'boundary' },
    ],
    elements: [
      { id: 'customer', kind: 'person', name: 'Customer', description: 'Buys products online', color: '1' },
      { id: 'web', kind: 'container', name: 'Web App', tech: 'React', group: 'platform' },
      { id: 'api', kind: 'container', name: 'API', tech: 'Node.js, REST', group: 'platform' },
      { id: 'orders', kind: 'database', name: 'Order DB', tech: 'PostgreSQL', group: 'platform' },
      { id: 'payments', kind: 'external', name: 'Payment Provider', group: 'outside' },
    ],
    relations: [
      { from: 'customer', to: 'web', label: 'Browses and orders', tech: 'HTTPS' },
      { from: 'web', to: 'api', label: 'Calls', tech: 'JSON/HTTPS' },
      { from: 'api', to: 'orders', label: 'Reads and writes', tech: 'SQL' },
      { from: 'api', to: 'payments', label: 'Charges cards', tech: 'REST' },
    ],
  },
  null,
  2,
);
