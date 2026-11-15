import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { noteSchema, renderNoteText } from './note-text';
import { noteLines } from './tasks';
import { boardMarkdown } from './export';
import { BoardDoc } from './board-doc';

describe('note text', () => {
  it('keeps highlights and numbered lists through the board, and draws them without an editor', () => {
    const fragment = new Y.Doc().getXmlFragment('text');
    prosemirrorJSONToYXmlFragment(
      noteSchema,
      {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Ship the ' }, { type: 'text', text: 'beta', marks: [{ type: 'highlight', attrs: { color: 'green' } }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
      fragment,
    );
    const into = document.createElement('div');
    renderNoteText(fragment, into);
    expect(into.innerHTML).toBe('<ol><li><p>Ship the <mark data-color="green">beta</mark></p></li></ol>');
  });

  it('keeps code and maths: coloured and drawn without an editor, and as text everywhere else', () => {
    const fragment = new Y.Doc().getXmlFragment('text');
    prosemirrorJSONToYXmlFragment(
      noteSchema,
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Area is ' }, { type: 'math', attrs: { latex: '\\pi r^2' } }, { type: 'text', text: ' roughly' }] },
          { type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: 'const r = 2;\n  return r;' }] },
          { type: 'mathBlock', attrs: { latex: 'e^{i\\pi} + 1 = 0' } },
        ],
      },
      fragment,
    );
    const into = document.createElement('div');
    renderNoteText(fragment, into);
    // KaTeX drew the maths; the code is coloured.
    expect(into.querySelectorAll('.note-math .katex')).toHaveLength(2);
    expect(into.querySelector('pre code .hljs-keyword')?.textContent).toBe('const');

    expect(noteLines(fragment)).toEqual([
      { text: 'Area is $\\pi r^2$ roughly', bold: false },
      { text: 'const r = 2;', bold: false, code: true },
      { text: '  return r;', bold: false, code: true },
      { text: '$$e^{i\\pi} + 1 = 0$$', bold: false },
    ]);
  });

  it('exports code in a note as a fenced block under its bullet', () => {
    const board = new BoardDoc();
    const id = board.addNote(0, 0);
    const text = board.doc.getMap<Y.Map<unknown>>('nodes').get(id)!.get('text') as Y.XmlFragment;
    prosemirrorJSONToYXmlFragment(
      noteSchema,
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fix' }] }, { type: 'codeBlock', content: [{ type: 'text', text: 'npm ci' }] }] },
      text,
    );
    expect(boardMarkdown(board, 'B')).toContain('- Fix\n  ```\n  npm ci\n  ```');
    board.destroy();
  });
});
