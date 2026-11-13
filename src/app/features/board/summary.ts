import { signal } from '@angular/core';
import * as Y from 'yjs';
import type { BoardSummaryDto } from '../../api/generated/models/board-summary-dto';

/** The board's shared summary, live from its document (the API writes it); null until someone asks for one. */
export class SummaryFeed {
  readonly #map: Y.Map<unknown>;
  readonly #summary = signal<BoardSummaryDto | null>(null);
  readonly summary = this.#summary.asReadonly();

  constructor(doc: Y.Doc) {
    this.#map = doc.getMap('summary');
    this.#map.observe(this.#update);
    this.#update();
  }

  destroy(): void {
    this.#map.unobserve(this.#update);
  }

  readonly #update = () => {
    const s = Object.fromEntries(this.#map.entries()) as Partial<BoardSummaryDto>;
    this.#summary.set(typeof s.tldr === 'string' ? ({ points: [], questions: [], basis: [], summary: '', ...s } as BoardSummaryDto) : null);
  };
}

/** Whether the board has notes the summary wasn't made from, or lost some it was. */
export function isStale(basis: readonly string[], noteIds: readonly string[]): boolean {
  const now = new Set(noteIds);
  return basis.length !== now.size || basis.some((id) => !now.has(id));
}
