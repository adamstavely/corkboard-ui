import { computed, effect, inject, Injectable, resource, signal } from '@angular/core';
import type { NotificationItem } from '@adamstavely/trenchcoat/notifications';
import { Api } from '../api/generated/api';
import { notificationsControllerMine } from '../api/generated/fn/me/notifications-controller-mine';
import { notificationsControllerRead } from '../api/generated/fn/me/notifications-controller-read';
import type { NotificationDto } from '../api/generated/models/notification-dto';
import { Auth } from './auth';

/** The live stream that says when there's something new (see `listen`). */
const STREAM = '/api/me/notifications/stream';
/** A slow check as well, in case the stream is down without anyone noticing. */
const POLL_MS = 5 * 60_000;
/** How long to wait before reconnecting a dropped stream, doubling each time up to a minute. */
const RETRY_MS = 1000;

/**
 * Reads a server-sent event stream with fetch (so the token goes in a header, not the URL), calling `onEvent` with
 * each event's name. Resolves when the stream ends; rejects if it can't be opened.
 */
export async function listen(url: string, token: string, onEvent: (event: string) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal });
  if (!res.ok || !res.body) throw new Error(`The notification stream answered ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const block of events) {
      const name = block.split('\n').find((l) => l.startsWith('event:'))?.slice(6).trim();
      if (name) onEvent(name);
    }
  }
}

export const NOTIFICATION_CATEGORIES = [
  { id: 'mention', label: 'Mentions' },
  { id: 'reply', label: 'Replies' },
  { id: 'answer', label: 'Answers' },
  { id: 'invite', label: 'Invites' },
];

/** As Trench Coat's notification centre shows them. */
export function notificationItems(list: readonly NotificationDto[]): NotificationItem[] {
  return list.map((n) => ({
    id: n.id,
    title: n.title,
    ...(n.actor ? { actor: n.actor } : {}),
    ...(n.body ? { body: n.body } : {}),
    ...(n.context ? { context: n.context } : {}),
    ...(n.link ? { href: n.link } : {}),
    time: n.at,
    read: n.read,
    category: n.kind,
  }));
}

/** This person's notifications, fetched again the moment the API says there's something new. */
@Injectable({ providedIn: 'root' })
export class Notifications {
  readonly #api = inject(Api);
  readonly #auth = inject(Auth);
  readonly #tick = signal(0);

  readonly list = resource({
    params: () => (this.#auth.person() ? { who: this.#auth.person()!.id, tick: this.#tick() } : undefined),
    loader: () => this.#api.invoke(notificationsControllerMine),
  });
  readonly items = computed(() => notificationItems(this.list.hasValue() ? this.list.value() : []));
  readonly unread = computed(() => this.items().filter((n) => !n.read).length);

  constructor() {
    effect((onCleanup) => {
      const token = this.#auth.person() ? this.#auth.token() : null;
      if (!token) return;
      const refresh = () => this.#tick.update((n) => n + 1);
      const stop = new AbortController();
      let wait = RETRY_MS;
      let retry: ReturnType<typeof setTimeout> | undefined;
      const connect = () => {
        listen(STREAM, token, (event) => {
          wait = RETRY_MS;
          if (event === 'changed') refresh();
        }, stop.signal)
          .catch(() => undefined)
          .finally(() => {
            if (stop.signal.aborted) return;
            // Whatever arrived while it was down, then try again.
            refresh();
            retry = setTimeout(connect, wait);
            wait = Math.min(wait * 2, 60_000);
          });
      };
      connect();
      const timer = setInterval(refresh, POLL_MS);
      onCleanup(() => {
        stop.abort();
        clearTimeout(retry);
        clearInterval(timer);
      });
    });
  }

  async read(ids: string[] | 'all'): Promise<void> {
    await this.#api.invoke(notificationsControllerRead, { body: ids === 'all' ? { all: true } : { ids } });
    this.#tick.update((n) => n + 1);
  }
}
