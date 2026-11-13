import { computed, effect, inject, Injectable, resource, signal } from '@angular/core';
import type { NotificationItem } from '@adamstavely/trenchcoat/notifications';
import { Api } from '../api/generated/api';
import { notificationsControllerMine } from '../api/generated/fn/me/notifications-controller-mine';
import { notificationsControllerRead } from '../api/generated/fn/me/notifications-controller-read';
import type { NotificationDto } from '../api/generated/models/notification-dto';
import { Auth } from './auth';

/** How often the bell asks for new notifications. */
const POLL_MS = 30_000;

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

/** This person's notifications, checked every half minute while they're here. */
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
      if (!this.#auth.person()) return;
      const timer = setInterval(() => this.#tick.update((n) => n + 1), POLL_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  async read(ids: string[] | 'all'): Promise<void> {
    await this.#api.invoke(notificationsControllerRead, { body: ids === 'all' ? { all: true } : { ids } });
    this.#tick.update((n) => n + 1);
  }
}
