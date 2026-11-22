import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, resource, signal, untracked } from '@angular/core';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { linksControllerOpenEmbed } from '../../api/generated/fn/links/links-controller-open-embed';
import { Icon } from '../../shared/icon';
import { BoardConnection } from '../board/board-connection';
import { BoardDoc, type Media } from '../board/board-doc';
import { Canvas, GUEST_CAPABILITIES } from '../board/canvas';
import { FileCache, openFile } from '../board/file-cache';
import { colorFor } from '../board/presence';
import { embedUrl, oembedUrl } from './embed-urls';

/**
 * A board embedded in another tool (a Notion /embed block, a Confluence iframe macro): live and read-only through its
 * link, with pan, zoom and fit, nothing to edit, and a way out to Corkboard. Turning the link off, or the workspace
 * turning embeds off, ends it.
 */
@Component({
  selector: 'app-embed-board',
  imports: [Canvas, Skeleton, Icon],
  template: `
    <div class="page">
      @if (problem()) {
        <p class="problem" role="alert">{{ problem() }}</p>
      } @else if (board() && connection() && connection()!.status() !== 'connecting') {
        <app-canvas
          [board]="board()!"
          [presence]="connection()!.presence"
          [provider]="connection()!.provider"
          [readOnly]="true"
          [capabilities]="guest"
          readOnlyLabel="View only"
          [fileUrls]="files()?.urls() ?? emptyUrls"
          [diagramImages]="files()"
          (openFile)="open($event)"
        />
      } @else {
        <tc-skeleton aria-label="Loading board"></tc-skeleton>
      }
      <a class="open" [href]="sharedPage()" target="_blank" rel="noopener noreferrer">
        {{ meta.hasValue() ? meta.value().title + ' · ' : '' }}Open in Corkboard <app-icon name="external" />
      </a>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .page {
      position: relative;
      height: 100%;
      background: var(--tc-surface-base);
    }
    .problem {
      margin: 0;
      padding: var(--tc-space-8);
      color: var(--tc-text-muted);
    }
    .open {
      position: absolute;
      top: var(--tc-space-2);
      right: var(--tc-space-2);
      z-index: 5;
      display: inline-flex;
      align-items: center;
      gap: var(--tc-space-1);
      max-width: calc(100% - 2 * var(--tc-space-2));
      padding: 4px var(--tc-space-2);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-raised);
      color: var(--tc-text-primary);
      font-size: var(--tc-font-size-sm);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .open:hover {
      color: var(--tc-accent-text);
    }
    .open:focus-visible {
      outline: 2px solid var(--tc-focus-ring, var(--tc-accent-text));
      outline-offset: 2px;
    }
    .open app-icon {
      --icon-size: 14px;
      flex: none;
    }
  `,
})
export class EmbedBoard {
  protected readonly guest = GUEST_CAPABILITIES;
  readonly #api = inject(Api);
  readonly #document = inject(DOCUMENT);

  /** From the route. */
  readonly token = input.required<string>();

  protected readonly meta = resource({ params: () => this.token(), loader: ({ params }) => this.#api.invoke(linksControllerOpenEmbed, { token: params }) });
  protected readonly board = signal<BoardDoc | undefined>(undefined);
  protected readonly connection = signal<BoardConnection | undefined>(undefined);
  protected readonly files = signal<FileCache | undefined>(undefined);
  protected readonly emptyUrls: ReadonlyMap<string, string> = new Map();

  /** The same board as a full shared page, in a new tab. */
  protected readonly sharedPage = computed(() => `${this.#document.location.origin}/shared/${this.token()}`);

  protected readonly problem = computed(() => {
    const err = this.meta.error();
    if (err instanceof HttpErrorResponse && err.status === 403) {
      const message = (err.error as { message?: unknown } | null)?.message;
      return typeof message === 'string' ? message : "This board can't be shown here.";
    }
    if (err) return err instanceof HttpErrorResponse && err.status === 410 ? 'This board is no longer shared.' : "This link doesn't show a board.";
    return this.connection()?.status() === 'denied' ? 'This board is no longer shared.' : '';
  });

  constructor() {
    // For oEmbed consumers that read the page as it runs (nginx puts the same link in the HTML for those that don't).
    effect((onCleanup) => {
      const head = this.#document.head;
      if (head.querySelector('link[type="application/json+oembed"]')) return;
      const origin = this.#document.location.origin;
      const link = this.#document.createElement('link');
      link.rel = 'alternate';
      link.type = 'application/json+oembed';
      link.href = oembedUrl(origin, embedUrl(origin, this.token()));
      link.title = 'Corkboard board';
      head.append(link);
      onCleanup(() => link.remove());
    });

    effect((onCleanup) => {
      if (!this.meta.hasValue()) return;
      const { boardId } = this.meta.value();
      const token = this.token();
      untracked(() => {
        const viewerId = `embed-${crypto.randomUUID()}`;
        const board = new BoardDoc();
        const connection = new BoardConnection(boardId, board, () => `embed:${token}`, { id: viewerId, name: 'Guest', color: colorFor(viewerId) });
        // Files come through the share link the embed is: it has no password, so nothing more is needed.
        const files = FileCache.forLink(boardId, token);
        this.board.set(board);
        this.connection.set(connection);
        this.files.set(files);
        onCleanup(() => {
          this.board.set(undefined);
          this.connection.set(undefined);
          this.files.set(undefined);
          connection.destroy();
          board.destroy();
          files.destroy();
        });
      });
    });

    effect(() => {
      const ids = this.board()?.media().map((m) => m.fileId) ?? [];
      untracked(() => this.files()?.load(ids));
    });
  }

  protected open(media: Media): void {
    const url = this.files()?.urls().get(media.fileId);
    if (url) openFile(url, media);
  }
}
