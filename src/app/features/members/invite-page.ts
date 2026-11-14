import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Api } from '../../api/generated/api';
import { membersControllerLookup } from '../../api/generated/fn/members/members-controller-lookup';
import { Session } from '../../core/session';
import { ROLE_LABELS } from '../../core/roles';

/**
 * An invite link: what workspace it's for and at what role, and a button to join. Signing in comes first (the route is
 * guarded and comes back here). The link is the proof: whoever was sent it can join, once.
 */
@Component({
  selector: 'app-invite-page',
  imports: [Button, Skeleton],
  template: `
    <div class="page">
      @if (invite.isLoading()) {
        <tc-skeleton height="160" radius="12"></tc-skeleton>
      } @else if (invite.hasValue()) {
        <h1>Join {{ invite.value().orgName }}</h1>
        <p>
          {{ invite.value().invitedByName ?? 'Someone' }} invited you as {{ roleLabel(invite.value().role) }}.
          You'll see the workspace's boards straight away.
        </p>
        @if (problem(); as problem) {
          <p class="problem" role="alert">{{ problem }}</p>
        }
        <div class="actions">
          <tc-button label="Join workspace" [loading]="joining()" (click)="join()"></tc-button>
          <tc-button variant="ghost" label="Not now" (click)="leave()"></tc-button>
        </div>
      } @else {
        <h1>This invite link doesn't work</h1>
        <p>It has been used already, replaced by a newer invite, or withdrawn. Ask whoever sent it for a new one.</p>
        <tc-button variant="secondary" label="Go to your boards" (click)="leave()"></tc-button>
      }
    </div>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
      max-width: 520px;
      margin: var(--tc-space-12, 64px) auto;
      padding: 0 var(--tc-space-4);
    }
    h1 {
      margin: 0;
      font-size: var(--tc-font-size-2xl, 24px);
    }
    p {
      margin: 0;
      color: var(--tc-text-secondary, var(--tc-text-muted));
    }
    .problem {
      color: var(--tc-status-danger-fg);
    }
    .actions {
      display: flex;
      gap: var(--tc-space-2);
    }
  `,
})
export class InvitePage {
  readonly #api = inject(Api);
  readonly #router = inject(Router);
  readonly #session = inject(Session);

  /** From the route. */
  readonly token = input.required<string>();

  protected readonly invite = resource({
    params: () => this.token(),
    loader: ({ params: token }) => this.#api.invoke(membersControllerLookup, { body: { token } }),
  });
  protected readonly joining = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly roleLabel = (role: keyof typeof ROLE_LABELS) => ROLE_LABELS[role].toLowerCase();

  protected async join(): Promise<void> {
    this.joining.set(true);
    this.problem.set(null);
    try {
      await this.#session.acceptLink(this.token());
      await this.#router.navigateByUrl('/');
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : "That didn't work. Try again.");
    } finally {
      this.joining.set(false);
    }
  }

  protected leave(): void {
    void this.#router.navigateByUrl('/');
  }
}
