import { Component, ElementRef, computed, effect, input, signal, viewChild } from '@angular/core';
import { Icon } from '../../shared/icon';

type PdfJs = typeof import('pdfjs-dist');
type PdfTask = ReturnType<PdfJs['getDocument']>;
type PdfDocument = Awaited<PdfTask['promise']>;
let pdfjs: Promise<PdfJs> | null = null;

/** pdf.js, loaded the first time a PDF shows; its worker is copied into the app's files (angular.json). */
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    return m;
  });
  return pdfjs;
}

/**
 * A PDF on the board as its pages: one at a time, drawn to fit the card, with the page number and buttons to turn.
 * The PDF is only read and drawn: pdf.js runs no scripts in it.
 */
@Component({
  selector: 'app-pdf-pages',
  imports: [Icon],
  template: `
    <div class="page">
      <canvas #canvas [attr.aria-label]="name() + ', page ' + page() + ' of ' + (pages() || '…')" role="img"></canvas>
      @if (problem()) {
        <p class="note">This PDF can't be shown. Double-click to open it.</p>
      } @else if (!pages()) {
        <p class="note">Opening…</p>
      }
    </div>
    @if (pages() > 1) {
      <div class="turn" (pointerdown)="$event.stopPropagation()" (dblclick)="$event.stopPropagation()">
        <button type="button" class="icon-btn small" aria-label="Previous page" [disabled]="page() <= 1" (click)="page.set(page() - 1)"><app-icon name="arrowLeft" /></button>
        <span>{{ page() }} / {{ pages() }}</span>
        <button type="button" class="icon-btn small" aria-label="Next page" [disabled]="page() >= pages()" (click)="page.set(page() + 1)"><app-icon name="arrowRight" /></button>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    .page {
      position: relative;
      display: grid;
      flex: 1;
      place-items: center;
      min-height: 0;
      background: #ffffff;
    }
    canvas {
      max-width: 100%;
      max-height: 100%;
    }
    .note {
      position: absolute;
      margin: 0;
      padding: var(--tc-space-3);
      color: #5c5c5c;
      font-size: var(--tc-font-size-sm);
      text-align: center;
    }
    .turn {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      gap: var(--tc-space-2);
      padding: var(--tc-space-1);
      font-size: var(--tc-font-size-sm);
      font-variant-numeric: tabular-nums;
      cursor: default;
    }
  `,
})
export class PdfPages {
  /** The PDF's object URL, once fetched. */
  readonly src = input<string | undefined>();
  readonly name = input('PDF');
  /** The card's size, to draw the page sharp at it. */
  readonly width = input(300);
  readonly height = input(400);

  protected readonly page = signal(1);
  protected readonly pages = signal(0);
  protected readonly problem = signal(false);
  readonly #doc = signal<PdfDocument | null>(null);
  #task: PdfTask | null = null;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  /** Where the page is drawn: the card less the page-turn bar. */
  readonly #box = computed(() => ({ w: this.width(), h: this.height() - (this.pages() > 1 ? 36 : 0) }));

  constructor() {
    effect((onCleanup) => {
      const src = this.src();
      if (!src) return;
      let gone = false;
      onCleanup(() => (gone = true));
      void loadPdfJs()
        .then((m) => {
          void this.#task?.destroy();
          this.#task = m.getDocument({ url: src });
          return this.#task.promise;
        })
        .then((doc) => {
          if (gone) return;
          this.#doc.set(doc);
          this.pages.set(doc.numPages);
          this.page.set(1);
        })
        .catch(() => this.problem.set(true));
    });
    effect((onCleanup) => {
      const doc = this.#doc();
      const n = this.page();
      const box = this.#box();
      if (!doc) return;
      let task: { cancel: () => void } | undefined;
      // Turned again before the page arrived: that page isn't drawn, so two renders never share the canvas.
      let gone = false;
      onCleanup(() => {
        gone = true;
        task?.cancel();
      });
      void doc.getPage(n).then((page) => {
        if (gone) return;
        const base = page.getViewport({ scale: 1 });
        // Drawn at twice the card's size, so it stays sharp when the board is zoomed in a little.
        const scale = Math.min(box.w / base.width, box.h / base.height) * 2;
        const viewport = page.getViewport({ scale });
        const canvas = this.canvas().nativeElement;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / 2)}px`;
        canvas.style.height = `${Math.floor(viewport.height / 2)}px`;
        const render = page.render({ canvas, viewport });
        task = render;
        render.promise.catch(() => undefined);
      });
    });
    effect((onCleanup) => onCleanup(() => void this.#task?.destroy()));
  }
}
