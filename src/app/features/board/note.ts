import { Component, computed, effect, ElementRef, input, output, untracked, viewChild, ViewEncapsulation } from '@angular/core';
import type { HocuspocusProvider } from '@hocuspocus/provider';
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
  template: `
    <div class="text" #text></div>
    @if (peer(); as peer) {
      <span class="note-peer" [style.background]="peer.color">{{ peer.name }}{{ peer.editing ? ' is writing' : '' }}</span>
    }
    @if (comments()) {
      <span class="note-comments" [attr.aria-label]="comments() + (comments() === 1 ? ' comment' : ' comments')">
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12v8H6l-3 3v-3H2z" /></svg>{{ comments() }}
      </span>
    }
  `,
  styleUrl: './note.css',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[attr.data-note-id]': 'note().id',
    '[class.selected]': 'selected()',
    '[class.editing]': 'editing()',
    '[class.peer-selected]': '!!peer()',
    '[style.--peer-color]': 'peer()?.color',
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
  /** Someone else who has this note selected or is writing in it. */
  readonly peer = input<{ name: string; color: string; editing: boolean } | null>(null);
  /** Comments in its open thread, shown as a badge; 0 for none. */
  readonly comments = input(0);
  /** The board's live connection, so others' carets show while this note is edited. */
  readonly provider = input<HocuspocusProvider | undefined>(undefined);
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
        const extensions = noteExtensions(fragment, untracked(this.provider));
        const editor = new Editor({ element: el, extensions, autofocus: 'end' });
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
