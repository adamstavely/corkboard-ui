import { html, svg, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import '@adamstavely/trenchcoat/preview-card';
import type { BoardTemplateDto } from '../../api/generated/models/board-template-dto';
import type { SavedTemplateDto } from '../../api/generated/models/saved-template-dto';
import { iconMarkup } from '../../shared/icon';
import { NOTE_SIZE, SHAPES, VIEW_SIZE, type BoardView, type ShapeKind } from './board-doc';
import { shapePath } from './items';

/** The template picker's groups, in order. */
export const TEMPLATE_CATEGORIES = [
  { id: 'retro', label: 'Retrospectives' },
  { id: 'ideate', label: 'Ideas' },
  { id: 'plan', label: 'Planning' },
  { id: 'discover', label: 'Discovery' },
  { id: 'analyse', label: 'Analysis' },
  { id: 'team', label: 'Team' },
] as const;

const fillOf = (color: string | undefined, fallback: string) =>
  color && color !== 'clear' && color !== 'solid' ? `var(--note-${color})` : fallback;

/** A small drawing of a template's layout: its frames, notes, shapes, tables and views as boxes, its arrows as lines. */
function preview(t: BoardTemplateDto): TemplateResult {
  const l = t.layout;
  const boxes = [
    ...(l.frames ?? []).map((f) => ({ ...f, kind: 'frame' as const })),
    // See-through shapes lie under the notes, as on the board.
    ...(l.shapes ?? []).filter((s) => s.fill === 'tint').map((s) => ({ ...s, kind: 'shape' as const })),
    ...(l.notes ?? []).map((n) => ({ ...n, ...NOTE_SIZE, kind: 'note' as const })),
    ...(l.shapes ?? []).filter((s) => s.fill !== 'tint').map((s) => ({ ...s, kind: 'shape' as const })),
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
  // Arrows run under what they join (from centre to centre; right-angled ones across, along and across).
  const arrows = (l.arrows ?? []).map((a) => {
    const from = keyed.get(a.from);
    const to = keyed.get(a.to);
    if (!from || !to) return null;
    const [x1, y1] = centre(from);
    const [x2, y2] = centre(to);
    const d = a.route === 'elbow' ? `M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}` : `M ${x1} ${y1} L ${x2} ${y2}`;
    return svg`<path d=${d} fill="none" stroke="var(--tc-text-muted)" stroke-width=${stroke * 1.5} />`;
  });
  const frames = boxes.filter((b) => b.kind === 'frame');
  const rest = boxes.filter((b) => b.kind !== 'frame');
  const draw = (b: (typeof boxes)[number]) => {
      switch (b.kind) {
        case 'frame':
          // A lane is a light wash, as on the board, so the steps in it show.
          return svg`<rect x=${b.x} y=${b.y} width=${b.w} height=${b.h} rx=${stroke * 4} fill=${fillOf(b.fill, 'var(--tc-surface-raised)')}
            fill-opacity=${b.look === 'lane' ? 0.35 : 1} stroke="var(--tc-border-default)" stroke-width=${stroke} stroke-dasharray=${b.border === 'dashed' ? `${stroke * 4} ${stroke * 3}` : 'none'} />`;
        case 'shape':
          // The board's own outline for the shape, so flowchart steps show as their kinds.
          return svg`<path transform="translate(${b.x} ${b.y})" d=${shapePath((SHAPES as readonly string[]).includes(b.shape) ? (b.shape as ShapeKind) : 'rect', b.w, b.h)}
            fill=${fillOf(b.color, 'var(--note-blue)')} fill-opacity=${b.fill === 'tint' ? 0.45 : 1} stroke=${b.fill === 'tint' ? 'var(--tc-text-muted)' : 'none'} stroke-width=${stroke} />`;
        case 'note':
          return svg`<rect x=${b.x} y=${b.y} width=${b.w} height=${b.h} rx=${stroke * 2} fill=${fillOf(b.color, 'var(--note-yellow)')} />`;
        case 'text':
          return svg`<rect x=${b.x} y=${b.y + b.h / 3} width=${b.w * 0.8} height=${b.h / 3} rx=${stroke} fill="var(--tc-text-muted)" opacity="0.5" />`;
        case 'view':
          // A matrix, kanban or timeline: tinted, with a line across like its title bar.
          return svg`<rect x=${b.x} y=${b.y} width=${b.w} height=${b.h} rx=${stroke * 2} fill="var(--tc-accent-subtle)" stroke="var(--tc-accent-text)" stroke-width=${stroke} />
            <line x1=${b.x} y1=${b.y + b.h / 8} x2=${b.x + b.w} y2=${b.y + b.h / 8} stroke="var(--tc-accent-text)" stroke-width=${stroke} />`;
        default:
          return svg`<rect x=${b.x} y=${b.y} width=${b.w} height=${b.h} rx=${stroke * 2} fill="var(--tc-surface-raised)" stroke="var(--tc-border-default)" stroke-width=${stroke} />`;
      }
  };
  return html`<svg class="cb-template-drawing" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${frames.map(draw)}${arrows}${rest.map(draw)}
  </svg>`;
}

/**
 * The template picker's cards, grouped: for a new board (with a blank one first) or to lay out on the open board.
 * `pick` gets the template, or undefined for the blank board.
 */
export function templateCards(
  templates: readonly BoardTemplateDto[],
  pick: (t: BoardTemplateDto | undefined) => void,
  withBlank: boolean,
  saved?: { templates: readonly SavedTemplateDto[]; remove: (t: SavedTemplateDto) => void },
): TemplateResult {
  const card = (t: BoardTemplateDto) =>
    html`<tc-preview-card heading=${t.name} description=${t.description} @tc-open=${() => pick(t)}>
      <div class="cb-template-preview">${preview(t)}</div>
    </tc-preview-card>`;
  // A saved one says who saved it, and whoever may can delete it.
  const savedCard = (t: SavedTemplateDto) =>
    html`<div class="cb-saved-template">
      <tc-preview-card heading=${t.name} description=${[t.description, t.savedBy ? `Saved by ${t.savedBy}` : ''].filter(Boolean).join(' · ')} @tc-open=${() => pick(t)}>
        <div class="cb-template-preview">${preview(t)}</div>
      </tc-preview-card>
      ${t.canDelete ? html`<button type="button" class="cb-template-delete" aria-label=${`Delete the template ${t.name}`} @click=${() => saved!.remove(t)}>Delete</button>` : null}
    </div>`;
  const groups = TEMPLATE_CATEGORIES.map(({ id, label }) => ({ label, templates: templates.filter((t) => t.category === id) })).filter((g) => g.templates.length);
  return html`${withBlank
      ? html`<div class="cb-templates">
          <tc-preview-card heading="Blank board" description="An empty board to arrange however you like." @tc-open=${() => pick(undefined)}>
            <div class="cb-template-preview"><span class="cb-template-blank">${unsafeSVG(iconMarkup('plus', 28))}</span></div>
          </tc-preview-card>
        </div>`
      : null}
    ${saved?.templates.length
      ? html`<h3 class="cb-template-group">Saved in this workspace</h3>
          <div class="cb-templates">${saved.templates.map(savedCard)}</div>`
      : null}
    ${groups.map(
      (g) => html`<h3 class="cb-template-group">${g.label}</h3>
        <div class="cb-templates">${g.templates.map(card)}</div>`,
    )}`;
}
