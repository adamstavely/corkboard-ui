import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, HostListener, inject, input, resource, signal, untracked } from '@angular/core';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { linksControllerOpen } from '../../api/generated/fn/links/links-controller-open';
import { linksControllerUnlock } from '../../api/generated/fn/links/links-controller-unlock';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { SecretField } from '@adamstavely/trenchcoat/angular/secret-field';
import { BoardConnection } from '../board/board-connection';
import { BoardDoc, type Media } from '../board/board-doc';
import { FileCache, openFile } from '../board/file-cache';
import { Canvas, GUEST_CAPABILITIES } from '../board/canvas';
import { colorFor } from '../board/presence';

/**
 * A board opened from a share link: live, as a guest, with no need to pick who you are; read-only unless the link lets
 * people edit. The link's
 * token is the connection's credential, so turning the link off ends the view. A link with a password asks for it
 * first; the pass the API gives back goes with everything the page opens.
 */
@Component({
  selector: 'app-shared-board',
  imports: [Canvas, Skeleton, SecretField, Button],
  template: `
    <div class="page">
      <div class="bar">
        <strong class="title">{{ meta.hasValue() ? meta.value().title : 'Shared board' }}</strong>
        <span class="badge">{{ canEdit() ? 'Can edit' : 'View only' }}</span>
        <span class="status" role="status">{{ statusText() }}</span>
      </div>
      <div class="stage">
        @if (needsPassword()) {
          <form class="unlock" aria-labelledby="unlock-heading" (submit)="$event.preventDefault(); unlock()">
            <h1 id="unlock-heading">This board has a password</h1>
            <p class="hint">Whoever shared the link can tell you what it is.</p>
            <tc-secret-field label="Password" [value]="typed()" [disabled]="unlocking()" (tc-value-change)="$event.preventDefault(); typed.set($event.detail.value)"></tc-secret-field>
            @if (unlockProblem(); as why) {
              <p class="problem-line" role="alert">{{ why }}</p>
            }
            <tc-button type="submit" label="Open the board" [loading]="unlocking()"></tc-button>
          </form>
        } @else if (problem()) {
          <p class="problem" role="alert">{{ problem() }}</p>
        } @else if (board() && connection() && connection()!.status() !== 'connecting') {
          <app-canvas
            [board]="board()!"
            [presence]="connection()!.presence"
            [provider]="connection()!.provider"
            [readOnly]="!canEdit()"
            [capabilities]="guest"
            readOnlyLabel="View only"
            [fileUrls]="files()?.urls() ?? emptyUrls"
            (openFile)="open($event)"
          />
        } @else {
          <tc-skeleton aria-label="Loading board"></tc-skeleton>
        }
      </div>
    </div>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: var(--tc-space-3);
      padding: var(--tc-space-2) var(--tc-space-4);
      border-bottom: 1px solid var(--tc-border-subtle);
      background: var(--tc-surface-raised);
    }
    .title {
      font-size: var(--tc-font-size-md);
    }
    .badge {
      padding: 2px var(--tc-space-2);
      border-radius: 999px;
      background: var(--tc-accent-subtle);
      color: var(--tc-accent-text);
      font-size: var(--tc-font-size-sm);
    }
    .status {
      margin-left: auto;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .stage {
      position: relative;
      flex: 1;
      min-height: 0;
    }
    .problem {
      padding: var(--tc-space-8);
    }
    .unlock {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
      max-width: 360px;
      margin: var(--tc-space-8) auto;
      padding: var(--tc-space-5);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
    }
    .unlock h1 {
      margin: 0;
      font-size: var(--tc-font-size-lg);
    }
    .hint {
      margin: 0;
      color: var(--tc-text-muted);
    }
    .problem-line {
      margin: 0;
      color: var(--tc-status-danger-fg);
    }
  `,
})
export class SharedBoard {
  /** A guest has none of a member page's extras: no uploads, template picker, views, assistant or side-panel editors. */
  protected readonly guest = GUEST_CAPABILITIES;
  readonly #api = inject(Api);

  /** From the route. */
  readonly token = input.required<string>();

  /** Proof that the link's password was typed, kept for this tab so a reload doesn't ask again. */
  protected readonly pass = signal<string | undefined>(undefined);
  protected readonly meta = resource({
    params: () => ({ token: this.token(), pass: this.pass() }),
    loader: ({ params }) => this.#api.invoke(linksControllerOpen, { token: params.token, ...(params.pass ? { 'x-link-pass': params.pass } : {}) }),
  });
  protected readonly board = signal<BoardDoc | undefined>(undefined);
  protected readonly connection = signal<BoardConnection | undefined>(undefined);

  /** For the route's guard: an editable link's guest may have edits not yet sent. */
  hasPendingWork(): boolean {
    return !!this.connection()?.pending();
  }

  /** The browser asks before closing the tab with edits not yet sent. */
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.hasPendingWork()) e.preventDefault();
  }
  /** The board's images and files, fetched with the link. */
  protected readonly files = signal<FileCache | undefined>(undefined);
  protected readonly emptyUrls: ReadonlyMap<string, string> = new Map();

  /** Whether the link lets guests edit the board. */
  protected readonly canEdit = computed(() => this.meta.hasValue() && this.meta.value().canEdit);
  /** The link has a password, and it hasn't been typed (or the pass ran out). */
  protected readonly needsPassword = computed(() => {
    const err = this.meta.error();
    return err instanceof HttpErrorResponse && err.status === 403 && !!(err.error as { passwordRequired?: unknown } | null)?.passwordRequired;
  });
  protected readonly typed = signal('');
  protected readonly unlocking = signal(false);
  protected readonly unlockProblem = signal<string | null>(null);

  protected async unlock(): Promise<void> {
    if (!this.typed()) {
      this.unlockProblem.set('Type the password first.');
      return;
    }
    this.unlocking.set(true);
    this.unlockProblem.set(null);
    try {
      const { pass } = await this.#api.invoke(linksControllerUnlock, { token: this.token(), body: { password: this.typed() } });
      remember(this.token(), pass);
      this.typed.set('');
      this.pass.set(pass);
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.unlockProblem.set(typeof message === 'string' ? message : "The board couldn't be opened. Try again.");
    } finally {
      this.unlocking.set(false);
    }
  }

  protected readonly problem = computed(() => {
    const err = this.meta.error();
    if (err instanceof HttpErrorResponse && err.status === 403) {
      const message = (err.error as { message?: unknown } | null)?.message;
      return typeof message === 'string' ? message : "This link doesn't open a board.";
    }
    if (err) return err instanceof HttpErrorResponse && err.status === 410 ? 'This link has been turned off or has expired.' : "This link doesn't open a board.";
    return this.connection()?.status() === 'denied' ? 'This link has been turned off or has expired.' : '';
  });
  protected readonly statusText = computed(() => (this.connection()?.status() === 'offline' ? 'Reconnecting…' : 'Live'));

  constructor() {
    this.pass.set(remembered(untracked(() => this.token())));
    effect((onCleanup) => {
      if (!this.meta.hasValue()) return;
      const { boardId } = this.meta.value();
      const token = this.token();
      const pass = untracked(() => this.pass());
      untracked(() => {
        const guestId = `guest-${crypto.randomUUID()}`;
        const board = new BoardDoc();
        const connection = new BoardConnection(boardId, board, () => (pass ? `link:${token}:${pass}` : `link:${token}`), { id: guestId, name: 'Guest', color: colorFor(guestId) });
        const files = FileCache.forLink(boardId, token, pass);
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

    // Fetch the board's images and files as they appear on it.
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

/** A link's pass, kept for the tab (storage can be missing or refuse: then the password is asked again). */
const PASS_KEY = (token: string) => `corkboard.linkPass.${token}`;
function remember(token: string, pass: string): void {
  try {
    sessionStorage.setItem(PASS_KEY(token), pass);
  } catch {
    // Not kept: a reload asks again.
  }
}
function remembered(token: string): string | undefined {
  try {
    return sessionStorage.getItem(PASS_KEY(token)) ?? undefined;
  } catch {
    return undefined;
  }
}
