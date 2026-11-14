import { getSchema, Mark, mergeAttributes, type Extensions } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';

/** Highlighter colours (see --hl-* in styles.css): stronger than the notes' own fills, so they show on any note. */
export const HIGHLIGHTS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type HighlightColor = (typeof HIGHLIGHTS)[number];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlight: {
      /** Highlights the selection in a colour, or clears its highlight with null. */
      setHighlight: (color: HighlightColor | null) => ReturnType;
    };
  }
}

/** A highlighter over text: a mark with a colour by name, drawn as <mark data-color>. */
const Highlight = Mark.create({
  name: 'highlight',
  addAttributes() {
    return {
      color: {
        default: 'yellow',
        parseHTML: (el) => (HIGHLIGHTS as readonly string[]).includes(el.dataset['color'] ?? '') ? el.dataset['color'] : 'yellow',
        renderHTML: (attrs) => ({ 'data-color': attrs['color'] }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setHighlight:
        (color) =>
        ({ commands }) =>
          color ? commands.setMark(this.name, { color }) : commands.unsetMark(this.name),
    };
  },
});

/** What a note's text can hold. The canvas has its own undo; inside a note, Collaboration's undo takes over. */
const base = [StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }), Highlight];

/** Draws someone else's caret: a coloured bar with their name over it. */
function caret(user: Record<string, string>): HTMLElement {
  const bar = document.createElement('span');
  bar.className = 'note-caret';
  bar.style.borderColor = user['color'];
  const label = document.createElement('span');
  label.className = 'note-caret__label';
  label.style.background = user['color'];
  label.textContent = user['name'];
  bar.append(label);
  return bar;
}

/**
 * The editor's extensions for one note, bound to its fragment of the board's Yjs document; with a provider, others
 * editing the same note show their carets and selections.
 */
export function noteExtensions(fragment: Y.XmlFragment, provider?: HocuspocusProvider): Extensions {
  const user = provider?.awareness?.getLocalState()?.['user'] as Record<string, string> | undefined;
  return [
    ...base,
    Collaboration.configure({ fragment }),
    ...(provider && user ? [CollaborationCaret.configure({ provider, user, render: caret })] : []),
  ];
}

/** The schema notes are written in, for drawing them without an editor. */
export const noteSchema = getSchema(base);
const serializer = DOMSerializer.fromSchema(noteSchema);

/** Draws a note's text without an editor, so only the note being edited pays for one. */
export function renderNoteText(fragment: Y.XmlFragment, into: HTMLElement): void {
  const doc = yXmlFragmentToProseMirrorRootNode(fragment, noteSchema);
  into.replaceChildren(serializer.serializeFragment(doc.content));
}
