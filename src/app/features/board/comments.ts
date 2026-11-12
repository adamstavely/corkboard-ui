import type { ThreadMessage } from '@adamstavely/trenchcoat/comment-thread';
import * as Y from 'yjs';
import type { CommentThreadDto } from '../../api/generated/models/comment-thread-dto';
import type { BoardDoc } from './board-doc';

/** Plain text of a note, for naming it: its lines run together. */
export function plainText(fragment: Y.XmlFragment): string {
  const lines: string[] = [];
  const walk = (node: Y.XmlFragment | Y.XmlElement | Y.XmlText): void => {
    if (node instanceof Y.XmlText) {
      lines.push(node.toString().replace(/<[^>]+>/g, ''));
      return;
    }
    node.toArray().forEach((child) => walk(child as Y.XmlElement | Y.XmlText));
  };
  walk(fragment);
  return lines.filter(Boolean).join(' ').trim();
}

/** What a thread is about, in a few words: "Note: Deploys are slow", "Frame: Delivery", or that it's gone. */
export function nodeLabel(board: BoardDoc, nodeId: string): string {
  const frame = board.frames().find((f) => f.id === nodeId);
  if (frame) return `Frame: ${frame.title || 'Untitled frame'}`;
  const note = board.notes().find((n) => n.id === nodeId);
  if (!note) return 'A deleted note or frame';
  const text = plainText(note.text);
  return text ? `Note: ${text.length > 48 ? `${text.slice(0, 47)}…` : text}` : 'Note: (empty)';
}

/** Comments in each open thread, by note or frame, for badges. */
export function openCounts(threads: readonly CommentThreadDto[]): Map<string, number> {
  return new Map(threads.filter((t) => !t.resolvedAt).map((t) => [t.nodeId, t.comments.length]));
}

/** A thread's comments as Trench Coat's thread shows them. */
export function messagesOf(thread: CommentThreadDto | undefined, meId: string | undefined): ThreadMessage[] {
  return (thread?.comments ?? []).map((c) => ({
    id: c.id,
    author: { name: c.author.id === meId ? `${c.author.name} (you)` : c.author.name },
    createdAt: new Date(c.createdAt),
    text: c.body,
  }));
}
