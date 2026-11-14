import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommandMenu } from '@adamstavely/trenchcoat/angular/command-menu';
import type { CommandMenuGroup } from '@adamstavely/trenchcoat/command-menu';
import { Api } from '../../api/generated/api';
import { searchControllerSearch } from '../../api/generated/fn/search/search-controller-search';
import type { SearchHitDto } from '../../api/generated/models/search-hit-dto';
import { Session } from '../../core/session';
import { Commands, matchCommands } from '../../core/commands';

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

const RETRY = 'search:retry';
/** What shows when the search itself failed, as opposed to finding nothing. */
const SEARCH_FAILED: CommandMenuGroup = {
  id: 'failed',
  label: "Couldn't search – the server didn't answer",
  commands: [{ id: RETRY, label: 'Try again' }],
};

/** A snippet as plain text: the search marks matches with <mark> and escapes the rest as HTML. */
export function snippetText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

export function searchGroups(hits: SearchHitDto[]): CommandMenuGroup[] {
  if (hits.length === 0) return [];
  return [
    {
      id: 'boards',
      label: 'Boards',
      commands: hits.map((hit) => ({
        id: hit.boardId,
        label: hit.title,
        hint: hit.snippets.length ? snippetText(hit.snippets[0]) : undefined,
      })),
    },
  ];
}

/** The header's ⌘K menu: what the open board can do, then boards in the workspace by title or by what their notes say. */
@Component({
  selector: 'app-board-search',
  imports: [CommandMenu],
  template: `
    <tc-command-menu
      layout="popover"
      filter="none"
      assistant="false"
      label="Search"
      [placeholder]="placeholder()"
      empty-text="Nothing matches “{query}”"
      [groups]="groups()"
      [loading]="results.isLoading()"
      [onRun]="run"
      (tc-query-change)="query.set($event.detail.query)"
    ></tc-command-menu>
  `,
  styles: `
    :host {
      display: block;
      width: min(420px, 40vw);
    }
  `,
})
export class BoardSearch {
  readonly #api = inject(Api);
  readonly #router = inject(Router);
  readonly #session = inject(Session);
  readonly #commands = inject(Commands);

  protected readonly query = signal('');

  protected readonly results = resource({
    params: () => {
      const q = this.query().trim();
      const orgId = this.#session.org()?.id;
      return q.length >= MIN_CHARS && orgId ? { q, orgId } : undefined;
    },
    loader: async ({ params, abortSignal }) => {
      // Wait for typing to pause; a newer query aborts this one.
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, DEBOUNCE_MS);
        abortSignal.addEventListener('abort', () => (clearTimeout(t), reject(abortSignal.reason)));
      });
      return this.#api.invoke(searchControllerSearch, params);
    },
  });

  protected readonly placeholder = computed(() => (this.#commands.commands().length ? 'Search, or do something on this board…' : 'Search boards and notes…'));

  /** The open board's commands that match what's typed (all of them before anything is). */
  readonly #boardCommands = computed<CommandMenuGroup[]>(() => {
    const matched = matchCommands(this.#commands.commands(), this.query()).slice(0, 8);
    return matched.length ? [{ id: 'board', label: 'This board', commands: matched.map((c) => ({ id: `cmd:${c.id}`, label: c.label, hint: c.hint })) }] : [];
  });

  protected readonly groups = computed(() => {
    const commands = this.#boardCommands();
    if (this.query().trim().length < MIN_CHARS) return commands;
    if (this.results.error()) return [...commands, SEARCH_FAILED];
    return [...commands, ...(this.results.hasValue() ? searchGroups(this.results.value()) : [])];
  });

  protected readonly run = (id: string): void => {
    if (id === RETRY) this.results.reload();
    else if (id.startsWith('cmd:')) this.#commands.run(id.slice(4));
    else void this.#router.navigate(['/boards', id]);
  };
}
