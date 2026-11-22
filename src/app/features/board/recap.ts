import type { RecapResultDto } from '../../api/generated/models/recap-result-dto';
import type { SessionRecapDto } from '../../api/generated/models/session-recap-dto';
import { FRAME_PADDING, FRAME_TITLE, type Layout } from './board-doc';
import { ACTION_LABEL, type StoredTask } from './tasks';

/** An action as a line: "Set up the second environment — Grace, by Friday". */
const actionLine = (a: SessionRecapDto['actions'][number]) => `${a.text}${a.owner || a.due ? ' — ' : ''}${[a.owner, a.due ? `by ${a.due}` : ''].filter(Boolean).join(', ')}`;

/** The session's results; recaps written before results were counted have none. */
const resultsOf = (r: SessionRecapDto): readonly RecapResultDto[] => (r as { results?: RecapResultDto[] }).results ?? [];

/** A result as a line, its numbers exactly as counted: "Vote: Which theme first? — Onboarding 7, Billing 4". */
export function resultLine(r: RecapResultDto): string {
  const kind = { agenda: 'Agenda', vote: 'Vote', poll: 'Poll', estimate: 'Estimate' }[r.kind];
  const items = r.items.map((i) => (i.count === undefined ? i.label : `${i.label} ${i.count}`)).join(', ');
  return `${kind}: ${r.title}${r.open ? ' (still open)' : ''} — ${items}`;
}

/** The recap as the chat shows it: plain text, a section at a time. */
export function recapText(r: SessionRecapDto): string {
  const section = (heading: string, lines: string[]) => (lines.length ? [`${heading}`, ...lines.map((l) => `• ${l}`)].join('\n') : '');
  return [
    `Recap: ${r.title}`,
    section('Decisions', r.decisions.map((d) => d.text)),
    section('Actions', r.actions.map(actionLine)),
    section('Open questions', r.questions),
    section('Results', resultsOf(r).map(resultLine)),
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
${resultsOf(r).length ? `\n## Results\n\n${list(resultsOf(r).map(resultLine), '')}\n` : ''}`;
}

/** How wide a section's note is, and the room between notes. */
const SECTION_W = 280;
const GAP = 24;

/**
 * The recap as a frame for the board, titled with the recap's title: a note for each section it has (decisions,
 * actions, open questions, results), side by side, each as tall as its lines need.
 */
export function recapLayout(r: SessionRecapDto): Layout {
  const sections = [
    { heading: 'Decisions', color: 'green', lines: r.decisions.map((d) => d.text) },
    { heading: 'Actions', color: 'blue', lines: r.actions.map(actionLine) },
    { heading: 'Open questions', color: 'yellow', lines: r.questions },
    { heading: 'Results', color: 'purple', lines: resultsOf(r).map(resultLine) },
  ].filter((s) => s.lines.length);
  // Roughly: a line of text holds about 32 characters at this width, and takes 24 pixels.
  const height = (lines: string[]) => Math.max(160, 56 + lines.reduce((n, l) => n + Math.ceil(Math.max(1, l.length) / 32), 0) * 24);
  const tallest = Math.max(160, ...sections.map((s) => height(s.lines)));
  const notes = sections.map((s, i) => ({
    text: [`**${s.heading}**`, ...s.lines.map((l) => `• ${l}`)].join('\n'),
    color: s.color,
    x: FRAME_PADDING + i * (SECTION_W + GAP),
    y: FRAME_TITLE,
    w: SECTION_W,
    h: height(s.lines),
  }));
  const w = FRAME_PADDING * 2 + Math.max(1, sections.length) * SECTION_W + Math.max(0, sections.length - 1) * GAP;
  return { frames: [{ title: r.title, x: 0, y: 0, w, h: FRAME_TITLE + tallest + FRAME_PADDING }], notes };
}

/** The person a name on the board means: a full name, or a first name, any case. */
export function personNamed<P extends { id: string; name: string }>(name: string | undefined, people: readonly P[]): P | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return people.find((p) => p.name.toLowerCase() === n) ?? people.find((p) => p.name.toLowerCase().split(/\s+/)[0] === n);
}

/** What "Make these tasks" does: "Its 3 actions become tasks on this board, and go to Jira too." */
export function recapTasksLine(actions: number, tracker: string | null): string {
  const one = actions === 1;
  return `${one ? 'Its action becomes a task' : `Its ${actions} actions become tasks`} on this board${tracker ? `, and ${one ? 'goes' : 'go'} to ${tracker} too` : ''}.`;
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
