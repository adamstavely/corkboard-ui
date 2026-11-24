import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Dropzone } from '@adamstavely/trenchcoat/angular/dropzone';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import type { DropzoneUpload } from '@adamstavely/trenchcoat/dropzone';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { Api } from '../../api/generated/api';
import { logosControllerAdd } from '../../api/generated/fn/logos/logos-controller-add';
import { siteLogosControllerAdd } from '../../api/generated/fn/site/site-logos-controller-add';
import { siteLogosControllerList } from '../../api/generated/fn/site/site-logos-controller-list';
import { siteLogosControllerRemove } from '../../api/generated/fn/site/site-logos-controller-remove';
import { logosControllerList } from '../../api/generated/fn/logos/logos-controller-list';
import { logosControllerRemove } from '../../api/generated/fn/logos/logos-controller-remove';
import type { Logo } from '../board/diagrams/shape-icons';
import { isTerms, logoFromSvg, logoName } from './svg-files';

/** The cloud vendors whose icons the site's library keeps, and the pack name each gets (as corkboard-api's SITE_PACKS). */
export const VENDORS = [
  { value: 'aws', label: 'Amazon Web Services (AWS)' },
  { value: 'azure', label: 'Microsoft Azure' },
  { value: 'google-cloud', label: 'Google Cloud' },
  { value: 'oracle-cloud', label: 'Oracle Cloud' },
  { value: 'ibm-cloud', label: 'IBM Cloud' },
  { value: 'kubernetes', label: 'Kubernetes' },
];
/** A workspace's own pack: its company's logos. */
const OWN = { value: 'company', label: 'Our own logos' };
/** Logos go up in batches under the server's 2 MB limit. */
const BATCH = 1_500_000;

/**
 * Logo packs for diagrams, from SVG files. On the site admin page (no workspace), the cloud icon library every workspace
 * uses, from each vendor's own download (and its terms); an update replaces the pack. On a workspace's admin page, the
 * workspace's own logos; the cloud vendors' come from the library.
 */
@Component({
  selector: 'app-workspace-logos',
  imports: [Button, Dropzone, Select, Switch],
  template: `
    @if (packs.hasValue()) {
      @if (!site() && library().length) {
        <p class="muted">
          From Corkboard's icon library, for every board: {{ library().join(', ') }}.
        </p>
      }
      @if (own().length) {
        <ul class="packs">
          @for (pack of own(); track pack.name) {
            <li>
              <span class="name">{{ vendorName(pack.name) }}</span>
              <span class="muted"
                >{{ count(pack) }} logos{{ pack.licence ? ', with its terms' : '' }}</span
              >
              <tc-button
                size="sm"
                variant="ghost"
                [label]="'Remove ' + vendorName(pack.name)"
                (click)="remove(pack.name)"
              ></tc-button>
            </li>
          }
        </ul>
      } @else {
        <p class="muted">{{ empty() }}</p>
      }
    }
    <div class="add">
      @if (site()) {
        <tc-select
          label="Whose icons"
          [options]="vendors"
          [value]="vendor()"
          (tc-value-change)="vendor.set($any($event.detail.value))"
        ></tc-select>
        @if (has(vendor())) {
          <tc-switch
            label="Replace the pack"
            description="For the vendor's new download: its logos replace the ones there now. Off adds to them."
            [value]="replace()"
            (tc-value-change)="replace.set($event.detail.value)"
          ></tc-switch>
        }
      }
      <tc-dropzone
        name="logos"
        [accept]="accept"
        [maxSize]="maxSize"
        [onUpload]="read"
        [hint]="hint()"
      ></tc-dropzone>
      @if (ready() > 0) {
        <div class="ready">
          <span>{{ ready() }} logos ready{{ terms() ? ', with the terms' : '' }}</span>
          <tc-button
            size="sm"
            variant="primary"
            [label]="busy() ? 'Adding…' : site() ? 'Add to the library' : 'Add to the workspace'"
            [disabled]="busy()"
            (click)="send()"
          ></tc-button>
          <tc-button
            size="sm"
            variant="ghost"
            label="Clear"
            [disabled]="busy()"
            (click)="clear()"
          ></tc-button>
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
  /** The workspace whose own logos these are; unset on the site admin page, for the library. */
  readonly orgId = input<string | undefined>(undefined);
  protected readonly site = computed(() => !this.orgId());

  protected readonly packs = resource({
    params: () => ({ orgId: this.orgId() }),
    loader: ({ params }) =>
      params.orgId
        ? this.#api.invoke(logosControllerList, { orgId: params.orgId })
        : this.#api.invoke(siteLogosControllerList, {}),
  });
  /** The packs this page looks after: the library's, or the workspace's own. */
  protected readonly own = computed(() =>
    this.packs.hasValue() ? this.packs.value().filter((p) => p.site === this.site()) : [],
  );
  protected readonly library = computed(() =>
    this.packs.hasValue()
      ? this.packs
          .value()
          .filter((p) => p.site)
          .map((p) => this.vendorName(p.name))
      : [],
  );
  protected readonly vendors = VENDORS;
  protected readonly vendor = signal('aws');
  /** On the library: start the pack afresh from this upload (a vendor's new download). */
  protected readonly replace = signal(true);
  protected readonly has = (name: string) => this.own().some((p) => p.name === name);
  protected readonly hint = computed(() =>
    this.site()
      ? "Choose the SVG files from the vendor's icon download (and its terms, if there's a file for them). Nothing is sent until you add them."
      : "Choose your company's logos as SVG files. Nothing is sent until you add them.",
  );
  protected readonly empty = computed(() =>
    this.site()
      ? 'No cloud icons in the library yet. Tech logos (databases, languages, frameworks) are always there.'
      : 'No logos of your own yet.',
  );
  protected readonly accept = ['.svg', '.txt', '.md'];
  protected readonly maxSize = 1024 * 1024;
  /** Logos read from the chosen files, by name, and the terms if one of them was. */
  readonly #pending = signal<Record<string, Logo>>({});
  protected readonly terms = signal<string | null>(null);
  protected readonly ready = computed(() => Object.keys(this.#pending()).length);
  protected readonly refused = signal<{ name: string; reason: string }[]>([]);
  protected readonly busy = signal(false);

  protected readonly vendorName = (pack: string) =>
    [...VENDORS, OWN].find((v) => v.value === pack)?.label ?? pack;
  protected readonly count = (pack: { logos: Record<string, unknown> }) =>
    Object.keys(pack.logos).length;

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
      this.refused.update((r) => [
        ...r,
        { name: file.name, reason: "it isn't an SVG drawing this can read" },
      ]);
      throw new Error('Not an SVG drawing this can read');
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
    const name = this.site() ? this.vendor() : OWN.value;
    const all = Object.entries(this.#pending());
    // A replacing upload starts the pack afresh with its first batch.
    let fresh = this.site() && this.has(name) && this.replace();
    this.busy.set(true);
    const refused: { name: string; reason: string }[] = [];
    let added = 0;
    try {
      let batch: Record<string, Logo> = {};
      let size = 0;
      const flush = async (last: boolean) => {
        if (!Object.keys(batch).length && !(last && this.terms())) return;
        const body = {
          logos: batch,
          ...(last && this.terms() ? { licence: this.terms()! } : {}),
          ...(fresh ? { replace: true } : {}),
        };
        const orgId = this.orgId();
        const result = orgId
          ? await this.#api.invoke(logosControllerAdd, { orgId, name, body })
          : await this.#api.invoke(siteLogosControllerAdd, { name, body });
        fresh = false;
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
      toast.success(`Added ${added} logos to ${this.vendorName(name)}`, {
        description: refused.length
          ? `${refused.length} weren't plain drawings and were left out.`
          : this.site()
            ? "They show in the icon picker on every workspace's boards."
            : 'They show in the icon picker on every board.',
      });
    } catch (err) {
      const message =
        err instanceof HttpErrorResponse
          ? (err.error as { message?: unknown } | null)?.message
          : undefined;
      toast.error("The logos didn't all go up", {
        description: typeof message === 'string' ? message : 'Try again.',
      });
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(name: string): Promise<void> {
    const orgId = this.orgId();
    if (orgId) await this.#api.invoke(logosControllerRemove, { orgId, name });
    else await this.#api.invoke(siteLogosControllerRemove, { name });
    this.packs.reload();
    toast.success(`Removed ${this.vendorName(name)}`, {
      description: 'Shapes that used its logos show none.',
    });
  }
}
