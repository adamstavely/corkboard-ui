import { Component, computed, effect, ElementRef, input, output, untracked, viewChild, ViewEncapsulation } from '@angular/core';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { Editor } from '@tiptap/core';
import type { Note } from './board-doc';
import type { NoteVotes } from './facilitation';
import type { NoteReaction } from './reactions';
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
    @if (note().authorName) {
      <span class="note-author">{{ note().authorName }}</span>
    }
    @if (note().tags.length) {
      <span class="note-tags" [attr.aria-label]="'Tags: ' + note().tags.join(', ')">
        @for (tag of note().tags; track tag) {
          <span class="note-tag">#{{ tag }}</span>
        }
      </span>
    }
    @if (peer(); as peer) {
      <span class="note-peer" [style.background]="peer.color">{{ peer.name }}{{ peer.editing ? ' is writing' : '' }}</span>
    }
    @if (reactions().length) {
      <span class="note-reactions">
        @for (r of reactions(); track r.emoji) {
          <button
            type="button"
            class="reaction"
            [class.mine]="r.mine"
            [disabled]="!canReact()"
            [attr.aria-pressed]="r.mine"
            [attr.aria-label]="r.emoji + ' ' + r.count + (r.mine ? ', including you' : '')"
            (click)="react.emit(r.emoji)"
          >{{ r.emoji }} {{ r.count }}</button>
        }
      </span>
    }
    @if (votes(); as v) {
      <span class="note-votes" [class.results]="v.total !== null">
        @if (voting()) {
          <button type="button" class="vote-less" [disabled]="v.mine === 0" aria-label="Take back a vote" (click)="vote.emit(false)">−</button>
          <span class="vote-count" [attr.aria-label]="'Your votes: ' + v.mine">{{ v.mine }}</span>
          <button type="button" class="vote-more" [disabled]="!canVoteMore()" aria-label="Vote for this note" (click)="vote.emit(true)">+</button>
        } @else if (v.total !== null) {
          <span class="vote-count" [attr.aria-label]="v.total + (v.total === 1 ? ' vote' : ' votes')">● {{ v.total }}</span>
        }
      </span>
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
    '[class.signed]': '!!note().authorName',
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
  /** Its emoji reactions, and whether this person may react; a reaction picked goes out to toggle. */
  readonly reactions = input<NoteReaction[]>([]);
  readonly canReact = input(false);
  readonly react = output<string>();
  /** Its dot votes: this person's while a vote runs, everyone's after; null when there's nothing to show. */
  readonly votes = input<NoteVotes | null>(null);
  /** Whether this person is voting now, and has votes left. */
  readonly voting = input(false);
  readonly canVoteMore = input(false);
  /** Add a vote (true) or take one back. */
  readonly vote = output<boolean>();
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
