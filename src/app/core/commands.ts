import { Injectable, signal } from '@angular/core';

/** Something to do from the ⌘K menu: what it says, an optional hint (a shortcut), and what it does. */
export interface AppCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/**
 * Commands the page in front offers to the header's ⌘K menu: a board registers its own (add a note, open a view,
 * export…) while it's open, and takes them away when it closes.
 */
@Injectable({ providedIn: 'root' })
export class Commands {
  readonly #commands = signal<readonly AppCommand[]>([]);
  readonly commands = this.#commands.asReadonly();

  /** Offers these until the returned function is called. */
  offer(commands: readonly AppCommand[]): () => void {
    this.#commands.set(commands);
    return () => {
      if (this.#commands() === commands) this.#commands.set([]);
    };
  }

  run(id: string): boolean {
    const command = this.#commands().find((c) => c.id === id);
    command?.run();
    return !!command;
  }
}

/** The commands whose words all appear in what's typed (or all of them, for nothing typed). */
export function matchCommands(commands: readonly AppCommand[], query: string): AppCommand[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return commands.filter((c) => words.every((w) => c.label.toLowerCase().includes(w)));
}
