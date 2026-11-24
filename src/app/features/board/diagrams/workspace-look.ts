import { signal } from '@angular/core';
import type { DiagramTheme } from './diagram-theme';

/** The open board's workspace's look for diagrams; null: Trench Coat's. */
export const workspaceLook = signal<DiagramTheme | null>(null);

/** Loads a workspace's look for diagrams (as the board opens); a failure leaves Trench Coat's. */
export function useWorkspaceLook(
  load: () => Promise<{ custom: boolean; theme: DiagramTheme }>,
): void {
  workspaceLook.set(null);
  load().then(
    (look) => workspaceLook.set(look.custom ? look.theme : null),
    () => undefined,
  );
}
