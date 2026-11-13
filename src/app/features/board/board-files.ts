import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Dropzone } from '@adamstavely/trenchcoat/angular/dropzone';
import { PointAndAsk } from '@adamstavely/trenchcoat/angular/point-and-ask';
import type { DropzoneUpload } from '@adamstavely/trenchcoat/dropzone';
import type { PointAsk } from '@adamstavely/trenchcoat/point-and-ask';
import { Api } from '../../api/generated/api';
import { filesControllerAsk } from '../../api/generated/fn/files/files-controller-ask';
import type { BoardFileDto } from '../../api/generated/models/board-file-dto';
import type { FileCache } from './file-cache';
import { modelChoice } from './model-choice';

const ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', '.pdf', '.txt', '.md', '.csv', '.docx', '.xlsx', '.pptx'];

/** Adding images and files to the board: Trench Coat's dropzone, each upload placed on the board when it lands. */
@Component({
  selector: 'app-board-files',
  imports: [Dropzone, Button],
  template: `
    <aside class="panel" aria-label="Add images and files">
      <div class="head">
        <span class="note">Images, PDFs, text and Office documents, up to 10 MB each. You can also drop them straight on the board.</span>
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <tc-dropzone name="files" [accept]="accept" [maxSize]="maxSize" [onUpload]="upload" hint="They go in the middle of what you're looking at."></tc-dropzone>
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      top: calc(var(--tc-space-3) + 52px);
      right: var(--tc-space-4);
      z-index: 3;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: min(440px, calc(100% - 2 * var(--tc-space-4)));
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .note {
      flex: 1;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class BoardFiles {
  readonly cache = input.required<FileCache>();
  readonly closed = output<void>();
  /** A file that's on the server now, to place on the board. */
  readonly added = output<{ file: BoardFileDto; local: File }>();

  protected readonly accept = ACCEPT;
  protected readonly maxSize = 10 * 1024 * 1024;

  protected readonly upload: DropzoneUpload = async (file, onProgress, signal) => {
    const stored = await this.cache().upload(file, onProgress, signal);
    this.added.emit({ file: stored, local: file });
  };
}

/** Asking a model about an image on the board: pins and boxes on it, a question, and answers for each. */
@Component({
  selector: 'app-image-ask',
  imports: [PointAndAsk, Button],
  template: `
    <aside class="panel" aria-label="Ask about this image">
      <div class="head">
        <span class="note">{{ problem() || note() }}</span>
        <tc-button size="sm" variant="secondary" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <tc-point-and-ask
        [heading]="'Ask about ' + name()"
        description="Pin a spot or draw a box, then ask."
        [src]="src()"
        [alt]="name()"
        [busy]="busy()"
        [answer]="answer()"
        [answers]="answers()"
        (tc-ask)="ask($event)"
      ></tc-point-and-ask>
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      top: calc(var(--tc-space-3) + 52px);
      right: var(--tc-space-4);
      bottom: calc(var(--tc-space-4) + 56px);
      z-index: 3;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      width: min(560px, calc(100% - 2 * var(--tc-space-4)));
      overflow: auto;
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .note {
      flex: 1;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class ImageAsk {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly orgId = input.required<string>();
  readonly fileId = input.required<string>();
  readonly name = input('image');
  readonly src = input('');
  readonly closed = output<void>();

  readonly #choice = modelChoice(this.#api, () => this.orgId());
  protected readonly busy = signal(false);
  protected readonly answer = signal('');
  protected readonly answers = signal<Record<string, string>>({});
  protected readonly problem = signal('');
  protected readonly note = computed(() =>
    this.#choice.models.hasValue() && !this.#choice.options().length
      ? 'Connect an AI model under AI models to ask about images.'
      : `${this.#choice.name()} answers. It needs to be a model that can see images.`,
  );

  protected async ask(e: CustomEvent<PointAsk>): Promise<void> {
    const modelId = this.#choice.modelId();
    if (!modelId) return;
    this.busy.set(true);
    this.problem.set('');
    try {
      const marks = e.detail.marks.map(({ id, kind, x, y, w, h, question }) => ({ id, kind, x, y, ...(w !== undefined ? { w } : {}), ...(h !== undefined ? { h } : {}), question }));
      const result = await this.#api.invoke(filesControllerAsk, {
        id: this.boardId(),
        fileId: this.fileId(),
        body: { modelId, question: e.detail.question || 'What does this show?', ...(marks.length ? { marks } : {}) },
      });
      this.answer.set(result.answer);
      this.answers.set(result.answers);
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : "The model couldn't answer. Try again.");
    } finally {
      this.busy.set(false);
    }
  }
}
