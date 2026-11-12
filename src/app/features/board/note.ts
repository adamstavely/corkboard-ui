import { Component, computed, effect, ElementRef, input, output, viewChild, ViewEncapsulation } from '@angular/core';
import { Editor } from '@tiptap/core';
import type { Note } from './board-doc';
import { noteExtensions, renderNoteText } from './note-text';

/**
 * One sticky note. Its text is drawn from the Yjs fragment until it's being edited; then a Tiptap editor bound to the
 * same fragment takes over, and the canvas gets the editor for its formatting bar. The editor lives in this
 * component's own DOM (not a shadow root), so text selection works in every browser.
 */
@Component({
  selector: 'app-note',
  template: `<div class="text" #text></div>`,
  styleUrl: './note.css',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[attr.data-note-id]': 'note().id',
    '[class.selected]': 'selected()',
    '[class.editing]': 'editing()',
    '[style.transform]': '"translate(" + note().x + "px, " + note().y + "px)"',
    '[style.width.px]': 'note().w',
    '[style.height.px]': 'note().h',
    '[style.z-index]': 'note().z',
    '[style.--note-fill]': '"var(--note-" + note().color + ")"',
  },
})
export class NoteView {
  readonly note = input.required<Note>();
  readonly selected = input(false);
  readonly editing = input(false);
  /** The live editor while this note is being edited; null when editing stops. */
  readonly editorChange = output<Editor | null>();

  private readonly text = viewChild.required<ElementRef<HTMLElement>>('text');
  /** The same fragment for the note's whole life, so moving or recolouring it doesn't restart the editor. */
  readonly #fragment = computed(() => this.note().text);

  constructor() {
    effect((onCleanup) => {
      const fragment = this.#fragment();
      const el = this.text().nativeElement;
      if (this.editing()) {
        el.replaceChildren();
        const editor = new Editor({ element: el, extensions: noteExtensions(fragment), autofocus: 'end' });
        // Tiptap's autofocus waits for an animation frame, which a background tab may not get; take focus now too.
        editor.view.focus();
        this.editorChange.emit(editor);
        onCleanup(() => {
          this.editorChange.emit(null);
          editor.destroy();
        });
      } else {
        const render = () => renderNoteText(fragment, el);
        render();
        fragment.observeDeep(render);
        onCleanup(() => fragment.unobserveDeep(render));
      }
    });
  }
}
