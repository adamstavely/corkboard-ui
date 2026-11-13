import { signal } from '@angular/core';
import type { BoardFileDto } from '../../api/generated/models/board-file-dto';

/**
 * A board's files as the page shows them. The API wants the bearer token, which an <img> can't send, so each file is
 * fetched once and kept as an object URL; uploads go up with progress.
 */
export class FileCache {
  readonly #urls = signal<ReadonlyMap<string, string>>(new Map());
  /** Object URLs of the files fetched so far, by file id. */
  readonly urls = this.#urls.asReadonly();
  readonly #loading = new Set<string>();

  constructor(
    private readonly boardId: string,
    private readonly token: () => string,
  ) {}

  #path(fileId = '') {
    return `/api/boards/${this.boardId}/files${fileId ? `/${fileId}` : ''}`;
  }

  /** Fetches the files not fetched yet. */
  load(fileIds: Iterable<string>): void {
    for (const id of fileIds) {
      if (this.#urls().has(id) || this.#loading.has(id)) continue;
      this.#loading.add(id);
      void fetch(this.#path(id), { headers: { Authorization: `Bearer ${this.token()}` } })
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (blob) this.#urls.update((urls) => new Map(urls).set(id, URL.createObjectURL(blob)));
        })
        .finally(() => this.#loading.delete(id));
    }
  }

  /** Sends a file to the board, reporting progress from 0 to 1. */
  upload(file: File, onProgress: (progress: number) => void, abort: AbortSignal): Promise<BoardFileDto> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.#path());
      xhr.setRequestHeader('Authorization', `Bearer ${this.token()}`);
      xhr.responseType = 'json';
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        const body = xhr.response as (BoardFileDto & { message?: unknown }) | null;
        if (xhr.status >= 200 && xhr.status < 300 && body) {
          // It's ours already: no need to fetch it back.
          this.#urls.update((urls) => new Map(urls).set(body.id, URL.createObjectURL(file)));
          resolve(body);
        } else reject(new Error(typeof body?.message === 'string' ? body.message : `${file.name} couldn't be added`));
      };
      xhr.onerror = () => reject(new Error(`${file.name} couldn't be sent. Check your connection.`));
      abort.addEventListener('abort', () => xhr.abort());
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  }

  destroy(): void {
    for (const url of this.#urls().values()) URL.revokeObjectURL(url);
  }
}

/** The size an image goes on the board: its own, scaled to fit within 360 by 360. */
export function imageSize(width: number, height: number, max = 360): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(width, height || 1));
  return { w: Math.max(40, Math.round(width * k)), h: Math.max(40, Math.round(height * k)) };
}

/** "1.2 MB", "34 KB". */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
