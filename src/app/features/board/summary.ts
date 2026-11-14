import { signal } from '@angular/core';
import * as Y from 'yjs';
import type { BoardSummaryDto } from '../../api/generated/models/board-summary-dto';
import type { BoardDoc } from './board-doc';

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

/**
 * Whether the board has moved on since the summary: a note's text changed (when the summary has a fingerprint), or
 * notes were added or removed.
 */
export function isStale(summary: Pick<BoardSummaryDto, 'basis' | 'fingerprint'>, board: BoardDoc): boolean {
  if (summary.fingerprint) return summary.fingerprint !== contentFingerprint(board);
  const now = new Set(board.notes().map((n) => n.id));
  return summary.basis.length !== now.size || summary.basis.some((id) => !now.has(id));
}

/**
 * A short hash of every note's id and text, the same as the API's (corkboard-api src/summary/summary-doc.ts): keep the
 * two in step. Depends on the board's notes and their text, so a computed using it reruns as they change.
 */
export function contentFingerprint(board: BoardDoc): string {
  board.notes();
  board.textRevision();
  const notes: string[] = [];
  board.doc.getMap<unknown>('nodes').forEach((node, id) => {
    if (!(node instanceof Y.Map) || node.get('kind') !== 'note') return;
    const text: unknown = node.get('text');
    notes.push(`${id}\u0001${text instanceof Y.XmlFragment ? text.toJSON() : ''}`);
  });
  // FNV-1a, 32 bits, over UTF-16 code units.
  let hash = 0x811c9dc5;
  const all = notes.sort().join('\u0002');
  for (let i = 0; i < all.length; i++) {
    hash ^= all.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
