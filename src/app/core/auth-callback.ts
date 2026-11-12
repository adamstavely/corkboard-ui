import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Skeleton } from '@adamstavely/trenchcoat/angular/shimmer-loader';
import { Auth } from './auth';

/** Where the identity provider sends people back to; finishes the sign-in and moves on. */
@Component({
  selector: 'app-auth-callback',
  imports: [Button, Skeleton],
  template: `
    @if (failed()) {
      <div class="failed" role="alert">
        <p>Sign-in didn't complete.</p>
        <tc-button label="Try again" (click)="retry()"></tc-button>
      </div>
    } @else {
      <tc-skeleton aria-label="Signing in"></tc-skeleton>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: var(--tc-space-8);
    }
    .failed {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tc-space-3);
    }
  `,
})
export class AuthCallback implements OnInit {
  readonly #auth = inject(Auth);
  readonly #router = inject(Router);
  protected readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      await this.#router.navigateByUrl(await this.#auth.completeSignIn(), { replaceUrl: true });
    } catch (err) {
      console.error(err);
      this.failed.set(true);
    }
  }

  protected retry(): void {
    void this.#auth.signIn('/');
  }
}
