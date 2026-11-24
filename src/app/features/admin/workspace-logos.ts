import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Dropzone } from '@adamstavely/trenchcoat/angular/dropzone';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import type { DropzoneUpload } from '@adamstavely/trenchcoat/dropzone';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { logosControllerAdd } from '../../api/generated/fn/logos/logos-controller-add';
import { logosControllerList } from '../../api/generated/fn/logos/logos-controller-list';
import { logosControllerRemove } from '../../api/generated/fn/logos/logos-controller-remove';
import type { Logo } from '../board/diagrams/shape-icons';
import { isTerms, logoFromSvg, logoName } from './svg-files';

/** The vendors whose icon downloads teams add most, and the pack name each gets. */
export const VENDORS = [
  { value: 'aws', label: 'Amazon Web Services (AWS)' },
  { value: 'azure', label: 'Microsoft Azure' },
  { value: 'google-cloud', label: 'Google Cloud' },
  { value: 'oracle-cloud', label: 'Oracle Cloud' },
  { value: 'ibm-cloud', label: 'IBM Cloud' },
  { value: 'alibaba-cloud', label: 'Alibaba Cloud' },
  { value: 'kubernetes', label: 'Kubernetes' },
  { value: 'company', label: 'Our own logos' },
];
/** Logos go up in batches under the server's 2 MB limit. */
const BATCH = 1_500_000;

/**
 * Diagram logo packs, on the admin page: a workspace's own logos for diagrams, made from a vendor's icon download (its
 * SVG files, and its terms if they're in it). The vendors' terms don't let Corkboard ship their icons itself.
 */
@Component({
  selector: 'app-workspace-logos',
  imports: [Button, Dropzone, Select],
  template: `
    @if (packs.hasValue()) {
      @if (packs.value().length) {
        <ul class="packs">
          @for (pack of packs.value(); track pack.name) {
            <li>
              <span class="name">{{ vendorName(pack.name) }}</span>
              <span class="muted">{{ count(pack) }} logos{{ pack.licence ? ', with its terms' : '' }}</span>
              <tc-button size="sm" variant="ghost" [label]="'Remove ' + vendorName(pack.name)" (click)="remove(pack.name)"></tc-button>
            </li>
          }
        </ul>
      } @else {
        <p class="muted">No logo packs yet. Tech logos (databases, clouds, languages) are always there.</p>
      }
    }
    <div class="add">
      <tc-select label="Whose icons" [options]="vendors" [value]="vendor()" (tc-value-change)="vendor.set($any($event.detail.value))"></tc-select>
      <tc-dropzone
        name="logos"
        [accept]="accept"
        [maxSize]="maxSize"
        [onUpload]="read"
        hint="Choose the SVG files from the vendor's icon download (and its terms, if there's a file for them). Nothing is sent until you add them."
      ></tc-dropzone>
      @if (ready() > 0) {
        <div class="ready">
          <span>{{ ready() }} logos ready{{ terms() ? ', with the terms' : '' }}</span>
          <tc-button size="sm" variant="primary" [label]="busy() ? 'Adding…' : 'Add to the workspace'" [disabled]="busy()" (click)="send()"></tc-button>
          <tc-button size="sm" variant="ghost" label="Clear" [disabled]="busy()" (click)="clear()"></tc-button>
        </div>
      }
      @if (refused().length) {
        <details class="refused">
          <summary>{{ refused().length }} files weren't added</summary>
          <ul>
            @for (r of refused().slice(0, 50); track r.name) {
              <li>{{ r.name }}: {{ r.reason }}</li>
            }
          </ul>
        </details>
      }
    </div>
  `,
  styles: `
    .packs {
      display: grid;
      gap: var(--tc-space-2);
      margin: 0 0 var(--tc-space-3);
      padding: 0;
      list-style: none;
    }
    .packs li {
      display: flex;
      align-items: center;
      gap: var(--tc-space-3);
      font-size: var(--tc-font-size-sm);
    }
    p.muted {
      margin: 0 0 var(--tc-space-3);
      font-size: var(--tc-font-size-sm);
    }
    .name {
      font-weight: var(--tc-font-weight-semibold);
    }
    .muted {
      flex: 1;
      color: var(--tc-text-muted);
    }
    .add {
      display: grid;
      gap: var(--tc-space-3);
      max-width: 560px;
    }
    .ready {
      display: flex;
      align-items: center;
      gap: var(--tc-space-2);
    }
    .ready span {
      flex: 1;
    }
    .refused {
      color: var(--tc-text-secondary);
      font-size: var(--tc-font-size-sm);
    }
  `,
})
export class WorkspaceLogos {
  readonly #api = inject(Api);
  readonly orgId = input.required<string>();

  protected readonly packs = resource({ params: () => this.orgId(), loader: ({ params: orgId }) => this.#api.invoke(logosControllerList, { orgId }) });
  protected readonly vendors = VENDORS;
  protected readonly vendor = signal('aws');
  protected readonly accept = ['.svg', '.txt', '.md'];
  protected readonly maxSize = 1024 * 1024;
  /** Logos read from the chosen files, by name, and the terms if one of them was. */
  readonly #pending = signal<Record<string, Logo>>({});
  protected readonly terms = signal<string | null>(null);
  protected readonly ready = computed(() => Object.keys(this.#pending()).length);
  protected readonly refused = signal<{ name: string; reason: string }[]>([]);
  protected readonly busy = signal(false);

  protected readonly vendorName = (pack: string) => VENDORS.find((v) => v.value === pack)?.label ?? pack;
  protected readonly count = (pack: { logos: Record<string, unknown> }) => Object.keys(pack.logos).length;

  /** Each chosen file, read here: an SVG becomes a logo, a terms file the pack's terms. Nothing is sent yet. */
  protected readonly read: DropzoneUpload = async (file) => {
    const text = await file.text();
    if (isTerms(file.name)) {
      this.terms.set(text.slice(0, 20_000));
      return;
    }
    const logo = /\.svg$/i.test(file.name) ? logoFromSvg(text) : null;
    const name = logoName(file.name);
    if (!logo || !name) {
      this.refused.update((r) => [...r, { name: file.name, reason: "it isn't an SVG drawing this can read" }]);
      throw new Error("Not an SVG drawing this can read");
    }
    this.#pending.update((p) => ({ ...p, [name]: logo }));
  };

  protected clear(): void {
    this.#pending.set({});
    this.terms.set(null);
    this.refused.set([]);
  }

  /** Sends the logos read so far, in batches, to the chosen vendor's pack. */
  protected async send(): Promise<void> {
    const name = this.vendor();
    const all = Object.entries(this.#pending());
    this.busy.set(true);
    const refused: { name: string; reason: string }[] = [];
    let added = 0;
    try {
      let batch: Record<string, Logo> = {};
      let size = 0;
      const flush = async (last: boolean) => {
        if (!Object.keys(batch).length && !(last && this.terms())) return;
        const result = await this.#api.invoke(logosControllerAdd, { orgId: this.orgId(), name, body: { logos: batch, ...(last && this.terms() ? { licence: this.terms()! } : {}) } });
        added += result.added;
        refused.push(...result.refused);
        batch = {};
        size = 0;
      };
      for (const [logo, value] of all) {
        const bytes = logo.length + value.body.length + value.vb.length + 40;
        if (size + bytes > BATCH) await flush(false);
        batch[logo] = value;
        size += bytes;
      }
      await flush(true);
      this.#pending.set({});
      this.terms.set(null);
      this.refused.update((r) => [...r, ...refused]);
      this.packs.reload();
      toast.success(`Added ${added} logos to ${this.vendorName(name)}`, { description: refused.length ? `${refused.length} weren't plain drawings and were left out.` : 'They show in the icon picker on every board.' });
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      toast.error("The logos didn't all go up", { description: typeof message === 'string' ? message : 'Try again.' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(name: string): Promise<void> {
    await this.#api.invoke(logosControllerRemove, { orgId: this.orgId(), name });
    this.packs.reload();
    toast.success(`Removed ${this.vendorName(name)}`, { description: 'Shapes that used its logos show none.' });
  }
}
