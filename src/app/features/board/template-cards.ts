import { html, svg, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import '@adamstavely/trenchcoat/preview-card';
import type { BoardTemplateDto } from '../../api/generated/models/board-template-dto';
import { iconMarkup } from '../../shared/icon';
import { NOTE_SIZE, VIEW_SIZE, type BoardView } from './board-doc';

/** The template picker's groups, in order. */
const CATEGORIES: Record<string, string> = {
  retro: 'Retrospectives',
  ideate: 'Ideas',
  plan: 'Planning',
  discover: 'Discovery',
  analyse: 'Analysis',
  team: 'Team',
};

const fillOf = (color: string | undefined, fallback: string) =>
  color && color !== 'clear' && color !== 'solid' ? `var(--note-${color})` : fallback;

/** A small drawing of a template's layout: its frames, notes, shapes, tables and views as boxes, its arrows as lines. */
function preview(t: BoardTemplateDto): TemplateResult {
  const l = t.layout;
  const boxes = [
    ...(l.frames ?? []).map((f) => ({ ...f, kind: 'frame' as const })),
    ...(l.notes ?? []).map((n) => ({ ...n, ...NOTE_SIZE, kind: 'note' as const })),
    ...(l.shapes ?? []).map((s) => ({ ...s, kind: 'shape' as const })),
    ...(l.texts ?? []).map((x) => ({ x: x.x, y: x.y, w: x.w ?? 240, h: 32, kind: 'text' as const })),
    ...(l.tables ?? []).map((x) => {
      const cols = Math.max(x.cols ?? 1, ...x.cells.map((r) => r.length), 1);
      const rows = Math.max(x.rows ?? 1, x.cells.length, 1);
      return { x: x.x, y: x.y, w: cols * (x.colWidth ?? 140), h: rows * 40, kind: 'table' as const };
    }),
    ...(l.views ?? []).map((v) => ({ x: v.x, y: v.y, ...VIEW_SIZE[v.view as BoardView], kind: 'view' as const })),
  ];
  const w = Math.max(1, ...boxes.map((b) => b.x + b.w));
  const h = Math.max(1, ...boxes.map((b) => b.y + b.h));
  const keyed = new Map(boxes.filter((b) => 'key' in b && b.key).map((b) => [(b as { key: string }).key, b]));
  const centre = (b: { x: number; y: number; w: number; h: number }) => [b.x + b.w / 2, b.y + b.h / 2];
  const stroke = Math.max(w, h) / 200;
  return html`<svg class="cb-template-drawing" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${boxes.map((b) => {
      switch (b.kind) {
        case 'frame':
          return svg`<rect x=${b.x} y=${b.y} width=${b.w} height=${b.h} rx=${stroke * 4} fill=${fillOf(b.fill, 'var(--tc-surface-raised)')}
            stroke="var(--tc-border-default)" stroke-width=${stroke} stroke-dasharray=${b.border === 'dashed' ? `${stroke * 4} ${stroke * 3}` : 'none'} />`;
        case 'shape':
          return b.shape === 'ellipse'
            ? svg`<ellipse cx=${b.x + b.w / 2} cy=${b.y + b.h / 2} rx=${b.w / 2} ry=${b.h / 2} fill=${fillOf(b.color, 'var(--note-blue)')} />`
            : b.shape === 'triangle'
              ? svg`<polygon points="${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + b.h} ${b.x},${b.y + b.h}" fill=${fillOf(b.color, 'var(--note-blue)')} />`
              : b.shape === 'diamond'
                ? svg`<polygon points="${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + b.h / 2} ${b.x + b.w / 2},${b.y + b.h} ${b.x},${b.y + b.h / 2}" fill=${fillOf(b.color, 'var(--note-blue)')} />`
                : svg`<rect x=${b.x} y=${b.y} width=${b.w} height=${b.h} rx=${stroke * 3} fill=${fillOf(b.color, 'var(--note-blue)')} />`;
        case 'note':
          return svg`<rect x=${b.x} y=${b.y} width=${b.w} height=${b.h} rx=${stroke * 2} fill=${fillOf(b.color, 'var(--note-yellow)')} />`;
        case 'text':
          return svg`<rect x=${b.x} y=${b.y + b.h / 3} width=${b.w * 0.8} height=${b.h / 3} rx=${stroke} fill="var(--tc-text-muted)" opacity="0.5" />`;
        default:
          return svg`<rect x=${b.x} y=${b.y} width=${b.w} height=${b.h} rx=${stroke * 2} fill="var(--tc-surface-raised)" stroke="var(--tc-border-default)" stroke-width=${stroke} />`;
      }
    })}
    ${(l.arrows ?? []).map((a) => {
      const from = keyed.get(a.from);
      const to = keyed.get(a.to);
      if (!from || !to) return null;
      const [x1, y1] = centre(from);
      const [x2, y2] = centre(to);
      return svg`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke="var(--tc-text-muted)" stroke-width=${stroke * 1.5} />`;
    })}
  </svg>`;
}

/**
 * The template picker's cards, grouped: for a new board (with a blank one first) or to lay out on the open board.
 * `pick` gets the template, or undefined for the blank board.
 */
export function templateCards(templates: readonly BoardTemplateDto[], pick: (t: BoardTemplateDto | undefined) => void, withBlank: boolean): TemplateResult {
  const card = (t: BoardTemplateDto) =>
    html`<tc-preview-card heading=${t.name} description=${t.description} @tc-open=${() => pick(t)}>
      <div class="cb-template-preview">${preview(t)}</div>
    </tc-preview-card>`;
  const groups = Object.entries(CATEGORIES)
    .map(([id, label]) => ({ label, templates: templates.filter((t) => t.category === id) }))
    .filter((g) => g.templates.length);
  return html`${withBlank
      ? html`<div class="cb-templates">
          <tc-preview-card heading="Blank board" description="An empty board to arrange however you like." @tc-open=${() => pick(undefined)}>
            <div class="cb-template-preview"><span class="cb-template-blank">${unsafeSVG(iconMarkup('plus', 28))}</span></div>
          </tc-preview-card>
        </div>`
      : null}
    ${groups.map(
      (g) => html`<h3 class="cb-template-group">${g.label}</h3>
        <div class="cb-templates">${g.templates.map(card)}</div>`,
    )}`;
}
