import type { SessionRecapDto } from '../../api/generated/models/session-recap-dto';
import { ACTION_LABEL, type StoredTask } from './tasks';

/** An action as a line: "Set up the second environment — Grace, by Friday". */
const actionLine = (a: SessionRecapDto['actions'][number]) => `${a.text}${a.owner || a.due ? ' — ' : ''}${[a.owner, a.due ? `by ${a.due}` : ''].filter(Boolean).join(', ')}`;

/** The recap as the chat shows it: plain text, a section at a time. */
export function recapText(r: SessionRecapDto): string {
  const section = (heading: string, lines: string[]) => (lines.length ? [`${heading}`, ...lines.map((l) => `• ${l}`)].join('\n') : '');
  return [
    `Recap: ${r.title}`,
    section('Decisions', r.decisions.map((d) => d.text)),
    section('Actions', r.actions.map(actionLine)),
    section('Open questions', r.questions),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The recap as Markdown, to save or paste elsewhere. */
export function recapMarkdown(r: SessionRecapDto, boardTitle: string): string {
  const when = new Date(r.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const list = (items: string[], empty: string) => (items.length ? items.map((i) => `- ${i}`).join('\n') : `_${empty}_`);
  return `# ${r.title}

${boardTitle && boardTitle !== r.title ? `Board: ${boardTitle} · ` : ''}${when} · written by ${r.model} for ${r.by}

## Decisions

${list(r.decisions.map((d) => d.text), 'None recorded.')}

## Actions

${r.actions.length ? r.actions.map((a) => `- [ ] ${a.text}${a.owner ? ` — **${a.owner}**` : ''}${a.due ? ` (by ${a.due})` : ''}`).join('\n') : '_None recorded._'}

## Open questions

${list(r.questions, 'None.')}
`;
}

/** The person a name on the board means: a full name, or a first name, any case. */
export function personNamed<P extends { id: string; name: string }>(name: string | undefined, people: readonly P[]): P | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return people.find((p) => p.name.toLowerCase() === n) ?? people.find((p) => p.name.toLowerCase().split(/\s+/)[0] === n);
}

/** The recap's actions as new tasks: assigned to the person named, when they're on the board; the due date in words. */
export function recapTasks(r: SessionRecapDto, people: readonly { id: string; name: string }[]): Omit<StoredTask, 'id' | 'key' | 'created'>[] {
  return r.actions.map((a) => {
    const who = personNamed(a.owner, people);
    return {
      title: a.due ? `${a.text} (by ${a.due})` : a.text,
      status: 'todo' as const,
      priority: 0 as const,
      labels: [ACTION_LABEL, 'recap'],
      ...(who ? { assignee: who.id } : {}),
      ...(a.sources[0] ? { noteId: a.sources[0] } : {}),
    };
  });
}
