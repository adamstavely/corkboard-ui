import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import type { BoardDoc } from './board-doc';
import { DiagramLookEditor } from './diagram-look-editor';
import { themeProblems, TRENCH_COAT, type DiagramTheme } from './diagrams/diagram-theme';
import { workspaceLook } from './diagrams/workspace-look';

/**
 * This board's look for its diagrams, beside it: the workspace's (as it changes), Trench Coat's, or the board's own,
 * changed here with its contrast checked. Everyone on the board sees the choice.
 */
@Component({
  selector: 'app-board-look',
  imports: [Button, DiagramLookEditor],
  template: `
    <aside class="panel" aria-labelledby="look-heading">
      <div class="head">
        <h2 id="look-heading">Diagram look</h2>
        <tc-button size="sm" variant="ghost" label="Close" (click)="closed.emit()"></tc-button>
      </div>
      <fieldset>
        <legend>This board's diagrams use</legend>
        <label
          ><input
            type="radio"
            name="look"
            [checked]="kind() === 'workspace'"
            (change)="useWorkspace()"
          />
          The workspace's look ({{ workspaceName() }})</label
        >
        <label
          ><input
            type="radio"
            name="look"
            [checked]="kind() === 'trenchcoat'"
            (change)="useTrenchCoat()"
          />
          Trench Coat's look</label
        >
        <label
          ><input type="radio" name="look" [checked]="kind() === 'own'" (change)="useOwn()" /> A
          look of its own</label
        >
      </fieldset>
      @if (kind() === 'own') {
        <app-diagram-look-editor [theme]="draft()" (themeChange)="draft.set($event)" />
        <tc-button
          size="sm"
          variant="primary"
          label="Use this look"
          [disabled]="problems().length > 0 || !changed()"
          (click)="apply()"
        ></tc-button>
      }
    </aside>
  `,
  styles: `
    .panel {
      position: absolute;
      top: calc(var(--tc-space-3) + 52px);
      right: var(--tc-space-4);
      z-index: 4;
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-3);
      width: min(480px, calc(100% - 2 * var(--tc-space-4)));
      max-height: calc(100% - 140px);
      overflow: auto;
      padding: var(--tc-space-3);
      border: 1px solid var(--tc-border-subtle);
      border-radius: var(--tc-radius-lg);
      background: var(--tc-surface-raised);
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.1);
      color: var(--tc-text-primary);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    h2 {
      margin: 0;
      font-size: var(--tc-font-size-md);
    }
    fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--tc-space-2);
      margin: 0;
      padding: 0;
      border: 0;
      font-size: var(--tc-font-size-sm);
    }
    legend {
      margin-bottom: var(--tc-space-2);
      font-weight: var(--tc-font-weight-semibold);
    }
  `,
})
export class BoardLook {
  readonly board = input.required<BoardDoc>();
  readonly closed = output<void>();

  protected readonly kind = computed(() => this.board().look().kind);
  protected readonly workspaceName = computed(() => workspaceLook()?.name ?? "Trench Coat's");
  /** The board's own look as it's being changed: from what it has, or from the look it uses now. */
  protected readonly draft = linkedSignal<DiagramTheme>(() => {
    const look = this.board().look();
    return look.kind === 'own'
      ? look.theme
      : look.kind === 'workspace'
        ? (workspaceLook() ?? TRENCH_COAT)
        : TRENCH_COAT;
  });
  protected readonly problems = computed(() => themeProblems(this.draft()));
  protected readonly changed = computed(() => {
    const look = this.board().look();
    return look.kind !== 'own' || JSON.stringify(look.theme) !== JSON.stringify(this.draft());
  });

  protected useWorkspace(): void {
    this.board().setLook({ kind: 'workspace' });
  }
  protected useTrenchCoat(): void {
    this.board().setLook({ kind: 'trenchcoat' });
  }
  /** A look of its own starts as the one it uses now, under the board's name. */
  protected useOwn(): void {
    const start = this.draft();
    this.board().setLook({
      kind: 'own',
      theme: { ...start, name: start.name === 'Trench Coat' ? 'This board' : start.name },
    });
  }
  protected apply(): void {
    if (!this.problems().length) this.board().setLook({ kind: 'own', theme: this.draft() });
  }
}
