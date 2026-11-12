import { getSchema, type Extensions } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';

/** What a note's text can hold. The canvas has its own undo; inside a note, Collaboration's undo takes over. */
const base = StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false } });

/** The editor's extensions for one note, bound to its fragment of the board's Yjs document. */
export function noteExtensions(fragment: Y.XmlFragment): Extensions {
  return [base, Collaboration.configure({ fragment })];
}

const schema = getSchema([base]);
const serializer = DOMSerializer.fromSchema(schema);

/** Draws a note's text without an editor, so only the note being edited pays for one. */
export function renderNoteText(fragment: Y.XmlFragment, into: HTMLElement): void {
  const doc = yXmlFragmentToProseMirrorRootNode(fragment, schema);
  into.replaceChildren(serializer.serializeFragment(doc.content));
}
