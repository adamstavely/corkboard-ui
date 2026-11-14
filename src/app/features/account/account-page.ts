import { DatePipe } from '@angular/common';
import { Component, inject, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { passkeysControllerList } from '../../api/generated/fn/auth/passkeys-controller-list';
import { passkeysControllerRemove } from '../../api/generated/fn/auth/passkeys-controller-remove';
import type { PasskeyDto } from '../../api/generated/models/passkey-dto';
import { Auth } from '../../core/auth';
import { addPasskey, passkeyProblem } from '../../core/passkeys';

/** Your passkeys: add one on this device (or another), and remove ones you no longer use. */
@Component({
  selector: 'app-account-page',
  imports: [Button, DatePipe, Skeleton],
  template: `
    <div class="page">
      <h1>Passkeys</h1>
      <p class="lead">
        You sign in to Corkboard as {{ auth.profile().email }} with any of these. Add one on each device you use, so losing one doesn't lock you out.
      </p>
      @if (keys.isLoading() && !keys.hasValue()) {
        <tc-skeleton height="120" radius="12"></tc-skeleton>
      } @else if (keys.hasValue()) {
        @if (keys.value().length) {
          <ul class="keys" aria-label="Your passkeys">
            @for (key of keys.value(); track key.id) {
              <li>
                <span class="label">{{ key.label }}</span>
                <span class="when">
                  Added {{ key.createdAt | date: 'mediumDate' }} · {{ key.lastUsedAt ? 'last used ' + (key.lastUsedAt | date: 'mediumDate') : 'not used to sign in yet' }}
                </span>
                <tc-button
                  size="sm"
                  variant="ghost"
                  label="Remove"
                  [attr.aria-label]="'Remove ' + key.label"
                  [disabled]="keys.value().length === 1"
                  [loading]="removing() === key.id"
                  (click)="remove(key)"
                ></tc-button>
              </li>
            }
          </ul>
        } @else {
          <p class="none">You don't have a passkey yet. Add one to sign in without the development picker.</p>
        }
      }
      @if (problem()) {
        <p class="problem" role="alert">{{ problem() }}</p>
      }
      <div class="actions">
        <tc-button label="Add a passkey on this device" [loading]="adding()" (click)="add()"></tc-button>
      </div>
    </div>
  `,
  styles: `
    .page {
      max-width: 640px;
      margin: 0 auto;
      padding: var(--tc-space-8) var(--tc-space-4);
    }
    h1 {
      margin: 0;
      font-size: var(--tc-font-size-2xl);
      font-weight: var(--tc-font-weight-semibold);
    }
    .lead,
    .none {
      color: var(--tc-text-muted);
    }
    .keys {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      margin: var(--tc-space-4) 0;
      padding: 0;
      list-style: none;
    }
    .keys li {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 0 var(--tc-space-3);
      padding: var(--tc-space-3) var(--tc-space-4);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-md);
      background: var(--tc-surface-raised);
    }
    .label {
      font-weight: var(--tc-font-weight-medium);
    }
    .when {
      grid-row: 2;
      color: var(--tc-text-muted);
      font-size: var(--tc-font-size-sm);
    }
    .keys tc-button {
      grid-row: 1 / span 2;
      grid-column: 2;
    }
    .problem {
      color: var(--tc-status-danger-fg);
    }
  `,
})
export class AccountPage {
  readonly #api = inject(Api);
  protected readonly auth = inject(Auth);

  protected readonly keys = resource({ loader: () => this.#api.invoke(passkeysControllerList) });
  protected readonly adding = signal(false);
  protected readonly removing = signal<string | null>(null);
  protected readonly problem = signal('');

  protected async add(): Promise<void> {
    this.problem.set('');
    this.adding.set(true);
    try {
      const key = await addPasskey(this.#api);
      toast.success('Passkey added', { description: key.label });
      this.keys.reload();
    } catch (err) {
      this.problem.set(passkeyProblem(err));
    } finally {
      this.adding.set(false);
    }
  }

  protected async remove(key: PasskeyDto): Promise<void> {
    this.problem.set('');
    this.removing.set(key.id);
    try {
      await this.#api.invoke(passkeysControllerRemove, { id: key.id });
      toast.success('Passkey removed', { description: key.label });
      this.keys.reload();
    } catch (err) {
      this.problem.set(passkeyProblem(err));
    } finally {
      this.removing.set(null);
    }
  }
}
