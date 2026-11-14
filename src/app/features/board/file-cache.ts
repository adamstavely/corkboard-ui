import { signal } from '@angular/core';
import type { BoardFileDto } from '../../api/generated/models/board-file-dto';

/**
 * A board's files as the page shows them. The API wants the bearer token, which an <img> can't send, so each file is
 * fetched once and kept as an object URL; uploads go up with progress. On a shared page the share link's token is the
 * credential instead (see `FileCache.forLink`), and nothing goes up.
 */
export class FileCache {
  readonly #urls = signal<ReadonlyMap<string, string>>(new Map());
  /** Object URLs of the files fetched so far, by file id. */
  readonly urls = this.#urls.asReadonly();
  readonly #loading = new Set<string>();

  constructor(
    private readonly boardId: string,
    private readonly token: () => string,
    private readonly link?: string,
  ) {}

  /** The files of the board a share link opens, fetched with the link. */
  static forLink(boardId: string, linkToken: string): FileCache {
    return new FileCache(boardId, () => '', linkToken);
  }

  #path(fileId = '') {
    if (this.link) return `/api/shared/${encodeURIComponent(this.link)}/files/${fileId}`;
    return `/api/boards/${this.boardId}/files${fileId ? `/${fileId}` : ''}`;
  }

  /** Fetches the files not fetched yet. */
  load(fileIds: Iterable<string>): void {
    for (const id of fileIds) {
      if (this.#urls().has(id) || this.#loading.has(id)) continue;
      this.#loading.add(id);
      void fetch(this.#path(id), this.link ? {} : { headers: { Authorization: `Bearer ${this.token()}` } })
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (blob) this.#urls.update((urls) => new Map(urls).set(id, URL.createObjectURL(blob)));
        })
        .finally(() => this.#loading.delete(id));
    }
  }

  /**
   * Sends a file to the board, reporting progress from 0 to 1, with big photos shrunk first. Aborting rejects with an
   * AbortError.
   */
  async upload(original: File, onProgress: (progress: number) => void, abort: AbortSignal): Promise<BoardFileDto> {
    const file = await shrinkImage(original);
    return new Promise((resolve, reject) => {
      const aborted = () => new DOMException(`${file.name} wasn't sent`, 'AbortError');
      if (abort.aborted) {
        reject(aborted());
        return;
      }
      const xhr = new XMLHttpRequest();
      const cancel = () => xhr.abort();
      abort.addEventListener('abort', cancel, { once: true });
      xhr.onloadend = () => abort.removeEventListener('abort', cancel);
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
      xhr.onabort = () => reject(aborted());
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  }

  destroy(): void {
    for (const url of this.#urls().values()) URL.revokeObjectURL(url);
  }
}

/** The longest side an image is kept at, and the size below which it's sent as it is. */
const MAX_IMAGE_SIDE = 2560;
const SMALL_IMAGE_BYTES = 1_500_000;

/**
 * A big JPEG, PNG or WebP made no bigger than MAX_IMAGE_SIDE on its longest side, so a board full of phone photos loads
 * quickly. Anything else, or anything that wouldn't come out smaller, is sent as it is.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < SMALL_IMAGE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    // A PNG becomes WebP, which keeps its transparency at a fraction of the size.
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await canvas.convertToBlob({ type, quality: 0.85 });
    if (blob.size >= file.size) return file;
    const name = type === file.type ? file.name : file.name.replace(/\.\w+$/, '') + '.webp';
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** Opens a file in a new tab: images and PDFs show; other files download. */
export function openFile(url: string, file: { name: string; mime: string }): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  if (!file.mime.startsWith('image/') && file.mime !== 'application/pdf') a.download = file.name;
  a.click();
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
