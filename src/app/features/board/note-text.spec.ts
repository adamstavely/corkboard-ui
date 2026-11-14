import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { noteSchema, renderNoteText } from './note-text';

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
});
