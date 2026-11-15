import { Component, input } from '@angular/core';
import { Icon } from '../../shared/icon';
import type { BoardChanges as Changes } from './versions';

/** What differs between two states of a board, in words: notes added, removed, edited and moved, frames, files. */
@Component({
  selector: 'app-board-changes',
  imports: [Icon],
  template: `
    @let c = changes();
    @if (c.added.length) {
      <h3>{{ c.added.length }} note{{ c.added.length === 1 ? '' : 's' }} added</h3>
      <ul>@for (t of c.added; track $index) { <li class="added">{{ t }}</li> }</ul>
    }
    @if (c.removed.length) {
      <h3>{{ c.removed.length }} note{{ c.removed.length === 1 ? '' : 's' }} removed</h3>
      <ul>@for (t of c.removed; track $index) { <li class="removed">{{ t }}</li> }</ul>
    }
    @if (c.edited.length) {
      <h3>{{ c.edited.length }} note{{ c.edited.length === 1 ? '' : 's' }} edited</h3>
      <ul>
        @for (e of c.edited; track $index) {
          <li><del>{{ e.before }}</del> <app-icon name="arrowRight" /><span class="sr-only">now</span> <ins>{{ e.after }}</ins></li>
        }
      </ul>
    }
    @if (c.moved) {
      <h3>{{ c.moved }} note{{ c.moved === 1 ? '' : 's' }} moved</h3>
    }
    @if (c.recoloured) {
      <h3>{{ c.recoloured }} note{{ c.recoloured === 1 ? '' : 's' }} recoloured</h3>
    }
    @if (c.framesAdded.length || c.framesRemoved.length || c.framesRenamed.length) {
      <h3>Frames</h3>
      <ul>
        @for (t of c.framesAdded; track $index) { <li class="added">Added “{{ t }}”</li> }
        @for (t of c.framesRemoved; track $index) { <li class="removed">Removed “{{ t }}”</li> }
        @for (r of c.framesRenamed; track $index) { <li>Renamed “{{ r.before }}” to “{{ r.after }}”</li> }
      </ul>
    }
    @if (c.mediaAdded.length || c.mediaRemoved.length) {
      <h3>Images and files</h3>
      <ul>
        @for (t of c.mediaAdded; track $index) { <li class="added">Added {{ t }}</li> }
        @for (t of c.mediaRemoved; track $index) { <li class="removed">Removed {{ t }}</li> }
      </ul>
    }
  `,
  styles: `
    h3 {
      margin: var(--tc-space-4) 0 var(--tc-space-1);
      font-size: var(--tc-font-size-sm);
      font-weight: var(--tc-font-weight-semibold);
    }
    ul {
      margin: 0;
      padding-left: var(--tc-space-4);
      font-size: var(--tc-font-size-sm);
    }
    li {
      margin-bottom: var(--tc-space-1);
      overflow-wrap: anywhere;
    }
    .added,
    ins {
      color: var(--tc-status-success-fg, inherit);
      text-decoration: none;
    }
    .removed,
    del {
      color: var(--tc-status-danger-fg, inherit);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  `,
})
export class BoardChanges {
  readonly changes = input.required<Changes>();
}
