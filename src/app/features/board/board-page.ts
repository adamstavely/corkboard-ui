import { Component, computed, effect, HostListener, inject, input, resource, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { html } from 'lit';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Dialog } from '@adamstavely/trenchcoat/angular/dialog';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { boardsControllerGet } from '../../api/generated/fn/boards/boards-controller-get';
import { boardsControllerRemove } from '../../api/generated/fn/boards/boards-controller-remove';
import { boardsControllerRename } from '../../api/generated/fn/boards/boards-controller-rename';
import { BoardDoc } from './board-doc';
import { BoardSync } from './board-sync';
import { Canvas } from './canvas';

const STATUS_TEXT = { loading: 'Loading…', saving: 'Saving…', saved: 'Saved', error: "Couldn't save – retrying" } as const;

/** One board: its title, how saving is going, and the canvas. */
@Component({
  selector: 'app-board-page',
  imports: [Canvas, Button, Dialog, Skeleton],
  templateUrl: './board-page.html',
  styleUrl: './board-page.css',
})
export class BoardPage {
  readonly #api = inject(Api);
  readonly #router = inject(Router);

  /** From the route. */
  readonly id = input.required<string>();

  protected readonly meta = resource({
    params: () => this.id(),
    loader: ({ params: id }) => this.#api.invoke(boardsControllerGet, { id }),
  });

  protected readonly board = signal<BoardDoc | undefined>(undefined);
  protected readonly loadFailed = signal(false);
  readonly #sync = signal<BoardSync | undefined>(undefined);

  protected readonly status = computed(() => STATUS_TEXT[this.#sync()?.status() ?? 'loading']);

  protected readonly title = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly deleting = signal(false);

  constructor() {
    effect(() => {
      if (this.meta.hasValue()) this.title.set(this.meta.value().title);
    });

    // A fresh document per board; the old one is saved and let go.
    effect((onCleanup) => {
      const id = this.id();
      untracked(() => {
        const board = new BoardDoc();
        const sync = new BoardSync(this.#api, id, board);
        let alive = true;
        sync.load().then(
          () => {
            if (!alive) return;
            this.#sync.set(sync);
            this.board.set(board);
          },
          () => alive && this.loadFailed.set(true),
        );
        onCleanup(() => {
          alive = false;
          this.board.set(undefined);
          this.#sync.set(undefined);
          void sync.flush().finally(() => {
            sync.destroy();
            board.destroy();
          });
        });
      });
    });
  }

  /** Warn before closing the tab while changes are still on their way. */
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(e: BeforeUnloadEvent): void {
    const status = this.#sync()?.status();
    if (status === 'saving' || status === 'error') e.preventDefault();
  }

  protected async rename(): Promise<void> {
    const title = this.title().trim();
    const current = this.meta.hasValue() ? this.meta.value().title : '';
    if (!title) {
      this.title.set(current);
      return;
    }
    if (title === current) return;
    const updated = await this.#api.invoke(boardsControllerRename, { id: this.id(), body: { title } });
    this.meta.set(updated);
  }

  protected onTitleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') {
      this.title.set(this.meta.hasValue() ? this.meta.value().title : '');
      (e.target as HTMLInputElement).blur();
    }
  }

  protected back(): void {
    void this.#router.navigateByUrl('/');
  }

  protected readonly deleteActions = computed(
    () =>
      html`<tc-button
        label="Delete board"
        variant="destructive"
        ?loading=${this.deleting()}
        @click=${() => void this.#delete()}
      ></tc-button>`,
  );

  async #delete(): Promise<void> {
    this.deleting.set(true);
    try {
      await this.#api.invoke(boardsControllerRemove, { id: this.id() });
      this.#sync()?.destroy();
      this.confirmDelete.set(false);
      await this.#router.navigateByUrl('/');
    } finally {
      this.deleting.set(false);
    }
  }
}
