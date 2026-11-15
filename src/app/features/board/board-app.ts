import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, ElementRef, inject, input, output, resource, signal, viewChild } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { appsControllerGet } from '../../api/generated/fn/apps/apps-controller-get';
import { appsControllerRestore } from '../../api/generated/fn/apps/apps-controller-restore';
import { appsControllerVersion } from '../../api/generated/fn/apps/apps-controller-version';
import { Icon } from '../../shared/icon';
import type { AppItem, BoardDoc } from './board-doc';
import { plainText } from './comments';
import { download } from './export';
import { appFileName, notesMessage, sandboxed, type AppNote } from './mini-app';

const when = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * A mini-app on the board, run in a sandboxed frame: no network, no access to the page, only the notes it's sent. Its
 * code and versions can be read here, downloaded, and (for updaters) an earlier version brought back or a change asked of
 * the assistant.
 */
@Component({
  selector: 'app-board-app',
  imports: [Button, CodeBlock, Icon],
  template: `
    <div class="bar" role="toolbar" [attr.aria-label]="item().title + ' app'">
      <button type="button" class="tab" [attr.aria-pressed]="mode() === 'app'" (click)="mode.set('app')">App</button>
      <button type="button" class="tab" [attr.aria-pressed]="mode() === 'code'" (click)="mode.set('code')"><app-icon name="code" />Code</button>
      <button type="button" class="tab" [attr.aria-pressed]="mode() === 'versions'" (click)="mode.set('versions')"><app-icon name="versions" />Versions</button>
      <span class="spacer"></span>
      <button type="button" class="icon-btn" aria-label="Download the app" data-tip="Download" [disabled]="!code.hasValue()" (click)="save()"><app-icon name="download" /></button>
      @if (canEdit() && canAsk()) {
        <button type="button" class="tab" [attr.aria-pressed]="changing()" (click)="changing.set(!changing())"><app-icon name="sparkles" />Change it</button>
      }
    </div>
    @if (changing()) {
      <form class="change" (submit)="$event.preventDefault(); askChange()">
        <input #ask aria-label="What should change?" placeholder="What should change? e.g. Show it as a bar chart" maxlength="1000" />
        <tc-button size="sm" label="Ask" type="submit"></tc-button>
      </form>
    }
    @if (viewing(); as v) {
      <div class="notice">
        <span>Version {{ v }} of {{ item().version }}</span>
        @if (canEdit()) {
          <tc-button size="sm" variant="secondary" label="Bring this version back" [loading]="restoring()" (click)="restore(v)"></tc-button>
        }
        <tc-button size="sm" variant="ghost" label="Back to the latest" (click)="viewing.set(null)"></tc-button>
      </div>
    }
    <div class="body">
      <!-- One frame for the app's life, hidden while the code or versions show: a new frame would start the app over. -->
      <iframe #frame sandbox="allow-scripts" referrerpolicy="no-referrer" [title]="item().title" [hidden]="mode() !== 'app' || stopped() || !code.hasValue()" (load)="onLoad()"></iframe>
      @switch (mode()) {
        @case ('app') {
          @if (stopped()) {
            <p class="message" role="alert">This app tried to open another page, so it was stopped. <button type="button" class="link" (click)="restart()">Start it again</button></p>
          } @else if (code.error()) {
            <p class="message" role="alert">The app couldn't be loaded.</p>
          }
        }
        @case ('code') {
          @if (code.hasValue()) {
            <tc-code-block [code]="code.value().html" language="html" [filename]="fileName()"></tc-code-block>
          }
        }
        @case ('versions') {
          @if (versions.hasValue()) {
            <ol class="versions">
              @for (v of versions.value().versions; track v.version) {
                <li>
                  <span class="what"><strong>Version {{ v.version }}</strong> {{ v.note }}</span>
                  <span class="when">{{ v.model ? v.model + ' · ' : '' }}{{ when(v.createdAt) }}</span>
                  @if (v.version !== item().version) {
                    <tc-button size="sm" variant="ghost" label="Show" (click)="show(v.version)"></tc-button>
                  } @else {
                    <span class="current">Shown</span>
                  }
                </li>
              }
            </ol>
          }
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .bar {
      display: flex;
      flex: none;
      align-items: center;
      gap: var(--tc-space-1);
      padding: var(--tc-space-1) var(--tc-space-2);
      border-bottom: 1px solid var(--tc-border-subtle);
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: var(--tc-space-1);
      padding: var(--tc-space-1) var(--tc-space-2);
      border: 0;
      border-radius: var(--tc-radius-sm);
      background: none;
      color: var(--tc-text-muted);
      font: inherit;
      font-size: var(--tc-font-size-sm);
      cursor: pointer;
    }
    .tab[aria-pressed='true'] {
      background: var(--tc-accent-subtle);
      color: var(--tc-text-strong);
    }
    .tab app-icon {
      --icon-size: 16px;
    }
    .spacer {
      flex: 1;
    }
    .change,
    .notice {
      display: flex;
      flex: none;
      align-items: center;
      gap: var(--tc-space-2);
      padding: var(--tc-space-2);
      border-bottom: 1px solid var(--tc-border-subtle);
      font-size: var(--tc-font-size-sm);
    }
    .notice {
      background: var(--tc-accent-subtle);
    }
    .notice span {
      flex: 1;
    }
    .change input {
      flex: 1;
      min-width: 0;
      height: 30px;
      padding: 0 var(--tc-space-2);
      border: 1px solid var(--tc-border-default);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-base);
      color: var(--tc-text-primary);
      font: inherit;
    }
    .body {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    iframe[hidden] {
      display: none;
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #fff;
    }
    .message {
      margin: 0;
      padding: var(--tc-space-4);
      color: var(--tc-text-muted);
    }
    .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--tc-accent-text);
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }
    .versions {
      margin: 0;
      padding: var(--tc-space-2) var(--tc-space-3);
      list-style: none;
    }
    .versions li {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
      padding: var(--tc-space-1) 0;
      border-bottom: 1px solid var(--tc-border-subtle);
      font-size: var(--tc-font-size-sm);
    }
    .what {
      flex: 1;
      min-width: 0;
    }
    .when,
    .current {
      color: var(--tc-text-muted);
    }
  `,
})
export class BoardApp {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly item = input.required<AppItem>();
  readonly board = input.required<BoardDoc>();
  readonly canEdit = input(false);
  /** A model is connected, so the assistant can be asked to change it. */
  readonly canAsk = input(false);
  /** Ask the assistant for a change to this app. */
  readonly askAi = output<string>();

  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly askInput = viewChild<ElementRef<HTMLInputElement>>('ask');

  protected readonly mode = signal<'app' | 'code' | 'versions'>('app');
  protected readonly changing = signal(false);
  /** An earlier version being looked at instead of the one the board shows. */
  protected readonly viewing = signal<number | null>(null);
  protected readonly restoring = signal(false);
  /** The app tried to go somewhere else, so its frame was emptied. */
  protected readonly stopped = signal(false);
  protected readonly when = when;

  protected readonly shownVersion = computed(() => this.viewing() ?? this.item().version);
  protected readonly code = resource({
    params: () => ({ id: this.boardId(), appId: this.item().appId, version: this.shownVersion() }),
    loader: ({ params }) => this.#api.invoke(appsControllerVersion, params),
  });
  protected readonly versions = resource({
    params: () => (this.mode() === 'versions' ? { id: this.boardId(), appId: this.item().appId, latest: this.item().version } : undefined),
    loader: ({ params }) => this.#api.invoke(appsControllerGet, { id: params.id, appId: params.appId }),
  });
  protected readonly fileName = computed(() => appFileName(this.item().title));

  /** The notes the app works with, as it's sent them: the ones it was made from, or the whole board's. */
  readonly #notes = computed<AppNote[]>(() => {
    const sources = new Set(this.item().sources);
    return this.board()
      .notes()
      .filter((n) => !sources.size || sources.has(n.id))
      .map((n) => ({ id: n.id, text: plainText(n.text), color: n.color }));
  });

  /** The page loaded into the frame now; a load of anything else means the app navigated itself away. */
  #loaded: string | null = null;
  #loads = 0;

  constructor() {
    // A version's code goes into the frame as its document, under the no-network policy.
    effect(() => {
      const frame = this.frame()?.nativeElement;
      const html = this.code.hasValue() ? this.code.value().html : null;
      if (!frame || html === null || this.stopped()) return;
      const page = sandboxed(html);
      if (this.#loaded === page) return;
      this.#loaded = page;
      this.#loads = 0;
      frame.srcdoc = page;
    });
    // And it's sent the notes, again whenever they change.
    effect(() => {
      const notes = this.#notes();
      this.frame()?.nativeElement.contentWindow?.postMessage(notesMessage(notes), '*');
    });
  }

  protected onLoad(): void {
    const frame = this.frame()?.nativeElement;
    if (!frame || !this.#loaded) return;
    // Its own document loads once; another load is the app going to another page, which apps may not do.
    if (++this.#loads > 1) {
      this.stopped.set(true);
      this.#loaded = null;
      frame.srcdoc = '';
      return;
    }
    frame.contentWindow?.postMessage(notesMessage(this.#notes()), '*');
  }

  protected restart(): void {
    this.stopped.set(false);
  }

  protected show(version: number): void {
    this.viewing.set(version);
    this.mode.set('app');
  }

  protected save(): void {
    if (!this.code.hasValue()) return;
    download(this.fileName(), new Blob([this.code.value().html], { type: 'text/html' }));
  }

  protected askChange(): void {
    const what = this.askInput()?.nativeElement.value.trim();
    if (!what) return;
    this.askAi.emit(`Change the mini-app “${this.item().title}” (app id ${this.item().appId}): ${what}`);
    this.changing.set(false);
  }

  protected async restore(version: number): Promise<void> {
    this.restoring.set(true);
    try {
      await this.#api.invoke(appsControllerRestore, { id: this.boardId(), appId: this.item().appId, body: { version } });
      this.viewing.set(null);
      toast.success(`Version ${version} is back`, { description: 'Saved as a new version; the others are kept.' });
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      toast.error("That version couldn't be brought back", { description: typeof message === 'string' ? message : 'Try again.' });
    } finally {
      this.restoring.set(false);
    }
  }
}
