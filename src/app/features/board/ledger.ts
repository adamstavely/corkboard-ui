import { signal } from '@angular/core';
import type { LedgerEntry as ShownEntry } from '@adamstavely/trenchcoat/agent-ledger';
import * as Y from 'yjs';

/** One run of the model that changed the board, as the API records it in the board's document. */
export interface ModelRun {
  id: string;
  at: number;
  model: string;
  forName: string;
  action: string;
  created: string[];
  removed: { id: string }[];
  changed: { id: string }[];
  undone: boolean;
}

/**
 * The runs as Trench Coat's ledger lists them. A run builds on an earlier one when it changed or removed something the
 * earlier one made, so undoing the earlier one takes it along.
 */
export function ledgerEntries(runs: readonly ModelRun[]): ShownEntry[] {
  return runs.map((run, i) => {
    const touched = new Set([...run.changed.map((c) => c.id), ...run.removed.map((r) => r.id)]);
    const dependsOn = runs.slice(0, i).filter((earlier) => earlier.created.some((id) => touched.has(id))).map((e) => e.id);
    const parts = [
      run.created.length ? `${run.created.length} added` : '',
      run.changed.length ? `${run.changed.length} changed` : '',
      run.removed.length ? `${run.removed.length} removed` : '',
    ].filter(Boolean);
    return {
      id: run.id,
      action: run.action,
      target: `for ${run.forName}`,
      system: run.model,
      at: run.at,
      ...(parts.length ? { detail: parts.join(' · ') } : {}),
      ...(dependsOn.length ? { dependsOn } : {}),
    };
  });
}

/** The board's record of the model's changes, live from its document. Only the API writes it. */
export class LedgerFeed {
  readonly #array: Y.Array<ModelRun>;
  readonly #runs = signal<ModelRun[]>([]);
  readonly runs = this.#runs.asReadonly();

  constructor(doc: Y.Doc) {
    this.#array = doc.getArray<ModelRun>('ledger');
    this.#array.observe(this.#update);
    this.#update();
  }

  destroy(): void {
    this.#array.unobserve(this.#update);
  }

  readonly #update = () => this.#runs.set(this.#array.toArray());
}
