import { Extension, getSchema, InputRule, Mark, mergeAttributes, Node, type Extensions } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { DOMSerializer, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import katex from 'katex';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
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

// ── Code: StarterKit's code block, coloured by highlight.js through lowlight ──

const lowlight = createLowlight({ bash, css, javascript, json, python, sql, typescript, xml });

type HastNode = { type: string; value?: string; properties?: { className?: string[] }; children?: HastNode[] };

/** The coloured runs of some code: [from, to, classes] offsets into it. */
function codeRuns(code: string, language: string | null): [number, number, string][] {
  const tree = (language && lowlight.registered(language) ? lowlight.highlight(language, code) : lowlight.highlightAuto(code)) as unknown as HastNode;
  const runs: [number, number, string][] = [];
  let at = 0;
  const walk = (node: HastNode, classes: string[]) => {
    if (node.type === 'text') {
      const len = node.value?.length ?? 0;
      if (classes.length) runs.push([at, at + len, classes.join(' ')]);
      at += len;
      return;
    }
    const own = node.properties?.className ?? [];
    for (const child of node.children ?? []) walk(child, [...classes, ...own]);
  };
  walk(tree, []);
  return runs;
}

const coloursKey = new PluginKey<DecorationSet>('codeColours');

/** Colours code blocks as people type; only decorations, so nothing extra is saved. */
const CodeColours = Extension.create({
  name: 'codeColours',
  addProseMirrorPlugins() {
    const paint = (doc: PMNode) => {
      const decorations: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name !== 'codeBlock') return true;
        const language = typeof node.attrs['language'] === 'string' ? (node.attrs['language'] as string) : null;
        for (const [from, to, cls] of codeRuns(node.textContent, language)) decorations.push(Decoration.inline(pos + 1 + from, pos + 1 + to, { class: cls }));
        return false;
      });
      return DecorationSet.create(doc, decorations);
    };
    return [
      new Plugin({
        key: coloursKey,
        state: {
          init: (_, { doc }) => paint(doc),
          apply: (tr, set) => (tr.docChanged ? paint(tr.doc) : set),
        },
        props: { decorations: (state) => coloursKey.getState(state) },
      }),
    ];
  },
});

// ── Maths: LaTeX drawn by KaTeX, inline ($…$) or on its own line ($$…$$) ──

/** Draws LaTeX into an element; what KaTeX can't read shows as it was typed. */
export function drawMath(into: HTMLElement, latex: string, display: boolean): void {
  try {
    katex.render(latex, into, { displayMode: display, throwOnError: false, output: 'html' });
  } catch {
    into.textContent = display ? `$$${latex}$$` : `$${latex}$`;
  }
}

/** A maths node: drawn by KaTeX; clicked while editing, it turns back into its $…$ text to change. */
function mathNode(name: 'math' | 'mathBlock', display: boolean) {
  const marks = display ? '$$' : '$';
  return Node.create({
    name,
    group: display ? 'block' : 'inline',
    inline: !display,
    atom: true,
    selectable: true,
    addAttributes() {
      return { latex: { default: '', parseHTML: (el) => el.getAttribute('data-latex') ?? '', renderHTML: (attrs) => ({ 'data-latex': attrs['latex'] }) } };
    },
    parseHTML() {
      return [{ tag: `${display ? 'div' : 'span'}[data-math]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [display ? 'div' : 'span', mergeAttributes(HTMLAttributes, { 'data-math': display ? 'block' : 'inline', class: 'note-math' })];
    },
    addNodeView() {
      return ({ node, getPos, editor }) => {
        const dom = document.createElement(display ? 'div' : 'span');
        dom.className = 'note-math';
        dom.dataset['math'] = display ? 'block' : 'inline';
        drawMath(dom, node.attrs['latex'] as string, display);
        dom.addEventListener('mousedown', (e) => {
          const pos = typeof getPos === 'function' ? getPos() : undefined;
          if (pos === undefined || !editor.isEditable) return;
          e.preventDefault();
          // Back to text, the caret before the closing marks, so it's typed over as it was written.
          const text = `${marks}${node.attrs['latex'] as string}${marks}`;
          const { tr, schema } = editor.state;
          const replacement = display ? schema.nodes['paragraph'].create(null, schema.text(text)) : schema.text(text);
          tr.replaceWith(pos, pos + node.nodeSize, replacement);
          const caret = pos + (display ? 1 : 0) + text.length - marks.length;
          tr.setSelection(TextSelection.create(tr.doc, caret));
          editor.view.dispatch(tr);
          editor.view.focus();
        });
        return { dom };
      };
    },
    addInputRules() {
      return display
        ? [
            new InputRule({
              // $$x^2$$ alone in a paragraph.
              find: /^\$\$([^$]+)\$\$$/,
              handler: ({ state, range, match }) => {
                const $from = state.doc.resolve(range.from);
                state.tr.replaceWith($from.before(), $from.after(), this.type.create({ latex: match[1].trim() }));
              },
            }),
          ]
        : [
            new InputRule({
              // $x^2$, not $$, and not after a digit (so "$5 and $10" stays money).
              find: /(?<![\d$])\$([^$\s][^$]*?)\$$/,
              handler: ({ state, range, match }) => {
                state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1] }));
              },
            }),
          ];
    },
  });
}

/** What a note's text can hold. The canvas has its own undo; inside a note, Collaboration's undo takes over. */
const base = [
  StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
  Highlight,
  CodeColours,
  mathNode('math', false),
  mathNode('mathBlock', true),
];

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
  // Maths and code coloured as the editor shows them.
  for (const el of into.querySelectorAll<HTMLElement>('[data-math]')) drawMath(el, el.dataset['latex'] ?? '', el.dataset['math'] === 'block');
  for (const code of into.querySelectorAll<HTMLElement>('pre > code')) paintCode(code);
}

/** Colours a <code> drawn outside the editor, as the editor would. */
function paintCode(code: HTMLElement): void {
  const text = code.textContent ?? '';
  const language = /language-(\S+)/.exec(code.className)?.[1] ?? null;
  const runs = codeRuns(text, language);
  if (!runs.length) return;
  const out = document.createDocumentFragment();
  let at = 0;
  for (const [from, to, cls] of runs) {
    if (from > at) out.append(text.slice(at, from));
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text.slice(from, to);
    out.append(span);
    at = to;
  }
  if (at < text.length) out.append(text.slice(at));
  code.replaceChildren(out);
}
