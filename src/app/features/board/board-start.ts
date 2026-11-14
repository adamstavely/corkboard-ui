import { Component, inject, output, signal, DestroyRef } from '@angular/core';
import { PromptStarters } from '@adamstavely/trenchcoat/angular/prompt-starters';
import type { PromptStarter } from '@adamstavely/trenchcoat/prompt-starters';
import { Icon, iconElement } from '../../shared/icon';

/** What starts each kind of board: notes the assistant writes, then frames it sorts them into. */
export const starters = (): PromptStarter[] => [
  {
    id: 'retro',
    label: 'Run a retro',
    hint: 'Went well, could be better, actions',
    icon: iconElement('sparkles'),
    text: 'Set this board up for a retrospective: add one prompt note each for What went well, What could be better and Actions, then put each in its own frame with that title.',
  },
  {
    id: 'process',
    label: 'Map a process',
    hint: 'A frame for each stage',
    icon: iconElement('arrowRight'),
    text: 'Set this board up to map a process: add a note for each stage from start to finish (Request, Review, Build, Check, Release), then put each in its own frame named after the stage.',
  },
  {
    id: 'workshop',
    label: 'Plan a workshop',
    hint: 'Agenda, ideas, vote, next steps',
    icon: iconElement('users'),
    text: 'Set this board up for a workshop: add a prompt note each for Agenda, Warm-up, Ideas, Vote and Next steps, then put each in its own frame with that title.',
  },
];

/** The browser's speech recognition, where it has one (Chrome and Safari prefix it). */
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
const SpeechRecognition = (globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (globalThis as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

/**
 * On an empty board: a prompt bar asking where to start, and starters above it. What's sent goes to the assistant,
 * which can fill the board. It folds away once the board has something on it, or when dismissed.
 */
@Component({
  selector: 'app-board-start',
  imports: [Icon, PromptStarters],
  template: `
    <div class="start">
      <tc-prompt-starters class="starters app-island" heading="Start with" [items]="starters" mode="send" [hints]="true" (tc-send)="ask.emit($any($event.detail).text)"></tc-prompt-starters>
      <form class="app-island bar" (submit)="$event.preventDefault(); send()">
        <app-icon class="lead" name="sparkles" />
        <input
          type="text"
          aria-label="Ask the assistant where to start"
          placeholder="Where shall we start?"
          maxlength="2000"
          [value]="text()"
          (input)="text.set($any($event.target).value)"
        />
        @if (canDictate) {
          <button type="button" class="icon-btn" [attr.aria-pressed]="listening()" [attr.aria-label]="listening() ? 'Stop dictating' : 'Dictate'" [attr.data-tip]="listening() ? 'Stop' : 'Dictate'" (click)="toggleDictation()">
            <app-icon name="mic" />
          </button>
        }
        <button type="submit" class="icon-btn send" aria-label="Send" data-tip="Send" [disabled]="!text().trim()"><app-icon name="send" /></button>
        <button type="button" class="icon-btn" aria-label="Hide" data-tip="Hide" (click)="dismissed.emit()"><app-icon name="close" /></button>
      </form>
    </div>
  `,
  styles: `
    .start {
      position: absolute;
      left: 50%;
      bottom: var(--tc-space-3);
      z-index: 9;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: var(--tc-space-2);
      width: min(560px, calc(100% - 2 * var(--tc-space-4) - 120px));
      transform: translateX(-50%);
    }
    .starters {
      display: block;
      padding: var(--tc-space-2);
    }
    .bar {
      gap: 4px;
      padding: 4px 4px 4px 12px;
    }
    .lead {
      color: var(--tc-text-muted);
      --icon-size: 18px;
    }
    input {
      flex: 1;
      min-width: 0;
      height: 36px;
      padding: 0 6px;
      border: 0;
      background: transparent;
      color: var(--tc-text-primary);
      font: inherit;
      font-size: var(--tc-font-size-md);
    }
    input:focus {
      outline: none;
    }
    .bar:focus-within {
      outline: 2px solid var(--tc-focus-ring, var(--tc-accent-text));
      outline-offset: 1px;
    }
    .send:not(:disabled) {
      background: var(--tc-action-primary-bg);
      color: var(--tc-action-primary-fg);
    }
  `,
})
export class BoardStart {
  /** Something to ask the assistant. */
  readonly ask = output<string>();
  readonly dismissed = output<void>();

  protected readonly text = signal('');
  protected readonly listening = signal(false);
  protected readonly canDictate = !!SpeechRecognition;
  protected readonly starters = starters();
  #recognition: Recognition | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#recognition?.stop());
  }

  protected send(): void {
    const text = this.text().trim();
    if (!text) return;
    this.#recognition?.stop();
    this.ask.emit(text);
    this.text.set('');
  }

  /** Speaks into the field: what's heard so far replaces what was said this time, after what was typed before. */
  protected toggleDictation(): void {
    if (this.#recognition) {
      this.#recognition.stop();
      return;
    }
    if (!SpeechRecognition) return;
    const before = this.text().trim();
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      const heard = Array.from(e.results, (result) => result[0].transcript).join('');
      this.text.set([before, heard.trim()].filter(Boolean).join(' '));
    };
    r.onend = () => {
      this.#recognition = undefined;
      this.listening.set(false);
    };
    this.#recognition = r;
    this.listening.set(true);
    r.start();
  }
}
